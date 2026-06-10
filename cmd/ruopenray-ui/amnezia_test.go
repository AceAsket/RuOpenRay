package main

import (
	"reflect"
	"testing"
)

func TestParseIPLinkInterfaces(t *testing.T) {
	text := `5: awg0: <POINTOPOINT,NOARP,UP,LOWER_UP> mtu 1420 qdisc noqueue state UNKNOWN mode DEFAULT group default qlen 1000
6: wg-home@if7: <POINTOPOINT,NOARP> mtu 1420 qdisc noqueue state DOWN mode DEFAULT group default qlen 1000`
	got := parseIPLinkInterfaces(text)
	if len(got) != 2 {
		t.Fatalf("expected 2 interfaces, got %d: %#v", len(got), got)
	}
	if got[0]["name"] != "awg0" || got[0]["up"] != true || got[0]["state"] != "UNKNOWN" {
		t.Fatalf("unexpected first interface: %#v", got[0])
	}
	if got[1]["name"] != "wg-home" || got[1]["up"] != false || got[1]["state"] != "DOWN" {
		t.Fatalf("unexpected second interface: %#v", got[1])
	}
}

func TestParseWGShowInterfaces(t *testing.T) {
	text := `interface: awg0
  public key: redacted
peer: abc

interface: wg1
  public key: redacted
interface: awg0`
	got := parseWGShowInterfaces(text)
	want := []string{"awg0", "wg1"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("interfaces mismatch: got %#v want %#v", got, want)
	}
}

func TestAmneziaServiceStatusTextRunning(t *testing.T) {
	cases := []struct {
		name string
		text string
		want bool
	}{
		{"running", "running", true},
		{"started", "service started", true},
		{"inactive wins", "inactive (dead)", false},
		{"stopped wins", "stopped", false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := amneziaServiceStatusTextRunning(tc.text); got != tc.want {
				t.Fatalf("got %v want %v for %q", got, tc.want, tc.text)
			}
		})
	}
}

func TestAmneziaInterfaceNameLooksRelevant(t *testing.T) {
	for _, name := range []string{"awg0", "wg-client", "home-amnezia"} {
		if !amneziaInterfaceNameLooksRelevant(name) {
			t.Fatalf("%q should look relevant", name)
		}
	}
	for _, name := range []string{"eth0", "br-lan", "tailscale0"} {
		if amneziaInterfaceNameLooksRelevant(name) {
			t.Fatalf("%q should not look relevant", name)
		}
	}
}
