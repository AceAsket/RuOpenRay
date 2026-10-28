package main

import (
	"os"
	"runtime"
	"strings"
	"testing"
)

func TestNativeRuntimeHealthAndRestart(t *testing.T) {
	if runtime.GOOS != "linux" || os.Getenv("RUOPENRAY_HEALTH_ACCEPTANCE") != "192.168.50.117" {
		t.Skip("requires explicit Xray restart authorization on lab")
	}
	s := &serverState{cfg: loadAppConfig()}
	before := s.captureRuntimeHealth(s.runtimeHealthConfig(s.cfg.ActiveConfig))
	healthyVPN := 0
	for name, row := range before.Checks {
		if strings.HasPrefix(name, "vpn:") && row.OK {
			healthyVPN++
		}
	}
	if !before.Checks["dns"].OK || healthyVPN == 0 {
		t.Fatalf("baseline not ready: %v", before)
	}
	result := s.serviceActionWithHealth("restart", &before)
	if result["ok"] != true || mapValue(result["health"])["state"] != "healthy" {
		t.Fatalf("restart health failed: %v", result)
	}
	t.Logf("Real restart passed: DNS, %d VPN transports; functional state=%v", healthyVPN, mapValue(result["health"])["state"])
}
