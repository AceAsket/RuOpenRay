package main

import (
	"fmt"
	"net"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
)

var serverModeAWGInterfaceNameRe = regexp.MustCompile(`^[a-zA-Z0-9_.-]+$`)

var serverModeAWGAdvancedKeys = []string{
	"Jc", "Jmin", "Jmax",
	"S1", "S2", "S3", "S4", "S5",
	"H1", "H2", "H3", "H4",
	"I1", "I2", "I3", "I4", "I5",
}

func (s *serverState) serverModeAWGPlan(mode serverModeConfig) map[string]any {
	mode = normalizeServerModeConfig(mode)
	servers := []map[string]any{}
	errors := []serverModeIssue{}
	warnings := []serverModeIssue{}
	commands := []string{}

	if !mode.Enabled {
		return map[string]any{
			"ok":       true,
			"enabled":  false,
			"count":    0,
			"servers":  servers,
			"errors":   errors,
			"warnings": warnings,
			"commands": commands,
		}
	}

	baseDir := filepath.Join(s.cfg.DataDir, "server-mode", "awg")
	for _, awg := range mode.AWG {
		if !awg.Enabled {
			continue
		}
		plan := serverModeBuildAWGServerPlan(awg, filepath.Join(baseDir, serverModeSlug(awg.ID)+".conf"))
		servers = append(servers, plan)
		for _, issue := range serverModeIssueSlice(plan["errors"]) {
			errors = append(errors, issue)
		}
		for _, issue := range serverModeIssueSlice(plan["warnings"]) {
			warnings = append(warnings, issue)
		}
		for _, command := range stringList(plan["commands"]) {
			commands = append(commands, command)
		}
	}

	return map[string]any{
		"ok":       len(errors) == 0,
		"enabled":  len(servers) > 0,
		"count":    len(servers),
		"servers":  servers,
		"errors":   errors,
		"warnings": warnings,
		"commands": commands,
	}
}

func serverModeBuildAWGServerPlan(awg serverModeAWGServer, configPath string) map[string]any {
	awg = normalizeServerModeConfig(serverModeConfig{Enabled: true, AWG: []serverModeAWGServer{awg}}).AWG[0]
	source := "awg:" + awg.ID
	errors := []serverModeIssue{}
	warnings := []serverModeIssue{}

	iface := strings.TrimSpace(awg.Interface)
	if iface == "" {
		errors = append(errors, serverModeIssue{Severity: "error", Title: "AWG interface is empty", Detail: "Set a stable Linux interface name, for example awg-server0.", Source: source})
	} else {
		if len(iface) > 15 {
			errors = append(errors, serverModeIssue{Severity: "error", Title: "AWG interface name is too long", Detail: "Linux interface names should fit into 15 characters.", Source: source})
		}
		if !serverModeAWGInterfaceNameRe.MatchString(iface) {
			errors = append(errors, serverModeIssue{Severity: "error", Title: "AWG interface name has unsupported characters", Detail: "Use letters, digits, dot, dash or underscore.", Source: source})
		}
	}
	if awg.ListenPort < 1 || awg.ListenPort > 65535 {
		errors = append(errors, serverModeIssue{Severity: "error", Title: "AWG listen port is invalid", Detail: fmt.Sprintf("Port %d is outside 1-65535.", awg.ListenPort), Source: source})
	}
	if strings.TrimSpace(awg.PrivateKey) == "" {
		errors = append(errors, serverModeIssue{Severity: "error", Title: "AWG private key is required", Detail: "Server interface config cannot be generated without PrivateKey.", Source: source})
	}
	if _, _, err := net.ParseCIDR(strings.TrimSpace(awg.AddressCIDR)); err != nil {
		errors = append(errors, serverModeIssue{Severity: "error", Title: "AWG address is invalid", Detail: fmt.Sprintf("%q is not a CIDR address.", awg.AddressCIDR), Source: source})
	}
	mtu := awg.MTU
	if mtu == 0 {
		mtu = 1420
	}
	if mtu < 576 || mtu > 9000 {
		errors = append(errors, serverModeIssue{Severity: "error", Title: "AWG MTU is invalid", Detail: "Use MTU between 576 and 9000.", Source: source})
	}

	enabledPeers := []serverModeAWGPeer{}
	for _, peer := range awg.Peers {
		if !peer.Enabled {
			continue
		}
		peerSource := source + "/peer:" + peer.ID
		if strings.TrimSpace(peer.PublicKey) == "" {
			errors = append(errors, serverModeIssue{Severity: "error", Title: "AWG peer public key is required", Detail: "Enabled peer cannot connect without PublicKey.", Source: peerSource})
		}
		normalizedAllowed, peerWarnings, err := serverModeNormalizeAllowedIPs(peer.AllowedIPs)
		if err != nil {
			errors = append(errors, serverModeIssue{Severity: "error", Title: "AWG peer AllowedIPs is invalid", Detail: err.Error(), Source: peerSource})
		}
		for _, warning := range peerWarnings {
			warnings = append(warnings, serverModeIssue{Severity: "warning", Title: "AWG peer AllowedIPs normalized", Detail: warning, Source: peerSource})
		}
		peer.AllowedIPs = normalizedAllowed
		enabledPeers = append(enabledPeers, peer)
	}
	if len(enabledPeers) == 0 {
		warnings = append(warnings, serverModeIssue{Severity: "warning", Title: "AWG has no enabled peers", Detail: "Interface can start, but nobody will be able to connect until a peer is enabled.", Source: source})
	}
	if strings.TrimSpace(awg.EgressTag) != "" {
		warnings = append(warnings, serverModeIssue{Severity: "warning", Title: "AWG traffic policy is not applied yet", Detail: "This plan prepares the server interface only. Routing peer traffic to " + awg.EgressTag + " needs the next managed firewall/policy step.", Source: source})
	}

	config := serverModeAWGConfigText(awg, enabledPeers, mtu)
	configDir := filepath.Dir(configPath)
	commands := []string{
		fmt.Sprintf("install -d -m 700 %s", amneziaShellQuote(configDir)),
		fmt.Sprintf("cat > %s <<'EOF'\n%sEOF", amneziaShellQuote(configPath), config),
		fmt.Sprintf("ip link show dev %s >/dev/null 2>&1 || ip link add dev %s type amneziawg 2>/dev/null || ip link add dev %s type wireguard", amneziaShellQuote(iface), amneziaShellQuote(iface), amneziaShellQuote(iface)),
		fmt.Sprintf("awg setconf %s %s", amneziaShellQuote(iface), amneziaShellQuote(configPath)),
		fmt.Sprintf("ip addr replace %s dev %s", amneziaShellQuote(awg.AddressCIDR), amneziaShellQuote(iface)),
		fmt.Sprintf("ip link set mtu %s dev %s", amneziaShellQuote(fmt.Sprint(mtu)), amneziaShellQuote(iface)),
		fmt.Sprintf("ip link set up dev %s", amneziaShellQuote(iface)),
	}

	return map[string]any{
		"ok":             len(errors) == 0,
		"id":             awg.ID,
		"name":           awg.Name,
		"interface":      iface,
		"listenPort":     awg.ListenPort,
		"addressCidr":    awg.AddressCIDR,
		"mtu":            mtu,
		"egressTag":      awg.EgressTag,
		"peerCount":      len(enabledPeers),
		"configPath":     configPath,
		"config":         config,
		"configRedacted": serverModeAWGRedactConfig(config),
		"commands":       commands,
		"errors":         errors,
		"warnings":       warnings,
	}
}

func serverModeAWGConfigText(awg serverModeAWGServer, peers []serverModeAWGPeer, mtu int) string {
	lines := []string{
		"[Interface]",
		"PrivateKey = " + strings.TrimSpace(awg.PrivateKey),
		"ListenPort = " + fmt.Sprint(awg.ListenPort),
		"Address = " + strings.TrimSpace(awg.AddressCIDR),
		"MTU = " + fmt.Sprint(mtu),
	}
	lines = append(lines, serverModeAWGAdvancedLines(awg.Advanced)...)
	for _, peer := range peers {
		lines = append(lines, "", "[Peer]")
		if name := strings.TrimSpace(peer.Name); name != "" {
			lines = append(lines, "# Name = "+name)
		}
		lines = append(lines, "PublicKey = "+strings.TrimSpace(peer.PublicKey))
		if psk := strings.TrimSpace(peer.PresharedKey); psk != "" {
			lines = append(lines, "PresharedKey = "+psk)
		}
		lines = append(lines, "AllowedIPs = "+strings.TrimSpace(peer.AllowedIPs))
	}
	return strings.Join(lines, "\n") + "\n"
}

func serverModeAWGAdvancedLines(values map[string]interface{}) []string {
	if len(values) == 0 {
		return nil
	}
	canonical := map[string]string{}
	for _, key := range serverModeAWGAdvancedKeys {
		canonical[strings.ToLower(key)] = key
	}
	linesByKey := map[string]string{}
	for key, raw := range values {
		cleanKey := canonical[strings.ToLower(strings.TrimSpace(key))]
		if cleanKey == "" {
			continue
		}
		cleanValue := strings.TrimSpace(fmt.Sprint(raw))
		if cleanValue == "" || cleanValue == "<nil>" {
			continue
		}
		linesByKey[cleanKey] = cleanValue
	}
	out := []string{}
	for _, key := range serverModeAWGAdvancedKeys {
		if value := linesByKey[key]; value != "" {
			out = append(out, key+" = "+value)
		}
	}
	return out
}

func serverModeNormalizeAllowedIPs(value string) (string, []string, error) {
	parts := strings.Split(value, ",")
	out := []string{}
	warnings := []string{}
	seen := map[string]bool{}
	for _, part := range parts {
		clean := strings.TrimSpace(part)
		if clean == "" {
			continue
		}
		if strings.Contains(clean, "/") {
			if _, _, err := net.ParseCIDR(clean); err != nil {
				return "", warnings, fmt.Errorf("%q is not a valid CIDR", clean)
			}
		} else {
			ip := net.ParseIP(clean)
			if ip == nil {
				return "", warnings, fmt.Errorf("%q is not a valid IP or CIDR", clean)
			}
			if ip.To4() != nil {
				clean += "/32"
			} else {
				clean += "/128"
			}
			warnings = append(warnings, "Plain IP "+part+" will be written as "+clean+".")
		}
		if seen[clean] {
			continue
		}
		seen[clean] = true
		out = append(out, clean)
	}
	if len(out) == 0 {
		return "", warnings, fmt.Errorf("AllowedIPs is empty")
	}
	sort.Strings(out)
	return strings.Join(out, ", "), warnings, nil
}

func serverModeAWGRedactConfig(config string) string {
	lines := strings.Split(config, "\n")
	for i, line := range lines {
		key := strings.TrimSpace(strings.SplitN(line, "=", 2)[0])
		if strings.EqualFold(key, "PrivateKey") || strings.EqualFold(key, "PresharedKey") {
			lines[i] = key + " = <hidden>"
		}
	}
	return strings.Join(lines, "\n")
}

func serverModeIssueSlice(value any) []serverModeIssue {
	switch typed := value.(type) {
	case []serverModeIssue:
		return typed
	case []any:
		out := []serverModeIssue{}
		for _, item := range typed {
			object := mapValue(item)
			out = append(out, serverModeIssue{
				Severity: strings.TrimSpace(fmt.Sprint(object["severity"])),
				Title:    strings.TrimSpace(fmt.Sprint(object["title"])),
				Detail:   strings.TrimSpace(fmt.Sprint(object["detail"])),
				Source:   strings.TrimSpace(fmt.Sprint(object["source"])),
			})
		}
		return out
	default:
		return nil
	}
}
