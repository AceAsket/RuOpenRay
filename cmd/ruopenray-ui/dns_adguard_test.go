package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestAdGuardDirectDoHRequiresIndependentEncryptedResolvers(t *testing.T) {
	for _, tc := range []struct {
		name                 string
		upstreams, fallbacks []string
		want                 bool
	}{
		{"direct", []string{"https://8.8.8.8/dns-query", "https://9.9.9.9/dns-query", "[/vpn.example/]https://1.1.1.1/dns-query"}, nil, true},
		{"empty", nil, nil, false},
		{"only domain route", []string{"[/vpn.example/]https://1.1.1.1/dns-query"}, nil, false},
		{"needs bootstrap", []string{"https://dns.google/dns-query"}, nil, false},
		{"local relay", []string{"https://127.0.0.1:10535/dns-query"}, nil, false},
		{"mixed plaintext", []string{"https://8.8.8.8/dns-query", "8.8.8.8"}, nil, false},
		{"xray domain route", []string{"https://8.8.8.8/dns-query", "[/vpn.example/]127.0.0.1:10535"}, nil, false},
		{"plaintext fallback", []string{"https://8.8.8.8/dns-query"}, []string{"1.1.1.1"}, false},
		{"direct fallback", []string{"https://8.8.8.8/dns-query"}, []string{"https://1.1.1.1/dns-query"}, true},
		{"bad port", []string{"https://8.8.8.8:70000/dns-query"}, nil, false},
		{"credentials", []string{"https://user:secret@8.8.8.8/dns-query"}, nil, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if got := adGuardDirectDoH(tc.upstreams, tc.fallbacks); got != tc.want {
				t.Fatalf("direct DoH = %v, want %v", got, tc.want)
			}
		})
	}
}

func TestAdGuardConfigDoesNotHideFallbackDNS(t *testing.T) {
	for _, fallback := range []string{"\n    - 1.1.1.1", " [1.1.1.1]"} {
		path := filepath.Join(t.TempDir(), "AdGuardHome.yaml")
		body := "dns:\n  bind_hosts:\n    - 127.0.0.1\n  port: 10536\n  upstream_dns:\n    - https://8.8.8.8/dns-query\n  fallback_dns:" + fallback + "\nfilters: []\n"
		if err := os.WriteFile(path, []byte(body), 0600); err != nil {
			t.Fatal(err)
		}
		cfg := readAdGuardHomeConfig(path)
		if adGuardDirectDoH(stringSlice(cfg["upstreams"]), stringSlice(cfg["fallbacks"])) {
			t.Fatal("plaintext fallback was incorrectly classified as encrypted direct DoH")
		}
	}
}

func TestDNSPortDetectsTLSRelayEvenWhenUDPIsOwnedByXray(t *testing.T) {
	text := "udp 0 0 127.0.0.1:10535 0.0.0.0:* 123/xray\ntcp 0 0 127.0.0.1:10535 0.0.0.0:* LISTEN 124/doh-transport"
	if owner := dnsPortOwnerFromText(text); owner != "124/doh-transport" {
		t.Fatalf("TCP conflict missed: %s", owner)
	}
}

func TestParseAdGuardHomeConfig(t *testing.T) {
	body := `
bind_host: 0.0.0.0
http:
  address: 0.0.0.0:3000
dns:
  bind_hosts:
    - 0.0.0.0
  port: 53
  upstream_dns:
    - 127.0.0.1:10535
    - https://user:secret@example.com/dns-query
  bootstrap_dns:
    - 1.1.1.1
`
	bindHost, port, upstreams := parseAdGuardHomeConfig(body)
	if bindHost != "0.0.0.0" {
		t.Fatalf("bindHost = %q", bindHost)
	}
	if port != 53 {
		t.Fatalf("port = %d", port)
	}
	if len(upstreams) != 2 {
		t.Fatalf("upstreams = %#v", upstreams)
	}
	if upstreams[0] != "127.0.0.1:10535" {
		t.Fatalf("first upstream = %q", upstreams[0])
	}
}

func TestAdGuardHomeUsesXray(t *testing.T) {
	upstreams := []string{
		"[/lan/]192.168.1.1:10535",
		"https://dns.example.com/dns-query",
	}
	if !adGuardHomeUsesXray(upstreams, "127.0.0.1", 10535, "192.168.1.1") {
		t.Fatal("expected AdGuard Home upstream to match Xray LAN target")
	}
	if adGuardHomeUsesXray([]string{"8.8.8.8"}, "127.0.0.1", 10535, "192.168.1.1") {
		t.Fatal("did not expect public DNS upstream to match Xray")
	}
}

func TestSanitizeAdGuardHomeUpstreams(t *testing.T) {
	upstreams := sanitizeAdGuardHomeUpstreams([]string{
		"https://user:secret@example.com/dns-query",
		"127.0.0.1:10535",
	})
	if upstreams[0] != "https://***@example.com/dns-query" {
		t.Fatalf("sanitized upstream = %q", upstreams[0])
	}
	if upstreams[1] != "127.0.0.1:10535" {
		t.Fatalf("plain upstream changed = %q", upstreams[1])
	}
}

func TestAdGuardHomeStatusTextRunningDoesNotMatchInactive(t *testing.T) {
	if adGuardHomeStatusTextRunning("inactive") {
		t.Fatal("inactive service must not be treated as running")
	}
	if !adGuardHomeStatusTextRunning("running") {
		t.Fatal("running service should be treated as running")
	}
}

func TestLANDNSStatusMatchesRequest(t *testing.T) {
	status := map[string]any{
		"mode":       "xray",
		"xrayTarget": "127.0.0.1#10535",
		"servers":    []string{"127.0.0.1#10535"},
	}
	if !lanDNSStatusMatchesRequest(status, "xray", "") {
		t.Fatal("expected current Xray LAN DNS status to match default request")
	}
	if lanDNSStatusMatchesRequest(status, "upstream", "1.1.1.1") {
		t.Fatal("did not expect Xray mode to match upstream request")
	}
}
