package main

import (
	"reflect"
	"testing"
)

func TestParseFirewallStatusMeta(t *testing.T) {
	body := `# ruopenray-meta routerMode=tproxy bypassMode=off deviceMode=selected portMode=custom ports=80,443 blockQuic=true dnsIntercept=false transparentPort=52345 lanInterface=br-lan killSwitch=true
table inet ruopenray {}
`
	meta := parseFirewallStatusMeta(body)
	if meta["routerMode"] != "tproxy" {
		t.Fatalf("routerMode = %#v, want tproxy", meta["routerMode"])
	}
	if meta["deviceMode"] != "selected" {
		t.Fatalf("deviceMode = %#v, want selected", meta["deviceMode"])
	}
	if meta["dnsIntercept"] != false {
		t.Fatalf("dnsIntercept = %#v, want false", meta["dnsIntercept"])
	}
	if meta["blockQuic"] != true {
		t.Fatalf("blockQuic = %#v, want true", meta["blockQuic"])
	}
	if meta["transparentPort"] != 52345 {
		t.Fatalf("transparentPort = %#v, want 52345", meta["transparentPort"])
	}
	ports, ok := meta["ports"].([]string)
	if !ok || len(ports) != 2 || ports[0] != "80" || ports[1] != "443" {
		t.Fatalf("ports = %#v, want [80 443]", meta["ports"])
	}
}

func TestSanitizeKillSwitchDomains(t *testing.T) {
	got := sanitizeKillSwitchDomains([]any{" OpenAI.com ", "*.chatgpt.com", "bad value", "10.0.0.1", "openai.com"})
	want := []string{"openai.com", "chatgpt.com"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("sanitizeKillSwitchDomains() = %#v, want %#v", got, want)
	}
}

func TestKillSwitchDomainFromNftsetEntry(t *testing.T) {
	got := killSwitchDomainFromNftsetEntry("/openai.com/4#inet#ruopenray#killswitch4")
	if got != "openai.com" {
		t.Fatalf("domain = %#v, want openai.com", got)
	}
}

func TestKillSwitchDNSBlockEntries(t *testing.T) {
	got := killSwitchDNSBlockEntries([]string{"openai.com", "*.chatgpt.com", "bad value"})
	want := []string{"/openai.com/0.0.0.0", "/openai.com/::", "/chatgpt.com/0.0.0.0", "/chatgpt.com/::"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("killSwitchDNSBlockEntries() = %#v, want %#v", got, want)
	}
}

func TestParseFirewallPortsFromLegacyBody(t *testing.T) {
	body := `table inet ruopenray {
  chain prerouting {
    iifname "br-lan" meta l4proto { tcp, udp } th dport 53 counter tproxy ip to :52345 meta mark set 1 comment "RuOpenRay DNS Intercept"
    iifname "br-lan" udp dport 443 drop comment "RuOpenRay Block QUIC"
    iifname "br-lan" meta l4proto { tcp, udp } th dport { 80, 443 } counter tproxy ip to :52345 meta mark set 1
  }
}`
	ports := parseFirewallPortsFromBody(body)
	if len(ports) != 2 || ports[0] != "80" || ports[1] != "443" {
		t.Fatalf("ports = %#v, want [80 443]", ports)
	}
}
