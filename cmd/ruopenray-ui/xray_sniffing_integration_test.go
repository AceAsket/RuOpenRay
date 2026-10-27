package main

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"
)

func TestXraySniffingExclusions(t *testing.T) {
	binary := os.Getenv("RUOPENRAY_TEST_XRAY")
	if binary == "" {
		t.Skip("set RUOPENRAY_TEST_XRAY")
	}
	origin := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(204) }))
	defer origin.Close()
	roots := x509.NewCertPool()
	roots.AddCert(origin.Certificate())
	_, originPort, _ := net.SplitHostPort(origin.Listener.Addr().String())
	for _, scenario := range []struct {
		name     string
		excluded []string
		clean    bool
	}{
		{"legacy-blank", []string{""}, false},
		{"empty-list", []string{}, false},
		{"normalized-blank", []string{"", " \t"}, true},
		{"intentional-exclusion", []string{"example.com"}, false},
		{"normalized-intentional-exclusion", []string{"", "example.com"}, true},
	} {
		t.Run(scenario.name, func(t *testing.T) {
			port, err := freeLocalPort()
			if err != nil {
				t.Fatal(err)
			}
			cfg := map[string]any{
				"log": map[string]any{"loglevel": "warning"},
				"inbounds": []any{map[string]any{"listen": "127.0.0.1", "port": port, "protocol": "dokodemo-door",
					"settings": map[string]any{"address": "127.0.0.1", "port": number(originPort, 0), "network": "tcp"},
					"sniffing": map[string]any{"enabled": true, "destOverride": []string{"tls"}, "domainsExcluded": scenario.excluded}}},
				"outbounds": []any{
					map[string]any{"tag": "missed-domain", "protocol": "blackhole"},
					map[string]any{"tag": "matched-domain", "protocol": "freedom", "settings": map[string]any{
						"redirect": origin.Listener.Addr().String(), "finalRules": []any{map[string]any{"action": "allow", "ip": []string{"127.0.0.1/32"}}}}},
				},
				"routing": map[string]any{"rules": []any{map[string]any{"type": "field", "domain": []string{"full:example.com"}, "outboundTag": "matched-domain"}}},
			}
			if scenario.clean {
				normalizeSniffingDomainExclusions(cfg)
			}
			startCompatibilityCore(t, binary, cfg, port)
			transport := &http.Transport{
				Proxy: nil, DisableKeepAlives: true,
				TLSClientConfig: &tls.Config{RootCAs: roots, ServerName: "example.com", MinVersion: tls.VersionTLS12},
				DialContext: func(ctx context.Context, network, address string) (net.Conn, error) {
					return (&net.Dialer{}).DialContext(ctx, "tcp", fmt.Sprintf("127.0.0.1:%d", port))
				},
			}
			defer transport.CloseIdleConnections()
			client := &http.Client{Transport: transport, Timeout: 2 * time.Second}
			response, err := client.Get("https://example.com/")
			matched := err == nil && response.StatusCode == 204
			if response != nil {
				_ = response.Body.Close()
			}
			t.Logf("domain route matched=%v, error=%v", matched, err)
			if (scenario.name == "empty-list" || scenario.name == "normalized-blank") && !matched {
				t.Fatal("TLS SNI did not reach the domain rule with no exclusions")
			}
			if (scenario.name == "intentional-exclusion" || scenario.name == "normalized-intentional-exclusion") && matched {
				t.Fatal("intentional domain exclusion was ignored")
			}
		})
	}
}
