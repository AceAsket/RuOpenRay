package firewall

import (
	"reflect"
	"strings"
	"testing"
)

func TestPortList(t *testing.T) {
	tests := []struct {
		name    string
		payload map[string]any
		want    []string
	}{
		{
			name:    "default ports",
			payload: map[string]any{},
			want:    []string{"80", "443"},
		},
		{
			name: "all ports",
			payload: map[string]any{
				"portMode": "all",
				"ports":    []any{"80", "443"},
			},
			want: []string{},
		},
		{
			name: "clean custom ports",
			payload: map[string]any{
				"ports": []any{"80", "443", "1000:2000", "bad"},
			},
			want: []string{"80", "443", "1000-2000"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := PortList(tt.payload); !reflect.DeepEqual(got, tt.want) {
				t.Fatalf("PortList() = %#v, want %#v", got, tt.want)
			}
		})
	}
}

func TestCIDRList(t *testing.T) {
	got := CIDRList([]any{"162.159.140.1", "172.64.150.0/24", "bad", "2001:db8::1", "162.159.140.1"})
	want := []string{"162.159.140.1", "172.64.150.0/24"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("CIDRList() = %#v, want %#v", got, want)
	}
}

func TestNativeNftTProxy(t *testing.T) {
	body, meta := NativeNft(map[string]any{
		"routerMode":      "tproxy",
		"lanInterface":    "br-lan",
		"transparentPort": "52345",
		"ports":           []any{"80", "443"},
	})
	if !strings.Contains(body, "tproxy ip to :52345") {
		t.Fatalf("nft body does not contain tproxy rule:\n%s", body)
	}
	if meta["routerMode"] != "tproxy" {
		t.Fatalf("routerMode = %#v, want tproxy", meta["routerMode"])
	}
	if !strings.Contains(body, "# ruopenray-meta routerMode=tproxy") {
		t.Fatalf("nft body does not contain status metadata:\n%s", body)
	}
}

func TestNativeNftInterceptsDNSOutsidePortList(t *testing.T) {
	body, meta := NativeNft(map[string]any{
		"routerMode":      "tproxy",
		"lanInterface":    "br-lan",
		"transparentPort": "52345",
		"ports":           []any{"80", "443"},
	})
	if !strings.Contains(body, "th dport 53 counter tproxy ip to :52345") {
		t.Fatalf("nft body does not contain DNS intercept rule:\n%s", body)
	}
	if meta["dnsIntercept"] != true {
		t.Fatalf("dnsIntercept = %#v, want true", meta["dnsIntercept"])
	}
}

func TestNativeNftDNSInterceptRespectsSelectedDevice(t *testing.T) {
	body, _ := NativeNft(map[string]any{
		"routerMode":   "tproxy",
		"deviceMode":   "selected",
		"devices":      []any{"192.168.1.190"},
		"ports":        []any{"80", "443"},
		"dnsIntercept": true,
	})
	if !strings.Contains(body, `iifname "br-lan" ip saddr { 192.168.1.190 } meta l4proto { tcp, udp } th dport 53`) {
		t.Fatalf("DNS intercept should be scoped to selected device:\n%s", body)
	}
}

func TestNativeNftBlockQuicRespectsSelectedDevice(t *testing.T) {
	body, _ := NativeNft(map[string]any{
		"routerMode": "tproxy",
		"deviceMode": "selected",
		"devices":    []any{"192.168.1.205"},
		"blockQuic":  true,
	})
	if !strings.Contains(body, `iifname "br-lan" ip saddr { 192.168.1.205 } udp dport 443 drop`) {
		t.Fatalf("Block QUIC should be scoped to selected device:\n%s", body)
	}
}

func TestNativeNftCanDisableDNSIntercept(t *testing.T) {
	body, meta := NativeNft(map[string]any{
		"ports":        []any{"80", "443"},
		"dnsIntercept": false,
	})
	if strings.Contains(body, "DNS Intercept") {
		t.Fatalf("DNS intercept should be disabled:\n%s", body)
	}
	if meta["dnsIntercept"] != false {
		t.Fatalf("dnsIntercept = %#v, want false", meta["dnsIntercept"])
	}
}

func TestNativeNftKillSwitchForcesProtectedIPsToXray(t *testing.T) {
	body, meta := NativeNft(map[string]any{
		"routerMode":      "tproxy",
		"lanInterface":    "br-lan",
		"transparentPort": "52345",
		"killSwitch":      true,
		"killSwitchIps":   []any{"162.159.140.0/24", "172.64.150.15"},
	})
	if !strings.Contains(body, "set killswitch4") {
		t.Fatalf("nft body does not contain kill switch set:\n%s", body)
	}
	if !strings.Contains(body, "ip daddr @killswitch4 meta l4proto { tcp, udp } counter tproxy ip to :52345") {
		t.Fatalf("nft body does not force protected IPs to Xray:\n%s", body)
	}
	if meta["killSwitch"] != true {
		t.Fatalf("killSwitch = %#v, want true", meta["killSwitch"])
	}
}

func TestNativeNftKillSwitchRedirectDropsUDP(t *testing.T) {
	body, _ := NativeNft(map[string]any{
		"routerMode":      "redirect",
		"transparentPort": "52345",
		"killSwitch":      true,
		"killSwitchIps":   []any{"162.159.140.0/24"},
	})
	if !strings.Contains(body, "ip daddr @killswitch4 meta l4proto tcp redirect to :52345") {
		t.Fatalf("redirect kill switch should redirect TCP:\n%s", body)
	}
	if !strings.Contains(body, "ip daddr @killswitch4 meta l4proto udp drop") {
		t.Fatalf("redirect kill switch should drop UDP to avoid leaks:\n%s", body)
	}
}

func TestNativeNftKillSwitchDomainsCreateDynamicSet(t *testing.T) {
	body, meta := NativeNft(map[string]any{
		"routerMode":           "tproxy",
		"transparentPort":      "52345",
		"killSwitch":           true,
		"killSwitchDomainMode": "nftset",
		"killSwitchDomains":    []any{"openai.com", "chatgpt.com"},
		"killSwitchIps":        []any{},
		"firewallDeviceMode":   "all",
	})
	if !strings.Contains(body, "set killswitch4 { type ipv4_addr; flags interval; }") {
		t.Fatalf("domain kill switch should create an empty dynamic nft set:\n%s", body)
	}
	if !strings.Contains(body, "ip daddr @killswitch4 meta l4proto { tcp, udp } counter tproxy ip to :52345") {
		t.Fatalf("domain kill switch should force resolved IPs to Xray:\n%s", body)
	}
	domains, ok := meta["killSwitchDomains"].([]string)
	if !ok || len(domains) != 2 {
		t.Fatalf("killSwitchDomains = %#v, want 2 domains", meta["killSwitchDomains"])
	}
}

func TestNativeNftKillSwitchDNSBlockDomainsDoNotCreateSet(t *testing.T) {
	body, meta := NativeNft(map[string]any{
		"routerMode":           "tproxy",
		"killSwitch":           true,
		"killSwitchDomainMode": "dns-block",
		"killSwitchDomains":    []any{"openai.com"},
	})
	if strings.Contains(body, "set killswitch4") {
		t.Fatalf("dns-block domain mode should not create nft set without IPs:\n%s", body)
	}
	if meta["killSwitchDomainMode"] != "dns-block" {
		t.Fatalf("killSwitchDomainMode = %#v, want dns-block", meta["killSwitchDomainMode"])
	}
}

func TestStepOKAllowsMissingDeletes(t *testing.T) {
	if !StepOK(map[string]any{"ok": false, "stderr": "No such file or directory"}) {
		t.Fatal("StepOK should allow idempotent missing-file errors")
	}
	if StepOK(map[string]any{"ok": false, "stderr": "Error: syntax error"}) {
		t.Fatal("StepOK should reject real nft syntax errors")
	}
}
