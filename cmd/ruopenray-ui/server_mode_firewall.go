package main

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"sort"
	"strings"
	"time"
)

const (
	serverModeFirewallSectionPrefix = "ruopenray_server_"
)

var serverModeFirewallSectionPattern = regexp.MustCompile(`^firewall\.(ruopenray_server_[A-Za-z0-9_]+)=rule$`)

type serverModeWANRule struct {
	Section  string `json:"section"`
	Kind     string `json:"kind"`
	Name     string `json:"name"`
	Protocol string `json:"protocol"`
	Port     int    `json:"port"`
	Source   string `json:"source"`
}

func serverModeWANRules(mode serverModeConfig) []serverModeWANRule {
	mode = normalizeServerModeConfig(mode)
	if !mode.Enabled {
		return []serverModeWANRule{}
	}
	out := []serverModeWANRule{}
	seen := map[string]bool{}
	add := func(kind, id, name, protocol string, port int) {
		if port < 1 || port > 65535 {
			return
		}
		section := serverModeFirewallSection(kind, id, port)
		if seen[section] {
			return
		}
		seen[section] = true
		out = append(out, serverModeWANRule{
			Section:  section,
			Kind:     kind,
			Name:     firstNonEmpty(name, id, section),
			Protocol: protocol,
			Port:     port,
			Source:   "wan",
		})
	}
	for _, inbound := range mode.Xray {
		if inbound.Enabled && inbound.OpenFirewall {
			add("xray", inbound.ID, inbound.Name, "tcp", inbound.Port)
		}
	}
	for _, awg := range mode.AWG {
		if awg.Enabled && awg.OpenFirewall {
			add("awg", awg.ID, awg.Name, "udp", awg.ListenPort)
		}
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Protocol != out[j].Protocol {
			return out[i].Protocol < out[j].Protocol
		}
		if out[i].Port != out[j].Port {
			return out[i].Port < out[j].Port
		}
		return out[i].Section < out[j].Section
	})
	return out
}

func serverModeFirewallSection(kind, id string, port int) string {
	clean := strings.ReplaceAll(serverModeSlug(fmt.Sprintf("%s-%s-%d", kind, id, port)), "-", "_")
	if len(clean) > 44 {
		clean = strings.Trim(clean[:44], "_")
	}
	if clean == "" {
		clean = "rule"
	}
	return serverModeFirewallSectionPrefix + clean
}

func (s *serverState) serverModeFirewallStatus() map[string]any {
	status := map[string]any{
		"available": runtime.GOOS != "windows" && commandExists("uci"),
		"active":    false,
		"count":     0,
		"rules":     []map[string]any{},
	}
	if status["available"] != true {
		return status
	}
	show := runTimeout(5*time.Second, "uci", "-q", "show", "firewall")
	status["uci"] = map[string]any{"ok": show["ok"], "stderr": show["stderr"]}
	rules := parseServerModeFirewallRules(fmt.Sprint(show["stdout"]))
	status["active"] = len(rules) > 0
	status["count"] = len(rules)
	status["rules"] = rules
	return status
}

func parseServerModeFirewallRules(output string) []map[string]any {
	type item struct {
		section string
		values  map[string]string
	}
	bySection := map[string]*item{}
	for _, line := range strings.Split(output, "\n") {
		clean := strings.TrimSpace(line)
		if clean == "" {
			continue
		}
		if match := serverModeFirewallSectionPattern.FindStringSubmatch(clean); len(match) == 2 {
			section := match[1]
			bySection[section] = &item{section: section, values: map[string]string{}}
			continue
		}
		if !strings.HasPrefix(clean, "firewall."+serverModeFirewallSectionPrefix) {
			continue
		}
		left, right, ok := strings.Cut(clean, "=")
		if !ok {
			continue
		}
		parts := strings.Split(left, ".")
		if len(parts) < 3 {
			continue
		}
		section := parts[1]
		key := strings.Join(parts[2:], ".")
		entry := bySection[section]
		if entry == nil {
			entry = &item{section: section, values: map[string]string{}}
			bySection[section] = entry
		}
		entry.values[key] = strings.Trim(strings.TrimSpace(right), "'\"")
	}
	keys := make([]string, 0, len(bySection))
	for key := range bySection {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	out := []map[string]any{}
	for _, key := range keys {
		values := bySection[key].values
		out = append(out, map[string]any{
			"section":  key,
			"name":     values["name"],
			"source":   values["src"],
			"protocol": values["proto"],
			"port":     values["dest_port"],
			"target":   values["target"],
			"enabled":  values["enabled"] != "0",
		})
	}
	return out
}

func (s *serverState) serverModeFirewallPreview(payload map[string]any) map[string]any {
	mode, err := s.serverModePayloadOrStored(payload)
	if err != nil {
		return map[string]any{"ok": false, "error": err.Error()}
	}
	active, activeErr := s.readActiveConfig()
	preflight := map[string]any{"ok": activeErr == nil}
	if activeErr == nil {
		preflight = serverModePreflight(mode, active)
	} else {
		preflight["error"] = activeErr.Error()
	}
	rules := serverModeWANRules(mode)
	commands := serverModeFirewallCommands(rules)
	ok := len(rules) > 0 && preflight["ok"] == true
	result := map[string]any{
		"ok":        ok,
		"rules":     rules,
		"commands":  commands,
		"preflight": preflight,
		"status":    s.serverModeFirewallStatus(),
	}
	if len(rules) == 0 {
		result["error"] = "Нет включенных Xray/AWG входов с галочкой WAN firewall."
	}
	return result
}

func serverModeFirewallCommands(rules []serverModeWANRule) []string {
	commands := []string{
		`for s in $(uci -q show firewall | sed -n 's/^\(firewall\.ruopenray_server_[A-Za-z0-9_]*\)=rule$/\1/p'); do uci -q delete "$s"; done`,
	}
	for _, rule := range rules {
		section := "firewall." + rule.Section
		commands = append(commands,
			"uci set "+section+"=rule",
			"uci set "+section+".name="+serverModeShellQuote(serverModeFirewallRuleName(rule)),
			"uci set "+section+".src="+serverModeShellQuote(rule.Source),
			"uci set "+section+".proto="+serverModeShellQuote(rule.Protocol),
			"uci set "+section+".dest_port="+fmt.Sprint(rule.Port),
			"uci set "+section+".target='ACCEPT'",
			"uci set "+section+".enabled='1'",
		)
	}
	commands = append(commands, "uci commit firewall", "/etc/init.d/firewall reload")
	return commands
}

func serverModeShellQuote(value string) string {
	return "'" + strings.ReplaceAll(value, "'", `'\''`) + "'"
}

func serverModeFirewallRuleName(rule serverModeWANRule) string {
	return fmt.Sprintf("RuOpenRay server-mode %s %s %d", rule.Kind, rule.Protocol, rule.Port)
}

func (s *serverState) serverModeFirewallApply(payload map[string]any) map[string]any {
	if runtime.GOOS == "windows" || !commandExists("uci") {
		return map[string]any{"ok": false, "available": false, "error": "UCI firewall недоступен на этой системе"}
	}
	mode, err := s.serverModePayloadOrStored(payload)
	if err != nil {
		return map[string]any{"ok": false, "error": err.Error()}
	}
	preview := s.serverModeFirewallPreview(payload)
	if preview["ok"] != true {
		return preview
	}
	if !boolPayload(payload, "confirm", false) {
		preview["ok"] = false
		preview["needsConfirmation"] = true
		preview["error"] = "Подтвердите открытие WAN-портов server-mode."
		return preview
	}
	rules := serverModeWANRules(mode)
	backup := s.backupFirewallUCI("server-mode-firewall")
	steps := []map[string]any{}
	steps = append(steps, serverModeFirewallClearStep())
	for _, rule := range rules {
		steps = append(steps, serverModeFirewallSetSteps(rule)...)
	}
	steps = append(steps, runTimeout(10*time.Second, "uci", "commit", "firewall"))
	if commandExists("/etc/init.d/firewall") {
		steps = append(steps, runTimeout(20*time.Second, "/etc/init.d/firewall", "reload"))
	}
	status := s.serverModeFirewallStatus()
	appliedCount := 0
	if value, ok := status["count"].(int); ok {
		appliedCount = value
	}
	return map[string]any{
		"ok":      serverModeStepsOK(steps) && appliedCount >= len(rules),
		"backup":  backup,
		"rules":   rules,
		"steps":   steps,
		"status":  status,
		"message": "WAN-порты server-mode обновлены через UCI firewall.",
	}
}

func (s *serverState) backupFirewallUCI(prefix string) map[string]any {
	if runtime.GOOS == "windows" || !commandExists("uci") {
		return map[string]any{"ok": false, "skipped": true}
	}
	export := runTimeout(8*time.Second, "uci", "export", "firewall")
	result := map[string]any{"ok": export["ok"], "stderr": export["stderr"]}
	if export["ok"] != true {
		return result
	}
	dir := filepath.Join(s.cfg.DataDir, "backups")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		result["ok"] = false
		result["error"] = err.Error()
		return result
	}
	path := filepath.Join(dir, fmt.Sprintf("%s-%s.uci", prefix, time.Now().Format("20060102-150405")))
	if err := os.WriteFile(path, []byte(fmt.Sprint(export["stdout"])), 0o600); err != nil {
		result["ok"] = false
		result["error"] = err.Error()
		return result
	}
	result["path"] = path
	return result
}

func serverModeFirewallClearStep() map[string]any {
	script := `for s in $(uci -q show firewall | sed -n 's/^\(firewall\.ruopenray_server_[A-Za-z0-9_]*\)=rule$/\1/p'); do uci -q delete "$s"; done`
	return runTimeout(8*time.Second, "sh", "-c", script)
}

func serverModeFirewallSetSteps(rule serverModeWANRule) []map[string]any {
	section := "firewall." + rule.Section
	return []map[string]any{
		runTimeout(5*time.Second, "uci", "set", section+"=rule"),
		runTimeout(5*time.Second, "uci", "set", section+".name="+serverModeFirewallRuleName(rule)),
		runTimeout(5*time.Second, "uci", "set", section+".src="+rule.Source),
		runTimeout(5*time.Second, "uci", "set", section+".proto="+rule.Protocol),
		runTimeout(5*time.Second, "uci", "set", section+".dest_port="+fmt.Sprint(rule.Port)),
		runTimeout(5*time.Second, "uci", "set", section+".target=ACCEPT"),
		runTimeout(5*time.Second, "uci", "set", section+".enabled=1"),
	}
}

func (s *serverState) serverModeFirewallDisable() map[string]any {
	if runtime.GOOS == "windows" || !commandExists("uci") {
		return map[string]any{"ok": false, "available": false, "error": "UCI firewall недоступен на этой системе"}
	}
	backup := s.backupFirewallUCI("server-mode-firewall-disable")
	steps := []map[string]any{serverModeFirewallClearStep()}
	steps = append(steps, runTimeout(10*time.Second, "uci", "commit", "firewall"))
	if commandExists("/etc/init.d/firewall") {
		steps = append(steps, runTimeout(20*time.Second, "/etc/init.d/firewall", "reload"))
	}
	status := s.serverModeFirewallStatus()
	return map[string]any{
		"ok":      serverModeStepsOK(steps) && status["active"] != true,
		"backup":  backup,
		"steps":   steps,
		"status":  status,
		"message": "WAN-порты server-mode закрыты.",
	}
}

func serverModeStepsOK(steps []map[string]any) bool {
	for _, step := range steps {
		if step["ok"] != true {
			return false
		}
	}
	return true
}
