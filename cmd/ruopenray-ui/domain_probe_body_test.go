package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestDirectHTTPProbeRejectsTruncatedBody(t *testing.T) {
	remote := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Length", "8192")
		w.WriteHeader(200)
		time.Sleep(10 * time.Millisecond)
		w.Write([]byte("truncated"))
	}))
	defer remote.Close()
	if result := directHTTPProbe(remote.URL, 500, 1); result["ok"] != false {
		t.Fatal(result)
	}
}

func TestDirectHTTPProbeAcceptsFastCompleteBody(t *testing.T) {
	remote := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.Write([]byte("complete")) }))
	defer remote.Close()
	if result := directHTTPProbe(remote.URL, 500, 1); result["ok"] != true || result["bodyComplete"] != true {
		t.Fatal(result)
	}
}
