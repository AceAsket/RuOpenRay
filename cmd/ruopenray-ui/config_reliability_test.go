package main

import (
	"bytes"
	"encoding/json"
	rsubscription "github.com/AceAsket/RuOpenRay/internal/subscription"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func reliabilityState(t *testing.T) *serverState {
	t.Helper()
	dir := t.TempDir()
	s := &serverState{cfg: appConfig{DataDir: dir, ActiveConfig: filepath.Join(dir, "config.json"), ProfilesDir: filepath.Join(dir, "profiles"), BackupDir: filepath.Join(dir, "backups"), ServiceName: "fixture"}}
	if err := s.ensureData(); err != nil {
		t.Fatal(err)
	}
	if runtime.GOOS != "windows" {
		bin := t.TempDir()
		if err := os.WriteFile(filepath.Join(bin, "xray"), []byte("#!/bin/sh\nexit 0\n"), 0700); err != nil {
			t.Fatal(err)
		}
		t.Setenv("PATH", bin+string(os.PathListSeparator)+os.Getenv("PATH"))
	}
	return s
}

func TestDraftRevisionRejectsStaleWriterAndStaleDelete(t *testing.T) {
	s := reliabilityState(t)
	first := s.saveConfigDraft(map[string]any{"config": map[string]any{"remark": "first"}, "expectedRevision": ""})
	if first["ok"] != true {
		t.Fatal(first)
	}
	second := s.saveConfigDraft(map[string]any{"config": map[string]any{"remark": "second"}, "expectedRevision": first["revision"]})
	stale := s.saveConfigDraft(map[string]any{"config": map[string]any{"remark": "stale"}, "expectedRevision": first["revision"]})
	if second["ok"] != true || stale["conflict"] != true {
		t.Fatalf("second=%v stale=%v", second, stale)
	}
	revision := first["revision"].(string)
	if got := s.clearConfigDraftRevision(&revision); got["preserved"] != true {
		t.Fatal(got)
	}
	if got := s.readConfigDraft(); mapValue(got["config"])["remark"] != "second" {
		t.Fatal(got)
	}
}

func TestFailedApplyPreservesDraftAndExactSavedProfile(t *testing.T) {
	s := reliabilityState(t)
	cfg := map[string]any{"outbounds": []any{map[string]any{"tag": "direct", "protocol": "freedom"}}}
	draft := s.saveConfigDraft(map[string]any{"config": cfg})
	profileBefore, _ := os.ReadFile(s.profilePath("default"))
	activeBefore, _ := os.ReadFile(s.cfg.ActiveConfig)
	requestBody, _ := json.Marshal(map[string]any{"config": cfg})
	rec := httptest.NewRecorder()
	s.applyConfigWithRestart(rec, httptest.NewRequest(http.MethodPost, "/api/config/apply", bytes.NewReader(requestBody)), func(backup string) map[string]any {
		if err := s.restoreSubscriptionConfig(backup); err != nil {
			t.Fatal(err)
		}
		return map[string]any{"ok": false, "stderr": "fixture restart failed", "rollback": map[string]any{"ok": true}}
	})
	var result map[string]any
	json.Unmarshal(rec.Body.Bytes(), &result)
	profileAfter, _ := os.ReadFile(s.profilePath("default"))
	activeAfter, _ := os.ReadFile(s.cfg.ActiveConfig)
	if result["ok"] != false || s.readConfigDraft()["revision"] != draft["revision"] || !bytes.Equal(profileBefore, profileAfter) || !bytes.Equal(activeBefore, activeAfter) {
		t.Fatalf("failed apply changed state: %s", rec.Body.String())
	}
}

func TestSuccessfulApplyPreservesNewerDraft(t *testing.T) {
	s := reliabilityState(t)
	cfg := map[string]any{"outbounds": []any{map[string]any{"tag": "direct", "protocol": "freedom"}}}
	s.saveConfigDraft(map[string]any{"config": cfg})
	body, _ := json.Marshal(map[string]any{"config": cfg})
	rec := httptest.NewRecorder()
	s.applyConfigWithRestart(rec, httptest.NewRequest(http.MethodPost, "/api/config/apply", bytes.NewReader(body)), func(string) map[string]any {
		s.saveConfigDraft(map[string]any{"config": map[string]any{"remark": "newer edit"}})
		return map[string]any{"ok": true}
	})
	if got := s.readConfigDraft(); got["exists"] != true || mapValue(got["config"])["remark"] != "newer edit" {
		t.Fatal(got)
	}
}

func TestProfileActivationNormalizesLegacySniffingAndRejectsB4Mark(t *testing.T) {
	s := reliabilityState(t)
	cfg := map[string]any{"inbounds": []any{map[string]any{"tag": "legacy", "sniffing": map[string]any{"enabled": true, "domainsExcluded": []any{""}}}}, "outbounds": []any{map[string]any{"tag": "direct", "protocol": "freedom"}}}
	body, _ := json.Marshal(cfg)
	os.WriteFile(s.profilePath("legacy"), body, 0600)
	rec := httptest.NewRecorder()
	s.activateProfile(rec, httptest.NewRequest(http.MethodPost, "/api/profiles/activate", strings.NewReader(`{"name":"legacy"}`)))
	active, _ := os.ReadFile(s.cfg.ActiveConfig)
	if rec.Code != 200 || bytes.Contains(active, []byte("domainsExcluded")) {
		t.Fatalf("profile activation %d %s active=%s", rec.Code, rec.Body.String(), active)
	}
	os.WriteFile(filepath.Join(s.cfg.DataDir, "b4-api.json"), []byte(`{"directEnabled":true}`), 0600)
	bad := []byte(`{"outbounds":[{"tag":"vpn","protocol":"vless","streamSettings":{"sockopt":{"mark":524288}}}]}`)
	os.WriteFile(s.profilePath("bad"), bad, 0600)
	rec = httptest.NewRecorder()
	s.activateProfile(rec, httptest.NewRequest(http.MethodPost, "/api/profiles/activate", strings.NewReader(`{"name":"bad"}`)))
	after, _ := os.ReadFile(s.cfg.ActiveConfig)
	if rec.Code != 422 || !bytes.Equal(active, after) {
		t.Fatalf("B4 guard failed %d %s", rec.Code, rec.Body.String())
	}
}

func TestAPIMalformedJSONPreservesNamesAndBusyOperationReturnsConflict(t *testing.T) {
	s := reliabilityState(t)
	s.addSession("fixture")
	s.saveRouteNames(map[string]any{"names": map[string]any{"rule": "preserve"}})
	for _, body := range []string{`{"names":`, `null`, `[1,2]`} {
		req := httptest.NewRequest(http.MethodPost, "/api/routing/names", strings.NewReader(body))
		req.Header.Set("Authorization", "Bearer fixture")
		rec := httptest.NewRecorder()
		s.handleAPI(rec, req)
		if rec.Code != 400 || s.routeNames()["rule"] != "preserve" {
			t.Fatalf("malformed JSON changed names: %d %s", rec.Code, rec.Body.String())
		}
	}
	unlock, err := s.beginMutation()
	if err != nil {
		t.Fatal(err)
	}
	defer unlock()
	req := httptest.NewRequest(http.MethodPost, "/api/routing/names", strings.NewReader(`{"names":{}}`))
	req.Header.Set("Authorization", "Bearer fixture")
	rec := httptest.NewRecorder()
	s.handleAPI(rec, req)
	if rec.Code != 409 || s.routeNames()["rule"] != "preserve" {
		t.Fatalf("busy mutation changed names: %d", rec.Code)
	}
}

func TestSubscriptionSelectionPreservesDialerAndSavedProfile(t *testing.T) {
	s := reliabilityState(t)
	old := subscriptionTestOutbound("pool", "old.example.test", 443)
	old["streamSettings"] = map[string]any{"sockopt": map[string]any{"dialerProxy": "custom-fragment"}}
	cfg := map[string]any{"outbounds": []any{old, map[string]any{"tag": "custom-fragment", "protocol": "freedom"}}}
	if err := s.writeActiveConfig(cfg); err != nil {
		t.Fatal(err)
	}
	if _, err := s.syncCurrentProfile(cfg); err != nil {
		t.Fatal(err)
	}
	store := rsubscription.Store{Pools: []rsubscription.Pool{{Tag: "pool", Active: 0, Candidates: []map[string]any{subscriptionTestOutbound("new", "new.example.test", 443)}}}}
	if err := s.writeSubscriptionStoreRaw(store); err != nil {
		t.Fatal(err)
	}
	rec := httptest.NewRecorder()
	s.selectSubscriptionCandidate(rec, httptest.NewRequest(http.MethodPost, "/api/subscriptions/select", strings.NewReader(`{"tag":"pool","index":0,"restart":false}`)))
	var result map[string]any
	json.Unmarshal(rec.Body.Bytes(), &result)
	active, _ := s.readActiveConfig()
	profile, _ := os.ReadFile(s.profilePath(s.currentProfileName()))
	if result["ok"] != true || activeOutboundDialerProxy(asArray(active["outbounds"]), "pool") != "custom-fragment" || !bytes.Contains(profile, []byte("new.example.test")) {
		t.Fatalf("selection mismatch: %s", rec.Body.String())
	}
}

func TestMaintenanceDoesNotCreateDefaultConfigAndCronCarriesAllPaths(t *testing.T) {
	dir := t.TempDir()
	s := &serverState{cfg: appConfig{DataDir: dir, ProfilesDir: filepath.Join(dir, "profiles"), BackupDir: filepath.Join(dir, "backups"), ActiveConfig: filepath.Join(dir, "xray", "custom.json"), GeoDir: filepath.Join(dir, "assets"), ServiceName: "custom-xray"}}
	if err := s.ensureMaintenanceDirs(); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(s.cfg.ActiveConfig); !os.IsNotExist(err) {
		t.Fatalf("maintenance created active config: %v", err)
	}
	for _, item := range []string{"RUOPENRAY_ACTIVE_CONFIG=", "RUOPENRAY_PROFILES_DIR=", "RUOPENRAY_BACKUP_DIR=", "RUOPENRAY_XRAY_SERVICE=", "GOMEMLIMIT="} {
		if !strings.Contains(s.maintenanceEnvironment(), item) {
			t.Fatal(item)
		}
	}
}
