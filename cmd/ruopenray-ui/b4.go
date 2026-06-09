package main

import (
	"fmt"
	"runtime"
	"strings"
	"time"
)

const (
	b4ServicePath = "/etc/init.d/b4"
	b4UIPort      = 7000
	b4RouteTable  = "b4_route"
)

func (s *serverState) cachedB4Status() map[string]any {
	now := time.Now()
	s.metricsMu.Lock()
	if s.b4Cache != nil && now.Sub(s.b4At) < 15*time.Second {
		cached := s.b4Cache
		s.metricsMu.Unlock()
		return cached
	}
	s.metricsMu.Unlock()
	status := s.b4Status()
	s.metricsMu.Lock()
	s.b4Cache = status
	s.b4At = now
	s.metricsMu.Unlock()
	return status
}

func (s *serverState) b4Status() map[string]any {
	result := map[string]any{
		"ok":        true,
		"available": false,
		"running":   false,
		"active":    false,
		"summary":   "B4 не найден",
		"warnings":  []string{},
	}
	if runtime.GOOS == "windows" {
		result["summary"] = "B4 проверяется только на роутере"
		return result
	}

	service := map[string]any{"path": b4ServicePath, "exists": fileExists(b4ServicePath), "running": false}
	if service["exists"] == true {
		status := runTimeout(3*time.Second, b4ServicePath, "status")
		text := concatCommandOutput(status)
		service["status"] = status
		service["running"] = b4StatusTextRunning(text)
		result["available"] = true
		result["running"] = service["running"]
	}
	result["service"] = service

	ps := runTimeout(3*time.Second, "ps", "w")
	processText := strings.Join(b4ProcessLines(fmt.Sprint(ps["stdout"])), "\n")
	result["process"] = map[string]any{"found": processText != "", "text": processText}
	if processText != "" {
		result["available"] = true
	}

	configs := b4ConfigPaths()
	result["config"] = map[string]any{"found": len(configs) > 0, "paths": configs}
	if len(configs) > 0 {
		result["available"] = true
	}

	nft := b4NFTStatus()
	result["nft"] = nft
	iptables := b4IPTablesStatus()
	result["iptables"] = iptables
	routing := b4RoutingStatus()
	result["routing"] = routing
	ports := b4PortsStatus()
	result["ports"] = ports
	if boolMap(ports, "ui") {
		result["available"] = true
	}
	if commandExists("uci") {
		uci := runTimeout(3*time.Second, "uci", "-q", "show", "b4")
		result["uci"] = map[string]any{"ok": uci["ok"], "found": strings.TrimSpace(fmt.Sprint(uci["stdout"])) != "", "stdout": fmt.Sprint(uci["stdout"])}
		if strings.TrimSpace(fmt.Sprint(uci["stdout"])) != "" {
			result["available"] = true
		}
	}

	active := result["running"] == true ||
		boolMap(result["process"].(map[string]any), "found") ||
		boolMap(nft, "hasB4") ||
		boolMap(routing, "ipRule") ||
		boolMap(routing, "route")
	result["active"] = active
	warnings := b4Warnings(result)
	result["warnings"] = warnings
	switch {
	case active:
		result["summary"] = "B4 активен и может вмешиваться в firewall/NFQUEUE"
	case result["available"] == true:
		result["summary"] = "B4 установлен, но активных следов firewall/NFQUEUE не видно"
	case boolMap(nft, "hasQueue") || boolMap(iptables, "hasNFQUEUE"):
		result["summary"] = "NFQUEUE найден, но явных следов B4 нет"
	default:
		result["summary"] = "B4 не найден"
	}
	if len(warnings) > 0 {
		result["ok"] = false
	}
	return result
}

func b4ConfigPaths() []string {
	paths := []string{}
	for _, path := range []string{
		"/etc/b4/b4.json",
		"/etc/b4/config.json",
		"/opt/etc/b4/b4.json",
		"/etc/config/b4",
	} {
		if fileExists(path) {
			paths = append(paths, path)
		}
	}
	return paths
}

func b4NFTStatus() map[string]any {
	if !commandExists("nft") {
		return map[string]any{"available": false, "hasB4": false, "hasQueue": false}
	}
	result := runTimeout(5*time.Second, "sh", "-c", "nft list ruleset 2>/dev/null | grep -Ei 'b4|nfqueue| queue | dport 53|redirect' | head -n 120")
	text := strings.TrimSpace(fmt.Sprint(result["stdout"]))
	lower := strings.ToLower(text)
	hasQueue := strings.Contains(lower, " queue ") || strings.Contains(lower, "nfqueue")
	return map[string]any{
		"available":      true,
		"hasB4":          strings.Contains(lower, "b4"),
		"hasQueue":       hasQueue,
		"hasDNSRedirect": hasQueue && strings.Contains(lower, "dport 53"),
		"sample":         text,
	}
}

func b4IPTablesStatus() map[string]any {
	if !commandExists("iptables-save") {
		return map[string]any{"available": false, "hasNFQUEUE": false}
	}
	result := runTimeout(5*time.Second, "sh", "-c", "iptables-save 2>/dev/null | grep -Ei 'b4|NFQUEUE|--queue-num' | head -n 120")
	text := strings.TrimSpace(fmt.Sprint(result["stdout"]))
	upper := strings.ToUpper(text)
	return map[string]any{
		"available":  true,
		"hasB4":      strings.Contains(strings.ToLower(text), "b4"),
		"hasNFQUEUE": strings.Contains(upper, "NFQUEUE") || strings.Contains(text, "--queue-num"),
		"sample":     text,
	}
}

func b4RoutingStatus() map[string]any {
	if !commandExists("ip") {
		return map[string]any{"available": false, "ipRule": false, "route": false}
	}
	rules := runTimeout(3*time.Second, "ip", "rule", "show")
	rulesText := strings.ToLower(fmt.Sprint(rules["stdout"]))
	route := runTimeout(3*time.Second, "ip", "route", "show", "table", b4RouteTable)
	routeText := strings.TrimSpace(fmt.Sprint(route["stdout"]))
	return map[string]any{
		"available": true,
		"ipRule":    strings.Contains(rulesText, "lookup "+b4RouteTable) || strings.Contains(rulesText, "b4"),
		"route":     b4RouteOutputActive(route),
		"table":     b4RouteTable,
		"stdout":    routeText,
	}
}

func b4RouteOutputActive(results ...map[string]any) bool {
	for _, result := range results {
		if result == nil || result["ok"] != true {
			continue
		}
		text := strings.TrimSpace(fmt.Sprint(result["stdout"]))
		if text == "" {
			continue
		}
		lower := strings.ToLower(text)
		if strings.Contains(lower, "dump terminated") ||
			strings.Contains(lower, "table id value is invalid") ||
			strings.Contains(lower, "fib table does not exist") ||
			strings.Contains(lower, "no such file") ||
			strings.Contains(lower, "not found") {
			continue
		}
		return true
	}
	return false
}

func b4ProcessLines(output string) []string {
	lines := []string{}
	for _, line := range strings.Split(output, "\n") {
		clean := strings.TrimSpace(line)
		if clean == "" {
			continue
		}
		lower := strings.ToLower(clean)
		if strings.Contains(lower, "grep ") ||
			strings.Contains(lower, "awk ") ||
			strings.Contains(lower, " sh -c ") ||
			strings.Contains(lower, " ash -c ") {
			continue
		}
		if strings.Contains(lower, "/b4 ") ||
			strings.HasSuffix(lower, "/b4") ||
			strings.Contains(lower, " b4 ") ||
			strings.Contains(lower, "b4-web") ||
			strings.Contains(lower, "b4_route") {
			lines = append(lines, clean)
		}
	}
	return lines
}

func b4PortsStatus() map[string]any {
	out := ""
	if commandExists("netstat") {
		out = fmt.Sprint(runTimeout(3*time.Second, "sh", "-c", "netstat -lntup 2>/dev/null | grep ':7000 '")["stdout"])
	} else if commandExists("ss") {
		out = fmt.Sprint(runTimeout(3*time.Second, "sh", "-c", "ss -lntup 2>/dev/null | grep ':7000 '")["stdout"])
	}
	return map[string]any{
		"ui":     strings.Contains(out, ":7000"),
		"uiPort": b4UIPort,
		"text":   strings.TrimSpace(out),
	}
}

func b4Warnings(status map[string]any) []string {
	warnings := []string{}
	nft, _ := status["nft"].(map[string]any)
	iptables, _ := status["iptables"].(map[string]any)
	routing, _ := status["routing"].(map[string]any)
	if boolMap(nft, "hasQueue") || boolMap(iptables, "hasNFQUEUE") {
		warnings = append(warnings, "Найдены NFQUEUE-правила. Если B4 обрабатывает те же LAN-пакеты, RuOpenRay и B4 нужно разводить по владельцу перехвата.")
	}
	if boolMap(nft, "hasDNSRedirect") {
		warnings = append(warnings, "Похоже, B4 участвует в обработке DNS. Не включайте одновременно DNS-перехват RuOpenRay и B4 на одни и те же домены без явной схемы.")
	}
	if boolMap(routing, "ipRule") || boolMap(routing, "route") {
		warnings = append(warnings, "Найдены route table/rules B4. При параллельной работе важно не пересекать policy routing и fwmark.")
	}
	return warnings
}

func b4StatusTextRunning(text string) bool {
	text = strings.ToLower(text)
	if strings.Contains(text, "inactive") || strings.Contains(text, "stopped") || strings.Contains(text, "not running") || strings.Contains(text, "disabled") {
		return false
	}
	return strings.Contains(text, "running") || strings.Contains(text, "started") || strings.Contains(text, "active")
}
