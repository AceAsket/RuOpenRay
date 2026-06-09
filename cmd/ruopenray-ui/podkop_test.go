package main

import "testing"

func TestPodkopDNSServerMatches(t *testing.T) {
	for _, value := range []string{
		"127.0.0.42",
		"127.0.0.42#53",
		"127.0.0.42:53",
		"udp://127.0.0.42:53",
		"tcp://127.0.0.42:53",
	} {
		if !podkopDNSServerMatches(value) {
			t.Fatalf("expected %q to match Podkop DNS", value)
		}
	}
	if podkopDNSServerMatches("127.0.0.1#10535") {
		t.Fatal("RuOpenRay DNS target must not match Podkop DNS")
	}
}

func TestPodkopStatusTextRunning(t *testing.T) {
	if podkopStatusTextRunning("inactive") {
		t.Fatal("inactive service must not be treated as running")
	}
	if podkopStatusTextRunning("not running") {
		t.Fatal("not running service must not be treated as running")
	}
	if !podkopStatusTextRunning("running") {
		t.Fatal("running service should be treated as running")
	}
}

func TestPodkopRouteOutputActiveIgnoresDumpTerminated(t *testing.T) {
	if podkopRouteOutputActive(map[string]any{"ok": false, "stdout": "Dump terminated"}) {
		t.Fatal("failed route dump must not make Podkop active")
	}
	if podkopRouteOutputActive(map[string]any{"ok": true, "stdout": "Error: argument \"podkop\" is wrong: table id value is invalid"}) {
		t.Fatal("invalid route table output must not make Podkop active")
	}
	if !podkopRouteOutputActive(map[string]any{"ok": true, "stdout": "local default dev lo scope host"}) {
		t.Fatal("real route output should make Podkop route active")
	}
}
