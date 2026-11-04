package main

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestCompletedGeoTransactionBackupCanBeCleanedWithoutTouchingLiveDat(t *testing.T) {
	s := reliabilityState(t)
	s.cfg.GeoDir = t.TempDir()
	old, next := validGeoFixture(t, "old"), validGeoFixture(t, "next")
	live := filepath.Join(s.cfg.GeoDir, "geosite.dat")
	if err := os.WriteFile(live, old, 0600); err != nil {
		t.Fatal(err)
	}
	result := s.runGeoTransaction(true, false, func(stage *serverState) map[string]any {
		err := os.WriteFile(filepath.Join(stage.cfg.GeoDir, "geosite.dat"), next, 0600)
		return map[string]any{"ok": err == nil}
	})
	if result["ok"] != true {
		t.Fatal(result)
	}
	backup, _ := result["rollbackBackup"].(string)
	if _, err := os.Stat(filepath.Join(backup, geoBackupManifestName)); err != nil {
		t.Fatal(err)
	}
	cleaned := s.cleanupGeoBackups()
	if cleaned["ok"] != true || cleaned["deleted"] != 1 || cleaned["skipped"] != 0 {
		t.Fatal(cleaned)
	}
	if _, err := os.Stat(backup); !os.IsNotExist(err) {
		t.Fatal("completed backup was not removed", err)
	}
	after, err := os.ReadFile(live)
	if err != nil || !bytes.Equal(after, next) {
		t.Fatal("cleanup touched live DAT", err)
	}
}

func geoBackupFixture(t *testing.T) (*serverState, string, string) {
	t.Helper()
	dir := t.TempDir()
	s := &serverState{cfg: appConfig{DataDir: dir, BackupDir: filepath.Join(dir, "backups"), GeoDir: filepath.Join(dir, "geo"), ActiveConfig: filepath.Join(dir, "config.json")}}
	backup := filepath.Join(s.cfg.BackupDir, "geo-transaction-123456789")
	if err := os.MkdirAll(backup, 0700); err != nil {
		t.Fatal(err)
	}
	file := filepath.Join(backup, "geosite.dat")
	if err := os.WriteFile(file, []byte("saved DAT"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := completeGeoBackup(backup); err != nil {
		t.Fatal(err)
	}
	return s, backup, file
}

func TestGeoCleanupPreservesPendingAndUnownedOrModifiedSnapshots(t *testing.T) {
	for _, scenario := range []string{"pending", "unmarked", "modified", "extra-file", "nested-dir", "traversal"} {
		t.Run(scenario, func(t *testing.T) {
			s, backup, file := geoBackupFixture(t)
			marker := filepath.Join(backup, geoBackupManifestName)
			switch scenario {
			case "pending":
				journal := filepath.Join(s.cfg.DataDir, ".geo-transaction-123456789")
				os.MkdirAll(journal, 0700)
				os.WriteFile(filepath.Join(journal, "recovery.json"), []byte("{}"), 0600)
			case "unmarked":
				os.Remove(marker)
			case "modified":
				os.WriteFile(file, []byte("manually changed"), 0600)
			case "extra-file":
				os.WriteFile(filepath.Join(backup, "manual.txt"), []byte("keep"), 0600)
			case "nested-dir":
				os.Mkdir(filepath.Join(backup, "nested"), 0700)
			case "traversal":
				body, _ := json.Marshal(geoBackupManifest{Version: 1, Kind: "ruopenray-geo-backup", State: "complete", Files: []geoBackupFile{{Name: "../outside.dat", SHA256: strings.Repeat("a", 64)}}})
				os.WriteFile(marker, body, 0600)
			}
			result := s.cleanupGeoBackups()
			if result["deleted"] != 0 || result["skipped"] != 1 {
				t.Fatal(result)
			}
			if _, err := os.Stat(file); err != nil {
				t.Fatal("unverified snapshot deleted", err)
			}
			if !strings.Contains(result["stdout"].(string), "ручная проверка") {
				t.Fatal("skipped backup was hidden", result)
			}
			items, _ := result["skippedBackups"].([]map[string]string)
			if len(items) != 1 || items[0]["name"] != filepath.Base(backup) {
				t.Fatal("missing diagnostic names", result)
			}
		})
	}
}

func TestGeoCleanupDoesNotFollowBackupSymlink(t *testing.T) {
	s, backup, file := geoBackupFixture(t)
	outside := t.TempDir()
	outsideFile := filepath.Join(outside, "geosite.dat")
	if err := os.WriteFile(outsideFile, []byte("outside"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.Remove(file); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(outsideFile, file); err != nil {
		t.Skip("symlinks unavailable", err)
	}
	result := s.cleanupGeoBackups()
	if result["deleted"] != 0 || result["skipped"] != 1 {
		t.Fatal(result)
	}
	body, err := os.ReadFile(outsideFile)
	if err != nil || string(body) != "outside" {
		t.Fatal("outside target modified", err)
	}
	if _, err := os.Lstat(backup); err != nil {
		t.Fatal(err)
	}
}
