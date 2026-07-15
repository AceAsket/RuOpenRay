package main

import "testing"

func TestFirewallCompatibilityPreflightClean(t *testing.T) {
	got := firewallCompatibilityPreflightFromStatuses(
		map[string]any{"dnsIntercept": true},
		map[string]any{"routerMode": "tproxy"},
		map[string]any{"active": false},
	)
	if got["ok"] != true || got["requiresConfirmation"] == true {
		t.Fatalf("clean preflight = %#v, want ok without confirmation", got)
	}
}

func TestFirewallCompatibilityPreflightB4NFQUEUE(t *testing.T) {
	got := firewallCompatibilityPreflightFromStatuses(
		map[string]any{"dnsIntercept": false},
		map[string]any{"routerMode": "redirect"},
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

func TestFirewallCompatibilityPreflightB4Enabled(t *testing.T) {
	got := firewallCompatibilityPreflightFromStatuses(
		map[string]any{"dnsIntercept": false},
		map[string]any{"routerMode": "tproxy"},
		map[string]any{
			"active":  false,
			"service": map[string]any{"enabled": true},
			"nft":     map[string]any{"hasQueue": false},
		},
	)
	if got["requiresConfirmation"] != true {
		t.Fatalf("b4 enabled preflight = %#v, want confirmation", got)
	}
}

func TestFirewallCompatibilityPreflightMarksAllInterfaceB4AsDanger(t *testing.T) {
	got := firewallCompatibilityPreflightFromStatuses(
		map[string]any{"dnsIntercept": false},
		map[string]any{"routerMode": "tproxy"},
		map[string]any{
			"active":  true,
			"nft":     map[string]any{"hasQueue": true},
			"routing": map[string]any{"markConflict": false},
			"api":     map[string]any{"config": map[string]any{"queueScope": "all"}},
		},
	)
	issues := got["issues"].([]map[string]any)
	if len(issues) != 1 || issues[0]["severity"] != "danger" {
		t.Fatalf("all-interface B4 must be dangerous for transparent interception: %#v", got)
	}
}
