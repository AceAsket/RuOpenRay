package main

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"time"
)

const (
	amneziaRouteTable     = "5200"
	amneziaRouteTableName = "ruopenray_awg"
	amneziaFwMark         = "0x5200"
)

func (s *serverState) cachedAmneziaStatus() map[string]any {
	now := time.Now()
	s.metricsMu.Lock()
	if s.amneziaCache != nil && now.Sub(s.amneziaAt) < 15*time.Second {
		cached := s.amneziaCache
		s.metricsMu.Unlock()
		return cached
	}
	s.metricsMu.Unlock()
	status := s.amneziaStatus()
	s.metricsMu.Lock()
	s.amneziaCache = status
	s.amneziaAt = now
	s.metricsMu.Unlock()
	return status
}

func (s *serverState) amneziaStatus() map[string]any {
	result := map[string]any{
		"ok":        true,
		"available": false,
		"running":   false,
		"active":    false,
		"summary":   "AmneziaWG не найден",
		"warnings":  []string{},
		"routePlan": amneziaRoutePlan(),
	}
	if runtime.GOOS == "windows" {
		result["summary"] = "AmneziaWG проверяется только на роутере."
		return result
	}

	interfaces := amneziaInterfacesStatus()
	services := amneziaServicesStatus()
	wg := amneziaWGStatus()
	routing := amneziaRoutingStatus(interfaces)
	configs := amneziaConfigStatus()
	commands := amneziaCommandStatus()
	kernel := amneziaKernelStatus()
	glinet := amneziaGLInetStatus()
	userspace := amneziaUserspaceStatus()

	result["interfaces"] = interfaces
	result["services"] = services
	result["wg"] = wg
	result["routing"] = routing
	result["configs"] = configs
	result["commands"] = commands
	result["kernel"] = kernel
	result["glinet"] = glinet
	result["userspace"] = userspace
	clientConfig := s.amneziaClientConfigStatus(false)
	clientConfig["profiles"] = s.amneziaProfiles()
	result["clientConfig"] = clientConfig
	result["xrayIntegration"] = s.amneziaXrayIntegrationStatus()

	wgInterfaces, _ := wg["interfaces"].([]string)
	available := len(amneziaInterfaceNames(interfaces)) > 0 ||
		len(wgInterfaces) > 0 ||
		boolMap(wg, "hasPeer") ||
		boolMap(configs, "found") ||
		boolMap(kernel, "installed") ||
		boolMap(kernel, "moduleFile") ||
		boolMap(commands, "awg") ||
		boolMap(userspace, "available") ||
		boolMap(services, "found") ||
		boolMap(glinet, "nativeWireGuard")
	running := len(amneziaRunningInterfaceNames(interfaces)) > 0 || boolMap(services, "running") || boolMap(wg, "hasPeer")
	active := running || boolMap(routing, "defaultViaTunnel") || boolMap(routing, "ipRule")

	result["available"] = available
	result["running"] = running
	result["active"] = active
	result["primaryInterface"] = amneziaPrimaryInterface(interfaces)
	result["warnings"] = amneziaWarnings(result)
	switch {
	case boolMap(routing, "defaultViaTunnel"):
		result["summary"] = "AmneziaWG найден и сейчас выглядит как глобальный маршрут по умолчанию"
	case active:
		result["summary"] = "AmneziaWG активен, RuOpenRay может подготовить отдельную политику маршрутизации"
	case available:
		result["summary"] = "AmneziaWG найден, но активный туннель или policy routing пока не видны"
	default:
		result["summary"] = "AmneziaWG не найден"
	}
	if len(result["warnings"].([]string)) > 0 {
		result["ok"] = false
	}
	return result
}

func amneziaRoutePlan() map[string]any {
	return map[string]any{
		"mode":        "planned-read-only",
		"target":      "AmneziaWG",
		"table":       amneziaRouteTable,
		"tableName":   amneziaRouteTableName,
		"mark":        amneziaFwMark,
		"description": "RuOpenRay сможет помечать выбранный трафик отдельным fwmark и отправлять его в route table AmneziaWG, не включая туннель для всего роутера.",
	}
}

func (s *serverState) amneziaXrayIntegrationStatus() map[string]any {
	result := map[string]any{
		"configPath":       s.cfg.ActiveConfig,
		"proxyOutbounds":   0,
		"balancers":        0,
		"rules":            0,
		"transparentReady": false,
	}
	body, err := os.ReadFile(s.cfg.ActiveConfig)
	if err != nil {
		result["error"] = err.Error()
		return result
	}
	var config map[string]any
	if err := json.Unmarshal(body, &config); err != nil {
		result["error"] = err.Error()
		return result
	}
	systemTags := map[string]bool{"direct": true, "block": true, "dns-out": true, "ruopenray-api": true}
	systemProtocols := map[string]bool{"freedom": true, "blackhole": true, "dns": true}
	proxyOutbounds := 0
	for _, outbound := range anySlice(config["outbounds"]) {
		item, _ := outbound.(map[string]any)
		tag := strings.TrimSpace(fmt.Sprint(item["tag"]))
		protocol := strings.TrimSpace(fmt.Sprint(item["protocol"]))
		if tag != "" && !systemTags[tag] && !systemProtocols[protocol] {
			proxyOutbounds += 1
		}
	}
	result["proxyOutbounds"] = proxyOutbounds
	for _, inbound := range anySlice(config["inbounds"]) {
		item, _ := inbound.(map[string]any)
		if strings.TrimSpace(fmt.Sprint(item["tag"])) == "transparent_ipv4" {
			result["transparentReady"] = true
			break
		}
	}
	routing, _ := config["routing"].(map[string]any)
	result["rules"] = len(anySlice(routing["rules"]))
	result["balancers"] = len(anySlice(routing["balancers"]))
	return result
}

func (s *serverState) amneziaClientConfigPath() string {
	return filepath.Join(s.cfg.DataDir, "amneziawg", "client.conf")
}

func (s *serverState) amneziaProfilesDir() string {
	return filepath.Join(s.cfg.DataDir, "amneziawg", "profiles")
}

func (s *serverState) amneziaProfilesRegistryPath() string {
	return filepath.Join(s.cfg.DataDir, "amneziawg", "profiles.json")
}

func (s *serverState) amneziaClientConfigStatus(includeRaw bool) map[string]any {
	path := s.amneziaClientConfigPath()
	result := map[string]any{
		"exists": false,
		"path":   path,
	}
	body, err := os.ReadFile(path)
	if err != nil {
		return result
	}
	parsed := parseAmneziaClientConfig(string(body))
	result["exists"] = true
	result["updatedAt"] = fileModTimeRFC3339(path)
	result["summary"] = parsed.summary
	result["interface"] = parsed.iface
	result["peer"] = parsed.peer
	result["awgOptions"] = parsed.awgOptions
	result["obfuscationOptions"] = parsed.obfuscationOptions
	result["rawOptions"] = parsed.rawOptions
	result["warnings"] = parsed.warnings
	result["preflight"] = s.amneziaPreflightForConfig(string(body))
	if includeRaw {
		result["config"] = string(body)
	}
	return result
}

func (s *serverState) amneziaClientConfig() map[string]any {
	status := s.amneziaClientConfigStatus(true)
	status["profiles"] = s.amneziaProfiles()
	status["ok"] = true
	return status
}

func (s *serverState) saveAmneziaClientConfig(payload map[string]any) map[string]any {
	raw := strings.TrimSpace(fmt.Sprint(payload["config"]))
	if raw == "" {
		return map[string]any{"ok": false, "error": "Вставьте клиентский конфиг AmneziaWG."}
	}
	if len(raw) > 128*1024 {
		return map[string]any{"ok": false, "error": "Конфиг слишком большой."}
	}
	parsed := parseAmneziaClientConfig(raw)
	if len(parsed.errors) > 0 {
		return map[string]any{"ok": false, "error": strings.Join(parsed.errors, " ")}
	}
	path := s.amneziaClientConfigPath()
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return map[string]any{"ok": false, "error": err.Error()}
	}
	if err := os.WriteFile(path, []byte(raw+"\n"), 0o600); err != nil {
		return map[string]any{"ok": false, "error": err.Error()}
	}
	name := strings.TrimSpace(fmt.Sprint(payload["name"]))
	if name == "" {
		name = "AmneziaWG"
	}
	if err := s.saveAmneziaProfile(raw, name, strings.TrimSpace(cleanPayloadString(payload, "id")), true); err != nil {
		return map[string]any{"ok": false, "error": err.Error()}
	}
	s.metricsMu.Lock()
	s.amneziaCache = nil
	s.amneziaAt = time.Time{}
	s.metricsMu.Unlock()
	return map[string]any{"ok": true, "status": s.amneziaStatus()}
}

func (s *serverState) deleteAmneziaClientConfig() map[string]any {
	path := s.amneziaClientConfigPath()
	if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
		return map[string]any{"ok": false, "error": err.Error()}
	}
	s.metricsMu.Lock()
	s.amneziaCache = nil
	s.amneziaAt = time.Time{}
	s.metricsMu.Unlock()
	return map[string]any{"ok": true, "status": s.amneziaStatus()}
}

type amneziaProfileRegistry struct {
	ActiveID    string                 `json:"activeId"`
	SelectedIDs []string               `json:"selectedIds,omitempty"`
	Strategy    string                 `json:"strategy,omitempty"`
	Mode        string                 `json:"mode,omitempty"`
	Profiles    []amneziaProfileRecord `json:"profiles"`
	PolicyRules []amneziaPolicyRule    `json:"policyRules,omitempty"`
}

type amneziaProfileRecord struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	File      string `json:"file"`
	CreatedAt string `json:"createdAt"`
	UpdatedAt string `json:"updatedAt"`
}

type amneziaPolicyRule struct {
	ID        string   `json:"id"`
	Name      string   `json:"name,omitempty"`
	Type      string   `json:"type,omitempty"`
	Domain    []string `json:"domain,omitempty"`
	IP        []string `json:"ip,omitempty"`
	Source    []string `json:"source,omitempty"`
	Inbound   []string `json:"inboundTag,omitempty"`
	Port      string   `json:"port,omitempty"`
	Network   string   `json:"network,omitempty"`
	Target    string   `json:"target"`
	CreatedAt string   `json:"createdAt,omitempty"`
	UpdatedAt string   `json:"updatedAt,omitempty"`
}

func (s *serverState) amneziaProfiles() map[string]any {
	reg := s.loadAmneziaProfileRegistry()
	items := []map[string]any{}
	selectedIDs := s.amneziaSelectedProfileIDs(reg)
	selectedSet := map[string]bool{}
	for _, id := range selectedIDs {
		selectedSet[id] = true
	}
	for _, profile := range reg.Profiles {
		path := filepath.Join(s.amneziaProfilesDir(), profile.File)
		body, err := os.ReadFile(path)
		if err != nil {
			continue
		}
		parsed := parseAmneziaClientConfig(string(body))
		active := profile.ID == reg.ActiveID
		items = append(items, amneziaProfileSummary(profile, parsed, active, active || selectedSet[profile.ID], fileModTimeRFC3339(path)))
	}
	if legacy := s.legacyAmneziaProfile(reg, selectedSet); legacy != nil {
		items = append(items, legacy)
	}
	sort.SliceStable(items, func(i, j int) bool {
		if items[i]["active"] == true {
			return true
		}
		if items[j]["active"] == true {
			return false
		}
		if items[i]["selected"] == true && items[j]["selected"] != true {
			return true
		}
		if items[j]["selected"] == true && items[i]["selected"] != true {
			return false
		}
		return fmt.Sprint(items[i]["name"]) < fmt.Sprint(items[j]["name"])
	})
	return map[string]any{
		"activeId":    reg.ActiveID,
		"selectedIds": selectedIDs,
		"strategy":    amneziaProfileStrategy(reg.Strategy),
		"mode":        amneziaIntegrationMode(reg.Mode),
		"policyRules": normalizeAmneziaPolicyRules(reg.PolicyRules),
		"items":       items,
	}
}

func (s *serverState) legacyAmneziaProfile(reg amneziaProfileRegistry, selectedSet map[string]bool) map[string]any {
	path := s.amneziaClientConfigPath()
	body, err := os.ReadFile(path)
	if err != nil {
		return nil
	}
	if reg.ActiveID != "" {
		for _, profile := range reg.Profiles {
			if profile.ID == reg.ActiveID {
				return nil
			}
		}
	}
	parsed := parseAmneziaClientConfig(string(body))
	return amneziaProfileSummary(amneziaProfileRecord{
		ID:        "legacy",
		Name:      "Текущий client.conf",
		File:      filepath.Base(path),
		CreatedAt: fileModTimeRFC3339(path),
		UpdatedAt: fileModTimeRFC3339(path),
	}, parsed, reg.ActiveID == "" || reg.ActiveID == "legacy", reg.ActiveID == "" || reg.ActiveID == "legacy" || selectedSet["legacy"], fileModTimeRFC3339(path))
}

func amneziaProfileSummary(profile amneziaProfileRecord, parsed parsedAmneziaClientConfig, active bool, selected bool, updatedAt string) map[string]any {
	return map[string]any{
		"id":                 profile.ID,
		"name":               profile.Name,
		"active":             active,
		"selected":           selected,
		"summary":            parsed.summary,
		"interface":          parsed.iface,
		"peer":               parsed.peer,
		"obfuscationOptions": parsed.obfuscationOptions,
		"warnings":           parsed.warnings,
		"updatedAt":          firstNonEmpty(updatedAt, profile.UpdatedAt),
	}
}

func (s *serverState) loadAmneziaProfileRegistry() amneziaProfileRegistry {
	body, err := os.ReadFile(s.amneziaProfilesRegistryPath())
	if err != nil {
		return amneziaProfileRegistry{}
	}
	var reg amneziaProfileRegistry
	if err := json.Unmarshal(body, &reg); err != nil {
		return amneziaProfileRegistry{}
	}
	return normalizeAmneziaProfileRegistry(reg)
}

func (s *serverState) writeAmneziaProfileRegistry(reg amneziaProfileRegistry) error {
	if err := os.MkdirAll(filepath.Dir(s.amneziaProfilesRegistryPath()), 0o700); err != nil {
		return err
	}
	body, err := json.MarshalIndent(reg, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(s.amneziaProfilesRegistryPath(), append(body, '\n'), 0o600)
}

func (s *serverState) saveAmneziaProfile(raw, name, id string, active bool) error {
	reg := s.loadAmneziaProfileRegistry()
	now := time.Now().Format(time.RFC3339)
	if invalidAmneziaProfileID(id) || id == "legacy" {
		id = amneziaProfileID(name)
	}
	if name == "" {
		name = "AmneziaWG"
	}
	record := amneziaProfileRecord{
		ID:        id,
		Name:      name,
		File:      id + ".conf",
		CreatedAt: now,
		UpdatedAt: now,
	}
	found := false
	for idx := range reg.Profiles {
		if reg.Profiles[idx].ID == id {
			record.CreatedAt = reg.Profiles[idx].CreatedAt
			reg.Profiles[idx] = record
			found = true
			break
		}
	}
	if !found {
		reg.Profiles = append(reg.Profiles, record)
	}
	if active {
		reg.ActiveID = id
		reg.SelectedIDs = amneziaAppendUnique(reg.SelectedIDs, id)
	}
	if err := os.MkdirAll(s.amneziaProfilesDir(), 0o700); err != nil {
		return err
	}
	if err := os.WriteFile(filepath.Join(s.amneziaProfilesDir(), record.File), []byte(strings.TrimSpace(raw)+"\n"), 0o600); err != nil {
		return err
	}
	return s.writeAmneziaProfileRegistry(reg)
}

func (s *serverState) loadAmneziaProfileConfig(id string) (string, bool) {
	if id == "" || id == "legacy" {
		body, err := os.ReadFile(s.amneziaClientConfigPath())
		return string(body), err == nil
	}
	reg := s.loadAmneziaProfileRegistry()
	for _, profile := range reg.Profiles {
		if profile.ID != id {
			continue
		}
		body, err := os.ReadFile(filepath.Join(s.amneziaProfilesDir(), profile.File))
		return string(body), err == nil
	}
	return "", false
}

func (s *serverState) loadAmneziaProfile(payload map[string]any) map[string]any {
	id := strings.TrimSpace(fmt.Sprint(payload["id"]))
	raw, ok := s.loadAmneziaProfileConfig(id)
	if !ok {
		return map[string]any{"ok": false, "error": "Профиль AmneziaWG не найден."}
	}
	status := s.amneziaClientConfigStatus(false)
	status["config"] = raw
	status["profiles"] = s.amneziaProfiles()
	status["ok"] = true
	return status
}

func (s *serverState) activateAmneziaProfile(payload map[string]any) map[string]any {
	id := strings.TrimSpace(fmt.Sprint(payload["id"]))
	raw, ok := s.loadAmneziaProfileConfig(id)
	if !ok {
		return map[string]any{"ok": false, "error": "Профиль AmneziaWG не найден."}
	}
	if err := os.MkdirAll(filepath.Dir(s.amneziaClientConfigPath()), 0o700); err != nil {
		return map[string]any{"ok": false, "error": err.Error()}
	}
	if err := os.WriteFile(s.amneziaClientConfigPath(), []byte(strings.TrimSpace(raw)+"\n"), 0o600); err != nil {
		return map[string]any{"ok": false, "error": err.Error()}
	}
	reg := s.loadAmneziaProfileRegistry()
	reg.ActiveID = id
	if id == "legacy" {
		reg.ActiveID = ""
	}
	reg.SelectedIDs = amneziaAppendUnique(reg.SelectedIDs, id)
	if err := s.writeAmneziaProfileRegistry(reg); err != nil {
		return map[string]any{"ok": false, "error": err.Error()}
	}
	s.metricsMu.Lock()
	s.amneziaCache = nil
	s.amneziaAt = time.Time{}
	s.metricsMu.Unlock()
	return map[string]any{"ok": true, "status": s.amneziaStatus()}
}

func (s *serverState) deleteAmneziaProfile(payload map[string]any) map[string]any {
	id := strings.TrimSpace(fmt.Sprint(payload["id"]))
	if id == "" || id == "legacy" {
		return s.deleteAmneziaClientConfig()
	}
	reg := s.loadAmneziaProfileRegistry()
	next := reg.Profiles[:0]
	removed := false
	for _, profile := range reg.Profiles {
		if profile.ID == id {
			removed = true
			_ = os.Remove(filepath.Join(s.amneziaProfilesDir(), profile.File))
			continue
		}
		next = append(next, profile)
	}
	if !removed {
		return map[string]any{"ok": false, "error": "Профиль AmneziaWG не найден."}
	}
	reg.Profiles = next
	if reg.ActiveID == id {
		reg.ActiveID = ""
		_ = os.Remove(s.amneziaClientConfigPath())
	}
	reg.SelectedIDs = amneziaRemoveID(reg.SelectedIDs, id)
	if err := s.writeAmneziaProfileRegistry(reg); err != nil {
		return map[string]any{"ok": false, "error": err.Error()}
	}
	return map[string]any{"ok": true, "status": s.amneziaStatus()}
}

func (s *serverState) updateAmneziaProfilePool(payload map[string]any) map[string]any {
	reg := s.loadAmneziaProfileRegistry()
	reg.Strategy = amneziaProfileStrategy(fmt.Sprint(payload["strategy"]))
	if value := cleanPayloadString(payload, "mode"); value != "" {
		reg.Mode = amneziaIntegrationMode(value)
	}
	reg.SelectedIDs = s.cleanAmneziaProfileIDs(stringList(payload["selectedIds"]))
	if len(reg.SelectedIDs) == 0 {
		reg.SelectedIDs = s.cleanAmneziaProfileIDs(stringList(payload["ids"]))
	}
	if len(reg.SelectedIDs) > 0 && !containsString(reg.SelectedIDs, firstNonEmpty(reg.ActiveID, "legacy")) {
		reg.ActiveID = reg.SelectedIDs[0]
	}
	if reg.ActiveID == "legacy" {
		reg.ActiveID = ""
	}
	if reg.ActiveID != "" {
		if raw, ok := s.loadAmneziaProfileConfig(reg.ActiveID); ok {
			if err := os.MkdirAll(filepath.Dir(s.amneziaClientConfigPath()), 0o700); err != nil {
				return map[string]any{"ok": false, "error": err.Error()}
			}
			if err := os.WriteFile(s.amneziaClientConfigPath(), []byte(strings.TrimSpace(raw)+"\n"), 0o600); err != nil {
				return map[string]any{"ok": false, "error": err.Error()}
			}
		}
	}
	if err := s.writeAmneziaProfileRegistry(reg); err != nil {
		return map[string]any{"ok": false, "error": err.Error()}
	}
	s.metricsMu.Lock()
	s.amneziaCache = nil
	s.amneziaAt = time.Time{}
	s.metricsMu.Unlock()
	return map[string]any{"ok": true, "status": s.amneziaStatus()}
}

func (s *serverState) updateAmneziaPolicyRules(payload map[string]any) map[string]any {
	reg := s.loadAmneziaProfileRegistry()
	reg.PolicyRules = normalizeAmneziaPolicyRules(amneziaPolicyRulesFromPayload(payload["rules"], reg.PolicyRules))
	if err := s.writeAmneziaProfileRegistry(reg); err != nil {
		return map[string]any{"ok": false, "error": err.Error()}
	}
	s.metricsMu.Lock()
	s.amneziaCache = nil
	s.amneziaAt = time.Time{}
	s.metricsMu.Unlock()
	return map[string]any{"ok": true, "status": s.amneziaStatus()}
}

func (s *serverState) amneziaSelectedProfileIDs(reg amneziaProfileRegistry) []string {
	ids := s.cleanAmneziaProfileIDs(reg.SelectedIDs)
	if len(ids) > 0 {
		return ids
	}
	if reg.ActiveID != "" {
		return s.cleanAmneziaProfileIDs([]string{reg.ActiveID})
	}
	if _, ok := s.loadAmneziaProfileConfig("legacy"); ok {
		return []string{"legacy"}
	}
	return []string{}
}

func (s *serverState) cleanAmneziaProfileIDs(ids []string) []string {
	known := map[string]bool{}
	for _, profile := range s.loadAmneziaProfileRegistry().Profiles {
		known[profile.ID] = true
	}
	if _, ok := s.loadAmneziaProfileConfig("legacy"); ok {
		known["legacy"] = true
	}
	out := []string{}
	for _, id := range ids {
		id = strings.TrimSpace(id)
		if id == "" || !known[id] || containsString(out, id) {
			continue
		}
		out = append(out, id)
	}
	return out
}

func amneziaProfileStrategy(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "round-robin", "roundrobin", "rr":
		return "round-robin"
	case "fallback", "failover":
		return "fallback"
	case "random", "rand":
		return "random"
	default:
		return "single"
	}
}

func amneziaIntegrationMode(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "mixed", "split", "hybrid":
		return "mixed"
	case "amnezia-first", "amnezia", "awg":
		return "amnezia-first"
	case "xray-only", "xray":
		return "xray-only"
	default:
		return "standby"
	}
}

func normalizeAmneziaProfileRegistry(reg amneziaProfileRegistry) amneziaProfileRegistry {
	replacements := map[string]string{}
	used := map[string]bool{}
	for idx := range reg.Profiles {
		oldID := strings.TrimSpace(reg.Profiles[idx].ID)
		if invalidAmneziaProfileID(oldID) || used[oldID] {
			nextID := stableAmneziaProfileID(reg.Profiles[idx].Name)
			for suffix := 2; used[nextID]; suffix++ {
				nextID = fmt.Sprintf("%s-%d", stableAmneziaProfileID(reg.Profiles[idx].Name), suffix)
			}
			reg.Profiles[idx].ID = nextID
			if oldID != "" {
				replacements[oldID] = nextID
			}
		}
		if strings.TrimSpace(reg.Profiles[idx].File) == "" || strings.TrimSpace(reg.Profiles[idx].File) == "<nil>" {
			reg.Profiles[idx].File = reg.Profiles[idx].ID + ".conf"
		}
		used[reg.Profiles[idx].ID] = true
	}
	if next, ok := replacements[reg.ActiveID]; ok {
		reg.ActiveID = next
	}
	for idx, id := range reg.SelectedIDs {
		if next, ok := replacements[id]; ok {
			reg.SelectedIDs[idx] = next
		}
	}
	if invalidAmneziaProfileID(reg.ActiveID) {
		reg.ActiveID = ""
	}
	reg.SelectedIDs = amneziaCleanIDList(reg.SelectedIDs)
	reg.Strategy = amneziaProfileStrategy(reg.Strategy)
	reg.Mode = amneziaIntegrationMode(reg.Mode)
	reg.PolicyRules = normalizeAmneziaPolicyRules(reg.PolicyRules)
	return reg
}

func invalidAmneziaProfileID(id string) bool {
	id = strings.TrimSpace(id)
	return id == "" || id == "<nil>"
}

func stableAmneziaProfileID(name string) string {
	return slugID(name, "amneziawg")
}

func amneziaCleanIDList(values []string) []string {
	out := []string{}
	for _, value := range values {
		value = strings.TrimSpace(value)
		if invalidAmneziaProfileID(value) || containsString(out, value) {
			continue
		}
		out = append(out, value)
	}
	return out
}

func amneziaAppendUnique(values []string, id string) []string {
	id = strings.TrimSpace(id)
	if invalidAmneziaProfileID(id) || containsString(values, id) {
		return values
	}
	return append(values, id)
}

func amneziaRemoveID(values []string, id string) []string {
	out := values[:0]
	for _, value := range values {
		if value != id {
			out = append(out, value)
		}
	}
	return out
}

func amneziaPolicyRulesFromPayload(value any, existing []amneziaPolicyRule) []amneziaPolicyRule {
	created := map[string]string{}
	for _, rule := range existing {
		if rule.ID != "" && rule.CreatedAt != "" {
			created[rule.ID] = rule.CreatedAt
		}
	}
	rawRules, ok := value.([]any)
	if !ok {
		return []amneziaPolicyRule{}
	}
	now := time.Now().Format(time.RFC3339)
	out := []amneziaPolicyRule{}
	for _, raw := range rawRules {
		item, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		id := strings.TrimSpace(fmt.Sprint(item["id"]))
		name := strings.TrimSpace(cleanPayloadString(item, "name"))
		if id == "" || invalidAmneziaProfileID(id) {
			id = slugID(firstNonEmpty(name, fmt.Sprint(item["domain"]), fmt.Sprint(item["ip"]), fmt.Sprint(item["source"])), "awg-rule")
		}
		rule := amneziaPolicyRule{
			ID:        id,
			Name:      name,
			Type:      firstNonEmpty(strings.TrimSpace(cleanPayloadString(item, "type")), "field"),
			Domain:    stringList(item["domain"]),
			IP:        stringList(item["ip"]),
			Source:    stringList(item["source"]),
			Inbound:   stringList(item["inboundTag"]),
			Port:      strings.TrimSpace(cleanPayloadString(item, "port")),
			Network:   strings.TrimSpace(cleanPayloadString(item, "network")),
			Target:    amneziaPolicyTarget(cleanPayloadString(item, "target")),
			CreatedAt: firstNonEmpty(created[id], strings.TrimSpace(cleanPayloadString(item, "createdAt")), now),
			UpdatedAt: now,
		}
		if clean := strings.TrimSpace(cleanPayloadString(item, "updatedAt")); clean != "" {
			rule.UpdatedAt = clean
		}
		if amneziaPolicyRuleHasCondition(rule) {
			out = append(out, rule)
		}
	}
	return out
}

func normalizeAmneziaPolicyRules(rules []amneziaPolicyRule) []amneziaPolicyRule {
	out := []amneziaPolicyRule{}
	used := map[string]bool{}
	for _, rule := range rules {
		rule.ID = strings.TrimSpace(rule.ID)
		if invalidAmneziaProfileID(rule.ID) || used[rule.ID] {
			rule.ID = slugID(firstNonEmpty(rule.Name, strings.Join(rule.Domain, "-"), strings.Join(rule.IP, "-"), strings.Join(rule.Source, "-")), "awg-rule")
			for suffix := 2; used[rule.ID]; suffix++ {
				rule.ID = fmt.Sprintf("%s-%d", slugID(firstNonEmpty(rule.Name, "awg-rule"), "awg-rule"), suffix)
			}
		}
		rule.Type = firstNonEmpty(strings.TrimSpace(rule.Type), "field")
		rule.Target = amneziaPolicyTarget(rule.Target)
		rule.Domain = amneziaCleanValueList(rule.Domain)
		rule.IP = amneziaCleanValueList(rule.IP)
		rule.Source = amneziaCleanValueList(rule.Source)
		rule.Inbound = amneziaCleanValueList(rule.Inbound)
		rule.Port = strings.TrimSpace(rule.Port)
		rule.Network = strings.TrimSpace(rule.Network)
		if !amneziaPolicyRuleHasCondition(rule) {
			continue
		}
		used[rule.ID] = true
		out = append(out, rule)
	}
	return out
}

func amneziaCleanValueList(values []string) []string {
	out := []string{}
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" || containsString(out, value) {
			continue
		}
		out = append(out, value)
	}
	return out
}

func amneziaPolicyTarget(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "direct", "amnezia-direct", "bypass-xray", "awg-direct":
		return "bypass-xray"
	default:
		return "bypass-xray"
	}
}

func amneziaPolicyRuleHasCondition(rule amneziaPolicyRule) bool {
	return len(rule.Domain) > 0 ||
		len(rule.IP) > 0 ||
		len(rule.Source) > 0 ||
		len(rule.Inbound) > 0 ||
		rule.Port != "" ||
		rule.Network != ""
}

func (s *serverState) amneziaPreflight(payload map[string]any) map[string]any {
	raw := ""
	if value, ok := payload["config"]; ok {
		raw = strings.TrimSpace(fmt.Sprint(value))
	}
	if raw == "" {
		id := strings.TrimSpace(fmt.Sprint(payload["id"]))
		var ok bool
		raw, ok = s.loadAmneziaProfileConfig(id)
		if !ok {
			raw, _ = s.loadAmneziaProfileConfig("legacy")
		}
	}
	return map[string]any{"ok": true, "preflight": s.amneziaPreflightForConfig(raw)}
}

func (s *serverState) prepareAmnezia(payload map[string]any) map[string]any {
	preflight := s.amneziaPreflight(payload)
	return map[string]any{
		"ok":        true,
		"dryRun":    true,
		"preflight": preflight["preflight"],
		"message":   "Подготовка выполнена в режиме предварительной проверки. Интерфейсы, маршруты и firewall не изменялись.",
	}
}

func (s *serverState) amneziaPreflightForConfig(raw string) map[string]any {
	parsed := parseAmneziaClientConfig(raw)
	commands := amneziaCommandStatus()
	kernel := amneziaKernelStatus()
	glinet := amneziaGLInetStatus()
	userspace := amneziaUserspaceStatus()
	routing := amneziaRoutingStatus(amneziaInterfacesStatus())
	kernelReady := boolMap(commands, "awg") && (boolMap(kernel, "loaded") || boolMap(kernel, "installed") || boolMap(kernel, "moduleFile"))
	glinetReady := boolMap(glinet, "supportsNativeAmnezia") && boolMap(glinet, "nativeWireGuard")
	userspaceReady := boolMap(userspace, "available") && boolMap(userspace, "tunDevice") && boolMap(userspace, "awgSetconf")
	backendReady := kernelReady || glinetReady || userspaceReady
	keyWarnings := amneziaKeyWarnings(parsed)
	optionWarnings := amneziaAWGOptionWarnings(parsed)
	endpointHost, endpointPort := amneziaEndpointParts(fmt.Sprint(parsed.peer["endpoint"]))
	checks := []map[string]any{
		amneziaCheck("config", len(parsed.errors) == 0, "Клиентский конфиг", strings.Join(parsed.errors, " ")),
		amneziaCheck("backend", backendReady, "Backend запуска", amneziaBackendDetail(kernelReady, glinetReady, userspaceReady)),
		amneziaCheck("awg", boolMap(commands, "awg"), "Утилита awg", "Нужна для awg setconf и проверки интерфейса."),
		amneziaCheck("keys", len(keyWarnings) == 0, "Ключи WireGuard", strings.Join(keyWarnings, " ")),
		amneziaCheck("endpoint", endpointHost != "" && endpointPort != "", "Endpoint", "Нужен host:port, чтобы до policy routing закрепить маршрут к серверу через WAN."),
		amneziaCheck("defaultRoute", !boolMap(routing, "defaultViaTunnel"), "Default route", "Туннель не должен забирать весь роутер без явного выбора."),
		amneziaCheck("mtuMss", true, "MTU и TCPMSS", "Планируем MTU 1280 и MSS clamp, чтобы снизить риск зависаний на некоторых провайдерах."),
	}
	warnings := append([]string{}, parsed.warnings...)
	warnings = append(warnings, optionWarnings...)
	if boolMap(glinet, "nativeWireGuard") && !boolMap(glinet, "supportsNativeAmnezia") {
		warnings = append(warnings, "Найден GL.iNet WireGuard-клиент, но прошивка не подтверждает native AmneziaWG 2.0. Безопаснее raw awg после установки kmod.")
	}
	ok := true
	for _, check := range checks {
		if check["ok"] != true {
			ok = false
		}
	}
	return map[string]any{
		"ok":      ok,
		"backend": amneziaRecommendedBackend(kernelReady, glinetReady, userspaceReady, glinet),
		"backends": map[string]any{
			"kernel":       kernelReady,
			"glinetNative": glinetReady,
			"userspace":    userspaceReady,
		},
		"userspace": userspace,
		"checks":    checks,
		"warnings":  warnings,
		"plan": []string{
			"Сохранить профиль AmneziaWG отдельно от Xray.",
			"Закрепить endpoint сервера через текущий WAN до включения policy routing.",
			"Поднять awg-интерфейс через kernel, GL.iNet native или amneziawg-go.",
			"Применить awg setconf, адрес интерфейса, MTU 1280 и TCPMSS clamp.",
			"Подготовить отдельный route table 5200 и fwmark 0x5200.",
			"Помечать только выбранные правила RuOpenRay, не меняя default route всего роутера.",
			"После health-check откатить интерфейс, маршруты и nft-метки, если туннель не отвечает.",
		},
	}
}

func amneziaCheck(id string, ok bool, label string, detail string) map[string]any {
	return map[string]any{"id": id, "ok": ok, "label": label, "detail": detail}
}

func amneziaBackendDetail(kernelReady, glinetReady, userspaceReady bool) string {
	ready := []string{}
	if kernelReady {
		ready = append(ready, "raw kmod-amneziawg")
	}
	if glinetReady {
		ready = append(ready, "GL.iNet native")
	}
	if userspaceReady {
		ready = append(ready, "amneziawg-go userspace")
	}
	if len(ready) > 0 {
		return "Готово: " + strings.Join(ready, ", ") + "."
	}
	return "Нужен хотя бы один путь: kmod-amneziawg, GL.iNet native AmneziaWG или amneziawg-go + /dev/net/tun + awg."
}

func amneziaRecommendedBackend(kernelReady, glinetReady, userspaceReady bool, glinet map[string]any) string {
	switch {
	case glinetReady:
		return "glinet-native"
	case kernelReady:
		return "raw-awg"
	case userspaceReady:
		return "userspace-amneziawg-go"
	}
	if backend := strings.TrimSpace(fmt.Sprint(glinet["recommendedBackend"])); backend != "" && backend != "<nil>" {
		return backend
	}
	return "not-ready"
}

func amneziaKeyWarnings(parsed parsedAmneziaClientConfig) []string {
	warnings := []string{}
	iface := parsed.rawOptions["interface"]
	peer := parsed.rawOptions["peer"]
	if key := firstMapValueCI(iface, "PrivateKey"); key != "" && !amneziaLooksLikeWGKey(key) {
		warnings = append(warnings, "PrivateKey не похож на base64-ключ WireGuard.")
	}
	if key := firstMapValueCI(peer, "PublicKey"); key != "" && !amneziaLooksLikeWGKey(key) {
		warnings = append(warnings, "PublicKey не похож на base64-ключ WireGuard.")
	}
	if key := firstMapValueCI(peer, "PresharedKey"); key != "" && !amneziaLooksLikeWGKey(key) {
		warnings = append(warnings, "PresharedKey не похож на base64-ключ WireGuard.")
	}
	return warnings
}

func amneziaLooksLikeWGKey(value string) bool {
	value = strings.TrimSpace(value)
	if value == "" {
		return false
	}
	decoded, err := base64.StdEncoding.DecodeString(value)
	return err == nil && len(decoded) == 32
}

func amneziaAWGOptionWarnings(parsed parsedAmneziaClientConfig) []string {
	warnings := []string{}
	for _, section := range []string{"interface", "peer"} {
		for key, value := range parsed.rawOptions[section] {
			if !amneziaOptionLooksNumeric(key) {
				continue
			}
			if _, err := strconv.Atoi(strings.TrimSpace(value)); err != nil {
				warnings = append(warnings, fmt.Sprintf("%s=%s должен быть числом.", key, value))
			}
		}
	}
	return warnings
}

func amneziaOptionLooksNumeric(key string) bool {
	lower := strings.ToLower(strings.TrimSpace(key))
	if lower == "jc" || lower == "jmin" || lower == "jmax" {
		return true
	}
	if len(lower) == 2 && lower[0] == 's' && lower[1] >= '0' && lower[1] <= '9' {
		return true
	}
	return false
}

func amneziaEndpointParts(endpoint string) (string, string) {
	endpoint = strings.TrimSpace(endpoint)
	if endpoint == "" {
		return "", ""
	}
	host, port, err := net.SplitHostPort(endpoint)
	if err == nil {
		return strings.Trim(host, "[]"), port
	}
	idx := strings.LastIndex(endpoint, ":")
	if idx <= 0 || idx >= len(endpoint)-1 {
		return strings.Trim(endpoint, "[]"), ""
	}
	return strings.Trim(endpoint[:idx], "[]"), endpoint[idx+1:]
}

func firstMapValueCI(values map[string]string, key string) string {
	if values == nil {
		return ""
	}
	for gotKey, value := range values {
		if strings.EqualFold(gotKey, key) {
			return value
		}
	}
	return ""
}

func amneziaProfileID(name string) string {
	base := slugID(name, "amneziawg")
	if base == "" {
		base = "amneziawg"
	}
	return fmt.Sprintf("%s-%d", base, time.Now().UnixNano())
}

type parsedAmneziaClientConfig struct {
	iface              map[string]any
	peer               map[string]any
	awgOptions         []string
	obfuscationOptions []string
	rawOptions         map[string]map[string]string
	summary            string
	warnings           []string
	errors             []string
}

func parseAmneziaClientConfig(raw string) parsedAmneziaClientConfig {
	sections := map[string]map[string]string{}
	rawSections := map[string]map[string]string{}
	current := ""
	for _, line := range strings.Split(raw, "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") || strings.HasPrefix(line, ";") {
			continue
		}
		if strings.HasPrefix(line, "[") && strings.Contains(line, "]") {
			current = strings.ToLower(strings.TrimSpace(strings.TrimSuffix(strings.TrimPrefix(line, "["), "]")))
			if sections[current] == nil {
				sections[current] = map[string]string{}
			}
			if rawSections[current] == nil {
				rawSections[current] = map[string]string{}
			}
			continue
		}
		if current == "" || !strings.Contains(line, "=") {
			continue
		}
		parts := strings.SplitN(line, "=", 2)
		rawKey := strings.TrimSpace(parts[0])
		key := strings.ToLower(rawKey)
		value := strings.TrimSpace(parts[1])
		if key != "" {
			sections[current][key] = value
			rawSections[current][rawKey] = value
		}
	}
	iface := sections["interface"]
	peer := sections["peer"]
	parsed := parsedAmneziaClientConfig{
		iface: map[string]any{
			"address":       iface["address"],
			"dns":           iface["dns"],
			"mtu":           iface["mtu"],
			"hasPrivateKey": iface["privatekey"] != "",
		},
		peer: map[string]any{
			"endpoint":        peer["endpoint"],
			"allowedIPs":      peer["allowedips"],
			"persistentKeep":  peer["persistentkeepalive"],
			"hasPublicKey":    peer["publickey"] != "",
			"hasPresharedKey": peer["presharedkey"] != "",
		},
		rawOptions: map[string]map[string]string{
			"interface": rawSections["interface"],
			"peer":      rawSections["peer"],
		},
	}
	if len(iface) == 0 {
		parsed.errors = append(parsed.errors, "Нет секции [Interface].")
	}
	if len(peer) == 0 {
		parsed.errors = append(parsed.errors, "Нет секции [Peer].")
	}
	if iface["privatekey"] == "" {
		parsed.errors = append(parsed.errors, "В [Interface] нет PrivateKey.")
	}
	if iface["address"] == "" {
		parsed.errors = append(parsed.errors, "В [Interface] нет Address.")
	}
	if peer["publickey"] == "" {
		parsed.errors = append(parsed.errors, "В [Peer] нет PublicKey.")
	}
	if peer["endpoint"] == "" {
		parsed.errors = append(parsed.errors, "В [Peer] нет Endpoint.")
	}
	awgOptions := amneziaObfuscationKeys(rawSections)
	parsed.obfuscationOptions = awgOptions
	parsed.awgOptions = awgOptions
	if len(parsed.awgOptions) == 0 {
		parsed.warnings = append(parsed.warnings, "AWG-параметры обфускации не найдены. Возможно, это обычный WireGuard-конфиг.")
	}
	if len(parsed.awgOptions) > 0 && !amneziaHasCoreAWGJunkOptions(parsed.awgOptions) {
		parsed.warnings = append(parsed.warnings, "Найдены нестандартные параметры, но нет Jc/Jmin/Jmax. Проверьте, что это полный AmneziaWG 2.0 конфиг.")
	}
	if amneziaHasSpacingSensitiveOptions(parsed.awgOptions) {
		for _, section := range rawSections {
			for key, value := range section {
				if strings.HasPrefix(strings.ToLower(key), "h") && strings.Contains(value, " - ") {
					parsed.warnings = append(parsed.warnings, "В H-параметрах есть пробелы вокруг дефиса. Некоторые клиенты AmneziaWG ожидают формат без пробелов.")
					break
				}
			}
		}
	}
	endpoint := peer["endpoint"]
	address := iface["address"]
	switch {
	case endpoint != "" && address != "":
		parsed.summary = fmt.Sprintf("%s → %s", address, endpoint)
	case endpoint != "":
		parsed.summary = endpoint
	case address != "":
		parsed.summary = address
	default:
		parsed.summary = "конфиг сохранен"
	}
	return parsed
}

func amneziaObfuscationKeys(sections map[string]map[string]string) []string {
	known := map[string]bool{
		"address":             true,
		"allowedips":          true,
		"dns":                 true,
		"endpoint":            true,
		"listenport":          true,
		"mtu":                 true,
		"persistentkeepalive": true,
		"postdown":            true,
		"postup":              true,
		"predown":             true,
		"presharedkey":        true,
		"preup":               true,
		"privatekey":          true,
		"publickey":           true,
		"table":               true,
	}
	seen := map[string]bool{}
	out := []string{}
	for _, sectionName := range []string{"interface", "peer"} {
		for key := range sections[sectionName] {
			lower := strings.ToLower(strings.TrimSpace(key))
			if lower == "" || known[lower] || seen[lower] {
				continue
			}
			seen[lower] = true
			out = append(out, key)
		}
	}
	sort.SliceStable(out, func(i, j int) bool {
		return strings.ToLower(out[i]) < strings.ToLower(out[j])
	})
	return out
}

func amneziaHasCoreAWGJunkOptions(keys []string) bool {
	need := map[string]bool{"jc": false, "jmin": false, "jmax": false}
	for _, key := range keys {
		lower := strings.ToLower(key)
		if _, ok := need[lower]; ok {
			need[lower] = true
		}
	}
	return need["jc"] && need["jmin"] && need["jmax"]
}

func amneziaHasSpacingSensitiveOptions(keys []string) bool {
	for _, key := range keys {
		lower := strings.ToLower(key)
		if strings.HasPrefix(lower, "h") || strings.HasPrefix(lower, "s") || strings.HasPrefix(lower, "i") {
			return true
		}
	}
	return false
}

func fileModTimeRFC3339(path string) string {
	info, err := os.Stat(path)
	if err != nil {
		return ""
	}
	return info.ModTime().Format(time.RFC3339)
}

func amneziaInterfacesStatus() []map[string]any {
	out := []map[string]any{}
	if commandExists("ip") {
		link := runTimeout(3*time.Second, "ip", "-o", "link", "show")
		for _, item := range parseIPLinkInterfaces(fmt.Sprint(link["stdout"])) {
			if !amneziaInterfaceNameLooksRelevant(item["name"].(string)) {
				continue
			}
			out = append(out, amneziaInterfaceDetails(item["name"].(string), item))
		}
	}
	if len(out) == 0 {
		for _, iface := range amneziaNetInterfaces() {
			out = append(out, iface)
		}
	}
	sort.SliceStable(out, func(i, j int) bool {
		return fmt.Sprint(out[i]["name"]) < fmt.Sprint(out[j]["name"])
	})
	return out
}

func amneziaInterfaceDetails(name string, link map[string]any) map[string]any {
	item := map[string]any{
		"name":    name,
		"running": boolMap(link, "up"),
		"state":   fmt.Sprint(link["state"]),
		"kind":    amneziaInterfaceKind(name),
	}
	if commandExists("ip") {
		addr := runTimeout(3*time.Second, "ip", "-o", "addr", "show", "dev", name)
		item["addresses"] = parseIPAddrAddresses(fmt.Sprint(addr["stdout"]))
		route := runTimeout(3*time.Second, "ip", "route", "show", "dev", name)
		item["routes"] = firstLines(fmt.Sprint(route["stdout"]), 6)
	}
	return item
}

func amneziaNetInterfaces() []map[string]any {
	ifaces, err := net.Interfaces()
	if err != nil {
		return nil
	}
	out := []map[string]any{}
	for _, iface := range ifaces {
		if !amneziaInterfaceNameLooksRelevant(iface.Name) {
			continue
		}
		addresses := []string{}
		if addrs, err := iface.Addrs(); err == nil {
			for _, addr := range addrs {
				addresses = append(addresses, addr.String())
			}
		}
		out = append(out, map[string]any{
			"name":      iface.Name,
			"running":   iface.Flags&net.FlagUp != 0,
			"state":     iface.Flags.String(),
			"kind":      amneziaInterfaceKind(iface.Name),
			"addresses": addresses,
		})
	}
	return out
}

func amneziaServicesStatus() map[string]any {
	candidates := []string{
		"/etc/init.d/amneziawg",
		"/etc/init.d/awg",
		"/etc/init.d/wireguard",
		"/etc/init.d/wg-quick",
	}
	items := []map[string]any{}
	found := false
	running := false
	for _, path := range candidates {
		if !fileExists(path) {
			continue
		}
		status := runTimeout(3*time.Second, path, "status")
		text := concatCommandOutput(status)
		isRunning := amneziaServiceStatusTextRunning(text)
		items = append(items, map[string]any{
			"path":    path,
			"running": isRunning,
			"status":  status,
		})
		found = true
		running = running || isRunning
	}
	return map[string]any{"found": found, "running": running, "items": items}
}

func amneziaWGStatus() map[string]any {
	result := map[string]any{"available": false, "hasPeer": false, "interfaces": []string{}}
	command := ""
	switch {
	case commandExists("awg"):
		command = "awg"
	case commandExists("wg"):
		command = "wg"
	default:
		return result
	}
	show := runTimeout(4*time.Second, command, "show")
	text := strings.TrimSpace(fmt.Sprint(show["stdout"]))
	result["available"] = true
	result["command"] = command
	result["ok"] = show["ok"]
	result["interfaces"] = parseWGShowInterfaces(text)
	result["hasPeer"] = strings.Contains(text, "peer:")
	result["summary"] = firstLines(text, 18)
	if show["ok"] != true {
		result["stderr"] = concatCommandOutput(show)
	}
	return result
}

func amneziaRoutingStatus(interfaces []map[string]any) map[string]any {
	result := map[string]any{
		"available":        commandExists("ip"),
		"ipRule":           false,
		"defaultViaTunnel": false,
		"table":            amneziaRouteTable,
		"mark":             amneziaFwMark,
	}
	if !commandExists("ip") {
		return result
	}
	names := amneziaInterfaceNames(interfaces)
	rules := runTimeout(3*time.Second, "ip", "rule", "show")
	rulesText := strings.ToLower(fmt.Sprint(rules["stdout"]))
	result["rules"] = firstLines(fmt.Sprint(rules["stdout"]), 12)
	result["ipRule"] = strings.Contains(rulesText, "lookup "+strings.ToLower(amneziaRouteTable)) ||
		strings.Contains(rulesText, strings.ToLower(amneziaRouteTableName)) ||
		strings.Contains(rulesText, strings.ToLower(amneziaFwMark))
	mainRoute := runTimeout(3*time.Second, "ip", "route", "show", "default")
	mainText := strings.TrimSpace(fmt.Sprint(mainRoute["stdout"]))
	result["defaultRoute"] = mainText
	for _, name := range names {
		if strings.Contains(mainText, " dev "+name) || strings.Contains(mainText, "dev "+name+" ") {
			result["defaultViaTunnel"] = true
			break
		}
	}
	tableRoute := runTimeout(3*time.Second, "ip", "route", "show", "table", amneziaRouteTable)
	plannedTableRoute := strings.TrimSpace(fmt.Sprint(tableRoute["stdout"]))
	if strings.EqualFold(plannedTableRoute, "Dump terminated") {
		plannedTableRoute = ""
	}
	result["plannedTableRoute"] = plannedTableRoute
	return result
}

func amneziaConfigStatus() map[string]any {
	candidates := []string{
		"/etc/config/amneziawg",
		"/etc/config/wireguard",
		"/etc/amnezia/amneziawg.conf",
		"/etc/amnezia/awg.conf",
		"/etc/wireguard/awg0.conf",
		"/etc/wireguard/wg0.conf",
	}
	paths := []string{}
	for _, path := range candidates {
		if fileExists(path) {
			paths = append(paths, path)
		}
	}
	return map[string]any{"found": len(paths) > 0, "paths": paths}
}

func amneziaCommandStatus() map[string]any {
	return map[string]any{
		"awg":     commandExists("awg"),
		"wg":      commandExists("wg"),
		"wgQuick": commandExists("wg-quick"),
		"ip":      commandExists("ip"),
		"nft":     commandExists("nft"),
	}
}

func amneziaUserspaceStatus() map[string]any {
	command, commandSource := amneziaUserspaceCommand()
	result := map[string]any{
		"available":      command != "",
		"command":        command,
		"commandSource":  commandSource,
		"tunDevice":      false,
		"tunModule":      false,
		"canCreateTun":   false,
		"awgSetconf":     commandExists("awg"),
		"recommendedMTU": "1280",
		"routeTable":     amneziaRouteTable,
		"mark":           amneziaFwMark,
		"rollback": []string{
			"Удалить ip rule/fwmark для таблицы AmneziaWG.",
			"Очистить route table 5200 и endpoint route.",
			"Удалить awg-интерфейс или остановить amneziawg-go.",
			"Откатить временные nft-правила и MSS clamp.",
		},
	}
	if runtime.GOOS == "windows" {
		return result
	}
	if fileExists("/dev/net/tun") {
		result["tunDevice"] = true
	}
	if commandExists("modprobe") || commandExists("mknod") {
		result["canCreateTun"] = true
	}
	loaded := runTimeout(3*time.Second, "sh", "-c", "lsmod 2>/dev/null | grep -E '^tun\\b' || true")
	if strings.TrimSpace(fmt.Sprint(loaded["stdout"])) != "" {
		result["tunModule"] = true
		result["tunLsmod"] = firstLines(fmt.Sprint(loaded["stdout"]), 3)
	}
	if commandExists("opkg") {
		pkg := runTimeout(3*time.Second, "sh", "-c", "opkg list-installed 2>/dev/null | grep -E '^kmod-tun ' || true")
		if text := strings.TrimSpace(fmt.Sprint(pkg["stdout"])); text != "" {
			result["tunModule"] = true
			result["tunPackage"] = text
		}
	}
	if command != "" {
		result["summary"] = "userspace backend найден"
	} else {
		result["summary"] = "amneziawg-go не найден"
	}
	return result
}

func amneziaUserspaceCommand() (string, string) {
	if commandExists("amneziawg-go") {
		return "amneziawg-go", "PATH"
	}
	for _, path := range []string{
		"/usr/bin/amneziawg-go",
		"/usr/sbin/amneziawg-go",
		"/opt/bin/amneziawg-go",
		"/etc/ruopenray-ui/amneziawg-go",
	} {
		if fileExists(path) {
			return path, "file"
		}
	}
	return "", ""
}

func amneziaKernelStatus() map[string]any {
	result := map[string]any{
		"installed":  false,
		"loaded":     false,
		"moduleFile": false,
		"package":    "",
	}
	if commandExists("opkg") {
		status := runTimeout(3*time.Second, "sh", "-c", "opkg list-installed 2>/dev/null | grep -E '^kmod-amneziawg ' || true")
		text := strings.TrimSpace(fmt.Sprint(status["stdout"]))
		if text != "" {
			result["installed"] = true
			result["package"] = text
		}
	}
	loaded := runTimeout(3*time.Second, "sh", "-c", "lsmod 2>/dev/null | grep -Ei '(^|_)amnezia|(^|_)awg' || true")
	if strings.TrimSpace(fmt.Sprint(loaded["stdout"])) != "" {
		result["loaded"] = true
		result["lsmod"] = firstLines(fmt.Sprint(loaded["stdout"]), 4)
	}
	module := runTimeout(3*time.Second, "sh", "-c", "find /lib/modules/$(uname -r) -iname '*amnezia*' -o -iname '*awg*' 2>/dev/null | head -5")
	if strings.TrimSpace(fmt.Sprint(module["stdout"])) != "" {
		result["moduleFile"] = true
		result["files"] = firstLines(fmt.Sprint(module["stdout"]), 5)
	}
	return result
}

func amneziaGLInetStatus() map[string]any {
	result := map[string]any{
		"found":                  false,
		"version":                "",
		"supportsNativeAmnezia":  false,
		"nativeWireGuard":        false,
		"nativeAmneziaLikely":    false,
		"vpnClientService":       false,
		"recommendedBackend":     "raw-awg",
		"recommendedBackendNote": "RuOpenRay сохранит client.conf и будет готовить свой awg-интерфейс после установки совместимого kmod-amneziawg.",
		"warnings":               []string{},
	}
	version := firstReadableFileLine("/etc/glversion", "/etc/glinet_version", "/etc/glinet_release")
	if version != "" {
		result["found"] = true
		result["version"] = version
		result["supportsNativeAmnezia"] = versionAtLeast(version, 4, 9)
	}
	if fileExists("/etc/init.d/vpn-client") {
		result["found"] = true
		result["vpnClientService"] = true
		status := runTimeout(3*time.Second, "/etc/init.d/vpn-client", "status")
		result["vpnClientRunning"] = amneziaServiceStatusTextRunning(concatCommandOutput(status))
	}
	if commandExists("uci") {
		network := runTimeout(3*time.Second, "sh", "-c", "uci show network 2>/dev/null | grep -Ei 'wgclient|amnezia|gl_vpn_rules' || true")
		firewall := runTimeout(3*time.Second, "sh", "-c", "uci show firewall 2>/dev/null | grep -Ei 'wgclient|amnezia|gl_vpn_rules' || true")
		networkText := strings.TrimSpace(fmt.Sprint(network["stdout"]))
		firewallText := strings.TrimSpace(fmt.Sprint(firewall["stdout"]))
		if networkText != "" || firewallText != "" {
			result["found"] = true
		}
		result["network"] = firstLines(networkText, 20)
		result["firewall"] = firstLines(firewallText, 12)
		result["nativeWireGuard"] = strings.Contains(networkText, ".proto='wgclient'") || strings.Contains(networkText, `.proto="wgclient"`)
		result["disabled"] = strings.Contains(networkText, ".disabled='1'") || strings.Contains(networkText, `.disabled="1"`)
	}
	if commandExists("opkg") {
		packages := runTimeout(3*time.Second, "sh", "-c", "opkg list-installed 2>/dev/null | grep -Ei 'gl-sdk4-(ui-)?(vpn|wireguard|amnezia)|amneziawg|wireguard' | head -30 || true")
		packageText := strings.TrimSpace(fmt.Sprint(packages["stdout"]))
		result["packages"] = firstLines(packageText, 30)
		if packageText != "" {
			result["found"] = true
		}
		if strings.Contains(strings.ToLower(packageText), "amnezia") {
			result["nativeAmneziaLikely"] = true
		}
	}
	if boolMap(result, "supportsNativeAmnezia") && boolMap(result, "nativeWireGuard") {
		result["recommendedBackend"] = "glinet-native"
		result["recommendedBackendNote"] = "На GL.iNet 4.9+ лучше использовать родной VPN-клиент как backend туннеля, а RuOpenRay пусть управляет только маршрутизацией выбранного трафика."
	} else if boolMap(result, "nativeWireGuard") {
		result["recommendedBackend"] = "glinet-wireguard"
		result["recommendedBackendNote"] = "Найден GL.iNet WireGuard-клиент. Для AmneziaWG 2.0 нативный режим обычно нужен на GL.iNet 4.9+, иначе безопаснее raw awg с совместимым kmod."
	}
	return result
}

func amneziaWarnings(status map[string]any) []string {
	warnings := []string{}
	routing, _ := status["routing"].(map[string]any)
	if boolMap(routing, "defaultViaTunnel") {
		warnings = append(warnings, "AmneziaWG сейчас похож на глобальный default route. Для раздельной маршрутизации лучше отключить автозахват всего трафика и дать RuOpenRay управлять mark/ip rule.")
	}
	kernel, _ := status["kernel"].(map[string]any)
	commands, _ := status["commands"].(map[string]any)
	if boolMap(commands, "awg") && !boolMap(kernel, "installed") && !boolMap(kernel, "moduleFile") {
		warnings = append(warnings, "Утилита awg найдена, но kmod-amneziawg для текущего ядра не установлен. Конфиг можно сохранить, но туннель не поднимется до установки совместимого kernel module.")
	}
	if status["available"] == true && len(amneziaInterfaceNames(status["interfaces"])) == 0 {
		warnings = append(warnings, "Конфиги или команды AmneziaWG найдены, но активный awg/wg интерфейс не обнаружен.")
	}
	return warnings
}

func parseIPLinkInterfaces(text string) []map[string]any {
	out := []map[string]any{}
	for _, line := range strings.Split(text, "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		parts := strings.SplitN(line, ":", 3)
		if len(parts) < 2 {
			continue
		}
		name := strings.TrimSpace(parts[1])
		if at := strings.Index(name, "@"); at >= 0 {
			name = name[:at]
		}
		lower := strings.ToLower(line)
		state := ""
		if idx := strings.Index(lower, " state "); idx >= 0 {
			stateFields := strings.Fields(line[idx+7:])
			if len(stateFields) > 0 {
				state = stateFields[0]
			}
		}
		out = append(out, map[string]any{
			"name":  name,
			"up":    strings.Contains(line, "<") && strings.Contains(strings.SplitN(line, ">", 2)[0], "UP"),
			"state": state,
		})
	}
	return out
}

func parseIPAddrAddresses(text string) []string {
	out := []string{}
	for _, line := range strings.Split(text, "\n") {
		fields := strings.Fields(line)
		for i, field := range fields {
			if (field == "inet" || field == "inet6") && i+1 < len(fields) {
				out = append(out, fields[i+1])
			}
		}
	}
	return out
}

func parseWGShowInterfaces(text string) []string {
	seen := map[string]bool{}
	out := []string{}
	for _, line := range strings.Split(text, "\n") {
		line = strings.TrimSpace(line)
		if !strings.HasPrefix(line, "interface:") {
			continue
		}
		name := strings.TrimSpace(strings.TrimPrefix(line, "interface:"))
		if name != "" && !seen[name] {
			seen[name] = true
			out = append(out, name)
		}
	}
	return out
}

func amneziaInterfaceNames(value any) []string {
	items, _ := value.([]map[string]any)
	if items == nil {
		raw, _ := value.([]any)
		for _, item := range raw {
			if m, ok := item.(map[string]any); ok {
				items = append(items, m)
			}
		}
	}
	out := []string{}
	seen := map[string]bool{}
	for _, item := range items {
		name := strings.TrimSpace(fmt.Sprint(item["name"]))
		if name != "" && name != "<nil>" && !seen[name] {
			seen[name] = true
			out = append(out, name)
		}
	}
	return out
}

func amneziaRunningInterfaceNames(value any) []string {
	items, _ := value.([]map[string]any)
	if items == nil {
		raw, _ := value.([]any)
		for _, item := range raw {
			if m, ok := item.(map[string]any); ok {
				items = append(items, m)
			}
		}
	}
	out := []string{}
	for _, item := range items {
		if boolMap(item, "running") {
			out = append(out, strings.TrimSpace(fmt.Sprint(item["name"])))
		}
	}
	return out
}

func amneziaPrimaryInterface(value any) string {
	names := amneziaRunningInterfaceNames(value)
	if len(names) == 0 {
		names = amneziaInterfaceNames(value)
	}
	if len(names) == 0 {
		return ""
	}
	return names[0]
}

func amneziaInterfaceNameLooksRelevant(name string) bool {
	lower := strings.ToLower(strings.TrimSpace(name))
	return strings.HasPrefix(lower, "awg") ||
		strings.HasPrefix(lower, "wg") ||
		strings.Contains(lower, "amnezia")
}

func amneziaInterfaceKind(name string) string {
	lower := strings.ToLower(name)
	if strings.HasPrefix(lower, "awg") || strings.Contains(lower, "amnezia") {
		return "AmneziaWG"
	}
	return "WireGuard"
}

func amneziaServiceStatusTextRunning(text string) bool {
	lower := strings.ToLower(text)
	if strings.Contains(lower, "inactive") || strings.Contains(lower, "stopped") || strings.Contains(lower, "not running") {
		return false
	}
	return strings.Contains(lower, "running") || strings.Contains(lower, "started") || strings.Contains(lower, " active")
}

func firstReadableFileLine(paths ...string) string {
	for _, path := range paths {
		body, err := os.ReadFile(path)
		if err != nil {
			continue
		}
		for _, line := range strings.Split(string(body), "\n") {
			line = strings.TrimSpace(line)
			if line != "" {
				return line
			}
		}
	}
	return ""
}

func versionAtLeast(version string, major int, minor int) bool {
	parts := strings.SplitN(version, "-", 2)
	num := strings.Split(parts[0], ".")
	if len(num) < 2 {
		return false
	}
	gotMajor, err := strconv.Atoi(num[0])
	if err != nil {
		return false
	}
	gotMinor, err := strconv.Atoi(num[1])
	if err != nil {
		return false
	}
	if gotMajor != major {
		return gotMajor > major
	}
	return gotMinor >= minor
}

func firstLines(text string, limit int) []string {
	out := []string{}
	for _, line := range strings.Split(text, "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		out = append(out, line)
		if len(out) >= limit {
			break
		}
	}
	return out
}
