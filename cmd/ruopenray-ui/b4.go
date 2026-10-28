package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"time"
)

const (
	b4ServicePath = "/etc/init.d/b4"
	b4UIPort      = 7000
	b4RouteTable  = "b4_route"
	b4APIBaseURL  = "http://127.0.0.1:7000/api"
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
	if cfg, err := s.loadB4Settings(); err == nil {
		result["directEnabled"] = cfg.DirectEnabled
	}
	if active, err := s.readActiveConfig(); err == nil {
		result["directPrepared"] = len(b4DirectConfigIssues(active)) == 0
	}
	if runtime.GOOS == "windows" {
		result["summary"] = "B4 проверяется только на роутере"
		return result
	}

	service := map[string]any{"path": b4ServicePath, "exists": fileExists(b4ServicePath), "running": false, "enabled": false}
	if service["exists"] == true {
		status := runTimeout(3*time.Second, b4ServicePath, "status")
		text := concatCommandOutput(status)
		service["status"] = status
		service["running"] = b4StatusTextRunning(text)
		enabled := runTimeout(3*time.Second, b4ServicePath, "enabled")
		service["enabled"] = enabled["ok"] == true
		service["enabledStatus"] = enabled
		result["available"] = true
		result["running"] = service["running"]
	}
	result["service"] = service

	ps := runTimeout(3*time.Second, "ps", "w")
	processText := strings.Join(b4ProcessLines(fmt.Sprint(ps["stdout"])), "\n")
	result["process"] = map[string]any{"found": processText != "", "text": processText}
	if processText != "" {
		result["available"] = true
		result["running"] = true
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
	api := s.b4APIStatus()
	result["api"] = api
	if config, ok := api["config"].(map[string]any); ok {
		queue := mapValue(config["queue"])
		mark := uint32(b4IntFromAny(queue["mark"]))
		awgMark, _ := strconvParseMark(amneziaFwMark)
		legacyMark, _ := strconvParseMark(amneziaLegacyFwMark)
		routing["markConflict"] = mark&(awgMark|legacyMark) != 0
	}
	if boolMap(api, "available") {
		result["available"] = true
	}
	if boolMap(api, "running") {
		result["running"] = true
	}
	if commandExists("uci") {
		uci := runTimeout(3*time.Second, "uci", "-q", "show", "b4")
		result["uci"] = map[string]any{"ok": uci["ok"], "found": strings.TrimSpace(fmt.Sprint(uci["stdout"])) != "", "stdout": fmt.Sprint(uci["stdout"])}
		if strings.TrimSpace(fmt.Sprint(uci["stdout"])) != "" {
			result["available"] = true
		}
	}

	active := b4StatusActive(nft, iptables, routing, api)
	result["active"] = active
	issues, _ := api["startIssues"].([]string)
	result["externalConfigSafe"] = boolMap(api, "authenticated") && boolMap(mapValue(api["config"]), "skipSetup") && len(issues) == 0 && api["setsError"] == nil
	result["managedDirectOnly"] = boolMap(result, "directEnabled") && boolMap(result, "directPrepared") &&
		boolMap(nft, "managedDirect") && !boolMap(nft, "otherB4") && !boolMap(nft, "foreignQueue") &&
		!boolMap(iptables, "hasB4") && !boolMap(iptables, "hasNFQUEUE") && !boolMap(routing, "explicitB4") &&
		boolMap(result, "externalConfigSafe")
	warnings := b4Warnings(result)
	result["warnings"] = warnings
	switch {
	case active && !boolMap(result, "running"):
		result["summary"] = "Правила B4 найдены, но сервис не работает"
	case active:
		result["summary"] = "Найдены правила перехвата или перенаправления B4"
	case result["running"] == true || boolMap(result["process"].(map[string]any), "found"):
		result["summary"] = "B4 запущен, но активных следов firewall/NFQUEUE не видно"
	case boolMap(service, "enabled") && result["available"] == true:
		result["summary"] = "B4 установлен и включен в автозапуск, но сейчас не активен"
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

func b4StatusActive(nft, iptables, routing, api map[string]any) bool {
	return boolMap(nft, "hasB4") ||
		boolMap(iptables, "hasB4") ||
		boolMap(routing, "explicitB4") ||
		boolMap(api, "queueActive")
}

func (s *serverState) b4APIStatus() map[string]any {
	s.b4Mu.Lock()
	defer s.b4Mu.Unlock()
	cfg, err := s.loadB4Settings()
	if err != nil {
		return map[string]any{"available": false, "error": "Не удалось прочитать настройки API B4"}
	}
	c := newB4Client(cfg, &s.b4Token, &s.b4LoginAfter, &s.b4LoginKey)
	defer c.close()
	return b4APIStatusWithClient(c)
}

func b4APIStatusFromBase(baseURL string) map[string]any {
	token := ""
	after := time.Time{}
	key := ""
	c := newB4Client(b4Settings{URL: strings.TrimSuffix(strings.TrimRight(baseURL, "/"), "/api")}, &token, &after, &key)
	defer c.close()
	return b4APIStatusWithClient(c)
}

func b4APIStatusWithClient(c *b4Client) map[string]any {
	result := map[string]any{"available": false, "running": false, "authRequired": false, "queueActive": false, "summary": "B4 API не отвечает", "url": c.cfg.URL, "username": c.cfg.Username, "hasPassword": c.cfg.Password != ""}
	var version map[string]any
	code, err := c.raw(http.MethodGet, "/version", nil, &version)
	result["versionStatus"] = code
	if err != nil && code != 401 {
		result["error"] = err.Error()
		return result
	}
	result["available"] = true
	result["version"] = b4FirstString(version["version"], version["data"])
	var auth map[string]any
	code, err = c.raw(http.MethodGet, "/auth/check", nil, &auth)
	result["authRequired"] = code == 401 || boolMap(auth, "auth_required")
	if err != nil && code != 401 {
		result["error"] = err.Error()
		return result
	}
	var config map[string]any
	if err = c.call(http.MethodGet, "/config", nil, &config); err != nil {
		result["error"] = err.Error()
		result["summary"] = "B4 API найден, доступ к конфигурации не получен"
		return result
	}
	summary := b4APISummarizeConfig(config)
	result["config"] = summary
	result["setsEnabled"] = summary["setsEnabled"]
	result["authenticated"] = true
	result["running"] = true // protected API is responding in a live B4 process
	var sets []map[string]any
	if err = c.call(http.MethodGet, "/sets", nil, &sets); err == nil {
		result["sets"] = b4PublicSets(sets)
		result["startIssues"] = b4StartIssues(summary, sets)
	} else {
		result["setsError"] = err.Error()
	}
	var metrics map[string]any
	if err = c.call(http.MethodGet, "/metrics/summary", nil, &metrics); err == nil {
		result["metrics"] = b4APISummarizeMetrics(metrics)
	} else {
		result["metricsError"] = err.Error()
	}
	var frame map[string]any
	if err = c.call(http.MethodGet, "/metrics", nil, &frame); err == nil {
		engine := mapValue(frame["engine"])
		result["engine"] = map[string]any{"state": engine["state"], "mode": engine["mode"], "threads": engine["threads"], "firewall": engine["firewall"]}
		// External queues need actual firewall evidence, not just a listening engine.
		result["queueActive"] = stringValue(engine["state"]) == "running" && stringValue(engine["firewall"]) != "" && stringValue(engine["firewall"]) != "external" && stringValue(engine["firewall"]) != "none" && !boolMap(summary, "skipSetup")
		result["lastPacketAt"] = frame["last_packet_at"]
		result["engineFailure"] = mapValue(frame["engine_failure"])
	}
	result["summary"] = "B4 API подключён"
	return result
}

func b4PublicSets(sets []map[string]any) []map[string]any {
	out := []map[string]any{}
	for _, set := range sets {
		targets := mapValue(set["targets"])
		out = append(out, map[string]any{"id": set["id"], "name": set["name"], "revision": set["revision"], "enabled": boolPayload(set, "enabled", true), "domains": b4StringSliceFromAny(targets["sni_domains"], 0), "ips": b4StringSliceFromAny(targets["ip"], 0), "geosite": b4StringSliceFromAny(targets["geosite_categories"], 0), "routingEnabled": boolMap(mapValue(set["routing"]), "enabled"), "dnsEnabled": boolMap(mapValue(set["dns"]), "enabled")})
	}
	return out
}

func b4APISummarizeDiagnostics(payload map[string]any) map[string]any {
	data, _ := payload["data"].(map[string]any)
	if data == nil {
		data = payload
	}
	b4, _ := data["b4"].(map[string]any)
	firewall, _ := data["firewall"].(map[string]any)
	network, _ := data["network"].(map[string]any)
	result := map[string]any{
		"running":        boolMap(b4, "running"),
		"version":        b4FirstString(b4["version"]),
		"pid":            b4IntFromAny(b4["pid"]),
		"uptime":         b4FirstString(b4["uptime"]),
		"configPath":     b4FirstString(b4["config_path"]),
		"serviceManager": b4FirstString(b4["service_manager"]),
	}
	if len(firewall) > 0 {
		result["firewall"] = firewall
		result["firewallBackend"] = b4FirstString(firewall["backend"])
		result["nfqueueWorks"] = boolMap(firewall, "nfqueue_works")
	}
	if len(network) > 0 {
		result["network"] = network
	}
	return result
}

func b4APISummarizeConfig(payload map[string]any) map[string]any {
	data, _ := payload["data"].(map[string]any)
	if data == nil {
		data = payload
	}
	queue, _ := data["queue"].(map[string]any)
	setsSummary := b4APISummarizeSets(data["sets"])
	interfaces := b4StringSliceFromAny(queue["interfaces"], 12)
	queueConfigured := boolPayload(queue, "ipv4", true) || boolPayload(queue, "ipv6", false)
	queueScope := "selected"
	if queueConfigured && len(interfaces) == 0 {
		queueScope = "all"
	}
	result := map[string]any{
		"version":         b4FirstString(data["version"]),
		"success":         boolMap(data, "success"),
		"warnings":        b4StringSliceFromAny(data["warnings"], 10),
		"availableIfaces": b4StringSliceFromAny(data["available_ifaces"], 12),
		"queue": map[string]any{
			"interfaces": interfaces,
			"ipv4":       boolPayload(queue, "ipv4", true),
			"ipv6":       boolMap(queue, "ipv6"),
			"mark":       b4DefaultInt(queue, "mark", 32768),
			"startNum":   b4DefaultInt(queue, "start_num", 537),
			"threads":    b4DefaultInt(queue, "threads", 4),
			"mode":       firstNonEmpty(stringValue(queue["mode"]), "nfqueue"),
		},
		"sets":            setsSummary,
		"queueActive":     false,
		"skipSetup":       boolMap(mapValue(mapValue(data["system"])["tables"]), "skip_setup"),
		"queueConfigured": queueConfigured,
		"queueScope":      queueScope,
		"setsEnabled":     boolMap(setsSummary, "enabled"),
	}
	return result
}

func b4APISummarizeSets(value any) map[string]any {
	result := map[string]any{"total": 0, "enabled": false, "enabledCount": 0, "names": []string{}}
	items, ok := value.([]any)
	if !ok {
		return result
	}
	names := []string{}
	enabledCount := 0
	for _, item := range items {
		set, _ := item.(map[string]any)
		if set == nil {
			continue
		}
		if boolPayload(set, "enabled", true) {
			enabledCount++
			if len(names) < 12 {
				name := b4FirstString(set["name"], set["id"])
				if name != "" {
					names = append(names, name)
				}
			}
		}
	}
	result["total"] = len(items)
	result["enabled"] = enabledCount > 0
	result["enabledCount"] = enabledCount
	result["names"] = names
	return result
}

func b4APISummarizeMetrics(payload map[string]any) map[string]any {
	data, _ := payload["data"].(map[string]any)
	if data == nil {
		data = payload
	}
	result := map[string]any{}
	for _, key := range []string{"connections", "connections_in_sets", "connections_last_minute", "rst_dropped", "blocked_total", "uptime", "uptime_s", "cpu_percent", "rss_bytes", "mem_total_bytes", "total_packets", "dropped_packets", "processed_packets", "active_connections"} {
		if _, ok := data[key]; ok {
			result[key] = data[key]
		}
	}
	return result
}

func b4FirstString(values ...any) string {
	for _, value := range values {
		text := strings.TrimSpace(fmt.Sprint(value))
		if text != "" && text != "<nil>" {
			return text
		}
	}
	return ""
}

func b4IntFromAny(value any) int {
	switch typed := value.(type) {
	case int:
		return typed
	case int64:
		return int(typed)
	case float64:
		return int(typed)
	case json.Number:
		n, _ := typed.Int64()
		return int(n)
	default:
		return 0
	}
}

func b4StringSliceFromAny(value any, limit int) []string {
	out := []string{}
	items, ok := value.([]any)
	if !ok {
		return out
	}
	for _, item := range items {
		text := b4FirstString(item)
		if text == "" {
			continue
		}
		out = append(out, text)
		if limit > 0 && len(out) >= limit {
			break
		}
	}
	return out
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
	result := runTimeout(5*time.Second, "nft", "list", "ruleset")
	return b4ParseNFT(stringValue(result["stdout"]))
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
	rulesText := strings.TrimSpace(fmt.Sprint(rules["stdout"]))
	policyRules := b4ParsePolicyRules(rulesText)
	tables := []int{}
	marks := []string{}
	tableSeen := map[int]bool{}
	markSeen := map[string]bool{}
	markConflict := false // AWG policy rules alone do not belong to B4.
	namedRouteResult := runTimeout(3*time.Second, "ip", "route", "show", "table", b4RouteTable)
	routeResults := []map[string]any{}
	routeSamples := []string{}
	for _, rule := range policyRules {
		if !tableSeen[rule.Table] {
			tableSeen[rule.Table] = true
			tables = append(tables, rule.Table)
			if len(tables) <= 32 {
				result := runTimeout(3*time.Second, "ip", "route", "show", "table", strconv.Itoa(rule.Table))
				routeResults = append(routeResults, result)
				if text := strings.TrimSpace(fmt.Sprint(result["stdout"])); text != "" {
					routeSamples = append(routeSamples, fmt.Sprintf("table %d:\n%s", rule.Table, text))
				}
			}
		}
		if rule.Mark != "" && !markSeen[rule.Mark] {
			markSeen[rule.Mark] = true
			marks = append(marks, rule.Mark)
		}

	}
	sort.Ints(tables)
	sort.Strings(marks)
	lowerRules := strings.ToLower(rulesText)
	explicitRule := strings.Contains(lowerRules, "lookup "+b4RouteTable) || strings.Contains(lowerRules, "table "+b4RouteTable) || strings.Contains(lowerRules, "b4")
	explicitRoute := b4RouteOutputActive(namedRouteResult)
	return map[string]any{
		"available":        true,
		"ipRule":           explicitRule,
		"route":            explicitRoute,
		"explicitB4":       explicitRule || explicitRoute,
		"policyRule":       len(policyRules) > 0,
		"policyRoute":      b4RouteOutputActive(routeResults...),
		"legacyTable":      b4RouteTable,
		"tables":           tables,
		"marks":            marks,
		"markConflict":     markConflict,
		"ruopenrayAWGMark": amneziaFwMark,
		"rules":            rulesText,
		"stdout":           strings.Join(routeSamples, "\n"),
	}
}

type b4PolicyRule struct {
	Table int
	Mark  string
}

func b4ParsePolicyRules(output string) []b4PolicyRule {
	rules := []b4PolicyRule{}
	for _, line := range strings.Split(output, "\n") {
		fields := strings.Fields(strings.ToLower(strings.TrimSpace(line)))
		table := 0
		mark := ""
		for index, field := range fields {
			if (field == "lookup" || field == "table") && index+1 < len(fields) {
				value, err := strconv.Atoi(strings.TrimSpace(fields[index+1]))
				if err == nil {
					table = value
				}
			}
			if field == "fwmark" && index+1 < len(fields) {
				mark = strings.SplitN(strings.TrimSpace(fields[index+1]), "/", 2)[0]
				if value, err := strconv.ParseUint(mark, 0, 32); err == nil {
					mark = fmt.Sprintf("0x%x", value)
				}
			}
		}
		if table >= 100 && table <= 249 {
			rules = append(rules, b4PolicyRule{Table: table, Mark: mark})
		}
	}
	return rules
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
			strings.Contains(lower, "jq ") ||
			strings.Contains(lower, "ruopenray-ui") ||
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
	text := strings.TrimSpace(out)
	lower := strings.ToLower(text)
	b4Owner := strings.Contains(lower, "/b4") || strings.Contains(lower, " b4 ") || strings.Contains(lower, "b4-web")
	owner := "other"
	if b4Owner {
		owner = "b4"
	}
	return map[string]any{
		"ui":       text != "" && b4Owner,
		"occupied": text != "",
		"owner":    owner,
		"uiPort":   b4UIPort,
		"text":     text,
	}
}

func b4Warnings(status map[string]any) []string {
	warnings := []string{}
	nft, _ := status["nft"].(map[string]any)
	iptables, _ := status["iptables"].(map[string]any)
	routing, _ := status["routing"].(map[string]any)
	if (boolMap(nft, "hasQueue") || boolMap(iptables, "hasNFQUEUE")) && !boolMap(status, "managedDirectOnly") {
		warnings = append(warnings, "Найдены NFQUEUE-правила. Если B4 обрабатывает те же LAN-пакеты, RuOpenRay и B4 нужно разводить по владельцу перехвата.")
	}
	if boolMap(nft, "hasDNSRedirect") {
		warnings = append(warnings, "Похоже, B4 участвует в обработке DNS. Не включайте одновременно DNS-перехват RuOpenRay и B4 на одни и те же домены без явной схемы.")
	}
	if boolMap(routing, "explicitB4") {
		warnings = append(warnings, "Найдены route table/rules B4. При параллельной работе важно не пересекать policy routing и fwmark.")
	}
	if boolMap(routing, "markConflict") {
		warnings = append(warnings, fmt.Sprintf("Критический конфликт: B4 и RuOpenRay AWG используют fwmark %s. Измените mark одной из систем до параллельного запуска.", amneziaFwMark))
	}
	if api, ok := status["api"].(map[string]any); ok {
		if config, ok := api["config"].(map[string]any); ok && fmt.Sprint(config["queueScope"]) == "all" && !boolMap(config, "skipSetup") {
			warnings = append(warnings, "B4 настроен с пустым списком interfaces: это означает обработку всех интерфейсов, включая AWG/Xray-трафик, если его не исключить явно.")
		}
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

func b4DefaultInt(m map[string]any, key string, fallback int) int {
	if _, ok := m[key]; !ok {
		return fallback
	}
	return b4IntFromAny(m[key])
}

func b4ParseNFT(text string) map[string]any {
	own := false
	managed := false
	managedDirect := false
	otherB4 := false
	foreignQueue := false
	hasB4 := false
	hasQueue := false
	hasDNS := false
	sample := []string{}
	for _, line := range strings.Split(text, "\n") {
		lower := strings.ToLower(strings.TrimSpace(line))
		if strings.HasPrefix(lower, "table ") {
			own = strings.Contains(lower, "b4")
			managed = strings.Contains(lower, "table inet "+b4DirectTable+" {")
		}
		queue := false
		if !strings.HasPrefix(lower, "chain ") && !strings.HasPrefix(lower, "table ") {
			for _, field := range strings.Fields(lower) {
				if field == "queue" || field == "nfqueue" {
					queue = true
					break
				}
			}
		}
		if queue {
			hasQueue = true
			if managed {
				managedDirect = true
			} else if own {
				otherB4 = true
			} else {
				foreignQueue = true
			}
			if own {
				hasB4 = true
				if strings.Contains(lower, "port 53") {
					hasDNS = true
				}
			}
		}
		if own && len(sample) < 120 {
			sample = append(sample, line)
		}
	}
	return map[string]any{"available": true, "hasB4": hasB4, "hasQueue": hasQueue, "hasDNSRedirect": hasDNS, "managedDirect": managedDirect, "otherB4": otherB4, "foreignQueue": foreignQueue, "sample": strings.Join(sample, "\n")}
}
