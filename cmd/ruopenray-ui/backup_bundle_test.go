package main

import (
	"archive/zip"
	"encoding/json"
	"errors"
	"io"
	"io/fs"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func backupTestState(t *testing.T) *serverState {
	t.Helper()
	root := t.TempDir()
	s := &serverState{cfg: appConfig{DataDir: filepath.Join(root, "data"), BackupDir: filepath.Join(root, "data", "backups"), ActiveConfig: filepath.Join(root, "xray.json")}}
	s.backupPaths = map[string]string{"xray/config.json": s.cfg.ActiveConfig, "adguard/AdGuardHome.yaml": filepath.Join(root, "adguard", "AdGuardHome.yaml"), "uci/dhcp": filepath.Join(root, "dhcp")}
	for path, body := range map[string]string{s.cfg.ActiveConfig: `{"outbounds":[]}`, s.backupPaths["adguard/AdGuardHome.yaml"]: "dns:\n  port: 10536\n", filepath.Join(s.adGuardBackupFilterDir(), "1.txt"): "||ads.example^", s.backupPaths["uci/dhcp"]: "original dns", filepath.Join(s.cfg.DataDir, "route-names.json"): `{"group":"Keep me"}`} {
		if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, []byte(body), 0600); err != nil {
			t.Fatal(err)
		}
	}
	return s
}

func TestFullBackupRestoresAdGuardAndGroupMetadata(t *testing.T) {
	s := backupTestState(t)
	path, err := s.backupBundle()
	if err != nil {
		t.Fatal(err)
	}
	content, manifest, err := s.readFullBackup(path)
	if err != nil {
		t.Fatal(err)
	}
	if manifest.Format != 1 || len(content) != 5 {
		t.Fatalf("missing backup contents: %#v", manifest)
	}
	for _, file := range content {
		if err := os.WriteFile(file.path, []byte("changed"), 0600); err != nil {
			t.Fatal(err)
		}
	}
	if err := applyBackupContent(content); err != nil {
		t.Fatal(err)
	}
	for _, file := range content {
		body, err := os.ReadFile(file.path)
		if err != nil || string(body) != string(file.body) {
			t.Fatalf("restore failed for %s", file.entry.Name)
		}
	}
	if runtime.GOOS != "windows" {
		info, _ := os.Stat(path)
		if info.Mode().Perm() != 0600 {
			t.Fatal("archive exposes credentials to other users")
		}
	}
}

func TestFullBackupDownloadConfinedToBackupDirectory(t *testing.T) {
	s := backupTestState(t)
	path, err := s.backupBundle()
	if err != nil {
		t.Fatal(err)
	}
	outside := filepath.Join(t.TempDir(), "outside.zip")
	if err := os.WriteFile(outside, []byte("secret outside backup directory"), 0600); err != nil {
		t.Fatal(err)
	}
	for _, test := range []struct {
		path string
		code int
	}{{path, 200}, {outside, 400}, {s.cfg.ActiveConfig, 400}} {
		response := httptest.NewRecorder()
		s.downloadFullBackup(response, httptest.NewRequest("GET", "/api/backup/full/download?path="+url.QueryEscape(test.path), nil))
		if response.Code != test.code {
			t.Fatalf("download returned %d, want %d", response.Code, test.code)
		}
		if test.code == 200 && (response.Header().Get("Cache-Control") != "no-store" || !strings.HasPrefix(response.Header().Get("Content-Disposition"), "attachment;")) {
			t.Fatal("sensitive archive download must be an uncached attachment")
		}
	}
}

func rewriteBackup(t *testing.T, source, destination string, mutate func(string, []byte) []byte) {
	t.Helper()
	zr, err := zip.OpenReader(source)
	if err != nil {
		t.Fatal(err)
	}
	defer zr.Close()
	f, err := os.Create(destination)
	if err != nil {
		t.Fatal(err)
	}
	zw := zip.NewWriter(f)
	for _, file := range zr.File {
		rc, _ := file.Open()
		body, _ := io.ReadAll(rc)
		_ = rc.Close()
		body = mutate(file.Name, body)
		name := file.Name
		if name == "manifest.json" {
			var manifest backupManifest
			if json.Unmarshal(body, &manifest) == nil {
				body, _ = json.Marshal(manifest)
			}
		}
		w, err := zw.Create(name)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := w.Write(body); err != nil {
			t.Fatal(err)
		}
	}
	if err := zw.Close(); err != nil {
		t.Fatal(err)
	}
	if err := f.Close(); err != nil {
		t.Fatal(err)
	}
}

func TestFullBackupRejectsTamperingBeforeAnyWrite(t *testing.T) {
	s := backupTestState(t)
	path, err := s.backupBundle()
	if err != nil {
		t.Fatal(err)
	}
	bad := filepath.Join(s.cfg.BackupDir, "tampered.zip")
	rewriteBackup(t, path, bad, func(name string, body []byte) []byte {
		if name == "xray/config.json" {
			return []byte(`{"outbounds":["tampered"]}`)
		}
		return body
	})
	if _, _, err := s.readFullBackup(bad); err == nil || !strings.Contains(err.Error(), "целостность") {
		t.Fatalf("tampered archive accepted: %v", err)
	}
	body, _ := os.ReadFile(s.cfg.ActiveConfig)
	if string(body) != `{"outbounds":[]}` {
		t.Fatal("archive validation modified the active config")
	}
	for _, name := range []string{"data/../../escape", "data/../config.json", "/etc/passwd", "data\\escape", "data//escape", "data/backups/evil.zip"} {
		if _, err := s.backupDestination(name); err == nil {
			t.Fatalf("unsafe path accepted: %s", name)
		}
	}
}

func TestFullBackupFailedRestoreRollsBackFiles(t *testing.T) {
	s := backupTestState(t)
	path, _ := s.backupBundle()
	content, _, err := s.readFullBackup(path)
	if err != nil {
		t.Fatal(err)
	}
	for _, file := range content {
		if err := os.WriteFile(file.path, []byte("before restore"), 0600); err != nil {
			t.Fatal(err)
		}
	}
	calls := 0
	err = applyBackupContentWithWriter(content, func(path string, body []byte, mode fs.FileMode) error {
		calls++
		if calls == 2 {
			return errors.New("injected disk failure")
		}
		return writeFileAtomic(path, body, mode)
	})
	if err == nil {
		t.Fatal("write failure ignored")
	}
	for _, file := range content {
		body, _ := os.ReadFile(file.path)
		if string(body) != "before restore" {
			t.Fatalf("partial restoration left behind: %s", file.path)
		}
	}
}

func TestFullBackupMissingRequiredConfigIsAnError(t *testing.T) {
	s := backupTestState(t)
	if err := os.Remove(s.cfg.ActiveConfig); err != nil {
		t.Fatal(err)
	}
	if _, err := s.backupBundle(); err == nil {
		t.Fatal("created incomplete archive without Xray config")
	}
}
