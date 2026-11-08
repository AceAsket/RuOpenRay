package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"testing"
	"time"
)

// This test runs a separate real core with loopback-only origins and API.
// An already connected TCP stream must stay on blue while new streams go green.
func TestXrayHotRoutingKeepsConnectionsAndRollsBackLostAcknowledgement(t *testing.T) {
	binaryPath := os.Getenv("RUOPENRAY_TEST_XRAY")
	if binaryPath == "" {
		t.Skip("set RUOPENRAY_TEST_XRAY")
	}
	version, err := exec.Command(binaryPath, "version").Output()
	if err != nil {
		t.Fatal(err)
	}
	if !routingHotVersion(string(version)) {
		t.Skip("older cores use the restart path")
	}
	t.Setenv("PATH", filepath.Dir(binaryPath)+string(os.PathListSeparator)+os.Getenv("PATH"))
	origin := func(label string) string {
		listener, err := net.Listen("tcp", "127.0.0.1:0")
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { _ = listener.Close() })
		go func() {
			for {
				conn, err := listener.Accept()
				if err != nil {
					return
				}
				go func() {
					defer conn.Close()
					_ = conn.SetDeadline(time.Now().Add(30 * time.Second))
					scan := bufio.NewScanner(conn)
					for scan.Scan() {
						_, _ = fmt.Fprintf(conn, "%s:%s\n", label, scan.Text())
					}
				}()
			}
		}()
		return listener.Addr().String()
	}
	blue, green := origin("blue"), origin("green")
	proxyPort, err := freeLocalPort()
	if err != nil {
		t.Fatal(err)
	}
	apiPort, err := freeLocalPort()
	if err != nil {
		t.Fatal(err)
	}
	dir := t.TempDir()
	active := filepath.Join(dir, "config.json")
	cfg := map[string]any{"log": map[string]any{"loglevel": "warning"}, "api": map[string]any{"tag": "api", "listen": fmt.Sprintf("127.0.0.1:%d", apiPort), "services": []any{"RoutingService"}},
		"inbounds":  []any{map[string]any{"tag": "proxy", "listen": "127.0.0.1", "port": proxyPort, "protocol": "http"}},
		"outbounds": []any{map[string]any{"tag": "block", "protocol": "blackhole"}, map[string]any{"tag": "blue", "protocol": "freedom", "settings": map[string]any{"redirect": blue}}, map[string]any{"tag": "green", "protocol": "freedom", "settings": map[string]any{"redirect": green}}},
		"routing":   map[string]any{"domainStrategy": "AsIs", "rules": []any{map[string]any{"type": "field", "inboundTag": []any{"proxy"}, "outboundTag": "blue", "ruleTag": "blue-route"}}}}
	body, _ := json.Marshal(cfg)
	if err := os.WriteFile(active, body, 0600); err != nil {
		t.Fatal(err)
	}
	cmd := exec.Command(binaryPath, "run", "-config", active)
	logFile, err := os.Create(filepath.Join(dir, "core.log"))
	if err != nil {
		t.Fatal(err)
	}
	cmd.Stdout, cmd.Stderr = logFile, logFile
	if err := cmd.Start(); err != nil {
		t.Fatal(err)
	}
	exited := make(chan error, 1)
	go func() { exited <- cmd.Wait() }()
	t.Cleanup(func() {
		_ = cmd.Process.Kill()
		select {
		case <-exited:
		case <-time.After(time.Second):
		}
		_ = logFile.Close()
	})
	s := &serverState{cfg: appConfig{DataDir: dir, ActiveConfig: active, BackupDir: filepath.Join(dir, "backups"), ServiceName: "xray"}}
	server := fmt.Sprintf("127.0.0.1:%d", apiPort)
	deadline := time.Now().Add(8 * time.Second)
	for {
		_, err = s.routingList(server)
		if err == nil {
			break
		}
		if time.Now().After(deadline) {
			log, _ := os.ReadFile(logFile.Name())
			t.Fatalf("API not ready: %v %s", err, log)
		}
		time.Sleep(25 * time.Millisecond)
	}
	process := strconv.Itoa(cmd.Process.Pid)
	client := &routingHotClient{process: process, identity: func() (string, error) {
		select {
		case err := <-exited:
			return "", fmt.Errorf("core exited: %v", err)
		default:
			return process, nil
		}
	}, list: func() ([]routingRuntimeRule, error) { return s.routingList(server) }, replace: func(config map[string]any) error { return s.routingReplace(server, config) }}
	connect := func() (net.Conn, *bufio.Reader) {
		t.Helper()
		conn, err := net.DialTimeout("tcp", fmt.Sprintf("127.0.0.1:%d", proxyPort), time.Second)
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { _ = conn.Close() })
		_ = conn.SetDeadline(time.Now().Add(15 * time.Second))
		_, err = fmt.Fprint(conn, "CONNECT target.invalid:443 HTTP/1.1\r\nHost: target.invalid:443\r\n\r\n")
		if err != nil {
			t.Fatal(err)
		}
		reader := bufio.NewReader(conn)
		response, err := http.ReadResponse(reader, &http.Request{Method: http.MethodConnect})
		if err != nil || response.StatusCode != 200 {
			t.Fatalf("CONNECT: %v %#v", err, response)
		}
		return conn, reader
	}
	echo := func(conn net.Conn, reader *bufio.Reader, want string) {
		t.Helper()
		_, err := fmt.Fprintln(conn, "ping")
		if err != nil {
			t.Fatal(err)
		}
		got, err := reader.ReadString('\n')
		if err != nil || strings.TrimSpace(got) != want+":ping" {
			t.Fatalf("echo got %q %v, want %s", got, err, want)
		}
	}
	oldConn, oldReader := connect()
	echo(oldConn, oldReader, "blue")
	backup, err := s.backupActive()
	if err != nil {
		t.Fatal(err)
	}
	var next map[string]any
	_ = json.Unmarshal(body, &next)
	mapValue(anySlice(mapValue(next["routing"])["rules"])[0])["outboundTag"] = "green"
	mapValue(anySlice(mapValue(next["routing"])["rules"])[0])["ruleTag"] = "green-route"
	nextBody, _ := json.Marshal(next)
	if runtime.GOOS == "linux" {
		// Exercise the production PID/start-time, executable and socket-owner
		// checks as well as the RPCs in the Linux compatibility CI matrix.
		var reason string
		client, reason = s.routingHotPlan(cfg, next)
		if client == nil {
			t.Fatal("production hot plan rejected isolated core:", reason)
		}
	}
	if err := os.WriteFile(active, nextBody, 0600); err != nil {
		t.Fatal(err)
	}
	recover := func() map[string]any { t.Fatal("valid hot routing unexpectedly restarted core"); return nil }
	result := s.applyHotRouting(client, cfg, next, backup, nil, recover)
	if result["ok"] != true || result["restarted"] != false {
		t.Fatal(result)
	}
	echo(oldConn, oldReader, "blue")
	newConn, newReader := connect()
	echo(newConn, newReader, "green")
	// Simulate a lost RPC acknowledgement AFTER the core committed the update.
	replace := client.replace
	lost := false
	client.replace = func(config map[string]any) error {
		err := replace(config)
		if err == nil && !lost {
			lost = true
			return fmt.Errorf("simulated lost acknowledgement")
		}
		return err
	}
	rollbackBackup := filepath.Join(dir, "green-backup.json")
	if err := os.WriteFile(rollbackBackup, nextBody, 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(active, body, 0600); err != nil {
		t.Fatal(err)
	}
	result = s.applyHotRouting(client, next, cfg, rollbackBackup, nil, recover)
	if result["ok"] != false || mapValue(result["rollback"])["ok"] != true {
		t.Fatal(result)
	}
	if err := client.verify(next); err != nil {
		t.Fatal(err)
	}
	saved, _ := os.ReadFile(active)
	if string(saved) != string(nextBody) {
		t.Fatal("saved config was not rolled back")
	}
	echo(oldConn, oldReader, "blue")
	echo(newConn, newReader, "green")
	third, thirdReader := connect()
	echo(third, thirdReader, "green")
}
