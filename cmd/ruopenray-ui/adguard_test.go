package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

type adGuardFake struct {
	upstreams, rules                []string
	failRulesOnce                   bool
	pendingFilterReads, cacheClears int
	server                          *httptest.Server
}

func newAdGuardFake(t *testing.T) (*serverState, *adGuardFake) {
	t.Helper()
	fake := &adGuardFake{upstreams: []string{"https://dns.example/dns-query", "[/lan/]192.168.1.1"}, rules: []string{"||ads.example^", "@@||personal.example^"}}
	fake.server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		user, password, _ := r.BasicAuth()
		if user != "admin" || password != "test-secret" {
			w.WriteHeader(401)
			return
		}
		var payload map[string]any
		if r.Method == "POST" {
			_ = json.NewDecoder(r.Body).Decode(&payload)
		}
		switch r.URL.Path {
		case "/control/status":
			writeJSON(w, 200, map[string]any{"running": true, "protection_enabled": true, "version": "test"})
		case "/control/dns_info":
			writeJSON(w, 200, map[string]any{"upstream_dns": fake.upstreams})
		case "/control/filtering/status":
			writeJSON(w, 200, map[string]any{"user_rules": fake.rules, "enabled": true})
		case "/control/stats":
			writeJSON(w, 200, map[string]any{"num_dns_queries": 10, "num_blocked_filtering": 2})
		case "/control/cache_clear":
			fake.cacheClears++
			_, _ = w.Write([]byte("OK"))
		case "/control/filtering/check_host":
			if fake.pendingFilterReads > 0 {
				fake.pendingFilterReads--
				writeJSON(w, 200, map[string]any{"reason": "FilteredBlackList"})
				return
			}
			rule := "@@||" + r.URL.Query().Get("name") + "^"
			result := map[string]any{"reason": "NotFilteredNotFound"}
			for _, item := range fake.rules {
				if item == rule {
					result["reason"], result["rule"] = "NotFilteredWhiteList", rule
				}
			}
			writeJSON(w, 200, result)
		case "/control/dns_config":
			fake.upstreams = stringSlice(payload["upstream_dns"])
			_, _ = w.Write([]byte("OK"))
		case "/control/filtering/set_rules":
			if fake.failRulesOnce {
				fake.failRulesOnce = false
				w.WriteHeader(500)
				return
			}
			fake.rules = stringSlice(payload["rules"])
			_, _ = w.Write([]byte("OK"))
		case "/control/test_upstream_dns":
			probes := map[string]string{}
			for _, resolver := range stringSlice(payload["upstream_dns"]) {
				probes[adGuardDoHURLKey(resolver)] = "OK"
			}
			writeJSON(w, 200, probes)
		default:
			w.WriteHeader(404)
		}
	}))
	t.Cleanup(fake.server.Close)
	dir := t.TempDir()
	s := &serverState{cfg: appConfig{DataDir: dir, ProfilesDir: filepath.Join(dir, "profiles"), ActiveConfig: filepath.Join(dir, "config.json")}}
	if err := os.MkdirAll(s.cfg.ProfilesDir, 0700); err != nil {
		t.Fatal(err)
	}
	if err := s.saveAdGuardSettings(adGuardSettings{Enabled: true, URL: fake.server.URL, Username: "admin", Password: "test-secret", BootstrapDNS: []string{"https://8.8.8.8/dns-query", "https://1.1.1.1/dns-query"}}); err != nil {
		t.Fatal(err)
	}
	return s, fake
}

func adGuardTestConfig(host string) map[string]any {
	return map[string]any{
		"outbounds": []any{map[string]any{"protocol": "vless", "settings": map[string]any{"vnext": []any{map[string]any{"address": host}}}}, map[string]any{"protocol": "trojan", "settings": map[string]any{"servers": []any{map[string]any{"address": "trojan.example"}}}}},
		"routing":   map[string]any{"rules": []any{map[string]any{"domain": []string{"must-stay-filtered.example"}}}},
		"dns":       map[string]any{"servers": []string{"https://do-not-exempt.example/dns-query"}},
	}
}

func TestAdGuardBootstrapBeforeProfileAndActiveWrite(t *testing.T) {
	s, fake := newAdGuardFake(t)
	if _, err := s.saveProfileConfig("test", adGuardTestConfig("FIRST.Example.")); err != nil {
		t.Fatal(err)
	}
	if err := s.writeActiveConfigRaw(adGuardTestConfig("new.example")); err != nil {
		t.Fatal(err)
	}
	cfg, _ := s.loadAdGuardSettings()
	if !reflect.DeepEqual(cfg.Domains, []string{"first.example", "new.example", "trojan.example"}) {
		t.Fatalf("domains = %v", cfg.Domains)
	}
	if len(fake.upstreams) != 4 || fake.upstreams[0] != "https://dns.example/dns-query" || fake.rules[0] != "||ads.example^" {
		t.Fatalf("user settings lost: %v %v", fake.upstreams, fake.rules)
	}
	for _, rule := range fake.rules {
		if strings.Contains(rule, "must-stay-filtered") || strings.Contains(rule, "do-not-exempt") {
			t.Fatal("routing and general DNS domains must not bypass filtering")
		}
	}
	before := append([]string{}, fake.upstreams...)
	if err := s.withAdGuardBootstrap(nil, func() error { return nil }); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(before, fake.upstreams) {
		t.Fatal("sync is not idempotent")
	}
	if err := os.Remove(s.profilePath("test")); err != nil {
		t.Fatal(err)
	}
	if err := s.withAdGuardBootstrap(nil, func() error { return nil }); err != nil {
		t.Fatal(err)
	}
	cfg, _ = s.loadAdGuardSettings()
	if !reflect.DeepEqual(cfg.Domains, []string{"new.example", "trojan.example"}) {
		t.Fatalf("stale domain retained: %v", cfg.Domains)
	}
}

func TestAdGuardFailureLeavesVPNAndSettingsUnchanged(t *testing.T) {
	for _, writeFailure := range []bool{false, true} {
		t.Run(map[bool]string{false: "API", true: "disk"}[writeFailure], func(t *testing.T) {
			s, fake := newAdGuardFake(t)
			baseline := []byte(`{"outbounds":[]}`)
			if err := os.WriteFile(s.cfg.ActiveConfig, baseline, 0600); err != nil {
				t.Fatal(err)
			}
			before, _ := os.ReadFile(s.adGuardSettingsPath())
			ups, rules := append([]string{}, fake.upstreams...), append([]string{}, fake.rules...)
			if !writeFailure {
				fake.failRulesOnce = true
			}
			called := false
			err := s.withAdGuardBootstrap(adGuardTestConfig("new.example"), func() error { called = true; return errors.New("disk full") })
			if err == nil || called != writeFailure {
				t.Fatalf("error = %v, write called = %v", err, called)
			}
			after, _ := os.ReadFile(s.cfg.ActiveConfig)
			settings, _ := os.ReadFile(s.adGuardSettingsPath())
			if string(after) != string(baseline) || string(settings) != string(before) || !reflect.DeepEqual(ups, fake.upstreams) || !reflect.DeepEqual(rules, fake.rules) {
				t.Fatal("transaction did not restore baseline")
			}
		})
	}
}

func TestAdGuardUnavailableBlocksConfigButDisabledDoesNot(t *testing.T) {
	s, fake := newAdGuardFake(t)
	fake.server.Close()
	if err := s.writeActiveConfigRaw(adGuardTestConfig("vpn.example")); err == nil {
		t.Fatal("unavailable AdGuard should block the write")
	}
	if _, err := os.Stat(s.cfg.ActiveConfig); !os.IsNotExist(err) {
		t.Fatal("active config was created despite failure")
	}
	cfg, _ := s.loadAdGuardSettings()
	cfg.Enabled = false
	if err := s.saveAdGuardSettings(cfg); err != nil {
		t.Fatal(err)
	}
	if err := s.writeActiveConfigRaw(adGuardTestConfig("vpn.example")); err != nil {
		t.Fatal(err)
	}
}

func TestAdGuardPauseKeepsBootstrapAndSecretPrivate(t *testing.T) {
	s, fake := newAdGuardFake(t)
	if err := s.writeActiveConfigRaw(adGuardTestConfig("vpn.example")); err != nil {
		t.Fatal(err)
	}
	_, err := s.adGuardAction(map[string]any{"action": "configure", "url": fake.server.URL, "username": "admin", "enabled": false})
	if err != nil {
		t.Fatal(err)
	}
	if len(fake.upstreams) != 4 || len(fake.rules) != 4 || fake.rules[0] != "||ads.example^" {
		t.Fatal("pausing automation must retain bootstrap and user settings")
	}
	status, _ := json.Marshal(s.adGuardIntegrationStatus())
	if strings.Contains(string(status), "test-secret") || strings.Contains(string(status), "password") {
		t.Fatal("credentials leaked in API")
	}
	info, _ := os.Stat(s.adGuardSettingsPath())
	if info.Mode().Perm()&0077 != 0 && os.Getenv("OS") != "Windows_NT" {
		t.Fatalf("settings mode = %v", info.Mode())
	}
}

func TestAdGuardDoesNotOwnExistingException(t *testing.T) {
	s, fake := newAdGuardFake(t)
	fake.rules = append(fake.rules, "@@||vpn.example^")
	if err := s.writeActiveConfigRaw(adGuardTestConfig("vpn.example")); err != nil {
		t.Fatal(err)
	}
	cfg, _ := s.loadAdGuardSettings()
	for _, rule := range cfg.ManagedRules {
		if rule == "@@||vpn.example^" {
			t.Fatal("adopted user's exception without authorization")
		}
	}
}

func TestAdGuardWaitsForEngineBeforeClearingCache(t *testing.T) {
	s, fake := newAdGuardFake(t)
	fake.pendingFilterReads = 2
	if err := s.writeActiveConfigRaw(adGuardTestConfig("vpn.example")); err != nil {
		t.Fatal(err)
	}
	if fake.pendingFilterReads != 0 || fake.cacheClears != 1 {
		t.Fatal("filter engine was not awaited before clearing cache")
	}
}

func TestAdGuardProfileMarkerFailureRestoresActiveConfig(t *testing.T) {
	s, _ := newAdGuardFake(t)
	baseline := []byte(`{"outbounds":[]}`)
	if err := os.WriteFile(s.cfg.ActiveConfig, baseline, 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := s.saveProfileConfig("candidate", adGuardTestConfig("vpn.example")); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(s.activeProfilePath(), 0700); err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest(http.MethodPost, "/api/profiles/activate", bytes.NewBufferString(`{"name":"candidate"}`))
	w := httptest.NewRecorder()
	s.activateProfile(w, req)
	after, _ := os.ReadFile(s.cfg.ActiveConfig)
	if w.Code != 500 || !bytes.Equal(baseline, after) {
		t.Fatalf("failed activation changed config: HTTP %d", w.Code)
	}
}

func TestAdGuardConfigureNormalizesProbePortsAndRollsBackRegistration(t *testing.T) {
	for _, fail := range []bool{false, true} {
		t.Run(map[bool]string{false: "success", true: "failure"}[fail], func(t *testing.T) {
			s, fake := newAdGuardFake(t)
			if err := os.Remove(s.adGuardSettingsPath()); err != nil {
				t.Fatal(err)
			}
			fake.failRulesOnce = fail
			// Ensure a new managed rule is needed so the failure occurs after the
			// upstream write, rather than before registration starts.
			body, _ := json.Marshal(adGuardTestConfig("vpn.example"))
			if err := os.WriteFile(s.cfg.ActiveConfig, body, 0600); err != nil {
				t.Fatal(err)
			}
			_, err := s.adGuardAction(map[string]any{"action": "configure", "url": fake.server.URL, "username": "admin", "password": "test-secret", "enabled": true})
			cfg, loadErr := s.loadAdGuardSettings()
			if loadErr != nil {
				t.Fatal(loadErr)
			}
			if fail && (err == nil || cfg.Enabled || cfg.URL != "") {
				t.Fatalf("failed registration persisted: %v %+v", err, cfg)
			}
			if !fail && (err != nil || !cfg.Enabled) {
				t.Fatalf("normalized port rejected: %v", err)
			}
		})
	}
}

func TestAdGuardRejectsRemoteAndRedirectCredentials(t *testing.T) {
	for _, address := range []string{"http://192.168.50.117:3001", "http://localhost:3001", "http://admin:secret@127.0.0.1", "http://127.0.0.1/control", "file:///etc/passwd"} {
		if validateAdGuardURL(address) == nil {
			t.Fatalf("accepted unsafe URL %s", address)
		}
	}
	redirected := false
	dest := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { redirected = true; w.WriteHeader(200) }))
	defer dest.Close()
	origin := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { http.Redirect(w, r, dest.URL, 302) }))
	defer origin.Close()
	err := adGuardCall(adGuardSettings{URL: origin.URL, Password: "test-secret"}, "status", nil, nil)
	if err == nil || redirected || strings.Contains(err.Error(), "test-secret") {
		t.Fatal("redirect leaked credentials")
	}
}

func TestAdGuardStampAndRelayDetection(t *testing.T) {
	stamp := "sdns://AgAAAAAAAAAACTEyNy4wLjAuMQAQZG5zLmdvb2dsZToxMDUzNQovZG5zLXF1ZXJ5"
	if got := adGuardDoHStampEndpoint(stamp); got != "127.0.0.1:10535" {
		t.Fatalf("stamp endpoint = %q", got)
	}
	for i := 0; i < len(stamp); i++ {
		_ = adGuardDoHStampEndpoint(stamp[:i])
	}
	relay := map[string]any{"inbounds": []any{map[string]any{"protocol": "dokodemo-door", "listen": "127.0.0.1", "port": 10535, "settings": map[string]any{"network": "tcp"}}}, "outbounds": []any{map[string]any{"protocol": "socks", "settings": map[string]any{"servers": []any{map[string]any{"address": "127.0.0.1", "port": 10808}}}}}}
	active := map[string]any{"inbounds": []any{map[string]any{"protocol": "socks", "listen": "127.0.0.1", "port": 10808}}}
	if !adGuardRelayMatches([]string{stamp, "[/vpn.example/]https://8.8.8.8/dns-query"}, relay, active) {
		t.Fatal("valid TLS relay not detected")
	}
	if adGuardRelayMatches([]string{stamp, "https://dns.google/dns-query"}, relay, active) {
		t.Fatal("direct DNS misreported as exclusively VPN")
	}
	relay["routing"] = map[string]any{"rules": []any{map[string]any{"outboundTag": "direct"}}}
	if adGuardRelayMatches([]string{stamp}, relay, active) {
		t.Fatal("custom routed relay should not be assumed VPN")
	}
}
