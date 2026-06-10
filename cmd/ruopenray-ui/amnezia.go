package main

import (
	"fmt"
	"net"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strconv"
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
	kernel := amneziaKernelStatus()
	glinet := amneziaGLInetStatus()

	result["interfaces"] = interfaces
	result["services"] = services
	result["wg"] = wg
	result["routing"] = routing
	result["configs"] = configs
	result["commands"] = commands
	result["kernel"] = kernel
	result["glinet"] = glinet
	result["clientConfig"] = s.amneziaClientConfigStatus(false)

	wgInterfaces, _ := wg["interfaces"].([]string)
	available := len(amneziaInterfaceNames(interfaces)) > 0 ||
		len(wgInterfaces) > 0 ||
		boolMap(wg, "hasPeer") ||
		boolMap(configs, "found") ||
		boolMap(kernel, "installed") ||
		boolMap(kernel, "moduleFile") ||
		boolMap(commands, "awg") ||
		boolMap(services, "found") ||
		boolMap(glinet, "nativeWireGuard")
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

func (s *serverState) amneziaClientConfigPath() string {
	return filepath.Join(s.cfg.DataDir, "amneziawg", "client.conf")
}

func (s *serverState) amneziaClientConfigStatus(includeRaw bool) map[string]any {
	path := s.amneziaClientConfigPath()
	result := map[string]any{
		"exists": false,
		"path":   path,
	}
	body, err := os.ReadFile(path)
	if err != nil {
		return result
	}
	parsed := parseAmneziaClientConfig(string(body))
	result["exists"] = true
	result["updatedAt"] = fileModTimeRFC3339(path)
	result["summary"] = parsed.summary
	result["interface"] = parsed.iface
	result["peer"] = parsed.peer
	result["awgOptions"] = parsed.awgOptions
	result["obfuscationOptions"] = parsed.obfuscationOptions
	result["rawOptions"] = parsed.rawOptions
	result["warnings"] = parsed.warnings
	if includeRaw {
		result["config"] = string(body)
	}
	return result
}

func (s *serverState) amneziaClientConfig() map[string]any {
	status := s.amneziaClientConfigStatus(true)
	status["ok"] = true
	return status
}

func (s *serverState) saveAmneziaClientConfig(payload map[string]any) map[string]any {
	raw := strings.TrimSpace(fmt.Sprint(payload["config"]))
	if raw == "" {
		return map[string]any{"ok": false, "error": "Вставьте клиентский конфиг AmneziaWG."}
	}
	if len(raw) > 128*1024 {
		return map[string]any{"ok": false, "error": "Конфиг слишком большой."}
	}
	parsed := parseAmneziaClientConfig(raw)
	if len(parsed.errors) > 0 {
		return map[string]any{"ok": false, "error": strings.Join(parsed.errors, " ")}
	}
	path := s.amneziaClientConfigPath()
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return map[string]any{"ok": false, "error": err.Error()}
	}
	if err := os.WriteFile(path, []byte(raw+"\n"), 0o600); err != nil {
		return map[string]any{"ok": false, "error": err.Error()}
	}
	s.metricsMu.Lock()
	s.amneziaCache = nil
	s.amneziaAt = time.Time{}
	s.metricsMu.Unlock()
	return map[string]any{"ok": true, "status": s.amneziaStatus()}
}

func (s *serverState) deleteAmneziaClientConfig() map[string]any {
	path := s.amneziaClientConfigPath()
	if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
		return map[string]any{"ok": false, "error": err.Error()}
	}
	s.metricsMu.Lock()
	s.amneziaCache = nil
	s.amneziaAt = time.Time{}
	s.metricsMu.Unlock()
	return map[string]any{"ok": true, "status": s.amneziaStatus()}
}

type parsedAmneziaClientConfig struct {
	iface              map[string]any
	peer               map[string]any
	awgOptions         []string
	obfuscationOptions []string
	rawOptions         map[string]map[string]string
	summary            string
	warnings           []string
	errors             []string
}

func parseAmneziaClientConfig(raw string) parsedAmneziaClientConfig {
	sections := map[string]map[string]string{}
	rawSections := map[string]map[string]string{}
	current := ""
	for _, line := range strings.Split(raw, "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") || strings.HasPrefix(line, ";") {
			continue
		}
		if strings.HasPrefix(line, "[") && strings.Contains(line, "]") {
			current = strings.ToLower(strings.TrimSpace(strings.TrimSuffix(strings.TrimPrefix(line, "["), "]")))
			if sections[current] == nil {
				sections[current] = map[string]string{}
			}
			if rawSections[current] == nil {
				rawSections[current] = map[string]string{}
			}
			continue
		}
		if current == "" || !strings.Contains(line, "=") {
			continue
		}
		parts := strings.SplitN(line, "=", 2)
		rawKey := strings.TrimSpace(parts[0])
		key := strings.ToLower(rawKey)
		value := strings.TrimSpace(parts[1])
		if key != "" {
			sections[current][key] = value
			rawSections[current][rawKey] = value
		}
	}
	iface := sections["interface"]
	peer := sections["peer"]
	parsed := parsedAmneziaClientConfig{
		iface: map[string]any{
			"address":       iface["address"],
			"dns":           iface["dns"],
			"mtu":           iface["mtu"],
			"hasPrivateKey": iface["privatekey"] != "",
		},
		peer: map[string]any{
			"endpoint":        peer["endpoint"],
			"allowedIPs":      peer["allowedips"],
			"persistentKeep":  peer["persistentkeepalive"],
			"hasPublicKey":    peer["publickey"] != "",
			"hasPresharedKey": peer["presharedkey"] != "",
		},
		rawOptions: map[string]map[string]string{
			"interface": rawSections["interface"],
			"peer":      rawSections["peer"],
		},
	}
	if len(iface) == 0 {
		parsed.errors = append(parsed.errors, "Нет секции [Interface].")
	}
	if len(peer) == 0 {
		parsed.errors = append(parsed.errors, "Нет секции [Peer].")
	}
	if iface["privatekey"] == "" {
		parsed.errors = append(parsed.errors, "В [Interface] нет PrivateKey.")
	}
	if iface["address"] == "" {
		parsed.errors = append(parsed.errors, "В [Interface] нет Address.")
	}
	if peer["publickey"] == "" {
		parsed.errors = append(parsed.errors, "В [Peer] нет PublicKey.")
	}
	if peer["endpoint"] == "" {
		parsed.errors = append(parsed.errors, "В [Peer] нет Endpoint.")
	}
	awgOptions := amneziaObfuscationKeys(rawSections)
	parsed.obfuscationOptions = awgOptions
	parsed.awgOptions = awgOptions
	if len(parsed.awgOptions) == 0 {
		parsed.warnings = append(parsed.warnings, "AWG-параметры обфускации не найдены. Возможно, это обычный WireGuard-конфиг.")
	}
	if len(parsed.awgOptions) > 0 && !amneziaHasCoreAWGJunkOptions(parsed.awgOptions) {
		parsed.warnings = append(parsed.warnings, "Найдены нестандартные параметры, но нет Jc/Jmin/Jmax. Проверьте, что это полный AmneziaWG 2.0 конфиг.")
	}
	if amneziaHasSpacingSensitiveOptions(parsed.awgOptions) {
		for _, section := range rawSections {
			for key, value := range section {
				if strings.HasPrefix(strings.ToLower(key), "h") && strings.Contains(value, " - ") {
					parsed.warnings = append(parsed.warnings, "В H-параметрах есть пробелы вокруг дефиса. Некоторые клиенты AmneziaWG ожидают формат без пробелов.")
					break
				}
			}
		}
	}
	endpoint := peer["endpoint"]
	address := iface["address"]
	switch {
	case endpoint != "" && address != "":
		parsed.summary = fmt.Sprintf("%s → %s", address, endpoint)
	case endpoint != "":
		parsed.summary = endpoint
	case address != "":
		parsed.summary = address
	default:
		parsed.summary = "конфиг сохранен"
	}
	return parsed
}

func amneziaObfuscationKeys(sections map[string]map[string]string) []string {
	known := map[string]bool{
		"address":             true,
		"allowedips":          true,
		"dns":                 true,
		"endpoint":            true,
		"listenport":          true,
		"mtu":                 true,
		"persistentkeepalive": true,
		"postdown":            true,
		"postup":              true,
		"predown":             true,
		"presharedkey":        true,
		"preup":               true,
		"privatekey":          true,
		"publickey":           true,
		"table":               true,
	}
	seen := map[string]bool{}
	out := []string{}
	for _, sectionName := range []string{"interface", "peer"} {
		for key := range sections[sectionName] {
			lower := strings.ToLower(strings.TrimSpace(key))
			if lower == "" || known[lower] || seen[lower] {
				continue
			}
			seen[lower] = true
			out = append(out, key)
		}
	}
	sort.SliceStable(out, func(i, j int) bool {
		return strings.ToLower(out[i]) < strings.ToLower(out[j])
	})
	return out
}

func amneziaHasCoreAWGJunkOptions(keys []string) bool {
	need := map[string]bool{"jc": false, "jmin": false, "jmax": false}
	for _, key := range keys {
		lower := strings.ToLower(key)
		if _, ok := need[lower]; ok {
			need[lower] = true
		}
	}
	return need["jc"] && need["jmin"] && need["jmax"]
}

func amneziaHasSpacingSensitiveOptions(keys []string) bool {
	for _, key := range keys {
		lower := strings.ToLower(key)
		if strings.HasPrefix(lower, "h") || strings.HasPrefix(lower, "s") || strings.HasPrefix(lower, "i") {
			return true
		}
	}
	return false
}

func fileModTimeRFC3339(path string) string {
	info, err := os.Stat(path)
	if err != nil {
		return ""
	}
	return info.ModTime().Format(time.RFC3339)
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

func amneziaKernelStatus() map[string]any {
	result := map[string]any{
		"installed":  false,
		"loaded":     false,
		"moduleFile": false,
		"package":    "",
	}
	if commandExists("opkg") {
		status := runTimeout(3*time.Second, "sh", "-c", "opkg list-installed 2>/dev/null | grep -E '^kmod-amneziawg ' || true")
		text := strings.TrimSpace(fmt.Sprint(status["stdout"]))
		if text != "" {
			result["installed"] = true
			result["package"] = text
		}
	}
	loaded := runTimeout(3*time.Second, "sh", "-c", "lsmod 2>/dev/null | grep -Ei '(^|_)amnezia|(^|_)awg' || true")
	if strings.TrimSpace(fmt.Sprint(loaded["stdout"])) != "" {
		result["loaded"] = true
		result["lsmod"] = firstLines(fmt.Sprint(loaded["stdout"]), 4)
	}
	module := runTimeout(3*time.Second, "sh", "-c", "find /lib/modules/$(uname -r) -iname '*amnezia*' -o -iname '*awg*' 2>/dev/null | head -5")
	if strings.TrimSpace(fmt.Sprint(module["stdout"])) != "" {
		result["moduleFile"] = true
		result["files"] = firstLines(fmt.Sprint(module["stdout"]), 5)
	}
	return result
}

func amneziaGLInetStatus() map[string]any {
	result := map[string]any{
		"found":                  false,
		"version":                "",
		"supportsNativeAmnezia":  false,
		"nativeWireGuard":        false,
		"nativeAmneziaLikely":    false,
		"vpnClientService":       false,
		"recommendedBackend":     "raw-awg",
		"recommendedBackendNote": "RuOpenRay сохранит client.conf и будет готовить свой awg-интерфейс после установки совместимого kmod-amneziawg.",
		"warnings":               []string{},
	}
	version := firstReadableFileLine("/etc/glversion", "/etc/glinet_version", "/etc/glinet_release")
	if version != "" {
		result["found"] = true
		result["version"] = version
		result["supportsNativeAmnezia"] = versionAtLeast(version, 4, 9)
	}
	if fileExists("/etc/init.d/vpn-client") {
		result["found"] = true
		result["vpnClientService"] = true
		status := runTimeout(3*time.Second, "/etc/init.d/vpn-client", "status")
		result["vpnClientRunning"] = amneziaServiceStatusTextRunning(concatCommandOutput(status))
	}
	if commandExists("uci") {
		network := runTimeout(3*time.Second, "sh", "-c", "uci show network 2>/dev/null | grep -Ei 'wgclient|amnezia|gl_vpn_rules' || true")
		firewall := runTimeout(3*time.Second, "sh", "-c", "uci show firewall 2>/dev/null | grep -Ei 'wgclient|amnezia|gl_vpn_rules' || true")
		networkText := strings.TrimSpace(fmt.Sprint(network["stdout"]))
		firewallText := strings.TrimSpace(fmt.Sprint(firewall["stdout"]))
		if networkText != "" || firewallText != "" {
			result["found"] = true
		}
		result["network"] = firstLines(networkText, 20)
		result["firewall"] = firstLines(firewallText, 12)
		result["nativeWireGuard"] = strings.Contains(networkText, ".proto='wgclient'") || strings.Contains(networkText, `.proto="wgclient"`)
		result["disabled"] = strings.Contains(networkText, ".disabled='1'") || strings.Contains(networkText, `.disabled="1"`)
	}
	if commandExists("opkg") {
		packages := runTimeout(3*time.Second, "sh", "-c", "opkg list-installed 2>/dev/null | grep -Ei 'gl-sdk4-(ui-)?(vpn|wireguard|amnezia)|amneziawg|wireguard' | head -30 || true")
		packageText := strings.TrimSpace(fmt.Sprint(packages["stdout"]))
		result["packages"] = firstLines(packageText, 30)
		if packageText != "" {
			result["found"] = true
		}
		if strings.Contains(strings.ToLower(packageText), "amnezia") {
			result["nativeAmneziaLikely"] = true
		}
	}
	if boolMap(result, "supportsNativeAmnezia") && boolMap(result, "nativeWireGuard") {
		result["recommendedBackend"] = "glinet-native"
		result["recommendedBackendNote"] = "На GL.iNet 4.9+ лучше использовать родной VPN-клиент как backend туннеля, а RuOpenRay пусть управляет только маршрутизацией выбранного трафика."
	} else if boolMap(result, "nativeWireGuard") {
		result["recommendedBackend"] = "glinet-wireguard"
		result["recommendedBackendNote"] = "Найден GL.iNet WireGuard-клиент. Для AmneziaWG 2.0 нативный режим обычно нужен на GL.iNet 4.9+, иначе безопаснее raw awg с совместимым kmod."
	}
	return result
}

func amneziaWarnings(status map[string]any) []string {
	warnings := []string{}
	routing, _ := status["routing"].(map[string]any)
	if boolMap(routing, "defaultViaTunnel") {
		warnings = append(warnings, "AmneziaWG сейчас похож на глобальный default route. Для раздельной маршрутизации лучше отключить автозахват всего трафика и дать RuOpenRay управлять mark/ip rule.")
	}
	kernel, _ := status["kernel"].(map[string]any)
	commands, _ := status["commands"].(map[string]any)
	if boolMap(commands, "awg") && !boolMap(kernel, "installed") && !boolMap(kernel, "moduleFile") {
		warnings = append(warnings, "Утилита awg найдена, но kmod-amneziawg для текущего ядра не установлен. Конфиг можно сохранить, но туннель не поднимется до установки совместимого kernel module.")
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

func firstReadableFileLine(paths ...string) string {
	for _, path := range paths {
		body, err := os.ReadFile(path)
		if err != nil {
			continue
		}
		for _, line := range strings.Split(string(body), "\n") {
			line = strings.TrimSpace(line)
			if line != "" {
				return line
			}
		}
	}
	return ""
}

func versionAtLeast(version string, major int, minor int) bool {
	parts := strings.SplitN(version, "-", 2)
	num := strings.Split(parts[0], ".")
	if len(num) < 2 {
		return false
	}
	gotMajor, err := strconv.Atoi(num[0])
	if err != nil {
		return false
	}
	gotMinor, err := strconv.Atoi(num[1])
	if err != nil {
		return false
	}
	if gotMajor != major {
		return gotMajor > major
	}
	return gotMinor >= minor
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
