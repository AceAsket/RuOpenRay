package main

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func outboundFailureResult(tag, reason string) map[string]any {
	return map[string]any{
		"ok": false, "stdout": "Xray test fixture\nFailed to start: main: failed to load config files: [fixture.json] > infra/conf: failed to build outbound config with tag " + tag + " > " + reason,
		"stderr": "exit status 23", "code": 0, "message": "exit status 23",
	}
}

func TestXrayOutboundErrorUsesOnlyUnambiguousConfiguredTags(t *testing.T) {
	for _, tc := range []struct {
		name, tag, output string
		tags              []string
		ok, want          bool
	}{
		{name: "stdout", tag: "iboost-serbia", tags: []string{"direct", "iboost-serbia"}, want: true},
		{name: "unicode and spaces", tag: "🇷🇸 Сербия 1", tags: []string{"🇷🇸 Сербия 1"}, want: true},
		{name: "tag contains delimiter", tag: "provider > route", tags: []string{"provider > route"}, want: true},
		{name: "ambiguous unquoted tag", tag: "provider > route", tags: []string{"provider", "provider > route"}},
		{name: "duplicate tag", tag: "proxy", tags: []string{"proxy", "proxy"}},
		{name: "unknown tag", tag: "unknown", tags: []string{"proxy"}},
		{name: "success is not an error", tag: "proxy", tags: []string{"proxy"}, ok: true},
		{name: "non-outbound failure", tags: []string{"proxy"}, output: "failed to build routing configuration > missing outbound"},
		{name: "missing reason", tags: []string{"proxy"}, output: "failed to build outbound config with tag proxy > "},
		{name: "unknown wrapper does not borrow nested tag", tags: []string{"proxy"}, output: "failed to build outbound config with tag unknown > failed to build outbound config with tag proxy > a reflected value"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			outbounds := []any{}
			for _, tag := range tc.tags {
				outbounds = append(outbounds, map[string]any{"tag": tag, "protocol": "vless"})
			}
			result := outboundFailureResult(tc.tag, "infra/conf: synthetic core rejection")
			if tc.output != "" {
				result["stdout"] = tc.output
			}
			result["ok"] = tc.ok
			got, found := xrayOutboundError(map[string]any{"outbounds": outbounds}, result)
			if found != tc.want {
				t.Fatalf("found=%t error=%v, want %t", found, got, tc.want)
			}
			if found && (got["tag"] != tc.tag || got["message"] != "infra/conf: synthetic core rejection" || got["source"] != "xray") {
				t.Fatalf("wrong core error: %v", got)
			}
		})
	}
	result := outboundFailureResult("proxy", "core stderr reason")
	result["stderr"], result["stdout"] = result["stdout"], ""
	if failure, found := xrayOutboundError(map[string]any{"outbounds": []any{map[string]any{"tag": "proxy"}}}, result); !found || failure["message"] != "core stderr reason" {
		t.Fatalf("stderr diagnostic lost: %v %t", failure, found)
	}
}

func TestCollectXrayOutboundErrorsPreservesOriginalAndReferences(t *testing.T) {
	cfg := map[string]any{
		"outbounds": []any{
			map[string]any{"tag": "bad-a", "protocol": "vless", "fixtureReason": "first core rejection", "settings": map[string]any{"credential": "fixture-only"}},
			map[string]any{"tag": "bad-b", "protocol": "vless", "fixtureReason": "second core rejection", "streamSettings": map[string]any{"sockopt": map[string]any{"dialerProxy": "bad-a"}}},
			map[string]any{"tag": "good", "protocol": "freedom", "settings": map[string]any{"domainStrategy": "UseIP"}},
		},
		"routing": map[string]any{"rules": []any{map[string]any{"domain": []any{"example.test"}, "outboundTag": "bad-a"}}},
		"dns":     map[string]any{"servers": []any{"localhost"}},
	}
	first := outboundFailureResult("bad-a", "first core rejection")
	beforeConfig, beforeResult := transportJSON(cfg), transportJSON(first)
	calls := 0
	tester := func(ctx context.Context, candidate map[string]any) map[string]any {
		calls++
		if _, hasDeadline := ctx.Deadline(); !hasDeadline {
			t.Fatal("diagnostic core run has no total deadline")
		}
		if transportJSON(candidate["routing"]) != transportJSON(cfg["routing"]) || transportJSON(candidate["dns"]) != transportJSON(cfg["dns"]) {
			t.Fatal("diagnostics changed global context or references")
		}
		for _, item := range asArray(candidate["outbounds"]) {
			outbound := mapValue(item)
			if reason, _ := outbound["fixtureReason"].(string); reason != "" {
				return outboundFailureResult(stringsTrim(outbound["tag"]), reason)
			}
			if strings.HasPrefix(stringsTrim(outbound["tag"]), "bad-") && (outbound["protocol"] != "freedom" || len(outbound) != 2) {
				t.Fatalf("confirmed error was not replaced by an inert tagged outbound: %v", outbound)
			}
		}
		return map[string]any{"ok": true}
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	errors, complete := collectXrayOutboundErrors(ctx, cfg, first, tester)
	if !complete || len(errors) != 2 || errors[0]["tag"] != "bad-a" || errors[1]["tag"] != "bad-b" || calls != 2 {
		t.Fatalf("errors=%v complete=%t calls=%d", errors, complete, calls)
	}
	if transportJSON(cfg) != beforeConfig || transportJSON(first) != beforeResult {
		t.Fatal("diagnostics mutated the user's config or original validation result")
	}
}

func TestCollectXrayOutboundErrorsReportsPartialResults(t *testing.T) {
	for _, tc := range []struct {
		name     string
		count    int
		repeated bool
		complete bool
	}{
		{name: "non-outbound failure", count: 1},
		{name: "repeated failure", count: 1, repeated: true},
		{name: "exact error count limit", count: maxOutboundValidationErrors, complete: true},
		{name: "error count limit", count: maxOutboundValidationErrors + 2},
	} {
		t.Run(tc.name, func(t *testing.T) {
			outbounds := []any{}
			for index := 0; index < tc.count; index++ {
				outbounds = append(outbounds, map[string]any{"tag": fmt.Sprintf("bad-%d", index), "protocol": "vless"})
			}
			calls := 0
			tester := func(context.Context, map[string]any) map[string]any {
				calls++
				if tc.repeated {
					return outboundFailureResult("bad-0", "same core rejection")
				}
				if tc.count == 1 {
					return map[string]any{"ok": false, "stdout": "failed to build routing configuration"}
				}
				if calls == tc.count {
					return map[string]any{"ok": true}
				}
				return outboundFailureResult(fmt.Sprintf("bad-%d", calls), "next core rejection")
			}
			errors, complete := collectXrayOutboundErrors(context.Background(), map[string]any{"outbounds": outbounds}, outboundFailureResult("bad-0", "initial core rejection"), tester)
			wantCount := 1
			if tc.count > 1 {
				wantCount = maxOutboundValidationErrors
			}
			if complete != tc.complete || len(errors) != wantCount || calls > maxOutboundValidationErrors {
				t.Fatalf("errors=%v complete=%t calls=%d", errors, complete, calls)
			}
		})
	}
}

func TestCollectXrayOutboundErrorsHonorsTotalTimeout(t *testing.T) {
	cfg := map[string]any{"outbounds": []any{map[string]any{"tag": "bad", "protocol": "vless"}}}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Millisecond)
	defer cancel()
	started := time.Now()
	errors, complete := collectXrayOutboundErrors(ctx, cfg, outboundFailureResult("bad", "actual first error"), func(ctx context.Context, candidate map[string]any) map[string]any {
		<-ctx.Done()
		return map[string]any{"ok": false, "stderr": ctx.Err().Error()}
	})
	if complete || len(errors) != 1 || errors[0]["message"] != "actual first error" || time.Since(started) > time.Second {
		t.Fatalf("partial timeout results lost: %v %t duration=%s", errors, complete, time.Since(started))
	}
}

func TestXrayConfigTestCanceledBeforeExecutionCreatesNoFiles(t *testing.T) {
	dir := t.TempDir()
	state := &serverState{cfg: appConfig{DataDir: dir}}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	result := state.testXrayConfig(ctx, map[string]any{"outbounds": []any{}})
	files, err := filepath.Glob(filepath.Join(dir, ".test-*"))
	if err != nil || result["ok"] != false || len(files) != 0 || !strings.Contains(stringsTrim(result["stderr"]), "canceled") {
		t.Fatalf("canceled test ran: %v files=%v error=%v", result, files, err)
	}
}

func TestCollectXrayOutboundErrorsDoesNotInferTransportFailures(t *testing.T) {
	cfg := map[string]any{"outbounds": []any{map[string]any{"tag": "plaintext", "protocol": "vless", "streamSettings": map[string]any{"network": "grpc", "security": "none"}}}}
	for _, first := range []map[string]any{{"ok": true}, {"ok": false, "stdout": "failed to build routing configuration"}} {
		errors, complete := collectXrayOutboundErrors(context.Background(), cfg, first, func(context.Context, map[string]any) map[string]any {
			t.Fatal("transport fields caused an unconfirmed outbound check")
			return nil
		})
		if len(errors) != 0 || complete != (first["ok"] == true) {
			t.Fatalf("guessed transport errors: %v complete=%t", errors, complete)
		}
	}
}

func TestXrayConfigTestTemporaryFilesAreRemovedOnCoreFailure(t *testing.T) {
	dir := t.TempDir()
	state := &serverState{cfg: appConfig{DataDir: dir}}
	t.Setenv("PATH", t.TempDir())
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	result := state.testXrayConfig(ctx, map[string]any{"outbounds": []any{}})
	files, err := os.ReadDir(dir)
	if err != nil || result["ok"] != false || len(files) != 0 {
		t.Fatalf("failed core test left private files: result=%v files=%v error=%v", result, files, err)
	}
}
