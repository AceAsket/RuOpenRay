package main

import "testing"

func TestB4StatusTextRunning(t *testing.T) {
	if b4StatusTextRunning("inactive") {
		t.Fatal("inactive service must not be treated as running")
	}
	if b4StatusTextRunning("not running") {
		t.Fatal("not running service must not be treated as running")
	}
	if !b4StatusTextRunning("running") {
		t.Fatal("running service should be treated as running")
	}
}

func TestB4Warnings(t *testing.T) {
	status := map[string]any{
		"nft":      map[string]any{"hasQueue": true, "hasDNSRedirect": true},
		"iptables": map[string]any{"hasNFQUEUE": false},
		"routing":  map[string]any{"ipRule": true},
	}
	warnings := b4Warnings(status)
	if len(warnings) != 3 {
		t.Fatalf("warnings = %#v, want 3 items", warnings)
	}
}
