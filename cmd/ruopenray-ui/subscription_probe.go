package main

import (
	"bytes"
	"fmt"
	"net/url"
	"strings"
	"sync"
)

// Xray writes logs concurrently with probes. Keep a bounded, synchronized tail.
type probeLogBuffer struct {
	mu   sync.Mutex
	body []byte
}

func (b *probeLogBuffer) Write(p []byte) (int, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	n := len(p)
	b.body = append(b.body, p...)
	if len(b.body) > 32768 {
		b.body = append([]byte(nil), b.body[len(b.body)-32768:]...)
	}
	return n, nil
}
func (b *probeLogBuffer) String() string {
	b.mu.Lock()
	defer b.mu.Unlock()
	return string(bytes.Clone(b.body))
}

func subscriptionProbeTargets(preferred string) []string {
	const google = "https://www.gstatic.com/generate_204"
	// An explicit custom URL is a targeted diagnostic, not a general health check.
	if preferred != "" && preferred != google {
		return []string{preferred}
	}
	return []string{google, "https://cp.cloudflare.com/generate_204"}
}

func subscriptionProbeFailure(err error) (string, string) {
	text := ""
	if err != nil {
		text = strings.ToLower(err.Error())
	}
	contains := func(terms ...string) bool {
		for _, term := range terms {
			if strings.Contains(text, term) {
				return true
			}
		}
		return false
	}
	switch {
	case contains("unknown user", "invalid user", "invalid password", "authentication failed", "invalid authentication", "unauthorized user"):
		return "auth", "Сервер отклонил авторизацию; проверьте UUID или пароль"
	case contains("x509:", "certificate", "tls handshake", "tls:", "reality verification"):
		return "tls", "Ошибка TLS/REALITY; проверьте сертификат, SNI и параметры защиты"
	case contains("no such host", "dns lookup", "failed to lookup", "failed to resolve", "name resolution"):
		return "dns", "Не удалось разрешить DNS-имя сервера или проверочного сайта"
	case contains("http status"):
		return "http", "Проверочный сайт вернул неожиданный HTTP-статус"
	case contains("timeout", "deadline exceeded", "timed out"):
		return "timeout", "Истекло время ожидания ответа через туннель"
	case contains("connection refused", "network is unreachable", "no route to host"):
		return "connect", "Не удалось установить сетевое соединение"
	case contains("executable file not found", "failed to start", "failed to load config"):
		return "core", "Не удалось запустить проверочный процесс Xray"
	default:
		return "tunnel", "Туннель не передал запрос. Причина не определена: проверьте доступность сервера, UUID/пароль и транспорт"
	}
}

type subscriptionProbeAttempt struct {
	Target  string `json:"target"`
	OK      bool   `json:"ok"`
	Latency int64  `json:"latencyMs"`
	Code    string `json:"errorCode,omitempty"`
	Error   string `json:"error,omitempty"`
}
type subscriptionProbeError struct{ code, message string }

func (e *subscriptionProbeError) Error() string { return e.message }

func runSubscriptionProbes(targets []string, probe func(string) (int64, bool, error)) (int64, bool, []subscriptionProbeAttempt, error) {
	results := []subscriptionProbeAttempt{}
	codes, messages := []string{}, []string{}
	for _, target := range targets {
		latency, ok, err := probe(target)
		safeTarget := "проверочный адрес"
		if parsed, parseErr := url.Parse(target); parseErr == nil && parsed.Hostname() != "" {
			safeTarget = parsed.Hostname()
		}
		result := subscriptionProbeAttempt{Target: safeTarget, OK: ok, Latency: latency}
		if ok {
			results = append(results, result)
			return latency, true, results, nil
		}
		result.Code, result.Error = subscriptionProbeFailure(err)
		codes = append(codes, result.Code)
		messages = append(messages, fmt.Sprintf("%s: %s", safeTarget, result.Error))
		results = append(results, result)
	}
	code := "tunnel"
	if len(codes) > 0 {
		code = codes[0]
		for _, item := range codes[1:] {
			if item != code {
				code = "mixed"
				break
			}
		}
	}
	return 0, false, results, &subscriptionProbeError{code, "Проверка трафика не пройдена. " + strings.Join(messages, "; ")}
}

func (s *serverState) subscriptionTrafficProbe(outbound map[string]any, preferred string, timeoutMs, attempts int) (int64, bool, []subscriptionProbeAttempt, error) {
	return runSubscriptionProbes(subscriptionProbeTargets(preferred), func(target string) (int64, bool, error) {
		return s.httpOutboundProbeStatus(outbound, target, timeoutMs, attempts, true)
	})
}

func subscriptionProbeCode(err error) string {
	if failure, ok := err.(*subscriptionProbeError); ok {
		return failure.code
	}
	code, _ := subscriptionProbeFailure(err)
	return code
}
