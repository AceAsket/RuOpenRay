package main

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
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
	if result["phase"] != "body" || result["timings"].(map[string]int64)["firstByteMs"] < 0 {
		t.Fatalf("missing transfer phase/timing: %#v", result)
	}
}

func TestTLSStabilityIdentifiesHandshakeCancellation(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()
	received := make(chan struct{})
	release := make(chan struct{})
	defer close(release)
	go func() {
		conn, err := listener.Accept()
		if err != nil {
			return
		}
		defer conn.Close()
		var b [1]byte
		if _, err := io.ReadFull(conn, b[:]); err == nil {
			close(received)
		}
		<-release
	}()
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	client := &http.Client{Transport: &http.Transport{Proxy: nil}}
	defer client.CloseIdleConnections()
	done := make(chan map[string]any, 1)
	go func() { done <- tlsStabilitySample(ctx, client, "https://"+listener.Addr().String()) }()
	select {
	case <-received:
		cancel()
	case <-ctx.Done():
		t.Fatal("TLS client did not send ClientHello")
	}
	result := <-done
	timings := result["timings"].(map[string]int64)
	_, tlsStarted := timings["tlsStartMs"]
	if result["ok"] != false || result["phase"] != "tls" || result["code"] != "cancelled" || !tlsStarted {
		t.Fatalf("lost TLS failure phase: %#v", result)
	}
}

func TestTLSStabilityIdentifiesWaitingForHeaders(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		cancel()
		<-r.Context().Done()
	}))
	defer server.Close()
	result := tlsStabilitySample(ctx, server.Client(), server.URL)
	if result["phase"] != "headers" || result["code"] != "cancelled" {
		t.Fatalf("header wait misclassified: %#v", result)
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
	if trusted["phase"] != "complete" {
		t.Fatalf("complete phase missing: %#v", trusted)
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

func TestTLSStabilityRemovesOnlyFragmentAndEmptyKnownContainers(t *testing.T) {
	for _, tc := range []struct {
		name, original, want string
		changed              bool
	}{
		{"native only", `{"tag":"proxy","streamSettings":{"finalmask":{"tcp":[{"type":"fragment","settings":{"length":"100-200"}}]}}}`, `{"tag":"proxy"}`, true},
		{"legacy only", `{"tag":"proxy","streamSettings":{"sockopt":{"dialerProxy":"ruopenray-fragment-test"}}}`, `{"tag":"proxy"}`, true},
		{"custom chain and other masks", `{"tag":"proxy","streamSettings":{"network":"tcp","sockopt":{"dialerProxy":"custom-hop","mark":128},"finalmask":{"tcp":[{"type":"fragment"},{"type":"custom","settings":{"x":1}},{"type":"fragment"}],"udp":[{"type":"noise"}],"future":{"x":2}}}}`, `{"tag":"proxy","streamSettings":{"network":"tcp","sockopt":{"dialerProxy":"custom-hop","mark":128},"finalmask":{"tcp":[{"type":"custom","settings":{"x":1}}],"udp":[{"type":"noise"}],"future":{"x":2}}}}`, true},
		{"both with socket options", `{"tag":"proxy","streamSettings":{"sockopt":{"dialerProxy":"ruopenray-fragment-test","mark":128},"finalmask":{"tcp":[{"type":"fragment"}],"udp":[{"type":"noise"}]}}}`, `{"tag":"proxy","streamSettings":{"sockopt":{"mark":128},"finalmask":{"udp":[{"type":"noise"}]}}}`, true},
		{"custom only", `{"tag":"proxy","streamSettings":{"sockopt":{"dialerProxy":"custom-hop"},"finalmask":{"tcp":[{"type":"custom"}]}}}`, `{"tag":"proxy","streamSettings":{"sockopt":{"dialerProxy":"custom-hop"},"finalmask":{"tcp":[{"type":"custom"}]}}}`, false},
		{"custom invalid reserved suffix", `{"tag":"proxy","streamSettings":{"sockopt":{"dialerProxy":"ruopenray-fragment-!"},"finalmask":{"tcp":[{"type":"fragment"}],"udp":[{"type":"custom"}]}}}`, `{"tag":"proxy","streamSettings":{"sockopt":{"dialerProxy":"ruopenray-fragment-!"},"finalmask":{"udp":[{"type":"custom"}]}}}`, true},
		{"unknown tcp shape", `{"tag":"proxy","streamSettings":{"finalmask":{"tcp":{"future":true}}}}`, `{"tag":"proxy","streamSettings":{"finalmask":{"tcp":{"future":true}}}}`, false},
		{"existing empty containers", `{"tag":"proxy","streamSettings":{"sockopt":{},"finalmask":{"tcp":[]}}}`, `{"tag":"proxy","streamSettings":{"sockopt":{},"finalmask":{"tcp":[]}}}`, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var original, want map[string]any
			if err := json.Unmarshal([]byte(tc.original), &original); err != nil {
				t.Fatal(err)
			}
			if err := json.Unmarshal([]byte(tc.want), &want); err != nil {
				t.Fatal(err)
			}
			before := transportJSON(original)
			clone, changed := withoutTLSFragment(original)
			if changed != tc.changed || transportJSON(clone) != transportJSON(want) {
				t.Fatalf("variant=%s changed=%t, want %s changed=%t", transportJSON(clone), changed, transportJSON(want), tc.changed)
			}
			mapValue(clone["streamSettings"])["mutated-clone"] = true
			if transportJSON(original) != before {
				t.Fatal("diagnostic clone changed the active outbound")
			}
		})
	}
}
