package main

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"math/big"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	rproxy "github.com/AceAsket/RuOpenRay/internal/proxy"
)

// Opt in with RUOPENRAY_TEST_XRAY pointing to a real xray executable.
// All traffic stays on loopback; the proxy port has no HTTP site or fallback.
func TestTLSSubscriptionTunnelProbe(t *testing.T) {
	binary := os.Getenv("RUOPENRAY_TEST_XRAY")
	if binary == "" {
		t.Skip("set RUOPENRAY_TEST_XRAY to run real Xray tunnel tests")
	}
	t.Setenv("PATH", filepath.Dir(binary)+string(os.PathListSeparator)+os.Getenv("PATH"))
	dir := t.TempDir()
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	template := &x509.Certificate{SerialNumber: big.NewInt(1), Subject: pkix.Name{CommonName: "proxy.example.test"}, DNSNames: []string{"proxy.example.test"}, NotBefore: time.Now().Add(-time.Hour), NotAfter: time.Now().Add(time.Hour), KeyUsage: x509.KeyUsageDigitalSignature | x509.KeyUsageCertSign, ExtKeyUsage: []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth}, IsCA: true, BasicConstraintsValid: true}
	cert, err := x509.CreateCertificate(rand.Reader, template, template, &key.PublicKey, key)
	if err != nil {
		t.Fatal(err)
	}
	keyDER, err := x509.MarshalECPrivateKey(key)
	if err != nil {
		t.Fatal(err)
	}
	certFile, keyFile := filepath.Join(dir, "cert.pem"), filepath.Join(dir, "key.pem")
	if err = os.WriteFile(certFile, pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: cert}), 0600); err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(keyFile, pem.EncodeToMemory(&pem.Block{Type: "EC PRIVATE KEY", Bytes: keyDER}), 0600); err != nil {
		t.Fatal(err)
	}
	origin := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusNoContent) }))
	defer origin.Close()
	version, err := exec.Command(binary, "version").Output()
	if err != nil {
		t.Fatal(err)
	}
	for _, transport := range []struct {
		protocol, network string
		allowLAN          bool
	}{{"vless", "grpc", true}, {"trojan", "tcp", true}, {"vless", "ws", true}, {"vless", "xhttp", true}, {"vless", "tcp", false}} {
		protocol, network := transport.protocol, transport.network
		t.Run(protocol+"-"+network, func(t *testing.T) {
			port, err := freeLocalPort()
			if err != nil {
				t.Fatal(err)
			}
			credential := "00000000-0000-0000-0000-000000000000"
			settings := map[string]any{"clients": []any{map[string]any{"id": credential}}, "decryption": "none"}
			if protocol == "trojan" {
				credential = "test-password"
				network = "tcp"
				settings = map[string]any{"clients": []any{map[string]any{"password": credential}}}
			}
			stream := map[string]any{"network": network, "security": "tls", "tlsSettings": map[string]any{"certificates": []any{map[string]any{"certificateFile": certFile, "keyFile": keyFile}}, "alpn": []string{"h2", "http/1.1"}}}
			if network == "grpc" {
				stream["grpcSettings"] = map[string]any{"serviceName": "test-service"}
			}
			if network == "ws" {
				stream["wsSettings"] = map[string]any{"path": "/test"}
			}
			if network == "xhttp" {
				stream["xhttpSettings"] = map[string]any{"path": "/test", "mode": "stream-one"}
			}
			config := map[string]any{"log": map[string]any{"loglevel": "warning"}, "inbounds": []any{map[string]any{"listen": "127.0.0.1", "port": port, "protocol": protocol, "settings": settings, "streamSettings": stream}}, "outbounds": []any{map[string]any{"protocol": "freedom", "settings": map[string]any{"finalRules": []any{map[string]any{"action": "allow", "ip": []string{"127.0.0.1/32"}}}}}}}
			if !transport.allowLAN {
				config["outbounds"] = []any{map[string]any{"protocol": "freedom"}}
			}
			data, err := json.Marshal(config)
			if err != nil {
				t.Fatal(err)
			}
			configFile := filepath.Join(dir, protocol+".json")
			if err = os.WriteFile(configFile, data, 0600); err != nil {
				t.Fatal(err)
			}
			logFile, err := os.CreateTemp(dir, "xray-log-")
			if err != nil {
				t.Fatal(err)
			}
			defer logFile.Close()
			cmd := exec.Command(binary, "run", "-config", configFile)
			cmd.Stdout = logFile
			cmd.Stderr = logFile
			if err = cmd.Start(); err != nil {
				t.Fatal(err)
			}
			defer func() { _ = cmd.Process.Kill(); _ = cmd.Wait() }()
			if err = waitTCPPort("127.0.0.1", port, 5000); err != nil {
				log, _ := os.ReadFile(logFile.Name())
				t.Fatalf("start: %v; %s", err, log)
			}
			link := fmt.Sprintf("%s://%s@127.0.0.1:%d?security=tls&type=%s&sni=proxy.example.test&serviceName=test-service&path=%%2Ftest&mode=stream-one", protocol, credential, port, network)
			outbound, err := rproxy.ParseShareLink(link)
			if err != nil {
				t.Fatal(err)
			}
			tls := outbound["streamSettings"].(map[string]any)["tlsSettings"].(map[string]any)
			// Trust only this generated test CA, keeping SNI/hostname validation enabled.
			tls["disableSystemRoot"] = true
			tls["certificates"] = []any{map[string]any{"certificateFile": certFile, "usage": "verify"}}
			s := &serverState{cfg: appConfig{DataDir: dir}}
			latency, ok, err := s.httpOutboundProbe(outbound, origin.URL, 3000, 1)
			if !transport.allowLAN && strings.Contains(string(version), "26.9.9") {
				if ok {
					t.Fatal("remote VLESS inbound must not reach private addresses without explicit finalRules")
				}
				return
			}
			if !ok || err != nil {
				log, _ := os.ReadFile(logFile.Name())
				t.Fatalf("tunnel failed: ok=%v latency=%d err=%v; SERVER %s", ok, latency, err, log)
			}
			if latency < 0 {
				t.Fatalf("invalid latency: %d", latency)
			}
			wrongCert := rproxy.CloneOutboundWithTag(outbound, "wrong-certificate")
			wrongCert["streamSettings"].(map[string]any)["tlsSettings"].(map[string]any)["serverName"] = "wrong.example.test"
			if _, ok, _ := s.httpOutboundProbe(wrongCert, origin.URL, 700, 1); ok {
				t.Fatal("wrong certificate hostname accepted")
			}
			// A TCP listener alone must not make incorrect proxy credentials pass.
			bad := rproxy.CloneOutboundWithTag(outbound, "bad-credentials")
			if protocol == "trojan" {
				bad["settings"].(map[string]any)["servers"].([]any)[0].(map[string]any)["password"] = "wrong-password"
			} else {
				bad["settings"].(map[string]any)["vnext"].([]any)[0].(map[string]any)["users"].([]any)[0].(map[string]any)["id"] = "11111111-1111-1111-1111-111111111111"
			}
			if _, ok, _ := s.httpOutboundProbe(bad, origin.URL, 700, 1); ok {
				t.Fatal("incorrect credentials must not pass the tunnel check")
			}
		})
	}
}
