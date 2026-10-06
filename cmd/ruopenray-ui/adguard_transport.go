package main

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"os"
	"strings"
	"time"
)

const adGuardRelayConfigPath = "/etc/ruopenray-adguard/doh-relay.json"

// A DoH stamp carries the bootstrap IP and a separate TLS provider name. The
// provider's port (not ServerAddr's port) selects the local TLS relay in AGH.
func adGuardDoHStampEndpoint(value string) string {
	if !strings.HasPrefix(value, "sdns://") {
		return ""
	}
	body, err := base64.RawURLEncoding.DecodeString(strings.TrimRight(strings.TrimPrefix(value, "sdns://"), "="))
	if err != nil || len(body) < 10 || body[0] != 2 {
		return ""
	}
	pos := 9
	read := func() (string, bool) {
		if pos >= len(body) {
			return "", false
		}
		n := int(body[pos])
		pos++
		if pos+n > len(body) {
			return "", false
		}
		value := string(body[pos : pos+n])
		pos += n
		return value, true
	}
	address, ok := read()
	if !ok {
		return ""
	}
	ip := net.ParseIP(address)
	if ip == nil || !ip.IsLoopback() {
		return ""
	}
	// Certificate hashes use a high-bit continuation flag and 7-bit length.
	for {
		if pos >= len(body) {
			return ""
		}
		size := body[pos]
		pos++
		pos += int(size & 127)
		if pos > len(body) {
			return ""
		}
		if size&128 == 0 {
			break
		}
	}
	provider, ok := read()
	if !ok {
		return ""
	}
	_, port, err := net.SplitHostPort(provider)
	if err != nil || number(port, 0) < 1 || number(port, 0) > 65535 {
		return ""
	}
	return net.JoinHostPort(address, port)
}

func adGuardSocksEndpoint(cfg map[string]any) string {
	for _, item := range anySlice(cfg["inbounds"]) {
		in := mapValue(item)
		if in["protocol"] != "socks" || mapValue(in["settings"])["auth"] == "password" {
			continue
		}
		host := fmt.Sprint(in["listen"])
		if host == "<nil>" || host == "0.0.0.0" || host == "::" {
			host = "127.0.0.1"
		}
		if ip := net.ParseIP(host); ip == nil || !ip.IsLoopback() {
			continue
		}
		if port := number(in["port"], 0); port > 0 && port <= 65535 {
			return net.JoinHostPort(host, fmt.Sprint(port))
		}
	}
	return ""
}

func readAdGuardRelay() map[string]any {
	body, err := os.ReadFile(adGuardRelayConfigPath)
	if err != nil {
		return nil
	}
	var cfg map[string]any
	if json.Unmarshal(body, &cfg) != nil {
		return nil
	}
	return cfg
}

func adGuardRelaySocksEndpoint(relay map[string]any) string {
	outs := anySlice(relay["outbounds"])
	if len(outs) != 1 || len(mapValue(relay["routing"])) > 0 {
		return ""
	}
	out := mapValue(outs[0])
	if out["protocol"] != "socks" {
		return ""
	}
	servers := anySlice(mapValue(out["settings"])["servers"])
	if len(servers) != 1 {
		return ""
	}
	server := mapValue(servers[0])
	if len(anySlice(server["users"])) > 0 {
		return ""
	}
	host, port := fmt.Sprint(server["address"]), number(server["port"], 0)
	if ip := net.ParseIP(host); ip == nil || !ip.IsLoopback() || port < 1 || port > 65535 {
		return ""
	}
	return net.JoinHostPort(host, fmt.Sprint(port))
}

func adGuardRelayMatches(upstreams []string, relay, active map[string]any) bool {
	endpoint := adGuardRelaySocksEndpoint(relay)
	if endpoint == "" || endpoint != adGuardSocksEndpoint(active) {
		return false
	}
	listeners := map[string]bool{}
	for _, item := range anySlice(relay["inbounds"]) {
		in := mapValue(item)
		if in["protocol"] != "dokodemo-door" || mapValue(in["settings"])["network"] != "tcp" {
			continue
		}
		listeners[net.JoinHostPort(fmt.Sprint(in["listen"]), fmt.Sprint(in["port"]))] = true
	}
	count := 0
	for _, upstream := range upstreams {
		if strings.HasPrefix(strings.TrimSpace(upstream), "[/") {
			continue
		} // VPN bootstrap is deliberately independent.
		count++
		if endpoint := adGuardDoHStampEndpoint(upstream); endpoint == "" || !listeners[endpoint] {
			return false
		}
	}
	return count > 0
}

func (s *serverState) validateAdGuardTransportCandidate(candidate map[string]any) error {
	cfg, err := s.loadAdGuardSettings()
	if err != nil {
		return err
	}
	if cfg.URL == "" {
		return nil
	}
	if relay := readAdGuardRelay(); relay != nil && adGuardRelaySocksEndpoint(relay) != adGuardSocksEndpoint(candidate) {
		return errors.New("Для DNS AdGuard через VPN сохраните локальный SOCKS-вход " + adGuardRelaySocksEndpoint(relay) + " без авторизации; конфигурация VPN не изменена")
	}
	return nil
}

func adGuardRelayPortsReady(upstreams []string) bool {
	for _, upstream := range upstreams {
		if strings.HasPrefix(strings.TrimSpace(upstream), "[/") {
			continue
		}
		if endpoint := adGuardDoHStampEndpoint(upstream); endpoint == "" || !tcpPortOpen(endpoint, 300*time.Millisecond) {
			return false
		}
	}
	return true
}
