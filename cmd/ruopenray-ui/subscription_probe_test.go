package main

import (
	"errors"
	"fmt"
	"strings"
	"sync"
	"testing"
)

func TestSubscriptionProbeFallback(t *testing.T) {
	calls := 0
	latency, ok, attempts, err := runSubscriptionProbes([]string{"https://first.test/secret", "https://second.test/"}, func(target string) (int64, bool, error) {
		calls++
		if calls == 1 {
			return 0, false, errors.New("deadline exceeded")
		}
		return 0, true, nil
	})
	if !ok || err != nil || latency != 0 || calls != 2 || attempts[0].Code != "timeout" || !attempts[1].OK {
		t.Fatalf("fallback: %v %v %v", ok, attempts, err)
	}
	calls = 0
	_, ok, attempts, _ = runSubscriptionProbes([]string{"https://first.test", "https://second.test"}, func(string) (int64, bool, error) { calls++; return 1, true, nil })
	if !ok || calls != 1 || len(attempts) != 1 {
		t.Fatal("successful first target should finish without unnecessary probes")
	}
}

func TestSubscriptionProbeFailureClassification(t *testing.T) {
	for _, item := range []struct{ raw, code string }{
		{"lookup server: no such host", "dns"}, {"x509: certificate is valid for other name", "tls"},
		{"invalid user", "auth"}, {"context deadline exceeded", "timeout"}, {"connection refused", "connect"},
		{"HTTP status 403", "http"}, {"EOF", "tunnel"}, {"i/o timeout: x509: certificate unknown", "tls"},
	} {
		t.Run(item.code+item.raw, func(t *testing.T) {
			code, _ := subscriptionProbeFailure(errors.New(item.raw))
			if code != item.code {
				t.Fatalf("got %s want %s", code, item.code)
			}
		})
	}
}

func TestSubscriptionProbeFailureRedaction(t *testing.T) {
	_, ok, results, err := runSubscriptionProbes([]string{"https://user:secret@first.test/private-token?key=secret", "https://second.test"}, func(string) (int64, bool, error) {
		return 0, false, errors.New("x509: certificate failed with UUID=secret")
	})
	if ok || err == nil || subscriptionProbeCode(err) != "tls" {
		t.Fatalf("%v %v", ok, err)
	}
	body := fmt.Sprint(results, err)
	for _, secret := range []string{"secret", "private-token", "UUID="} {
		if strings.Contains(body, secret) {
			t.Fatal("private material in result")
		}
	}
	if len(subscriptionProbeTargets("")) != 2 || len(subscriptionProbeTargets("https://custom.test")) != 1 {
		t.Fatal("default/custom target selection")
	}
}

func TestProbeLogBufferConcurrentAndBounded(t *testing.T) {
	var buffer probeLogBuffer
	var workers sync.WaitGroup
	for i := 0; i < 4; i++ {
		workers.Add(1)
		go func() {
			defer workers.Done()
			for j := 0; j < 50; j++ {
				_, _ = buffer.Write([]byte(strings.Repeat("x", 1024)))
				_ = buffer.String()
			}
		}()
	}
	workers.Wait()
	if len(buffer.String()) != 32768 {
		t.Fatal("unbounded buffer")
	}
}
