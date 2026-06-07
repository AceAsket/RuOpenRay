package main

import "testing"

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
