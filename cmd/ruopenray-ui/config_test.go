package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoadAppConfigDefaultsPaths(t *testing.T) {
	dataDir := filepath.Join(t.TempDir(), "data")
	t.Setenv("RUOPENRAY_DATA_DIR", dataDir)
	t.Setenv("RUOPENRAY_ACTIVE_CONFIG", "")
	t.Setenv("RUOPENRAY_PROFILES_DIR", "")
	t.Setenv("RUOPENRAY_BACKUP_DIR", "")
	t.Setenv("RUOPENRAY_GEO_DIR", "")

	cfg := loadAppConfig()
	if cfg.DataDir != dataDir {
		t.Fatalf("unexpected data dir: %s", cfg.DataDir)
	}
	if cfg.ActiveConfig != filepath.Join(dataDir, "config.json") {
		t.Fatalf("unexpected active config: %s", cfg.ActiveConfig)
	}
	if cfg.ProfilesDir != filepath.Join(dataDir, "profiles") {
		t.Fatalf("unexpected profiles dir: %s", cfg.ProfilesDir)
	}
	if cfg.BackupDir != filepath.Join(dataDir, "backups") {
		t.Fatalf("unexpected backup dir: %s", cfg.BackupDir)
	}
}

func TestEnsureDataCreatesDefaultProfile(t *testing.T) {
	dataDir := filepath.Join(t.TempDir(), "data")
	cfg := appConfig{
		DataDir:      dataDir,
		ProfilesDir:  filepath.Join(dataDir, "profiles"),
		BackupDir:    filepath.Join(dataDir, "backups"),
		ActiveConfig: filepath.Join(dataDir, "config.json"),
	}
	state := &serverState{cfg: cfg}

	if err := state.ensureData(); err != nil {
		t.Fatalf("ensureData returned error: %v", err)
	}
	for _, path := range []string{cfg.ActiveConfig, filepath.Join(cfg.ProfilesDir, "default.json")} {
		if _, err := os.Stat(path); err != nil {
			t.Fatalf("expected file %s: %v", path, err)
		}
	}
}
