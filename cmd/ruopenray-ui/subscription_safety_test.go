package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"testing"

	rsubscription "github.com/AceAsket/RuOpenRay/internal/subscription"
)

func TestSubscriptionRefreshFailurePreservesWorkingPool(t *testing.T) {
	for _, content := range []string{"", "trojan://secret@example.test?allowInsecure=true", "trojan://ok@example.test\nunknown://secret@example.test"} {
		t.Run(content[:min(len(content), 6)], func(t *testing.T) {
			remote := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { _, _ = w.Write([]byte(content)) }))
			defer remote.Close()
			state := &serverState{cfg: appConfig{DataDir: t.TempDir()}}
			store := rsubscription.Store{Pools: []rsubscription.Pool{{Tag: "working", URL: remote.URL, Active: 0, Candidates: []map[string]any{subscriptionTestOutbound("old", "working.test", 443)}}}}
			before, _ := json.Marshal(store)
			next, result := state.refreshSubscriptionPoolInStore(store, 0, "")
			after, _ := json.Marshal(next)
			if result["ok"] != false || !bytes.Equal(before, after) {
				t.Fatal("failed refresh modified the working pool")
			}
		})
	}
}

func TestSubscriptionConfigValidationFailurePreservesFile(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("Linux command fixture; real Xray covered separately")
	}
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "xray"), []byte("#!/bin/sh\nexit 23\n"), 0700); err != nil {
		t.Fatal(err)
	}
	t.Setenv("PATH", dir+string(os.PathListSeparator)+os.Getenv("PATH"))
	s := &serverState{cfg: appConfig{DataDir: dir, ActiveConfig: filepath.Join(dir, "config.json"), BackupDir: filepath.Join(dir, "backups")}}
	before := []byte(`{"outbounds":[{"protocol":"freedom","tag":"working"}]}`)
	if err := os.WriteFile(s.cfg.ActiveConfig, before, 0600); err != nil {
		t.Fatal(err)
	}
	store := rsubscription.Store{Pools: []rsubscription.Pool{{Tag: "working", Active: 0, Candidates: []map[string]any{subscriptionTestOutbound("new", "invalid.test", 443)}}}}
	result := s.applySubscriptionActiveOutbounds(store, []int{0}, false)
	after, _ := os.ReadFile(s.cfg.ActiveConfig)
	if result["ok"] != false || !bytes.Equal(before, after) {
		t.Fatalf("rejected config changed live file: %v", result)
	}
}
