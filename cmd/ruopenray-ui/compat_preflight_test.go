package main

import "testing"

func TestFirewallCompatibilityPreflightClean(t *testing.T) {
	got := firewallCompatibilityPreflightFromStatuses(
		map[string]any{"dnsIntercept": true},
		map[string]any{"routerMode": "tproxy"},
		map[string]any{"active": false},
		map[string]any{"active": false},
	)
	if got["ok"] != true || got["requiresConfirmation"] == true {
		t.Fatalf("clean preflight = %#v, want ok without confirmation", got)
	}
}

func TestFirewallCompatibilityPreflightPodkopActive(t *testing.T) {
	got := firewallCompatibilityPreflightFromStatuses(
		map[string]any{"dnsIntercept": true},
		map[string]any{"routerMode": "tproxy"},
		map[string]any{
			"active":  true,
			"dnsmasq": map[string]any{"usesPodkopDNS": true},
			"routing": map[string]any{"ipRule": true},
		},
		nil,
	)
	if got["requiresConfirmation"] != true {
		t.Fatalf("podkop preflight = %#v, want confirmation", got)
	}
	issues, _ := got["issues"].([]map[string]any)
	if len(issues) < 2 {
		t.Fatalf("issues = %#v, want podkop and dns warnings", got["issues"])
	}
}

func TestFirewallCompatibilityPreflightB4NFQUEUE(t *testing.T) {
	got := firewallCompatibilityPreflightFromStatuses(
		map[string]any{"dnsIntercept": false},
		map[string]any{"routerMode": "redirect"},
		nil,
		map[string]any{
			"active":   false,
			"nft":      map[string]any{"hasQueue": true},
			"iptables": map[string]any{"hasNFQUEUE": false},
		},
	)
	if got["requiresConfirmation"] != true {
		t.Fatalf("b4 preflight = %#v, want confirmation", got)
	}
}
