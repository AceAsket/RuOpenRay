package main

import "testing"

func TestServerModeNormalizeLANACL(t *testing.T) {
	ips, ports, protocol, err := serverModeNormalizeLANACL("192.168.50.10, 10.20.0.0/24", "443, 8000-8010", "tcp")
	if err != nil {
		t.Fatal(err)
	}
	if len(ips) != 2 || ips[0] != "192.168.50.10" || ips[1] != "10.20.0.0/24" {
		t.Fatalf("unexpected IPs: %#v", ips)
	}
	if ports != "443,8000-8010" || protocol != "tcp" {
		t.Fatalf("unexpected ports/protocol: %q %q", ports, protocol)
	}
}

func TestServerModeNormalizeLANACLRejectsPublicNetwork(t *testing.T) {
	if _, _, _, err := serverModeNormalizeLANACL("8.8.8.8", "53", "udp"); err == nil {
		t.Fatal("public destination must not be accepted as a LAN ACL")
	}
}

func TestServerModeLimitedLANXrayRule(t *testing.T) {
	rule, ok := serverModeLimitedLANXrayRule([]any{"in"}, []any{"user"}, "192.168.50.20/32", "22", "tcp")
	if !ok || rule["outboundTag"] != "direct" || rule["port"] != "22" || rule["network"] != "tcp" {
		t.Fatalf("unexpected limited LAN rule: %#v", rule)
	}
}
