package main

import (
	rxraystats "github.com/AceAsket/RuOpenRay/internal/xraystats"
	"strings"
	"testing"
)

func TestServerModePatchAddsInboundAndClientPolicies(t *testing.T) {
	active := map[string]any{
		"inbounds": []any{},
		"outbounds": []any{
			map[string]any{"tag": "direct", "protocol": "freedom"},
			map[string]any{"tag": "proxy", "protocol": "vless"},
		},
		"routing": map[string]any{"rules": []any{
			map[string]any{"type": "field", "domain": []any{"domain:example.com"}, "outboundTag": "direct"},
		}},
	}
	mode := normalizeServerModeConfig(serverModeConfig{
		Enabled: true,
		Xray: []serverModeXrayInbound{{
			ID:       "public",
			Name:     "Public",
			Enabled:  true,
			Listen:   "0.0.0.0",
			Port:     1443,
			Protocol: "vless",
			Network:  "tcp",
			Security: "reality",
			Reality: serverModeReality{
				Dest:        "www.microsoft.com:443",
				ServerNames: []string{"www.microsoft.com"},
				PrivateKey:  "private-key",
				ShortIDs:    []string{"abcd"},
			},
			Clients: []serverModeClient{{
				ID:        "alice",
				Name:      "Alice",
				UUID:      "11111111-1111-4111-8111-111111111111",
				Email:     "alice@example",
				Enabled:   true,
				EgressTag: "proxy",
			}},
		}},
	})
	preflight := serverModePreflight(mode, active)
	if preflight["ok"] != true {
		t.Fatalf("preflight failed: %#v", preflight)
	}
	patched := serverModePatchConfig(active, mode)
	info := rxraystats.APIInfo(patched)
	if info["enabled"] != true || info["userPolicy"] != true {
		t.Fatalf("server mode should enable outbound and user stats: %#v", info)
	}
	summary := serverModeManagedSummary(patched)
	if summary["inbounds"] != 1 || summary["clients"] != 1 || summary["routingRules"] != 3 {
		t.Fatalf("unexpected managed summary: %#v", summary)
	}
	rules := anySlice(mapValue(patched["routing"])["rules"])
	if len(rules) < 3 {
		t.Fatalf("expected managed rules at head, got %#v", rules)
	}
	if mapValue(rules[0])["outboundTag"] != serverModeBlockTag || mapValue(rules[0])["port"] != "53" {
		t.Fatalf("first rule should block DNS, got %#v", rules[0])
	}
	if mapValue(rules[1])["outboundTag"] != serverModeBlockTag {
		t.Fatalf("second rule should block LAN/private IP, got %#v", rules[1])
	}
	if mapValue(rules[2])["outboundTag"] != "proxy" {
		t.Fatalf("third rule should route client to proxy, got %#v", rules[2])
	}
}

func TestServerModeStripManagedKeepsUserRules(t *testing.T) {
	cfg := map[string]any{
		"inbounds": []any{
			map[string]any{"tag": serverModeInboundTag("old")},
			map[string]any{"tag": "socks-in"},
		},
		"outbounds": []any{
			map[string]any{"tag": serverModeBlockTag, "protocol": "blackhole"},
			map[string]any{"tag": "proxy", "protocol": "vless"},
		},
		"routing": map[string]any{"rules": []any{
			map[string]any{"type": "field", "user": []any{"ruopenray-server-old-client"}, "outboundTag": "proxy"},
			map[string]any{"type": "field", "domain": []any{"domain:example.com"}, "outboundTag": "proxy"},
		}},
	}
	serverModeStripManaged(cfg)
	if got := len(anySlice(cfg["inbounds"])); got != 1 {
		t.Fatalf("expected one user inbound, got %d", got)
	}
	if got := len(anySlice(cfg["outbounds"])); got != 1 {
		t.Fatalf("expected one user outbound, got %d", got)
	}
	rules := anySlice(mapValue(cfg["routing"])["rules"])
	if len(rules) != 1 || mapValue(rules[0])["outboundTag"] != "proxy" {
		t.Fatalf("expected only user routing rule, got %#v", rules)
	}
}

func TestServerModePreflightRejectsPlainWANInbound(t *testing.T) {
	active := map[string]any{
		"inbounds":  []any{},
		"outbounds": []any{map[string]any{"tag": "direct", "protocol": "freedom"}},
		"routing":   map[string]any{"rules": []any{}},
	}
	mode := normalizeServerModeConfig(serverModeConfig{
		Enabled: true,
		Xray: []serverModeXrayInbound{{
			ID:       "plain",
			Enabled:  true,
			Listen:   "0.0.0.0",
			Port:     1443,
			Protocol: "vless",
			Network:  "tcp",
			Security: "none",
			Clients: []serverModeClient{{
				ID:        "client",
				UUID:      "11111111-1111-4111-8111-111111111111",
				Enabled:   true,
				EgressTag: "direct",
			}},
		}},
	})
	preflight := serverModePreflight(mode, active)
	if preflight["ok"] == true {
		t.Fatalf("plain WAN inbound should be rejected: %#v", preflight)
	}
}

func TestServerModeAllowRouterDoesNotOpenWholeLAN(t *testing.T) {
	active := map[string]any{
		"inbounds":  []any{},
		"outbounds": []any{map[string]any{"tag": "direct", "protocol": "freedom"}},
		"routing":   map[string]any{"rules": []any{}},
	}
	mode := normalizeServerModeConfig(serverModeConfig{
		Enabled: true,
		Xray: []serverModeXrayInbound{{
			ID:       "public",
			Enabled:  true,
			Listen:   "127.0.0.1",
			Port:     1443,
			Protocol: "vless",
			Network:  "tcp",
			Security: "none",
			Clients: []serverModeClient{{
				ID:          "alice",
				UUID:        "11111111-1111-4111-8111-111111111111",
				Enabled:     true,
				EgressTag:   "direct",
				AllowRouter: true,
			}},
		}},
	})
	patched := serverModePatchConfig(active, mode)
	rules := anySlice(mapValue(patched["routing"])["rules"])
	if len(rules) < 3 {
		t.Fatalf("expected dns/router/private rules, got %#v", rules)
	}
	routerRule := mapValue(rules[1])
	if routerRule["outboundTag"] != "direct" {
		t.Fatalf("router rule should go direct before LAN block, got %#v", routerRule)
	}
	lanBlock := mapValue(rules[2])
	if lanBlock["outboundTag"] != serverModeBlockTag {
		t.Fatalf("private LAN must still be blocked, got %#v", lanBlock)
	}
}

func TestServerModeAWGPlanWarnsWithoutApplyingInterface(t *testing.T) {
	active := map[string]any{
		"inbounds":  []any{},
		"outbounds": []any{map[string]any{"tag": "direct", "protocol": "freedom"}},
		"routing":   map[string]any{"rules": []any{}},
	}
	mode := normalizeServerModeConfig(serverModeConfig{
		Enabled: true,
		AWG: []serverModeAWGServer{{
			ID:          "family",
			Enabled:     true,
			ListenPort:  51820,
			AddressCIDR: "10.70.0.1/24",
			EgressTag:   "direct",
			Peers: []serverModeAWGPeer{{
				ID:         "phone",
				Enabled:    true,
				AllowedIPs: "10.70.0.2/32",
			}},
		}},
	})
	preflight := serverModePreflight(mode, active)
	if preflight["ok"] != true {
		t.Fatalf("AWG plan should not block Xray apply yet: %#v", preflight)
	}
	warnings := preflight["warnings"].([]serverModeIssue)
	found := false
	for _, warning := range warnings {
		if warning.Title == "AWG server-mode пока не применяет интерфейс" {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("expected AWG not-applied warning, got %#v", warnings)
	}
}

func TestServerModeSecurityReportShowsClientPolicy(t *testing.T) {
	mode := normalizeServerModeConfig(serverModeConfig{
		Enabled: true,
		Xray: []serverModeXrayInbound{{
			ID:      "public",
			Enabled: true,
			Clients: []serverModeClient{
				{ID: "safe", Name: "Safe", UUID: "11111111-1111-4111-8111-111111111111", Enabled: true, EgressTag: "proxy"},
				{ID: "admin", Name: "Admin", UUID: "22222222-2222-4222-8222-222222222222", Enabled: true, EgressTag: "direct", AllowLAN: true, AllowDNS: true},
			},
		}},
	})
	report := serverModeSecurityReport(mode)
	if report["ok"] != true || report["safe"] == true {
		t.Fatalf("LAN-open client should make report risky: %#v", report)
	}
	summary := report["summary"].(map[string]int)
	if summary["xrayClients"] != 2 || summary["lanAllowed"] != 1 || summary["dnsAllowed"] != 1 || summary["highRisk"] != 1 {
		t.Fatalf("unexpected security summary: %#v", summary)
	}
	clients := report["clients"].([]map[string]any)
	if clients[0]["lan"] != "blocked" || clients[0]["dns"] != "blocked" || clients[0]["managedRules"] != 3 {
		t.Fatalf("safe client policy should block LAN/DNS with 3 rules, got %#v", clients[0])
	}
	if clients[1]["risk"] != "high" || clients[1]["lan"] != "allowed" || clients[1]["dns"] != "allowed" {
		t.Fatalf("admin client should be high-risk LAN/DNS allowed, got %#v", clients[1])
	}
}

func TestServerModeClientExportBuildsRealityURIAndOutbound(t *testing.T) {
	mode := normalizeServerModeConfig(serverModeConfig{
		Enabled: true,
		Xray: []serverModeXrayInbound{{
			ID:         "public",
			Name:       "Public",
			Enabled:    true,
			Listen:     "0.0.0.0",
			PublicHost: "old.example.com",
			Port:       1443,
			Protocol:   "vless",
			Network:    "tcp",
			Security:   "reality",
			Reality: serverModeReality{
				Dest:        "www.microsoft.com:443",
				ServerNames: []string{"www.microsoft.com"},
				PrivateKey:  "private-key",
				PublicKey:   "public-key",
				ShortIDs:    []string{"abcd"},
			},
			Clients: []serverModeClient{{
				ID:        "alice",
				Name:      "Alice Phone",
				UUID:      "11111111-1111-4111-8111-111111111111",
				Email:     "alice@example",
				Enabled:   true,
				EgressTag: "proxy",
				Flow:      "xtls-rprx-vision",
			}},
		}},
	})
	export := (&serverState{}).buildServerModeClientExport(map[string]any{
		"config":    mode,
		"inboundId": "public",
		"clientId":  "alice",
		"host":      "https://vpn.example.com:443/path",
	})
	if !export.OK {
		t.Fatalf("export failed: %#v", export)
	}
	if export.Host != "vpn.example.com" {
		t.Fatalf("host should be normalized, got %q", export.Host)
	}
	for _, part := range []string{
		"vless://11111111-1111-4111-8111-111111111111@vpn.example.com:1443?",
		"security=reality",
		"sni=www.microsoft.com",
		"pbk=public-key",
		"sid=abcd",
		"flow=xtls-rprx-vision",
	} {
		if !strings.Contains(export.URI, part) {
			t.Fatalf("URI %q should contain %q", export.URI, part)
		}
	}
	settings := mapValue(export.Outbound["settings"])
	vnext := anySlice(settings["vnext"])
	if len(vnext) != 1 || mapValue(vnext[0])["address"] != "vpn.example.com" || number(mapValue(vnext[0])["port"], 0) != 1443 {
		t.Fatalf("unexpected vnext: %#v", vnext)
	}
	stream := mapValue(export.Outbound["streamSettings"])
	reality := mapValue(stream["realitySettings"])
	if reality["publicKey"] != "public-key" || reality["shortId"] != "abcd" || reality["serverName"] != "www.microsoft.com" {
		t.Fatalf("unexpected reality settings: %#v", reality)
	}
}
