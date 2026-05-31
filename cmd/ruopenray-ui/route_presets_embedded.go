package main

import (
	_ "embed"
	"encoding/json"
)

//go:embed route-presets.external.json
var embeddedRoutePresetCatalogBody []byte

func embeddedRoutePresetCatalog() map[string]any {
	var payload map[string]any
	if err := json.Unmarshal(embeddedRoutePresetCatalogBody, &payload); err != nil {
		return map[string]any{"name": "RuOpenRay bundled scenarios", "version": "", "presets": map[string]any{}}
	}
	presets, name, version := routePresetsFromCatalog(payload)
	for id, value := range presets {
		if item, ok := value.(map[string]any); ok {
			item["source"] = "builtin"
			item["sourceName"] = "compile-time"
			presets[id] = item
		}
	}
	return map[string]any{
		"name":    firstNonEmpty(name, "RuOpenRay bundled scenarios"),
		"version": version,
		"presets": presets,
		"count":   len(presets),
	}
}
