package main

import (
	"fmt"
	"net"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"strconv"
	"strings"
	"time"

	rfw "github.com/AceAsket/RuOpenRay/internal/firewall"
)

const (
	ruOpenRayFirewallNftPath       = "/etc/ruopenray-ui/firewall.nft"
	ruOpenRayFirewallLegacyNftPath = "/etc/nftables.d/ruopenray.nft"
	ruOpenRayFirewallHotplugPath   = "/etc/hotplug.d/iface/90-ruopenray-tproxy"
	ruOpenRayFirewallEventPath     = "/etc/hotplug.d/firewall/90-ruopenray-tproxy"
	ruOpenRayKillSwitchDNSPath     = "/etc/ruopenray-ui/killswitch-dns-domains"
)

var killSwitchDomainPattern = regexp.MustCompile(`^[a-z0-9_.-]+(\.[a-z0-9_-]+)+$`)

func normalizeNftsetDomain(value string) (string, bool) {
	clean := strings.ToLower(strings.TrimSpace(value))
	clean = strings.Trim(clean, ` "'`)
	for _, prefix := range []string{"domain:", "full:"} {
		clean = strings.TrimPrefix(clean, prefix)
	}
	if strings.HasPrefix(clean, "geosite:") ||
		strings.HasPrefix(clean, "geoip:") ||
		strings.HasPrefix(clean, "regexp:") ||
		strings.HasPrefix(clean, "ext:") {
		return "", false
	}
	clean = strings.TrimPrefix(clean, "*.")
	clean = strings.Trim(clean, ".")
	if net.ParseIP(clean) != nil {
		return "", false
	}
	if clean == "" || !killSwitchDomainPattern.MatchString(clean) {
		return "", false
	}
	return clean, true
}

func sanitizeKillSwitchDomains(value any) []string {
	seen := map[string]bool{}
	out := []string{}
	for _, item := range stringList(value) {
		clean, ok := normalizeNftsetDomain(item)
		if !ok || seen[clean] {
			continue
		}
		seen[clean] = true
		out = append(out, clean)
	}
	return out
}

func killSwitchNftsetEntry(domain string) string {
	return "/" + domain + "/4#inet#ruopenray#killswitch4"
}

func dnsmasqNftsetValuesForSet(setName string) []string {
	if runtime.GOOS == "windows" || !commandExists("uci") {
		return []string{}
	}
	out := fmt.Sprint(runTimeout(5*time.Second, "uci", "-q", "get", "dhcp.@dnsmasq[0].nftset")["stdout"])
	values := []string{}
	marker := "#inet#ruopenray#" + setName
	for _, item := range strings.Fields(strings.ReplaceAll(out, "\n", " ")) {
		clean := strings.TrimSpace(item)
		if strings.Contains(clean, marker) {
			values = append(values, clean)
		}
	}
	return values
}

func domainFromNftsetEntry(entry string, setName string) string {
	if !strings.Contains(entry, "#inet#ruopenray#"+setName) {
		return ""
	}
	if !strings.HasPrefix(entry, "/") {
		return ""
	}
	parts := strings.Split(entry, "/")
	if len(parts) < 3 {
		return ""
	}
	return strings.TrimSpace(parts[1])
}

func killSwitchNftsetValues() []string {
	return dnsmasqNftsetValuesForSet("killswitch4")
}

func killSwitchDomainFromNftsetEntry(entry string) string {
	return domainFromNftsetEntry(entry, "killswitch4")
}

func killSwitchNftsetStatus() map[string]any {
	values := killSwitchNftsetValues()
	domains := []string{}
	for _, entry := range values {
		if domain := killSwitchDomainFromNftsetEntry(entry); domain != "" {
			domains = append(domains, domain)
		}
	}
	return map[string]any{
		"available": runtime.GOOS != "windows" && commandExists("uci"),
		"active":    len(values) > 0,
		"count":     len(values),
		"domains":   domains,
		"set":       "inet ruopenray killswitch4",
	}
}

func routeNftsetEntry(domain string, setName string) string {
	return "/" + domain + "/4#inet#ruopenray#" + setName
}

func routeNftsetStatus(setName string) map[string]any {
	values := dnsmasqNftsetValuesForSet(setName)
	domains := []string{}
	for _, entry := range values {
		if domain := domainFromNftsetEntry(entry, setName); domain != "" {
			domains = append(domains, domain)
		}
	}
	return map[string]any{
		"available": runtime.GOOS != "windows" && commandExists("uci"),
		"active":    len(values) > 0,
		"count":     len(values),
		"domains":   domains,
		"set":       "inet ruopenray " + setName,
	}
}

func killSwitchDNSBlockEntries(domains []string) []string {
	entries := []string{}
	for _, domain := range sanitizeKillSwitchDomains(domains) {
		entries = append(entries, "/"+domain+"/0.0.0.0", "/"+domain+"/::")
	}
	return entries
}

func readKillSwitchDNSBlockDomains() []string {
	body, err := os.ReadFile(ruOpenRayKillSwitchDNSPath)
	if err != nil {
		return []string{}
	}
	return sanitizeKillSwitchDomains(strings.Fields(strings.ReplaceAll(string(body), ",", "\n")))
}

func killSwitchDNSBlockStatus() map[string]any {
	domains := readKillSwitchDNSBlockDomains()
	return map[string]any{
		"available": runtime.GOOS != "windows" && commandExists("uci"),
		"active":    len(domains) > 0,
		"count":     len(domains),
		"domains":   domains,
		"path":      ruOpenRayKillSwitchDNSPath,
	}
}

func applyKillSwitchDNSBlock(domains []string, enabled bool) []map[string]any {
	if runtime.GOOS == "windows" || !commandExists("uci") {
		return []map[string]any{{"ok": true, "skipped": true, "message": "uci unavailable"}}
	}
	steps := []map[string]any{}
	previousDomains := readKillSwitchDNSBlockDomains()
	previousEntries := killSwitchDNSBlockEntries(previousDomains)
	nextDomains := []string{}
	if enabled {
		nextDomains = sanitizeKillSwitchDomains(domains)
	}
	nextEntries := killSwitchDNSBlockEntries(nextDomains)
	if sameStringSet(previousEntries, nextEntries) {
		return []map[string]any{{"ok": true, "unchanged": true, "message": "dnsmasq DNS block already matches"}}
	}
	for _, entry := range previousEntries {
		steps = append(steps, runTimeout(5*time.Second, "uci", "del_list", "dhcp.@dnsmasq[0].address="+entry))
	}
	for _, entry := range nextEntries {
		steps = append(steps, runTimeout(5*time.Second, "uci", "add_list", "dhcp.@dnsmasq[0].address="+entry))
	}
	if len(nextDomains) > 0 {
		if err := os.MkdirAll(filepath.Dir(ruOpenRayKillSwitchDNSPath), 0o755); err != nil {
			return append(steps, map[string]any{"ok": false, "stderr": err.Error()})
		}
		if err := writeFileAtomic(ruOpenRayKillSwitchDNSPath, []byte(strings.Join(nextDomains, "\n")+"\n"), 0o644); err != nil {
			return append(steps, map[string]any{"ok": false, "stderr": err.Error()})
		}
	} else {
		if err := os.Remove(ruOpenRayKillSwitchDNSPath); err != nil && !os.IsNotExist(err) {
			return append(steps, map[string]any{"ok": false, "stderr": err.Error()})
		}
	}
	steps = append(steps, runTimeout(5*time.Second, "uci", "commit", "dhcp"))
	if commandExists("/etc/init.d/dnsmasq") {
		steps = append(steps, runTimeout(15*time.Second, "/etc/init.d/dnsmasq", "restart"))
	}
	return steps
}

func applyKillSwitchDomainProtection(domains []string, enabled bool, mode string) []map[string]any {
	if mode == "nftset" {
		steps := applyKillSwitchDNSBlock(nil, false)
		return append(steps, applyKillSwitchNftsets(domains, enabled)...)
	}
	steps := applyKillSwitchNftsets(nil, false)
	return append(steps, applyKillSwitchDNSBlock(domains, enabled)...)
}

func applyKillSwitchNftsets(domains []string, enabled bool) []map[string]any {
	if runtime.GOOS == "windows" || !commandExists("uci") {
		return []map[string]any{{"ok": true, "skipped": true, "message": "uci unavailable"}}
	}
	steps := []map[string]any{}
	existing := killSwitchNftsetValues()
	desired := []string{}
	if enabled {
		for _, domain := range sanitizeKillSwitchDomains(domains) {
			desired = append(desired, killSwitchNftsetEntry(domain))
		}
	}
	if sameStringSet(existing, desired) {
		return []map[string]any{{"ok": true, "unchanged": true, "message": "dnsmasq nftset already matches"}}
	}
	for _, entry := range existing {
		steps = append(steps, runTimeout(5*time.Second, "uci", "del_list", "dhcp.@dnsmasq[0].nftset="+entry))
	}
	for _, entry := range desired {
		steps = append(steps, runTimeout(5*time.Second, "uci", "add_list", "dhcp.@dnsmasq[0].nftset="+entry))
	}
	steps = append(steps, runTimeout(5*time.Second, "uci", "commit", "dhcp"))
	if commandExists("/etc/init.d/dnsmasq") {
		steps = append(steps, runTimeout(15*time.Second, "/etc/init.d/dnsmasq", "restart"))
	}
	return steps
}

func applyRouteNftsets(setName string, domains []string, enabled bool) []map[string]any {
	if runtime.GOOS == "windows" || !commandExists("uci") {
		return []map[string]any{{"ok": true, "skipped": true, "message": "uci unavailable"}}
	}
	steps := []map[string]any{}
	existing := dnsmasqNftsetValuesForSet(setName)
	desired := []string{}
	if enabled {
		for _, domain := range sanitizeKillSwitchDomains(domains) {
			desired = append(desired, routeNftsetEntry(domain, setName))
		}
	}
	if sameStringSet(existing, desired) {
		return []map[string]any{{"ok": true, "unchanged": true, "message": "dnsmasq route nftset already matches"}}
	}
	for _, entry := range existing {
		steps = append(steps, runTimeout(5*time.Second, "uci", "del_list", "dhcp.@dnsmasq[0].nftset="+entry))
	}
	for _, entry := range desired {
		steps = append(steps, runTimeout(5*time.Second, "uci", "add_list", "dhcp.@dnsmasq[0].nftset="+entry))
	}
	steps = append(steps, runTimeout(5*time.Second, "uci", "commit", "dhcp"))
	if commandExists("/etc/init.d/dnsmasq") {
		steps = append(steps, runTimeout(15*time.Second, "/etc/init.d/dnsmasq", "restart"))
	}
	return steps
}

func applyRouteDomainNftsets(payload map[string]any, bypassMode string) []map[string]any {
	steps := []map[string]any{}
	steps = append(steps, applyRouteNftsets("bypass4", stringList(payload["directDomains"]), bypassMode == "bypass")...)
	steps = append(steps, applyRouteNftsets("proxy4", stringList(payload["proxyDomains"]), bypassMode == "redirect")...)
	steps = append(steps, applyRouteNftsets("amnezia4", stringList(payload["amneziaPolicyDomains"]), rfw.PayloadString(payload, "amneziaPolicyMark", "") != "")...)
	return steps
}

func sameStringSet(left, right []string) bool {
	if len(left) != len(right) {
		return false
	}
	seen := map[string]int{}
	for _, item := range left {
		seen[item]++
	}
	for _, item := range right {
		seen[item]--
		if seen[item] < 0 {
			return false
		}
	}
	return true
}

func (s *serverState) firewallStatus() map[string]any {
	nftExists := false
	nftBody := ""
	if body, err := os.ReadFile(ruOpenRayFirewallNftPath); err == nil {
		nftExists = true
		nftBody = string(body)
	}
	hotplugExists := false
	if _, err := os.Stat(ruOpenRayFirewallHotplugPath); err == nil {
		hotplugExists = true
	}
	nftActive := runTimeout(5*time.Second, "nft", "list", "table", "inet", "ruopenray")
	activeNftBody := fmt.Sprint(nftActive["stdout"])
	statusBody := nftBody
	if strings.TrimSpace(statusBody) == "" && strings.TrimSpace(activeNftBody) != "" {
		statusBody = activeNftBody
	}
	ipRules := runTimeout(5*time.Second, "ip", "rule", "show")
	ipRoutes := runTimeout(5*time.Second, "ip", "route", "show", "table", "100")
	ipRulesText := fmt.Sprint(ipRules["stdout"])
	ipRuleActive := (strings.Contains(ipRulesText, "fwmark 0x1/0x1") || strings.Contains(ipRulesText, "fwmark 0x1 ")) && strings.Contains(ipRulesText, "lookup 100")
	ipRouteActive := strings.Contains(fmt.Sprint(ipRoutes["stdout"]), "local") && strings.Contains(fmt.Sprint(ipRoutes["stdout"]), "dev lo")
	routerMode := "unknown"
	if strings.Contains(statusBody, " tproxy ") {
		routerMode = "tproxy"
	} else if strings.Contains(statusBody, " redirect ") {
		routerMode = "redirect"
	}
	meta := parseFirewallStatusMeta(statusBody)
	if value := strings.TrimSpace(fmt.Sprint(meta["routerMode"])); value != "" && value != "<nil>" {
		routerMode = value
	}
	status := map[string]any{
		"ok":          true,
		"available":   runtime.GOOS != "windows" && commandExists("nft"),
		"persistent":  nftExists,
		"active":      nftActive["ok"] == true,
		"nftPath":     ruOpenRayFirewallNftPath,
		"hotplugPath": ruOpenRayFirewallHotplugPath,
		"hotplug":     hotplugExists,
		"routerMode":  routerMode,
		"ipRule":      ipRuleActive,
		"ipRoute":     ipRouteActive,
		"nft":         nftActive,
		"ipRules":     ipRules,
		"ipRoutes":    ipRoutes,
		"tproxyModules": tproxyModuleStatus(func() string {
			if commandExists("apk") {
				return "apk"
			}
			if commandExists("opkg") {
				return "opkg"
			}
			return ""
		}()),
		"killSwitchNftset":    killSwitchNftsetStatus(),
		"killSwitchDNSBlock":  killSwitchDNSBlockStatus(),
		"directNftset":        routeNftsetStatus("bypass4"),
		"proxyNftset":         routeNftsetStatus("proxy4"),
		"amneziaPolicyNftset": routeNftsetStatus("amnezia4"),
		"needsPolicyFix":      routerMode == "tproxy" && (!ipRuleActive || !ipRouteActive || !hotplugExists),
	}
	for key, value := range meta {
		status[key] = value
	}
	return status
}

func parseFirewallStatusMeta(nftBody string) map[string]any {
	meta := map[string]any{}
	for _, line := range strings.Split(nftBody, "\n") {
		line = strings.TrimSpace(line)
		if !strings.HasPrefix(line, "# ruopenray-meta ") {
			continue
		}
		for _, field := range strings.Fields(strings.TrimPrefix(line, "# ruopenray-meta ")) {
			key, value, ok := strings.Cut(field, "=")
			if !ok {
				continue
			}
			switch key {
			case "blockQuic", "dnsIntercept", "killSwitch":
				meta[key] = value == "true"
			case "transparentPort":
				if port, err := strconv.Atoi(value); err == nil {
					meta[key] = port
				}
			case "ports", "devices", "killSwitchDevices", "killSwitchIps", "directIps", "proxyIps", "amneziaPolicyIps", "amneziaPolicyDomains", "routerBypassIps", "dnatReplyBypass", "directDomains", "proxyDomains":
				if value == "" {
					meta[key] = []string{}
				} else {
					meta[key] = strings.Split(value, ",")
				}
			case "amneziaPolicyMark":
				meta[key] = value
			case "killSwitchDomains":
				if value == "" {
					meta[key] = []string{}
				} else {
					meta[key] = strings.Split(value, ",")
				}
			case "killSwitchDomainMode":
				if value != "nftset" {
					value = "dns-block"
				}
				meta[key] = value
			case "killSwitchDeviceMode":
				if value != "selected" && value != "exclude" {
					value = "all"
				}
				meta[key] = value
			default:
				meta[key] = value
			}
		}
		return meta
	}
	if strings.Contains(nftBody, " tproxy ") {
		meta["routerMode"] = "tproxy"
	} else if strings.Contains(nftBody, " redirect ") {
		meta["routerMode"] = "redirect"
	}
	if strings.Contains(nftBody, "set bypass4") {
		meta["bypassMode"] = "bypass"
	} else if strings.Contains(nftBody, "set proxy4") {
		meta["bypassMode"] = "redirect"
	} else if nftBody != "" {
		meta["bypassMode"] = "off"
	}
	if strings.Contains(nftBody, "RuOpenRay DNS Intercept") {
		meta["dnsIntercept"] = true
	}
	if strings.Contains(nftBody, "RuOpenRay Block QUIC") {
		meta["blockQuic"] = true
	}
	if strings.Contains(nftBody, " ip saddr ") {
		if strings.Contains(nftBody, " ip saddr ") && strings.Contains(nftBody, " return") {
			meta["deviceMode"] = "exclude"
		}
		if strings.Contains(nftBody, `iifname "br-lan" ip saddr `) {
			meta["deviceMode"] = "selected"
		}
	} else if nftBody != "" {
		meta["deviceMode"] = "all"
	}
	if ports := parseFirewallPortsFromBody(nftBody); len(ports) > 0 {
		meta["portMode"] = "custom"
		meta["ports"] = ports
	} else if nftBody != "" {
		meta["portMode"] = "all"
		meta["ports"] = []string{}
	}
	if port := parseFirewallTransparentPort(nftBody); port > 0 {
		meta["transparentPort"] = port
	}
	return meta
}

func parseFirewallPortsFromBody(nftBody string) []string {
	for _, line := range strings.Split(nftBody, "\n") {
		if strings.Contains(line, "DNS Intercept") || strings.Contains(line, "Block QUIC") || strings.Contains(line, "Kill Switch") {
			continue
		}
		for _, marker := range []string{" th dport ", " tcp dport ", " udp dport "} {
			index := strings.Index(line, marker)
			if index < 0 {
				continue
			}
			rest := strings.TrimSpace(line[index+len(marker):])
			if strings.HasPrefix(rest, "{") {
				end := strings.Index(rest, "}")
				if end < 0 {
					continue
				}
				values := []string{}
				for _, item := range strings.Split(strings.Trim(rest[:end+1], "{} \t\r\n"), ",") {
					clean := strings.TrimSpace(item)
					if clean != "" {
						values = append(values, clean)
					}
				}
				return values
			}
			end := 0
			for end < len(rest) && ((rest[end] >= '0' && rest[end] <= '9') || rest[end] == '-') {
				end++
			}
			if end > 0 {
				return []string{rest[:end]}
			}
		}
	}
	return []string{}
}

func parseFirewallTransparentPort(nftBody string) int {
	index := strings.Index(nftBody, " to :")
	if index < 0 {
		return 0
	}
	rest := nftBody[index+5:]
	end := 0
	for end < len(rest) && rest[end] >= '0' && rest[end] <= '9' {
		end++
	}
	if end == 0 {
		return 0
	}
	port, _ := strconv.Atoi(rest[:end])
	return port
}

func (s *serverState) firewallSnapshot() map[string]any {
	status := s.firewallStatus()
	nftBody := ""
	if body, err := os.ReadFile(ruOpenRayFirewallNftPath); err == nil {
		nftBody = string(body)
	}
	hotplugBody := ""
	if body, err := os.ReadFile(ruOpenRayFirewallHotplugPath); err == nil {
		hotplugBody = string(body)
	}
	return map[string]any{
		"ok":          true,
		"status":      status,
		"nftBody":     nftBody,
		"hotplugBody": hotplugBody,
	}
}

func (s *serverState) previewFirewall(payload map[string]any) map[string]any {
	payload = s.expandFirewallGeoPayload(payload)
	body, meta := rfw.NativeNft(payload)
	return map[string]any{
		"ok":           true,
		"nft":          body,
		"meta":         meta,
		"geoExpansion": payload["geoExpansion"],
		"status":       s.firewallStatus(),
	}
}

func (s *serverState) applyFirewall(payload map[string]any) map[string]any {
	if runtime.GOOS == "windows" || !commandExists("nft") {
		return map[string]any{"ok": false, "available": false, "error": "nftables недоступен на этой системе"}
	}
	payload = s.expandFirewallGeoPayload(payload)
	body, meta := rfw.NativeNft(payload)
	preflight := s.firewallCompatibilityPreflight(payload, meta)
	if preflight["requiresConfirmation"] == true && !boolPayload(payload, firewallCompatibilityConfirmKey, false) {
		return map[string]any{
			"ok":                false,
			"needsConfirmation": true,
			"error":             fmt.Sprint(preflight["summary"]),
			"nft":               body,
			"meta":              meta,
			"geoExpansion":      payload["geoExpansion"],
			"preflight":         preflight,
			"status":            s.firewallStatus(),
		}
	}
	result := s.firewallCommit(body, rfw.HotplugScript(), meta)
	result["nft"], result["meta"], result["preflight"], result["geoExpansion"] = body, meta, preflight, payload["geoExpansion"]
	return result
}

func (s *serverState) restoreFirewallSnapshot(payload map[string]any) map[string]any {
	rawSnapshot := payload
	if nested, ok := payload["snapshot"].(map[string]any); ok {
		rawSnapshot = nested
	}
	nftBody := cleanPayloadString(rawSnapshot, "nftBody")
	if strings.TrimSpace(nftBody) == "" {
		return s.disableFirewall()
	}
	// Imported hotplug scripts are never executed: regenerate the managed hook.
	return s.firewallCommit(nftBody, rfw.HotplugScript(), parseFirewallStatusMeta(nftBody))
}

func (s *serverState) disableFirewall() map[string]any {
	return s.firewallCommit("", "", map[string]any{})
}

func (s *serverState) reloadFirewall() map[string]any {
	body, err := os.ReadFile(ruOpenRayFirewallNftPath)
	if os.IsNotExist(err) {
		return map[string]any{"ok": true, "skipped": true}
	}
	if err != nil {
		return map[string]any{"ok": false, "error": err.Error()}
	}
	return s.firewallCommit(string(body), rfw.HotplugScript(), parseFirewallStatusMeta(string(body)))
}
