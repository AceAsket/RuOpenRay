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

func TestPodkopPortsMatchExactPort(t *testing.T) {
	output := `udp        0      0 153.117.41.37:16029     0.0.0.0:*                           2249/xray
udp        0      0 127.0.0.42:5353         0.0.0.0:*                           1000/other`
	if podkopPortOutputHasLocal(output, "", podkopTPROXYPort) {
		t.Fatal("port 16029 must not be treated as Podkop TPROXY port 1602")
	}
	if podkopPortOutputHasLocal(output, podkopDNSLoopback, podkopDNSPort) {
		t.Fatal("127.0.0.42:5353 must not be treated as Podkop DNS 53")
	}
	output += "\n" + `tcp        0      0 0.0.0.0:1602          0.0.0.0:*                           2000/b4`
	output += "\n" + `udp        0      0 127.0.0.42:53         0.0.0.0:*                           2001/podkop`
	if !podkopPortOutputHasLocal(output, "", podkopTPROXYPort) {
		t.Fatal("exact port 1602 should match Podkop TPROXY")
	}
	if !podkopPortOutputHasLocal(output, podkopDNSLoopback, podkopDNSPort) {
		t.Fatal("exact 127.0.0.42:53 should match Podkop DNS")
	}
}

func TestPodkopProcessLinesIgnoresDiagnosticsShell(t *testing.T) {
	output := `6646 root      1344 S    ash -c /usr/bin/ruopenray-ui diagnostics | jq '{podkop:.podkop, b4:.b4}'
6648 root      1440 S    jq {podkop:.podkop, b4:.b4}
7000 root      2048 S    /usr/bin/podkop --config /etc/podkop/config.json`
	lines := podkopProcessLines(output)
	if len(lines) != 1 {
		t.Fatalf("process lines = %#v, want one real podkop process", lines)
	}
}
