package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"testing"
	"time"
)

func setupRecoveryFixture() map[string]any {
	return map[string]any{
		"createdAt":            time.Now().UTC().Format(time.RFC3339Nano),
		"config":               map[string]any{"outbounds": []any{map[string]any{"protocol": "vless", "password": "private"}}},
		"firewall":             map[string]any{"ok": true, "status": map[string]any{"active": false}, "nftBody": "", "hotplugBody": ""},
		"lanDns":               map[string]any{"ok": true, "mode": "system", "servers": []any{}},
		"dnsMutationAttempted": false, "recoveryPending": false,
	}
}

func TestSetupSnapshotPersistsAcrossInstancesAndRejectsStaleDelete(t *testing.T) {
	s := &serverState{cfg: appConfig{DataDir: t.TempDir()}}
	first := s.saveSetupSnapshot(map[string]any{"snapshot": setupRecoveryFixture(), "expectedRevision": ""})
	if first["ok"] != true {
		t.Fatal(first)
	}
	next := &serverState{cfg: s.cfg}
	loaded := next.readSetupSnapshot()
	if loaded["revision"] != first["revision"] || loaded["exists"] != true {
		t.Fatal(loaded)
	}
	if info, err := os.Stat(s.setupSnapshotPath()); err != nil || (runtime.GOOS != "windows" && info.Mode().Perm() != 0600) {
		t.Fatalf("snapshot permissions: %v %v", info, err)
	}
	snapshot := mapValue(loaded["snapshot"])
	snapshot["recoveryPending"] = true
	updated := next.saveSetupSnapshot(map[string]any{"snapshot": snapshot, "expectedRevision": loaded["revision"]})
	if updated["ok"] != true {
		t.Fatal(updated)
	}
	stale := s.clearSetupSnapshot(map[string]any{"expectedRevision": first["revision"]})
	if stale["conflict"] != true || s.readSetupSnapshot()["exists"] != true {
		t.Fatal(stale)
	}
	if got := next.clearSetupSnapshot(map[string]any{"expectedRevision": updated["revision"]}); got["ok"] != true || s.readSetupSnapshot()["exists"] != false {
		t.Fatal(got)
	}
}

func TestSetupSnapshotPreservesIncompleteOriginalAndRejectsInvalidState(t *testing.T) {
	s := &serverState{cfg: appConfig{DataDir: t.TempDir()}}
	snapshot := setupRecoveryFixture()
	snapshot["recoveryPending"] = true
	first := s.saveSetupSnapshot(map[string]any{"snapshot": snapshot, "expectedRevision": ""})
	before, _ := os.ReadFile(s.setupSnapshotPath())
	changed := setupRecoveryFixture()
	changed["id"] = mapValue(first["snapshot"])["id"]
	result := s.saveSetupSnapshot(map[string]any{"snapshot": changed, "expectedRevision": first["revision"]})
	after, _ := os.ReadFile(s.setupSnapshotPath())
	if result["conflict"] != true || !bytes.Equal(before, after) {
		t.Fatal(result)
	}
	for _, key := range []string{"config", "firewall", "lanDns", "createdAt", "dnsMutationAttempted", "recoveryPending"} {
		invalid := setupRecoveryFixture()
		delete(invalid, key)
		if err := validateSetupRecoverySnapshot(invalid); err == nil {
			t.Fatalf("accepted snapshot without %s", key)
		}
	}
	brokenDir := filepath.Join(t.TempDir(), "not-a-directory")
	os.WriteFile(brokenDir, []byte("file"), 0600)
	broken := &serverState{cfg: appConfig{DataDir: brokenDir}}
	if got := broken.saveSetupSnapshot(map[string]any{"snapshot": setupRecoveryFixture(), "expectedRevision": ""}); got["ok"] == true {
		t.Fatal("snapshot write failure ignored")
	}
}

func TestSetupSnapshotAPIRequiresAuthAndRevision(t *testing.T) {
	s := &serverState{cfg: appConfig{DataDir: t.TempDir()}}
	for _, method := range []string{http.MethodGet, http.MethodPost, http.MethodDelete} {
		rec := httptest.NewRecorder()
		s.handleAPI(rec, httptest.NewRequest(method, "/api/setup/snapshot", bytes.NewBufferString("{}")))
		if rec.Code != http.StatusUnauthorized {
			t.Fatalf("%s: %d %s", method, rec.Code, rec.Body.String())
		}
	}
	s.addSession("snapshot-test-session")
	body, _ := json.Marshal(map[string]any{"snapshot": setupRecoveryFixture()})
	req := httptest.NewRequest(http.MethodPost, "/api/setup/snapshot", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer snapshot-test-session")
	rec := httptest.NewRecorder()
	s.handleAPI(rec, req)
	if rec.Code != http.StatusPreconditionRequired {
		t.Fatalf("missing revision: %d %s", rec.Code, rec.Body.String())
	}
}
