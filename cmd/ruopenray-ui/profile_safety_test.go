package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
)

func saveProfileRequest(t *testing.T, s *serverState, payload map[string]any) *httptest.ResponseRecorder {
	t.Helper()
	body, err := json.Marshal(payload)
	if err != nil {
		t.Fatal(err)
	}
	rec := httptest.NewRecorder()
	s.saveProfile(rec, httptest.NewRequest(http.MethodPost, "/api/profiles", bytes.NewReader(body)))
	return rec
}

func TestProfileCreateOnlyPreservesExistingAndUnicodeNames(t *testing.T) {
	s := reliabilityState(t)
	for _, name := range []string{"дом", "работа", "тест"} {
		rec := saveProfileRequest(t, s, map[string]any{"name": name, "createOnly": true, "config": map[string]any{"remark": name}})
		if rec.Code != http.StatusOK {
			t.Fatalf("create %s: %d %s", name, rec.Code, rec.Body.String())
		}
		body, err := os.ReadFile(s.profilePath(name))
		if err != nil || !bytes.Contains(body, []byte(name)) {
			t.Fatalf("Unicode profile was not preserved: %s %v", body, err)
		}
	}
	before, _ := os.ReadFile(s.profilePath("дом"))
	rec := saveProfileRequest(t, s, map[string]any{"name": "дом.json", "createOnly": true, "config": map[string]any{"remark": "replacement"}})
	after, _ := os.ReadFile(s.profilePath("дом"))
	if rec.Code != http.StatusConflict || !bytes.Equal(before, after) {
		t.Fatalf("create replaced canonical collision: %d %s", rec.Code, rec.Body.String())
	}
	// Retain the existing import/upsert contract for callers that do not send
	// createOnly; UI creation always sends it explicitly.
	rec = saveProfileRequest(t, s, map[string]any{"name": "дом", "config": map[string]any{"remark": "legacy upsert"}})
	if rec.Code != http.StatusOK {
		t.Fatalf("legacy upsert failed: %d %s", rec.Code, rec.Body.String())
	}
}

func TestProfileEditorCanonicalRenameAndStaleWriter(t *testing.T) {
	s := reliabilityState(t)
	if _, err := s.saveProfileConfig("work", map[string]any{"remark": "original"}); err != nil {
		t.Fatal(err)
	}
	original, _ := os.ReadFile(s.profilePath("work"))
	revision := draftRevision(original)
	rec := saveProfileRequest(t, s, map[string]any{
		"name": "work.json", "originalName": "work", "expectedRevision": revision, "config": map[string]any{"remark": "edited"},
	})
	updated, err := os.ReadFile(s.profilePath("work"))
	if rec.Code != http.StatusOK || err != nil || !bytes.Contains(updated, []byte("edited")) {
		t.Fatalf("canonical rename discarded profile: %d %s file=%s err=%v", rec.Code, rec.Body.String(), updated, err)
	}
	rec = saveProfileRequest(t, s, map[string]any{
		"name": "another", "originalName": "work", "expectedRevision": revision, "config": map[string]any{"remark": "stale"},
	})
	after, _ := os.ReadFile(s.profilePath("work"))
	if rec.Code != http.StatusConflict || !bytes.Equal(updated, after) {
		t.Fatalf("stale editor overwrote profile: %d %s", rec.Code, rec.Body.String())
	}
	if _, err := os.Stat(s.profilePath("another")); !os.IsNotExist(err) {
		t.Fatalf("stale editor created destination: %v", err)
	}
}

func TestProfileEditorRenameRejectsCollisionAndMovesActiveMarker(t *testing.T) {
	s := reliabilityState(t)
	for _, name := range []string{"work", "other"} {
		if _, err := s.saveProfileConfig(name, map[string]any{"remark": name}); err != nil {
			t.Fatal(err)
		}
	}
	if err := s.writeActiveProfileName("work"); err != nil {
		t.Fatal(err)
	}
	source, _ := os.ReadFile(s.profilePath("work"))
	target, _ := os.ReadFile(s.profilePath("other"))
	rec := saveProfileRequest(t, s, map[string]any{"name": "other.json", "originalName": "work", "config": map[string]any{"remark": "edited"}})
	afterSource, _ := os.ReadFile(s.profilePath("work"))
	afterTarget, _ := os.ReadFile(s.profilePath("other"))
	if rec.Code != http.StatusConflict || !bytes.Equal(source, afterSource) || !bytes.Equal(target, afterTarget) {
		t.Fatalf("rename replaced target or lost source: %d %s", rec.Code, rec.Body.String())
	}
	rec = saveProfileRequest(t, s, map[string]any{"name": "работа", "originalName": "work", "expectedRevision": draftRevision(source), "config": map[string]any{"remark": "edited"}})
	if rec.Code != http.StatusOK || s.readActiveProfileName() != "работа" {
		t.Fatalf("rename did not move active marker: %d %s marker=%q", rec.Code, rec.Body.String(), s.readActiveProfileName())
	}
	if _, err := os.Stat(s.profilePath("work")); !os.IsNotExist(err) {
		t.Fatalf("rename retained old file: %v", err)
	}
	if body, err := os.ReadFile(s.profilePath("работа")); err != nil || !bytes.Contains(body, []byte("edited")) {
		t.Fatalf("rename lost edited content: %s %v", body, err)
	}
}

func TestProfileEditorRejectsNonObjectInsteadOfSavingActiveConfig(t *testing.T) {
	s := reliabilityState(t)
	for _, invalid := range []any{nil, []any{}, "wrong"} {
		rec := saveProfileRequest(t, s, map[string]any{"name": "invalid", "createOnly": true, "config": invalid})
		if rec.Code != http.StatusBadRequest {
			t.Fatalf("invalid config accepted: %d %s", rec.Code, rec.Body.String())
		}
	}
	if _, err := os.Stat(s.profilePath("invalid")); !os.IsNotExist(err) {
		t.Fatalf("invalid editor input created a profile: %v", err)
	}
}

func TestProfileActivationRestartsOrRestoresMarkerWithoutClearingDraft(t *testing.T) {
	for _, success := range []bool{true, false} {
		t.Run(map[bool]string{true: "success", false: "rollback"}[success], func(t *testing.T) {
			s := reliabilityState(t)
			baseline, _ := os.ReadFile(s.cfg.ActiveConfig)
			marker, _ := os.ReadFile(s.activeProfilePath())
			candidate := defaultConfig()
			candidate["remark"] = "candidate"
			if _, err := s.saveProfileConfig("candidate", candidate); err != nil {
				t.Fatal(err)
			}
			if result := s.saveConfigDraft(map[string]any{"config": map[string]any{"remark": "keep this draft"}}); result["ok"] != true {
				t.Fatal(result)
			}
			draft, _ := os.ReadFile(s.configDraftPath())
			calls := 0
			rec := httptest.NewRecorder()
			payload, _ := json.Marshal(map[string]any{"name": "candidate", "restart": true, "expectedConfigRevision": s.activeConfigRevision()})
			s.activateProfileWithRestart(rec, httptest.NewRequest(http.MethodPost, "/api/profiles/activate", bytes.NewReader(payload)), func(backup string) map[string]any {
				calls++
				active, _ := os.ReadFile(s.cfg.ActiveConfig)
				if !bytes.Contains(active, []byte("candidate")) || s.readActiveProfileName() != "candidate" {
					t.Fatal("restart ran before candidate config and marker were written")
				}
				if !success {
					// This is the production restartSubscriptionWithRollback contract.
					if err := s.restoreSubscriptionConfig(backup); err != nil {
						t.Fatal(err)
					}
				}
				return map[string]any{"ok": success, "stderr": "fixture restart failure"}
			})
			var result map[string]any
			json.Unmarshal(rec.Body.Bytes(), &result)
			afterDraft, _ := os.ReadFile(s.configDraftPath())
			if rec.Code != http.StatusOK || calls != 1 || result["ok"] != success || result["restartRequired"] != false || !bytes.Equal(draft, afterDraft) {
				t.Fatalf("activation result or draft ownership incorrect: %d %s calls=%d", rec.Code, rec.Body.String(), calls)
			}
			if result["activeRevision"] != s.activeConfigRevision() {
				t.Fatal("activation returned a stale active revision")
			}
			if !success {
				after, _ := os.ReadFile(s.cfg.ActiveConfig)
				afterMarker, _ := os.ReadFile(s.activeProfilePath())
				if !bytes.Equal(baseline, after) || !bytes.Equal(marker, afterMarker) {
					t.Fatal("failed profile activation did not restore config and marker")
				}
			}
		})
	}
}

func TestProfileActivationRejectsStaleConfigBeforeRestart(t *testing.T) {
	s := reliabilityState(t)
	before, _ := os.ReadFile(s.cfg.ActiveConfig)
	rec := httptest.NewRecorder()
	s.activateProfileWithRestart(rec, httptest.NewRequest(http.MethodPost, "/api/profiles/activate", strings.NewReader(`{"name":"default","restart":true,"expectedConfigRevision":"stale"}`)), func(string) map[string]any {
		t.Fatal("stale activation restarted service")
		return nil
	})
	after, _ := os.ReadFile(s.cfg.ActiveConfig)
	if rec.Code != http.StatusConflict || !bytes.Equal(before, after) {
		t.Fatalf("stale activation changed config: %d %s", rec.Code, rec.Body.String())
	}
}

func TestProfileMutationsUseSharedOperationLock(t *testing.T) {
	s := reliabilityState(t)
	s.addSession("profile-fixture")
	unlock, err := s.beginMutation()
	if err != nil {
		t.Fatal(err)
	}
	defer unlock()
	for _, endpoint := range []string{"/api/profiles", "/api/profiles/activate"} {
		req := httptest.NewRequest(http.MethodPost, endpoint, strings.NewReader(`{"name":"default","restart":true,"createOnly":true}`))
		req.Header.Set("Authorization", "Bearer profile-fixture")
		rec := httptest.NewRecorder()
		s.handleAPI(rec, req)
		if rec.Code != http.StatusConflict || !strings.Contains(rec.Body.String(), "busy") {
			t.Fatalf("%s bypassed mutation lock: %d %s", endpoint, rec.Code, rec.Body.String())
		}
	}
}
