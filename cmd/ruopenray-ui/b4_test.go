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

func TestB4RouteOutputActiveIgnoresMissingTableErrors(t *testing.T) {
	if b4RouteOutputActive(map[string]any{
		"ok":     false,
		"stdout": `Error: argument "b4_route" is wrong: table id value is invalid`,
	}) {
		t.Fatal("missing b4_route table error must not be treated as active route")
	}
	if !b4RouteOutputActive(map[string]any{"ok": true, "stdout": "default dev lo scope link"}) {
		t.Fatal("valid route output should be treated as active route")
	}
}

func TestB4ProcessLinesIgnoresDiagnosticShell(t *testing.T) {
	output := `29251 root 1348 S ash -c echo status; /etc/init.d/b4 status 2>&1 || true
29299 root 1348 S grep b4
29310 root 2048 S /usr/bin/b4 --config /etc/b4/config.json`
	lines := b4ProcessLines(output)
	if len(lines) != 1 {
		t.Fatalf("process lines = %#v, want one real b4 process", lines)
	}
}
