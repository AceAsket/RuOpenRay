package main

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"testing/fstest"
)

func TestAppUpdateStatusDoesNotConfuseRetriesOfSameBinary(t *testing.T) {
	s := &serverState{cfg: appConfig{DataDir: t.TempDir()}, sessions: map[string]bool{"test-token": true}}
	p := appUpdatePlan{ExpectedSHA: "same-candidate-sha", TargetVersion: "v0.6.0", UpdateID: "current-attempt"}
	plan, _ := json.Marshal(p)
	if err := os.WriteFile(s.appUpdatePlanPath(), plan, 0600); err != nil {
		t.Fatal(err)
	}
	result := []byte(`{"ok":false,"state":"rolled_back","expectedSHA":"same-candidate-sha","targetVersion":"v0.6.0","updateId":"previous-attempt"}`)
	if err := os.WriteFile(filepath.Join(s.cfg.DataDir, "app-update-result.json"), result, 0600); err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest(http.MethodGet, "/api/app/update-status", nil)
	req.Header.Set("Authorization", "Bearer test-token")
	rec := httptest.NewRecorder()
	s.handleAPI(rec, req)
	var payload map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &payload); err != nil {
		t.Fatal(err)
	}
	if rec.Code != 200 || payload["state"] != "pending" || payload["updateId"] != "current-attempt" || payload["expectedSHA"] != p.ExpectedSHA {
		t.Fatal(rec.Code, payload)
	}
}

func TestUnarmedReplacementFailurePreservesBackupUnlessRestored(t *testing.T) {
	for _, mode := range []string{"replaced", "manual", "corrupt-backup"} {
		t.Run(mode, func(t *testing.T) {
			dir := t.TempDir()
			target, backup := filepath.Join(dir, "panel"), filepath.Join(dir, "backup")
			os.WriteFile(target, []byte("candidate"), 0700)
			os.WriteFile(backup, []byte("previous"), 0700)
			newSHA, _ := executableSHA(target)
			oldSHA, _ := executableSHA(backup)
			if mode == "manual" {
				os.WriteFile(target, []byte("manual"), 0700)
			}
			if mode == "corrupt-backup" {
				os.WriteFile(backup, []byte("corrupt"), 0700)
			}
			ok, err := restoreUnarmedAppReplacement(appUpdatePlan{Target: target, Backup: backup, ExpectedSHA: newSHA, PreviousSHA: oldSHA}, errors.New("directory sync failed"))
			if err == nil || ok != (mode == "replaced") {
				t.Fatal(ok, err)
			}
			if mode == "replaced" {
				body, _ := os.ReadFile(target)
				if string(body) != "previous" {
					t.Fatal("old binary lost")
				}
			} else if _, err := os.Stat(backup); err != nil {
				t.Fatal("recovery copy lost", err)
			}
		})
	}
}

func TestPanelSelfCheckVerifiesActualEmbeddedResources(t *testing.T) {
	if err := panelSelfCheck(embeddedFiles); err != nil {
		t.Fatal(err)
	}
	for _, missing := range []string{"web/index.html", "web/app.js", "web/styles.css"} {
		files := fstest.MapFS{}
		for _, path := range []string{"web/index.html", "web/app.js", "web/styles.css"} {
			if path != missing {
				files[path] = &fstest.MapFile{Data: []byte("present")}
			}
		}
		if panelSelfCheck(files) == nil {
			t.Fatal("accepted missing embedded asset", missing)
		}
	}
}

func TestAppWatchdogRestoresOldBinaryAndVerifiesRecovery(t *testing.T) {
	for _, mode := range []string{"healthy", "crash", "restart-error", "rollback-unhealthy", "corrupt-backup", "superseded"} {
		t.Run(mode, func(t *testing.T) {
			dir := t.TempDir()
			target := filepath.Join(dir, "panel")
			backup := filepath.Join(dir, "old")
			os.WriteFile(target, []byte("new binary"), 0700)
			os.WriteFile(backup, []byte("previous binary"), 0700)
			newSHA, _ := executableSHA(target)
			oldSHA, _ := executableSHA(backup)
			p := appUpdatePlan{Target: target, Backup: backup, ExpectedSHA: newSHA, PreviousSHA: oldSHA}
			if mode == "superseded" {
				os.WriteFile(target, []byte("manual update"), 0700)
			}
			if mode == "corrupt-backup" {
				os.WriteFile(backup, []byte("broken"), 0700)
			}
			starts := 0
			result := executeAppWatchdog(p, func() error {
				starts++
				if mode == "restart-error" && starts == 1 {
					return os.ErrInvalid
				}
				return nil
			}, func(expected string) bool {
				if expected == newSHA {
					return mode == "healthy"
				}
				return mode != "rollback-unhealthy"
			})
			body, _ := os.ReadFile(target)
			switch mode {
			case "healthy":
				if result["ok"] != true || string(body) != "new binary" {
					t.Fatal(result)
				}
			case "superseded":
				if result["state"] != "superseded" || starts != 0 || string(body) != "manual update" {
					t.Fatal(result)
				}
			case "corrupt-backup":
				if result["state"] != "rollback_failed" || string(body) != "new binary" {
					t.Fatal(result)
				}
			default:
				if result["state"] != "rolled_back" || string(body) != "previous binary" || result["rollbackOK"] != (mode != "rollback-unhealthy") {
					t.Fatal(result, string(body))
				}
			}
		})
	}
}

func TestAppReadinessRequiresPrivateTokenAndRunningDigest(t *testing.T) {
	s := &serverState{cfg: appConfig{DataDir: t.TempDir()}}
	p := appUpdatePlan{ProbeToken: randomToken(), ExpectedSHA: "digest of file currently on disk must not be trusted"}
	b, _ := json.Marshal(p)
	os.WriteFile(s.appUpdatePlanPath(), b, 0600)
	server := httptest.NewServer(http.HandlerFunc(s.appUpdateReady))
	defer server.Close()
	p.ReadyURL = server.URL
	exe, _ := os.Executable()
	sha, _ := executableSHA(exe)
	if !appWatchdogProbe(p, sha) {
		t.Fatal("running binary was not recognized")
	}
	if appWatchdogProbe(p, p.ExpectedSHA) {
		t.Fatal("trusted replacement on disk rather than running binary")
	}
	p.ProbeToken = "invalid"
	if appWatchdogProbe(p, sha) {
		t.Fatal("invalid token was accepted")
	}
}
