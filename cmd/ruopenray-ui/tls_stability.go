package main

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptrace"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

func tlsStabilityError(err error, phase string) (string, string) {
	var network net.Error
	var certificate x509.UnknownAuthorityError
	var hostname x509.HostnameError
	var invalid x509.CertificateInvalidError
	var dns *net.DNSError
	var record tls.RecordHeaderError
	switch {
	case errors.Is(err, context.Canceled):
		return "cancelled", "Проверка отменена"
	case errors.As(err, &dns):
		return "dns", "Не удалось разрешить имя назначения или сервера"
	case errors.As(err, &network) && network.Timeout():
		return "timeout", "Истекло время ожидания"
	case errors.As(err, &certificate), errors.As(err, &hostname), errors.As(err, &invalid):
		return "certificate", "Сертификат не прошёл проверку доверия или имени"
	case errors.As(err, &record), strings.Contains(strings.ToLower(err.Error()), "bad record"), strings.Contains(strings.ToLower(err.Error()), "decrypt"), strings.Contains(strings.ToLower(err.Error()), "tls:"):
		return "tls", "Ошибка обработки TLS-потока"
	case phase == "body":
		return "transfer", "Ответ оборвался при чтении тела"
	default:
		return "connection", "Не удалось получить HTTPS-ответ; причина разрыва не определена"
	}
}

func tlsStabilitySample(ctx context.Context, client *http.Client, target string) map[string]any {
	started := time.Now()
	result := map[string]any{"ok": false, "bodyComplete": false}
	var traceMu sync.Mutex
	phase := "request"
	timings := map[string]int64{}
	mark := func(key, nextPhase string) {
		traceMu.Lock()
		defer traceMu.Unlock()
		timings[key] = time.Since(started).Milliseconds()
		if nextPhase != "" {
			phase = nextPhase
		}
	}
	defer func() {
		traceMu.Lock()
		defer traceMu.Unlock()
		result["phase"] = phase
		// Trace callbacks can finish after cancellation. Return a snapshot so
		// they cannot mutate a response while it is being encoded.
		snapshot := map[string]int64{}
		for key, value := range timings {
			snapshot[key] = value
		}
		result["timings"] = snapshot
		result["latencyMs"] = time.Since(started).Milliseconds()
	}()
	ctx = httptrace.WithClientTrace(ctx, &httptrace.ClientTrace{
		DNSStart:             func(httptrace.DNSStartInfo) { mark("dnsStartMs", "dns") },
		DNSDone:              func(httptrace.DNSDoneInfo) { mark("dnsDoneMs", "") },
		ConnectStart:         func(_, _ string) { mark("connectStartMs", "connect") },
		ConnectDone:          func(_, _ string, _ error) { mark("connectDoneMs", "") },
		TLSHandshakeStart:    func() { mark("tlsStartMs", "tls") },
		TLSHandshakeDone:     func(tls.ConnectionState, error) { mark("tlsDoneMs", "") },
		GotConn:              func(httptrace.GotConnInfo) { mark("connectionReadyMs", "headers") },
		WroteRequest:         func(httptrace.WroteRequestInfo) { mark("requestSentMs", "") },
		GotFirstResponseByte: func() { mark("firstByteMs", "") },
	})
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, target, nil)
	if err != nil {
		mark("invalidTargetMs", "target")
		result["code"], result["error"] = "target", "Некорректный URL"
		return result
	}
	req.Header.Set("User-Agent", "RuOpenRay TLS stability probe")
	req.Header.Set("Cache-Control", "no-cache")
	resp, err := client.Do(req)
	if err == nil {
		defer resp.Body.Close()
		result["status"] = resp.StatusCode
		if resp.TLS != nil {
			result["negotiated"] = tlsVersionName(resp.TLS.Version)
			result["certificateVerified"] = len(resp.TLS.VerifiedChains) > 0
		}
		mark("bodyStartMs", "body")
		n, readErr := io.Copy(io.Discard, io.LimitReader(resp.Body, (1<<20)+1))
		result["bytes"], result["bodyComplete"] = n, readErr == nil && n <= 1<<20
		err = readErr
		if err == nil && resp.StatusCode >= 400 {
			result["code"], result["error"] = "http", fmt.Sprintf("HTTP %d", resp.StatusCode)
		}
		if err == nil && resp.StatusCode < 400 {
			result["ok"] = true
			result["code"] = "ok"
		}
	}
	if err != nil {
		traceMu.Lock()
		failedPhase := phase
		traceMu.Unlock()
		result["code"], result["error"] = tlsStabilityError(err, failedPhase)
	} else if result["ok"] == true && result["bodyComplete"] == true {
		mark("completeMs", "complete")
	}
	return result
}

func withoutTLSFragment(outbound map[string]any) (map[string]any, bool) {
	body, _ := json.Marshal(outbound)
	var clone map[string]any
	_ = json.Unmarshal(body, &clone)
	stream := mapValue(clone["streamSettings"])
	sockopt := mapValue(stream["sockopt"])
	changed := false
	if tag, ok := sockopt["dialerProxy"].(string); ok && strings.HasPrefix(tag, "ruopenray-fragment-") {
		delete(sockopt, "dialerProxy")
		changed = true
	}
	mask := mapValue(stream["finalmask"])
	if items, ok := mask["tcp"]; ok {
		kept := []any{}
		for _, item := range anySlice(items) {
			if mapValue(item)["type"] == "fragment" {
				changed = true
			} else {
				kept = append(kept, item)
			}
		}
		mask["tcp"] = kept
	}
	return clone, changed
}

func (s *serverState) tlsStabilityOutbound(ctx context.Context, outbound map[string]any, task func(*url.URL) []map[string]any) []map[string]any {
	port, err := freeLocalPort()
	if err != nil {
		return []map[string]any{{"ok": false, "code": "setup", "error": "Нет свободного локального порта"}}
	}
	dir := filepath.Join(s.cfg.DataDir, "checks")
	if err := os.MkdirAll(dir, 0700); err != nil {
		return []map[string]any{{"ok": false, "code": "setup", "error": "Не удалось создать временный каталог"}}
	}
	file, err := os.CreateTemp(dir, "tls-stability-*.json")
	if err != nil {
		return []map[string]any{{"ok": false, "code": "setup", "error": "Не удалось создать временный конфиг"}}
	}
	defer os.Remove(file.Name())
	config := map[string]any{"log": map[string]any{"loglevel": "warning"}, "inbounds": []any{map[string]any{
		"tag": "tls-probe", "listen": "127.0.0.1", "port": port, "protocol": "socks", "settings": map[string]any{"auth": "noauth", "udp": false}}}, "outbounds": ensureFragmentOutbounds([]any{outbound})}
	err = json.NewEncoder(file).Encode(config)
	closeErr := file.Close()
	if err != nil || closeErr != nil {
		return []map[string]any{{"ok": false, "code": "setup", "error": "Не удалось записать временный конфиг"}}
	}
	cmd := exec.CommandContext(ctx, "xray", "run", "-config", file.Name())
	cmd.Env = s.xrayEnv()
	var output probeLogBuffer
	cmd.Stdout, cmd.Stderr = &output, &output
	if err := cmd.Start(); err != nil {
		return []map[string]any{{"ok": false, "code": "setup", "error": "Не удалось запустить пробный Xray"}}
	}
	defer func() { _ = cmd.Process.Kill(); _ = cmd.Wait() }()
	if err := waitTCPPort("127.0.0.1", port, 2500); err != nil {
		return []map[string]any{{"ok": false, "code": "setup", "error": "Пробный Xray не открыл локальный порт"}}
	}
	proxy, _ := url.Parse(fmt.Sprintf("socks5://127.0.0.1:%d", port))
	return task(proxy)
}

func (s *serverState) tlsStabilityProbe(parent context.Context, payload map[string]any) map[string]any {
	if !s.tlsProbeMu.TryLock() {
		return map[string]any{"ok": false, "error": "Проверка TLS уже выполняется"}
	}
	defer s.tlsProbeMu.Unlock()
	target, host, _, scheme, err := domainProbeURL("", fmt.Sprint(payload["target"]))
	if err != nil || scheme != "https" {
		return map[string]any{"ok": false, "error": "Для проверки нужен HTTPS URL"}
	}
	u, _ := url.Parse(target)
	if u.User != nil {
		return map[string]any{"ok": false, "error": "URL не должен содержать логин или пароль"}
	}
	attempts := intPayload(payload, "attempts", 5)
	timeout := intPayload(payload, "timeoutMs", 4000)
	if attempts < 1 || attempts > 10 || timeout < 1000 || timeout > 8000 || attempts*timeout*2 > 40000 {
		return map[string]any{"ok": false, "error": "Нужно 1–10 запросов и таймаут 1–8 с; бюджет двух версий TLS — не более 40 с на выход"}
	}
	config, err := s.readActiveConfig()
	if err != nil {
		return map[string]any{"ok": false, "error": "Не удалось прочитать активную конфигурацию"}
	}
	tag, _ := payload["tag"].(string)
	var selected map[string]any
	for _, item := range anySlice(config["outbounds"]) {
		if candidate := mapValue(item); candidate["tag"] == tag && tag != "" {
			selected = candidate
			break
		}
	}
	if selected == nil || selected["protocol"] == "freedom" || selected["protocol"] == "blackhole" || selected["protocol"] == "dns" || selected["protocol"] == "loopback" {
		return map[string]any{"ok": false, "error": "Выберите существующий proxy-выход"}
	}
	ctx, cancel := context.WithTimeout(parent, 50*time.Second)
	defer cancel()
	variants := []struct {
		name     string
		outbound map[string]any
	}{{"direct", nil}, {"proxy", selected}}
	clean, fragment := withoutTLSFragment(selected)
	if fragment && boolPayload(payload, "compareFragment", true) {
		variants = append(variants, struct {
			name     string
			outbound map[string]any
		}{"without-fragment", clean})
	}
	results := make([][]map[string]any, len(variants))
	var group sync.WaitGroup
	for index, variant := range variants {
		group.Add(1)
		go func(index int, name string, outbound map[string]any) {
			defer group.Done()
			task := func(proxy *url.URL) []map[string]any {
				rows := []map[string]any{}
				for _, version := range []uint16{tls.VersionTLS12, tls.VersionTLS13} {
					transport := &http.Transport{DisableKeepAlives: true, TLSClientConfig: &tls.Config{MinVersion: version, MaxVersion: version, NextProtos: []string{"http/1.1"}}}
					if proxy != nil {
						transport.Proxy = http.ProxyURL(proxy)
					}
					client := &http.Client{Timeout: time.Duration(timeout) * time.Millisecond, Transport: transport, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
					samples := []map[string]any{}
					passed := 0
					for i := 0; i < attempts && ctx.Err() == nil; i++ {
						sample := tlsStabilitySample(ctx, client, target)
						sample["attempt"] = i + 1
						samples = append(samples, sample)
						if sample["ok"] == true {
							passed++
						}
					}
					transport.CloseIdleConnections()
					rows = append(rows, map[string]any{"variant": name, "tls": tlsVersionName(version), "passed": passed, "total": len(samples), "requested": attempts, "complete": len(samples) == attempts, "ok": passed == attempts && len(samples) == attempts, "samples": samples})
				}
				return rows
			}
			if outbound == nil {
				results[index] = task(nil)
			} else {
				results[index] = s.tlsStabilityOutbound(ctx, outbound, task)
				for _, row := range results[index] {
					row["variant"] = name
				}
			}
		}(index, variant.name, variant.outbound)
	}
	group.Wait()
	rows := []map[string]any{}
	healthy, complete := true, true
	for _, result := range results {
		for _, row := range result {
			rows = append(rows, row)
			healthy = healthy && row["ok"] == true
			complete = complete && row["complete"] == true
		}
	}
	return map[string]any{"ok": true, "host": host, "tag": tag, "fragmentEnabled": fragment, "healthy": healthy, "complete": complete, "results": rows, "bodyLimitBytes": 1 << 20,
		"hint": "Проверяются новые HTTPS-соединения и до 1 МиБ тела ответа с проверкой сертификатов. Прямой запрос с роутера может дополнительно перехватываться его внешним шлюзом. Рабочие настройки и процесс Xray не изменяются."}
}
