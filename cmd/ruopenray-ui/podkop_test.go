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
