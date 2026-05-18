package main

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	rfw "github.com/AceAsket/RuOpenRay/internal/firewall"
)

const (
	ruOpenRayFirewallNftPath       = "/etc/ruopenray-ui/firewall.nft"
	ruOpenRayFirewallLegacyNftPath = "/etc/nftables.d/ruopenray.nft"
	ruOpenRayFirewallHotplugPath   = "/etc/hotplug.d/iface/90-ruopenray-tproxy"
)

func applyTProxyPolicyRouting(enabled bool) []map[string]any {
	if !enabled {
		return []map[string]any{
			runTimeout(5*time.Second, "ip", "rule", "del", "fwmark", "1", "table", "100"),
			runTimeout(5*time.Second, "ip", "route", "flush", "table", "100"),
		}
	}
	return []map[string]any{
		runTimeout(5*time.Second, "ip", "rule", "del", "fwmark", "1", "table", "100"),
		runTimeout(5*time.Second, "ip", "route", "flush", "table", "100"),
		runTimeout(5*time.Second, "ip", "rule", "add", "fwmark", "1", "table", "100"),
		runTimeout(5*time.Second, "ip", "route", "add", "local", "0.0.0.0/0", "dev", "lo", "table", "100"),
	}
}

func (s *serverState) firewallStatus() map[string]any {
	nftExists := false
	nftBody := ""
	if body, err := os.ReadFile(ruOpenRayFirewallNftPath); err == nil {
		nftExists = true
		nftBody = string(body)
	}
	hotplugExists := false
	if _, err := os.Stat(ruOpenRayFirewallHotplugPath); err == nil {
		hotplugExists = true
	}
	nftActive := runTimeout(5*time.Second, "nft", "list", "table", "inet", "ruopenray")
	ipRules := runTimeout(5*time.Second, "ip", "rule", "show")
	ipRoutes := runTimeout(5*time.Second, "ip", "route", "show", "table", "100")
	ipRuleActive := strings.Contains(fmt.Sprint(ipRules["stdout"]), "fwmark 0x1") && strings.Contains(fmt.Sprint(ipRules["stdout"]), "lookup 100")
	ipRouteActive := strings.Contains(fmt.Sprint(ipRoutes["stdout"]), "local") && strings.Contains(fmt.Sprint(ipRoutes["stdout"]), "dev lo")
	routerMode := "unknown"
	if strings.Contains(nftBody, " tproxy ") {
		routerMode = "tproxy"
	} else if strings.Contains(nftBody, " redirect ") {
		routerMode = "redirect"
	}
	return map[string]any{
		"ok":          true,
		"available":   runtime.GOOS != "windows" && commandExists("nft"),
		"persistent":  nftExists,
		"active":      nftActive["ok"] == true,
		"nftPath":     ruOpenRayFirewallNftPath,
		"hotplugPath": ruOpenRayFirewallHotplugPath,
		"hotplug":     hotplugExists,
		"routerMode":  routerMode,
		"ipRule":      ipRuleActive,
		"ipRoute":     ipRouteActive,
		"nft":         nftActive,
		"ipRules":     ipRules,
		"ipRoutes":    ipRoutes,
		"tproxyModules": tproxyModuleStatus(func() string {
			if commandExists("apk") {
				return "apk"
			}
			if commandExists("opkg") {
				return "opkg"
			}
			return ""
		}()),
		"needsPolicyFix": routerMode == "tproxy" && (!ipRuleActive || !ipRouteActive || !hotplugExists),
	}
}

func (s *serverState) firewallSnapshot() map[string]any {
	status := s.firewallStatus()
	nftBody := ""
	if body, err := os.ReadFile(ruOpenRayFirewallNftPath); err == nil {
		nftBody = string(body)
	}
	hotplugBody := ""
	if body, err := os.ReadFile(ruOpenRayFirewallHotplugPath); err == nil {
		hotplugBody = string(body)
	}
	return map[string]any{
		"ok":          true,
		"status":      status,
		"nftBody":     nftBody,
		"hotplugBody": hotplugBody,
	}
}

func (s *serverState) applyFirewall(payload map[string]any) map[string]any {
	if runtime.GOOS == "windows" || !commandExists("nft") {
		return map[string]any{"ok": false, "available": false, "error": "nftables недоступен на этой системе"}
	}
	body, meta := rfw.NativeNft(payload)
	routerMode := fmt.Sprint(meta["routerMode"])
	steps := []map[string]any{}
	if err := os.MkdirAll(filepath.Dir(ruOpenRayFirewallNftPath), 0o755); err != nil {
		return map[string]any{"ok": false, "error": err.Error(), "nft": body, "meta": meta}
	}
	if err := os.WriteFile(ruOpenRayFirewallNftPath, []byte(body), 0o644); err != nil {
		return map[string]any{"ok": false, "error": err.Error(), "nft": body, "meta": meta}
	}
	_ = os.Remove(ruOpenRayFirewallLegacyNftPath)
	if routerMode == "tproxy" {
		_ = os.MkdirAll(filepath.Dir(ruOpenRayFirewallHotplugPath), 0o755)
		if err := os.WriteFile(ruOpenRayFirewallHotplugPath, []byte(rfw.HotplugScript()), 0o755); err != nil {
			return map[string]any{"ok": false, "error": err.Error(), "nft": body, "meta": meta}
		}
	} else {
		_ = os.Remove(ruOpenRayFirewallHotplugPath)
	}
	if commandExists("/etc/init.d/firewall") {
		steps = append(steps, runTimeout(20*time.Second, "/etc/init.d/firewall", "reload"))
	}
	steps = append(steps, runTimeout(5*time.Second, "nft", "delete", "table", "inet", "ruopenray"))
	steps = append(steps, runTimeout(10*time.Second, "nft", "-f", ruOpenRayFirewallNftPath))
	steps = append(steps, applyTProxyPolicyRouting(routerMode == "tproxy")...)
	status := s.firewallStatus()
	ok := rfw.AllStepsOK(steps) && status["active"] == true
	if routerMode == "tproxy" {
		ok = ok && status["ipRule"] == true && status["ipRoute"] == true
	}
	return map[string]any{"ok": ok, "nft": body, "meta": meta, "steps": steps, "status": status}
}

func (s *serverState) restoreFirewallSnapshot(payload map[string]any) map[string]any {
	rawSnapshot := payload
	if nested, ok := payload["snapshot"].(map[string]any); ok {
		rawSnapshot = nested
	}
	nftBody := cleanPayloadString(rawSnapshot, "nftBody")
	hotplugBody := cleanPayloadString(rawSnapshot, "hotplugBody")
	if strings.TrimSpace(nftBody) == "" {
		return s.disableFirewall()
	}
	steps := []map[string]any{}
	if err := os.MkdirAll(filepath.Dir(ruOpenRayFirewallNftPath), 0o755); err != nil {
		return map[string]any{"ok": false, "error": err.Error()}
	}
	if err := os.WriteFile(ruOpenRayFirewallNftPath, []byte(nftBody), 0o644); err != nil {
		return map[string]any{"ok": false, "error": err.Error()}
	}
	if strings.TrimSpace(hotplugBody) != "" {
		_ = os.MkdirAll(filepath.Dir(ruOpenRayFirewallHotplugPath), 0o755)
		if err := os.WriteFile(ruOpenRayFirewallHotplugPath, []byte(hotplugBody), 0o755); err != nil {
			return map[string]any{"ok": false, "error": err.Error()}
		}
	} else {
		_ = os.Remove(ruOpenRayFirewallHotplugPath)
	}
	_ = os.Remove(ruOpenRayFirewallLegacyNftPath)
	if commandExists("/etc/init.d/firewall") {
		steps = append(steps, runTimeout(20*time.Second, "/etc/init.d/firewall", "reload"))
	}
	if commandExists("nft") {
		steps = append(steps, runTimeout(5*time.Second, "nft", "delete", "table", "inet", "ruopenray"))
		steps = append(steps, runTimeout(10*time.Second, "nft", "-f", ruOpenRayFirewallNftPath))
	}
	routerMode := "redirect"
	if strings.Contains(nftBody, " tproxy ") {
		routerMode = "tproxy"
	}
	steps = append(steps, applyTProxyPolicyRouting(routerMode == "tproxy")...)
	status := s.firewallStatus()
	ok := rfw.AllStepsOK(steps) && status["active"] == true
	if routerMode == "tproxy" {
		ok = ok && status["ipRule"] == true && status["ipRoute"] == true
	}
	return map[string]any{"ok": ok, "steps": steps, "status": status}
}

func (s *serverState) disableFirewall() map[string]any {
	steps := []map[string]any{}
	_ = os.Remove(ruOpenRayFirewallNftPath)
	_ = os.Remove(ruOpenRayFirewallLegacyNftPath)
	_ = os.Remove(ruOpenRayFirewallHotplugPath)
	if commandExists("/etc/init.d/firewall") {
		steps = append(steps, runTimeout(20*time.Second, "/etc/init.d/firewall", "reload"))
	}
	if commandExists("nft") {
		steps = append(steps, runTimeout(5*time.Second, "nft", "delete", "table", "inet", "ruopenray"))
	}
	steps = append(steps, applyTProxyPolicyRouting(false)...)
	status := s.firewallStatus()
	return map[string]any{"ok": rfw.AllStepsOK(steps), "steps": steps, "status": status}
}
