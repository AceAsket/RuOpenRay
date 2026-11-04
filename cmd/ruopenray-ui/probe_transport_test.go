package main

import (
	"bytes"
	"context"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestIsolatedProbeKeepsNativeMaskAndCustomDependencyChain(t *testing.T) {
	dir := t.TempDir()
	s := &serverState{cfg: appConfig{DataDir: dir, ActiveConfig: filepath.Join(dir, "config.json")}}
	selected := map[string]any{"tag": "proxy", "streamSettings": map[string]any{"finalmask": nativeSubscriptionMask()}}
	if outs, err := s.isolatedProbeOutbounds(selected); err != nil || len(outs) != 1 || transportJSON(outs[0]) != transportJSON(selected) {
		t.Fatalf("native-only probe needed a companion or active config: %s %v", transportJSON(outs), err)
	}
	mapValue(selected["streamSettings"])["sockopt"] = map[string]any{"dialerProxy": "hop"}
	hop := map[string]any{"tag": "hop", "proxySettings": map[string]any{"tag": "exit"}}
	exit := map[string]any{"tag": "exit", "protocol": "freedom"}
	if err := s.writeActiveConfigRaw(map[string]any{"outbounds": []any{selected, hop, exit, map[string]any{"tag": "unrelated", "protocol": "freedom"}}}); err != nil {
		t.Fatal(err)
	}
	outs, err := s.isolatedProbeOutbounds(selected)
	if err != nil || len(outs) != 3 || mapValue(outs[1])["tag"] != "hop" || mapValue(outs[2])["tag"] != "exit" {
		t.Fatalf("native probe lost custom dependency chain: %s %v", transportJSON(outs), err)
	}
	if transportJSON(mapValue(mapValue(outs[0])["streamSettings"])["finalmask"]) != transportJSON(nativeSubscriptionMask()) {
		t.Fatal("dependency expansion changed finalmask")
	}
	// Runtime health passes an explicit captured list. An incomplete captured
	// list must fail instead of borrowing a later active config's dependencies.
	if _, _, err := s.httpOutboundProbeStatusWithConfig(selected, []any{}, "https://example.invalid", 1000, 1, true); err == nil || !strings.Contains(err.Error(), "зависимый выход") {
		t.Fatalf("explicit health snapshot was ignored: %v", err)
	}
}

func TestIsolatedProbesRejectMissingCustomDialerBeforeLaunchingXray(t *testing.T) {
	dir := t.TempDir()
	s := &serverState{cfg: appConfig{DataDir: dir, ActiveConfig: filepath.Join(dir, "missing.json")}}
	selected := map[string]any{"tag": "proxy", "streamSettings": map[string]any{"finalmask": nativeSubscriptionMask(), "sockopt": map[string]any{"dialerProxy": "missing-hop"}}}
	if _, _, err := s.httpOutboundProbeStatus(selected, "https://example.invalid", 1000, 1, true); err == nil || !strings.Contains(err.Error(), "зависимый выход") {
		t.Fatalf("HTTP probe silently ignored custom dialer: %v", err)
	}
	if result := s.httpOutboundReadProbe(selected, "https://example.invalid", 1000, 1024); result["ok"] != false || !strings.Contains(stringsTrim(result["error"]), "зависимый выход") {
		t.Fatalf("read probe silently ignored custom dialer: %v", result)
	}
	if result := s.withOutboundHTTPProbeClient(selected, 1000, func(*http.Client, *bytes.Buffer) map[string]any {
		t.Fatal("probe task ran without the configured custom dialer")
		return nil
	}); result["ok"] != false || !strings.Contains(stringsTrim(result["error"]), "зависимый выход") {
		t.Fatalf("HTTP client probe silently ignored custom dialer: %v", result)
	}
	if _, _, err := s.tcpOutboundProbe(selected, "example.invalid", "443", 1000, 1); err == nil || !strings.Contains(err.Error(), "зависимый выход") {
		t.Fatalf("TCP probe silently ignored custom dialer: %v", err)
	}
	results := s.tlsStabilityOutbound(context.Background(), selected, nil, func(*url.URL) []map[string]any {
		t.Fatal("TLS probe task ran without the configured custom dialer")
		return nil
	})
	if len(results) != 1 || results[0]["code"] != "setup" || !strings.Contains(stringsTrim(results[0]["error"]), "зависимый выход") {
		t.Fatalf("TLS probe silently ignored custom dialer: %v", results)
	}
	if _, err := os.Stat(filepath.Join(dir, "checks")); !os.IsNotExist(err) {
		t.Fatalf("failed dependency validation created probe files: %v", err)
	}
}
