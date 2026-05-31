package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

const routePresetsLimit = 200
const routePresetRulesLimit = 1000
const routePresetSourcesLimit = 20
const routePresetSourceBodyLimit = 2 * 1024 * 1024

var routePresetSourceIDPattern = regexp.MustCompile(`[^a-z0-9_-]+`)
var routePresetSVGUnsafePattern = regexp.MustCompile(`(?is)<\s*(script|iframe|object|embed|foreignObject|audio|video|canvas|link|meta|style)\b|on[a-z]+\s*=|javascript:`)
var routePresetColorPattern = regexp.MustCompile(`^#[0-9a-fA-F]{3,8}$|^[a-zA-Z][a-zA-Z0-9_-]{0,24}$`)

func (s *serverState) routePresetsPath() string {
	return filepath.Join(s.cfg.DataDir, "route-presets.json")
}

func (s *serverState) routePresetSourcesPath() string {
	return filepath.Join(s.cfg.DataDir, "route-preset-sources.json")
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
	totalRules := 0
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
		cleanRules := make([]any, 0, min(len(rules), routePresetRulesLimit-totalRules))
		for _, rule := range rules {
			if totalRules >= routePresetRulesLimit {
				break
			}
			ruleMap, ok := rule.(map[string]any)
			if !ok || ruleMap == nil {
				continue
			}
			cleanRule := sanitizeRoutePresetRule(ruleMap)
			if len(cleanRule) == 0 {
				continue
			}
			cleanRules = append(cleanRules, cleanRule)
			totalRules++
		}
		if len(cleanRules) == 0 {
			continue
		}
		presets[cleanID] = map[string]any{
			"title":     title,
			"detail":    optionalRoutePresetString(item["detail"]),
			"icon":      sanitizeRoutePresetIcon(item["icon"]),
			"rules":     cleanRules,
			"updatedAt": optionalRoutePresetString(item["updatedAt"]),
		}
	}
	return presets
}

func sanitizeRoutePresetRule(rule map[string]any) map[string]any {
	clean := map[string]any{"type": "field"}
	for _, key := range []string{"domain", "ip", "source", "inboundTag"} {
		values := routePresetStringList(rule[key])
		if len(values) > 0 {
			clean[key] = values
		}
	}
	for _, key := range []string{"port", "network", "outboundTag", "balancerTag"} {
		value := optionalRoutePresetString(rule[key])
		if value != "" {
			clean[key] = value
		}
	}
	if _, hasOutbound := clean["outboundTag"]; !hasOutbound {
		if _, hasBalancer := clean["balancerTag"]; !hasBalancer {
			clean["outboundTag"] = "proxy"
		}
	}
	if len(clean) <= 2 {
		if _, hasNetwork := clean["network"]; !hasNetwork {
			if _, hasPort := clean["port"]; !hasPort {
				return map[string]any{}
			}
		}
	}
	return clean
}

func routePresetStringList(value any) []string {
	switch typed := value.(type) {
	case []any:
		out := make([]string, 0, len(typed))
		for _, item := range typed {
			if clean := optionalRoutePresetString(item); clean != "" {
				out = append(out, clean)
			}
			if len(out) >= 300 {
				break
			}
		}
		return out
	case []string:
		out := make([]string, 0, len(typed))
		for _, item := range typed {
			if clean := optionalRoutePresetString(item); clean != "" {
				out = append(out, clean)
			}
			if len(out) >= 300 {
				break
			}
		}
		return out
	case string:
		if clean := strings.TrimSpace(typed); clean != "" {
			return []string{clean}
		}
	}
	return nil
}

func sanitizeRoutePresetIcon(value any) any {
	switch typed := value.(type) {
	case string:
		return optionalRoutePresetString(typed)
	case map[string]any:
		iconType := strings.ToLower(optionalRoutePresetString(typed["type"]))
		if iconType == "" {
			iconType = "svg"
		}
		clean := map[string]any{"type": iconType}
		for _, key := range []string{"background", "foreground"} {
			color := optionalRoutePresetString(typed[key])
			if color != "" && routePresetColorPattern.MatchString(color) {
				clean[key] = color
			}
		}
		if iconType == "svg" {
			svg := optionalRoutePresetString(typed["svg"])
			if svg != "" && len(svg) <= 20000 && strings.Contains(strings.ToLower(svg), "<svg") && !routePresetSVGUnsafePattern.MatchString(svg) {
				clean["svg"] = svg
				return clean
			}
			return ""
		}
		if iconType == "iconify" {
			if name := optionalRoutePresetString(typed["name"]); name != "" {
				clean["name"] = name
				return clean
			}
		}
	}
	return ""
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
	external, sources, embedded := s.externalRoutePresets()
	return map[string]any{
		"ok":              true,
		"presets":         s.routePresets(),
		"externalPresets": external,
		"sources":         sources,
		"embedded":        embedded,
	}
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

func (s *serverState) routePresetSources() []map[string]any {
	body, err := os.ReadFile(s.routePresetSourcesPath())
	if err != nil {
		return nil
	}
	var file map[string]any
	if err := json.Unmarshal(body, &file); err != nil {
		return nil
	}
	raw, _ := file["sources"].([]any)
	sources := make([]map[string]any, 0, min(len(raw), routePresetSourcesLimit))
	for _, item := range raw {
		source, ok := item.(map[string]any)
		if !ok {
			continue
		}
		clean := sanitizeRoutePresetSource(source)
		if clean != nil {
			sources = append(sources, clean)
		}
		if len(sources) >= routePresetSourcesLimit {
			break
		}
	}
	return sources
}

func sanitizeRoutePresetSource(source map[string]any) map[string]any {
	rawURL := optionalRoutePresetString(source["url"])
	if rawURL == "" {
		return nil
	}
	id := optionalRoutePresetString(source["id"])
	if id == "" {
		id = routePresetSourceID(rawURL)
	}
	name := optionalRoutePresetString(source["name"])
	if name == "" {
		name = rawURL
	}
	clean := map[string]any{
		"id":         id,
		"name":       name,
		"url":        rawURL,
		"enabled":    boolValue(source["enabled"], true),
		"autoUpdate": boolValue(source["autoUpdate"], false),
		"version":    optionalRoutePresetString(source["version"]),
		"checkedAt":  optionalRoutePresetString(source["checkedAt"]),
		"updatedAt":  optionalRoutePresetString(source["updatedAt"]),
		"error":      optionalRoutePresetString(source["error"]),
	}
	if presets, ok := source["presets"].(map[string]any); ok {
		cleanPresets := sanitizeRoutePresets(presets)
		annotateRoutePresets(cleanPresets, "github", name, id)
		clean["presets"] = cleanPresets
	}
	if count, ok := source["count"].(float64); ok {
		clean["count"] = int(count)
	} else if count, ok := source["count"].(int); ok {
		clean["count"] = count
	}
	return clean
}

func boolValue(value any, fallback bool) bool {
	if value == nil {
		return fallback
	}
	switch typed := value.(type) {
	case bool:
		return typed
	case string:
		clean := strings.ToLower(strings.TrimSpace(typed))
		if clean == "true" || clean == "1" || clean == "yes" || clean == "on" {
			return true
		}
		if clean == "false" || clean == "0" || clean == "no" || clean == "off" {
			return false
		}
	}
	return fallback
}

func routePresetSourceID(rawURL string) string {
	id := strings.ToLower(strings.TrimSpace(rawURL))
	id = strings.TrimPrefix(id, "https://")
	id = strings.TrimPrefix(id, "http://")
	id = routePresetSourceIDPattern.ReplaceAllString(id, "-")
	id = strings.Trim(id, "-")
	if len(id) > 56 {
		id = id[:56]
	}
	if id == "" {
		id = fmt.Sprintf("source-%d", time.Now().Unix())
	}
	return id
}

func (s *serverState) externalRoutePresets() (map[string]any, []map[string]any, map[string]any) {
	embedded := embeddedRoutePresetCatalog()
	merged := map[string]any{}
	sources := s.routePresetSources()
	for _, source := range sources {
		if !boolValue(source["enabled"], true) {
			continue
		}
		presets, _ := source["presets"].(map[string]any)
		for id, preset := range presets {
			if _, exists := merged[id]; !exists {
				merged[id] = preset
			}
		}
	}
	if embeddedPresets, ok := embedded["presets"].(map[string]any); ok {
		for id, preset := range embeddedPresets {
			if _, exists := merged[id]; !exists {
				merged[id] = preset
			}
		}
	}
	return merged, sources, embedded
}

func routePresetsFromCatalog(payload map[string]any) (map[string]any, string, string) {
	raw := map[string]any{}
	if scenarios, ok := payload["scenarios"].(map[string]any); ok {
		raw = scenarios
	} else if presets, ok := payload["presets"].(map[string]any); ok {
		raw = presets
	}
	name := optionalRoutePresetString(payload["name"])
	version := optionalRoutePresetString(payload["version"])
	return sanitizeRoutePresets(raw), name, version
}

func (s *serverState) routePresetSourceCheck(payload map[string]any) map[string]any {
	rawURL := optionalRoutePresetString(payload["url"])
	presets, name, version, warnings, err := s.fetchRoutePresetCatalog(rawURL)
	if err != nil {
		return map[string]any{"ok": false, "error": err.Error(), "warnings": warnings}
	}
	warnings = append(warnings, s.routePresetOutboundWarnings(presets)...)
	return map[string]any{
		"ok":       true,
		"name":     name,
		"version":  version,
		"url":      normalizeRoutePresetSourceURL(rawURL),
		"count":    len(presets),
		"rules":    routePresetRulesCount(presets),
		"warnings": warnings,
		"presets":  routePresetPreview(presets, 8),
	}
}

func (s *serverState) saveRoutePresetSource(payload map[string]any) map[string]any {
	rawURL := optionalRoutePresetString(payload["url"])
	presets, name, version, warnings, err := s.fetchRoutePresetCatalog(rawURL)
	if err != nil {
		return map[string]any{"ok": false, "error": err.Error(), "warnings": warnings, "sources": s.routePresetSources()}
	}
	normalizedURL := normalizeRoutePresetSourceURL(rawURL)
	sources := s.routePresetSources()
	id := routePresetSourceID(normalizedURL)
	now := time.Now().Format(time.RFC3339)
	sourceName := firstNonEmpty(optionalRoutePresetString(payload["name"]), name, normalizedURL)
	annotateRoutePresets(presets, "github", sourceName, id)
	source := map[string]any{
		"id":         id,
		"name":       sourceName,
		"url":        normalizedURL,
		"enabled":    boolValue(payload["enabled"], true),
		"autoUpdate": boolValue(payload["autoUpdate"], false),
		"version":    version,
		"checkedAt":  now,
		"updatedAt":  now,
		"error":      "",
		"count":      len(presets),
		"presets":    presets,
	}
	replaced := false
	for index, item := range sources {
		if item["id"] == id || item["url"] == normalizedURL {
			sources[index] = source
			replaced = true
			break
		}
	}
	if !replaced {
		sources = append(sources, source)
	}
	if len(sources) > routePresetSourcesLimit {
		sources = sources[:routePresetSourcesLimit]
	}
	if err := s.writeRoutePresetSources(sources); err != nil {
		return map[string]any{"ok": false, "error": err.Error(), "sources": s.routePresetSources()}
	}
	external, saved, embedded := s.externalRoutePresets()
	return map[string]any{"ok": true, "sources": saved, "externalPresets": external, "embedded": embedded, "warnings": append(warnings, s.routePresetOutboundWarnings(presets)...)}
}

func (s *serverState) updateRoutePresetSources(payload map[string]any) map[string]any {
	targetID := optionalRoutePresetString(payload["id"])
	sources := s.routePresetSources()
	now := time.Now().Format(time.RFC3339)
	for index, source := range sources {
		if targetID != "" && source["id"] != targetID {
			continue
		}
		if targetID == "" && !boolValue(source["enabled"], true) {
			continue
		}
		presets, name, version, _, err := s.fetchRoutePresetCatalog(optionalRoutePresetString(source["url"]))
		source["checkedAt"] = now
		if err != nil {
			source["error"] = err.Error()
			sources[index] = source
			continue
		}
		sourceName := firstNonEmpty(optionalRoutePresetString(source["name"]), name, optionalRoutePresetString(source["url"]))
		annotateRoutePresets(presets, "github", sourceName, optionalRoutePresetString(source["id"]))
		source["name"] = sourceName
		source["version"] = version
		source["updatedAt"] = now
		source["error"] = ""
		source["count"] = len(presets)
		source["presets"] = presets
		sources[index] = source
	}
	if err := s.writeRoutePresetSources(sources); err != nil {
		return map[string]any{"ok": false, "error": err.Error(), "sources": s.routePresetSources()}
	}
	external, saved, embedded := s.externalRoutePresets()
	return map[string]any{"ok": true, "sources": saved, "externalPresets": external, "embedded": embedded}
}

func annotateRoutePresets(presets map[string]any, sourceKind, sourceName, sourceID string) {
	for id, value := range presets {
		item, ok := value.(map[string]any)
		if !ok {
			continue
		}
		item["source"] = sourceKind
		item["sourceName"] = sourceName
		item["sourceId"] = sourceID
		presets[id] = item
	}
}

func (s *serverState) deleteRoutePresetSource(payload map[string]any) map[string]any {
	id := optionalRoutePresetString(payload["id"])
	if id == "" {
		return map[string]any{"ok": false, "error": "source id is required", "sources": s.routePresetSources()}
	}
	sources := s.routePresetSources()
	next := sources[:0]
	for _, source := range sources {
		if source["id"] != id {
			next = append(next, source)
		}
	}
	if err := s.writeRoutePresetSources(next); err != nil {
		return map[string]any{"ok": false, "error": err.Error(), "sources": s.routePresetSources()}
	}
	external, saved, embedded := s.externalRoutePresets()
	return map[string]any{"ok": true, "sources": saved, "externalPresets": external, "embedded": embedded}
}

func (s *serverState) toggleRoutePresetSource(payload map[string]any) map[string]any {
	id := optionalRoutePresetString(payload["id"])
	sources := s.routePresetSources()
	for _, source := range sources {
		if source["id"] == id {
			source["enabled"] = boolValue(payload["enabled"], true)
			break
		}
	}
	if err := s.writeRoutePresetSources(sources); err != nil {
		return map[string]any{"ok": false, "error": err.Error(), "sources": s.routePresetSources()}
	}
	external, saved, embedded := s.externalRoutePresets()
	return map[string]any{"ok": true, "sources": saved, "externalPresets": external, "embedded": embedded}
}

func (s *serverState) writeRoutePresetSources(sources []map[string]any) error {
	if err := os.MkdirAll(s.cfg.DataDir, 0o755); err != nil {
		return err
	}
	body, err := json.MarshalIndent(map[string]any{"sources": sources}, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(s.routePresetSourcesPath(), body, 0o600)
}

func (s *serverState) fetchRoutePresetCatalog(rawURL string) (map[string]any, string, string, []string, error) {
	normalized := normalizeRoutePresetSourceURL(rawURL)
	if normalized == "" {
		return nil, "", "", nil, fmt.Errorf("URL источника пустой")
	}
	client := http.Client{Timeout: 20 * time.Second}
	resp, err := client.Get(normalized)
	if err != nil {
		return nil, "", "", nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, "", "", nil, fmt.Errorf("HTTP %d", resp.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, routePresetSourceBodyLimit+1))
	if err != nil {
		return nil, "", "", nil, err
	}
	if len(body) > routePresetSourceBodyLimit {
		return nil, "", "", nil, fmt.Errorf("каталог слишком большой")
	}
	var payload map[string]any
	if err := json.Unmarshal(body, &payload); err != nil {
		return nil, "", "", nil, err
	}
	warnings := validateRoutePresetCatalogMeta(payload)
	presets, name, version := routePresetsFromCatalog(payload)
	if len(presets) == 0 {
		return nil, name, version, warnings, fmt.Errorf("в каталоге нет валидных сценариев")
	}
	return presets, name, version, warnings, nil
}

func normalizeRoutePresetSourceURL(rawURL string) string {
	clean := strings.TrimSpace(rawURL)
	if clean == "" {
		return ""
	}
	if parsed, err := url.Parse(clean); err == nil && strings.EqualFold(parsed.Host, "github.com") {
		parts := strings.Split(strings.Trim(parsed.Path, "/"), "/")
		if len(parts) >= 5 && parts[2] == "blob" {
			return "https://raw.githubusercontent.com/" + parts[0] + "/" + parts[1] + "/" + parts[3] + "/" + strings.Join(parts[4:], "/")
		}
	}
	return clean
}

func validateRoutePresetCatalogMeta(payload map[string]any) []string {
	warnings := []string{}
	schema := optionalRoutePresetString(payload["schema"])
	if schema == "" {
		warnings = append(warnings, "schema не указан, ожидается schema: 1")
	} else if schema != "1" {
		warnings = append(warnings, "schema отличается от 1")
	}
	if optionalRoutePresetString(payload["version"]) == "" {
		warnings = append(warnings, "version не указан")
	}
	return warnings
}

func (s *serverState) routePresetOutboundWarnings(presets map[string]any) []string {
	cfg, _ := s.readActiveConfig()
	known := map[string]bool{"proxy": true, "direct": true, "block": true, "dns-out": true, "ruopenray-api": true}
	if outbounds, ok := cfg["outbounds"].([]any); ok {
		for _, item := range outbounds {
			if outbound, ok := item.(map[string]any); ok {
				if tag := optionalRoutePresetString(outbound["tag"]); tag != "" {
					known[tag] = true
				}
			}
		}
	}
	warnings := []string{}
	seen := map[string]bool{}
	for id, preset := range presets {
		item, _ := preset.(map[string]any)
		rules, _ := item["rules"].([]any)
		for _, rawRule := range rules {
			rule, _ := rawRule.(map[string]any)
			tag := optionalRoutePresetString(rule["outboundTag"])
			if tag != "" && !known[tag] && !seen[id+tag] {
				warnings = append(warnings, fmt.Sprintf("%s: неизвестный outboundTag %s", id, tag))
				seen[id+tag] = true
			}
		}
	}
	return warnings
}

func routePresetRulesCount(presets map[string]any) int {
	total := 0
	for _, preset := range presets {
		item, _ := preset.(map[string]any)
		if rules, ok := item["rules"].([]any); ok {
			total += len(rules)
		}
	}
	return total
}

func routePresetPreview(presets map[string]any, limit int) []map[string]any {
	preview := []map[string]any{}
	for id, preset := range presets {
		item, _ := preset.(map[string]any)
		rules, _ := item["rules"].([]any)
		preview = append(preview, map[string]any{
			"id":     id,
			"title":  item["title"],
			"detail": item["detail"],
			"rules":  len(rules),
		})
		if len(preview) >= limit {
			break
		}
	}
	return preview
}
