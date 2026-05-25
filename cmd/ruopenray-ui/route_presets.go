package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

const routePresetsLimit = 80
const routePresetRulesLimit = 500

func (s *serverState) routePresetsPath() string {
	return filepath.Join(s.cfg.DataDir, "route-presets.json")
}

func (s *serverState) routePresets() map[string]any {
	body, err := os.ReadFile(s.routePresetsPath())
	if err != nil {
		return map[string]any{}
	}
	var file map[string]any
	if err := json.Unmarshal(body, &file); err != nil {
		return map[string]any{}
	}
	raw, _ := file["presets"].(map[string]any)
	if raw == nil {
		raw = file
	}
	return sanitizeRoutePresets(raw)
}

func sanitizeRoutePresets(raw map[string]any) map[string]any {
	presets := make(map[string]any, len(raw))
	for id, value := range raw {
		cleanID := strings.TrimSpace(id)
		if cleanID == "" || len(presets) >= routePresetsLimit {
			continue
		}
		item, ok := value.(map[string]any)
		if !ok || item == nil {
			continue
		}
		title := strings.TrimSpace(fmt.Sprint(item["title"]))
		if title == "" || title == "<nil>" {
			continue
		}
		rules, ok := item["rules"].([]any)
		if !ok || len(rules) == 0 {
			continue
		}
		cleanRules := make([]any, 0, min(len(rules), routePresetRulesLimit))
		for _, rule := range rules {
			ruleMap, ok := rule.(map[string]any)
			if !ok || ruleMap == nil {
				continue
			}
			cleanRules = append(cleanRules, ruleMap)
			if len(cleanRules) >= routePresetRulesLimit {
				break
			}
		}
		if len(cleanRules) == 0 {
			continue
		}
		presets[cleanID] = map[string]any{
			"title":     title,
			"detail":    optionalRoutePresetString(item["detail"]),
			"icon":      optionalRoutePresetString(item["icon"]),
			"rules":     cleanRules,
			"updatedAt": optionalRoutePresetString(item["updatedAt"]),
		}
	}
	return presets
}

func optionalRoutePresetString(value any) string {
	if value == nil {
		return ""
	}
	clean := strings.TrimSpace(fmt.Sprint(value))
	if clean == "<nil>" {
		return ""
	}
	return clean
}

func routePresetsFromPayload(payload map[string]any) map[string]any {
	raw, _ := payload["presets"].(map[string]any)
	if raw == nil {
		return map[string]any{}
	}
	return sanitizeRoutePresets(raw)
}

func (s *serverState) routePresetsReport() map[string]any {
	return map[string]any{"ok": true, "presets": s.routePresets()}
}

func (s *serverState) saveRoutePresets(payload map[string]any) map[string]any {
	presets := routePresetsFromPayload(payload)
	if err := os.MkdirAll(s.cfg.DataDir, 0o755); err != nil {
		return map[string]any{"ok": false, "error": err.Error(), "presets": s.routePresets()}
	}
	body, err := json.MarshalIndent(map[string]any{"presets": presets}, "", "  ")
	if err != nil {
		return map[string]any{"ok": false, "error": err.Error(), "presets": s.routePresets()}
	}
	if err := os.WriteFile(s.routePresetsPath(), body, 0o600); err != nil {
		return map[string]any{"ok": false, "error": err.Error(), "presets": s.routePresets()}
	}
	return map[string]any{"ok": true, "presets": presets}
}
