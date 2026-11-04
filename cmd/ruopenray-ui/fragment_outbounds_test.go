package main

import (
	"path/filepath"
	"testing"

	rproxy "github.com/AceAsket/RuOpenRay/internal/proxy"
)

func TestEnsureFragmentOutboundsAddsCompanion(t *testing.T) {
	tag := rproxy.FragmentOutboundTag("100-200,10-20,tlshello")
	outbounds := []any{map[string]any{
		"tag": "proxy", "protocol": "vless",
		"streamSettings": map[string]any{"sockopt": map[string]any{"dialerProxy": tag}},
	}}
	got := ensureFragmentOutbounds(outbounds)
	if len(got) != 2 {
		t.Fatalf("len = %d, want 2: %#v", len(got), got)
	}
	companion := got[1].(map[string]any)
	if companion["tag"] != tag || companion["protocol"] != "freedom" {
		t.Fatalf("companion = %#v", companion)
	}
}

func TestNativeFragmentConfigRoundTripDoesNotGenerateCompanion(t *testing.T) {
	dir := t.TempDir()
	s := &serverState{cfg: appConfig{DataDir: dir, ActiveConfig: filepath.Join(dir, "config.json")}}
	mask := nativeSubscriptionMask()
	cfg := map[string]any{"outbounds": []any{map[string]any{
		"tag": "native", "protocol": "vless", "streamSettings": map[string]any{"finalmask": mask},
	}}}
	before := transportJSON(cfg)
	ensureFragmentOutboundsInConfig(cfg)
	if transportJSON(cfg) != before {
		t.Fatalf("native fragment was normalized to legacy: %s", transportJSON(cfg))
	}
	if err := s.writeActiveConfigRaw(cfg); err != nil {
		t.Fatal(err)
	}
	roundTrip, err := s.readActiveConfig()
	if err != nil || len(asArray(roundTrip["outbounds"])) != 1 || transportJSON(roundTrip) != before {
		t.Fatalf("native fragment roundtrip changed: %v %s", err, transportJSON(roundTrip))
	}
	if !configDraftMatchesCandidate(map[string]any{"config": cfg}, roundTrip) {
		t.Fatal("native fragment draft no longer matches the written candidate")
	}
}

func TestEnsureFragmentOutboundsDoesNotDuplicate(t *testing.T) {
	tag := rproxy.FragmentOutboundTag("100-200,10-20,tlshello")
	companion, _ := rproxy.FragmentOutboundFromTag(tag)
	outbounds := []any{
		map[string]any{"tag": "proxy", "streamSettings": map[string]any{"sockopt": map[string]any{"dialerProxy": tag}}},
		companion,
	}
	got := ensureFragmentOutbounds(outbounds)
	if len(got) != 2 {
		t.Fatalf("len = %d, want 2: %#v", len(got), got)
	}
}
