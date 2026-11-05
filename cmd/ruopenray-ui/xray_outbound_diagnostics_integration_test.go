package main

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// These checks only invoke the real core's -test mode. They do not start a
// tunnel or contact the synthetic public endpoints in the fixture.
func TestXrayOutboundDiagnostics(t *testing.T) {
	binaryPath := os.Getenv("RUOPENRAY_TEST_XRAY")
	if binaryPath == "" {
		t.Skip("set RUOPENRAY_TEST_XRAY to run real Xray validation diagnostics")
	}
	t.Setenv("PATH", filepath.Dir(binaryPath)+string(os.PathListSeparator)+os.Getenv("PATH"))
	version, err := exec.Command(binaryPath, "version").CombinedOutput()
	if err != nil {
		t.Fatal(err)
	}
	makeOutbound := func(tag, security string, mask map[string]any) map[string]any {
		stream := map[string]any{"network": "tcp", "security": security}
		if security == "tls" {
			stream["tlsSettings"] = map[string]any{"serverName": "synthetic.example.test"}
		}
		if mask != nil {
			stream["finalmask"] = mask
		}
		return map[string]any{
			"tag": tag, "protocol": "vless", "streamSettings": stream,
			"settings": map[string]any{"vnext": []any{map[string]any{
				"address": "1.1.1.1", "port": 443, "users": []any{map[string]any{"id": "00000000-0000-0000-0000-000000000001", "encryption": "none"}},
			}}},
		}
	}
	fragment := func(length, delay string) map[string]any {
		return map[string]any{"tcp": []any{map[string]any{"type": "fragment", "settings": map[string]any{"packets": "tlshello", "length": length, "delay": delay}}}}
	}
	for _, tc := range []struct {
		name      string
		outbounds []any
		want      []string
		pinned    bool
	}{
		{name: "public plaintext restriction", pinned: true, outbounds: []any{makeOutbound("plaintext", "none", nil)}, want: []string{"plaintext"}},
		{name: "two invalid native masks", outbounds: []any{makeOutbound("bad-length", "tls", fragment("invalid", "1")), makeOutbound("bad-delay", "tls", fragment("120", "invalid")), makeOutbound("valid-native", "tls", fragment("120", "1"))}, want: []string{"bad-length", "bad-delay"}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if tc.pinned && !strings.HasPrefix(string(version), "Xray 26.10.31 ") {
				t.Skip("plaintext restriction fixture is pinned to Xray 26.10.31")
			}
			dir := t.TempDir()
			state := &serverState{cfg: appConfig{DataDir: dir}}
			cfg := map[string]any{
				"log": map[string]any{"loglevel": "warning"}, "inbounds": []any{}, "outbounds": tc.outbounds,
				"routing": map[string]any{"rules": []any{map[string]any{"type": "field", "domain": []any{"example.test"}, "outboundTag": tc.want[0]}}},
			}
			before := transportJSON(cfg)
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			first := state.testXrayConfig(ctx, cfg)
			if first["ok"] != false {
				t.Fatalf("real core unexpectedly accepted invalid fixture: %v", first)
			}
			beforeResult := transportJSON(first)
			errors, complete := collectXrayOutboundErrors(ctx, cfg, first, state.testXrayConfig)
			if !complete || len(errors) != len(tc.want) {
				t.Fatalf("real diagnostics incomplete: errors=%v complete=%t first=%v", errors, complete, first)
			}
			for index, tag := range tc.want {
				if errors[index]["tag"] != tag || errors[index]["source"] != "xray" || stringsTrim(errors[index]["message"]) == "" {
					t.Fatalf("real core error was not assigned to its outbound: %v", errors)
				}
			}
			if tc.pinned && !strings.Contains(stringsTrim(errors[0]["message"]), "vless without TLS or other encryption is prohibited") {
				t.Fatalf("fixture hit a different real restriction: %v", errors)
			}
			if transportJSON(cfg) != before || transportJSON(first) != beforeResult {
				t.Fatal("real diagnostic checks mutated config or primary core result")
			}
			files, err := filepath.Glob(filepath.Join(dir, ".test-*"))
			if err != nil || len(files) != 0 {
				t.Fatalf("real validation left temporary configs: %v %v", files, err)
			}
		})
	}
}
