package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

func TestSniffingExclusionCleanupPreservesConfiguration(t *testing.T) {
	const original = `{"inbounds":[{"tag":"lan","sniffing":{"enabled":true,"destOverride":["tls","http"],"routeOnly":false,"domainsExcluded":[""," \t","full:bank.example","regexp:^private\\.","bank.example","bank.example"]}},{"tag":"second","sniffing":{"domainsExcluded":[""]}},{"tag":"no-sniffer"}],"routing":{"rules":[{"domain":["domain:example.com"],"outboundTag":"vpn"}]},"outbounds":[{"tag":"vpn","protocol":"socks"}],"dns":{"servers":["localhost"]}}`
	var cfg, expected map[string]any
	_ = json.Unmarshal([]byte(original), &cfg)
	_ = json.Unmarshal([]byte(original), &expected)
	wanted := []any{"full:bank.example", `regexp:^private\.`, "bank.example", "bank.example"}
	mapValue(asArray(expected["inbounds"])[0])["sniffing"].(map[string]any)["domainsExcluded"] = wanted
	delete(mapValue(asArray(expected["inbounds"])[1])["sniffing"].(map[string]any), "domainsExcluded")
	if got := normalizeSniffingDomainExclusions(cfg); got != 3 {
		t.Fatalf("removed %d entries, want 3", got)
	}
	if !reflect.DeepEqual(cfg, expected) {
		t.Fatalf("cleanup changed other settings: %#v", cfg)
	}
	if normalizeSniffingDomainExclusions(cfg) != 0 {
		t.Fatal("cleanup is not idempotent")
	}
}

func TestSniffingExclusionCleanupRetainsInvalidValues(t *testing.T) {
	for _, raw := range []any{true, "", []any{"", 17, nil}} {
		sniffing := map[string]any{"domainsExcluded": raw}
		cfg := map[string]any{"inbounds": []any{map[string]any{"sniffing": sniffing}}}
		normalizeSniffingDomainExclusions(cfg)
		want := raw
		if _, array := raw.([]any); array {
			want = []any{17, nil}
		}
		if !reflect.DeepEqual(sniffing["domainsExcluded"], want) {
			t.Fatal("invalid values were hidden from Xray validation")
		}
	}
}

func TestSniffingExclusionPersistenceAndLegacyDraft(t *testing.T) {
	dir := t.TempDir()
	state := &serverState{cfg: appConfig{DataDir: dir, ActiveConfig: filepath.Join(dir, "config.json")}}
	var cfg map[string]any
	_ = json.Unmarshal([]byte(`{"inbounds":[{"tag":"lan","sniffing":{"domainsExcluded":[""]}}],"outbounds":[{"tag":"direct","protocol":"freedom"}]}`), &cfg)
	if err := state.writeActiveConfigRaw(cfg); err != nil {
		t.Fatal(err)
	}
	read, err := state.readActiveConfig()
	if err != nil || mapValue(mapValue(asArray(read["inbounds"])[0])["sniffing"])["domainsExcluded"] != nil {
		t.Fatal("active config retained blank exclusions")
	}
	legacy := []byte(`{"inbounds":[{"sniffing":{"domainsExcluded":["","full:bank.example"]}}],"routing":{"rules":[{"domain":["example.com"],"outboundTag":"vpn"}]}}`)
	if err := os.WriteFile(state.configDraftPath(), legacy, 0600); err != nil {
		t.Fatal(err)
	}
	draft := state.readConfigDraft()
	clean := draft["config"].(map[string]any)
	if len(mapValue(mapValue(asArray(clean["inbounds"])[0])["sniffing"])["domainsExcluded"].([]any)) != 1 {
		t.Fatal("legacy draft was not cleaned on read")
	}
	unchanged, _ := os.ReadFile(state.configDraftPath())
	if string(unchanged) != string(legacy) {
		t.Fatal("reading a legacy draft modified the saved file")
	}
	if state.saveConfigDraft(map[string]any{"config": clean})["ok"] != true {
		t.Fatal("draft save failed")
	}
	body, _ := os.ReadFile(state.configDraftPath())
	if err := validateCoreUpdateSniffingConfig(body); err != nil {
		t.Fatal(err)
	}
}

func TestCoreUpdateBlocksBlankSniffingExclusions(t *testing.T) {
	bad := []byte(`{"inbounds":[{"sniffing":{"domainsExcluded":[""]}}]}`)
	before := string(bad)
	if validateCoreUpdateSniffingConfig(bad) == nil || string(bad) != before {
		t.Fatal("update accepted a blank exclusion or modified the active config")
	}
	for _, clean := range []string{`{}`, `{"inbounds":[{"sniffing":{"domainsExcluded":[]}}]}`, `{"inbounds":[{"sniffing":{"domainsExcluded":["bank.example"]}}]}`} {
		if err := validateCoreUpdateSniffingConfig([]byte(clean)); err != nil {
			t.Fatal(err)
		}
	}
}
