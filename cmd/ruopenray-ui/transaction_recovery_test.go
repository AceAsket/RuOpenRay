package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestGeoRecoveryAfterPartialPromotionAndInterruptedRollback(t *testing.T) {
	for _, state := range []string{"pending", "rollback-interrupted", "committed", "retired"} {
		t.Run(state, func(t *testing.T) {
			root := t.TempDir()
			geo := filepath.Join(root, "geo")
			os.Mkdir(geo, 0700)
			s := &serverState{cfg: appConfig{DataDir: root, GeoDir: geo}}
			dir, _ := os.MkdirTemp(root, ".geo-transaction-")
			var files []recoveryFile
			for _, name := range []string{"first.dat", "second.dat"} {
				path := filepath.Join(geo, name)
				os.WriteFile(path, []byte("old-"+name), 0644)
				f, err := prepareRecoveryFile(path, ".ruopenray-geo-rollback-")
				if err != nil {
					t.Fatal(err)
				}
				files = append(files, f)
				os.WriteFile(path, []byte("new-"+name), 0644)
			}
			absent := filepath.Join(geo, "new.dat")
			files = append(files, recoveryFile{Path: absent})
			os.WriteFile(absent, []byte("new file"), 0600)
			if err := saveTransactionRecovery(dir, transactionRecovery{Version: 1, Kind: "geo", GeoDir: geo, Files: files}); err != nil {
				t.Fatal(err)
			}
			if state == "rollback-interrupted" {
				if err := restoreRecoveryFile(files[0]); err != nil {
					t.Fatal(err)
				}
			}
			if state == "committed" || state == "retired" {
				if err := commitTransactionRecovery(dir); err != nil {
					t.Fatal(err)
				}
			}
			if state == "retired" {
				retired, err := retireRecoveryDirectory(dir)
				if err != nil {
					t.Fatal(err)
				}
				os.Remove(filepath.Join(retired, "committed"))
			}
			run := func(time.Duration, string, ...string) map[string]any {
				t.Fatal("unexpected service command")
				return nil
			}
			for i := 0; i < 2; i++ {
				if err := s.recoverPendingTransactionsWith(run, nil); err != nil {
					t.Fatal(err)
				}
			}
			for _, name := range []string{"first.dat", "second.dat"} {
				prefix := "old-"
				if state == "committed" || state == "retired" {
					prefix = "new-"
				}
				body, _ := os.ReadFile(filepath.Join(geo, name))
				if string(body) != prefix+name {
					t.Fatalf("%s: %s", name, body)
				}
			}
			_, err := os.Stat(absent)
			if (state == "pending" || state == "rollback-interrupted") && !os.IsNotExist(err) {
				t.Fatal("new file survived rollback")
			}
		})
	}
}

func TestRecoveryRejectsDamagedBackupsAndUnownedPaths(t *testing.T) {
	for _, failure := range []string{"corrupt-backup", "foreign-path", "absent-with-backup", "invalid-commit", "journal-symlink"} {
		t.Run(failure, func(t *testing.T) {
			root := t.TempDir()
			geo := filepath.Join(root, "geo")
			os.Mkdir(geo, 0700)
			path := filepath.Join(geo, "first.dat")
			os.WriteFile(path, []byte("old"), 0600)
			f, _ := prepareRecoveryFile(path, ".ruopenray-geo-rollback-")
			os.WriteFile(path, []byte("new"), 0600)
			dir, _ := os.MkdirTemp(root, ".geo-transaction-")
			s := &serverState{cfg: appConfig{DataDir: root, GeoDir: geo}}
			switch failure {
			case "corrupt-backup":
				os.WriteFile(f.Backup, []byte("corrupt"), 0600)
			case "foreign-path":
				f.Path = filepath.Join(root, "unrelated.dat")
			case "absent-with-backup":
				f.Existed = false
			case "invalid-commit":
				os.WriteFile(filepath.Join(dir, "committed"), []byte("partial"), 0600)
			}
			if err := saveTransactionRecovery(dir, transactionRecovery{Version: 1, Kind: "geo", GeoDir: geo, Files: []recoveryFile{f}}); err != nil {
				t.Fatal(err)
			}
			if failure == "journal-symlink" {
				body, _ := os.ReadFile(filepath.Join(dir, "recovery.json"))
				other := filepath.Join(root, "other.json")
				os.WriteFile(other, body, 0600)
				os.Remove(filepath.Join(dir, "recovery.json"))
				if err := os.Symlink(other, filepath.Join(dir, "recovery.json")); err != nil {
					t.Skip(err)
				}
			}
			if err := s.recoverPendingTransactionsWith(func(time.Duration, string, ...string) map[string]any { t.Fatal("unexpected command"); return nil }, nil); err == nil {
				t.Fatal("accepted invalid recovery")
			}
			body, _ := os.ReadFile(path)
			if string(body) != "new" {
				t.Fatal("changed target despite rejected recovery")
			}
			if _, err := os.Stat(filepath.Join(dir, "recovery.json")); err != nil {
				t.Fatal("lost recovery evidence")
			}
		})
	}
}

func TestFirewallRecoveryHandlesKernelTableMissingAfterReboot(t *testing.T) {
	for _, present := range []bool{false, true} {
		t.Run(map[bool]string{false: "kernel-reset", true: "process-crash"}[present], func(t *testing.T) {
			root := t.TempDir()
			s := &serverState{cfg: appConfig{DataDir: root}}
			paths := []string{}
			files := []recoveryFile{}
			for _, name := range []string{"nft", "legacy", "iface", "fw", "dns", "dhcp"} {
				path := filepath.Join(root, name)
				paths = append(paths, path)
				os.WriteFile(path, []byte("old-"+name), 0600)
				f, _ := prepareRecoveryFile(path, ".firewall-rollback-")
				files = append(files, f)
				os.WriteFile(path, []byte("new"), 0600)
			}
			dir, _ := os.MkdirTemp(root, ".firewall-transaction-")
			old := "table inet ruopenray { chain old {} }\n"
			writeFileAtomic(filepath.Join(dir, "rollback.nft"), []byte(firewallBatch(old, true)), 0600)
			writeFileAtomic(filepath.Join(dir, "rollback-empty.nft"), []byte(old), 0600)
			saveTransactionRecovery(dir, transactionRecovery{Version: 1, Kind: "firewall", Files: files, Table: old, HadTable: true})
			loaded := false
			run := func(_ time.Duration, name string, args ...string) map[string]any {
				out := ""
				if name == "nft" && strings.Join(args, " ") == "list tables" && present {
					out = "table inet ruopenray\n"
				}
				if name == "nft" && len(args) == 2 && args[0] == "-f" {
					body, _ := os.ReadFile(args[1])
					if string(body) != firewallBatch(old, present) {
						t.Fatal("wrong inverse batch", string(body))
					}
					loaded = true
				}
				return map[string]any{"ok": true, "stdout": out}
			}
			if err := s.recoverPendingTransactionsWith(run, paths); err != nil {
				t.Fatal(err)
			}
			if !loaded {
				t.Fatal("kernel table not recovered")
			}
			for _, path := range paths {
				body, _ := os.ReadFile(path)
				if string(body) != "old-"+filepath.Base(path) {
					t.Fatal("file not restored", path)
				}
			}
		})
	}
}

func TestRecoveryChecksAllSnapshotsBeforeRestoringAnyFile(t *testing.T) {
	root := t.TempDir()
	geo := filepath.Join(root, "geo")
	os.Mkdir(geo, 0700)
	s := &serverState{cfg: appConfig{DataDir: root, GeoDir: geo}}
	dir, _ := os.MkdirTemp(root, ".geo-transaction-")
	var files []recoveryFile
	for _, name := range []string{"first.dat", "second.dat"} {
		path := filepath.Join(geo, name)
		os.WriteFile(path, []byte("old"), 0600)
		f, err := prepareRecoveryFile(path, ".ruopenray-geo-rollback-")
		if err != nil {
			t.Fatal(err)
		}
		files = append(files, f)
		os.WriteFile(path, []byte("new"), 0600)
	}
	os.WriteFile(files[1].Backup, []byte("damaged"), 0600)
	if err := saveTransactionRecovery(dir, transactionRecovery{Version: 1, Kind: "geo", GeoDir: geo, Files: files}); err != nil {
		t.Fatal(err)
	}
	if err := s.recoverPendingTransactionsWith(func(time.Duration, string, ...string) map[string]any { t.Fatal("unexpected command"); return nil }, nil); err == nil {
		t.Fatal("accepted damaged second snapshot")
	}
	for _, f := range files {
		body, _ := os.ReadFile(f.Path)
		if string(body) != "new" {
			t.Fatal("partially restored a rejected transaction")
		}
	}
}

func TestInstallerShipsTheSameIndependentAppRecoveryHelper(t *testing.T) {
	helper, err := os.ReadFile(filepath.Join("..", "..", "packaging", "openwrt", "files", "usr", "libexec", "ruopenray-recover-app"))
	if err != nil {
		t.Fatal(err)
	}
	installer, err := os.ReadFile(filepath.Join("..", "..", "scripts", "install-openwrt.sh"))
	if err != nil {
		t.Fatal(err)
	}
	parts := strings.Split(strings.ReplaceAll(string(installer), "\r\n", "\n"), "<<'RUOPENRAY_APP_RECOVERY_EOF'\n")
	if len(parts) != 2 || strings.Split(parts[1], "RUOPENRAY_APP_RECOVERY_EOF\n")[0] != strings.ReplaceAll(string(helper), "\r\n", "\n") {
		t.Fatal("installer recovery helper differs from SDK helper")
	}
}
