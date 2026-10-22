package main

import (
	"strings"
	"testing"
)

func TestAnalyzeBalancerMonitoring(t *testing.T) {
	for _, scenario := range []struct {
		name, strategy, monitor, fallback string
		selectors                         []any
		warning, failure                  bool
	}{
		{"prefix-coverage", "leastPing", "observatory", "block", []any{"vpn-"}, false, false},
		{"partial-coverage", "leastPing", "observatory", "block", []any{"vpn-a"}, true, false},
		{"round-robin-monitor-required", "roundRobin", "", "block", nil, true, false},
		{"random-monitor-required", "random", "", "block", nil, true, false},
		{"leastload-regular", "leastLoad", "observatory", "block", []any{"vpn-"}, false, false},
		{"leastping-burst", "leastPing", "burstObservatory", "block", []any{"vpn-"}, false, false},
		{"missing-fallback", "leastPing", "observatory", "missing", []any{"vpn-"}, false, true},
	} {
		t.Run(scenario.name, func(t *testing.T) {
			cfg := map[string]any{
				"outbounds": []any{map[string]any{"tag": "vpn-a", "protocol": "vless"}, map[string]any{"tag": "vpn-b", "protocol": "vless"}, map[string]any{"tag": "block", "protocol": "blackhole"}},
				"routing":   map[string]any{"balancers": []any{map[string]any{"tag": "vpn", "selector": []any{"vpn-"}, "strategy": map[string]any{"type": scenario.strategy}, "fallbackTag": scenario.fallback}}},
			}
			if scenario.monitor != "" {
				cfg[scenario.monitor] = map[string]any{"subjectSelector": scenario.selectors}
			}
			state := &serverState{cfg: appConfig{GeoDir: t.TempDir()}}
			result := state.analyzeConfig(cfg)
			warnings := strings.Join(stringSlice(result["warnings"]), "\n")
			if strings.Contains(warnings, "требует наблюдения") != scenario.warning {
				t.Fatalf("warnings: %s", warnings)
			}
			if (len(stringSlice(result["errors"])) > 0) != scenario.failure {
				t.Fatalf("errors: %v", result["errors"])
			}
		})
	}
}

func TestIsCatchAllRoutingRule(t *testing.T) {
	tests := []struct {
		name string
		rule map[string]any
		want bool
	}{
		{name: "outbound without conditions", rule: map[string]any{"type": "field", "outboundTag": "direct"}, want: true},
		{name: "balancer without conditions", rule: map[string]any{"type": "field", "balancerTag": "auto"}, want: true},
		{name: "legacy all ports", rule: map[string]any{"type": "field", "outboundTag": "direct", "port": "0-65535"}, want: true},
		{name: "all network catch-all", rule: map[string]any{"type": "field", "outboundTag": "direct", "network": "tcp,udp"}, want: true},
		{name: "specific port", rule: map[string]any{"type": "field", "outboundTag": "direct", "port": "443"}, want: false},
		{name: "domain rule", rule: map[string]any{"type": "field", "outboundTag": "direct", "domain": []any{"domain:example.com"}}, want: false},
		{name: "network rule", rule: map[string]any{"type": "field", "outboundTag": "direct", "network": "udp"}, want: false},
		{name: "no target", rule: map[string]any{"type": "field"}, want: false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := isCatchAllRoutingRule(tt.rule); got != tt.want {
				t.Fatalf("isCatchAllRoutingRule() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestAnalyzeConfigWarnsAboutDomainDefault(t *testing.T) {
	state := &serverState{}
	result := state.analyzeConfig(map[string]any{
		"outbounds": []any{
			map[string]any{"tag": "direct", "protocol": "freedom"},
		},
		"routing": map[string]any{
			"rules": []any{
				map[string]any{"type": "field", "outboundTag": "direct", "domain": []any{"default"}},
			},
		},
	})
	warnings, _ := result["warnings"].([]string)
	if len(warnings) == 0 {
		t.Fatalf("expected warning for domain default, got %#v", result)
	}
}

func TestNormalizeCatchAllRoutingRulesAddsNetwork(t *testing.T) {
	cfg := map[string]any{
		"routing": map[string]any{"rules": []any{
			map[string]any{"type": "field", "outboundTag": "direct"},
			map[string]any{"type": "field", "outboundTag": "proxy", "domain": []any{"domain:example.com"}},
		}},
	}
	if got := normalizeCatchAllRoutingRules(cfg); got != 1 {
		t.Fatalf("normalizeCatchAllRoutingRules() = %d, want 1", got)
	}
	rules := cfg["routing"].(map[string]any)["rules"].([]any)
	first := rules[0].(map[string]any)
	if first["network"] != "tcp,udp" {
		t.Fatalf("expected catch-all network tcp,udp, got %#v", first)
	}
	second := rules[1].(map[string]any)
	if _, exists := second["network"]; exists {
		t.Fatalf("domain rule should not be normalized, got %#v", second)
	}
}
