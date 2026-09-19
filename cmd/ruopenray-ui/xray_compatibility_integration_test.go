package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func startCompatibilityCore(t *testing.T, binary string, cfg map[string]any, port int) {
	t.Helper()
	dir := t.TempDir()
	body, err := json.Marshal(cfg)
	if err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(dir, "config.json")
	if err := os.WriteFile(path, body, 0600); err != nil {
		t.Fatal(err)
	}
	output, err := exec.Command(binary, "run", "-test", "-config", path).CombinedOutput()
	if err != nil {
		t.Fatalf("config: %v %s", err, output)
	}
	log, err := os.Create(filepath.Join(dir, "xray.log"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = log.Close() })
	cmd := exec.Command(binary, "run", "-config", path)
	cmd.Stdout = log
	cmd.Stderr = log
	if err := cmd.Start(); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = cmd.Process.Kill(); _ = cmd.Wait() })
	if err := waitTCPPort("127.0.0.1", port, 5000); err != nil {
		t.Fatal(err)
	}
}

func TestXrayCompatibility(t *testing.T) {
	binary := os.Getenv("RUOPENRAY_TEST_XRAY")
	if binary == "" {
		t.Skip("set RUOPENRAY_TEST_XRAY")
	}
	version, err := exec.Command(binary, "version").Output()
	if err != nil {
		t.Fatal(err)
	}
	modern := strings.Contains(string(version), "26.9.9")
	if !modern && !strings.Contains(string(version), "26.3.27") {
		t.Skip("expectations pinned to 26.3.27 and 26.9.9")
	}
	origin := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(204) }))
	defer origin.Close()
	originURL, _ := url.Parse(origin.URL)
	for _, scenario := range []string{"default-lan", "explicit-lan", "dns-sockopt", "dns-legacy", "dokodemo-forward"} {
		t.Run(scenario, func(t *testing.T) {
			port, err := freeLocalPort()
			if err != nil {
				t.Fatal(err)
			}
			freedom := map[string]any{"protocol": "freedom", "settings": map[string]any{}}
			if scenario != "default-lan" {
				freedom["settings"] = map[string]any{"finalRules": []any{map[string]any{"action": "allow", "ip": []string{"127.0.0.1/32"}}}}
			}
			inbound := map[string]any{"listen": "127.0.0.1", "port": port, "protocol": "http"}
			cfg := map[string]any{"inbounds": []any{inbound}, "outbounds": []any{freedom}, "log": map[string]any{"loglevel": "warning"}}
			requestURL := origin.URL
			if strings.HasPrefix(scenario, "dns-") {
				cfg["dns"] = map[string]any{"hosts": map[string]any{"compat.example.test": "127.0.0.1"}, "servers": []string{}, "queryStrategy": "UseIPv4"}
				if scenario == "dns-legacy" {
					freedom["settings"].(map[string]any)["domainStrategy"] = "UseIPv4"
				} else {
					freedom["streamSettings"] = map[string]any{"sockopt": map[string]any{"domainStrategy": "UseIPv4"}}
				}
				requestURL = "http://compat.example.test:" + originURL.Port()
			}
			proxy, _ := url.Parse(fmt.Sprintf("http://127.0.0.1:%d", port))
			transport := &http.Transport{Proxy: http.ProxyURL(proxy)}
			defer transport.CloseIdleConnections()
			if scenario == "dokodemo-forward" {
				inbound["protocol"] = "dokodemo-door"
				inbound["settings"] = map[string]any{"address": "127.0.0.1", "port": number(originURL.Port(), 0), "network": "tcp"}
				transport.Proxy = nil
				requestURL = proxy.String()
			}
			startCompatibilityCore(t, binary, cfg, port)
			client := &http.Client{Transport: transport, Timeout: 2 * time.Second}
			resp, err := client.Get(requestURL)
			ok := err == nil && resp.StatusCode == 204
			if resp != nil {
				_, _ = io.Copy(io.Discard, resp.Body)
				_ = resp.Body.Close()
			}
			want := true // HTTP and dokodemo-door are not subject to the remote-inbound private-IP default.
			if ok != want {
				t.Fatalf("connectivity = %v, want %v; err=%v", ok, want, err)
			}
		})
	}
}
