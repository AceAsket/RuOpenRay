package main

import (
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"
)

func TestFirewallTransactionPreservesStateOnFailures(t *testing.T) {
	for _, failure := range []string{"check", "commit", "promote", "dns", "rollback", "success"} {
		t.Run(failure, func(t *testing.T) {
			dir := t.TempDir()
			s := &serverState{cfg: appConfig{DataDir: dir}}
			paths := []string{}
			for _, name := range []string{"firewall.nft", "legacy.nft", "iface-hook", "fw-hook", "dns-marker", "dhcp"} {
				paths = append(paths, filepath.Join(dir, name))
			}
			old := "table inet ruopenray { chain old { counter; } }\n"
			next := "table inet ruopenray { chain next { counter; } }\n"
			for _, p := range paths {
				if err := os.WriteFile(p, []byte("previous:"+filepath.Base(p)), 0600); err != nil {
					t.Fatal(err)
				}
			}
			os.WriteFile(paths[0], []byte(old), 0600)
			table := old
			commits := 0
			mutated := false
			runner := func(_ time.Duration, name string, args ...string) map[string]any {
				joined := strings.Join(args, " ")
				out := ""
				fail := func() map[string]any { return map[string]any{"ok": false, "stderr": "injected failure"} }
				if name == "nft" {
					switch {
					case joined == "list tables":
						out = "table inet ruopenray\n"
					case joined == "-s list table inet ruopenray":
						out = table
					case strings.HasPrefix(joined, "--check "):
						if failure == "check" {
							return fail()
						}
						b, _ := os.ReadFile(args[len(args)-1])
						if !strings.HasPrefix(string(b), "delete table inet ruopenray\n") {
							t.Fatal("replacement not a single batch")
						}
					case args[0] == "-f":
						commits++
						if commits == 1 && failure == "commit" {
							return fail()
						}
						if commits == 2 && failure == "rollback" {
							return fail()
						}
						b, _ := os.ReadFile(args[1])
						table = strings.TrimPrefix(string(b), "delete table inet ruopenray\n")
						mutated = true
						if commits == 1 && failure == "promote" {
							files, _ := filepath.Glob(filepath.Join(dir, ".firewall-candidate-*"))
							for _, p := range files {
								os.Remove(p)
							}
						}
					default:
						t.Fatalf("unexpected nft command %v", args)
					}
				}
				return map[string]any{"ok": true, "stdout": out}
			}
			dns := func() []map[string]any {
				os.WriteFile(paths[5], []byte("new DHCP settings"), 0600)
				return []map[string]any{{"ok": failure != "dns" && failure != "rollback", "stderr": "DNS rejected"}}
			}
			result := s.firewallCommitWith(next, "new hook", nil, paths, runner, dns, func() map[string]any { return map[string]any{"active": true} })
			if failure == "success" {
				if result["ok"] != true || table != next {
					t.Fatal(result, table)
				}
				return
			}
			if result["ok"] == true {
				t.Fatal("failure reported success", result)
			}
			if failure == "rollback" {
				rb := mapValue(result["rollback"])
				if rb["ok"] != false {
					t.Fatal(result)
				}
				if _, err := os.Stat(filepath.Join(rb["recoveryDir"].(string), "recovery.json")); err != nil {
					t.Fatal(err)
				}
			} else if table != old {
				t.Fatal("old live table lost", table, result)
			}
			if (failure == "check" || failure == "commit") && mutated {
				t.Fatal("precommit failure mutated kernel")
			}
			for _, p := range paths {
				expected := "previous:" + filepath.Base(p)
				if p == paths[0] {
					expected = old
				}
				b, _ := os.ReadFile(p)
				if string(b) != expected {
					t.Fatalf("%s was not restored: %q", p, b)
				}
			}
		})
	}
}

func TestFirewallPolicyCollisionAndStrictOwnership(t *testing.T) {
	owned := "32765: from all fwmark 0x1/0x1 lookup 100\n"
	if !ownedFirewallRule(strings.TrimSpace(owned)) {
		t.Fatal("managed rule not recognized")
	}
	for _, r := range []string{"32765: from 192.0.2.0/24 fwmark 0x1/0x1 lookup 100", "32765: from all fwmark 0x2 lookup 100", "32765: from all fwmark 0x1/0x1 lookup 200"} {
		if firewallPolicyOwned(r, "") == nil {
			t.Fatal("accepted foreign rule", r)
		}
	}
	if err := firewallPolicyOwned(owned, "local default dev lo scope host\n"); err != nil {
		t.Fatal(err)
	}
	if firewallPolicyOwned(owned, "default via 192.0.2.1 dev eth0") == nil {
		t.Fatal("accepted occupied table")
	}
}

func TestFirewallRestoreOnlyAcceptsOwnedTable(t *testing.T) {
	for _, body := range []string{"flush ruleset", "table inet other {}", "table inet ruopenray {}\nflush ruleset", "include \"/tmp/rules\"", "table inet ruopenray {"} {
		if validateFirewallTable(body) == nil {
			t.Fatal("accepted", body)
		}
	}
	for _, body := range []string{"", "# metadata\ntable inet ruopenray {chain test {comment \"quoted } {\";}}\n"} {
		if err := validateFirewallTable(body); err != nil {
			t.Fatal(err)
		}
	}
}

func TestFirewallPolicyPreservesForeignTables(t *testing.T) {
	var calls []string
	x := &firewallTransaction{run: func(_ time.Duration, n string, a ...string) map[string]any {
		calls = append(calls, n+" "+strings.Join(a, " "))
		out := ""
		if reflect.DeepEqual(a, []string{"-4", "rule", "show"}) {
			out = "32765: from all fwmark 0x1/0x1 lookup 100\n"
		}
		return map[string]any{"ok": true, "stdout": out}
	}}
	if err := x.policy(true); err != nil {
		t.Fatal(err)
	}
	for _, call := range calls {
		if strings.Contains(call, "flush") || strings.Contains(call, "rule del") || strings.Contains(call, "rule add") {
			t.Fatal("unnecessary destructive update", calls)
		}
	}
}
