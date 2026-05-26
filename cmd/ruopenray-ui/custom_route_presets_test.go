package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestSaveCustomRoutePresetsMarksAndCleans(t *testing.T) {
	dir := t.TempDir()
	state := &serverState{cfg: appConfig{DataDir: dir}}
	result := state.saveCustomRoutePresets(map[string]any{
		"presets": map[string]any{
			" My Preset! ": map[string]any{
				"title":  " My Preset ",
				"detail": " demo ",
				"rules": []any{
					map[string]any{"type": "field", "outboundTag": "proxy", "domain": []any{"domain:example.com"}},
				},
			},
			"empty": map[string]any{"title": "Empty", "rules": []any{}},
		},
	})
	if ok, _ := result["ok"].(bool); !ok {
		t.Fatalf("save failed: %#v", result)
	}
	presets := state.customRoutePresets()
	if len(presets) != 1 {
		t.Fatalf("expected 1 clean preset, got %#v", presets)
	}
	preset, _ := presets["My-Preset"].(map[string]any)
	if preset == nil {
		t.Fatalf("preset id was not cleaned: %#v", presets)
	}
	if preset["title"] != "My Preset" {
		t.Fatalf("title was not trimmed: %#v", preset)
	}
	if preset["custom"] != true {
		t.Fatalf("custom marker missing: %#v", preset)
	}
	if _, err := os.Stat(filepath.Join(dir, "custom-route-presets.json")); err != nil {
		t.Fatalf("preset file was not written: %v", err)
	}
}
