package main

import (
	"crypto/tls"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os/exec"
	"regexp"
	"strconv"
	"strings"
	"time"
)

func domainProbeURL(rawHost string, rawURL string) (string, string, string, string, error) {
	value := strings.TrimSpace(firstNonEmpty(rawURL, rawHost))
	value = strings.TrimPrefix(value, "domain:")
	value = strings.TrimPrefix(value, "regexp:")
	value = strings.TrimPrefix(value, "full:")
	if value == "" || value == "<nil>" {
		return "", "", "", "", fmt.Errorf("укажите домен или URL")
	}
	if !strings.Contains(value, "://") {
		value = "https://" + strings.Trim(value, "/")
	}
	parsed, err := url.Parse(value)
	if err != nil || parsed.Host == "" || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		return "", "", "", "", fmt.Errorf("нужен домен или http/https URL")
	}
	port := parsed.Port()
	if port == "" {
		if parsed.Scheme == "http" {
			port = "80"
		} else {
			port = "443"
		}
	}
	return value, parsed.Hostname(), port, parsed.Scheme, nil
}

func directHTTPProbe(rawURL string, timeoutMs int) map[string]any {
	if timeoutMs < 500 {
		timeoutMs = 500
	}
	if timeoutMs > 15000 {
		timeoutMs = 15000
	}
	transport := &http.Transport{TLSClientConfig: &tls.Config{MinVersion: tls.VersionTLS12}}
	client := &http.Client{Timeout: time.Duration(timeoutMs) * time.Millisecond, Transport: transport}
	started := time.Now()
	resp, err := client.Get(rawURL)
	latency := time.Since(started).Milliseconds()
	if err != nil {
		return map[string]any{"ok": false, "latencyMs": latency, "error": err.Error()}
	}
	defer resp.Body.Close()
	_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 1024))
	ok := resp.StatusCode < 500
	result := map[string]any{"ok": ok, "status": resp.StatusCode, "latencyMs": latency}
	if !ok {
		result["error"] = fmt.Sprintf("HTTP %d", resp.StatusCode)
	}
	return result
}

func directTCPProbe(host string, port string, timeoutMs int) map[string]any {
	if timeoutMs < 500 {
		timeoutMs = 500
	}
	if timeoutMs > 15000 {
		timeoutMs = 15000
	}
	address := net.JoinHostPort(host, port)
	started := time.Now()
	conn, err := net.DialTimeout("tcp", address, time.Duration(timeoutMs)*time.Millisecond)
	latency := time.Since(started).Milliseconds()
	if err != nil {
		return map[string]any{"ok": false, "latencyMs": latency, "address": address, "error": err.Error()}
	}
	_ = conn.Close()
	return map[string]any{"ok": true, "latencyMs": latency, "address": address}
}

func directPingProbe(host string, timeoutMs int) map[string]any {
	ping, err := exec.LookPath("ping")
	if err != nil {
		return map[string]any{"ok": false, "skipped": true, "error": "ping не найден на роутере"}
	}
	if timeoutMs < 1000 {
		timeoutMs = 1000
	}
	if timeoutMs > 15000 {
		timeoutMs = 15000
	}
	timeoutSeconds := (timeoutMs + 999) / 1000
	result := runTimeout(time.Duration(timeoutMs)*time.Millisecond+time.Second, ping, "-c", "1", "-W", strconv.Itoa(timeoutSeconds), host)
	result["host"] = host
	result["tool"] = "ping"
	stdout := fmt.Sprint(result["stdout"])
	if match := regexp.MustCompile(`time[=<]([0-9.]+)\s*ms`).FindStringSubmatch(stdout); len(match) == 2 {
		if latency, err := strconv.ParseFloat(match[1], 64); err == nil {
			result["latencyMs"] = int64(latency)
		}
	}
	return result
}

func firstProxyOutbound(cfg map[string]any) (map[string]any, string) {
	for _, item := range asArray(cfg["outbounds"]) {
		outbound, ok := item.(map[string]any)
		if !ok {
			continue
		}
		tag := strings.TrimSpace(fmt.Sprint(outbound["tag"]))
		protocol := strings.ToLower(strings.TrimSpace(fmt.Sprint(outbound["protocol"])))
		if tag == "" || tag == "<nil>" || protocol == "freedom" || protocol == "blackhole" || protocol == "dns" || tag == "direct" || tag == "block" || tag == "dns-out" {
			continue
		}
		return outbound, tag
	}
	return nil, ""
}

func findOutboundByTag(cfg map[string]any, tag string) map[string]any {
	for _, item := range asArray(cfg["outbounds"]) {
		outbound, ok := item.(map[string]any)
		if !ok {
			continue
		}
		if strings.TrimSpace(fmt.Sprint(outbound["tag"])) == tag {
			return outbound
		}
	}
	return nil
}

func domainProbeVerdict(ping map[string]any, directTCP map[string]any, proxyTCP map[string]any, directHTTP map[string]any, proxyHTTP map[string]any) map[string]any {
	directHTTPOK := boolPayload(directHTTP, "ok", false)
	proxyHTTPOK := boolPayload(proxyHTTP, "ok", false)
	directTCPOK := boolPayload(directTCP, "ok", false)
	proxyTCPOK := boolPayload(proxyTCP, "ok", false)
	pingOK := boolPayload(ping, "ok", false)
	switch {
	case proxyHTTPOK && !directHTTPOK:
		return map[string]any{"code": "proxy-needed", "label": "нужен proxy", "detail": "HTTP напрямую не открылся, через proxy работает"}
	case proxyHTTPOK && directHTTPOK:
		return map[string]any{"code": "both-ok", "label": "доступен", "detail": "HTTP открывается и напрямую, и через proxy"}
	case directHTTPOK && !proxyHTTPOK:
		return map[string]any{"code": "direct-only", "label": "напрямую", "detail": "HTTP напрямую работает, через выбранный proxy нет"}
	case proxyTCPOK && !directTCPOK:
		return map[string]any{"code": "proxy-tcp", "label": "TCP через proxy", "detail": "порт через proxy открыт, HTTP не ответил"}
	case directTCPOK && !proxyTCPOK:
		return map[string]any{"code": "direct-tcp", "label": "TCP напрямую", "detail": "порт напрямую открыт, через выбранный proxy нет"}
	case proxyTCPOK && directTCPOK:
		return map[string]any{"code": "tcp-open", "label": "TCP открыт", "detail": "порт открыт напрямую и через proxy, HTTP не ответил"}
	case pingOK:
		return map[string]any{"code": "ping-only", "label": "есть ping", "detail": "ICMP отвечает с роутера, TCP/HTTP не подтвердились"}
	default:
		return map[string]any{"code": "down", "label": "не открылся", "detail": "ping, TCP и HTTP не подтвердили доступность"}
	}
}

func (s *serverState) domainProxyProbe(payload map[string]any) map[string]any {
	cfg, err := s.readActiveConfig()
	if err != nil {
		return map[string]any{"ok": false, "stderr": err.Error()}
	}
	rawURL, host, port, scheme, err := domainProbeURL(strings.TrimSpace(fmt.Sprint(payload["host"])), strings.TrimSpace(fmt.Sprint(payload["url"])))
	if err != nil {
		return map[string]any{"ok": false, "stderr": err.Error()}
	}
	timeoutMs := number(payload["timeoutMs"], 5000)
	if timeoutMs < 1000 {
		timeoutMs = 1000
	}
	if timeoutMs > 15000 {
		timeoutMs = 15000
	}
	ping := directPingProbe(host, timeoutMs)
	directTCP := directTCPProbe(host, port, timeoutMs)
	direct := directHTTPProbe(rawURL, timeoutMs)
	tag := strings.TrimSpace(fmt.Sprint(payload["tag"]))
	outbound := map[string]any(nil)
	if tag != "" && tag != "<nil>" {
		outbound = findOutboundByTag(cfg, tag)
	} else {
		outbound, tag = firstProxyOutbound(cfg)
	}
	proxyTCP := map[string]any{"ok": false, "error": "proxy outbound не найден"}
	proxy := map[string]any{"ok": false, "error": "proxy outbound не найден"}
	if outbound != nil {
		tcpLatency, tcpOK, tcpErr := s.tcpOutboundProbe(outbound, host, port, timeoutMs, 1)
		proxyTCP = map[string]any{"ok": tcpOK, "tag": tag, "address": net.JoinHostPort(host, port)}
		if tcpLatency > 0 {
			proxyTCP["latencyMs"] = tcpLatency
		}
		if tcpErr != nil {
			proxyTCP["error"] = tcpErr.Error()
		}
		latency, ok, probeErr := s.httpOutboundProbe(outbound, rawURL, timeoutMs, 1)
		proxy = map[string]any{"ok": ok, "tag": tag}
		if latency > 0 {
			proxy["latencyMs"] = latency
		}
		if probeErr != nil {
			proxy["error"] = probeErr.Error()
		}
	}
	checks := map[string]any{
		"ping":       ping,
		"tcpDirect":  directTCP,
		"tcpProxy":   proxyTCP,
		"httpDirect": direct,
		"httpProxy":  proxy,
	}
	verdict := domainProbeVerdict(ping, directTCP, proxyTCP, direct, proxy)
	return map[string]any{
		"ok":       true,
		"host":     host,
		"url":      rawURL,
		"endpoint": map[string]any{"host": host, "port": port, "scheme": scheme},
		"tag":      tag,
		"direct":   direct,
		"proxy":    proxy,
		"checks":   checks,
		"verdict":  verdict,
	}
}
