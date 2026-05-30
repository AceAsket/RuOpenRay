package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestAPILoginAndAuth(t *testing.T) {
	state := &serverState{
		cfg:      appConfig{Password: "secret-pass"},
		sessions: map[string]bool{},
	}

	unauthorized := httptest.NewRecorder()
	state.handleAPI(unauthorized, httptest.NewRequest(http.MethodGet, "/api/status", nil))
	if unauthorized.Code != http.StatusUnauthorized {
		t.Fatalf("expected unauthorized status, got %d", unauthorized.Code)
	}

	login := httptest.NewRecorder()
	state.handleAPI(login, httptest.NewRequest(http.MethodPost, "/api/login", strings.NewReader(`{"password":"secret-pass"}`)))
	if login.Code != http.StatusOK {
		t.Fatalf("expected successful login, got %d: %s", login.Code, login.Body.String())
	}
	if state.sessionCount() != 1 {
		t.Fatalf("expected one session, got %d", state.sessionCount())
	}
	if cookie := login.Result().Cookies(); len(cookie) == 0 || cookie[0].Name != "openray_session" {
		t.Fatalf("login did not set session cookie")
	}
}

func TestAPILoginRejectsWrongPassword(t *testing.T) {
	state := &serverState{
		cfg:      appConfig{Password: "secret-pass"},
		sessions: map[string]bool{},
	}
	response := httptest.NewRecorder()
	state.handleAPI(response, httptest.NewRequest(http.MethodPost, "/api/login", strings.NewReader(`{"password":"wrong"}`)))
	if response.Code != http.StatusUnauthorized {
		t.Fatalf("expected unauthorized status, got %d", response.Code)
	}
	if state.sessionCount() != 0 {
		t.Fatalf("wrong password created sessions: %#v", state.sessions)
	}
}

func TestAPILoginRejectsOversizedBody(t *testing.T) {
	state := &serverState{
		cfg: appConfig{Password: "secret-pass"},
	}
	response := httptest.NewRecorder()
	body := strings.NewReader(`{"password":"` + strings.Repeat("x", maxJSONBodyBytes) + `"}`)
	state.handleAPI(response, httptest.NewRequest(http.MethodPost, "/api/login", body))
	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected bad request status, got %d", response.Code)
	}
	if state.sessionCount() != 0 {
		t.Fatalf("oversized body created sessions: %#v", state.sessions)
	}
}
