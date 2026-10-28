package main

import (
	"encoding/json"
	"fmt"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"
)

func TestNativeAppWatchdogSurvivesPanelFailure(t *testing.T) {
	if runtime.GOOS != "linux" || os.Getenv("RUOPENRAY_WATCHDOG_ACCEPTANCE") != "192.168.50.117" {
		t.Skip("requires explicit lab opt-in and panel fixture")
	}
	panel, err := os.ReadFile(os.Getenv("RUOPENRAY_PANEL_FIXTURE"))
	if err != nil {
		t.Fatal(err)
	}
	if out, err := exec.Command(os.Getenv("RUOPENRAY_PANEL_FIXTURE"), "--self-check").CombinedOutput(); err != nil || !strings.Contains(string(out), `"ok": true`) {
		t.Fatalf("candidate self-check failed: %s %v", out, err)
	}
	for _, crash := range []bool{false, true} {
		t.Run(fmt.Sprint("crash=", crash), func(t *testing.T) {
			dir := t.TempDir()
			target := filepath.Join(dir, "panel")
			staged := filepath.Join(dir, "candidate")
			script := filepath.Join(dir, "service")
			pidFile := filepath.Join(dir, "pid")
			os.WriteFile(target, panel, 0700)
			candidate := panel
			if crash {
				candidate = []byte("#!/bin/sh\nexit 1\n")
			}
			os.WriteFile(staged, candidate, 0700)
			expected, _ := executableSHA(staged)
			listener, e := net.Listen("tcp", "127.0.0.1:0")
			if e != nil {
				t.Fatal(e)
			}
			port := listener.Addr().(*net.TCPAddr).Port
			listener.Close()
			s := &serverState{cfg: appConfig{DataDir: dir, Host: "127.0.0.1", Port: fmt.Sprint(port)}}
			service := fmt.Sprintf(`#!/bin/sh
if [ -f %[1]q ]; then
 pid="$(cat %[1]q)"
 if [ -r "/proc/$pid/cmdline" ]; then
  case "$(tr '\000' ' ' < /proc/$pid/cmdline)" in %[2]q*) kill -TERM "$pid" ;; esac
 fi
fi
RUOPENRAY_DATA_DIR=%[3]q RUOPENRAY_HOST=127.0.0.1 RUOPENRAY_PORT=%[4]d RUOPENRAY_PASSWORD=watchdog-test-only RUOPENRAY_XRAY_SERVICE=fixture %[2]q serve > %[3]q/console 2>&1 </dev/null &
echo $! > %[1]q
`, pidFile, target, dir, port)
			os.WriteFile(script, []byte(service), 0700)
			defer func() {
				b, _ := os.ReadFile(pidFile)
				pid := strings.TrimSpace(string(b))
				if pid != "" {
					runTimeout(3*time.Second, "kill", "-TERM", pid)
				}
			}()
			result, err := s.scheduleAppUpdateWithScript(staged, target, expected, false, script)
			if err != nil {
				t.Fatal(err)
			}
			// Detached child has a separate session, so stopping the parent/procd group
			// cannot take the watchdog down with the service it is meant to recover.
			stat, _ := os.ReadFile(fmt.Sprintf("/proc/%v/stat", result["watchdogPID"]))
			fields := strings.Fields(string(stat))
			if len(fields) < 6 || fields[0] != fields[5] {
				t.Fatal("watchdog has not detached its session")
			}
			var report map[string]any
			deadline := time.Now().Add(65 * time.Second)
			for time.Now().Before(deadline) {
				b, e := os.ReadFile(filepath.Join(dir, "app-update-result.json"))
				if e == nil && json.Unmarshal(b, &report) == nil {
					break
				}
				time.Sleep(300 * time.Millisecond)
			}
			if crash {
				if report["state"] != "rolled_back" || report["rollbackOK"] != true {
					t.Fatal(report)
				}
			} else if report["state"] != "healthy" {
				t.Fatal(report)
			}
			actual, _ := executableSHA(target)
			beforePath := filepath.Join(dir, "expected-old")
			os.WriteFile(beforePath, panel, 0600)
			oldSHA, _ := executableSHA(beforePath)
			if actual != oldSHA {
				t.Fatal("recovered binary differs from known panel fixture")
			}
		})
	}
}
