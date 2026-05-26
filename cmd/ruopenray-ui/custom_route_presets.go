package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"
)

var customRoutePresetIDPattern = regexp.MustCompile(`[^a-zA-Z0-9._-]+`)

func (s *serverState) customRoutePresetsPath() string {
	return filepath.Join(s.cfg.DataDir, "custom-route-presets.json")
}

func cleanCustomRoutePresetID(id string) string {
	id = strings.TrimSpace(id)
	id = customRoutePresetIDPattern.ReplaceAllString(id, "-")
	id = strings.Trim(id, "-._")
	if id == "" {
		return ""
	}
	if len(id) > 80 {
		id = id[:80]
	}
	return id
}

func customRoutePresetMap(value any) (map[string]any, bool) {
	item, ok := value.(map[string]any)
	return item, ok && item != nil
}

func cleanCustomRoutePresets(payload map[string]any) map[string]any {
	cleaned := map[string]any{}
	for rawID, rawPreset := range payload {
		id := cleanCustomRoutePresetID(rawID)
		preset, ok := customRoutePresetMap(rawPreset)
		if !ok || id == "" {
			continue
		}
		title := strings.TrimSpace(fmt.Sprint(preset["title"]))
		rules, ok := preset["rules"].([]any)
		if title == "" || !ok || len(rules) == 0 {
			continue
		}
		updatedAt := strings.TrimSpace(fmt.Sprint(preset["updatedAt"]))
		if updatedAt == "" {
			updatedAt = time.Now().Format(time.RFC3339)
		}
		next := map[string]any{
			"custom":    true,
			"title":     title,
			"detail":    strings.TrimSpace(fmt.Sprint(preset["detail"])),
			"icon":      strings.TrimSpace(fmt.Sprint(preset["icon"])),
			"rules":     rules,
			"updatedAt": updatedAt,
		}
		cleaned[id] = next
	}
	return cleaned
}

func (s *serverState) customRoutePresets() map[string]any {
	body, err := os.ReadFile(s.customRoutePresetsPath())
	if err != nil {
		return map[string]any{}
	}
	var payload map[string]any
	if err := json.Unmarshal(body, &payload); err != nil {
		return map[string]any{}
	}
	return cleanCustomRoutePresets(payload)
}

func (s *serverState) customRoutePresetsReport() map[string]any {
	presets := s.customRoutePresets()
	ids := make([]string, 0, len(presets))
	for id := range presets {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	return map[string]any{"ok": true, "presets": presets, "ids": ids}
}

func customRoutePresetsFromPayload(payload map[string]any) map[string]any {
	if presets, ok := payload["presets"].(map[string]any); ok {
		return cleanCustomRoutePresets(presets)
	}
	return cleanCustomRoutePresets(payload)
}

func (s *serverState) saveCustomRoutePresets(payload map[string]any) map[string]any {
	presets := customRoutePresetsFromPayload(payload)
	if err := os.MkdirAll(s.cfg.DataDir, 0o755); err != nil {
		return map[string]any{"ok": false, "error": err.Error(), "presets": s.customRoutePresets()}
	}
	body, err := json.MarshalIndent(presets, "", "  ")
	if err != nil {
		return map[string]any{"ok": false, "error": err.Error(), "presets": s.customRoutePresets()}
	}
	if err := os.WriteFile(s.customRoutePresetsPath(), body, 0o600); err != nil {
		return map[string]any{"ok": false, "error": err.Error(), "presets": s.customRoutePresets()}
	}
	return map[string]any{"ok": true, "presets": presets}
}
