package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestPrepareActiveLogFilesMigratesVolatilePaths(t *testing.T) {
	dataDir := filepath.Join(t.TempDir(), "data")
	state := &serverState{cfg: appConfig{
		DataDir:      dataDir,
		ActiveConfig: filepath.Join(dataDir, "config.json"),
	}}
	cfg := map[string]any{
		"log": map[string]any{
			"loglevel": "warning",
			"access":   "/tmp/ruopenray/access.log",
			"error":    legacyErrorLogPath,
		},
	}
	if err := state.writeActiveConfigRaw(cfg); err != nil {
		t.Fatalf("write active config: %v", err)
	}
	if err := state.prepareActiveLogFiles(); err != nil {
		t.Fatalf("prepareActiveLogFiles returned error: %v", err)
	}
	read, err := state.readActiveConfig()
	if err != nil {
		t.Fatalf("read active config: %v", err)
	}
	logConfig, _ := read["log"].(map[string]any)
	if got := logConfig["access"]; got != state.defaultAccessLogPath() {
		t.Fatalf("access path = %v, want %s", got, state.defaultAccessLogPath())
	}
	if got := logConfig["error"]; got != state.defaultErrorLogPath() {
		t.Fatalf("error path = %v, want %s", got, state.defaultErrorLogPath())
	}
}

func TestPrepareActiveLogFilesKeepsPersistentCustomPath(t *testing.T) {
	baseDir, err := os.MkdirTemp(".", ".settings-log-test-")
	if err != nil {
		t.Fatalf("create persistent test dir: %v", err)
	}
	t.Cleanup(func() { _ = os.RemoveAll(baseDir) })
	baseDir, err = filepath.Abs(baseDir)
	if err != nil {
		t.Fatalf("resolve persistent test dir: %v", err)
	}
	dataDir := filepath.Join(baseDir, "data")
	customDir := filepath.Join(dataDir, "custom")
	customPath := filepath.Join(customDir, "xray-access.log")
	state := &serverState{cfg: appConfig{
		DataDir:      dataDir,
		ActiveConfig: filepath.Join(dataDir, "config.json"),
	}}
	cfg := map[string]any{
		"log": map[string]any{
			"loglevel": "warning",
			"access":   customPath,
		},
	}
	if err := state.writeActiveConfigRaw(cfg); err != nil {
		t.Fatalf("write active config: %v", err)
	}
	if err := state.prepareActiveLogFiles(); err != nil {
		t.Fatalf("prepareActiveLogFiles returned error: %v", err)
	}
	read, err := state.readActiveConfig()
	if err != nil {
		t.Fatalf("read active config: %v", err)
	}
	logConfig, _ := read["log"].(map[string]any)
	if got := logConfig["access"]; got != customPath {
		t.Fatalf("access path = %v, want %s", got, customPath)
	}
}
