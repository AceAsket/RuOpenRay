package main

import (
	"reflect"
	"testing"
)

func TestFirewallNftsetSnapshotKeepsDomainsInTheirOwnSets(t *testing.T) {
	snapshot := []string{
		"/direct.example/4#inet#ruopenray#bypass4",
		"/vpn.example/4#inet#ruopenray#proxy4",
		"/blocked.example/4#inet#ruopenray#killswitch4",
		"/awg.example/4#inet#ruopenray#amnezia4",
		"/another-vpn.example/4#inet#ruopenray#proxy4",
		"/foreign.example/4#inet#other#proxy4",
	}
	before := append([]string(nil), snapshot...)
	for _, tc := range []struct {
		set     string
		domains []string
	}{
		{"bypass4", []string{"direct.example"}},
		{"proxy4", []string{"vpn.example", "another-vpn.example"}},
		{"killswitch4", []string{"blocked.example"}},
		{"amnezia4", []string{"awg.example"}},
	} {
		status := routeNftsetStatusFromSnapshot(tc.set, snapshot)
		if status["active"] != true || status["count"] != len(tc.domains) {
			t.Fatalf("%s: unexpected active/count: %#v", tc.set, status)
		}
		if !reflect.DeepEqual(status["domains"], tc.domains) {
			t.Fatalf("%s: domains = %#v, want %#v", tc.set, status["domains"], tc.domains)
		}
		if status["set"] != "inet ruopenray "+tc.set {
			t.Fatalf("%s: unexpected set identifier: %#v", tc.set, status["set"])
		}
	}
	if !reflect.DeepEqual(snapshot, before) {
		t.Fatal("status generation modified the shared snapshot")
	}
}

func TestFirewallNftsetEmptySnapshotDoesNotClaimActiveSets(t *testing.T) {
	for _, set := range []string{"bypass4", "proxy4", "killswitch4", "amnezia4"} {
		status := routeNftsetStatusFromSnapshot(set, nil)
		if status["active"] != false || status["count"] != 0 {
			t.Fatalf("%s: empty snapshot claimed active entries: %#v", set, status)
		}
		if domains, ok := status["domains"].([]string); !ok || len(domains) != 0 {
			t.Fatalf("%s: domains = %#v, want an empty list", set, status["domains"])
		}
	}
}
