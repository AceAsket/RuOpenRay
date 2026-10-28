package main

import (
	"testing"
)

func TestRuntimeHealthQuorumAndBaseline(t *testing.T) {
	makeHealth := func(rows map[string]bool) runtimeHealth {
		h := runtimeHealth{Checks: map[string]runtimeHealthCheck{}}
		for k, v := range rows {
			h.Checks[k] = runtimeHealthCheck{OK: v}
		}
		return h
	}
	before := makeHealth(map[string]bool{"dns": true, "wan-control": true, "vpn:primary": true})
	for _, tc := range []struct {
		name  string
		after map[string]bool
		state string
	}{
		{"healthy", map[string]bool{"dns": true, "wan-control": true, "vpn:primary": true}, "healthy"},
		{"DNS regression", map[string]bool{"dns": false, "wan-control": true, "vpn:primary": true}, "regression"},
		{"VPN regression", map[string]bool{"dns": true, "wan-control": true, "vpn:primary": false}, "regression"},
		{"replaced VPN broken", map[string]bool{"dns": true, "wan-control": true, "vpn:new": false}, "regression"},
		{"WAN outage", map[string]bool{"dns": false, "wan-control": false, "vpn:primary": false}, "inconclusive"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if r := compareRuntimeHealth(before, makeHealth(tc.after)); r["state"] != tc.state {
				t.Fatal(r)
			}
		})
	}
	if r := compareRuntimeHealth(makeHealth(map[string]bool{"dns": false}), makeHealth(map[string]bool{"dns": false})); r["state"] != "inconclusive" {
		t.Fatal(r)
	}
}

func TestRuntimeProbeKeepsNestedDialerChain(t *testing.T) {
	selected := map[string]any{"tag": "main", "streamSettings": map[string]any{"sockopt": map[string]any{"dialerProxy": "hop"}}}
	hop := map[string]any{"tag": "hop", "proxySettings": map[string]any{"tag": "exit"}}
	exit := map[string]any{"tag": "exit", "protocol": "freedom"}
	all, err := runtimeProbeOutbounds(selected, []any{selected, hop, exit})
	if err != nil || len(all) != 3 {
		t.Fatal(all, err)
	}
	if _, err = runtimeProbeOutbounds(selected, nil); err == nil {
		t.Fatal("missing chain silently ignored")
	}
}
