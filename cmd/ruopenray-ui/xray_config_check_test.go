package main

import "testing"

func TestIsCatchAllRoutingRule(t *testing.T) {
	tests := []struct {
		name string
		rule map[string]any
		want bool
	}{
		{name: "outbound without conditions", rule: map[string]any{"type": "field", "outboundTag": "direct"}, want: true},
		{name: "balancer without conditions", rule: map[string]any{"type": "field", "balancerTag": "auto"}, want: true},
		{name: "legacy all ports", rule: map[string]any{"type": "field", "outboundTag": "direct", "port": "0-65535"}, want: true},
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
