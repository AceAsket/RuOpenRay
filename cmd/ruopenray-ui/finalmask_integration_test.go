package main

import (
	"bytes"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/binary"
	"encoding/pem"
	"fmt"
	"io"
	"math/big"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

// Opt in with the same verified binary as the real-tunnel compatibility matrix.
// Checking configuration alone would miss an ignored/misplaced finalmask block.
func TestXrayFinalmaskTLSRecords(t *testing.T) {
	binaryPath := os.Getenv("RUOPENRAY_TEST_XRAY")
	if binaryPath == "" {
		t.Skip("set RUOPENRAY_TEST_XRAY to run real Xray finalmask tests")
	}
	t.Setenv("PATH", filepath.Dir(binaryPath)+string(os.PathListSeparator)+os.Getenv("PATH"))
	dir := t.TempDir()
	certFile, keyFile := finalmaskTestCertificate(t, dir)
	var originRequests atomic.Int32
	origin := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		originRequests.Add(1)
		w.WriteHeader(http.StatusNoContent)
	}))
	defer origin.Close()
	serverPort, err := freeLocalPort()
	if err != nil {
		t.Fatal(err)
	}
	const credential = "00000000-0000-0000-0000-000000000001"
	startCompatibilityCore(t, binaryPath, map[string]any{
		"log": map[string]any{"loglevel": "warning"},
		"inbounds": []any{map[string]any{
			"listen": "127.0.0.1", "port": serverPort, "protocol": "vless",
			"settings": map[string]any{"clients": []any{map[string]any{"id": credential}}, "decryption": "none"},
			"streamSettings": map[string]any{
				"network": "tcp", "security": "tls",
				"tlsSettings": map[string]any{"certificates": []any{map[string]any{"certificateFile": certFile, "keyFile": keyFile}}},
			},
		}},
		"outbounds": []any{map[string]any{
			"protocol": "freedom",
			"settings": map[string]any{"finalRules": []any{map[string]any{"action": "allow", "ip": []string{"127.0.0.1/32"}}}},
		}},
	}, serverPort)

	for _, enabled := range []bool{false, true} {
		name := "off"
		if enabled {
			name = "native-fragment"
		}
		t.Run(name, func(t *testing.T) {
			capturePort, captures := finalmaskCaptureForwarder(t, fmt.Sprintf("127.0.0.1:%d", serverPort))
			stream := map[string]any{
				"network": "tcp", "security": "tls",
				"tlsSettings": map[string]any{
					"serverName": "finalmask.example.test", "fingerprint": "chrome", "disableSystemRoot": true,
					"certificates": []any{map[string]any{"certificateFile": certFile, "usage": "verify"}},
				},
			}
			if enabled {
				stream["finalmask"] = map[string]any{"tcp": []any{map[string]any{
					"type": "fragment", "settings": map[string]any{"packets": "tlshello", "length": "120", "delay": "1"},
				}}}
			}
			outbound := map[string]any{
				"tag": "finalmask-test", "protocol": "vless", "streamSettings": stream,
				"settings": map[string]any{"vnext": []any{map[string]any{
					"address": "127.0.0.1", "port": capturePort,
					"users": []any{map[string]any{"id": credential, "encryption": "none"}},
				}}},
			}
			before := originRequests.Load()
			s := &serverState{cfg: appConfig{DataDir: t.TempDir()}}
			_, ok, err := s.httpOutboundProbeStatus(outbound, origin.URL+"/finalmask", 4000, 1, true)
			if err != nil || !ok || originRequests.Load() <= before {
				t.Fatalf("verified TLS tunnel did not deliver HTTP 204: ok=%v error=%v", ok, err)
			}
			var capture finalmaskHelloCapture
			select {
			case capture = <-captures:
			case <-time.After(2 * time.Second):
				t.Fatal("no ClientHello captured from the real Xray client")
			}
			if capture.err != nil {
				t.Fatal(capture.err)
			}
			if len(capture.hello) < 4 || capture.hello[0] != 1 {
				t.Fatalf("invalid reconstructed ClientHello: %x", capture.hello)
			}
			wantSize := 4 + (int(capture.hello[1]) << 16) + (int(capture.hello[2]) << 8) + int(capture.hello[3])
			if len(capture.hello) != wantSize {
				t.Fatalf("ClientHello size=%d, encoded size=%d", len(capture.hello), wantSize)
			}
			if !enabled {
				if len(capture.recordSizes) != 1 || capture.recordSizes[0] <= 120 {
					t.Fatalf("control ClientHello must be one record larger than 120 bytes: %v", capture.recordSizes)
				}
				return
			}
			if len(capture.recordSizes) < 2 {
				t.Fatalf("native finalmask did not fragment ClientHello: %v", capture.recordSizes)
			}
			for i, size := range capture.recordSizes {
				if size < 1 || size > 120 || (i < len(capture.recordSizes)-1 && size != 120) {
					t.Fatalf("fragment %d size=%d, want 120 except a shorter final record; all sizes=%v", i, size, capture.recordSizes)
				}
			}
			t.Logf("native finalmask delivered HTTP 204; ClientHello TLS record payload sizes: %v", capture.recordSizes)
		})
	}
}

func finalmaskTestCertificate(t *testing.T, dir string) (string, string) {
	t.Helper()
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	template := &x509.Certificate{
		SerialNumber: big.NewInt(1), Subject: pkix.Name{CommonName: "finalmask.example.test"},
		DNSNames: []string{"finalmask.example.test"}, NotBefore: time.Now().Add(-time.Hour), NotAfter: time.Now().Add(time.Hour),
		KeyUsage: x509.KeyUsageDigitalSignature | x509.KeyUsageCertSign, ExtKeyUsage: []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
		IsCA: true, BasicConstraintsValid: true,
	}
	cert, err := x509.CreateCertificate(rand.Reader, template, template, &key.PublicKey, key)
	if err != nil {
		t.Fatal(err)
	}
	keyDER, err := x509.MarshalECPrivateKey(key)
	if err != nil {
		t.Fatal(err)
	}
	certFile, keyFile := filepath.Join(dir, "cert.pem"), filepath.Join(dir, "key.pem")
	if err := os.WriteFile(certFile, pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: cert}), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(keyFile, pem.EncodeToMemory(&pem.Block{Type: "EC PRIVATE KEY", Bytes: keyDER}), 0600); err != nil {
		t.Fatal(err)
	}
	return certFile, keyFile
}

type finalmaskHelloCapture struct {
	recordSizes []int
	hello       []byte
	err         error
}

// Read TLS records, not TCP Read boundaries: kernel packet coalescing must not
// make a working fragment implementation appear disabled (or vice versa).
func finalmaskForwardHello(dst, src net.Conn) finalmaskHelloCapture {
	var result finalmaskHelloCapture
	for len(result.hello) < 4 || len(result.hello) < 4+(int(result.hello[1])<<16)+(int(result.hello[2])<<8)+int(result.hello[3]) {
		var header [5]byte
		if _, result.err = io.ReadFull(src, header[:]); result.err != nil {
			return result
		}
		size := int(binary.BigEndian.Uint16(header[3:]))
		if header[0] != 22 || size == 0 || size > 16384 {
			result.err = fmt.Errorf("unexpected ClientHello record type=%d size=%d", header[0], size)
			return result
		}
		payload := make([]byte, size)
		if _, result.err = io.ReadFull(src, payload); result.err != nil {
			return result
		}
		result.recordSizes = append(result.recordSizes, size)
		result.hello = append(result.hello, payload...)
		if len(result.hello) > 65536 {
			result.err = fmt.Errorf("ClientHello exceeded capture limit")
			return result
		}
		if _, result.err = io.Copy(dst, io.MultiReader(bytes.NewReader(header[:]), bytes.NewReader(payload))); result.err != nil {
			return result
		}
	}
	return result
}

func finalmaskCaptureForwarder(t *testing.T, target string) (int, <-chan finalmaskHelloCapture) {
	t.Helper()
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	captures := make(chan finalmaskHelloCapture, 8)
	var mu sync.Mutex
	var wg sync.WaitGroup
	connections := make(map[net.Conn]bool)
	closed := false
	register := func(conn net.Conn) bool {
		mu.Lock()
		defer mu.Unlock()
		if closed {
			_ = conn.Close()
			return false
		}
		connections[conn] = true
		return true
	}
	forget := func(conn net.Conn) {
		_ = conn.Close()
		mu.Lock()
		delete(connections, conn)
		mu.Unlock()
	}
	wg.Add(1)
	go func() {
		defer wg.Done()
		for {
			client, err := listener.Accept()
			if err != nil {
				return
			}
			if !register(client) {
				return
			}
			wg.Add(1)
			go func() {
				defer wg.Done()
				defer forget(client)
				server, err := net.DialTimeout("tcp", target, 2*time.Second)
				if err != nil {
					select {
					case captures <- finalmaskHelloCapture{err: err}:
					default:
					}
					return
				}
				if !register(server) {
					return
				}
				defer forget(server)
				_ = client.SetDeadline(time.Now().Add(15 * time.Second))
				_ = server.SetDeadline(time.Now().Add(15 * time.Second))
				copied := make(chan struct{})
				go func() {
					_, _ = io.Copy(client, server)
					_ = client.Close()
					close(copied)
				}()
				capture := finalmaskForwardHello(server, client)
				select {
				case captures <- capture:
				default:
				}
				if capture.err == nil {
					_, _ = io.Copy(server, client)
				}
				_ = server.Close()
				<-copied
			}()
		}
	}()
	t.Cleanup(func() {
		_ = listener.Close()
		mu.Lock()
		closed = true
		for conn := range connections {
			_ = conn.Close()
		}
		mu.Unlock()
		wg.Wait()
	})
	return listener.Addr().(*net.TCPAddr).Port, captures
}
