package main

import (
	"encoding/base64"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestCleanProfileName(t *testing.T) {
	tests := []struct {
		name string
		in   string
		want string
	}{
		{name: "adds json extension", in: "default", want: "default.json"},
		{name: "cleans unsafe characters", in: "../My Profile!*", want: "My-Profile-.json"},
		{name: "empty fallback", in: "", want: "profile.json"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := cleanProfileName(tt.in); got != tt.want {
				t.Fatalf("cleanProfileName(%q) = %q, want %q", tt.in, got, tt.want)
			}
		})
	}
}

func TestOutboundTagFallback(t *testing.T) {
	tests := []struct {
		in   string
		want string
	}{
		{in: "outbound:cloud one!", want: "cloud-one"},
		{in: "balancer:auto:ru", want: "auto:ru"},
		{in: "<nil>", want: ""},
	}

	for _, tt := range tests {
		t.Run(tt.in, func(t *testing.T) {
			if got := outboundTagFallback(tt.in); got != tt.want {
				t.Fatalf("outboundTagFallback(%q) = %q, want %q", tt.in, got, tt.want)
			}
		})
	}
}

func TestProfileNameFallback(t *testing.T) {
	if got := profileNameFallback("", " <nil> ", "subscription client"); got != "subscription client" {
		t.Fatalf("profileNameFallback skipped invalid values incorrectly: %q", got)
	}
	if got := profileNameFallback("", "undefined", "null"); got != "profile" {
		t.Fatalf("profileNameFallback empty fallback = %q, want profile", got)
	}
}

func TestProfileNameFromURL(t *testing.T) {
	tests := []struct {
		raw  string
		want string
	}{
		{raw: "https://example.com/sub/path.txt", want: "path"},
		{raw: "https://sub.example.com/", want: "sub"},
	}
	for _, tt := range tests {
		t.Run(tt.raw, func(t *testing.T) {
			if got := profileNameFromURL(tt.raw); got != tt.want {
				t.Fatalf("profileNameFromURL(%q) = %q, want %q", tt.raw, got, tt.want)
			}
		})
	}
}

func TestSubscriptionLinksUsesBasicAuthFromURL(t *testing.T) {
	wantAuth := "Basic " + base64.StdEncoding.EncodeToString([]byte("user:secret"))
	gotAuth := ""
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAuth = r.Header.Get("Authorization")
		_, _ = w.Write([]byte("vless://client@example.com:443?security=reality#client"))
	}))
	defer server.Close()

	rawURL := "http://user:secret@" + strings.TrimPrefix(server.URL, "http://")
	links, err := subscriptionLinks(rawURL)
	if err != nil {
		t.Fatalf("subscriptionLinks returned error: %v", err)
	}
	if gotAuth != wantAuth {
		t.Fatalf("Authorization = %q, want %q", gotAuth, wantAuth)
	}
	if len(links) != 1 {
		t.Fatalf("links = %d, want 1", len(links))
	}
}

func TestListProfilesReturnsEmptyArray(t *testing.T) {
	dir := t.TempDir()
	profilesDir := filepath.Join(dir, "profiles")
	if err := os.MkdirAll(profilesDir, 0o755); err != nil {
		t.Fatalf("create profiles dir: %v", err)
	}
	active := filepath.Join(dir, "config.json")
	if err := os.WriteFile(active, []byte(`{"outbounds":[]}`), 0o600); err != nil {
		t.Fatalf("write active config: %v", err)
	}
	state := &serverState{cfg: appConfig{ProfilesDir: profilesDir, ActiveConfig: active}}
	profiles, err := state.listProfiles()
	if err != nil {
		t.Fatalf("listProfiles returned error: %v", err)
	}
	if profiles == nil {
		t.Fatal("listProfiles returned nil slice, want empty slice for JSON []")
	}
	if len(profiles) != 0 {
		t.Fatalf("listProfiles returned %d profiles, want 0", len(profiles))
	}
}
