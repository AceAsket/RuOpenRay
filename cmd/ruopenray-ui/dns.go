package main

import (
	"fmt"
	"net"
	"net/http"
	"runtime"
	"strings"
	"time"

	"github.com/AceAsket/RuOpenRay/internal/dnsconfig"
)

func (s *serverState) lanDNSUpstreamStatus(plan map[string]any) map[string]any {
	available := runtime.GOOS != "windows" && commandExists("uci")
	result := map[string]any{
		"ok":         true,
		"available":  available,
		"mode":       "unknown",
		"noresolv":   false,
		"servers":    []string{},
		"routerLan":  "192.168.1.1",
		"xrayTarget": "127.0.0.1#5353",
	}
	if !available {
		result["mode"] = "manual"
		result["hint"] = "UCI недоступен, настройте dnsmasq вручную."
		if plan != nil {
			result["plan"] = plan
		}
		return result
	}
	noresolv := strings.TrimSpace(fmt.Sprint(run("uci", "-q", "get", "dhcp.@dnsmasq[0].noresolv")["stdout"])) == "1"
	servers := dnsmasqServerList()
	lanIP := firstLine(fmt.Sprint(run("uci", "-q", "get", "network.lan.ipaddr")["stdout"]), "")
	if lanIP == "" || lanIP == "<nil>" {
		lanIP = "192.168.1.1"
	}
	if strings.Contains(lanIP, "/") {
		lanIP = strings.SplitN(lanIP, "/", 2)[0]
	}
	mode := "system"
	if noresolv && len(servers) == 1 && servers[0] == "127.0.0.1#5353" {
		mode = "xray"
	} else if noresolv && len(servers) > 0 {
		mode = "upstream"
	}
	result["mode"] = mode
	result["noresolv"] = noresolv
	result["servers"] = servers
	result["routerLan"] = lanIP
	result["readiness"] = s.lanDNSReadiness()
	if plan != nil {
		result["plan"] = plan
	}
	return result
}

func dnsmasqServerList() []string {
	out := fmt.Sprint(run("uci", "-q", "get", "dhcp.@dnsmasq[0].server")["stdout"])
	fields := strings.Fields(strings.TrimSpace(out))
	servers := []string{}
	for _, item := range fields {
		item = strings.Trim(item, "'\" \t\r\n")
		if item != "" && item != "<nil>" {
			servers = append(servers, item)
		}
	}
	return servers
}

func (s *serverState) applyLANDNSUpstream(payload map[string]any) map[string]any {
	if runtime.GOOS == "windows" || !commandExists("uci") {
		return map[string]any{"ok": false, "available": false, "error": "UCI недоступен на этой системе"}
	}
	mode := strings.TrimSpace(fmt.Sprint(payload["mode"]))
	if mode == "" {
		mode = "xray"
	}
	restart := true
	if value, ok := payload["restart"].(bool); ok {
		restart = value
	}
	dryRun := boolPayload(payload, "dryRun", false)
	plan, err := dnsconfig.LANCommandPlan(mode, fmt.Sprint(payload["upstream"]), restart)
	if err != nil {
		status := s.lanDNSUpstreamStatus(plan)
		status["ok"] = false
		status["error"] = err.Error()
		return status
	}
	if dryRun {
		status := s.lanDNSUpstreamStatus(plan)
		status["ok"] = true
		status["dryRun"] = true
		return status
	}
	readiness := s.lanDNSReadiness()
	if mode == "xray" && readiness["ready"] != true {
		status := s.lanDNSUpstreamStatus(plan)
		status["ok"] = false
		status["readiness"] = readiness
		status["error"] = "DNS inbound Xray еще не готов. Сначала примените конфигурацию Xray и убедитесь, что порт 127.0.0.1:5353 слушает."
		return status
	}
	steps := []map[string]any{}
	for _, command := range dnsconfig.PlanCommands(plan) {
		if len(command) == 0 {
			continue
		}
		if command[0] == "/etc/init.d/dnsmasq" {
			steps = append(steps, runTimeout(15*time.Second, command[0], command[1:]...))
			continue
		}
		steps = append(steps, run(command[0], command[1:]...))
	}
	ok := true
	for _, step := range steps {
		if step["ok"] != true {
			ok = false
		}
	}
	status := s.lanDNSUpstreamStatus(plan)
	status["ok"] = ok
	status["steps"] = steps
	return status
}

func (s *serverState) lanDNSReadiness() map[string]any {
	cfg, err := s.readActiveConfig()
	if err != nil {
		return map[string]any{"ready": false, "error": err.Error()}
	}
	inboundReady := false
	outboundReady := false
	ruleReady := false
	for _, item := range anySlice(cfg["inbounds"]) {
		inbound, ok := item.(map[string]any)
		if !ok || fmt.Sprint(inbound["tag"]) != "ruopenray_dns_in" {
			continue
		}
		port := number(inbound["port"], 0)
		listen := strings.TrimSpace(fmt.Sprint(inbound["listen"]))
		inboundReady = port == 5353 && (listen == "" || listen == "<nil>" || listen == "127.0.0.1")
	}
	for _, item := range anySlice(cfg["outbounds"]) {
		outbound, ok := item.(map[string]any)
		if ok && fmt.Sprint(outbound["tag"]) == "dns-out" && fmt.Sprint(outbound["protocol"]) == "dns" {
			outboundReady = true
		}
	}
	for _, item := range anySlice(getNested(cfg, "routing", "rules")) {
		rule, ok := item.(map[string]any)
		if !ok || fmt.Sprint(rule["outboundTag"]) != "dns-out" {
			continue
		}
		for _, tag := range stringSlice(rule["inboundTag"]) {
			if tag == "ruopenray_dns_in" {
				ruleReady = true
				break
			}
		}
	}
	portReady := tcpPortOpen("127.0.0.1:5353", 700*time.Millisecond)
	return map[string]any{
		"ready":    inboundReady && outboundReady && ruleReady && portReady,
		"inbound":  inboundReady,
		"outbound": outboundReady,
		"rule":     ruleReady,
		"port":     portReady,
	}
}

func tcpPortOpen(address string, timeout time.Duration) bool {
	conn, err := net.DialTimeout("tcp", address, timeout)
	if err != nil {
		return false
	}
	_ = conn.Close()
	return true
}

func (s *serverState) checkDNS(w http.ResponseWriter, r *http.Request) {
	payload, _ := readJSON(r)
	server := strings.TrimSpace(fmt.Sprint(payload["server"]))
	host := dnsconfig.CleanCheckHost(firstNonEmpty(fmt.Sprint(payload["host"]), "example.com"))
	warnings := []string{}
	if !strings.HasPrefix(server, "https://") {
		warnings = append(warnings, "DNS не DoH: DNS-запросы могут быть видны провайдеру")
	}
	a, aaaa, err := dnsconfig.ResolveViaServer(server, host)
	if err != nil {
		writeJSON(w, 200, map[string]any{"ok": false, "server": server, "host": host, "addresses": []string{}, "a": []string{}, "aaaa": []string{}, "warnings": warnings, "error": err.Error()})
		return
	}
	addresses := append([]string{}, a...)
	addresses = append(addresses, aaaa...)
	writeJSON(w, 200, map[string]any{"ok": true, "server": server, "host": host, "addresses": addresses, "a": a, "aaaa": aaaa, "warnings": warnings})
}
