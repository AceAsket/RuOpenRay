package main

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"
)

// Domain routing and the address ultimately dialed are separate decisions.
// Keep this covered without relying on a public CDN or a particular DNS reply.
func TestXraySniffingDestinations(t *testing.T) {
	binary := os.Getenv("RUOPENRAY_TEST_XRAY")
	if binary == "" {
		t.Skip("set RUOPENRAY_TEST_XRAY")
	}
	for _, protocol := range []string{"http", "tls"} {
		for _, routeOnly := range []bool{false, true} {
			t.Run(fmt.Sprintf("%s/routeOnly=%t", protocol, routeOnly), func(t *testing.T) {
				original := httptest.NewUnstartedServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
					_, _ = io.WriteString(w, "original-ip")
				}))
				defer original.Close()
				_, destinationPort, _ := net.SplitHostPort(original.Listener.Addr().String())
				resolved := httptest.NewUnstartedServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
					_, _ = io.WriteString(w, "dns-ip")
				}))
				_ = resolved.Listener.Close()
				var err error
				resolved.Listener, err = net.Listen("tcp", net.JoinHostPort("127.0.0.2", destinationPort))
				if err != nil {
					t.Fatal(err)
				}
				defer resolved.Close()
				scheme := "http"
				if protocol == "tls" {
					original.StartTLS()
					resolved.StartTLS()
					scheme = "https"
				} else {
					original.Start()
					resolved.Start()
				}
				port, err := freeLocalPort()
				if err != nil {
					t.Fatal(err)
				}
				cfg := map[string]any{
					"log": map[string]any{"loglevel": "warning"},
					"dns": map[string]any{"hosts": map[string]any{"example.com": "127.0.0.2"}, "servers": []any{}, "queryStrategy": "UseIPv4"},
					"inbounds": []any{map[string]any{
						"listen": "127.0.0.1", "port": port, "protocol": "dokodemo-door",
						"settings": map[string]any{"address": "127.0.0.1", "port": number(destinationPort, 0), "network": "tcp"},
						"sniffing": map[string]any{"enabled": true, "destOverride": []string{protocol}, "routeOnly": routeOnly},
					}},
					"outbounds": []any{
						map[string]any{"tag": "missed-domain", "protocol": "blackhole"},
						map[string]any{"tag": "matched-domain", "protocol": "freedom", "settings": map[string]any{
							"domainStrategy": "UseIP", "finalRules": []any{map[string]any{"action": "allow", "ip": []string{"127.0.0.1/32", "127.0.0.2/32"}}},
						}},
					},
					"routing": map[string]any{"rules": []any{map[string]any{"type": "field", "domain": []string{"full:example.com"}, "outboundTag": "matched-domain"}}},
				}
				startCompatibilityCore(t, binary, cfg, port)
				transport := &http.Transport{
					Proxy: nil, DisableKeepAlives: true,
					DialContext: func(ctx context.Context, network, address string) (net.Conn, error) {
						return (&net.Dialer{}).DialContext(ctx, "tcp", fmt.Sprintf("127.0.0.1:%d", port))
					},
				}
				if protocol == "tls" {
					roots := x509.NewCertPool()
					roots.AddCert(original.Certificate())
					roots.AddCert(resolved.Certificate())
					transport.TLSClientConfig = &tls.Config{RootCAs: roots, ServerName: "example.com", MinVersion: tls.VersionTLS12}
				}
				defer transport.CloseIdleConnections()
				client := &http.Client{Transport: transport, Timeout: 3 * time.Second}
				response, err := client.Get(scheme + "://example.com:" + destinationPort + "/")
				if err != nil {
					t.Fatal(err)
				}
				defer response.Body.Close()
				body, err := io.ReadAll(io.LimitReader(response.Body, 64))
				want := "dns-ip"
				if routeOnly {
					want = "original-ip"
				}
				if err != nil || response.StatusCode != 200 || string(body) != want {
					t.Fatalf("status=%d body=%q error=%v; want %q", response.StatusCode, body, err, want)
				}
			})
		}
	}
}
