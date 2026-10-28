package main

import (
	"bytes"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"

	rfw "github.com/AceAsket/RuOpenRay/internal/firewall"
)

// Explicitly destructive to the named lab's managed firewall. Never enabled by
// default or in generic CI; the outer snapshot restores files, DNS and policy.
func TestNativeFirewallTransaction(t *testing.T) {
	if runtime.GOOS != "linux" || os.Getenv("RUOPENRAY_FIREWALL_ACCEPTANCE") != "192.168.50.117" {
		t.Skip("requires explicit OpenWrt lab opt-in")
	}
	dir := t.TempDir()
	s := &serverState{cfg: appConfig{DataDir: dir}}
	paths := []string{ruOpenRayFirewallNftPath, ruOpenRayFirewallLegacyNftPath, ruOpenRayFirewallHotplugPath, ruOpenRayFirewallEventPath, ruOpenRayKillSwitchDNSPath, "/etc/config/dhcp"}
	original, err := s.beginFirewallTransaction(runTimeout, paths)
	if err != nil {
		t.Fatal(err)
	}
	if err = writeFileAtomic(filepath.Join(original.dir, "rollback.nft"), []byte(firewallBatch(original.table, true)), 0600); err != nil {
		t.Fatal(err)
	}
	defer func() {
		// Guarantee a table exists for the preallocated inverse batch.
		runTimeout(5*time.Second, "nft", "add", "table", "inet", "ruopenray")
		if rb := original.rollback(); rb["ok"] != true {
			t.Errorf("lab recovery failed: %v", rb)
		} else {
			original.cleanup()
		}
	}()
	body, meta := rfw.NativeNft(map[string]any{"lanInterface": "ruopenray-lab0", "dnsIntercept": false, "blockQuic": false})
	good := s.firewallCommit(body, rfw.HotplugScript(), meta)
	if good["ok"] != true {
		t.Fatal(good)
	}
	installed := runTimeout(5*time.Second, "nft", "-s", "list", "table", "inet", "ruopenray")["stdout"]
	beforeFile, _ := os.ReadFile(paths[0])
	beforeDHCP, _ := os.ReadFile(paths[5])
	bad := s.firewallCommit("table inet ruopenray { chain broken { definitely_invalid; } }", rfw.HotplugScript(), meta)
	if bad["ok"] == true {
		t.Fatal("native nft accepted invalid rules")
	}
	afterFile, _ := os.ReadFile(paths[0])
	if !bytes.Equal(beforeFile, afterFile) || installed != runTimeout(5*time.Second, "nft", "-s", "list", "table", "inet", "ruopenray")["stdout"] {
		t.Fatal("native syntax error lost active state")
	}
	// Inject a failure after the real kernel batch has committed.
	failed := false
	runner := func(d time.Duration, n string, a ...string) map[string]any {
		if !failed && n == "ip" && strings.Contains(strings.Join(a, " "), "route replace") {
			failed = true
			return map[string]any{"ok": false, "stderr": "acceptance: policy failure"}
		}
		return runTimeout(d, n, a...)
	}
	r := s.firewallCommitWith(strings.Replace(body, "ruopenray-lab0", "ruopenray-lab1", -1), rfw.HotplugScript(), meta, paths, runner, func() []map[string]any { return nil }, s.firewallStatus)
	if r["ok"] == true || mapValue(r["rollback"])["ok"] != true {
		t.Fatal(r)
	}
	afterFile, _ = os.ReadFile(paths[0])
	afterDHCP, _ := os.ReadFile(paths[5])
	if !bytes.Equal(beforeFile, afterFile) || !bytes.Equal(beforeDHCP, afterDHCP) || installed != runTimeout(5*time.Second, "nft", "-s", "list", "table", "inet", "ruopenray")["stdout"] {
		t.Fatal("postcommit rollback did not restore kernel/files/DNS")
	}
	// Real ENOSPC in a tiny, temporary tmpfs, never the router's persistent FS.
	full := filepath.Join(dir, "full")
	os.Mkdir(full, 0700)
	if runTimeout(5*time.Second, "mount", "-t", "tmpfs", "-o", "size=16k", "tmpfs", full)["ok"] != true {
		t.Fatal("cannot prepare ENOSPC fixture")
	}
	defer runTimeout(5*time.Second, "umount", full)
	if os.WriteFile(filepath.Join(full, "fill"), make([]byte, 32<<10), 0600) == nil {
		t.Fatal("ENOSPC fixture unexpectedly has free space")
	}
	s.cfg.DataDir = full
	if r := s.firewallCommit(body, rfw.HotplugScript(), meta); r["ok"] == true {
		t.Fatal("accepted full filesystem")
	}
	if installed != runTimeout(5*time.Second, "nft", "-s", "list", "table", "inet", "ruopenray")["stdout"] {
		t.Fatal("ENOSPC changed kernel rules")
	}
}
