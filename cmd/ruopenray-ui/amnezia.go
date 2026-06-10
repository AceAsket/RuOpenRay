package main

import (
	"fmt"
	"net"
	"runtime"
	"sort"
	"strings"
	"time"
)

const (
	amneziaRouteTable     = "5200"
	amneziaRouteTableName = "ruopenray_awg"
	amneziaFwMark         = "0x5200"
)

func (s *serverState) cachedAmneziaStatus() map[string]any {
	now := time.Now()
	s.metricsMu.Lock()
	if s.amneziaCache != nil && now.Sub(s.amneziaAt) < 15*time.Second {
		cached := s.amneziaCache
		s.metricsMu.Unlock()
		return cached
	}
	s.metricsMu.Unlock()
	status := s.amneziaStatus()
	s.metricsMu.Lock()
	s.amneziaCache = status
	s.amneziaAt = now
	s.metricsMu.Unlock()
	return status
}

func (s *serverState) amneziaStatus() map[string]any {
	result := map[string]any{
		"ok":        true,
		"available": false,
		"running":   false,
		"active":    false,
		"summary":   "AmneziaWG не найден",
		"warnings":  []string{},
		"routePlan": amneziaRoutePlan(),
	}
	if runtime.GOOS == "windows" {
		result["summary"] = "AmneziaWG проверяется только на роутере."
		return result
	}

	interfaces := amneziaInterfacesStatus()
	services := amneziaServicesStatus()
	wg := amneziaWGStatus()
	routing := amneziaRoutingStatus(interfaces)
	configs := amneziaConfigStatus()
	commands := amneziaCommandStatus()

	result["interfaces"] = interfaces
	result["services"] = services
	result["wg"] = wg
	result["routing"] = routing
	result["configs"] = configs
	result["commands"] = commands

	wgInterfaces, _ := wg["interfaces"].([]string)
	available := len(amneziaInterfaceNames(interfaces)) > 0 ||
		len(wgInterfaces) > 0 ||
		boolMap(wg, "hasPeer") ||
		boolMap(configs, "found") ||
		boolMap(commands, "awg") ||
		boolMap(services, "found")
	running := len(amneziaRunningInterfaceNames(interfaces)) > 0 || boolMap(services, "running") || boolMap(wg, "hasPeer")
	active := running || boolMap(routing, "defaultViaTunnel") || boolMap(routing, "ipRule")

	result["available"] = available
	result["running"] = running
	result["active"] = active
	result["primaryInterface"] = amneziaPrimaryInterface(interfaces)
	result["warnings"] = amneziaWarnings(result)
	switch {
	case boolMap(routing, "defaultViaTunnel"):
		result["summary"] = "AmneziaWG найден и сейчас выглядит как глобальный маршрут по умолчанию"
	case active:
		result["summary"] = "AmneziaWG активен, RuOpenRay может подготовить отдельную политику маршрутизации"
	case available:
		result["summary"] = "AmneziaWG найден, но активный туннель или policy routing пока не видны"
	default:
		result["summary"] = "AmneziaWG не найден"
	}
	if len(result["warnings"].([]string)) > 0 {
		result["ok"] = false
	}
	return result
}

func amneziaRoutePlan() map[string]any {
	return map[string]any{
		"mode":        "planned-read-only",
		"target":      "AmneziaWG",
		"table":       amneziaRouteTable,
		"tableName":   amneziaRouteTableName,
		"mark":        amneziaFwMark,
		"description": "RuOpenRay сможет помечать выбранный трафик отдельным fwmark и отправлять его в route table AmneziaWG, не включая туннель для всего роутера.",
	}
}

func amneziaInterfacesStatus() []map[string]any {
	out := []map[string]any{}
	if commandExists("ip") {
		link := runTimeout(3*time.Second, "ip", "-o", "link", "show")
		for _, item := range parseIPLinkInterfaces(fmt.Sprint(link["stdout"])) {
			if !amneziaInterfaceNameLooksRelevant(item["name"].(string)) {
				continue
			}
			out = append(out, amneziaInterfaceDetails(item["name"].(string), item))
		}
	}
	if len(out) == 0 {
		for _, iface := range amneziaNetInterfaces() {
			out = append(out, iface)
		}
	}
	sort.SliceStable(out, func(i, j int) bool {
		return fmt.Sprint(out[i]["name"]) < fmt.Sprint(out[j]["name"])
	})
	return out
}

func amneziaInterfaceDetails(name string, link map[string]any) map[string]any {
	item := map[string]any{
		"name":    name,
		"running": boolMap(link, "up"),
		"state":   fmt.Sprint(link["state"]),
		"kind":    amneziaInterfaceKind(name),
	}
	if commandExists("ip") {
		addr := runTimeout(3*time.Second, "ip", "-o", "addr", "show", "dev", name)
		item["addresses"] = parseIPAddrAddresses(fmt.Sprint(addr["stdout"]))
		route := runTimeout(3*time.Second, "ip", "route", "show", "dev", name)
		item["routes"] = firstLines(fmt.Sprint(route["stdout"]), 6)
	}
	return item
}

func amneziaNetInterfaces() []map[string]any {
	ifaces, err := net.Interfaces()
	if err != nil {
		return nil
	}
	out := []map[string]any{}
	for _, iface := range ifaces {
		if !amneziaInterfaceNameLooksRelevant(iface.Name) {
			continue
		}
		addresses := []string{}
		if addrs, err := iface.Addrs(); err == nil {
			for _, addr := range addrs {
				addresses = append(addresses, addr.String())
			}
		}
		out = append(out, map[string]any{
			"name":      iface.Name,
			"running":   iface.Flags&net.FlagUp != 0,
			"state":     iface.Flags.String(),
			"kind":      amneziaInterfaceKind(iface.Name),
			"addresses": addresses,
		})
	}
	return out
}

func amneziaServicesStatus() map[string]any {
	candidates := []string{
		"/etc/init.d/amneziawg",
		"/etc/init.d/awg",
		"/etc/init.d/wireguard",
		"/etc/init.d/wg-quick",
	}
	items := []map[string]any{}
	found := false
	running := false
	for _, path := range candidates {
		if !fileExists(path) {
			continue
		}
		status := runTimeout(3*time.Second, path, "status")
		text := concatCommandOutput(status)
		isRunning := amneziaServiceStatusTextRunning(text)
		items = append(items, map[string]any{
			"path":    path,
			"running": isRunning,
			"status":  status,
		})
		found = true
		running = running || isRunning
	}
	return map[string]any{"found": found, "running": running, "items": items}
}

func amneziaWGStatus() map[string]any {
	result := map[string]any{"available": false, "hasPeer": false, "interfaces": []string{}}
	command := ""
	switch {
	case commandExists("awg"):
		command = "awg"
	case commandExists("wg"):
		command = "wg"
	default:
		return result
	}
	show := runTimeout(4*time.Second, command, "show")
	text := strings.TrimSpace(fmt.Sprint(show["stdout"]))
	result["available"] = true
	result["command"] = command
	result["ok"] = show["ok"]
	result["interfaces"] = parseWGShowInterfaces(text)
	result["hasPeer"] = strings.Contains(text, "peer:")
	result["summary"] = firstLines(text, 18)
	if show["ok"] != true {
		result["stderr"] = concatCommandOutput(show)
	}
	return result
}

func amneziaRoutingStatus(interfaces []map[string]any) map[string]any {
	result := map[string]any{
		"available":        commandExists("ip"),
		"ipRule":           false,
		"defaultViaTunnel": false,
		"table":            amneziaRouteTable,
		"mark":             amneziaFwMark,
	}
	if !commandExists("ip") {
		return result
	}
	names := amneziaInterfaceNames(interfaces)
	rules := runTimeout(3*time.Second, "ip", "rule", "show")
	rulesText := strings.ToLower(fmt.Sprint(rules["stdout"]))
	result["rules"] = firstLines(fmt.Sprint(rules["stdout"]), 12)
	result["ipRule"] = strings.Contains(rulesText, "lookup "+strings.ToLower(amneziaRouteTable)) ||
		strings.Contains(rulesText, strings.ToLower(amneziaRouteTableName)) ||
		strings.Contains(rulesText, strings.ToLower(amneziaFwMark))
	mainRoute := runTimeout(3*time.Second, "ip", "route", "show", "default")
	mainText := strings.TrimSpace(fmt.Sprint(mainRoute["stdout"]))
	result["defaultRoute"] = mainText
	for _, name := range names {
		if strings.Contains(mainText, " dev "+name) || strings.Contains(mainText, "dev "+name+" ") {
			result["defaultViaTunnel"] = true
			break
		}
	}
	tableRoute := runTimeout(3*time.Second, "ip", "route", "show", "table", amneziaRouteTable)
	plannedTableRoute := strings.TrimSpace(fmt.Sprint(tableRoute["stdout"]))
	if strings.EqualFold(plannedTableRoute, "Dump terminated") {
		plannedTableRoute = ""
	}
	result["plannedTableRoute"] = plannedTableRoute
	return result
}

func amneziaConfigStatus() map[string]any {
	candidates := []string{
		"/etc/config/amneziawg",
		"/etc/config/wireguard",
		"/etc/amnezia/amneziawg.conf",
		"/etc/amnezia/awg.conf",
		"/etc/wireguard/awg0.conf",
		"/etc/wireguard/wg0.conf",
	}
	paths := []string{}
	for _, path := range candidates {
		if fileExists(path) {
			paths = append(paths, path)
		}
	}
	return map[string]any{"found": len(paths) > 0, "paths": paths}
}

func amneziaCommandStatus() map[string]any {
	return map[string]any{
		"awg":     commandExists("awg"),
		"wg":      commandExists("wg"),
		"wgQuick": commandExists("wg-quick"),
		"ip":      commandExists("ip"),
		"nft":     commandExists("nft"),
	}
}

func amneziaWarnings(status map[string]any) []string {
	warnings := []string{}
	routing, _ := status["routing"].(map[string]any)
	if boolMap(routing, "defaultViaTunnel") {
		warnings = append(warnings, "AmneziaWG сейчас похож на глобальный default route. Для раздельной маршрутизации лучше отключить автозахват всего трафика и дать RuOpenRay управлять mark/ip rule.")
	}
	if status["available"] == true && len(amneziaInterfaceNames(status["interfaces"])) == 0 {
		warnings = append(warnings, "Конфиги или команды AmneziaWG найдены, но активный awg/wg интерфейс не обнаружен.")
	}
	return warnings
}

func parseIPLinkInterfaces(text string) []map[string]any {
	out := []map[string]any{}
	for _, line := range strings.Split(text, "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		parts := strings.SplitN(line, ":", 3)
		if len(parts) < 2 {
			continue
		}
		name := strings.TrimSpace(parts[1])
		if at := strings.Index(name, "@"); at >= 0 {
			name = name[:at]
		}
		lower := strings.ToLower(line)
		state := ""
		if idx := strings.Index(lower, " state "); idx >= 0 {
			stateFields := strings.Fields(line[idx+7:])
			if len(stateFields) > 0 {
				state = stateFields[0]
			}
		}
		out = append(out, map[string]any{
			"name":  name,
			"up":    strings.Contains(line, "<") && strings.Contains(strings.SplitN(line, ">", 2)[0], "UP"),
			"state": state,
		})
	}
	return out
}

func parseIPAddrAddresses(text string) []string {
	out := []string{}
	for _, line := range strings.Split(text, "\n") {
		fields := strings.Fields(line)
		for i, field := range fields {
			if (field == "inet" || field == "inet6") && i+1 < len(fields) {
				out = append(out, fields[i+1])
			}
		}
	}
	return out
}

func parseWGShowInterfaces(text string) []string {
	seen := map[string]bool{}
	out := []string{}
	for _, line := range strings.Split(text, "\n") {
		line = strings.TrimSpace(line)
		if !strings.HasPrefix(line, "interface:") {
			continue
		}
		name := strings.TrimSpace(strings.TrimPrefix(line, "interface:"))
		if name != "" && !seen[name] {
			seen[name] = true
			out = append(out, name)
		}
	}
	return out
}

func amneziaInterfaceNames(value any) []string {
	items, _ := value.([]map[string]any)
	if items == nil {
		raw, _ := value.([]any)
		for _, item := range raw {
			if m, ok := item.(map[string]any); ok {
				items = append(items, m)
			}
		}
	}
	out := []string{}
	seen := map[string]bool{}
	for _, item := range items {
		name := strings.TrimSpace(fmt.Sprint(item["name"]))
		if name != "" && name != "<nil>" && !seen[name] {
			seen[name] = true
			out = append(out, name)
		}
	}
	return out
}

func amneziaRunningInterfaceNames(value any) []string {
	items, _ := value.([]map[string]any)
	if items == nil {
		raw, _ := value.([]any)
		for _, item := range raw {
			if m, ok := item.(map[string]any); ok {
				items = append(items, m)
			}
		}
	}
	out := []string{}
	for _, item := range items {
		if boolMap(item, "running") {
			out = append(out, strings.TrimSpace(fmt.Sprint(item["name"])))
		}
	}
	return out
}

func amneziaPrimaryInterface(value any) string {
	names := amneziaRunningInterfaceNames(value)
	if len(names) == 0 {
		names = amneziaInterfaceNames(value)
	}
	if len(names) == 0 {
		return ""
	}
	return names[0]
}

func amneziaInterfaceNameLooksRelevant(name string) bool {
	lower := strings.ToLower(strings.TrimSpace(name))
	return strings.HasPrefix(lower, "awg") ||
		strings.HasPrefix(lower, "wg") ||
		strings.Contains(lower, "amnezia")
}

func amneziaInterfaceKind(name string) string {
	lower := strings.ToLower(name)
	if strings.HasPrefix(lower, "awg") || strings.Contains(lower, "amnezia") {
		return "AmneziaWG"
	}
	return "WireGuard"
}

func amneziaServiceStatusTextRunning(text string) bool {
	lower := strings.ToLower(text)
	if strings.Contains(lower, "inactive") || strings.Contains(lower, "stopped") || strings.Contains(lower, "not running") {
		return false
	}
	return strings.Contains(lower, "running") || strings.Contains(lower, "started") || strings.Contains(lower, " active")
}

func firstLines(text string, limit int) []string {
	out := []string{}
	for _, line := range strings.Split(text, "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		out = append(out, line)
		if len(out) >= limit {
			break
		}
	}
	return out
}
