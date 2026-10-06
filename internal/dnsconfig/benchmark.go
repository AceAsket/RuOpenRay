package dnsconfig

import (
	"bytes"
	"context"
	"crypto/tls"
	"crypto/x509"
	"errors"
	"fmt"
	"io"
	"mime"
	"net"
	"net/http"
	"sort"
	"time"
)

type DoHSample struct {
	Host      string  `json:"host"`
	Type      string  `json:"type"`
	OK        bool    `json:"ok"`
	MS        float64 `json:"ms"`
	ErrorCode string  `json:"errorCode,omitempty"`
	Error     string  `json:"error,omitempty"`
}

type DoHBenchmark struct {
	URL       string      `json:"url"`
	OK        bool        `json:"ok"`
	Succeeded int         `json:"succeeded"`
	MedianMS  *float64    `json:"medianMs,omitempty"`
	Samples   []DoHSample `json:"samples"`
}

// Each resolver has a fresh verified TLS connection; subsequent requests may
// reuse it. No environment proxy, DNS fallback, redirect or insecure TLS.
func BenchmarkDoH(ctx context.Context, endpoint string) DoHBenchmark {
	transport := &http.Transport{Proxy: nil, ForceAttemptHTTP2: true,
		TLSClientConfig:     &tls.Config{MinVersion: tls.VersionTLS12},
		DialContext:         (&net.Dialer{Timeout: 3 * time.Second}).DialContext,
		TLSHandshakeTimeout: 3 * time.Second}
	defer transport.CloseIdleConnections()
	client := &http.Client{Transport: transport, Timeout: 3 * time.Second,
		CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	return benchmarkDoH(ctx, endpoint, client)
}

func benchmarkDoH(ctx context.Context, endpoint string, client *http.Client) DoHBenchmark {
	result := DoHBenchmark{URL: endpoint, Samples: []DoHSample{}}
	var times []float64
	for _, check := range []struct {
		host, name string
		qtype      uint16
	}{{"example.com", "A", 1}, {"example.org", "AAAA", 28}, {"cloudflare.com", "A", 1}} {
		sample := DoHSample{Host: check.host, Type: check.name}
		query, _ := dnsWireQuery(check.host, check.qtype)
		started := time.Now()
		err := dohExchange(ctx, client, endpoint, query, check.qtype)
		sample.MS = float64(time.Since(started).Microseconds()) / 1000
		if err == nil {
			sample.OK = true
			result.Succeeded++
			times = append(times, sample.MS)
		} else {
			sample.ErrorCode, sample.Error = dohError(err)
		}
		result.Samples = append(result.Samples, sample)
	}
	result.OK = result.Succeeded == len(result.Samples)
	if len(times) > 0 {
		sort.Float64s(times)
		median := times[len(times)/2]
		if len(times)%2 == 0 {
			median = (times[len(times)/2-1] + median) / 2
		}
		result.MedianMS = &median
	}
	return result
}

type dohResponseError struct{ code, message string }

func (e *dohResponseError) Error() string { return e.message }

func dohExchange(ctx context.Context, client *http.Client, endpoint string, query []byte, qtype uint16) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(query))
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/dns-message")
	req.Header.Set("Content-Type", "application/dns-message")
	req.Header.Set("User-Agent", "RuOpenRay DoH check")
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return &dohResponseError{"http", fmt.Sprintf("HTTP %d", resp.StatusCode)}
	}
	mediaType, _, _ := mime.ParseMediaType(resp.Header.Get("Content-Type"))
	if mediaType != "application/dns-message" {
		return &dohResponseError{"response", "Ответ не является DNS-сообщением"}
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 65536))
	if err != nil {
		return err
	}
	if len(body) < 12 || len(body) > 65535 || !bytes.Equal(body[:2], query[:2]) || body[2]&0xf8 != 0x80 || body[2]&2 != 0 || body[3]&0xf != 0 {
		return &dohResponseError{"dns", "Некорректный DNS-ответ, ошибка DNS или усечённое сообщение"}
	}
	// Match the echoed question as well as the ID, then parse actual A/AAAA data.
	if int(body[4]) != 0 || body[5] != 1 || len(body) < len(query) || !bytes.Equal(body[12:len(query)], query[12:]) {
		return &dohResponseError{"dns", "DNS-вопрос в ответе не совпадает с запросом"}
	}
	addresses, err := parseDNSWireAnswers(body, qtype)
	if err != nil || len(addresses) == 0 {
		return &dohResponseError{"dns", "Нет корректного ответа A/AAAA для проверочного домена"}
	}
	return nil
}

func dohError(err error) (string, string) {
	var response *dohResponseError
	if errors.As(err, &response) {
		return response.code, response.message
	}
	var certificate *tls.CertificateVerificationError
	var unknown x509.UnknownAuthorityError
	var hostname x509.HostnameError
	if errors.As(err, &certificate) || errors.As(err, &unknown) || errors.As(err, &hostname) {
		return "tls", "Ошибка проверки сертификата TLS"
	}
	var network net.Error
	if errors.Is(err, context.DeadlineExceeded) || (errors.As(err, &network) && network.Timeout()) {
		return "timeout", "Нет ответа за 3 секунды"
	}
	return "connect", "Не удалось установить или завершить HTTPS-соединение"
}
