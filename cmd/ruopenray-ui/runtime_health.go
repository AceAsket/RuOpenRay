package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"runtime"
	"strings"
	"sync"
	"time"
)

type runtimeHealthCheck struct {
	OK       bool                       `json:"ok"`
	Detail   string                     `json:"detail,omitempty"`
	Attempts []subscriptionProbeAttempt `json:"attempts,omitempty"`
}
type runtimeHealth struct {
	Checks       map[string]runtimeHealthCheck `json:"checks"`
	Scope        string                        `json:"scope"`
	UncheckedVPN int                           `json:"uncheckedVPN,omitempty"`
}

func runtimeProbeOutbounds(selected map[string]any, all []any) ([]any, error) {
	pool := ensureFragmentOutbounds(append(append([]any{}, all...), selected))
	result := []any{selected}
	seen := map[string]bool{fmt.Sprint(selected["tag"]): true}
	for i := 0; i < len(result); i++ {
		o := mapValue(result[i])
		for _, dep := range []any{mapValue(mapValue(o["streamSettings"])["sockopt"])["dialerProxy"], mapValue(o["proxySettings"])["tag"]} {
			tag, _ := dep.(string)
			if tag == "" || seen[tag] {
				continue
			}
			found := false
			for _, item := range pool {
				if mapValue(item)["tag"] == tag {
					seen[tag] = true
					result = append(result, item)
					found = true
					break
				}
			}
			if !found {
				return nil, fmt.Errorf("не найден зависимый выход пробного туннеля")
			}
		}
	}
	return result, nil
}

func runtimeHealthVPNs(cfg map[string]any) []map[string]any {
	referenced := map[string]bool{}
	outs := anySlice(cfg["outbounds"])
	if len(outs) > 0 {
		referenced[fmt.Sprint(mapValue(outs[0])["tag"])] = true
	}
	for _, item := range anySlice(mapValue(cfg["routing"])["rules"]) {
		if tag, ok := mapValue(item)["outboundTag"].(string); ok {
			referenced[tag] = true
		}
	}
	for _, b := range anySlice(mapValue(cfg["routing"])["balancers"]) {
		for _, prefix := range stringList(mapValue(b)["selector"]) {
			for _, o := range outs {
				tag, _ := mapValue(o)["tag"].(string)
				if strings.HasPrefix(tag, prefix) {
					referenced[tag] = true
				}
			}
		}
	}
	var selected []map[string]any
	for _, item := range outs {
		o := mapValue(item)
		tag, _ := o["tag"].(string)
		proto, _ := o["protocol"].(string)
		if referenced[tag] && tag != "" && proto != "freedom" && proto != "blackhole" && proto != "dns" && proto != "loopback" {
			selected = append(selected, o)
		}
	}
	return selected
}

func (s *serverState) captureRuntimeHealth(cfg map[string]any) runtimeHealth {
	result := runtimeHealth{Checks: map[string]runtimeHealthCheck{}, Scope: "DNS localhost:53, HTTP через работающий локальный вход и отдельные проверки VPN-транспортов; LAN/TPROXY здесь не проверяется"}
	if runtime.GOOS != "linux" || s.cfg.ServiceName != "xray" || !commandExists("/etc/init.d/xray") {
		return result
	}
	var mu sync.Mutex
	var group sync.WaitGroup
	limit := make(chan struct{}, 2)
	add := func(key string, task func() runtimeHealthCheck) {
		group.Add(1)
		go func() {
			defer group.Done()
			limit <- struct{}{}
			defer func() { <-limit }()
			v := task()
			mu.Lock()
			result.Checks[key] = v
			mu.Unlock()
		}()
	}
	add("dns", func() runtimeHealthCheck {
		resolver := &net.Resolver{PreferGo: true, Dial: func(ctx context.Context, network, address string) (net.Conn, error) {
			return (&net.Dialer{}).DialContext(ctx, "udp", "127.0.0.1:53")
		}}
		for _, host := range []string{"example.com", "cloudflare.com"} {
			ctx, cancel := context.WithTimeout(context.Background(), 1800*time.Millisecond)
			ips, err := resolver.LookupIPAddr(ctx, host)
			cancel()
			if err == nil && len(ips) > 0 {
				return runtimeHealthCheck{OK: true}
			}
		}
		return runtimeHealthCheck{Detail: "DNS не ответил для двух независимых доменов"}
	})
	probeHTTP := func(proxy *url.URL) runtimeHealthCheck {
		transport := &http.Transport{Proxy: nil}
		if proxy != nil {
			transport.Proxy = http.ProxyURL(proxy)
		}
		defer transport.CloseIdleConnections()
		client := &http.Client{Timeout: 1800 * time.Millisecond, Transport: transport, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
		for _, target := range subscriptionProbeTargets("") {
			ctx, cancel := context.WithTimeout(context.Background(), 1800*time.Millisecond)
			sample := tlsStabilitySample(ctx, client, target)
			cancel()
			if sample["ok"] == true && sample["bodyComplete"] == true {
				return runtimeHealthCheck{OK: true}
			}
		}
		return runtimeHealthCheck{Detail: "два HTTPS-адреса не передали полный контрольный ответ"}
	}
	add("wan-control", runtimeWANControl)
	for _, item := range anySlice(cfg["inbounds"]) {
		ib := mapValue(item)
		if ib["protocol"] != "http" {
			continue
		}
		listen, _ := ib["listen"].(string)
		if listen != "127.0.0.1" && listen != "::1" {
			continue
		}
		if len(anySlice(mapValue(ib["settings"])["accounts"])) > 0 {
			continue
		}
		proxy, _ := url.Parse("http://" + net.JoinHostPort(listen, fmt.Sprint(ib["port"])))
		add("live-proxy", func() runtimeHealthCheck { return probeHTTP(proxy) })
		break
	}
	selected := runtimeHealthVPNs(cfg)
	if len(selected) > 4 {
		result.UncheckedVPN = len(selected) - 4
		selected = selected[:4]
	}
	for _, outbound := range selected {
		o := outbound
		tag := fmt.Sprint(o["tag"])
		add("vpn:"+tag, func() runtimeHealthCheck {
			_, ok, attempts, _ := runSubscriptionProbes(subscriptionProbeTargets(""), func(target string) (int64, bool, error) {
				return s.httpOutboundProbeStatusWithConfig(o, anySlice(cfg["outbounds"]), target, 1800, 1, true)
			})
			return runtimeHealthCheck{OK: ok, Attempts: attempts}
		})
	}
	group.Wait()
	return result
}

// IP-literal HTTPS keeps the WAN control independent of the DNS service being
// tested. Otherwise a DNS regression would masquerade as a general WAN outage.
func runtimeWANControl() runtimeHealthCheck {
	transport := &http.Transport{Proxy: nil}
	defer transport.CloseIdleConnections()
	client := &http.Client{Timeout: 1800 * time.Millisecond, Transport: transport, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	for _, target := range []string{"https://1.1.1.1/cdn-cgi/trace", "https://9.9.9.9/dns-query"} {
		resp, err := client.Get(target)
		if err != nil {
			continue
		}
		n, e := io.Copy(io.Discard, io.LimitReader(resp.Body, (64<<10)+1))
		resp.Body.Close()
		if e == nil && n <= 64<<10 && resp.TLS != nil && len(resp.TLS.VerifiedChains) > 0 {
			return runtimeHealthCheck{OK: true}
		}
	}
	return runtimeHealthCheck{Detail: "HTTPS по двум IP без DNS не ответил"}
}

func compareRuntimeHealth(before, after runtimeHealth) map[string]any {
	lost := []string{}
	known := 0
	for key, old := range before.Checks {
		if !old.OK || key == "wan-control" {
			continue
		}
		if next, exists := after.Checks[key]; exists {
			known++
			if !next.OK {
				lost = append(lost, key)
			}
		}
	}
	external := before.Checks["wan-control"].OK && !after.Checks["wan-control"].OK && !after.Checks["dns"].OK
	state := "healthy"
	beforeVPN, afterVPN, totalVPN := 0, 0, 0
	for key, row := range before.Checks {
		if strings.HasPrefix(key, "vpn:") && row.OK {
			beforeVPN++
		}
	}
	for key, row := range after.Checks {
		if strings.HasPrefix(key, "vpn:") {
			totalVPN++
			if row.OK {
				afterVPN++
			}
		}
	}
	if beforeVPN > 0 && totalVPN > 0 && afterVPN == 0 {
		lost = append(lost, "vpn-transports")
	}
	if known == 0 || external {
		state = "inconclusive"
	} else if len(lost) > 0 {
		state = "regression"
	}
	if state == "healthy" && (before.UncheckedVPN > 0 || after.UncheckedVPN > 0) {
		state = "inconclusive"
	}
	return map[string]any{"ok": state != "regression", "state": state, "lost": lost, "externalFailurePossible": external, "before": before, "after": after}
}

func (s *serverState) runtimeHealthConfig(path string) map[string]any {
	b, err := os.ReadFile(path)
	if err != nil {
		return nil
	}
	var cfg map[string]any
	json.Unmarshal(b, &cfg)
	return cfg
}

func (s *serverState) waitXrayReady() map[string]any {
	var last string
	stable := 0
	for i := 0; i < 15; i++ {
		time.Sleep(time.Second)
		now := s.xrayServiceStatus()
		pid := fmt.Sprint(now["pid"])
		if now["managed"] == true && pid != "<nil>" && pid != "0" {
			if pid == last {
				stable++
			} else {
				stable = 0
			}
			last = pid
			if stable >= 3 {
				return map[string]any{"ok": true, "pid": now["pid"]}
			}
		} else {
			stable = 0
			last = ""
		}
	}
	return map[string]any{"ok": false, "stderr": "Xray не подтвердил стабильный управляемый процесс"}
}
