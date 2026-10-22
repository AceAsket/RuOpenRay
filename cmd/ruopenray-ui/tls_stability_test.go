package main

import (
	"context"
	"crypto/tls"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestTLSStabilityDetectsBrokenBodyAfterHTTP200(t *testing.T) {
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Length", "100")
		_, _ = w.Write([]byte("short"))
	}))
	defer server.Close()
	result := tlsStabilitySample(context.Background(), server.Client(), server.URL)
	if result["ok"] != false || result["status"] != 200 || result["code"] != "transfer" || result["bodyComplete"] != false {
		t.Fatalf("truncated HTTP 200 counted as success: %#v", result)
	}
}

func TestTLSStabilityChecksCertificatesAndNegotiatedVersion(t *testing.T) {
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { _, _ = w.Write([]byte("complete")) }))
	defer server.Close()
	untrusted := &http.Client{Transport: &http.Transport{TLSClientConfig: &tls.Config{MinVersion: tls.VersionTLS12}}}
	result := tlsStabilitySample(context.Background(), untrusted, server.URL)
	untrusted.CloseIdleConnections()
	if result["ok"] != false || result["code"] != "certificate" {
		t.Fatalf("untrusted certificate accepted: %#v", result)
	}
	trusted := tlsStabilitySample(context.Background(), server.Client(), server.URL)
	if trusted["ok"] != true || trusted["certificateVerified"] != true || trusted["bodyComplete"] != true {
		t.Fatalf("trusted complete response failed: %#v", trusted)
	}
}

func TestTLSStabilityFragmentVariantDoesNotMutateOriginal(t *testing.T) {
	original := map[string]any{"streamSettings": map[string]any{"sockopt": map[string]any{"dialerProxy": "ruopenray-fragment-test", "mark": 128}, "finalmask": map[string]any{"tcp": []any{map[string]any{"type": "fragment"}, map[string]any{"type": "other"}}}}}
	clone, changed := withoutTLSFragment(original)
	if !changed || mapValue(mapValue(original["streamSettings"])["sockopt"])["dialerProxy"] != "ruopenray-fragment-test" {
		t.Fatal("active outbound was modified")
	}
	stream := mapValue(clone["streamSettings"])
	if mapValue(stream["sockopt"])["dialerProxy"] != nil || mapValue(stream["sockopt"])["mark"] == nil || len(anySlice(mapValue(stream["finalmask"])["tcp"])) != 1 {
		t.Fatal("variant removed unrelated socket settings or masks")
	}
}
