package main

import (
	"fmt"
	"net"
	"net/http"
	"os"
	"runtime"
	"strings"
	"time"

	"github.com/AceAsket/RuOpenRay/internal/dnsconfig"
)

func (s *serverState) lanDNSUpstreamStatus(plan map[string]any) map[string]any {
	available := runtime.GOOS != "windows" && commandExists("uci")
	xrayTarget := s.xrayDNSUpstreamTarget()
	targetOwner := ""
	targetConflict := false
	targetFound := false
	if cfg, err := s.readActiveConfig(); err == nil {
		host, port, found := xrayDNSInboundEndpoint(cfg)
		if found {
			targetFound = true
			xrayTarget = fmt.Sprintf("%s#%d", host, port)
			targetOwner = udpPortOwner(host, port)
			targetConflict = targetOwner != "" && !strings.Contains(targetOwner, "/xray")
		}
	}
	suggestedPort, conflictOwner := suggestedXrayDNSPort()
	if targetConflict {
		conflictOwner = targetOwner
	}
	dnsPortConflict := targetConflict || (!targetFound && conflictOwner != "")
	result := map[string]any{
		"ok":                   true,
		"available":            available,
		"mode":                 "unknown",
		"noresolv":             false,
		"servers":              []string{},
		"routerLan":            "192.168.1.1",
		"xrayTarget":           xrayTarget,
		"suggestedXrayPort":    suggestedPort,
		"suggestedXrayTarget":  fmt.Sprintf("127.0.0.1#%d", suggestedPort),
		"dnsPortConflict":      dnsPortConflict,
		"dnsPortConflictOwner": conflictOwner,
		"xrayPortConflict":     targetConflict,
		"xrayPortOwner":        targetOwner,
	}
	if !available {
		result["mode"] = "manual"
		result["hint"] = "UCI недоступен, настройте dnsmasq вручную."
		result["adguardHome"] = s.adGuardHomeStatus("192.168.1.1", xrayTarget)
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
	if noresolv && len(servers) == 1 && servers[0] == xrayTarget {
		mode = "xray"
	} else if noresolv && len(servers) > 0 {
		mode = "upstream"
	}
	result["mode"] = mode
	result["noresolv"] = noresolv
	result["servers"] = servers
	result["routerLan"] = lanIP
	result["readiness"] = s.lanDNSReadiness()
	result["adguardHome"] = s.adGuardHomeStatus(lanIP, xrayTarget)
	if plan != nil {
		result["plan"] = plan
	}
	return result
}

func (s *serverState) dnsDiagnostics() map[string]any {
	host := "raw.githubusercontent.com"
	lan := s.lanDNSUpstreamStatus(nil)
	readiness, _ := lan["readiness"].(map[string]any)
	systemProbe := dnsProbe("system", host)
	autoServers := resolvNameservers("/tmp/resolv.conf.d/resolv.conf.auto")
	resolvServers := resolvNameservers("/etc/resolv.conf")
	autoProbes := make([]map[string]any, 0, len(autoServers))
	for _, server := range autoServers {
		autoProbes = append(autoProbes, dnsProbe(server, host))
	}
	xrayProbe := map[string]any{"ok": false, "server": "", "skipped": true}
	if fmt.Sprint(lan["mode"]) == "xray" {
		target := dnsTargetToServer(fmt.Sprint(lan["xrayTarget"]))
		if target != "" {
			xrayProbe = dnsProbe(target, "example.com")
			xrayProbe["skipped"] = false
		}
	}
	warnings := []string{}
	if lan["dnsPortConflict"] == true {
		owner := strings.TrimSpace(fmt.Sprint(lan["dnsPortConflictOwner"]))
		if owner == "" || owner == "<nil>" {
			owner = "другой процесс"
		}
		warnings = append(warnings, fmt.Sprintf("Порт DNS для Xray занят: %s. Подготовьте DNS-вход заново, чтобы RuOpenRay выбрал свободный порт.", owner))
	}
	if fmt.Sprint(lan["mode"]) == "xray" && readiness["ready"] != true {
		warnings = append(warnings, "dnsmasq направлен в Xray DNS, но Xray DNS еще не готов. LAN-клиенты могут остаться без DNS.")
	}
	if adguard, ok := lan["adguardHome"].(map[string]any); ok && adguard["running"] == true && adguard["usesXray"] != true {
		target := strings.TrimSpace(fmt.Sprint(adguard["recommendedLocal"]))
		if target == "" || target == "<nil>" {
			target = "127.0.0.1:10535"
		}
		warnings = append(warnings, "AdGuard Home запущен, но его upstream не смотрит в Xray DNS. Если AdGuard Home главный DNS, укажите upstream "+target+".")
	}
	if systemProbe["ok"] != true && anyDNSProbeOK(autoProbes) {
		warnings = append(warnings, "Системный DNS роутера не ответил, но WAN DNS из OpenWrt работает. Это обычно значит, что локальный DNS смотрит в неработающий 127.0.0.1/::1.")
	}
	if systemProbe["ok"] != true && !anyDNSProbeOK(autoProbes) {
		warnings = append(warnings, "Роутер сейчас не может резолвить домены системным DNS. Обновление geo и загрузки с GitHub могут не работать.")
	}
	summary := "DNS выглядит рабочим"
	if len(warnings) > 0 {
		summary = warnings[0]
	}
	return map[string]any{
		"ok":            len(warnings) == 0,
		"host":          host,
		"summary":       summary,
		"warnings":      warnings,
		"system":        systemProbe,
		"autoServers":   autoServers,
		"autoProbes":    autoProbes,
		"resolvServers": resolvServers,
		"lan":           lan,
		"xrayDns":       xrayProbe,
	}
}

func dnsProbe(server, host string) map[string]any {
	server = strings.TrimSpace(server)
	if server == "" {
		server = "system"
	}
	start := time.Now()
	a, aaaa, err := dnsconfig.ResolveViaServer(server, dnsconfig.CleanCheckHost(host))
	elapsed := time.Since(start).Milliseconds()
	addresses := append([]string{}, a...)
	addresses = append(addresses, aaaa...)
	result := map[string]any{
		"server":     server,
		"host":       host,
		"ok":         err == nil,
		"durationMs": elapsed,
		"a":          a,
		"aaaa":       aaaa,
		"addresses":  addresses,
	}
	if err != nil {
		result["error"] = err.Error()
	}
	return result
}

func anyDNSProbeOK(probes []map[string]any) bool {
	for _, probe := range probes {
		if probe["ok"] == true {
			return true
		}
	}
	return false
}

func resolvNameservers(path string) []string {
	body, err := os.ReadFile(path)
	if err != nil {
		return nil
	}
	seen := map[string]bool{}
	servers := []string{}
	for _, line := range strings.Split(string(body), "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) < 2 || fields[0] != "nameserver" {
			continue
		}
		server := strings.TrimSpace(fields[1])
		if server == "" || seen[server] {
			continue
		}
		seen[server] = true
		servers = append(servers, server)
	}
	return servers
}

func dnsTargetToServer(target string) string {
	target = strings.TrimSpace(target)
	if target == "" || target == "<nil>" {
		return ""
	}
	if strings.Contains(target, "#") {
		parts := strings.Split(target, "#")
		host := strings.Join(parts[:len(parts)-1], "#")
		port := parts[len(parts)-1]
		if host == "" || port == "" {
			return target
		}
		return net.JoinHostPort(strings.Trim(host, "[]"), port)
	}
	return target
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

type adGuardHomeStatus struct {
	Available        bool     `json:"available"`
	Running          bool     `json:"running"`
	Service          string   `json:"service,omitempty"`
	ConfigPath       string   `json:"configPath,omitempty"`
	BindHost         string   `json:"bindHost,omitempty"`
	Port             int      `json:"port,omitempty"`
	Listen           string   `json:"listen,omitempty"`
	Upstreams        []string `json:"upstreams,omitempty"`
	UpstreamCount    int      `json:"upstreamCount"`
	UsesXray         bool     `json:"usesXray"`
	RecommendedLocal string   `json:"recommendedLocal"`
	RecommendedLan   string   `json:"recommendedLan"`
	Hint             string   `json:"hint,omitempty"`
}

func (s *serverState) adGuardHomeStatus(routerLan, xrayTarget string) map[string]any {
	status := adGuardHomeStatus{
		RecommendedLocal: "127.0.0.1:10535",
		RecommendedLan:   firstNonEmpty(routerLan, "192.168.1.1") + ":10535",
	}
	if runtime.GOOS == "windows" {
		status.Hint = "AdGuard Home проверяется только на роутере."
		return adGuardHomeStatusMap(status)
	}
	host, port := dnsTargetHostPort(xrayTarget, "127.0.0.1", defaultXrayDNSPort())
	if port > 0 {
		status.RecommendedLocal = net.JoinHostPort("127.0.0.1", fmt.Sprint(port))
		status.RecommendedLan = net.JoinHostPort(firstNonEmpty(routerLan, "192.168.1.1"), fmt.Sprint(port))
	}
	if service, running := adGuardHomeServiceStatus(); service != "" || running {
		status.Available = true
		status.Service = service
		status.Running = running
	}
	processText := adGuardHomeProcessText()
	if processText != "" {
		status.Available = true
		status.Running = true
		if path := adGuardHomeConfigPathFromProcess(processText); path != "" {
			status.ConfigPath = path
		}
	}
	if status.ConfigPath == "" {
		status.ConfigPath = adGuardHomeConfigPath()
	}
	if status.ConfigPath != "" {
		status.Available = true
		if cfg := readAdGuardHomeConfig(status.ConfigPath); cfg != nil {
			status.BindHost = cfg["bindHost"].(string)
			status.Port = cfg["port"].(int)
			status.Upstreams = sanitizeAdGuardHomeUpstreams(stringSlice(cfg["upstreams"]))
			status.UpstreamCount = len(stringSlice(cfg["upstreams"]))
			status.UsesXray = adGuardHomeUsesXray(stringSlice(cfg["upstreams"]), host, port, routerLan)
			if status.Port > 0 {
				status.Listen = net.JoinHostPort(firstNonEmpty(status.BindHost, "0.0.0.0"), fmt.Sprint(status.Port))
			}
		}
	}
	if status.Available && status.Hint == "" {
		if status.UsesXray {
			status.Hint = "AdGuard Home уже отправляет upstream DNS в Xray."
		} else {
			status.Hint = "Если AdGuard Home главный DNS, в его upstream DNS укажите " + status.RecommendedLocal + " на этом роутере или " + status.RecommendedLan + " с другого устройства."
		}
	}
	return adGuardHomeStatusMap(status)
}

func adGuardHomeStatusMap(status adGuardHomeStatus) map[string]any {
	return map[string]any{
		"available":        status.Available,
		"running":          status.Running,
		"service":          status.Service,
		"configPath":       status.ConfigPath,
		"bindHost":         status.BindHost,
		"port":             status.Port,
		"listen":           status.Listen,
		"upstreams":        status.Upstreams,
		"upstreamCount":    status.UpstreamCount,
		"usesXray":         status.UsesXray,
		"recommendedLocal": status.RecommendedLocal,
		"recommendedLan":   status.RecommendedLan,
		"hint":             status.Hint,
	}
}

func adGuardHomeServiceStatus() (string, bool) {
	for _, service := range []string{"/etc/init.d/AdGuardHome", "/etc/init.d/adguardhome"} {
		if _, err := os.Stat(service); err != nil {
			continue
		}
		result := runTimeout(3*time.Second, service, "status")
		text := strings.ToLower(strings.TrimSpace(fmt.Sprint(result["stdout"]) + "\n" + fmt.Sprint(result["stderr"])))
		running := adGuardHomeStatusTextRunning(text)
		return service, running
	}
	return "", false
}

func adGuardHomeStatusTextRunning(text string) bool {
	text = strings.ToLower(text)
	if strings.Contains(text, "inactive") || strings.Contains(text, "stopped") || strings.Contains(text, "not running") {
		return false
	}
	return strings.Contains(text, "running") || strings.Contains(text, "started") || strings.Contains(text, " active")
}

func adGuardHomeProcessText() string {
	result := runTimeout(3*time.Second, "sh", "-c", "ps w 2>/dev/null | grep -i '[A]dGuardHome'")
	return strings.TrimSpace(fmt.Sprint(result["stdout"]))
}

func adGuardHomeConfigPathFromProcess(processText string) string {
	fields := strings.Fields(processText)
	for i, field := range fields {
		switch {
		case field == "-c" || field == "--config":
			if i+1 < len(fields) {
				return strings.Trim(fields[i+1], "'\"")
			}
		case strings.HasPrefix(field, "-c="):
			return strings.Trim(strings.TrimPrefix(field, "-c="), "'\"")
		case strings.HasPrefix(field, "--config="):
			return strings.Trim(strings.TrimPrefix(field, "--config="), "'\"")
		}
	}
	return ""
}

func adGuardHomeConfigPath() string {
	candidates := []string{
		"/etc/AdGuardHome.yaml",
		"/etc/adguardhome.yaml",
		"/etc/AdGuardHome/AdGuardHome.yaml",
		"/etc/adguardhome/AdGuardHome.yaml",
		"/opt/AdGuardHome/AdGuardHome.yaml",
		"/opt/AdGuardHome/AdGuardHome.yml",
	}
	for _, path := range candidates {
		if info, err := os.Stat(path); err == nil && !info.IsDir() {
			return path
		}
	}
	return ""
}

func readAdGuardHomeConfig(path string) map[string]any {
	body, err := os.ReadFile(path)
	if err != nil {
		return nil
	}
	bindHost, port, upstreams := parseAdGuardHomeConfig(string(body))
	return map[string]any{
		"bindHost":  bindHost,
		"port":      port,
		"upstreams": upstreams,
	}
}

func parseAdGuardHomeConfig(body string) (string, int, []string) {
	bindHost := ""
	port := 0
	upstreams := []string{}
	inDNS := false
	dnsIndent := 0
	inUpstreams := false
	upstreamIndent := 0
	inBindHosts := false
	bindHostsIndent := 0
	for _, raw := range strings.Split(body, "\n") {
		line := strings.TrimRight(raw, "\r")
		trimmed := strings.TrimSpace(line)
		if trimmed == "" || strings.HasPrefix(trimmed, "#") {
			continue
		}
		indent := len(line) - len(strings.TrimLeft(line, " "))
		if trimmed == "dns:" {
			inDNS = true
			dnsIndent = indent
			inUpstreams = false
			continue
		}
		if inDNS && indent <= dnsIndent && strings.HasSuffix(trimmed, ":") {
			inDNS = false
			inUpstreams = false
			inBindHosts = false
		}
		if !inDNS {
			continue
		}
		if inBindHosts {
			if indent <= bindHostsIndent && strings.Contains(trimmed, ":") && !strings.HasPrefix(trimmed, "-") {
				inBindHosts = false
			} else if bindHost == "" && strings.HasPrefix(trimmed, "- ") {
				bindHost = cleanYAMLScalar(strings.TrimPrefix(trimmed, "- "))
				continue
			}
		}
		if strings.HasPrefix(trimmed, "bind_host:") {
			bindHost = cleanYAMLScalar(strings.TrimPrefix(trimmed, "bind_host:"))
			continue
		}
		if strings.HasPrefix(trimmed, "bind_hosts:") {
			inBindHosts = true
			bindHostsIndent = indent
			continue
		}
		if strings.HasPrefix(trimmed, "port:") {
			port = number(cleanYAMLScalar(strings.TrimPrefix(trimmed, "port:")), 0)
			continue
		}
		if strings.HasPrefix(trimmed, "upstream_dns:") {
			inUpstreams = true
			upstreamIndent = indent
			continue
		}
		if inUpstreams {
			if indent <= upstreamIndent && strings.Contains(trimmed, ":") && !strings.HasPrefix(trimmed, "-") {
				inUpstreams = false
				continue
			}
			if strings.HasPrefix(trimmed, "- ") {
				value := cleanYAMLScalar(strings.TrimPrefix(trimmed, "- "))
				if value != "" {
					upstreams = append(upstreams, value)
				}
			}
		}
	}
	return bindHost, port, upstreams
}

func cleanYAMLScalar(value string) string {
	value = strings.TrimSpace(value)
	value = strings.SplitN(value, " #", 2)[0]
	return strings.Trim(strings.TrimSpace(value), "'\"")
}

func sanitizeAdGuardHomeUpstreams(upstreams []string) []string {
	out := make([]string, 0, len(upstreams))
	for _, upstream := range upstreams {
		out = append(out, redactURLUserinfo(strings.TrimSpace(upstream)))
	}
	return out
}

func redactURLUserinfo(value string) string {
	if !strings.Contains(value, "://") || !strings.Contains(value, "@") {
		return value
	}
	parts := strings.SplitN(value, "://", 2)
	hostPart := parts[1]
	at := strings.LastIndex(hostPart, "@")
	if at <= 0 {
		return value
	}
	return parts[0] + "://***@" + hostPart[at+1:]
}

func adGuardHomeUsesXray(upstreams []string, host string, port int, routerLan string) bool {
	if port <= 0 {
		return false
	}
	targets := map[string]bool{
		fmt.Sprintf("127.0.0.1:%d", port): true,
		fmt.Sprintf("127.0.0.1#%d", port): true,
		fmt.Sprintf("localhost:%d", port): true,
		fmt.Sprintf("localhost#%d", port): true,
		fmt.Sprintf("%s:%d", host, port):  true,
		fmt.Sprintf("%s#%d", host, port):  true,
	}
	if routerLan != "" {
		targets[fmt.Sprintf("%s:%d", routerLan, port)] = true
		targets[fmt.Sprintf("%s#%d", routerLan, port)] = true
	}
	for _, upstream := range upstreams {
		value := normalizeAdGuardHomeUpstream(upstream)
		if targets[value] {
			return true
		}
	}
	return false
}

func normalizeAdGuardHomeUpstream(value string) string {
	value = cleanYAMLScalar(value)
	if strings.HasPrefix(value, "[/") {
		if idx := strings.LastIndex(value, "]"); idx >= 0 && idx+1 < len(value) {
			value = strings.TrimSpace(value[idx+1:])
		}
	}
	if strings.Contains(value, "://") {
		parts := strings.SplitN(value, "://", 2)
		value = parts[1]
		if at := strings.LastIndex(value, "@"); at >= 0 && at+1 < len(value) {
			value = value[at+1:]
		}
		value = strings.SplitN(value, "/", 2)[0]
	}
	return strings.Trim(value, "[] ")
}

func dnsTargetHostPort(target, fallbackHost string, fallbackPort int) (string, int) {
	target = strings.TrimSpace(target)
	if target == "" {
		return fallbackHost, fallbackPort
	}
	if strings.Contains(target, "#") {
		parts := strings.Split(target, "#")
		host := strings.Trim(strings.Join(parts[:len(parts)-1], "#"), "[] ")
		port := number(parts[len(parts)-1], fallbackPort)
		if host == "" {
			host = fallbackHost
		}
		return host, port
	}
	if host, port, err := net.SplitHostPort(target); err == nil {
		return strings.Trim(host, "[] "), number(port, fallbackPort)
	}
	if strings.Count(target, ":") == 1 {
		parts := strings.Split(target, ":")
		return strings.Trim(parts[0], "[] "), number(parts[1], fallbackPort)
	}
	return fallbackHost, fallbackPort
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
	upstream := fmt.Sprint(payload["upstream"])
	if mode == "xray" && strings.TrimSpace(upstream) == "" {
		upstream = s.xrayDNSUpstreamTarget()
	}
	plan, err := dnsconfig.LANCommandPlan(mode, upstream, restart)
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
	before := s.lanDNSUpstreamStatus(plan)
	if lanDNSStatusMatchesRequest(before, mode, upstream) {
		before["ok"] = true
		before["alreadyApplied"] = true
		before["steps"] = []map[string]any{}
		return before
	}
	readiness := s.lanDNSReadiness()
	if mode == "xray" && readiness["ready"] != true {
		status := s.lanDNSUpstreamStatus(plan)
		status["ok"] = false
		status["readiness"] = readiness
		status["error"] = "DNS-вход Xray еще не готов. Сначала примените конфигурацию Xray и убедитесь, что порт " + fmt.Sprint(readiness["targetTCP"]) + " слушает."
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
	if !ok && lanDNSStatusMatchesRequest(status, mode, upstream) {
		ok = true
		status["warning"] = "Некоторые команды вернули ненулевой код, но итоговая настройка dnsmasq уже соответствует выбранному режиму."
	}
	status["ok"] = ok
	status["steps"] = steps
	return status
}

func lanDNSStatusMatchesRequest(status map[string]any, mode, upstream string) bool {
	mode = strings.TrimSpace(mode)
	if mode == "" {
		mode = "xray"
	}
	if fmt.Sprint(status["mode"]) != mode {
		return false
	}
	switch mode {
	case "system":
		return true
	case "xray":
		target := strings.TrimSpace(upstream)
		if target == "" || target == "<nil>" {
			target = fmt.Sprint(status["xrayTarget"])
		}
		target = dnsconfig.NormalizeDnsmasqServer(target)
		for _, server := range stringSlice(status["servers"]) {
			if server == target {
				return true
			}
		}
		return false
	case "upstream":
		target := dnsconfig.NormalizeDnsmasqServer(upstream)
		if target == "" {
			return false
		}
		for _, server := range stringSlice(status["servers"]) {
			if server == target {
				return true
			}
		}
		return false
	default:
		return false
	}
}

func (s *serverState) lanDNSReadiness() map[string]any {
	cfg, err := s.readActiveConfig()
	if err != nil {
		return map[string]any{"ready": false, "error": err.Error()}
	}
	targetHost, targetPort, inboundReady := xrayDNSInboundEndpoint(cfg)
	targetTCP := fmt.Sprintf("%s:%d", targetHost, targetPort)
	targetUDP := targetTCP
	outboundReady := false
	ruleReady := false
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
	portReady := tcpPortOpen(targetTCP, 700*time.Millisecond)
	udpOwner := udpPortOwner(targetHost, targetPort)
	return map[string]any{
		"ready":       inboundReady && outboundReady && ruleReady && portReady,
		"inbound":     inboundReady,
		"outbound":    outboundReady,
		"rule":        ruleReady,
		"port":        portReady,
		"target":      fmt.Sprintf("%s#%d", targetHost, targetPort),
		"targetTCP":   targetTCP,
		"targetUDP":   targetUDP,
		"udpOwner":    udpOwner,
		"udpConflict": udpOwner != "" && !strings.Contains(udpOwner, "/xray"),
	}
}

func (s *serverState) xrayDNSUpstreamTarget() string {
	cfg, err := s.readActiveConfig()
	if err != nil {
		return dnsconfig.DefaultXrayDnsmasqTarget
	}
	host, port, _ := xrayDNSInboundEndpoint(cfg)
	return fmt.Sprintf("%s#%d", host, port)
}

func xrayDNSInboundEndpoint(cfg map[string]any) (string, int, bool) {
	host := "127.0.0.1"
	port := defaultXrayDNSPort()
	for _, item := range anySlice(cfg["inbounds"]) {
		inbound, ok := item.(map[string]any)
		if !ok || fmt.Sprint(inbound["tag"]) != "ruopenray_dns_in" {
			continue
		}
		listen := strings.TrimSpace(fmt.Sprint(inbound["listen"]))
		switch listen {
		case "", "<nil>", "0.0.0.0", "::":
			host = "127.0.0.1"
		default:
			host = listen
		}
		if value := number(inbound["port"], 0); value > 0 && value < 65536 {
			port = value
		}
		return host, port, true
	}
	return host, port, false
}

func defaultXrayDNSPort() int {
	return dnsPortFromTarget(dnsconfig.DefaultXrayDnsmasqTarget, 10535)
}

func suggestedXrayDNSPort() (int, string) {
	candidates := []int{defaultXrayDNSPort(), 15353, 53530, 5353}
	seen := map[int]bool{}
	var conflictOwner string
	checked := []int{}
	for _, port := range candidates {
		if port <= 0 || port > 65535 || seen[port] {
			continue
		}
		seen[port] = true
		checked = append(checked, port)
		owner := udpPortOwner("127.0.0.1", port)
		if len(checked) == 1 && owner != "" && !strings.Contains(owner, "/xray") {
			conflictOwner = owner
		}
		if owner == "" || strings.Contains(owner, "/xray") {
			return port, conflictOwner
		}
	}
	return checked[len(checked)-1], conflictOwner
}

func setXrayDNSInboundPort(cfg map[string]any, port int) bool {
	if port <= 0 || port > 65535 {
		return false
	}
	for _, item := range anySlice(cfg["inbounds"]) {
		inbound, ok := item.(map[string]any)
		if ok && fmt.Sprint(inbound["tag"]) == "ruopenray_dns_in" {
			inbound["port"] = port
			return true
		}
	}
	return false
}

func (s *serverState) guardXrayDNSPortBeforeStart() map[string]any {
	if runtime.GOOS == "windows" || s.cfg.ServiceName != "xray" {
		return map[string]any{"ok": true, "skipped": true}
	}
	cfg, err := s.readActiveConfig()
	if err != nil {
		return map[string]any{"ok": true, "skipped": true, "message": err.Error()}
	}
	host, port, found := xrayDNSInboundEndpoint(cfg)
	if !found {
		return map[string]any{"ok": true, "skipped": true}
	}
	owner := udpPortOwner(host, port)
	if owner == "" || strings.Contains(owner, "/xray") {
		return map[string]any{"ok": true, "port": port, "owner": owner}
	}
	nextPort, _ := suggestedXrayDNSPort()
	if nextPort == port || nextPort <= 0 || nextPort > 65535 {
		message := fmt.Sprintf("DNS-вход Xray не сможет стартовать: UDP %s:%d занят процессом %s, свободный порт не найден.", host, port, owner)
		return map[string]any{"ok": false, "port": port, "owner": owner, "stderr": message, "message": message}
	}
	if !setXrayDNSInboundPort(cfg, nextPort) {
		message := "DNS-вход Xray найден, но RuOpenRay не смог изменить его порт."
		return map[string]any{"ok": false, "port": port, "owner": owner, "stderr": message, "message": message}
	}
	if err := s.writeActiveConfig(cfg); err != nil {
		message := "Не удалось сохранить новый порт DNS-входа Xray: " + err.Error()
		return map[string]any{"ok": false, "port": port, "owner": owner, "stderr": message, "message": message}
	}
	oldTarget := fmt.Sprintf("%s#%d", host, port)
	newTarget := fmt.Sprintf("%s#%d", host, nextPort)
	dnsmasq := s.repointDnsmasqTarget(oldTarget, newTarget)
	dnsmasqOK := dnsmasq["ok"] == true
	message := fmt.Sprintf("DNS-вход Xray перенесен с %s на %s: старый порт занят процессом %s.", oldTarget, newTarget, owner)
	if !dnsmasqOK {
		message += " dnsmasq не удалось перенастроить автоматически: " + fmt.Sprint(dnsmasq["stderr"])
	}
	return map[string]any{
		"ok":        true,
		"migrated":  true,
		"from":      oldTarget,
		"to":        newTarget,
		"port":      nextPort,
		"owner":     owner,
		"dnsmasqOk": dnsmasqOK,
		"dnsmasq":   dnsmasq,
		"stdout":    message,
		"message":   message,
	}
}

func (s *serverState) repointDnsmasqTarget(oldTarget, newTarget string) map[string]any {
	if runtime.GOOS == "windows" || !commandExists("uci") {
		return map[string]any{"ok": true, "skipped": true}
	}
	servers := dnsmasqServerList()
	usesOldTarget := false
	for _, server := range servers {
		if server == oldTarget {
			usesOldTarget = true
			break
		}
	}
	if !usesOldTarget {
		return map[string]any{"ok": true, "skipped": true, "message": "dnsmasq не был направлен на старый DNS-вход"}
	}
	steps := []map[string]any{
		run("uci", "-q", "del_list", "dhcp.@dnsmasq[0].server="+oldTarget),
		run("uci", "add_list", "dhcp.@dnsmasq[0].server="+newTarget),
		run("uci", "commit", "dhcp"),
	}
	if _, err := os.Stat("/etc/init.d/dnsmasq"); err == nil {
		steps = append(steps, runTimeout(15*time.Second, "/etc/init.d/dnsmasq", "restart"))
	}
	ok := true
	for _, step := range steps {
		if step["ok"] != true {
			ok = false
		}
	}
	return map[string]any{"ok": ok, "from": oldTarget, "to": newTarget, "steps": steps, "stdout": concatCommandOutput(steps...)}
}

func dnsPortFromTarget(target string, fallback int) int {
	target = strings.TrimSpace(target)
	if target == "" {
		return fallback
	}
	if strings.Contains(target, "#") {
		parts := strings.Split(target, "#")
		return number(parts[len(parts)-1], fallback)
	}
	if host, port, err := net.SplitHostPort(target); err == nil && host != "" && port != "" {
		return number(port, fallback)
	}
	if strings.Count(target, ":") == 1 {
		parts := strings.Split(target, ":")
		return number(parts[1], fallback)
	}
	return fallback
}

func tcpPortOpen(address string, timeout time.Duration) bool {
	conn, err := net.DialTimeout("tcp", address, timeout)
	if err != nil {
		return false
	}
	_ = conn.Close()
	return true
}

func udpPortOwner(_ string, port int) string {
	if runtime.GOOS == "windows" || port <= 0 || port > 65535 {
		return ""
	}
	needle := fmt.Sprintf(":%d", port)
	result := runTimeout(2*time.Second, "sh", "-c", fmt.Sprintf("(netstat -lnup 2>/dev/null || ss -lunp 2>/dev/null) | grep ':%d'", port))
	text := strings.TrimSpace(fmt.Sprint(result["stdout"]))
	if text == "" || !strings.Contains(text, needle) {
		return ""
	}
	lines := strings.Split(text, "\n")
	chosen := strings.TrimSpace(lines[0])
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line != "" && !strings.Contains(line, "/xray") {
			chosen = line
			break
		}
	}
	fields := strings.Fields(chosen)
	if len(fields) == 0 {
		return chosen
	}
	return fields[len(fields)-1]
}

func (s *serverState) checkDNS(w http.ResponseWriter, r *http.Request) {
	payload, _ := readJSON(w, r)
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
