package main

import (
	"crypto/rand"
	"encoding/json"
	"fmt"
	rxraystats "github.com/AceAsket/RuOpenRay/internal/xraystats"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"
)

const (
	serverModeConfigVersion = 1
	serverModeManagedSource = "server-mode"
	serverModeTagPrefix     = "ruopenray-server-"
	serverModeBlockTag      = "ruopenray-server-deny"
)

type serverModeConfig struct {
	Version        int                     `json:"version"`
	Enabled        bool                    `json:"enabled"`
	MonitorClients bool                    `json:"monitorClients"`
	Xray           []serverModeXrayInbound `json:"xray"`
	AWG            []serverModeAWGServer   `json:"awg"`
	UpdatedAt      string                  `json:"updatedAt,omitempty"`
}

type serverModeXrayInbound struct {
	ID           string             `json:"id"`
	Name         string             `json:"name"`
	Enabled      bool               `json:"enabled"`
	Listen       string             `json:"listen"`
	PublicHost   string             `json:"publicHost,omitempty"`
	Port         int                `json:"port"`
	Protocol     string             `json:"protocol"`
	Network      string             `json:"network"`
	Security     string             `json:"security"`
	Reality      serverModeReality  `json:"reality"`
	Clients      []serverModeClient `json:"clients"`
	Sniffing     bool               `json:"sniffing"`
	OpenFirewall bool               `json:"openFirewall"`
}

type serverModeReality struct {
	Dest        string   `json:"dest"`
	ServerNames []string `json:"serverNames"`
	PrivateKey  string   `json:"privateKey"`
	PublicKey   string   `json:"publicKey,omitempty"`
	ShortIDs    []string `json:"shortIds"`
}

type serverModeClient struct {
	ID             string `json:"id"`
	Name           string `json:"name"`
	UUID           string `json:"uuid"`
	Email          string `json:"email"`
	Enabled        bool   `json:"enabled"`
	EgressTag      string `json:"egressTag"`
	Level          int    `json:"level"`
	Flow           string `json:"flow"`
	AllowLAN       bool   `json:"allowLan"`
	AllowRouter    bool   `json:"allowRouter"`
	AllowDNS       bool   `json:"allowDns"`
	FallbackPolicy string `json:"fallbackPolicy"`
}

type serverModeAWGServer struct {
	ID           string                 `json:"id"`
	Name         string                 `json:"name"`
	Enabled      bool                   `json:"enabled"`
	Interface    string                 `json:"interface"`
	ListenPort   int                    `json:"listenPort"`
	AddressCIDR  string                 `json:"addressCidr"`
	PrivateKey   string                 `json:"privateKey,omitempty"`
	PublicKey    string                 `json:"publicKey,omitempty"`
	MTU          int                    `json:"mtu,omitempty"`
	EgressTag    string                 `json:"egressTag"`
	AllowLAN     bool                   `json:"allowLan"`
	OpenFirewall bool                   `json:"openFirewall"`
	Peers        []serverModeAWGPeer    `json:"peers"`
	Advanced     map[string]interface{} `json:"advanced,omitempty"`
}

type serverModeAWGPeer struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	PublicKey    string `json:"publicKey"`
	AllowedIPs   string `json:"allowedIps"`
	PresharedKey string `json:"presharedKey,omitempty"`
	Enabled      bool   `json:"enabled"`
}

type serverModeIssue struct {
	Severity string `json:"severity"`
	Title    string `json:"title"`
	Detail   string `json:"detail,omitempty"`
	Source   string `json:"source,omitempty"`
}

func (s *serverState) serverModeConfigPath() string {
	return filepath.Join(s.cfg.DataDir, "server-mode.json")
}

func defaultServerModeConfig() serverModeConfig {
	return serverModeConfig{
		Version:        serverModeConfigVersion,
		Enabled:        false,
		MonitorClients: true,
		Xray:           []serverModeXrayInbound{},
		AWG:            []serverModeAWGServer{},
	}
}

func (s *serverState) loadServerModeConfig() (serverModeConfig, error) {
	cfg := defaultServerModeConfig()
	body, err := os.ReadFile(s.serverModeConfigPath())
	if os.IsNotExist(err) {
		return cfg, nil
	}
	if err != nil {
		return cfg, err
	}
	if err := json.Unmarshal(body, &cfg); err != nil {
		return cfg, err
	}
	return normalizeServerModeConfig(cfg), nil
}

func (s *serverState) saveServerModeConfig(cfg serverModeConfig) error {
	cfg = normalizeServerModeConfig(cfg)
	cfg.UpdatedAt = time.Now().Format(time.RFC3339)
	body, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	if err := os.MkdirAll(s.cfg.DataDir, 0o755); err != nil {
		return err
	}
	return os.WriteFile(s.serverModeConfigPath(), body, 0o600)
}

func normalizeServerModeConfig(cfg serverModeConfig) serverModeConfig {
	if cfg.Version == 0 {
		cfg.MonitorClients = true
	}
	cfg.Version = serverModeConfigVersion
	for i := range cfg.Xray {
		in := &cfg.Xray[i]
		in.ID = serverModeSlug(firstNonEmpty(in.ID, in.Name, fmt.Sprintf("xray-%d", i+1)))
		if in.Name == "" {
			in.Name = fmt.Sprintf("Xray вход %d", i+1)
		}
		if strings.TrimSpace(in.Listen) == "" {
			in.Listen = "0.0.0.0"
		}
		in.PublicHost = strings.TrimSpace(in.PublicHost)
		if in.Port == 0 {
			in.Port = 443
		}
		in.Protocol = strings.ToLower(strings.TrimSpace(firstNonEmpty(in.Protocol, "vless")))
		in.Network = strings.ToLower(strings.TrimSpace(firstNonEmpty(in.Network, "tcp")))
		in.Security = strings.ToLower(strings.TrimSpace(firstNonEmpty(in.Security, "reality")))
		in.Reality.Dest = strings.TrimSpace(in.Reality.Dest)
		in.Reality.PrivateKey = strings.TrimSpace(in.Reality.PrivateKey)
		in.Reality.PublicKey = strings.TrimSpace(in.Reality.PublicKey)
		in.Reality.ServerNames = cleanStringSet(in.Reality.ServerNames)
		in.Reality.ShortIDs = cleanStringSet(in.Reality.ShortIDs)
		for j := range in.Clients {
			client := &in.Clients[j]
			client.ID = serverModeSlug(firstNonEmpty(client.ID, client.Name, fmt.Sprintf("client-%d", j+1)))
			if client.Name == "" {
				client.Name = fmt.Sprintf("Клиент %d", j+1)
			}
			client.UUID = strings.TrimSpace(client.UUID)
			client.Email = serverModeClientEmail(in.ID, client.ID, client.Email)
			client.EgressTag = strings.TrimSpace(firstNonEmpty(client.EgressTag, "direct"))
			client.Flow = strings.TrimSpace(client.Flow)
			client.FallbackPolicy = strings.TrimSpace(client.FallbackPolicy)
		}
	}
	for i := range cfg.AWG {
		awg := &cfg.AWG[i]
		awg.ID = serverModeSlug(firstNonEmpty(awg.ID, awg.Name, fmt.Sprintf("awg-%d", i+1)))
		if awg.Name == "" {
			awg.Name = fmt.Sprintf("AmneziaWG вход %d", i+1)
		}
		if awg.ListenPort == 0 {
			awg.ListenPort = 51820
		}
		if awg.Interface == "" {
			awg.Interface = "awg-server0"
		}
		if awg.AddressCIDR == "" {
			awg.AddressCIDR = "10.70.0.1/24"
		}
		awg.PrivateKey = strings.TrimSpace(awg.PrivateKey)
		awg.PublicKey = strings.TrimSpace(awg.PublicKey)
		awg.EgressTag = strings.TrimSpace(firstNonEmpty(awg.EgressTag, "direct"))
		for j := range awg.Peers {
			peer := &awg.Peers[j]
			peer.ID = serverModeSlug(firstNonEmpty(peer.ID, peer.Name, fmt.Sprintf("peer-%d", j+1)))
			if peer.Name == "" {
				peer.Name = fmt.Sprintf("Клиент %d", j+1)
			}
			peer.PublicKey = strings.TrimSpace(peer.PublicKey)
			peer.AllowedIPs = strings.TrimSpace(firstNonEmpty(peer.AllowedIPs, fmt.Sprintf("10.70.0.%d/32", j+2)))
			peer.PresharedKey = strings.TrimSpace(peer.PresharedKey)
		}
	}
	return cfg
}

func cleanStringSet(values []string) []string {
	seen := map[string]bool{}
	out := []string{}
	for _, value := range values {
		clean := strings.TrimSpace(value)
		if clean == "" || seen[clean] {
			continue
		}
		seen[clean] = true
		out = append(out, clean)
	}
	return out
}

var serverModeSlugReplace = regexp.MustCompile(`[^a-zA-Z0-9_-]+`)

func serverModeSlug(value string) string {
	clean := strings.ToLower(strings.TrimSpace(value))
	clean = strings.ReplaceAll(clean, " ", "-")
	clean = serverModeSlugReplace.ReplaceAllString(clean, "-")
	clean = strings.Trim(clean, "-_")
	if clean == "" {
		return "item"
	}
	if len(clean) > 48 {
		clean = clean[:48]
		clean = strings.Trim(clean, "-_")
	}
	return clean
}

func serverModeClientEmail(inboundID, clientID, email string) string {
	clean := strings.TrimSpace(email)
	if clean != "" && clean != "<nil>" {
		return clean
	}
	return serverModeTagPrefix + serverModeSlug(inboundID) + "-" + serverModeSlug(clientID)
}

func serverModeInboundTag(inboundID string) string {
	return serverModeTagPrefix + "xray-" + serverModeSlug(inboundID)
}

func serverModeFromPayload(payload map[string]any) (serverModeConfig, error) {
	raw := any(payload)
	if value, ok := payload["config"]; ok && value != nil {
		raw = value
	}
	body, err := json.Marshal(raw)
	if err != nil {
		return defaultServerModeConfig(), err
	}
	cfg := defaultServerModeConfig()
	if len(body) > 0 && string(body) != "null" {
		if err := json.Unmarshal(body, &cfg); err != nil {
			return cfg, err
		}
	}
	return normalizeServerModeConfig(cfg), nil
}

func (s *serverState) serverModeReport() map[string]any {
	mode, err := s.loadServerModeConfig()
	if err != nil {
		return map[string]any{"ok": false, "error": err.Error(), "config": defaultServerModeConfig()}
	}
	active, activeErr := s.readActiveConfig()
	report := map[string]any{
		"ok":      activeErr == nil,
		"config":  mode,
		"summary": serverModeSummary(mode),
		"awgPlan": s.serverModeAWGPlan(mode),
	}
	if activeErr != nil {
		report["error"] = activeErr.Error()
		report["preflight"] = serverModePreflight(mode, nil)
		return report
	}
	report["outbounds"] = serverModeOutboundSummaries(active)
	report["preflight"] = serverModePreflight(mode, active)
	report["managed"] = serverModeManagedSummary(active)
	report["firewall"] = s.serverModeFirewallStatus()
	report["security"] = serverModeSecurityReport(mode)
	if mode.MonitorClients {
		stats := s.xrayTrafficStats(active, false)
		report["xrayStats"] = stats
		report["clients"] = serverModeClientTraffic(mode, stats)
	}
	return report
}

func serverModeSummary(mode serverModeConfig) map[string]any {
	enabledXray := 0
	enabledClients := 0
	enabledAWG := 0
	enabledPeers := 0
	for _, inbound := range mode.Xray {
		if !inbound.Enabled {
			continue
		}
		enabledXray++
		for _, client := range inbound.Clients {
			if client.Enabled {
				enabledClients++
			}
		}
	}
	for _, awg := range mode.AWG {
		if !awg.Enabled {
			continue
		}
		enabledAWG++
		for _, peer := range awg.Peers {
			if peer.Enabled {
				enabledPeers++
			}
		}
	}
	return map[string]any{
		"enabled":        mode.Enabled,
		"monitorClients": mode.MonitorClients,
		"xray":           len(mode.Xray),
		"xrayEnabled":    enabledXray,
		"xrayClients":    enabledClients,
		"awg":            len(mode.AWG),
		"awgEnabled":     enabledAWG,
		"awgPeers":       enabledPeers,
		"updatedAt":      mode.UpdatedAt,
		"configVersion":  mode.Version,
		"managedPrefix":  serverModeTagPrefix,
		"managedBlock":   serverModeBlockTag,
	}
}

func serverModeClientTraffic(mode serverModeConfig, stats map[string]any) []map[string]any {
	usersByEmail := map[string]map[string]any{}
	switch users := stats["users"].(type) {
	case []map[string]any:
		for _, user := range users {
			email := strings.TrimSpace(fmt.Sprint(user["email"]))
			if email != "" && email != "<nil>" {
				usersByEmail[email] = user
			}
		}
	case []any:
		for _, item := range users {
			user := mapValue(item)
			email := strings.TrimSpace(fmt.Sprint(user["email"]))
			if email != "" && email != "<nil>" {
				usersByEmail[email] = user
			}
		}
	}
	statsEnabled := stats["enabled"] == true
	out := []map[string]any{}
	for _, inbound := range mode.Xray {
		for _, client := range inbound.Clients {
			user := usersByEmail[client.Email]
			status := "статистика выключена"
			if statsEnabled {
				status = "ждем трафик"
				if numberAny(user["uplink"])+numberAny(user["downlink"]) > 0 {
					status = "есть трафик"
				}
			}
			out = append(out, map[string]any{
				"inboundId":   inbound.ID,
				"inboundName": inbound.Name,
				"clientId":    client.ID,
				"name":        client.Name,
				"email":       client.Email,
				"enabled":     client.Enabled,
				"egressTag":   client.EgressTag,
				"allowLan":    client.AllowLAN,
				"allowRouter": client.AllowRouter,
				"allowDns":    client.AllowDNS,
				"downlink":    numberAny(user["downlink"]),
				"uplink":      numberAny(user["uplink"]),
				"downRate":    serverModeFloat(user["downRate"]),
				"upRate":      serverModeFloat(user["upRate"]),
				"status":      status,
			})
		}
	}
	return out
}

func serverModeFloat(value any) float64 {
	var out float64
	if _, err := fmt.Sscanf(fmt.Sprint(value), "%f", &out); err != nil {
		return 0
	}
	return out
}

func (s *serverState) saveServerMode(payload map[string]any) map[string]any {
	mode, err := serverModeFromPayload(payload)
	if err != nil {
		return map[string]any{"ok": false, "error": err.Error()}
	}
	if err := s.saveServerModeConfig(mode); err != nil {
		return map[string]any{"ok": false, "error": err.Error()}
	}
	return s.serverModeReport()
}

func (s *serverState) serverModeNewClient(payload map[string]any) map[string]any {
	inboundID := serverModeSlug(firstNonEmpty(cleanPayloadString(payload, "inboundId"), "xray"))
	clientID := serverModeSlug(firstNonEmpty(cleanPayloadString(payload, "id"), cleanPayloadString(payload, "name"), "client-"+time.Now().Format("150405")))
	client := serverModeClient{
		ID:        clientID,
		Name:      firstNonEmpty(cleanPayloadString(payload, "name"), "Новый клиент"),
		UUID:      randomUUIDString(),
		Email:     serverModeClientEmail(inboundID, clientID, cleanPayloadString(payload, "email")),
		Enabled:   true,
		EgressTag: firstNonEmpty(cleanPayloadString(payload, "egressTag"), "direct"),
		Level:     number(payload["level"], 0),
		Flow:      strings.TrimSpace(cleanPayloadString(payload, "flow")),
	}
	return map[string]any{"ok": true, "client": client}
}

func randomUUIDString() string {
	buf := make([]byte, 16)
	if _, err := rand.Read(buf); err != nil {
		raw := randomToken()
		if len(raw) < 32 {
			raw += strings.Repeat("0", 32-len(raw))
		}
		return fmt.Sprintf("%s-%s-4%s-8%s-%s", raw[:8], raw[8:12], raw[13:16], raw[17:20], raw[20:32])
	}
	buf[6] = (buf[6] & 0x0f) | 0x40
	buf[8] = (buf[8] & 0x3f) | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", buf[0:4], buf[4:6], buf[6:8], buf[8:10], buf[10:16])
}

func (s *serverState) serverModeRealityKey() map[string]any {
	result := s.runXray("x25519")
	if result["ok"] != true {
		return result
	}
	stdout := fmt.Sprint(result["stdout"])
	privateKey := ""
	publicKey := ""
	for _, line := range strings.Split(stdout, "\n") {
		clean := strings.TrimSpace(line)
		index := strings.Index(clean, ":")
		if index < 0 || index+1 >= len(clean) {
			continue
		}
		value := strings.TrimSpace(clean[index+1:])
		switch {
		case strings.HasPrefix(strings.ToLower(clean), "private"):
			privateKey = value
		case strings.HasPrefix(strings.ToLower(clean), "public"):
			publicKey = value
		}
	}
	result["privateKey"] = privateKey
	result["publicKey"] = publicKey
	return result
}

func (s *serverState) serverModePreview(payload map[string]any) map[string]any {
	mode, err := s.serverModePayloadOrStored(payload)
	if err != nil {
		return map[string]any{"ok": false, "error": err.Error()}
	}
	active, err := s.readActiveConfig()
	if err != nil {
		return map[string]any{"ok": false, "error": err.Error(), "config": mode}
	}
	preflight := serverModePreflight(mode, active)
	patched := serverModePatchConfig(active, mode)
	test := s.validateConfigWithGeoAudit(patched)
	return map[string]any{
		"ok":        preflight["ok"] == true && test["ok"] == true,
		"config":    mode,
		"preflight": preflight,
		"test":      test,
		"summary":   serverModeManagedSummary(patched),
		"xray":      patched,
		"awgPlan":   s.serverModeAWGPlan(mode),
	}
}

func (s *serverState) serverModeApply(payload map[string]any) map[string]any {
	mode, err := s.serverModePayloadOrStored(payload)
	if err != nil {
		return map[string]any{"ok": false, "error": err.Error()}
	}
	active, err := s.readActiveConfig()
	if err != nil {
		return map[string]any{"ok": false, "error": err.Error(), "config": mode}
	}
	preflight := serverModePreflight(mode, active)
	if preflight["ok"] != true {
		return map[string]any{"ok": false, "preflight": preflight, "config": mode}
	}
	patched := serverModePatchConfig(active, mode)
	test := s.validateConfigWithGeoAudit(patched)
	if test["ok"] != true {
		return map[string]any{"ok": false, "preflight": preflight, "test": test, "config": mode}
	}
	if err := s.saveServerModeConfig(mode); err != nil {
		return map[string]any{"ok": false, "error": err.Error(), "preflight": preflight, "test": test}
	}
	backup, err := s.backupActive("config-before-server-mode")
	if err != nil {
		return map[string]any{"ok": false, "error": err.Error(), "preflight": preflight, "test": test}
	}
	if err := s.writeActiveConfig(patched); err != nil {
		return map[string]any{"ok": false, "error": err.Error(), "backup": backup, "preflight": preflight, "test": test}
	}
	profileName, profileErr := s.syncCurrentProfile(patched)
	result := map[string]any{
		"ok":        profileErr == nil,
		"backup":    backup,
		"preflight": preflight,
		"test":      test,
		"profile":   profileName,
		"summary":   serverModeManagedSummary(patched),
		"restart":   map[string]any{"ok": true, "skipped": true, "message": "Xray не перезапускался. Примените перезапуск отдельно, когда будете готовы."},
	}
	if profileErr != nil {
		result["error"] = profileErr.Error()
		return result
	}
	if boolPayload(payload, "restart", false) {
		restart := s.serviceAction("restart")
		result["restart"] = restart
		result["ok"] = restart["ok"] == true
	}
	_ = s.clearConfigDraft()
	return result
}

func (s *serverState) serverModePayloadOrStored(payload map[string]any) (serverModeConfig, error) {
	if value, ok := payload["config"]; ok && value != nil {
		return serverModeFromPayload(map[string]any{"config": value})
	}
	return s.loadServerModeConfig()
}

func serverModePatchConfig(active map[string]any, mode serverModeConfig) map[string]any {
	cfg := cloneJSONMap(active)
	serverModeStripManaged(cfg)
	if mode.MonitorClients {
		rxraystats.EnsureConfig(cfg, true)
	}
	if !mode.Enabled {
		return cfg
	}
	inbounds := anySlice(cfg["inbounds"])
	outbounds := anySlice(cfg["outbounds"])
	routing := mapValue(cfg["routing"])
	existingRules := anySlice(routing["rules"])
	newRules := []any{}
	needsBlock := false
	routerIPs := serverModeRouterIPs()

	for _, inbound := range mode.Xray {
		if !inbound.Enabled {
			continue
		}
		clients := []any{}
		for _, client := range inbound.Clients {
			if !client.Enabled {
				continue
			}
			xClient := map[string]any{
				"id":    client.UUID,
				"email": client.Email,
				"level": client.Level,
			}
			if client.Flow != "" {
				xClient["flow"] = client.Flow
			}
			clients = append(clients, xClient)
			user := []any{client.Email}
			inboundTag := []any{serverModeInboundTag(inbound.ID)}
			if !client.AllowDNS {
				needsBlock = true
				newRules = append(newRules, map[string]any{"type": "field", "inboundTag": inboundTag, "user": user, "port": "53", "outboundTag": serverModeBlockTag})
			}
			if client.AllowRouter && !client.AllowLAN && len(routerIPs) > 0 {
				newRules = append(newRules, map[string]any{"type": "field", "inboundTag": inboundTag, "user": user, "ip": stringsToAny(routerIPs), "outboundTag": "direct"})
			}
			if !client.AllowLAN {
				needsBlock = true
				newRules = append(newRules, map[string]any{"type": "field", "inboundTag": inboundTag, "user": user, "ip": []any{"geoip:private"}, "outboundTag": serverModeBlockTag})
			}
			newRules = append(newRules, map[string]any{"type": "field", "inboundTag": inboundTag, "user": user, "outboundTag": client.EgressTag})
		}
		stream := map[string]any{"network": inbound.Network}
		switch inbound.Security {
		case "reality":
			stream["security"] = "reality"
			stream["realitySettings"] = map[string]any{
				"show":        false,
				"dest":        inbound.Reality.Dest,
				"serverNames": stringsToAny(inbound.Reality.ServerNames),
				"privateKey":  inbound.Reality.PrivateKey,
				"shortIds":    stringsToAny(inbound.Reality.ShortIDs),
			}
		case "tls":
			stream["security"] = "tls"
		default:
			stream["security"] = "none"
		}
		xInbound := map[string]any{
			"tag":      serverModeInboundTag(inbound.ID),
			"listen":   inbound.Listen,
			"port":     inbound.Port,
			"protocol": inbound.Protocol,
			"settings": map[string]any{
				"clients":    clients,
				"decryption": "none",
			},
			"streamSettings": stream,
		}
		if inbound.Sniffing {
			xInbound["sniffing"] = map[string]any{
				"enabled":      true,
				"destOverride": []any{"http", "tls", "quic"},
				"routeOnly":    true,
			}
		}
		inbounds = append(inbounds, xInbound)
	}
	if needsBlock {
		outbounds = append(outbounds, map[string]any{"tag": serverModeBlockTag, "protocol": "blackhole"})
	}
	routing["rules"] = append(newRules, existingRules...)
	cfg["routing"] = routing
	cfg["inbounds"] = inbounds
	cfg["outbounds"] = outbounds
	return cfg
}

func serverModeRouterIPs() []string {
	router := strings.TrimSpace(routerLANAddress())
	if router == "" || router == "<nil>" {
		return nil
	}
	return []string{router}
}

func cloneJSONMap(value map[string]any) map[string]any {
	body, err := json.Marshal(value)
	if err != nil {
		return map[string]any{}
	}
	var out map[string]any
	if err := json.Unmarshal(body, &out); err != nil {
		return map[string]any{}
	}
	return out
}

func stringsToAny(values []string) []any {
	out := make([]any, 0, len(values))
	for _, value := range values {
		out = append(out, value)
	}
	return out
}

func serverModeStripManaged(cfg map[string]any) {
	filteredInbounds := []any{}
	for _, item := range anySlice(cfg["inbounds"]) {
		object := mapValue(item)
		if serverModeManagedTag(fmt.Sprint(object["tag"])) {
			continue
		}
		filteredInbounds = append(filteredInbounds, item)
	}
	cfg["inbounds"] = filteredInbounds

	filteredOutbounds := []any{}
	for _, item := range anySlice(cfg["outbounds"]) {
		object := mapValue(item)
		tag := fmt.Sprint(object["tag"])
		if serverModeManagedTag(tag) || tag == serverModeBlockTag {
			continue
		}
		filteredOutbounds = append(filteredOutbounds, item)
	}
	cfg["outbounds"] = filteredOutbounds

	routing := mapValue(cfg["routing"])
	filteredRules := []any{}
	for _, item := range anySlice(routing["rules"]) {
		if serverModeRuleManaged(mapValue(item)) {
			continue
		}
		filteredRules = append(filteredRules, item)
	}
	routing["rules"] = filteredRules
	cfg["routing"] = routing
}

func serverModeManagedTag(tag string) bool {
	return strings.HasPrefix(strings.TrimSpace(tag), serverModeTagPrefix)
}

func serverModeRuleManaged(rule map[string]any) bool {
	if serverModeManagedTag(fmt.Sprint(rule["outboundTag"])) || fmt.Sprint(rule["outboundTag"]) == serverModeBlockTag {
		return true
	}
	for _, value := range stringList(rule["inboundTag"]) {
		if serverModeManagedTag(value) {
			return true
		}
	}
	for _, value := range stringList(rule["user"]) {
		if serverModeManagedTag(value) {
			return true
		}
	}
	return false
}

func serverModePreflight(mode serverModeConfig, active map[string]any) map[string]any {
	mode = normalizeServerModeConfig(mode)
	errors := []serverModeIssue{}
	warnings := []serverModeIssue{}
	if active == nil {
		errors = append(errors, serverModeIssue{Severity: "error", Title: "Активный Xray config не загружен", Detail: "RuOpenRay не может проверить порты, outbounds и итоговый config."})
		return serverModePreflightPayload(errors, warnings, mode)
	}
	if !mode.Enabled {
		warnings = append(warnings, serverModeIssue{Severity: "warning", Title: "Серверный режим выключен", Detail: "При применении RuOpenRay уберет только ранее созданные managed-входы server-mode."})
		return serverModePreflightPayload(errors, warnings, mode)
	}
	outbounds := serverModeOutboundTagSet(active)
	ports := serverModeExistingPorts(active)
	seenPorts := map[string]string{}
	for _, inbound := range mode.Xray {
		if !inbound.Enabled {
			continue
		}
		source := "xray:" + inbound.ID
		if inbound.Protocol != "vless" {
			errors = append(errors, serverModeIssue{Severity: "error", Title: "Неподдерживаемый Xray protocol", Detail: "Сейчас серверный вход безопасно генерируется только для VLESS.", Source: source})
		}
		if inbound.Network != "tcp" {
			errors = append(errors, serverModeIssue{Severity: "error", Title: "Неподдерживаемая сеть входа", Detail: "Сейчас server-mode генерирует TCP-входы. UDP/QUIC для входящих клиентов лучше вести отдельной схемой.", Source: source})
		}
		if inbound.Port < 1 || inbound.Port > 65535 {
			errors = append(errors, serverModeIssue{Severity: "error", Title: "Некорректный порт входа", Detail: fmt.Sprintf("Порт %d вне диапазона 1-65535.", inbound.Port), Source: source})
		}
		portKey := strings.TrimSpace(inbound.Listen) + ":" + fmt.Sprint(inbound.Port)
		if owner := ports[portKey]; owner != "" {
			errors = append(errors, serverModeIssue{Severity: "error", Title: "Порт уже занят в Xray config", Detail: fmt.Sprintf("%s уже использует %s.", owner, portKey), Source: source})
		}
		if owner := seenPorts[portKey]; owner != "" {
			errors = append(errors, serverModeIssue{Severity: "error", Title: "Дублирующийся порт server-mode", Detail: fmt.Sprintf("%s и %s используют %s.", owner, inbound.ID, portKey), Source: source})
		}
		seenPorts[portKey] = inbound.ID
		if serverModeExposedListen(inbound.Listen) {
			warnings = append(warnings, serverModeIssue{Severity: "warning", Title: "Вход слушает внешний адрес", Detail: "Проверьте firewall: открывайте только нужный порт и не давайте клиентам лишний доступ к LAN.", Source: source})
		}
		switch inbound.Security {
		case "reality":
			if strings.TrimSpace(inbound.Reality.PrivateKey) == "" {
				errors = append(errors, serverModeIssue{Severity: "error", Title: "Reality privateKey не задан", Detail: "Сгенерируйте пару ключей Xray x25519 и сохраните privateKey во входе.", Source: source})
			}
			if strings.TrimSpace(inbound.Reality.Dest) == "" {
				errors = append(errors, serverModeIssue{Severity: "error", Title: "Reality dest не задан", Detail: "Укажите внешний сайт и порт, например www.microsoft.com:443.", Source: source})
			}
			if len(inbound.Reality.ServerNames) == 0 {
				errors = append(errors, serverModeIssue{Severity: "error", Title: "Reality serverName не задан", Detail: "Добавьте хотя бы одно имя, которое соответствует выбранному dest.", Source: source})
			}
		case "tls":
			warnings = append(warnings, serverModeIssue{Severity: "warning", Title: "TLS-вход требует сертификатов", Detail: "RuOpenRay пока не выпускает и не подключает сертификат автоматически.", Source: source})
		case "none":
			if serverModeExposedListen(inbound.Listen) {
				errors = append(errors, serverModeIssue{Severity: "error", Title: "Незашифрованный вход нельзя открывать наружу", Detail: "Для WAN используйте Reality/TLS. None допустим только для локальных тестов.", Source: source})
			}
		default:
			errors = append(errors, serverModeIssue{Severity: "error", Title: "Неподдерживаемая безопасность входа", Detail: "Поддерживаются reality, tls и none.", Source: source})
		}
		enabledClients := 0
		for _, client := range inbound.Clients {
			if !client.Enabled {
				continue
			}
			enabledClients++
			clientSource := source + "/client:" + client.ID
			if strings.TrimSpace(client.UUID) == "" {
				errors = append(errors, serverModeIssue{Severity: "error", Title: "У клиента нет UUID", Detail: "Сгенерируйте UUID перед применением.", Source: clientSource})
			}
			if strings.TrimSpace(client.Email) == "" {
				errors = append(errors, serverModeIssue{Severity: "error", Title: "У клиента нет email/user", Detail: "Xray routing использует user/email для политики доступа.", Source: clientSource})
			}
			if strings.TrimSpace(client.EgressTag) == "" {
				errors = append(errors, serverModeIssue{Severity: "error", Title: "Не выбран выход для клиента", Detail: "Выберите proxy/direct/block или другой outbound.", Source: clientSource})
			} else if !outbounds[client.EgressTag] {
				errors = append(errors, serverModeIssue{Severity: "error", Title: "Выход клиента не найден", Detail: fmt.Sprintf("Outbound %q отсутствует в активном Xray config.", client.EgressTag), Source: clientSource})
			}
			if client.AllowLAN {
				warnings = append(warnings, serverModeIssue{Severity: "warning", Title: "Клиенту разрешен LAN", Detail: "Такой клиент сможет ходить в приватные сети через роутер. Это удобно для себя, но опасно для внешних пользователей.", Source: clientSource})
			}
			if client.AllowRouter && !client.AllowLAN {
				warnings = append(warnings, serverModeIssue{Severity: "warning", Title: "Клиенту разрешен только роутер", Detail: "RuOpenRay добавит direct-исключение для LAN-адреса роутера, остальные приватные адреса останутся заблокированы.", Source: clientSource})
			}
		}
		if enabledClients == 0 {
			errors = append(errors, serverModeIssue{Severity: "error", Title: "Нет активных клиентов", Detail: "Включите хотя бы одного клиента или выключите вход.", Source: source})
		}
		if inbound.OpenFirewall {
			warnings = append(warnings, serverModeIssue{Severity: "warning", Title: "WAN firewall открывается отдельно", Detail: "Сейчас RuOpenRay готовит Xray-вход и показывает предупреждение. Открытие WAN-порта будет отдельным подтверждаемым действием.", Source: source})
		}
	}
	for _, awg := range mode.AWG {
		if !awg.Enabled {
			continue
		}
		source := "awg:" + awg.ID
		if awg.ListenPort < 1 || awg.ListenPort > 65535 {
			errors = append(errors, serverModeIssue{Severity: "error", Title: "Некорректный порт AWG", Detail: fmt.Sprintf("Порт %d вне диапазона 1-65535.", awg.ListenPort), Source: source})
		}
		if !outbounds[awg.EgressTag] {
			errors = append(errors, serverModeIssue{Severity: "error", Title: "Выход AWG не найден", Detail: fmt.Sprintf("Outbound %q отсутствует в активном Xray config.", awg.EgressTag), Source: source})
		}
		if strings.TrimSpace(awg.PrivateKey) == "" {
			warnings = append(warnings, serverModeIssue{Severity: "warning", Title: "AWG privateKey не задан", Detail: "Для запуска серверного AWG понадобится приватный ключ интерфейса. Сейчас схема только сохраняется и проверяется.", Source: source})
		}
		if len(awg.Peers) == 0 {
			warnings = append(warnings, serverModeIssue{Severity: "warning", Title: "Нет AWG peers", Detail: "Добавьте хотя бы одного peer с publicKey и отдельным Allowed IP.", Source: source})
		}
		if awg.AllowLAN {
			warnings = append(warnings, serverModeIssue{Severity: "warning", Title: "AWG peers получат LAN", Detail: "Такой режим должен быть включен только для доверенных клиентов; по умолчанию LAN лучше закрывать.", Source: source})
		}
		if awg.OpenFirewall {
			warnings = append(warnings, serverModeIssue{Severity: "warning", Title: "WAN firewall для AWG открывается отдельно", Detail: "UDP-порт AWG нельзя открывать скрыто вместе с сохранением схемы; нужен отдельный подтверждаемый шаг.", Source: source})
		}
		for _, peer := range awg.Peers {
			if !peer.Enabled {
				continue
			}
			peerSource := source + "/peer:" + peer.ID
			if strings.TrimSpace(peer.PublicKey) == "" {
				warnings = append(warnings, serverModeIssue{Severity: "warning", Title: "У AWG peer нет publicKey", Detail: "Peer нельзя будет подключить без публичного ключа клиента.", Source: peerSource})
			}
			if strings.TrimSpace(peer.AllowedIPs) == "" {
				warnings = append(warnings, serverModeIssue{Severity: "warning", Title: "У AWG peer нет Allowed IPs", Detail: "Укажите отдельный адрес клиента, например 10.70.0.2/32.", Source: peerSource})
			}
		}
		warnings = append(warnings, serverModeIssue{Severity: "warning", Title: "AWG server-mode пока не применяет интерфейс", Detail: "Настройки сохраняются и валидируются; запуск серверного AWG будет отдельным системным шагом, чтобы не смешивать его с Xray config.", Source: source})
	}
	return serverModePreflightPayload(errors, warnings, mode)
}

func serverModePreflightPayload(errors, warnings []serverModeIssue, mode serverModeConfig) map[string]any {
	return map[string]any{
		"ok":       len(errors) == 0,
		"errors":   errors,
		"warnings": warnings,
		"summary":  serverModeSummary(mode),
	}
}

func serverModeExposedListen(listen string) bool {
	clean := strings.TrimSpace(listen)
	return clean == "" || clean == "0.0.0.0" || clean == "::" || clean == "[::]"
}

func serverModeOutboundTagSet(cfg map[string]any) map[string]bool {
	tags := map[string]bool{"direct": true, "block": true}
	for _, item := range anySlice(cfg["outbounds"]) {
		tag := strings.TrimSpace(fmt.Sprint(mapValue(item)["tag"]))
		if tag != "" && tag != "<nil>" {
			tags[tag] = true
		}
	}
	return tags
}

func serverModeOutboundSummaries(cfg map[string]any) []map[string]any {
	out := []map[string]any{}
	for _, item := range anySlice(cfg["outbounds"]) {
		object := mapValue(item)
		tag := strings.TrimSpace(fmt.Sprint(object["tag"]))
		if tag == "" || tag == "<nil>" || serverModeManagedTag(tag) || tag == serverModeBlockTag {
			continue
		}
		out = append(out, map[string]any{"tag": tag, "protocol": strings.TrimSpace(fmt.Sprint(object["protocol"]))})
	}
	sort.Slice(out, func(i, j int) bool { return fmt.Sprint(out[i]["tag"]) < fmt.Sprint(out[j]["tag"]) })
	return out
}

func serverModeExistingPorts(cfg map[string]any) map[string]string {
	ports := map[string]string{}
	for _, item := range anySlice(cfg["inbounds"]) {
		object := mapValue(item)
		tag := strings.TrimSpace(fmt.Sprint(object["tag"]))
		if tag == "" || serverModeManagedTag(tag) {
			continue
		}
		listen := strings.TrimSpace(fmt.Sprint(object["listen"]))
		port := number(object["port"], 0)
		if port == 0 {
			continue
		}
		ports[listen+":"+fmt.Sprint(port)] = firstNonEmpty(tag, "inbound")
	}
	return ports
}

func serverModeManagedSummary(cfg map[string]any) map[string]any {
	inbounds := 0
	outbounds := 0
	rules := 0
	clients := 0
	for _, item := range anySlice(cfg["inbounds"]) {
		object := mapValue(item)
		if !serverModeManagedTag(fmt.Sprint(object["tag"])) {
			continue
		}
		inbounds++
		settings := mapValue(object["settings"])
		clients += len(anySlice(settings["clients"]))
	}
	for _, item := range anySlice(cfg["outbounds"]) {
		tag := fmt.Sprint(mapValue(item)["tag"])
		if serverModeManagedTag(tag) || tag == serverModeBlockTag {
			outbounds++
		}
	}
	routing := mapValue(cfg["routing"])
	for _, item := range anySlice(routing["rules"]) {
		if serverModeRuleManaged(mapValue(item)) {
			rules++
		}
	}
	return map[string]any{"inbounds": inbounds, "clients": clients, "outbounds": outbounds, "routingRules": rules}
}
