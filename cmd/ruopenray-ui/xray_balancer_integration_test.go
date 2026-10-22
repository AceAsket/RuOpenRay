package main

import (
	"bufio"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"strconv"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

// Controlled HTTP proxies let the real core discover failures without depending
// on public sites, DNS, credentials, or the router's active configuration.
func TestXrayBalancerRecovery(t *testing.T) {
	binary := os.Getenv("RUOPENRAY_TEST_XRAY")
	if binary == "" {
		t.Skip("set RUOPENRAY_TEST_XRAY")
	}
	for _, scenario := range []string{"failover", "random", "roundRobin", "leastPing", "leastLoad", "leastLoad-burst"} {
		t.Run(scenario, func(t *testing.T) {
			strategy := strings.TrimSuffix(scenario, "-burst")
			burst := strings.HasSuffix(scenario, "-burst")
			var primaryDown, backupDown atomic.Bool
			var primaryProbes, backupProbes atomic.Int32
			proxy := func(name string, down *atomic.Bool, probes *atomic.Int32) *httptest.Server {
				server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
					conn, rw, err := w.(http.Hijacker).Hijack()
					if err != nil {
						return
					}
					defer conn.Close()
					_ = conn.SetDeadline(time.Now().Add(2 * time.Second))
					if down.Load() {
						return
					}
					if r.Method == http.MethodConnect {
						_, _ = rw.WriteString("HTTP/1.1 200 Connection Established\r\n\r\n")
						_ = rw.Flush()
						r, err = http.ReadRequest(bufio.NewReader(rw))
						if err != nil {
							return
						}
					}
					if r.URL.Path == "/probe" {
						if name == "backup" {
							time.Sleep(25 * time.Millisecond)
						}
						_, _ = rw.WriteString("HTTP/1.1 204 No Content\r\nConnection: close\r\n\r\n")
						_ = rw.Flush()
						probes.Add(1)
						return
					}
					_, _ = fmt.Fprintf(rw, "HTTP/1.1 200 OK\r\nConnection: close\r\nContent-Length: %d\r\n\r\n%s", len(name), name)
					_ = rw.Flush()
				}))
				t.Cleanup(server.Close)
				return server
			}
			primary, backup, leak := proxy("primary", &primaryDown, &primaryProbes), proxy("backup", &backupDown, &backupProbes), proxy("LEAK", &atomic.Bool{}, &atomic.Int32{})
			outbound := func(tag string, server *httptest.Server) map[string]any {
				u, _ := url.Parse(server.URL)
				port, _ := strconv.Atoi(u.Port())
				return map[string]any{"tag": tag, "protocol": "http", "settings": map[string]any{"servers": []any{map[string]any{"address": u.Hostname(), "port": port}}}}
			}
			port, err := freeLocalPort()
			if err != nil {
				t.Fatal(err)
			}
			balancer := map[string]any{"tag": "vpn", "selector": []string{"primary", "backup"}, "strategy": map[string]any{"type": strategy}, "fallbackTag": "block"}
			if strategy == "failover" {
				balancer["selector"] = []string{"primary"}
				balancer["strategy"] = map[string]any{"type": "leastPing"}
				balancer["fallbackTag"] = "backup"
			}
			if strategy == "leastLoad" {
				balancer["strategy"] = map[string]any{"type": strategy, "settings": map[string]any{"expected": 2}}
			}
			cfg := map[string]any{
				"log":         map[string]any{"loglevel": "warning"},
				"inbounds":    []any{map[string]any{"listen": "127.0.0.1", "port": port, "protocol": "http"}},
				"outbounds":   []any{outbound("default-leak", leak), outbound("primary", primary), outbound("backup", backup), map[string]any{"tag": "block", "protocol": "blackhole"}},
				"routing":     map[string]any{"balancers": []any{balancer}, "rules": []any{map[string]any{"type": "field", "network": "tcp,udp", "balancerTag": "vpn"}}},
				"observatory": map[string]any{"subjectSelector": []string{"primary", "backup"}, "probeURL": "http://probe.example.test/probe", "probeInterval": "1s", "enableConcurrency": true},
			}
			if burst {
				delete(cfg, "observatory")
				cfg["burstObservatory"] = map[string]any{"subjectSelector": []string{"primary", "backup"}, "pingConfig": map[string]any{
					"destination": "http://probe.example.test/probe", "interval": "10s", "sampling": 1, "timeout": "500ms", "httpMethod": "HEAD",
				}}
			}
			startCompatibilityCore(t, binary, cfg, port)
			proxyURL, _ := url.Parse(fmt.Sprintf("http://127.0.0.1:%d", port))
			transport := &http.Transport{Proxy: http.ProxyURL(proxyURL), DisableKeepAlives: true}
			defer transport.CloseIdleConnections()
			client := &http.Client{Transport: transport, Timeout: time.Second}
			request := func() string {
				resp, err := client.Get("http://traffic.example.test/traffic")
				if err != nil {
					return ""
				}
				defer resp.Body.Close()
				body, _ := io.ReadAll(io.LimitReader(resp.Body, 128))
				if string(body) == "LEAK" {
					t.Fatal("balancer leaked through the default outbound")
				}
				return string(body)
			}
			wait := func(want string) {
				t.Helper()
				timeout := 12 * time.Second
				if burst {
					timeout = 35 * time.Second
				}
				deadline, consecutive := time.Now().Add(timeout), 0
				for time.Now().Before(deadline) {
					if request() == want {
						consecutive++
						if consecutive == 5 {
							return
						}
					} else {
						consecutive = 0
					}
					time.Sleep(50 * time.Millisecond)
				}
				t.Fatalf("did not converge to %q", want)
			}
			if strategy == "failover" || strategy == "leastPing" {
				wait("primary")
			} else {
				deadline := time.Now().Add(35 * time.Second)
				for primaryProbes.Load() == 0 || backupProbes.Load() == 0 {
					if time.Now().After(deadline) {
						t.Fatal("observer did not probe both members")
					}
					time.Sleep(50 * time.Millisecond)
				}
				time.Sleep(100 * time.Millisecond)
				seen := map[string]bool{}
				for i := 0; i < 100; i++ {
					seen[request()] = true
				}
				if !seen["primary"] || !seen["backup"] || seen[""] {
					t.Fatalf("distribution: %v", seen)
				}
			}
			primaryDown.Store(true)
			wait("backup")
			for i := 0; i < 12; i++ {
				if got := request(); got != "backup" {
					t.Fatalf("dead primary selected: %q", got)
				}
			}
			backupDown.Store(true)
			wait("")
			primaryDown.Store(false)
			wait("primary")
			if strategy == "failover" {
				backupDown.Store(false)
				time.Sleep(1200 * time.Millisecond)
				wait("primary") // automatic failback even when both are healthy
			}
		})
	}
}
