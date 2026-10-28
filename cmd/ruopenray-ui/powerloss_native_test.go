//go:build linux

package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"syscall"
	"testing"
	"time"

	rfw "github.com/AceAsket/RuOpenRay/internal/firewall"
)

// The parent harness cuts power to the explicitly identified disposable VM.
// There are no production environment variables or API hooks for these pauses.
func TestPowerLossFixture(t *testing.T) {
	if os.Getenv("RUOPENRAY_CRASH_ACCEPTANCE") != "192.168.50.117" {
		t.Skip("requires explicitly opted-in test VM and external power controller")
	}
	marker := os.Getenv("RUOPENRAY_CRASH_MARKER")
	if filepath.Dir(marker) != "/root/ruopenray-powerloss-20261029" {
		t.Fatal("unexpected marker directory")
	}
	pause := func(phase string) {
		b, _ := json.Marshal(map[string]any{"phase": phase, "pid": os.Getpid()})
		if err := writeFileAtomic(marker, b, 0600); err != nil {
			t.Fatal(err)
		}
		if err := syscall.Kill(os.Getpid(), syscall.SIGSTOP); err != nil {
			t.Fatal(err)
		}
		t.Fatal("fixture was resumed instead of power-cycled")
	}
	s := &serverState{cfg: loadAppConfig()}
	unlock, err := s.beginMutation()
	if err != nil {
		t.Fatal(err)
	}
	defer unlock()
	switch os.Getenv("RUOPENRAY_CRASH_PHASE") {
	case "firewall":
		body, meta := rfw.NativeNft(map[string]any{"lanInterface": "ruopenray-lab0", "dnsIntercept": false, "blockQuic": false})
		runner := func(d time.Duration, n string, a ...string) map[string]any {
			r := runTimeout(d, n, a...)
			if n == "nft" && len(a) == 2 && a[0] == "-f" && filepath.Base(a[1]) == "batch.nft" && r["ok"] == true {
				pause("firewall-kernel-committed")
			}
			return r
		}
		r := s.firewallCommitWith(body, rfw.HotplugScript(), meta, firewallRecoveryPaths(), runner, func() []map[string]any { return nil }, s.firewallStatus)
		t.Fatal("power-loss point not reached", r)
	case "geo":
		s.cfg.ActiveConfig = filepath.Join(filepath.Dir(marker), "geo-validation.json")
		count := 0
		r := s.runGeoTransactionWithRename(true, true, func(stage *serverState) map[string]any {
			for _, name := range []string{"geoip.dat", "geosite.dat"} {
				path := filepath.Join(stage.cfg.GeoDir, name)
				body, err := os.ReadFile(path)
				if err != nil {
					t.Fatal(err)
				}
				body = append(body, geoProtoMessage(1, geoProtoStringField(1, "RUOPENRAYCRASHFIXTURE"))...)
				if err := writeFileAtomic(path, body, 0644); err != nil {
					t.Fatal(err)
				}
			}
			return map[string]any{"ok": true}
		}, func(from, to string) error {
			err := renameDurable(from, to)
			if err == nil {
				count++
				if count == 1 {
					pause("geo-first-file-promoted")
				}
			}
			return err
		})
		t.Fatal("power-loss point not reached", r)
	case "app":
		target := "/usr/bin/ruopenray-ui"
		staged := filepath.Join(filepath.Dir(marker), "candidate")
		// A candidate can pass a static check yet fail at service startup.
		body := "#!/bin/sh\nif [ \"$1\" = --self-check ]; then echo '{\"ok\":true}'; exit 0; fi\nexit 1\n"
		if err := writeFileAtomic(staged, []byte(body), 0700); err != nil {
			t.Fatal(err)
		}
		sha, _ := executableSHA(staged)
		result, err := s.scheduleAppUpdateWithScript(staged, target, sha, true, "/etc/init.d/ruopenray-ui")
		if err != nil {
			t.Fatal(err)
		}
		if result["ok"] != true {
			t.Fatal(result)
		}
		pause("app-replaced-watchdog-armed")
	default:
		t.Fatal("unknown crash phase", strings.TrimSpace(os.Getenv("RUOPENRAY_CRASH_PHASE")))
	}
}
