package proxy

import (
	"encoding/base64"
	"fmt"
	"net/url"
	"reflect"
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
	raw := "vless://00000000-0000-0000-0000-000000000000@cloudthree.acespace.tech:443?type=tcp&encryption=none&security=reality&sni=front.example.com&fp=chrome&pbk=test-key&sid=abcd#%F0%9F%87%AB%F0%9F%87%AEFIfin_play2go_cloudthree"
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

func TestSubscriptionTransportSettings(t *testing.T) {
	tests := []struct {
		name, link string
		expected   map[string]any
	}{
		{"vless-grpc-tls", "vless://00000000-0000-0000-0000-000000000000@192.0.2.1:443?type=grpc&security=tls&sni=front.example.com&fp=chrome&alpn=h2%2Chttp%2F1.1&serviceName=tunnel%2Fservice&mode=multi&authority=grpc.example.com", map[string]any{
			"network": "grpc", "security": "tls",
			"tlsSettings":  map[string]any{"serverName": "front.example.com", "fingerprint": "chrome", "alpn": []string{"h2", "http/1.1"}},
			"grpcSettings": map[string]any{"serviceName": "tunnel/service", "multiMode": true, "authority": "grpc.example.com"},
		}},
		{"trojan-tls", "trojan://test-password@192.0.2.1:443?sni=front.example.com&fp=firefox&alpn=http%2F1.1", map[string]any{
			"network": "tcp", "security": "tls",
			"tlsSettings": map[string]any{"serverName": "front.example.com", "fingerprint": "firefox", "alpn": []string{"http/1.1"}},
		}},
		{"trojan-grpc", "trojan://test-password@192.0.2.1:443?type=grpc&serviceName=grpc-service&mode=gun&peer=peer.example.com", map[string]any{
			"network": "grpc", "security": "tls",
			"tlsSettings":  map[string]any{"serverName": "peer.example.com", "alpn": []string{"h2"}},
			"grpcSettings": map[string]any{"serviceName": "grpc-service", "multiMode": false},
		}},
		{"subscription-websocket", "vless://00000000-0000-0000-0000-000000000000@192.0.2.1:443?type=ws&security=tls&sni=cdn.example.com&host=cdn.example.com&path=%2Fstream%2Fupdates%2Fexample&fp=chrome&alpn=http%2F1.1", map[string]any{
			"network": "ws", "security": "tls",
			"tlsSettings": map[string]any{"serverName": "cdn.example.com", "fingerprint": "chrome", "alpn": []string{"http/1.1"}},
			"wsSettings":  map[string]any{"path": "/stream/updates/example", "headers": map[string]any{"Host": "cdn.example.com"}},
		}},
		{"subscription-xhttp", "vless://00000000-0000-0000-0000-000000000000@192.0.2.1:8443?type=xhttp&security=reality&sni=cdn.example.com&pbk=test-key&sid=abcd&fp=chrome&mode=stream-one&path=%2Fxhttp&concurrency=4", map[string]any{
			"network": "xhttp", "security": "reality",
			"realitySettings": map[string]any{"serverName": "cdn.example.com", "publicKey": "test-key", "shortId": "abcd", "fingerprint": "chrome"},
			"xhttpSettings":   map[string]any{"path": "/xhttp", "mode": "stream-one"},
		}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Exercise the same subscription decoding and share-link path as a refresh.
			encoded := base64.StdEncoding.EncodeToString([]byte(tt.link + "\n"))
			links := DecodeSubscription(encoded)
			if len(links) != 1 {
				t.Fatalf("links: %d", len(links))
			}
			outbound, err := ParseShareLink(links[0])
			if err != nil {
				t.Fatal(err)
			}
			if !reflect.DeepEqual(outbound["streamSettings"], tt.expected) {
				t.Fatalf("streamSettings = %#v, want %#v", outbound["streamSettings"], tt.expected)
			}
		})
	}
}

func TestTrojanPasswordAndTLSVerification(t *testing.T) {
	for _, password := range []string{"p:a@ss+word%value", "simple-password"} {
		outbound, err := ParseShareLink("trojan://" + url.QueryEscape(password) + "@example.com:443")
		if err != nil {
			t.Fatal(err)
		}
		if got := getNested(outbound, "settings", "servers"); got == nil {
			t.Fatal("missing servers")
		}
		server := asArray(getNested(outbound, "settings", "servers"))[0].(map[string]any)
		if server["password"] != password {
			t.Fatalf("password did not survive URL decoding")
		}
		tls := getNested(outbound, "streamSettings", "tlsSettings").(map[string]any)
		if tls["serverName"] != "example.com" {
			t.Fatal("missing TLS server name")
		}
		if tls["allowInsecure"] == true {
			t.Fatal("TLS verification must remain enabled by default")
		}
	}
	for _, value := range []string{"false", "0"} {
		outbound, err := ParseShareLink("trojan://test@example.com:443?allowInsecure=" + value)
		if err != nil {
			t.Fatal(err)
		}
		if got := getNested(outbound, "streamSettings", "tlsSettings", "allowInsecure"); got != (value == "true" || value == "1") {
			t.Fatalf("allowInsecure %s = %v", value, got)
		}
	}
}
