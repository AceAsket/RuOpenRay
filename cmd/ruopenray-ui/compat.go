package main

import (
	"encoding/json"
	"fmt"
	"net"
	"runtime"
	"strings"
	"time"
)

func (s *serverState) compatibilityStatus() map[string]any {
	lan := s.lanDNSUpstreamStatus(nil)
	routerLan := strings.TrimSpace(detectRouterLANAddress())
	if routerLan == "" || routerLan == "<nil>" {
		routerLan = strings.TrimSpace(fmt.Sprint(lan["routerLan"]))
	}
	if routerLan == "" || routerLan == "<nil>" {
		routerLan = "192.168.1.1"
	}
	adguard, _ := lan["adguardHome"].(map[string]any)
	b4 := s.cachedB4Status()
	amnezia := s.cachedAmneziaStatus()
	b4Link := ""
	if api, ok := b4["api"].(map[string]any); ok && boolMap(api, "available") {
		b4Link = fmt.Sprintf("http://%s:%d/", routerLan, b4UIPort)
	} else if ports, ok := b4["ports"].(map[string]any); ok && boolMap(ports, "ui") {
		b4Link = fmt.Sprintf("http://%s:%d/", routerLan, b4UIPort)
	}
	return map[string]any{
		"ok":        true,
		"routerLan": routerLan,
		"detected": map[string]any{
			"adguardHome": compatAvailable(adguard),
			"b4":          compatAvailable(b4),
			"amnezia":     compatAvailable(amnezia),
		},
		"links": map[string]any{
			"adguardHome": adGuardHomeWebURL(routerLan, adguard),
			"b4":          b4Link,
		},
		"adguardHome": adguard,
		"b4":          b4,
		"amnezia":     amnezia,
	}
}

func compatAvailable(status map[string]any) bool {
	return status != nil && (boolMap(status, "available") || boolMap(status, "running") || boolMap(status, "active"))
}

func adGuardHomeWebURL(routerLan string, adguard map[string]any) string {
	port := 3000
	if value := intFromAny(adguard["webPort"]); value > 0 {
		port = value
	}
	return fmt.Sprintf("http://%s:%d/", firstNonEmpty(routerLan, "192.168.1.1"), port)
}

func routerLANAddress() string {
	return firstNonEmpty(detectRouterLANAddress(), "192.168.1.1")
}

func detectRouterLANAddress() string {
	if runtime.GOOS == "windows" {
		return ""
	}
	// Prefer the live interface state over UCI. On DHCP LAN interfaces UCI may
	// contain no address or a stale factory default while ubus/ip expose the
	// address that clients can actually reach.
	if commandExists("ubus") {
		status := fmt.Sprint(runTimeout(2*time.Second, "ubus", "call", "network.interface.lan", "status")["stdout"])
		if ip := routerIPv4FromUbus(status); ip != "" {
			return ip
		}
	}
	if commandExists("ip") {
		addr := fmt.Sprint(runTimeout(2*time.Second, "ip", "-4", "-o", "addr", "show", "dev", "br-lan")["stdout"])
		if ip := routerIPv4FromIPOutput(addr); ip != "" {
			return ip
		}
		routes := fmt.Sprint(runTimeout(2*time.Second, "ip", "-4", "route", "show", "default")["stdout"])
		if ip := routerIPv4FromIPOutput(routes); ip != "" {
			return ip
		}
	}
	if commandExists("uci") {
		if ip := normalizeRouterIPv4(firstLine(fmt.Sprint(runTimeout(2*time.Second, "uci", "-q", "get", "network.lan.ipaddr")["stdout"]), "")); ip != "" {
			return ip
		}
	}
	return ""
}

func routerIPv4FromUbus(raw string) string {
	var status struct {
		IPv4Address []struct {
			Address string `json:"address"`
		} `json:"ipv4-address"`
	}
	if json.Unmarshal([]byte(strings.TrimSpace(raw)), &status) != nil {
		return ""
	}
	for _, item := range status.IPv4Address {
		if ip := normalizeRouterIPv4(item.Address); ip != "" {
			return ip
		}
	}
	return ""
}

func routerIPv4FromIPOutput(raw string) string {
	fields := strings.Fields(raw)
	for i, field := range fields {
		if (field == "inet" || field == "src") && i+1 < len(fields) {
			if ip := normalizeRouterIPv4(fields[i+1]); ip != "" {
				return ip
			}
		}
	}
	return ""
}

func normalizeRouterIPv4(value string) string {
	value = strings.TrimSpace(value)
	if value == "" || value == "<nil>" {
		return ""
	}
	if strings.Contains(value, "/") {
		value = strings.SplitN(value, "/", 2)[0]
	}
	ip := net.ParseIP(value)
	if ip == nil || ip.To4() == nil || ip.IsUnspecified() || ip.IsLoopback() {
		return ""
	}
	return ip.String()
}

func intFromAny(value any) int {
	switch v := value.(type) {
	case int:
		return v
	case int64:
		return int(v)
	case float64:
		return int(v)
	case string:
		var parsed int
		_, _ = fmt.Sscanf(strings.TrimSpace(v), "%d", &parsed)
		return parsed
	default:
		return 0
	}
}

func (s *serverState) controlB4(payload map[string]any) map[string]any {
	action := strings.TrimSpace(fmt.Sprint(payload["action"]))
	if action == "" || action == "<nil>" {
		action = "status"
	}
	result := map[string]any{"ok": true, "action": action}
	if runtime.GOOS == "windows" {
		result["ok"] = false
		result["message"] = "B4 управляется только на роутере."
		result["status"] = s.b4Status()
		return result
	}
	if !fileExists(b4ServicePath) && action != "status" {
		result["ok"] = false
		result["message"] = "B4 не найден на роутере."
		result["status"] = s.b4Status()
		return result
	}
	steps := []map[string]any{}
	switch action {
	case "status":
	case "start":
		steps = append(steps, runTimeout(8*time.Second, b4ServicePath, "start"))
	case "stop":
		steps = append(steps, runTimeout(8*time.Second, b4ServicePath, "stop"))
		steps = append(steps, b4ClearTablesStep())
	case "restart":
		steps = append(steps, runTimeout(8*time.Second, b4ServicePath, "restart"))
	case "enable":
		steps = append(steps, runTimeout(5*time.Second, b4ServicePath, "enable"))
	case "disable":
		steps = append(steps, runTimeout(5*time.Second, b4ServicePath, "disable"))
	case "clear":
		steps = append(steps, runTimeout(8*time.Second, b4ServicePath, "stop"))
		steps = append(steps, b4ClearTablesStep())
	default:
		result["ok"] = false
		result["message"] = "Неподдерживаемое действие B4."
	}
	if len(steps) > 0 {
		ok := true
		for _, step := range steps {
			if step["ok"] != true {
				ok = false
			}
		}
		result["ok"] = result["ok"] == true && ok
		result["steps"] = steps
		result["stdout"] = concatCommandOutput(steps...)
	}
	s.clearB4Cache()
	time.Sleep(350 * time.Millisecond)
	result["status"] = s.b4Status()
	return result
}

func b4ClearTablesStep() map[string]any {
	config := "/etc/b4/b4.json"
	if paths := b4ConfigPaths(); len(paths) > 0 {
		config = paths[0]
	}
	if commandExists("b4") {
		return runTimeout(8*time.Second, "b4", "--clear-tables", "--config", config)
	}
	if fileExists("/usr/bin/b4") {
		return runTimeout(8*time.Second, "/usr/bin/b4", "--clear-tables", "--config", config)
	}
	return map[string]any{"ok": true, "skipped": true, "message": "b4 binary не найден, очистка таблиц пропущена"}
}

func (s *serverState) clearB4Cache() {
	s.metricsMu.Lock()
	defer s.metricsMu.Unlock()
	s.b4Cache = nil
	s.b4At = time.Time{}
}
