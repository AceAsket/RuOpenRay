package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestUpdateRoutePresetSourcesRejectsEmptySources(t *testing.T) {
	state := &serverState{}
	state.cfg.DataDir = t.TempDir()

	result := state.updateRoutePresetSources(map[string]any{})
	if result["ok"] == true {
		t.Fatalf("empty sources update must not report success: %#v", result)
	}
	if !strings.Contains(result["error"].(string), "Нет подключенных") {
		t.Fatalf("unexpected error: %#v", result["error"])
	}
}

func TestWriteRoutePresetSourcesUsesEmptyArray(t *testing.T) {
	state := &serverState{}
	state.cfg.DataDir = t.TempDir()

	if err := state.writeRoutePresetSources([]map[string]any{}); err != nil {
		t.Fatalf("write sources: %v", err)
	}
	body, err := os.ReadFile(filepath.Join(state.cfg.DataDir, "route-preset-sources.json"))
	if err != nil {
		t.Fatalf("read sources: %v", err)
	}
	if strings.Contains(string(body), "null") || !strings.Contains(string(body), "[]") {
		t.Fatalf("empty sources must be encoded as an array: %s", body)
	}
}
