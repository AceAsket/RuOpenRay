package dnsconfig

import (
	"context"
	"encoding/binary"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func benchmarkAnswer(query []byte) []byte {
	answer := append([]byte{}, query...)
	answer[2], answer[3], answer[7] = 0x81, 0x80, 1
	qtype := binary.BigEndian.Uint16(query[len(query)-4 : len(query)-2])
	address := []byte{1, 1, 1, 1}
	if qtype == 28 {
		address = []byte{0x26, 0x06, 0x47, 0, 0x47, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x11, 0x11}
	}
	answer = append(answer, 0xc0, 0x0c, byte(qtype>>8), byte(qtype), 0, 1, 0, 0, 0, 30, 0, byte(len(address)))
	return append(answer, address...)
}

func TestDoHBenchmarkValidatesDNSResponsesAndReportsPartialFailure(t *testing.T) {
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.Header.Get("Accept") != "application/dns-message" || r.Header.Get("Content-Type") != "application/dns-message" {
			t.Error("not an RFC8484 wire request")
		}
		query, _ := io.ReadAll(r.Body)
		answer := benchmarkAnswer(query)
		if binary.BigEndian.Uint16(query[len(query)-4:len(query)-2]) == 28 {
			answer[3] = 0x82 // SERVFAIL must not be counted as a fast success.
		}
		w.Header().Set("Content-Type", "application/dns-message")
		_, _ = w.Write(answer)
	}))
	defer server.Close()
	result := benchmarkDoH(context.Background(), server.URL, server.Client())
	if result.OK || result.Succeeded != 2 || len(result.Samples) != 3 || result.MedianMS == nil || result.Samples[1].ErrorCode != "dns" {
		t.Fatalf("benchmark = %+v", result)
	}
}

func TestDoHExchangeRejectsHTMLWrongIDQuestionTruncationAndMissingAnswers(t *testing.T) {
	for _, scenario := range []string{"html", "id", "question", "truncated", "empty", "oversized", "short", "redirect"} {
		t.Run(scenario, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				query, _ := io.ReadAll(r.Body)
				answer := benchmarkAnswer(query)
				w.Header().Set("Content-Type", "application/dns-message")
				switch scenario {
				case "html":
					w.Header().Set("Content-Type", "text/html")
				case "id":
					answer[0] ^= 1
				case "question":
					answer[13] ^= 1
				case "truncated":
					answer[2] |= 2
				case "empty":
					answer[7] = 0
				case "oversized":
					answer = append(answer, make([]byte, 65536)...)
				case "short":
					answer = answer[:8]
				case "redirect":
					w.Header().Set("Location", "http://127.0.0.1/private")
					w.WriteHeader(302)
				}
				_, _ = w.Write(answer)
			}))
			defer server.Close()
			client := server.Client()
			client.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
			query, _ := dnsWireQuery("example.com", 1)
			if err := dohExchange(context.Background(), client, server.URL, query, 1); err == nil {
				t.Fatal("bad response counted as success")
			}
		})
	}
}

func TestDoHBenchmarkEnforcesTLSVerificationAndTimeout(t *testing.T) {
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(40 * time.Millisecond)
	}))
	defer server.Close()
	result := BenchmarkDoH(context.Background(), server.URL)
	if result.Succeeded != 0 || result.MedianMS != nil || result.Samples[0].ErrorCode != "tls" {
		t.Fatalf("TLS verification bypassed: %+v", result)
	}
	client := server.Client()
	client.Timeout = 10 * time.Millisecond
	result = benchmarkDoH(context.Background(), server.URL, client)
	if result.Succeeded != 0 || result.Samples[0].ErrorCode != "timeout" {
		t.Fatalf("timeout = %+v", result)
	}
}
