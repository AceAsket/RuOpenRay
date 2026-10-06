package main

import (
	"encoding/json"
	"os"
	"reflect"
	"strings"
	"testing"
)

func TestAdGuardUpstreamInputPreservesIndependentEncryptedDNS(t *testing.T) {
	for _, values := range []any{nil, "https://8.8.8.8/dns-query", []string{}, []any{true},
		[]string{"https://8.8.8.8/dns-query", "https://8.8.8.8:443/dns-query"},
		[]string{"http://8.8.8.8/dns-query"}, []string{"https://dns.google/dns-query"},
		[]string{"https://127.0.0.1/dns-query"}, []string{"https://192.168.50.1/dns-query"},
		[]string{"https://user:password@8.8.8.8/dns-query"}, []string{"https://8.8.8.8/dns-query?secret=test"},
		[]string{"[/example.com/]https://8.8.8.8/dns-query"}, []string{"https://8.8.8.8:0/dns-query"},
		[]string{"https://8.8.8.8"}, []string{"https://[::1]/dns-query"},
		strings.Split(strings.Repeat("https://8.8.8.8/dns-query ", 9), " ")} {
		if _, err := adGuardValidateUpstreams(map[string]any{"upstreams": values}); err == nil {
			t.Fatalf("accepted unsafe/invalid list: %v", values)
		}
	}
	want := []string{"https://8.8.8.8/dns-query", "https://[2606:4700:4700::1111]/dns-query"}
	got, err := adGuardValidateUpstreams(map[string]any{"upstreams": want})
	if err != nil || !reflect.DeepEqual(got, want) {
		t.Fatalf("public IP DoH = %v, %v", got, err)
	}
}

func TestAdGuardUpstreamSavePreservesBootstrapRoutesFiltersAndOtherDNSSettings(t *testing.T) {
	s, fake := newAdGuardFake(t)
	fake.upstreams = []string{"https://8.8.8.8/dns-query", "[/vpn.example/]https://9.9.9.9/dns-query", "[/lan/]192.168.1.1", "# keep comment"}
	fake.dnsExtra = map[string]any{"bootstrap_dns": []string{"9.9.9.10"}, "fallback_dns": []string{}, "upstream_mode": "parallel", "upstream_dns_file": ""}
	beforeSettings, _ := os.ReadFile(s.adGuardSettingsPath())
	beforeRules := append([]string{}, fake.rules...)
	base := append([]string{}, fake.upstreams...)
	want := []string{"https://1.1.1.1/dns-query", "https://9.9.9.9/dns-query"}
	result, err := s.adGuardAction(map[string]any{"action": "upstream-save", "upstreams": want, "baseUpstreams": base})
	if err != nil || result["ok"] != true {
		t.Fatalf("save = %v, %v", result, err)
	}
	expected := append(append([]string{}, want...), base[1:]...)
	afterSettings, _ := os.ReadFile(s.adGuardSettingsPath())
	if !reflect.DeepEqual(fake.upstreams, expected) || string(beforeSettings) != string(afterSettings) || !reflect.DeepEqual(fake.rules, beforeRules) || fake.cacheClears != 0 {
		t.Fatalf("unrelated settings changed: %v", fake.upstreams)
	}
	if len(fake.dnsWrites) != 1 || len(fake.dnsWrites[0]) != 1 {
		t.Fatalf("must only send upstream_dns: %v", fake.dnsWrites)
	}
	status := s.adGuardIntegrationStatus()
	if !reflect.DeepEqual(status["upstreams"], want) || !reflect.DeepEqual(status["upstreamSnapshot"], expected) {
		t.Fatalf("status = %v", status)
	}
}

func TestAdGuardUpstreamSaveFailedProbeConflictAndFileDoNotWrite(t *testing.T) {
	for _, scenario := range []string{"probe", "missingProbe", "stale", "testConflict", "file", "missingBase", "empty"} {
		t.Run(scenario, func(t *testing.T) {
			s, fake := newAdGuardFake(t)
			base := append([]string{}, fake.upstreams...)
			candidate := []string{"https://1.1.1.1/dns-query"}
			payload := map[string]any{"action": "upstream-save", "upstreams": candidate, "baseUpstreams": base}
			switch scenario {
			case "probe":
				fake.upstreamFailure = candidate[0]
			case "missingProbe":
				fake.omitUpstreamProbe = true
			case "stale":
				payload["baseUpstreams"] = []string{"https://9.9.9.9/dns-query"}
			case "testConflict":
				fake.upstreamTestHook = func() { fake.upstreams = []string{"https://9.9.9.9/dns-query"} }
			case "file":
				fake.dnsExtra = map[string]any{"upstream_dns_file": "/etc/adguard-upstreams"}
			case "missingBase":
				delete(payload, "baseUpstreams")
			case "empty":
				payload["upstreams"] = []string{}
			}
			if _, err := s.adGuardAction(payload); err == nil || len(fake.dnsWrites) != 0 || fake.cacheClears != 0 {
				t.Fatalf("unexpected write: %v, %v", err, fake.dnsWrites)
			}
			if scenario != "testConflict" && !reflect.DeepEqual(base, fake.upstreams) {
				t.Fatal("failed save changed upstreams")
			}
		})
	}
}

func TestAdGuardUpstreamLostWriteResponseRollsBack(t *testing.T) {
	s, fake := newAdGuardFake(t)
	base := append([]string{}, fake.upstreams...)
	fake.failDNSAfterWriteOnce = true
	_, err := s.adGuardAction(map[string]any{"action": "upstream-save", "upstreams": []string{"https://1.1.1.1/dns-query"}, "baseUpstreams": base})
	if err == nil || !strings.Contains(err.Error(), "восстановлен") || !reflect.DeepEqual(base, fake.upstreams) || len(fake.dnsWrites) != 2 {
		t.Fatalf("rollback = %v, upstreams = %v, writes = %v", err, fake.upstreams, fake.dnsWrites)
	}
}

func TestAdGuardUpstreamStatisticsNormalizePortAndConvertSeconds(t *testing.T) {
	var stats map[string]any
	_ = json.Unmarshal([]byte(`{"top_upstreams_avg_time":[{"https://8.8.8.8:443/dns-query":1.099},{"https://9.9.9.9/dns-query":0.324}],"top_upstreams_responses":[{"https://8.8.8.8/dns-query":123},{"https://9.9.9.9:443/dns-query":47}]}`), &stats)
	rows := adGuardUpstreamStatistics(stats)
	if len(rows) != 2 || rows[0]["averageMs"] != 1099.0 || rows[0]["responses"] != 123.0 || rows[1]["averageMs"] != 324.0 {
		t.Fatalf("stats = %v", rows)
	}
}

func TestAdGuardStatisticsWindowUsesNumericMillisecondsAndActualRetention(t *testing.T) {
	for _, test := range []struct {
		interval float64
		hours    int
		recent   string
	}{{86400000, 24, "86400000"}, {604800000, 24, "86400000"}, {21600000, 6, "21600000"}, {0, 0, ""}} {
		s, fake := newAdGuardFake(t)
		fake.statsInterval = test.interval
		status := s.adGuardIntegrationStatus()
		if fake.statsRecent != test.recent {
			t.Fatalf("stats recent for %v = %q", test.interval, fake.statsRecent)
		}
		if test.hours > 0 && status["statsPeriodHours"] != test.hours || test.hours == 0 && status["statsPeriodHours"] != nil {
			t.Fatalf("period = %v", status["statsPeriodHours"])
		}
	}
}
