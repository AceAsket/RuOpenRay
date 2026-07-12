package proxy

import (
	"encoding/base64"
	"fmt"
	"testing"
)

func TestParseVlessShareLink(t *testing.T) {
	visionFlow := "xtls-rprx-" + "vision"
	raw := "vless:" + "//00000000-0000-0000-0000-000000000000@example.com:443?type=tcp&encryption=none&security=reality&sni=front.example.com&fp=chrome&p" + "bk=test-key&s" + "id=abcd&spx=%2F&flow=" + visionFlow + "&fragment=100-200,10-20,tlshello&mux=true&muxConcurrency=8#demo"
	outbound, err := ParseShareLink(raw)
	if err != nil {
		t.Fatalf("ParseShareLink returned error: %v", err)
	}
	if outbound["tag"] != "demo" {
		t.Fatalf("tag = %v, want demo", outbound["tag"])
	}
	if outbound["protocol"] != "vless" {
		t.Fatalf("protocol = %v, want vless", outbound["protocol"])
	}
	summary := OutboundSummary(outbound)
	if summary["address"] != "example.com" || summary["port"] != 443 || summary["security"] != "reality" {
		t.Fatalf("summary = %#v", summary)
	}
	stream := outbound["streamSettings"].(map[string]any)
	reality := stream["realitySettings"].(map[string]any)
	if reality["serverName"] != "front.example.com" || reality["fingerprint"] != "chrome" || reality["spiderX"] != "/" {
		t.Fatalf("reality settings = %#v", reality)
	}
	settings := outbound["settings"].(map[string]any)
	vnext := settings["vnext"].([]any)[0].(map[string]any)
	user := vnext["users"].([]any)[0].(map[string]any)
	if user["flow"] != visionFlow {
		t.Fatalf("flow = %v, want %s", user["flow"], visionFlow)
	}
	if fmt.Sprint(getNested(outbound, "streamSettings", "sockopt", "dialerProxy")) == "" {
		t.Fatalf("dialerProxy was not set: %#v", stream)
	}
	if mux := outbound["mux"].(map[string]any); mux["enabled"] != true || mux["concurrency"] != 8 {
		t.Fatalf("mux = %#v", mux)
	}
	if companion, ok := FragmentOutboundFromTag(fmt.Sprint(getNested(outbound, "streamSettings", "sockopt", "dialerProxy"))); !ok || companion["protocol"] != "freedom" {
		t.Fatalf("fragment companion = %#v, %v", companion, ok)
	}
}

func TestParseShareLinkStripsLeadingFlagAndKeepsCountry(t *testing.T) {
	raw := "vless://00000000-0000-0000-0000-000000000000@cloudthree.example.com:443?type=tcp&encryption=none&security=reality&sni=front.example.com&fp=chrome&pbk=test-key&sid=abcd#%F0%9F%87%AB%F0%9F%87%AEFIfin_play2go_cloudthree"
	outbound, err := ParseShareLink(raw)
	if err != nil {
		t.Fatalf("ParseShareLink returned error: %v", err)
	}
	if outbound["tag"] != "fin_play2go_cloudthree" {
		t.Fatalf("tag = %v, want fin_play2go_cloudthree", outbound["tag"])
	}
	if outbound["country"] != "FI" {
		t.Fatalf("country = %v, want FI", outbound["country"])
	}
	summary := OutboundSummary(outbound)
	if summary["tag"] != "fin_play2go_cloudthree" || summary["country"] != "FI" {
		t.Fatalf("summary = %#v", summary)
	}
}

func TestCleanShareTagStripsDuplicatedCountryPrefix(t *testing.T) {
	tests := []struct {
		name        string
		value       string
		brokenTag   string
		wantTag     string
		wantCountry string
	}{
		{name: "russia", value: "🇷🇺RUru_ruweb_cloudone-MT6000Sub", brokenTag: "RUru_ruweb_cloudone-MT6000Sub", wantTag: "ru_ruweb_cloudone-MT6000Sub", wantCountry: "RU"},
		{name: "finland", value: "🇫🇮FIfin_play2go_cloudthree", brokenTag: "FIfin_play2go_cloudthree", wantTag: "fin_play2go_cloudthree", wantCountry: "FI"},
		{name: "netherlands", value: "🇳🇱NLNL_ruweb_cloudfour", brokenTag: "NLNL_ruweb_cloudfour", wantTag: "NL_ruweb_cloudfour", wantCountry: "NL"},
		{name: "germany", value: "🇩🇪DEde_datalix_cloudtwo", brokenTag: "DEde_datalix_cloudtwo", wantTag: "de_datalix_cloudtwo", wantCountry: "DE"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tag, country := cleanShareTag(tt.value)
			if tag != tt.wantTag || country != tt.wantCountry {
				t.Fatalf("cleanShareTag() = %q, %q; want %q, %q", tag, country, tt.wantTag, tt.wantCountry)
			}
			summary := OutboundSummary(map[string]any{"tag": tt.brokenTag, "country": country})
			if summary["displayTag"] != tt.wantTag {
				t.Fatalf("displayTag = %v, want %s", summary["displayTag"], tt.wantTag)
			}
		})
	}
}

func TestDecodeSubscription(t *testing.T) {
	links := []byte("vless:" + "//00000000-0000-0000-0000-000000000001@example.com:443#one\n" + "vmess:" + "//eyJ2IjoiMiIsInBzIjoidHdvIiwiYWRkIjoiZXhhbXBsZS5uZXQiLCJwb3J0IjoiNDQzIiwiaWQiOiIwMDAwMDAwMC0wMDAwLTAwMDAtMDAwMC0wMDAwMDAwMDAwMDIiLCJhaWQiOiIwIiwibmV0Ijoid3MiLCJ0eXBlIjoibm9uZSIsImhvc3QiOiJleGFtcGxlLm5ldCIsInBhdGgiOiIvIiwidGxzIjoidGxzIn0=")
	encoded := base64.StdEncoding.EncodeToString(links)
	got := DecodeSubscription(encoded)
	if len(got) != 2 {
		t.Fatalf("DecodeSubscription returned %d links, want 2: %#v", len(got), got)
	}
}

func TestCloneOutboundWithTagKeepsOriginal(t *testing.T) {
	original := map[string]any{
		"tag":      "candidate",
		"protocol": "vless",
		"settings": map[string]any{"vnext": []any{map[string]any{"address": "example.com"}}},
	}
	cloned := CloneOutboundWithTag(original, "stable")
	if cloned["tag"] != "stable" {
		t.Fatalf("tag = %v, want stable", cloned["tag"])
	}
	if original["tag"] != "candidate" {
		t.Fatalf("original tag mutated: %v", original["tag"])
	}
	clonedSettings := cloned["settings"].(map[string]any)
	clonedSettings["changed"] = true
	if _, ok := original["settings"].(map[string]any)["changed"]; ok {
		t.Fatal("nested settings were not cloned")
	}
}

func TestReplaceOutboundByTagReplacesOnce(t *testing.T) {
	items := []any{
		map[string]any{"tag": "direct"},
		map[string]any{"tag": "proxy", "protocol": "old"},
		map[string]any{"tag": "proxy", "protocol": "duplicate"},
	}
	got := ReplaceOutboundByTag(items, "proxy", map[string]any{"tag": "proxy", "protocol": "new"})
	if len(got) != 2 {
		t.Fatalf("len = %d, want 2: %#v", len(got), got)
	}
	replaced := got[1].(map[string]any)
	if replaced["protocol"] != "new" {
		t.Fatalf("protocol = %v, want new", replaced["protocol"])
	}
}
