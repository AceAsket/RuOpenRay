package xraystats

import (
	"testing"
	"time"
)

func TestEnsureConfigEnablesStats(t *testing.T) {
	cfg := map[string]any{}
	EnsureConfig(cfg, true)
	info := APIInfo(cfg)
	if info["enabled"] != true {
		t.Fatalf("stats not enabled: %#v cfg=%#v", info, cfg)
	}
	if len(asArray(cfg["inbounds"])) != 1 {
		t.Fatalf("expected stats inbound: %#v", cfg["inbounds"])
	}
}

func TestDisablingStatsPreservesRoutingAPIAndItsLegacyTransport(t *testing.T) {
	cfg := map[string]any{}
	EnsureConfig(cfg, true)
	api := cfg["api"].(map[string]any)
	api["services"] = append(api["services"].([]any), "RoutingService")
	EnsureConfig(cfg, false)
	if APIInfo(cfg)["enabled"] == true || cfg["api"] == nil || len(asArray(cfg["inbounds"])) != 1 {
		t.Fatal("disabling counters removed the routing API")
	}
	if services := Services(api); len(services) != 1 || services[0] != "RoutingService" {
		t.Fatal(services)
	}
	if len(asArray(cfg["routing"].(map[string]any)["rules"])) != 1 {
		t.Fatal("API transport route removed")
	}
}

func TestEnablingStatsReusesSimplifiedRoutingAPI(t *testing.T) {
	cfg := map[string]any{"api": map[string]any{"tag": "routing-api", "listen": "127.0.0.1:10086", "services": []any{"RoutingService"}}}
	EnsureConfig(cfg, true)
	info := APIInfo(cfg)
	if info["enabled"] != true || info["server"] != "127.0.0.1:10086" || len(asArray(cfg["inbounds"])) != 0 || cfg["routing"] != nil {
		t.Fatal(cfg, info)
	}
	EnsureConfig(cfg, false)
	if cfg["api"] == nil || HasService(cfg["api"].(map[string]any)) {
		t.Fatal(cfg)
	}
}

func TestParseOutputJSON(t *testing.T) {
	counters := ParseOutput(`{"stat":[{"name":"outbound>>>proxy>>>traffic>>>downlink","value":42}]}`)
	if counters["outbound>>>proxy>>>traffic>>>downlink"] != 42 {
		t.Fatalf("unexpected counters: %#v", counters)
	}
}

func TestTrafficResultGroupsOutboundTraffic(t *testing.T) {
	result := TrafficResult(
		map[string]uint64{
			"outbound>>>proxy>>>traffic>>>downlink":     100,
			"outbound>>>proxy>>>traffic>>>uplink":       20,
			"user>>>alice@example>>>traffic>>>downlink": 70,
			"user>>>alice@example>>>traffic>>>uplink":   10,
		},
		map[string]uint64{
			"outbound>>>proxy>>>traffic>>>downlink":     40,
			"outbound>>>proxy>>>traffic>>>uplink":       10,
			"user>>>alice@example>>>traffic>>>downlink": 20,
			"user>>>alice@example>>>traffic>>>uplink":   5,
		},
		2,
		map[string]string{"proxy": "vless", "direct": "freedom"},
		time.Unix(0, 0),
	)
	groups := result["groups"].(map[string]map[string]any)
	if groups["proxy"]["downlink"] != uint64(100) || groups["proxy"]["downRate"] != float64(30) {
		t.Fatalf("unexpected proxy group: %#v", groups["proxy"])
	}
	users := result["users"].([]map[string]any)
	if len(users) != 1 || users[0]["email"] != "alice@example" || users[0]["downRate"] != float64(25) {
		t.Fatalf("unexpected user stats: %#v", users)
	}
}
