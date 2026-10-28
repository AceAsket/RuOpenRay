//go:build linux

package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"testing"
	"time"

	rfw "github.com/AceAsket/RuOpenRay/internal/firewall"
)

func TestNativeLANClientHelper(t *testing.T) {
	proto := os.Getenv("RUOPENRAY_LAN_CLIENT_PROTO")
	if proto == "" {
		t.Skip("namespace child only")
	}
	address := os.Getenv("RUOPENRAY_LAN_CLIENT_ADDRESS")
	if proto == "udp" {
		conn, err := net.DialTimeout("udp", address, 2*time.Second)
		if err != nil {
			t.Fatal(err)
		}
		defer conn.Close()
		conn.SetDeadline(time.Now().Add(2 * time.Second))
		if _, err = conn.Write([]byte("ruopenray-lan-udp")); err != nil {
			t.Fatal(err)
		}
		buf := make([]byte, 128)
		n, err := conn.Read(buf)
		if err != nil || string(buf[:n]) != "ruopenray-lan-udp" {
			t.Fatal("UDP echo not delivered", err)
		}
	} else {
		client := &http.Client{Timeout: 2 * time.Second, Transport: &http.Transport{Proxy: nil}}
		res, err := client.Get("http://" + address + "/probe")
		if err != nil {
			t.Fatal(err)
		}
		defer res.Body.Close()
		b, err := io.ReadAll(res.Body)
		if err != nil || string(b) != "ruopenray-lan-tcp" {
			t.Fatal("TCP response not delivered", err)
		}
	}
}

// This lab fixture uses a veth client and a local TEST-NET origin. The origin
// deliberately isn't added to the generator's router-bypass list, so packets
// traverse the actual nft TPROXY hook, policy routing and a real Xray process.
// It verifies IPv4 TCP/UDP kernel interception, not a physical LAN/WAN bridge.
func TestNativeTransparentLAN(t *testing.T) {
	if os.Getenv("RUOPENRAY_LAN_ACCEPTANCE") != "192.168.50.117" {
		t.Skip("requires explicit lab opt-in")
	}
	s := &serverState{cfg: appConfig{DataDir: t.TempDir()}}
	unlock, err := s.beginMutation()
	if err != nil {
		t.Fatal(err)
	}
	defer unlock()
	if _, err := os.Stat(ruOpenRayFirewallNftPath); !os.IsNotExist(err) {
		t.Fatal("requires lab baseline without managed capture")
	}
	if r := runTimeout(3*time.Second, "nft", "list", "table", "inet", "ruopenray"); r["ok"] == true {
		t.Fatal("managed table already in use")
	}
	if len(killSwitchNftsetValues()) > 0 || len(readKillSwitchDNSBlockDomains()) > 0 {
		t.Fatal("requires baseline without managed DNS sets")
	}
	dhcp, err := os.ReadFile("/etc/config/dhcp")
	if err != nil {
		t.Fatal(err)
	}
	run := func(args ...string) string {
		t.Helper()
		r := runTimeout(8*time.Second, args[0], args[1:]...)
		if r["ok"] != true {
			t.Fatalf("%v: %v", args, r["stderr"])
		}
		return fmt.Sprint(r["stdout"])
	}
	name := "rrlab" + strconv.Itoa(os.Getpid())
	peer := name + "p"
	ns := name + "ns"
	origin := "203.0.113.254"
	if strings.Contains(run("ip", "-o", "addr", "show"), origin) {
		t.Fatal("TEST-NET origin already in use")
	}
	run("ip", "netns", "add", ns)
	defer runTimeout(5*time.Second, "ip", "netns", "del", ns)
	run("ip", "link", "add", name, "type", "veth", "peer", "name", peer)
	defer runTimeout(5*time.Second, "ip", "link", "del", name)
	run("ip", "link", "set", peer, "netns", ns)
	run("ip", "addr", "add", "198.18.255.1/30", "dev", name)
	run("ip", "link", "set", name, "up")
	run("ip", "netns", "exec", ns, "ip", "addr", "add", "198.18.255.2/30", "dev", peer)
	run("ip", "netns", "exec", ns, "ip", "link", "set", peer, "up")
	run("ip", "netns", "exec", ns, "ip", "link", "set", "lo", "up")
	run("ip", "netns", "exec", ns, "ip", "route", "add", "default", "via", "198.18.255.1")
	run("ip", "addr", "add", origin+"/32", "dev", "lo")
	defer runTimeout(5*time.Second, "ip", "addr", "del", origin+"/32", "dev", "lo")
	comment := "ruopenray_acceptance_" + name
	run("nft", "insert", "rule", "inet", "fw4", "input", "iifname", strconv.Quote(name), "ip", "saddr", "198.18.255.2", "accept", "comment", strconv.Quote(comment))
	chain := run("nft", "-a", "list", "chain", "inet", "fw4", "input")
	var handle string
	for _, line := range strings.Split(chain, "\n") {
		if strings.Contains(line, comment) {
			m := regexp.MustCompile(`# handle (\d+)`).FindStringSubmatch(line)
			if len(m) == 2 {
				handle = m[1]
			}
		}
	}
	if handle == "" {
		t.Fatal("cannot identify owned input rule")
	}
	defer runTimeout(5*time.Second, "nft", "delete", "rule", "inet", "fw4", "input", "handle", handle)
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	// Redirect to loopback so the UDP origin does not occupy the source IP/port
	// that the transparent proxy must bind when returning packets to the client.
	backendAddress := listener.Addr().String()
	port := listener.Addr().(*net.TCPAddr).Port
	address := net.JoinHostPort(origin, fmt.Sprint(port))
	originHTTP := &http.Server{Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { io.WriteString(w, "ruopenray-lan-tcp") })}
	go originHTTP.Serve(listener)
	defer originHTTP.Close()
	udp, err := net.ListenPacket("udp", backendAddress)
	if err != nil {
		t.Fatal(err)
	}
	defer udp.Close()
	go func() {
		b := make([]byte, 1024)
		for {
			n, from, e := udp.ReadFrom(b)
			if e != nil {
				return
			}
			udp.WriteTo(b[:n], from)
		}
	}()
	transparentPort, err := freeLocalPort()
	if err != nil {
		t.Fatal(err)
	}
	core := filepath.Join(s.cfg.DataDir, "lan-probe-core")
	in, err := os.Open(os.Getenv("RUOPENRAY_TEST_XRAY"))
	if err != nil {
		t.Fatal(err)
	}
	out, err := os.OpenFile(core, os.O_CREATE|os.O_WRONLY, 0700)
	if err != nil {
		in.Close()
		t.Fatal(err)
	}
	_, err = io.Copy(out, in)
	in.Close()
	closeErr := out.Close()
	if err != nil || closeErr != nil {
		t.Fatal(err, closeErr)
	}
	logPath := filepath.Join(s.cfg.DataDir, "access.log")
	defer func() {
		if t.Failed() {
			if b, e := os.ReadFile(logPath); e == nil {
				t.Logf("isolated local proxy: %s", b)
			}
		}
	}()
	cfg := map[string]any{"log": map[string]any{"loglevel": "warning", "access": logPath}, "inbounds": []any{map[string]any{
		"tag": "lab-tproxy", "listen": "127.0.0.1", "port": transparentPort, "protocol": "dokodemo-door", "settings": map[string]any{"network": "tcp,udp", "followRedirect": true}, "streamSettings": map[string]any{"sockopt": map[string]any{"tproxy": "tproxy"}},
	}}, "outbounds": []any{map[string]any{"tag": "direct", "protocol": "freedom", "settings": map[string]any{"redirect": backendAddress}, "streamSettings": map[string]any{"sockopt": map[string]any{"mark": 128}}}}}
	body, _ := json.Marshal(cfg)
	configPath := filepath.Join(s.cfg.DataDir, "config.json")
	os.WriteFile(configPath, body, 0600)
	var process *exec.Cmd
	start := func() {
		t.Helper()
		process = exec.Command(core, "run", "-config", configPath)
		if err := process.Start(); err != nil {
			t.Fatal(err)
		}
		if err := waitTCPPort("127.0.0.1", transparentPort, 2500); err != nil {
			t.Fatal(err)
		}
	}
	stop := func() {
		if process != nil {
			process.Process.Kill()
			process.Wait()
			process = nil
		}
	}
	start()
	defer stop()
	nft, meta := rfw.NativeNft(map[string]any{"lanInterface": name, "transparentPort": transparentPort, "portMode": "custom", "ports": []string{fmt.Sprint(port)}, "blockQuic": false, "dnsIntercept": false})
	if result := s.firewallCommit(nft, rfw.HotplugScript(), meta); result["ok"] != true {
		t.Fatal(result)
	}
	defer func() {
		if result := s.disableFirewall(); result["ok"] != true {
			t.Error(result)
		}
		after, e := os.ReadFile("/etc/config/dhcp")
		if e != nil || string(after) != string(dhcp) {
			t.Error("fixture changed DNS configuration")
		}
	}()
	self, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	client := func(proto string, diagnostic bool) bool {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		cmd := exec.CommandContext(ctx, "ip", "netns", "exec", ns, self, "-test.run=^TestNativeLANClientHelper$")
		cmd.Env = append(os.Environ(), "RUOPENRAY_LAN_CLIENT_PROTO="+proto, "RUOPENRAY_LAN_CLIENT_ADDRESS="+address)
		b, e := cmd.CombinedOutput()
		if e != nil && diagnostic {
			t.Logf("client %s: %s", proto, b)
		}
		return e == nil
	}
	if !client("tcp", true) || !client("udp", true) {
		t.Fatal("namespace packets did not traverse TPROXY")
	}
	access, err := os.ReadFile(logPath)
	if err != nil || !strings.Contains(string(access), "198.18.255.2:") || !strings.Contains(string(access), "accepted tcp:") || !strings.Contains(string(access), "accepted udp:") {
		t.Fatal("missing real TCP/UDP interception evidence")
	}
	stop()
	if client("tcp", false) || client("udp", false) {
		t.Fatal("client bypassed stopped transparent proxy")
	}
	start()
	if !client("tcp", true) || !client("udp", true) {
		t.Fatal("transparent proxy did not recover")
	}
	t.Log("Virtual LAN TCP/UDP interception, failure with stopped proxy, and recovery passed")
}
