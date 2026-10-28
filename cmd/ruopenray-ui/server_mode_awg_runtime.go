package main

import (
	"fmt"
	"hash/fnv"
	"net"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"time"
)

const (
	serverModeAWGServicePath    = "/etc/init.d/ruopenray-awg-server"
	serverModeAWGFirewallPrefix = "ruopenray_awg_"
)

func (s *serverState) serverModeAWGRuntimeDir() string {
	return filepath.Join(s.cfg.DataDir, "server-mode", "awg")
}

func (s *serverState) serverModeAWGRuntimeStatus(mode serverModeConfig) map[string]any {
	available := runtime.GOOS != "windows" && commandExists("ip") && commandExists("awg") && commandExists("uci")
	status := map[string]any{
		"available":  available,
		"active":     false,
		"healthy":    false,
		"enabled":    false,
		"expected":   0,
		"running":    0,
		"interfaces": []map[string]any{},
	}
	if !available {
		return status
	}
	mode = normalizeServerModeConfig(mode)
	interfaces := []map[string]any{}
	running := 0
	expected := 0
	if mode.Enabled {
		for _, awg := range mode.AWG {
			if !awg.Enabled {
				continue
			}
			expected++
			link := runTimeout(4*time.Second, "ip", "link", "show", "dev", awg.Interface)
			show := runTimeout(4*time.Second, "awg", "show", awg.Interface)
			up := link["ok"] == true && show["ok"] == true
			if up {
				running++
			}
			interfaces = append(interfaces, map[string]any{
				"id":         awg.ID,
				"name":       awg.Name,
				"interface":  awg.Interface,
				"listenPort": awg.ListenPort,
				"up":         up,
			})
		}
	}
	serviceEnabled := false
	if fileExists(serverModeAWGServicePath) {
		serviceEnabled = runTimeout(4*time.Second, serverModeAWGServicePath, "enabled")["ok"] == true
	}
	status["active"] = running > 0
	status["healthy"] = expected > 0 && running == expected
	status["enabled"] = serviceEnabled
	status["expected"] = expected
	status["running"] = running
	status["interfaces"] = interfaces
	firewall := serverModeAWGFirewallInventory(mode, fmt.Sprint(runTimeout(5*time.Second, "uci", "-q", "show", "firewall")["stdout"]), serverModeRouterIPs())
	status["firewall"] = firewall
	status["reconcileRequired"] = len(firewall["stale"].([]string)) > 0
	status["firewallMissing"] = len(firewall["missing"].([]string)) > 0
	status["healthy"] = expected > 0 && running == expected && status["reconcileRequired"] != true && status["firewallMissing"] != true
	return status
}

func (s *serverState) serverModeAWGRuntimeApply(payload map[string]any) map[string]any {
	if runtime.GOOS == "windows" || !commandExists("ip") || !commandExists("awg") || !commandExists("uci") {
		return map[string]any{"ok": false, "available": false, "error": "Для AWG runtime нужны OpenWrt, ip, awg и uci."}
	}
	if !boolPayload(payload, "confirm", false) {
		return map[string]any{"ok": false, "needsConfirmation": true, "error": "Подтвердите запуск серверных интерфейсов AmneziaWG."}
	}
	mode, err := s.serverModePayloadOrStored(payload)
	if err != nil {
		return map[string]any{"ok": false, "error": err.Error()}
	}
	mode = normalizeServerModeConfig(mode)
	plan := s.serverModeAWGPlan(mode)
	if plan["ok"] != true || plan["enabled"] != true {
		return map[string]any{"ok": false, "error": "Исправьте план AmneziaWG перед запуском.", "plan": plan, "status": s.serverModeAWGRuntimeStatus(mode)}
	}
	routerIPs := serverModeRouterIPs()
	detectedRouter := strings.TrimSpace(detectRouterLANAddress())
	for _, awg := range mode.AWG {
		if awg.Enabled && strings.TrimSpace(awg.EgressTag) != "" && strings.TrimSpace(awg.EgressTag) != "direct" {
			return map[string]any{
				"ok":     false,
				"error":  fmt.Sprintf("AWG %s использует outbound %s. Runtime пока безопасно поддерживает только direct.", awg.Name, awg.EgressTag),
				"plan":   plan,
				"status": s.serverModeAWGRuntimeStatus(mode),
			}
		}
		if !awg.Enabled {
			continue
		}
		for _, peer := range awg.Peers {
			if !peer.Enabled {
				continue
			}
			if issue := serverModeLANACLValidationIssue(peer.LANAllowedIPs, peer.LANAllowedPorts, peer.LANProtocol, "awg:"+awg.ID+"/peer:"+peer.ID); issue != nil {
				return map[string]any{"ok": false, "error": issue.Detail, "errors": []serverModeIssue{*issue}, "plan": plan, "status": s.serverModeAWGRuntimeStatus(mode)}
			}
			if detectedRouter == "" && (peer.AllowRouter || peer.AllowDNS) {
				return map[string]any{"ok": false, "error": "Не удалось определить LAN-адрес роутера для AWG router/DNS ACL.", "plan": plan, "status": s.serverModeAWGRuntimeStatus(mode)}
			}
		}
	}
	seenInterfaces := map[string]string{}
	seenPorts := map[int]string{}
	for _, awg := range mode.AWG {
		if !awg.Enabled {
			continue
		}
		iface := strings.ToLower(strings.TrimSpace(awg.Interface))
		if owner := seenInterfaces[iface]; iface != "" && owner != "" {
			return map[string]any{"ok": false, "error": fmt.Sprintf("AWG %s и %s используют один интерфейс %s.", owner, awg.ID, awg.Interface), "plan": plan, "status": s.serverModeAWGRuntimeStatus(mode)}
		}
		if owner := seenPorts[awg.ListenPort]; owner != "" {
			return map[string]any{"ok": false, "error": fmt.Sprintf("AWG %s и %s используют один UDP-порт %d.", owner, awg.ID, awg.ListenPort), "plan": plan, "status": s.serverModeAWGRuntimeStatus(mode)}
		}
		seenInterfaces[iface] = awg.ID
		seenPorts[awg.ListenPort] = awg.ID
	}
	if conflicts := serverModeAWGConfiguredNetworkConflicts(mode); len(conflicts) > 0 {
		return map[string]any{"ok": false, "error": "Подсети AWG-серверов пересекаются.", "errors": conflicts, "plan": plan, "status": s.serverModeAWGRuntimeStatus(mode)}
	}
	storedMode, _ := s.loadServerModeConfig()
	ownedInterfaces := map[string]bool{}
	serviceOwnsInterfaces := fileExists(serverModeAWGServicePath) && runTimeout(4*time.Second, serverModeAWGServicePath, "enabled")["ok"] == true
	if serviceOwnsInterfaces {
		for _, awg := range storedMode.AWG {
			if awg.Enabled && strings.TrimSpace(awg.Interface) != "" {
				ownedInterfaces[strings.ToLower(strings.TrimSpace(awg.Interface))] = true
			}
		}
	}
	for _, awg := range mode.AWG {
		if !awg.Enabled {
			continue
		}
		iface := strings.ToLower(strings.TrimSpace(awg.Interface))
		if runTimeout(4*time.Second, "ip", "link", "show", "dev", awg.Interface)["ok"] == true && !ownedInterfaces[iface] {
			return map[string]any{"ok": false, "error": fmt.Sprintf("Интерфейс %s уже существует и не управляется текущим server-mode.", awg.Interface), "plan": plan, "status": s.serverModeAWGRuntimeStatus(mode)}
		}
	}
	routes := runTimeout(5*time.Second, "ip", "-4", "route", "show")
	if routes["ok"] != true {
		return map[string]any{"ok": false, "error": "Не удалось проверить существующие IPv4-маршруты перед запуском AWG.", "routeCheck": routes, "plan": plan}
	}
	if conflicts := serverModeAWGRouteConflicts(mode, fmt.Sprint(routes["stdout"]), ownedInterfaces); len(conflicts) > 0 {
		return map[string]any{"ok": false, "error": "Подсеть AWG конфликтует с существующей сетью роутера.", "errors": conflicts, "plan": plan, "status": s.serverModeAWGRuntimeStatus(mode)}
	}
	if err := s.saveServerModeConfig(mode); err != nil {
		return map[string]any{"ok": false, "error": err.Error(), "plan": plan}
	}

	backup := s.backupFirewallUCI("server-mode-awg-runtime")
	steps := []map[string]any{}
	serviceBody := serverModeAWGServiceScript(s.serverModeAWGRuntimeDir())
	if err := writeServerModeRuntimeFile(serverModeAWGServicePath, []byte(serviceBody), 0o755); err != nil {
		return map[string]any{"ok": false, "error": err.Error(), "backup": backup, "plan": plan}
	}
	steps = append(steps, map[string]any{"ok": true, "action": "write-service", "path": serverModeAWGServicePath})
	steps = append(steps, runTimeout(15*time.Second, serverModeAWGServicePath, "stop"))

	written, writeErr := s.writeServerModeAWGRuntimeFiles(mode)
	if writeErr != nil {
		return map[string]any{"ok": false, "error": writeErr.Error(), "backup": backup, "plan": plan, "steps": steps}
	}
	steps = append(steps, map[string]any{"ok": true, "action": "write-configs", "count": len(written)})
	steps = append(steps, serverModeAWGFirewallClearStep())
	for _, awg := range mode.AWG {
		if awg.Enabled {
			steps = append(steps, serverModeAWGFirewallSetSteps(awg, routerIPs)...)
		}
	}
	steps = append(steps, runTimeout(10*time.Second, "uci", "commit", "firewall"))
	if fileExists("/etc/init.d/firewall") {
		steps = append(steps, runTimeout(20*time.Second, "/etc/init.d/firewall", "reload"))
	}
	if !serverModeStepsOK(steps) {
		rollback := s.serverModeAWGRuntimeRollback(storedMode, serviceOwnsInterfaces, backup)
		return map[string]any{"ok": false, "error": "Не удалось применить firewall для AWG runtime; выполнен откат к предыдущей конфигурации.", "backup": backup, "plan": plan, "steps": steps, "rollback": rollback, "status": s.serverModeAWGRuntimeStatus(storedMode)}
	}
	steps = append(steps, runTimeout(10*time.Second, serverModeAWGServicePath, "enable"))
	steps = append(steps, runTimeout(25*time.Second, serverModeAWGServicePath, "restart"))
	status := s.serverModeAWGRuntimeStatus(mode)
	ok := serverModeStepsOK(steps) && status["healthy"] == true
	rollback := map[string]any(nil)
	if !ok {
		rollback = s.serverModeAWGRuntimeRollback(storedMode, serviceOwnsInterfaces, backup)
		status = s.serverModeAWGRuntimeStatus(storedMode)
	}
	result := map[string]any{
		"ok": ok, "backup": backup, "plan": plan, "steps": steps, "status": status,
		"message": "AmneziaWG server runtime применен; доступ к WAN управляется отдельно.",
	}
	if !ok {
		result["error"] = "Интерфейсы AmneziaWG не прошли проверку после запуска; восстановлена предыдущая конфигурация."
		result["rollback"] = rollback
	}
	return result
}

type serverModeAWGNetwork struct {
	id       string
	iface    string
	network  *net.IPNet
	original string
}

func serverModeAWGConfiguredNetworkConflicts(mode serverModeConfig) []serverModeIssue {
	networks := []serverModeAWGNetwork{}
	for _, awg := range normalizeServerModeConfig(mode).AWG {
		if !mode.Enabled || !awg.Enabled {
			continue
		}
		_, network, err := net.ParseCIDR(strings.TrimSpace(awg.AddressCIDR))
		if err != nil || network.IP.To4() == nil {
			continue
		}
		for _, existing := range networks {
			if serverModeIPNetworksOverlap(network, existing.network) {
				return []serverModeIssue{{
					Severity: "error",
					Title:    "Пересекающиеся подсети AWG",
					Detail:   fmt.Sprintf("%s (%s) пересекается с %s (%s).", awg.ID, awg.AddressCIDR, existing.id, existing.original),
					Source:   "awg:" + awg.ID,
				}}
			}
		}
		networks = append(networks, serverModeAWGNetwork{id: awg.ID, iface: awg.Interface, network: network, original: awg.AddressCIDR})
	}
	return nil
}

func serverModeAWGRouteConflicts(mode serverModeConfig, routeOutput string, ignoredInterfaces map[string]bool) []serverModeIssue {
	routes := []serverModeAWGNetwork{}
	for _, line := range strings.Split(routeOutput, "\n") {
		fields := strings.Fields(strings.TrimSpace(line))
		if len(fields) == 0 || fields[0] == "default" {
			continue
		}
		dev := ""
		for i := 0; i+1 < len(fields); i++ {
			if fields[i] == "dev" {
				dev = fields[i+1]
				break
			}
		}
		if ignoredInterfaces[strings.ToLower(dev)] {
			continue
		}
		prefix := fields[0]
		if !strings.Contains(prefix, "/") && net.ParseIP(prefix) != nil {
			prefix += "/32"
		}
		_, network, err := net.ParseCIDR(prefix)
		if err != nil || network.IP.To4() == nil {
			continue
		}
		routes = append(routes, serverModeAWGNetwork{id: firstNonEmpty(dev, prefix), iface: dev, network: network, original: prefix})
	}
	issues := []serverModeIssue{}
	for _, awg := range normalizeServerModeConfig(mode).AWG {
		if !mode.Enabled || !awg.Enabled {
			continue
		}
		_, network, err := net.ParseCIDR(strings.TrimSpace(awg.AddressCIDR))
		if err != nil || network.IP.To4() == nil {
			continue
		}
		for _, route := range routes {
			if serverModeIPNetworksOverlap(network, route.network) {
				issues = append(issues, serverModeIssue{
					Severity: "error",
					Title:    "Подсеть AWG уже маршрутизируется",
					Detail:   fmt.Sprintf("%s (%s) пересекается с маршрутом %s через %s.", awg.ID, awg.AddressCIDR, route.original, route.id),
					Source:   "awg:" + awg.ID,
				})
				break
			}
		}
	}
	return issues
}

func serverModeIPNetworksOverlap(left, right *net.IPNet) bool {
	if left == nil || right == nil {
		return false
	}
	return left.Contains(right.IP) || right.Contains(left.IP)
}

func (s *serverState) serverModeAWGRuntimeDisable() map[string]any {
	if runtime.GOOS == "windows" || !commandExists("uci") {
		return map[string]any{"ok": false, "available": false, "error": "AWG runtime недоступен на этой системе."}
	}
	mode, _ := s.loadServerModeConfig()
	backup := s.backupFirewallUCI("server-mode-awg-runtime-disable")
	steps := []map[string]any{}
	if fileExists(serverModeAWGServicePath) {
		steps = append(steps,
			runTimeout(15*time.Second, serverModeAWGServicePath, "stop"),
			runTimeout(10*time.Second, serverModeAWGServicePath, "disable"),
		)
	}
	steps = append(steps, serverModeAWGFirewallClearStep(), runTimeout(10*time.Second, "uci", "commit", "firewall"))
	if fileExists("/etc/init.d/firewall") {
		steps = append(steps, runTimeout(20*time.Second, "/etc/init.d/firewall", "reload"))
	}
	status := s.serverModeAWGRuntimeStatus(mode)
	return map[string]any{
		"ok":     serverModeStepsOK(steps) && status["active"] != true && status["enabled"] != true,
		"backup": backup, "steps": steps, "status": status,
		"message": "AmneziaWG server runtime остановлен, его managed firewall удален.",
	}
}

func (s *serverState) writeServerModeAWGRuntimeFiles(mode serverModeConfig) ([]string, error) {
	dir := s.serverModeAWGRuntimeDir()
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return nil, err
	}
	if err := os.Chmod(dir, 0o700); err != nil {
		return nil, err
	}
	wanted := map[string]bool{}
	written := []string{}
	for _, awg := range mode.AWG {
		if !mode.Enabled || !awg.Enabled {
			continue
		}
		plan := serverModeBuildAWGServerPlan(awg, filepath.Join(dir, serverModeSlug(awg.ID)+".conf"))
		if plan["ok"] != true {
			return written, fmt.Errorf("AWG plan %s is invalid", awg.ID)
		}
		configPath := fmt.Sprint(plan["configPath"])
		setconfPath := fmt.Sprint(plan["setconfPath"])
		runtimePath := strings.TrimSuffix(configPath, filepath.Ext(configPath)) + ".runtime"
		files := map[string]string{
			configPath:  fmt.Sprint(plan["config"]),
			setconfPath: fmt.Sprint(plan["setconf"]),
			runtimePath: serverModeAWGRuntimeMetadata(awg, setconfPath, number(plan["mtu"], 1420)),
		}
		for path, body := range files {
			if err := writeServerModeRuntimeFile(path, []byte(body), 0o600); err != nil {
				return written, err
			}
			wanted[filepath.Clean(path)] = true
			written = append(written, path)
		}
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		return written, err
	}
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		ext := strings.ToLower(filepath.Ext(entry.Name()))
		if ext != ".conf" && ext != ".setconf" && ext != ".runtime" {
			continue
		}
		path := filepath.Join(dir, entry.Name())
		if !wanted[filepath.Clean(path)] {
			if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
				return written, err
			}
		}
	}
	sort.Strings(written)
	return written, nil
}

func writeServerModeRuntimeFile(path string, body []byte, mode os.FileMode) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	tmp := path + ".new"
	if err := os.WriteFile(tmp, body, mode); err != nil {
		return err
	}
	if err := os.Chmod(tmp, mode); err != nil {
		_ = os.Remove(tmp)
		return err
	}
	if err := os.Rename(tmp, path); err != nil {
		_ = os.Remove(tmp)
		return err
	}
	return nil
}

func serverModeAWGRuntimeMetadata(awg serverModeAWGServer, setconfPath string, mtu int) string {
	return strings.Join([]string{
		"INTERFACE=" + serverModeShellQuote(strings.TrimSpace(awg.Interface)),
		"ADDRESS=" + serverModeShellQuote(strings.TrimSpace(awg.AddressCIDR)),
		"MTU=" + serverModeShellQuote(fmt.Sprint(mtu)),
		"SETCONF=" + serverModeShellQuote(setconfPath),
		"",
	}, "\n")
}

func serverModeAWGServiceScript(runtimeDir string) string {
	return `#!/bin/sh /etc/rc.common
START=91
STOP=15
RUNTIME_DIR=` + serverModeShellQuote(runtimeDir) + `

stop_interfaces() {
	for meta in "$RUNTIME_DIR"/*.runtime; do
		[ -f "$meta" ] || continue
		INTERFACE=
		. "$meta"
		[ -n "$INTERFACE" ] || continue
		if ip link show dev "$INTERFACE" >/dev/null 2>&1; then
			ip link delete dev "$INTERFACE" || true
		fi
	done
	return 0
}

start() {
	stop_interfaces
	for meta in "$RUNTIME_DIR"/*.runtime; do
		[ -f "$meta" ] || continue
		INTERFACE=
		ADDRESS=
		MTU=
		SETCONF=
		. "$meta"
		[ -n "$INTERFACE" ] && [ -n "$ADDRESS" ] && [ -n "$MTU" ] && [ -f "$SETCONF" ] || return 1
		ip link add dev "$INTERFACE" type amneziawg || return 1
		awg setconf "$INTERFACE" "$SETCONF" || return 1
		ip addr replace "$ADDRESS" dev "$INTERFACE" || return 1
		ip link set mtu "$MTU" dev "$INTERFACE" || return 1
		ip link set up dev "$INTERFACE" || return 1
	done
}

stop() {
	stop_interfaces
}
`
}

func serverModeAWGFirewallSection(awg serverModeAWGServer, kind string) string {
	clean := strings.ReplaceAll(serverModeSlug(awg.ID), "-", "_")
	for strings.Contains(clean, "__") {
		clean = strings.ReplaceAll(clean, "__", "_")
	}
	if len(clean) > 32 {
		clean = strings.Trim(clean[:32], "_")
	}
	if clean == "" {
		clean = "server"
	}
	return serverModeAWGFirewallPrefix + kind + "_" + clean
}

func serverModeAWGFirewallClearStep() map[string]any {
	script := `for s in $(uci -q show firewall | sed -n 's/^\(firewall\.ruopenray_awg_[A-Za-z0-9_]*\)=.*/\1/p'); do uci -q delete "$s"; done`
	return runTimeout(8*time.Second, "sh", "-c", script)
}

type serverModeAWGFirewallACL struct {
	Section   string
	SourceIPs []string
	DestZone  string
	DestIPs   []string
	Protocol  string
	Ports     string
	Target    string
}

func serverModeAWGFirewallSetSteps(awg serverModeAWGServer, routerIPs []string) []map[string]any {
	zoneSection := serverModeAWGFirewallSection(awg, "zone")
	zoneName := zoneSection
	wanSection := serverModeAWGFirewallSection(awg, "wan")
	steps := []map[string]any{
		runTimeout(5*time.Second, "uci", "set", "firewall."+zoneSection+"=zone"),
		runTimeout(5*time.Second, "uci", "set", "firewall."+zoneSection+".name="+zoneName),
		runTimeout(5*time.Second, "uci", "add_list", "firewall."+zoneSection+".device="+awg.Interface),
		runTimeout(5*time.Second, "uci", "set", "firewall."+zoneSection+".input=REJECT"),
		runTimeout(5*time.Second, "uci", "set", "firewall."+zoneSection+".output=ACCEPT"),
		runTimeout(5*time.Second, "uci", "set", "firewall."+zoneSection+".forward=REJECT"),
		runTimeout(5*time.Second, "uci", "set", "firewall."+zoneSection+".family=ipv4"),
		runTimeout(5*time.Second, "uci", "set", "firewall."+wanSection+"=forwarding"),
		runTimeout(5*time.Second, "uci", "set", "firewall."+wanSection+".src="+zoneName),
		runTimeout(5*time.Second, "uci", "set", "firewall."+wanSection+".dest=wan"),
	}
	for _, acl := range serverModeAWGFirewallACLs(awg, routerIPs) {
		steps = append(steps, serverModeAWGFirewallACLSteps(zoneName, acl)...)
	}
	return steps
}

func serverModeAWGFirewallACLs(awg serverModeAWGServer, routerIPs []string) []serverModeAWGFirewallACL {
	acls := []serverModeAWGFirewallACL{}
	for _, peer := range awg.Peers {
		if !peer.Enabled {
			continue
		}
		sources := serverModeAWGPeerSourceIPv4(peer)
		if len(sources) == 0 {
			continue
		}
		if awg.AllowLAN || peer.AllowLAN {
			acls = append(acls, serverModeAWGFirewallACL{
				Section:   serverModeAWGFirewallACLSection(awg, peer, "lan"),
				SourceIPs: sources,
				DestZone:  "lan",
				Target:    "ACCEPT",
			})
		} else if destIPs, ports, protocol, err := serverModeNormalizeLANACL(peer.LANAllowedIPs, peer.LANAllowedPorts, peer.LANProtocol); err == nil && len(destIPs) > 0 {
			acls = append(acls, serverModeAWGFirewallACL{
				Section:   serverModeAWGFirewallACLSection(awg, peer, "limit"),
				SourceIPs: sources,
				DestZone:  "lan",
				DestIPs:   destIPs,
				Protocol:  protocol,
				Ports:     ports,
				Target:    "ACCEPT",
			})
		}
		if peer.AllowRouter && !peer.AllowDNS && len(routerIPs) > 0 {
			acls = append(acls, serverModeAWGFirewallACL{
				Section:   serverModeAWGFirewallACLSection(awg, peer, "dnsdeny"),
				SourceIPs: sources,
				DestIPs:   routerIPs,
				Protocol:  "any",
				Ports:     "53",
				Target:    "REJECT",
			})
		}
		if peer.AllowRouter && len(routerIPs) > 0 {
			acls = append(acls, serverModeAWGFirewallACL{
				Section:   serverModeAWGFirewallACLSection(awg, peer, "router"),
				SourceIPs: sources,
				DestIPs:   routerIPs,
				Target:    "ACCEPT",
			})
		} else if peer.AllowDNS && len(routerIPs) > 0 {
			acls = append(acls, serverModeAWGFirewallACL{
				Section:   serverModeAWGFirewallACLSection(awg, peer, "dns"),
				SourceIPs: sources,
				DestIPs:   routerIPs,
				Protocol:  "any",
				Ports:     "53",
				Target:    "ACCEPT",
			})
		}
	}
	return acls
}

func serverModeAWGPeerSourceIPv4(peer serverModeAWGPeer) []string {
	normalized, _, err := serverModeNormalizeAllowedIPs(peer.AllowedIPs)
	if err != nil {
		return nil
	}
	out := []string{}
	for _, value := range strings.Split(normalized, ",") {
		clean := strings.TrimSpace(value)
		ip, _, parseErr := net.ParseCIDR(clean)
		if parseErr == nil && ip.To4() != nil {
			out = append(out, clean)
		}
	}
	return out
}

func serverModeAWGFirewallACLSection(awg serverModeAWGServer, peer serverModeAWGPeer, kind string) string {
	hash := fnv.New32a()
	_, _ = hash.Write([]byte(awg.ID + "\x00" + peer.ID + "\x00" + kind))
	kind = strings.ReplaceAll(serverModeSlug(kind), "-", "_")
	if len(kind) > 5 {
		kind = kind[:5]
	}
	return fmt.Sprintf("%sacl_%s_%08x", serverModeAWGFirewallPrefix, kind, hash.Sum32())
}

func serverModeAWGFirewallACLSteps(zoneName string, acl serverModeAWGFirewallACL) []map[string]any {
	prefix := "firewall." + acl.Section
	steps := []map[string]any{
		runTimeout(5*time.Second, "uci", "set", prefix+"=rule"),
		runTimeout(5*time.Second, "uci", "set", prefix+".name="+acl.Section),
		runTimeout(5*time.Second, "uci", "set", prefix+".src="+zoneName),
		runTimeout(5*time.Second, "uci", "set", prefix+".family=ipv4"),
	}
	for _, source := range acl.SourceIPs {
		steps = append(steps, runTimeout(5*time.Second, "uci", "add_list", prefix+".src_ip="+source))
	}
	if acl.DestZone != "" {
		steps = append(steps, runTimeout(5*time.Second, "uci", "set", prefix+".dest="+acl.DestZone))
	}
	for _, destination := range acl.DestIPs {
		steps = append(steps, runTimeout(5*time.Second, "uci", "add_list", prefix+".dest_ip="+destination))
	}
	if acl.Ports != "" {
		steps = append(steps, runTimeout(5*time.Second, "uci", "set", prefix+".dest_port="+strings.ReplaceAll(acl.Ports, ",", " ")))
	}
	switch acl.Protocol {
	case "tcp", "udp":
		steps = append(steps, runTimeout(5*time.Second, "uci", "set", prefix+".proto="+acl.Protocol))
	case "any":
		if acl.Ports != "" {
			steps = append(steps,
				runTimeout(5*time.Second, "uci", "add_list", prefix+".proto=tcp"),
				runTimeout(5*time.Second, "uci", "add_list", prefix+".proto=udp"),
			)
		}
	}
	steps = append(steps, runTimeout(5*time.Second, "uci", "set", prefix+".target="+firstNonEmpty(acl.Target, "ACCEPT")))
	return steps
}

func serverModeAWGFirewallInventory(mode serverModeConfig, uciOutput string, routerIPs []string) map[string]any {
	managed := []string{}
	managedSet := map[string]bool{}
	for _, line := range strings.Split(uciOutput, "\n") {
		left := strings.TrimSpace(strings.SplitN(line, "=", 2)[0])
		if !strings.HasPrefix(left, "firewall."+serverModeAWGFirewallPrefix) {
			continue
		}
		section := strings.TrimPrefix(left, "firewall.")
		if index := strings.Index(section, "."); index >= 0 {
			section = section[:index]
		}
		if section != "" && !managedSet[section] {
			managedSet[section] = true
			managed = append(managed, section)
		}
	}
	expected := []string{}
	expectedSet := map[string]bool{}
	if mode.Enabled {
		for _, awg := range mode.AWG {
			if !awg.Enabled {
				continue
			}
			for _, section := range []string{serverModeAWGFirewallSection(awg, "zone"), serverModeAWGFirewallSection(awg, "wan")} {
				if !expectedSet[section] {
					expectedSet[section] = true
					expected = append(expected, section)
				}
			}
			for _, acl := range serverModeAWGFirewallACLs(awg, routerIPs) {
				if !expectedSet[acl.Section] {
					expectedSet[acl.Section] = true
					expected = append(expected, acl.Section)
				}
			}
		}
	}
	stale := []string{}
	for _, section := range managed {
		if !expectedSet[section] {
			stale = append(stale, section)
		}
	}
	missing := []string{}
	for _, section := range expected {
		if !managedSet[section] {
			missing = append(missing, section)
		}
	}
	sort.Strings(managed)
	sort.Strings(expected)
	sort.Strings(stale)
	sort.Strings(missing)
	return map[string]any{
		"managed":  managed,
		"expected": expected,
		"stale":    stale,
		"missing":  missing,
		"healthy":  len(stale) == 0 && len(missing) == 0,
	}
}

func (s *serverState) serverModeAWGRuntimeRollback(previous serverModeConfig, previousServiceEnabled bool, backup map[string]any) map[string]any {
	steps := []map[string]any{
		runTimeout(10*time.Second, serverModeAWGServicePath, "stop"),
		runTimeout(10*time.Second, serverModeAWGServicePath, "disable"),
	}
	if backup != nil && backup["ok"] == true && strings.TrimSpace(fmt.Sprint(backup["path"])) != "" {
		path := strings.TrimSpace(fmt.Sprint(backup["path"]))
		steps = append(steps, runTimeout(15*time.Second, "sh", "-c", serverModeFirewallRestoreCommand(path)))
	} else {
		steps = append(steps, serverModeAWGFirewallClearStep(), runTimeout(10*time.Second, "uci", "commit", "firewall"))
	}
	if fileExists("/etc/init.d/firewall") {
		steps = append(steps, runTimeout(20*time.Second, "/etc/init.d/firewall", "reload"))
	}
	if err := s.saveServerModeConfig(previous); err != nil {
		steps = append(steps, map[string]any{"ok": false, "action": "restore-server-mode-config", "error": err.Error()})
	} else {
		steps = append(steps, map[string]any{"ok": true, "action": "restore-server-mode-config"})
	}
	if _, err := s.writeServerModeAWGRuntimeFiles(previous); err != nil {
		steps = append(steps, map[string]any{"ok": false, "action": "restore-runtime-files", "error": err.Error()})
	} else {
		steps = append(steps, map[string]any{"ok": true, "action": "restore-runtime-files"})
	}
	if previousServiceEnabled && serverModeAWGEnabledCount(previous) > 0 {
		steps = append(steps,
			runTimeout(10*time.Second, serverModeAWGServicePath, "enable"),
			runTimeout(25*time.Second, serverModeAWGServicePath, "restart"),
		)
	}
	return map[string]any{"ok": serverModeStepsOK(steps), "steps": steps}
}

func serverModeFirewallRestoreCommand(path string) string {
	return "uci -q revert firewall; uci import firewall < " + serverModeShellQuote(path) + " && uci commit firewall"
}

func serverModeAWGEnabledCount(mode serverModeConfig) int {
	count := 0
	if mode.Enabled {
		for _, awg := range mode.AWG {
			if awg.Enabled {
				count++
			}
		}
	}
	return count
}
