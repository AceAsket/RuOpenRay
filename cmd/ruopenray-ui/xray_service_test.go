package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestReadWriteActiveConfig(t *testing.T) {
	dir := t.TempDir()
	state := &serverState{cfg: appConfig{ActiveConfig: filepath.Join(dir, "config.json")}}
	cfg := map[string]any{
		"log":       map[string]any{"loglevel": "warning"},
		"outbounds": []any{map[string]any{"tag": "direct", "protocol": "freedom"}},
	}
	if err := state.writeActiveConfig(cfg); err != nil {
		t.Fatalf("writeActiveConfig returned error: %v", err)
	}
	read, err := state.readActiveConfig()
	if err != nil {
		t.Fatalf("readActiveConfig returned error: %v", err)
	}
	if read["log"] == nil || len(anySlice(read["outbounds"])) != 1 {
		t.Fatalf("readActiveConfig returned unexpected config: %#v", read)
	}
}

func TestBackupActiveAndLatestBackup(t *testing.T) {
	dir := t.TempDir()
	state := &serverState{cfg: appConfig{
		ActiveConfig: filepath.Join(dir, "config.json"),
		BackupDir:    filepath.Join(dir, "backups"),
	}}
	if err := os.WriteFile(state.cfg.ActiveConfig, []byte(`{"routing":{"rules":[]}}`), 0o600); err != nil {
		t.Fatalf("write active config: %v", err)
	}
	backupPath, err := state.backupActive("unit-test")
	if err != nil {
		t.Fatalf("backupActive returned error: %v", err)
	}
	if !strings.Contains(filepath.Base(backupPath), "unit-test-") {
		t.Fatalf("backup path %q does not contain prefix", backupPath)
	}
	latest, err := state.latestBackup()
	if err != nil {
		t.Fatalf("latestBackup returned error: %v", err)
	}
	if latest["path"] != backupPath {
		t.Fatalf("latest backup path = %v, want %v", latest["path"], backupPath)
	}
}

func TestXrayEnvUsesGeoDir(t *testing.T) {
	state := &serverState{cfg: appConfig{GeoDir: "/tmp/ruopenray-geo"}}
	env := strings.Join(state.xrayEnv(), "\n")
	if !strings.Contains(env, "XRAY_LOCATION_ASSET=/tmp/ruopenray-geo") {
		t.Fatalf("xrayEnv does not include XRAY_LOCATION_ASSET: %s", env)
	}
	if !strings.Contains(env, "V2RAY_LOCATION_ASSET=/tmp/ruopenray-geo") {
		t.Fatalf("xrayEnv does not include V2RAY_LOCATION_ASSET: %s", env)
	}
}
