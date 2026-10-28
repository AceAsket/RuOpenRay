package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestXrayGeoTransaction(t *testing.T) {
	binary := os.Getenv("RUOPENRAY_TEST_XRAY")
	if binary == "" || runtime.GOOS != "linux" {
		t.Skip("set RUOPENRAY_TEST_XRAY on Linux")
	}
	bin := t.TempDir()
	if err := os.Symlink(binary, filepath.Join(bin, "xray")); err != nil {
		t.Fatal(err)
	}
	t.Setenv("PATH", bin+string(os.PathListSeparator)+os.Getenv("PATH"))
	dir := t.TempDir()
	s := &serverState{cfg: appConfig{DataDir: dir, ActiveConfig: filepath.Join(dir, "config.json"), ProfilesDir: filepath.Join(dir, "profiles"), BackupDir: filepath.Join(dir, "backups"), GeoDir: filepath.Join(dir, "geo"), ServiceName: "fixture"}}
	if err := s.ensureData(); err != nil {
		t.Fatal(err)
	}
	os.MkdirAll(s.cfg.GeoDir, 0700)
	old := validGeoFixture(t, "keep")
	os.WriteFile(filepath.Join(s.cfg.GeoDir, "geosite.dat"), old, 0600)
	ipCategory, _, err := buildGeoIPCategory("ipfixture", []string{"198.51.100.0/24"})
	if err != nil {
		t.Fatal(err)
	}
	os.WriteFile(filepath.Join(s.cfg.GeoDir, "geoip.dat"), geoProtoMessage(1, ipCategory), 0600)
	cfg := map[string]any{"outbounds": []any{map[string]any{"tag": "direct", "protocol": "freedom"}}, "routing": map[string]any{"rules": []any{map[string]any{"type": "field", "domain": []any{"geosite:keep"}, "outboundTag": "direct"}, map[string]any{"type": "field", "ip": []any{"geoip:ipfixture"}, "outboundTag": "direct"}}}}
	if err := s.writeActiveConfig(cfg); err != nil {
		t.Fatal(err)
	}
	if check := s.validateConfig(cfg); check["ok"] != true {
		t.Fatal(check)
	}
	result := s.runGeoTransaction(false, false, func(stage *serverState) map[string]any {
		err := os.WriteFile(filepath.Join(stage.cfg.GeoDir, "geosite.dat"), validGeoFixture(t, "removed"), 0600)
		return map[string]any{"ok": err == nil}
	})
	after, _ := os.ReadFile(filepath.Join(s.cfg.GeoDir, "geosite.dat"))
	if result["ok"] != false || !bytes.Equal(old, after) {
		t.Fatalf("native rejection did not preserve original DAT: %v", result)
	}
	category, _, err := buildGeoSiteCategory("keep", []string{"domain:changed.example.test"})
	if err != nil {
		t.Fatal(err)
	}
	good := geoProtoMessage(1, category)
	result = s.runGeoTransaction(false, false, func(stage *serverState) map[string]any {
		err := os.WriteFile(filepath.Join(stage.cfg.GeoDir, "geosite.dat"), good, 0600)
		return map[string]any{"ok": err == nil}
	})
	after, _ = os.ReadFile(filepath.Join(s.cfg.GeoDir, "geosite.dat"))
	if result["ok"] != true || !bytes.Equal(good, after) {
		t.Fatalf("native valid DAT was not installed: %v", result)
	}
	activeBefore, _ := os.ReadFile(s.cfg.ActiveConfig)
	bad := map[string]any{"outbounds": []any{map[string]any{"tag": "bad", "protocol": "not-a-real-protocol"}}}
	badBody, _ := json.Marshal(bad)
	os.WriteFile(s.profilePath("bad"), badBody, 0600)
	rec := httptest.NewRecorder()
	s.activateProfile(rec, httptest.NewRequest(http.MethodPost, "/api/profiles/activate", strings.NewReader(`{"name":"bad"}`)))
	activeAfter, _ := os.ReadFile(s.cfg.ActiveConfig)
	if rec.Code != 422 || !bytes.Equal(activeBefore, activeAfter) {
		t.Fatalf("profile native validation bypassed: %d %s", rec.Code, rec.Body.String())
	}
}
