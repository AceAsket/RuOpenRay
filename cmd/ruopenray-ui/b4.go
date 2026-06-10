package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"runtime"
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
	api := b4APIStatus()
	result["api"] = api
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

	active := boolMap(nft, "hasB4") ||
		boolMap(nft, "hasQueue") ||
		boolMap(iptables, "hasNFQUEUE") ||
		boolMap(routing, "ipRule") ||
		boolMap(routing, "route")
	result["active"] = active
	warnings := b4Warnings(result)
	result["warnings"] = warnings
	switch {
	case active:
		result["summary"] = "B4 активен и может вмешиваться в firewall/NFQUEUE"
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

func b4APIStatus() map[string]any {
	return b4APIStatusFromBase(b4APIBaseURL)
}

func b4APIStatusFromBase(baseURL string) map[string]any {
	result := map[string]any{
		"available":     false,
		"running":       false,
		"authRequired":  false,
		"queueActive":   false,
		"setsEnabled":   false,
		"summary":       "B4 API не отвечает",
		"version":       "",
		"versionStatus": 0,
	}
	client := &http.Client{Timeout: 2 * time.Second}

	version, statusCode, err := b4APIGet(client, baseURL, "/version")
	result["versionStatus"] = statusCode
	if err != nil {
		result["error"] = err.Error()
		return result
	}
	if statusCode == http.StatusUnauthorized {
		result["available"] = true
		result["authRequired"] = true
		result["summary"] = "B4 API найден, нужна авторизация"
		return result
	}
	if statusCode < 200 || statusCode >= 300 {
		result["error"] = fmt.Sprintf("HTTP %d", statusCode)
		return result
	}
	result["available"] = true
	result["version"] = b4FirstString(version["version"], version["data"])

	auth, authStatus, authErr := b4APIGet(client, baseURL, "/auth/check")
	result["auth"] = map[string]any{"status": authStatus, "ok": authErr == nil && authStatus >= 200 && authStatus < 300}
	if authErr == nil && authStatus == http.StatusUnauthorized {
		result["authRequired"] = true
		result["summary"] = "B4 API найден, защищенные методы требуют токен"
		return result
	}
	if authErr == nil && authStatus >= 200 && authStatus < 300 {
		result["auth"] = b4APISummarizeAuth(auth, authStatus)
	}

	if diagnostics, status, err := b4APIGet(client, baseURL, "/system/diagnostics"); err == nil && status >= 200 && status < 300 {
		summary := b4APISummarizeDiagnostics(diagnostics)
		result["diagnostics"] = summary
		if boolMap(summary, "running") {
			result["running"] = true
		}
		if boolMap(summary, "nfqueueWorks") || b4FirstString(summary["firewallBackend"]) != "" && b4FirstString(summary["firewallBackend"]) != "none" {
			result["queueActive"] = true
		}
	}
	if config, status, err := b4APIGet(client, baseURL, "/config"); err == nil && status >= 200 && status < 300 {
		summary := b4APISummarizeConfig(config)
		result["config"] = summary
		if boolMap(summary, "queueActive") {
			result["queueActive"] = true
		}
		if boolMap(summary, "setsEnabled") {
			result["setsEnabled"] = true
		}
	}
	if metrics, status, err := b4APIGet(client, baseURL, "/metrics/summary"); err == nil && status >= 200 && status < 300 {
		result["metrics"] = b4APISummarizeMetrics(metrics)
	}

	switch {
	case boolMap(result, "running"):
		result["summary"] = "B4 API отвечает, сервис запущен"
	case boolMap(result, "queueActive") || boolMap(result, "setsEnabled"):
		result["summary"] = "B4 API отвечает, конфигурация B4 включена"
	default:
		result["summary"] = "B4 API отвечает"
	}
	return result
}

func b4APIGet(client *http.Client, baseURL string, path string) (map[string]any, int, error) {
	rawURL := strings.TrimRight(baseURL, "/") + "/" + strings.TrimLeft(path, "/")
	req, err := http.NewRequest(http.MethodGet, rawURL, nil)
	if err != nil {
		return nil, 0, err
	}
	req.Header.Set("Accept", "application/json")
	resp, err := client.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()
	payload := map[string]any{}
	if resp.Body != nil {
		body, readErr := io.ReadAll(io.LimitReader(resp.Body, 1024*1024))
		if readErr != nil {
			return nil, resp.StatusCode, readErr
		}
		if strings.TrimSpace(string(body)) != "" {
			if err := json.Unmarshal(body, &payload); err != nil {
				payload["raw"] = strings.TrimSpace(string(body))
			}
		}
	}
	return payload, resp.StatusCode, nil
}

func b4APISummarizeAuth(payload map[string]any, status int) map[string]any {
	return map[string]any{
		"status":  status,
		"ok":      true,
		"success": boolMap(payload, "success"),
		"message": b4FirstString(payload["message"]),
	}
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
	result := map[string]any{
		"version":         b4FirstString(data["version"]),
		"success":         boolMap(data, "success"),
		"warnings":        b4StringSliceFromAny(data["warnings"], 10),
		"availableIfaces": b4StringSliceFromAny(data["available_ifaces"], 12),
		"queue": map[string]any{
			"interfaces": b4StringSliceFromAny(queue["interfaces"], 12),
			"ipv4":       boolMap(queue, "ipv4"),
			"ipv6":       boolMap(queue, "ipv6"),
			"mark":       b4IntFromAny(queue["mark"]),
			"startNum":   b4IntFromAny(queue["start_num"]),
			"threads":    b4IntFromAny(queue["threads"]),
		},
		"sets":        setsSummary,
		"queueActive": len(b4StringSliceFromAny(queue["interfaces"], 12)) > 0,
		"setsEnabled": boolMap(setsSummary, "enabled"),
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
		if boolMap(set, "enabled") {
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
	for _, key := range []string{"total_packets", "dropped_packets", "processed_packets", "active_connections"} {
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
