package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestInvalidRememberTokenDoesNotCreateSigningKey(t *testing.T) {
	s := reliabilityState(t)
	req := httptest.NewRequest(http.MethodGet, "/api/auth/check", nil)
	req.Header.Set("Authorization", "Bearer remember.v1.invalid.invalid")
	if s.authed(req) {
		t.Fatal("accepted invalid remember token")
	}
	if _, err := os.Stat(filepath.Join(s.cfg.DataDir, "auth-signing-key")); !os.IsNotExist(err) {
		t.Fatalf("unauthenticated request created signing key: %v", err)
	}
}

func TestRememberSessionExpiryCannotBeBypassedBySessionMap(t *testing.T) {
	s := reliabilityState(t)
	s.cfg.Password = "fixture-password"
	key, err := s.rememberSigningKey()
	if err != nil {
		t.Fatal(err)
	}
	token := signedRememberToken(key, time.Now().Add(-time.Minute))
	s.addSession(token)
	req := httptest.NewRequest(http.MethodGet, "/api/auth/check", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	if s.authed(req) {
		t.Fatal("expired remembered token accepted through session map")
	}
}

func TestRememberLogoutRevocationSurvivesRestart(t *testing.T) {
	s := reliabilityState(t)
	s.cfg.Password = "fixture-password"
	rec := httptest.NewRecorder()
	s.handleAPI(rec, httptest.NewRequest(http.MethodPost, "/api/login", strings.NewReader(`{"password":"fixture-password","remember":true}`)))
	var login map[string]any
	json.Unmarshal(rec.Body.Bytes(), &login)
	token, _ := login["token"].(string)
	if token == "" {
		t.Fatal(rec.Body.String())
	}
	req := httptest.NewRequest(http.MethodPost, "/api/logout", strings.NewReader(`{}`))
	req.Header.Set("Authorization", "Bearer "+token)
	rec = httptest.NewRecorder()
	s.handleAPI(rec, req)
	if rec.Code != 200 {
		t.Fatal(rec.Body.String())
	}
	restarted := &serverState{cfg: s.cfg}
	check := httptest.NewRequest(http.MethodGet, "/api/auth/check", nil)
	check.Header.Set("Authorization", "Bearer "+token)
	if restarted.authed(check) {
		t.Fatal("logged-out token survived restart")
	}
}

func TestPanelLoginRateLimitAndNormalSessionTTL(t *testing.T) {
	s := reliabilityState(t)
	s.cfg.Password = "fixture-password"
	for i := 0; i < 6; i++ {
		rec := httptest.NewRecorder()
		s.handleAPI(rec, httptest.NewRequest(http.MethodPost, "/api/login", strings.NewReader(`{"password":"wrong"}`)))
		if i == 5 && rec.Code != 429 {
			t.Fatalf("missing rate limit: %d", rec.Code)
		}
	}
	s.addSession("expired")
	s.sessionUntil["expired"] = time.Now().Add(-time.Minute)
	if s.hasSession("expired") {
		t.Fatal("expired normal session accepted")
	}
}
