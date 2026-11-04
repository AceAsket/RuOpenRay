package main

import (
	"strings"
	"testing"
)

func TestLANDNSApplyDoesNotMaskCriticalCommandFailure(t *testing.T) {
	for _, failure := range []string{"/etc/init.d/dnsmasq restart", "uci commit dhcp"} {
		t.Run(failure, func(t *testing.T) {
			statusReads, commandCount := 0, 0
			status := func(map[string]any) map[string]any {
				statusReads++
				if statusReads == 1 {
					return map[string]any{"mode": "system", "servers": []string{}}
				}
				return map[string]any{"mode": "upstream", "servers": []string{"1.1.1.1#53"}}
			}
			result := applyLANDNSUpstreamWith(map[string]any{"mode": "upstream", "upstream": "1.1.1.1", "restart": true}, status,
				func() map[string]any { return map[string]any{"ready": true} }, func() string { return "127.0.0.1#10535" },
				func(command []string) map[string]any {
					commandCount++
					return map[string]any{"ok": strings.Join(command, " ") != failure, "stderr": "fixture command failure"}
				})
			if commandCount < 4 || result["ok"] != false || result["error"] == nil {
				t.Fatalf("critical failure was hidden by matching UCI settings: commands=%d ok=%v", commandCount, result["ok"])
			}
		})
	}
}

func TestLANDNSApplyAllowsMissingOptionalUCISetting(t *testing.T) {
	statusReads := 0
	status := func(map[string]any) map[string]any {
		statusReads++
		if statusReads == 1 {
			return map[string]any{"mode": "system", "servers": []string{}}
		}
		return map[string]any{"mode": "upstream", "servers": []string{"1.1.1.1#53"}}
	}
	result := applyLANDNSUpstreamWith(map[string]any{"mode": "upstream", "upstream": "1.1.1.1", "restart": true}, status,
		func() map[string]any { return map[string]any{"ready": true} }, func() string { return "127.0.0.1#10535" },
		func(command []string) map[string]any {
			return map[string]any{"ok": strings.Join(command, " ") != "uci -q delete dhcp.@dnsmasq[0].server"}
		})
	if result["ok"] != true || result["warning"] == nil || result["error"] != nil {
		t.Fatalf("an absent optional UCI setting made an otherwise successful apply fail: %v", result)
	}
}

func TestLANDNSApplyDryRunAndAlreadyAppliedDoNotExecuteCommands(t *testing.T) {
	for _, dryRun := range []bool{false, true} {
		result := applyLANDNSUpstreamWith(map[string]any{"mode": "upstream", "upstream": "1.1.1.1", "dryRun": dryRun, "restart": false},
			func(map[string]any) map[string]any {
				return map[string]any{"mode": "upstream", "servers": []string{"1.1.1.1#53"}}
			}, func() map[string]any { return map[string]any{} }, func() string { return "127.0.0.1#10535" },
			func([]string) map[string]any { t.Fatal("read-only/idempotent apply ran a command"); return nil })
		if result["ok"] != true || (!dryRun && result["alreadyApplied"] != true) || (dryRun && result["dryRun"] != true) {
			t.Fatalf("unexpected read-only/idempotent result: %v", result)
		}
	}
}

func TestLANDNSApplyRetriesFailedRestartWhenSettingsAlreadyMatch(t *testing.T) {
	settingsMatch, restartCalls := false, 0
	commands := []string{}
	status := func(map[string]any) map[string]any {
		if settingsMatch {
			return map[string]any{"mode": "upstream", "servers": []string{"1.1.1.1#53"}}
		}
		return map[string]any{"mode": "system", "servers": []string{}}
	}
	command := func(argv []string) map[string]any {
		line := strings.Join(argv, " ")
		commands = append(commands, line)
		if line == "uci commit dhcp" {
			settingsMatch = true
		}
		if line == "/etc/init.d/dnsmasq restart" {
			restartCalls++
			return map[string]any{"ok": restartCalls > 1}
		}
		return map[string]any{"ok": true}
	}
	payload := map[string]any{"mode": "upstream", "upstream": "1.1.1.1", "restart": true}
	ready := func() map[string]any { return map[string]any{"ready": true} }
	target := func() string { return "127.0.0.1#10535" }
	first := applyLANDNSUpstreamWith(payload, status, ready, target, command)
	if first["ok"] != false || !settingsMatch || restartCalls != 1 {
		t.Fatal("could not prepare a failed restart with matching settings")
	}
	beforeRetry := len(commands)
	second := applyLANDNSUpstreamWith(payload, status, ready, target, command)
	if second["ok"] != true || restartCalls != 2 || len(commands) != beforeRetry+1 || commands[beforeRetry] != "/etc/init.d/dnsmasq restart" {
		t.Fatalf("retry skipped restart or rewrote UCI: ok=%v restart-calls=%d retry-commands=%v", second["ok"], restartCalls, commands[beforeRetry:])
	}
}
