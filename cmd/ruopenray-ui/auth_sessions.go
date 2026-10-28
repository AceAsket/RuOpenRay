package main

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

type loginAttempt struct {
	Count int
	Until time.Time
}

func (s *serverState) panelPassword() string {
	s.sessionsMu.RLock()
	defer s.sessionsMu.RUnlock()
	return s.cfg.Password
}

func (s *serverState) rememberSigningKey() (string, error) {
	return s.rememberSigningKeyFor(true)
}

func (s *serverState) rememberSigningKeyFor(create bool) (string, error) {
	s.sessionsMu.Lock()
	defer s.sessionsMu.Unlock()
	if s.cfg.DataDir == "" {
		return s.cfg.Password, nil
	} // In-memory embeddings/tests.
	if s.rememberKey == "" {
		path := filepath.Join(s.cfg.DataDir, "auth-signing-key")
		body, err := os.ReadFile(path)
		if os.IsNotExist(err) {
			if !create {
				return "", err
			}
			if err = os.MkdirAll(s.cfg.DataDir, 0700); err != nil {
				return "", err
			}
			key := make([]byte, 32)
			if _, err = rand.Read(key); err != nil {
				return "", err
			}
			body = []byte(hex.EncodeToString(key))
			if err = writeFileAtomic(path, body, 0600); err != nil {
				return "", err
			}
		} else if err != nil {
			return "", err
		}
		decoded, err := hex.DecodeString(string(body))
		if err != nil || len(decoded) != 32 {
			return "", fmt.Errorf("Некорректный ключ авторизации")
		}
		s.rememberKey = string(body)
	}
	return s.rememberKey + ":" + s.cfg.Password, nil
}

func requestSessionToken(r *http.Request) string {
	if header := r.Header.Get("Authorization"); strings.HasPrefix(strings.ToLower(header), "bearer ") {
		return strings.TrimSpace(header[7:])
	}
	cookie, err := r.Cookie("openray_session")
	if err != nil {
		return ""
	}
	return cookie.Value
}

func (s *serverState) revokedSessionsLocked() (map[string]time.Time, error) {
	values := map[string]time.Time{}
	if s.cfg.DataDir == "" {
		if s.revokedMemory == nil {
			s.revokedMemory = values
		}
		return s.revokedMemory, nil
	}
	body, err := os.ReadFile(filepath.Join(s.cfg.DataDir, "auth-revoked.json"))
	if os.IsNotExist(err) {
		return values, nil
	}
	if err != nil {
		return nil, err
	}
	if err = json.Unmarshal(body, &values); err != nil {
		return nil, err
	}
	if values == nil {
		return nil, fmt.Errorf("Некорректное хранилище отозванных сессий")
	}
	for key, until := range values {
		if time.Now().After(until) {
			delete(values, key)
		}
	}
	return values, nil
}

func (s *serverState) sessionRevoked(token string) bool {
	s.sessionsMu.Lock()
	defer s.sessionsMu.Unlock()
	values, err := s.revokedSessionsLocked()
	return err != nil || time.Now().Before(values[draftRevision([]byte(token))])
}

func (s *serverState) revokeSession(token string) error {
	s.sessionsMu.Lock()
	defer s.sessionsMu.Unlock()
	if strings.HasPrefix(token, "remember.") {
		values, err := s.revokedSessionsLocked()
		if err != nil {
			return err
		}
		if len(values) >= 4096 {
			return fmt.Errorf("Лимит отозванных сессий; измените пароль для выхода всех устройств")
		}
		values[draftRevision([]byte(token))] = time.Now().Add(rememberSessionTTL)
		if s.cfg.DataDir != "" {
			body, _ := json.Marshal(values)
			if err = writeFileAtomic(filepath.Join(s.cfg.DataDir, "auth-revoked.json"), body, 0600); err != nil {
				return err
			}
		}
	}
	delete(s.sessions, token)
	delete(s.sessionUntil, token)
	return nil
}

func (s *serverState) loginLimited(r *http.Request, failed bool, reset bool) bool {
	s.loginMu.Lock()
	defer s.loginMu.Unlock()
	key, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		key = r.RemoteAddr
	}
	now := time.Now()
	if s.loginAttempts == nil {
		s.loginAttempts = map[string]loginAttempt{}
	}
	for address, attempt := range s.loginAttempts {
		if now.After(attempt.Until) {
			delete(s.loginAttempts, address)
		}
	}
	if reset {
		delete(s.loginAttempts, key)
		return false
	}
	attempt := s.loginAttempts[key]
	if attempt.Count >= 5 {
		return true
	}
	if failed {
		if len(s.loginAttempts) >= 256 && attempt.Count == 0 {
			return true
		}
		if attempt.Count == 0 {
			attempt.Until = now.Add(time.Minute)
		}
		attempt.Count++
		s.loginAttempts[key] = attempt
	}
	return false
}
