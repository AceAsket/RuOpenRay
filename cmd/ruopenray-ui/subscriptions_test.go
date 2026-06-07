package main

import (
	"path/filepath"
	"testing"

	rsubscription "github.com/AceAsket/RuOpenRay/internal/subscription"
)

func subscriptionTestOutbound(tag, address string, port int) map[string]any {
	return map[string]any{
		"tag":      tag,
		"protocol": "vless",
		"settings": map[string]any{
			"vnext": []any{map[string]any{"address": address, "port": port}},
		},
	}
}

func TestPreserveSubscriptionActiveKeepsMatchingServer(t *testing.T) {
	previous := rsubscription.Pool{
		Active: 1,
		Candidates: []map[string]any{
			subscriptionTestOutbound("old-a", "one.example", 443),
			subscriptionTestOutbound("stable", "stable.example", 443),
		},
	}
	candidates := []map[string]any{
		subscriptionTestOutbound("new-a", "two.example", 443),
		subscriptionTestOutbound("stable", "stable.example", 443),
	}

	result := preserveSubscriptionActive(previous, candidates)
	if !result.preserved || result.active != 1 || result.missingCandidate != nil {
		t.Fatalf("unexpected preserve result: %#v", result)
	}
}

func TestPreserveSubscriptionActiveMarksRemovedServerMissing(t *testing.T) {
	previous := rsubscription.Pool{
		Active: 1,
		Candidates: []map[string]any{
			subscriptionTestOutbound("old-a", "one.example", 443),
			subscriptionTestOutbound("gone", "gone.example", 443),
		},
	}
	candidates := []map[string]any{
		subscriptionTestOutbound("new-a", "one.example", 443),
		subscriptionTestOutbound("new-b", "two.example", 443),
	}

	result := preserveSubscriptionActive(previous, candidates)
	if result.preserved {
		t.Fatalf("removed active server was marked preserved: %#v", result)
	}
	if result.active != -1 {
		t.Fatalf("active = %d, want -1 when active server disappeared", result.active)
	}
	if result.missingCandidate == nil || result.missingCandidate["tag"] != "gone" {
		t.Fatalf("missing candidate not retained: %#v", result.missingCandidate)
	}
}

func TestApplySubscriptionActiveOutboundsUpdatesPoolOutbound(t *testing.T) {
	dir := t.TempDir()
	state := &serverState{cfg: appConfig{DataDir: dir, ActiveConfig: filepath.Join(dir, "config.json")}}
	if err := state.writeActiveConfigRaw(map[string]any{
		"outbounds": []any{
			subscriptionTestOutbound("sub", "old.example", 443),
			map[string]any{"tag": "direct", "protocol": "freedom"},
		},
	}); err != nil {
		t.Fatalf("write active config: %v", err)
	}
	store := rsubscription.Store{Pools: []rsubscription.Pool{{
		Tag:    "sub",
		Active: 0,
		Candidates: []map[string]any{
			subscriptionTestOutbound("candidate-new", "new.example", 8443),
		},
	}}}

	result := state.applySubscriptionActiveOutbounds(store, []int{0}, false)
	if result["ok"] != true || result["updated"] != 1 {
		t.Fatalf("unexpected apply result: %#v", result)
	}
	cfg, err := state.readActiveConfig()
	if err != nil {
		t.Fatalf("read active config: %v", err)
	}
	outbounds := asArray(cfg["outbounds"])
	if len(outbounds) < 1 {
		t.Fatalf("outbounds were not written: %#v", cfg)
	}
	first, _ := outbounds[0].(map[string]any)
	if first["tag"] != "sub" {
		t.Fatalf("pool outbound tag changed: %#v", first)
	}
	settings, _ := first["settings"].(map[string]any)
	vnext, _ := settings["vnext"].([]any)
	server, _ := vnext[0].(map[string]any)
	if server["address"] != "new.example" || number(server["port"], 0) != 8443 {
		t.Fatalf("pool outbound was not refreshed: %#v", first)
	}
}

func TestApplySubscriptionActiveOutboundsKeepsDialerProxy(t *testing.T) {
	dir := t.TempDir()
	state := &serverState{cfg: appConfig{DataDir: dir, ActiveConfig: filepath.Join(dir, "config.json")}}
	fragmentTag := "ruopenray-fragment-test"
	current := subscriptionTestOutbound("sub", "old.example", 443)
	current["streamSettings"] = map[string]any{"sockopt": map[string]any{"dialerProxy": fragmentTag}}
	if err := state.writeActiveConfigRaw(map[string]any{
		"outbounds": []any{
			current,
			map[string]any{"tag": fragmentTag, "protocol": "freedom"},
		},
	}); err != nil {
		t.Fatalf("write active config: %v", err)
	}
	store := rsubscription.Store{Pools: []rsubscription.Pool{{
		Tag:    "sub",
		Active: 0,
		Candidates: []map[string]any{
			subscriptionTestOutbound("candidate-new", "new.example", 8443),
		},
	}}}

	result := state.applySubscriptionActiveOutbounds(store, []int{0}, false)
	if result["ok"] != true || result["updated"] != 1 {
		t.Fatalf("unexpected apply result: %#v", result)
	}
	cfg, err := state.readActiveConfig()
	if err != nil {
		t.Fatalf("read active config: %v", err)
	}
	first, _ := asArray(cfg["outbounds"])[0].(map[string]any)
	if got := fragmentDialerProxy(first); got != fragmentTag {
		t.Fatalf("dialerProxy = %q, want %q: %#v", got, fragmentTag, first)
	}
}
