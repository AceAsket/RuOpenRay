package main

import (
	"fmt"
	"runtime"
	"strings"
	"time"
)

const (
	podkopServicePath  = "/etc/init.d/podkop"
	podkopNFTable      = "PodkopTable"
	podkopDNSLoopback  = "127.0.0.42"
	podkopDNSPort      = 53
	podkopTPROXYPort   = 1602
	podkopRouteTable   = "105"
	podkopRouteName    = "podkop"
	podkopFirewallMark = "0x100000"
)

func (s *serverState) cachedPodkopStatus() map[string]any {
	now := time.Now()
	s.metricsMu.Lock()
	if s.podkopCache != nil && now.Sub(s.podkopAt) < 15*time.Second {
		cached := s.podkopCache
		s.metricsMu.Unlock()
		return cached
	}
	s.metricsMu.Unlock()
	status := s.podkopStatus()
	s.metricsMu.Lock()
	s.podkopCache = status
	s.podkopAt = now
	s.metricsMu.Unlock()
	return status
}

func (s *serverState) podkopStatus() map[string]any {
	result := map[string]any{
		"ok":        true,
		"available": false,
		"running":   false,
		"active":    false,
		"summary":   "Podkop не найден",
		"warnings":  []string{},
	}
	if runtime.GOOS == "windows" {
		result["summary"] = "Podkop проверяется только на роутере"
		return result
	}

	service := map[string]any{"path": podkopServicePath, "exists": fileExists(podkopServicePath), "running": false}
	if service["exists"] == true {
		status := runTimeout(3*time.Second, podkopServicePath, "status")
		text := concatCommandOutput(status)
		service["status"] = status
		service["running"] = podkopStatusTextRunning(text)
		result["available"] = true
		result["running"] = service["running"]
	}
	result["service"] = service

	ps := runTimeout(3*time.Second, "ps", "w")
	processText := strings.Join(podkopProcessLines(fmt.Sprint(ps["stdout"])), "\n")
	result["process"] = map[string]any{"found": processText != "", "text": processText}
	if processText != "" {
		result["available"] = true
	}

	dnsmasq := podkopDNSMasqStatus()
	result["dnsmasq"] = dnsmasq
	nft := podkopNFTStatus()
	result["nft"] = nft
	routing := podkopRoutingStatus()
	result["routing"] = routing
	ports := podkopPortsStatus()
	result["ports"] = ports
	if commandExists("uci") {
		uci := runTimeout(3*time.Second, "uci", "-q", "show", "podkop")
		result["uci"] = map[string]any{"ok": uci["ok"], "found": strings.TrimSpace(fmt.Sprint(uci["stdout"])) != "", "stdout": fmt.Sprint(uci["stdout"])}
		if strings.TrimSpace(fmt.Sprint(uci["stdout"])) != "" {
			result["available"] = true
		}
	}

	active := boolMap(dnsmasq, "usesPodkopDNS") ||
		boolMap(nft, "active") ||
		boolMap(routing, "ipRule") ||
		boolMap(routing, "route") ||
		boolMap(ports, "dns") ||
		boolMap(ports, "tproxy") ||
		result["running"] == true
	result["active"] = active
	warnings := podkopWarnings(result)
	result["warnings"] = warnings
	switch {
	case active:
		result["summary"] = "Podkop активен и может управлять DNS/перехватом"
	case result["available"] == true:
		result["summary"] = "Podkop установлен, но активных следов перехвата не видно"
	default:
		result["summary"] = "Podkop не найден"
	}
	if len(warnings) > 0 {
		result["ok"] = false
	}
	return result
}

func podkopDNSMasqStatus() map[string]any {
	servers := []string{}
	if commandExists("uci") {
		servers = dnsmasqServerList()
	}
	uses := false
	for _, server := range servers {
		if podkopDNSServerMatches(server) {
			uses = true
			break
		}
	}
	return map[string]any{
		"servers":        servers,
		"usesPodkopDNS":  uses,
		"expectedServer": fmt.Sprintf("%s#%d", podkopDNSLoopback, podkopDNSPort),
	}
}

func podkopNFTStatus() map[string]any {
	if !commandExists("nft") {
		return map[string]any{"available": false, "active": false}
	}
	table := runTimeout(4*time.Second, "nft", "list", "table", "inet", podkopNFTable)
	text := strings.TrimSpace(fmt.Sprint(table["stdout"]))
	active := table["ok"] == true && text != ""
	return map[string]any{
		"available": true,
		"active":    active,
		"table":     "inet " + podkopNFTable,
		"hasTproxy": strings.Contains(text, " tproxy ") || strings.Contains(text, "tproxy ip"),
		"hasMark":   strings.Contains(strings.ToLower(text), podkopFirewallMark),
	}
}

func podkopRoutingStatus() map[string]any {
	if !commandExists("ip") {
		return map[string]any{"available": false, "ipRule": false, "route": false}
	}
	rules := runTimeout(3*time.Second, "ip", "rule", "show")
	rulesText := strings.ToLower(fmt.Sprint(rules["stdout"]))
	ipRule := strings.Contains(rulesText, "lookup "+podkopRouteName) ||
		strings.Contains(rulesText, "lookup "+podkopRouteTable) ||
		strings.Contains(rulesText, podkopFirewallMark)
	routeByName := runTimeout(3*time.Second, "ip", "route", "show", "table", podkopRouteName)
	routeByID := runTimeout(3*time.Second, "ip", "route", "show", "table", podkopRouteTable)
	routeText := strings.TrimSpace(fmt.Sprint(routeByName["stdout"]) + "\n" + fmt.Sprint(routeByID["stdout"]))
	return map[string]any{
		"available": true,
		"ipRule":    ipRule,
		"route":     podkopRouteOutputActive(routeByName, routeByID),
		"table":     podkopRouteName,
		"tableID":   podkopRouteTable,
		"mark":      podkopFirewallMark,
		"stdout":    routeText,
	}
}

func podkopRouteOutputActive(results ...map[string]any) bool {
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

func podkopProcessLines(output string) []string {
	lines := []string{}
	for _, line := range strings.Split(output, "\n") {
		clean := strings.TrimSpace(line)
		if clean == "" {
			continue
		}
		lower := strings.ToLower(clean)
		if strings.Contains(lower, "grep ") ||
			strings.Contains(lower, "jq ") ||
			strings.Contains(lower, " sh -c ") ||
			strings.Contains(lower, " ash -c ") ||
			strings.Contains(lower, "ruopenray-ui") {
			continue
		}
		if strings.Contains(lower, "/podkop ") ||
			strings.HasSuffix(lower, "/podkop") ||
			strings.Contains(lower, " podkop ") ||
			strings.Contains(lower, "podkop_") {
			lines = append(lines, clean)
		}
	}
	return lines
}

func podkopPortsStatus() map[string]any {
	out := ""
	if commandExists("netstat") {
		out = fmt.Sprint(runTimeout(3*time.Second, "sh", "-c", "(netstat -lntup 2>/dev/null; netstat -lnup 2>/dev/null) | grep -E '127\\.0\\.0\\.42:53|:1602'")["stdout"])
	} else if commandExists("ss") {
		out = fmt.Sprint(runTimeout(3*time.Second, "sh", "-c", "ss -lntup 2>/dev/null | grep -E '127\\.0\\.0\\.42:53|:1602'")["stdout"])
	}
	return map[string]any{
		"dns":    podkopPortOutputHasLocal(out, podkopDNSLoopback, podkopDNSPort),
		"tproxy": podkopPortOutputHasLocal(out, "", podkopTPROXYPort),
		"text":   strings.TrimSpace(out),
	}
}

func podkopPortOutputHasLocal(output string, host string, port int) bool {
	wantPort := fmt.Sprintf("%d", port)
	for _, line := range strings.Split(output, "\n") {
		fields := strings.Fields(line)
		if len(fields) < 4 {
			continue
		}
		local := fields[3]
		if !localAddressPortMatches(local, host, wantPort) {
			continue
		}
		return true
	}
	return false
}

func localAddressPortMatches(local string, host string, port string) bool {
	local = strings.TrimSpace(local)
	if local == "" {
		return false
	}
	if !strings.HasSuffix(local, ":"+port) && !strings.HasSuffix(local, "."+port) {
		return false
	}
	address := strings.TrimSuffix(strings.TrimSuffix(local, ":"+port), "."+port)
	address = strings.Trim(address, "[]")
	if host == "" {
		return true
	}
	return address == host
}

func podkopWarnings(status map[string]any) []string {
	warnings := []string{}
	dnsmasq, _ := status["dnsmasq"].(map[string]any)
	nft, _ := status["nft"].(map[string]any)
	routing, _ := status["routing"].(map[string]any)
	if boolMap(dnsmasq, "usesPodkopDNS") {
		warnings = append(warnings, "dnsmasq направлен в DNS Podkop. Если RuOpenRay тоже применит LAN DNS, настройки будут перезаписываться.")
	}
	if boolMap(nft, "active") {
		warnings = append(warnings, "Найдена nft-таблица Podkop. Одновременный transparent proxy с RuOpenRay нужно разводить по владельцу перехвата.")
	}
	if boolMap(routing, "ipRule") || boolMap(routing, "route") {
		warnings = append(warnings, "Найдены policy routing/таблица Podkop. При TPROXY важно не пересекать fwmark и route tables.")
	}
	return warnings
}

func podkopDNSServerMatches(server string) bool {
	value := strings.TrimSpace(server)
	value = strings.TrimPrefix(value, "udp://")
	value = strings.TrimPrefix(value, "tcp://")
	return value == fmt.Sprintf("%s#%d", podkopDNSLoopback, podkopDNSPort) ||
		value == fmt.Sprintf("%s:%d", podkopDNSLoopback, podkopDNSPort) ||
		value == podkopDNSLoopback
}

func podkopStatusTextRunning(text string) bool {
	text = strings.ToLower(text)
	if strings.Contains(text, "inactive") || strings.Contains(text, "stopped") || strings.Contains(text, "not running") || strings.Contains(text, "disabled") {
		return false
	}
	return strings.Contains(text, "running") || strings.Contains(text, "started") || strings.Contains(text, "active")
}

func boolMap(values map[string]any, key string) bool {
	if values == nil {
		return false
	}
	value, ok := values[key].(bool)
	return ok && value
}
