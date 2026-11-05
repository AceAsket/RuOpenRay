package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func applyProgressStatus(snapshot configApplyOperation, id string) string {
	for _, stage := range snapshot.Stages {
		if stage.ID == id {
			return stage.Status
		}
	}
	return ""
}

func applyProgressRequest(id string, cfg map[string]any) *http.Request {
	body, _ := json.Marshal(map[string]any{"operationId": id, "config": cfg})
	return httptest.NewRequest(http.MethodPost, "/api/config/apply", bytes.NewReader(body))
}

func TestConfigApplyProgressCanBeReadDuringTheSingleTransaction(t *testing.T) {
	s := reliabilityState(t)
	s.addSession("fixture")
	unlock, err := s.beginMutation()
	if err != nil {
		t.Fatal(err)
	}
	defer unlock()
	id := "apply-progress-fixture"
	entered, release, finished := make(chan struct{}), make(chan struct{}), make(chan struct{})
	var calls atomic.Int32
	response := httptest.NewRecorder()
	go func() {
		defer close(finished)
		s.applyConfigWithProgress(response, applyProgressRequest(id, map[string]any{"remark": "fixture-private-value", "outbounds": []any{map[string]any{"tag": "direct", "protocol": "freedom"}}}), func(backup string, report configApplyReporter) map[string]any {
			calls.Add(1)
			report("baseline", "running")
			report("restart", "running")
			report("readiness", "running")
			close(entered)
			<-release
			report("health", "running")
			return map[string]any{"ok": true, "stdout": "fixture-private-output", "health": map[string]any{"state": "healthy"}}
		})
	}()
	defer func() {
		select {
		case <-release:
		default:
			close(release)
		}
		<-finished
	}()
	select {
	case <-entered:
	case <-time.After(5 * time.Second):
		t.Fatal("apply did not reach the controlled readiness check")
	}
	get := func(operation, token string) *httptest.ResponseRecorder {
		rec := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, "/api/config/apply-progress?operationId="+operation, nil)
		if token != "" {
			req.Header.Set("Authorization", "Bearer "+token)
		}
		s.handleAPI(rec, req)
		return rec
	}
	if rec := get(id, ""); rec.Code != http.StatusUnauthorized {
		t.Fatalf("progress was accessible without auth: %d", rec.Code)
	}
	if rec := get("another-operation", "fixture"); rec.Code != http.StatusNotFound {
		t.Fatalf("unrelated operation read the active result: %d %s", rec.Code, rec.Body.String())
	}
	if rec := get("bad.id", "fixture"); rec.Code != http.StatusBadRequest {
		t.Fatalf("invalid operation ID accepted: %d", rec.Code)
	}
	rec := get(id, "fixture")
	var snapshot configApplyOperation
	if err := json.Unmarshal(rec.Body.Bytes(), &snapshot); err != nil || rec.Code != 200 || snapshot.OperationID != id || snapshot.Stage != "readiness" || !snapshot.Active || snapshot.Terminal {
		t.Fatalf("progress was unavailable under the mutation lock: %d %s %v", rec.Code, rec.Body.String(), err)
	}
	for _, stage := range []string{"validation", "backup", "write", "baseline", "restart"} {
		if applyProgressStatus(snapshot, stage) != "done" {
			t.Fatalf("fast real stage was lost between polls: %s %v", stage, snapshot.Stages)
		}
	}
	if strings.Contains(rec.Body.String(), "fixture-private") || strings.Contains(rec.Body.String(), "outbounds") || rec.Header().Get("cache-control") != "no-store" {
		t.Fatal("progress exposed config/command data or was cacheable")
	}
	busy := httptest.NewRecorder()
	busyRequest := applyProgressRequest("another-apply", map[string]any{"outbounds": []any{}})
	busyRequest.Header.Set("Authorization", "Bearer fixture")
	s.handleAPI(busy, busyRequest)
	if busy.Code != http.StatusConflict || !strings.Contains(busy.Body.String(), `"busy":true`) || !strings.Contains(busy.Body.String(), `"operationId":"another-apply"`) {
		t.Fatalf("second apply escaped the existing transaction lock: %d %s", busy.Code, busy.Body.String())
	}
	close(release)
	<-finished
	var result map[string]any
	_ = json.Unmarshal(response.Body.Bytes(), &result)
	terminal, found := s.configApplyProgressSnapshot(id)
	if response.Code != 200 || result["ok"] != true || result["operationId"] != id || mapValue(result["progress"])["stage"] != "complete" || !found || terminal.Active || !terminal.Terminal || terminal.Outcome != "healthy" || terminal.Sequence <= snapshot.Sequence || calls.Load() != 1 {
		t.Fatalf("wrong terminal result: %d %s snapshot=%v calls=%d", response.Code, response.Body.String(), terminal, calls.Load())
	}
	if applyProgressStatus(terminal, "rollback") != "skipped" || applyProgressStatus(terminal, "health") != "done" {
		t.Fatal("terminal history guessed a rollback or lost the health check")
	}
	terminal.Stages[0].Status = "corrupt-client-copy"
	if fresh, _ := s.configApplyProgressSnapshot(id); fresh.Stages[0].Status != "done" {
		t.Fatal("client snapshot aliases shared progress")
	}
	before, _ := os.ReadFile(s.cfg.ActiveConfig)
	duplicate := httptest.NewRecorder()
	s.applyConfigWithRestart(duplicate, applyProgressRequest(id, map[string]any{"outbounds": []any{}}), func(string) map[string]any {
		t.Fatal("reused operation ID executed a second apply")
		return nil
	})
	after, _ := os.ReadFile(s.cfg.ActiveConfig)
	var repeated map[string]any
	_ = json.Unmarshal(duplicate.Body.Bytes(), &repeated)
	if duplicate.Code != 409 || repeated["duplicate"] != true || repeated["conflict"] != nil || !bytes.Equal(before, after) {
		t.Fatalf("duplicate ID changed config or looked like a CAS conflict: %d %s", duplicate.Code, duplicate.Body.String())
	}
}

func TestConfigApplyProgressRejectsStaleRevisionAndFailedValidation(t *testing.T) {
	for _, mode := range []string{"stale", "invalid"} {
		t.Run(mode, func(t *testing.T) {
			s := reliabilityState(t)
			before, _ := os.ReadFile(s.cfg.ActiveConfig)
			cfg := map[string]any{"outbounds": []any{map[string]any{"tag": "direct", "protocol": "freedom"}}}
			payload := map[string]any{"operationId": mode, "config": cfg}
			if mode == "stale" {
				payload["expectedConfigRevision"] = "stale-revision"
			} else {
				cfg["routing"] = map[string]any{"rules": []any{map[string]any{"type": "field", "domain": []any{"example.test"}, "outboundTag": "missing-outbound"}}}
			}
			body, _ := json.Marshal(payload)
			rec := httptest.NewRecorder()
			s.applyConfigWithRestart(rec, httptest.NewRequest(http.MethodPost, "/api/config/apply", bytes.NewReader(body)), func(string) map[string]any {
				t.Fatal("rejected candidate reached service activation")
				return nil
			})
			after, _ := os.ReadFile(s.cfg.ActiveConfig)
			snapshot, found := s.configApplyProgressSnapshot(mode)
			wantCode := 422
			if mode == "stale" {
				wantCode = 409
			}
			if rec.Code != wantCode || !found || !snapshot.Terminal || snapshot.Stage != "failed" || snapshot.Outcome != "failed" || applyProgressStatus(snapshot, "validation") != "failed" || applyProgressStatus(snapshot, "write") != "skipped" || !bytes.Equal(before, after) {
				t.Fatalf("rejected candidate has wrong progress or changed config: %d %s %v", rec.Code, rec.Body.String(), snapshot)
			}
		})
	}
}

func TestConfigApplyProgressPreservesRollbackAndInconclusiveOutcomes(t *testing.T) {
	for _, outcome := range []string{"inconclusive", "rolled_back", "rollback_failed"} {
		t.Run(outcome, func(t *testing.T) {
			s := reliabilityState(t)
			before, _ := os.ReadFile(s.cfg.ActiveConfig)
			profileBefore, _ := os.ReadFile(s.profilePath(s.currentProfileName()))
			rec := httptest.NewRecorder()
			s.applyConfigWithProgress(rec, applyProgressRequest(outcome, map[string]any{"remark": "candidate", "outbounds": []any{map[string]any{"tag": "direct", "protocol": "freedom"}}}), func(backup string, report configApplyReporter) map[string]any {
				report("baseline", "running")
				report("restart", "running")
				report("readiness", "running")
				if outcome == "inconclusive" {
					report("health", "running")
					return map[string]any{"ok": true, "health": map[string]any{"state": "inconclusive"}}
				}
				report("readiness", "failed")
				report("rollback", "running")
				if err := s.restoreSubscriptionConfig(backup); err != nil {
					t.Fatal(err)
				}
				return map[string]any{"ok": false, "rollback": map[string]any{"ok": outcome == "rolled_back"}}
			})
			snapshot, found := s.configApplyProgressSnapshot(outcome)
			if rec.Code != 200 || !found || !snapshot.Terminal || snapshot.Outcome != outcome {
				t.Fatalf("wrong activation outcome: %d %s %v", rec.Code, rec.Body.String(), snapshot)
			}
			if outcome != "inconclusive" {
				after, _ := os.ReadFile(s.cfg.ActiveConfig)
				profileAfter, _ := os.ReadFile(s.profilePath(s.currentProfileName()))
				rollbackStatus := "done"
				if outcome == "rollback_failed" {
					rollbackStatus = "failed"
				}
				if snapshot.Stage != "failed" || applyProgressStatus(snapshot, "readiness") != "failed" || applyProgressStatus(snapshot, "rollback") != rollbackStatus || !bytes.Equal(before, after) || !bytes.Equal(profileBefore, profileAfter) {
					t.Fatalf("rollback status or exact profile restoration lost: %v", snapshot)
				}
			}
		})
	}
}

func TestConfigApplyProgressRetentionAndIDs(t *testing.T) {
	s := &serverState{}
	for _, raw := range []any{"", "has.dot", "has space", strings.Repeat("a", 97), 12, nil} {
		if _, err := configApplyID(map[string]any{"operationId": raw}); err == nil {
			t.Fatalf("accepted malformed operation ID %v", raw)
		}
	}
	if generated, err := configApplyID(map[string]any{}); err != nil || !configApplyOperationID.MatchString(generated) {
		t.Fatalf("old clients did not receive a valid generated ID: %q %v", generated, err)
	}
	sameTick := time.Now()
	for i := 0; i < configApplyProgressLimit+1; i++ {
		id := fmt.Sprintf("operation-%d", i)
		if _, created := s.beginConfigApplyProgress(id); !created {
			t.Fatal("new operation was not accepted")
		}
		s.finishConfigApplyProgress(id, true, "healthy")
		s.applyProgressMu.Lock()
		s.applyProgress[id].updated = sameTick
		s.applyProgressMu.Unlock()
	}
	if _, found := s.configApplyProgressSnapshot("operation-0"); found || len(s.applyProgress) != configApplyProgressLimit {
		t.Fatal("completed operation history was not bounded")
	}
	s.applyProgressMu.Lock()
	s.applyProgress["operation-1"].updated = time.Now().Add(-configApplyProgressTTL - time.Second)
	s.applyProgressMu.Unlock()
	if _, found := s.configApplyProgressSnapshot("operation-1"); found {
		t.Fatal("expired terminal operation was retained")
	}
	if _, created := s.beginConfigApplyProgress("active-operation"); !created {
		t.Fatal("active operation was not registered")
	}
	s.applyProgressMu.Lock()
	s.applyProgress["active-operation"].updated = time.Now().Add(-configApplyProgressTTL - time.Second)
	s.applyProgressMu.Unlock()
	if _, found := s.configApplyProgressSnapshot("active-operation"); !found {
		t.Fatal("a still-running transaction expired while executing")
	}
}

func TestConfigApplyProgressBackupFailureNeverWritesCandidate(t *testing.T) {
	s := reliabilityState(t)
	before, _ := os.ReadFile(s.cfg.ActiveConfig)
	s.cfg.BackupDir = filepath.Join(t.TempDir(), "file-instead-of-backup-directory")
	if err := os.WriteFile(s.cfg.BackupDir, []byte("fixture"), 0600); err != nil {
		t.Fatal(err)
	}
	rec := httptest.NewRecorder()
	s.applyConfigWithRestart(rec, applyProgressRequest("backup-error", map[string]any{"outbounds": []any{map[string]any{"tag": "direct", "protocol": "freedom"}}}), func(string) map[string]any {
		t.Fatal("backup failure reached activation")
		return nil
	})
	after, _ := os.ReadFile(s.cfg.ActiveConfig)
	snapshot, _ := s.configApplyProgressSnapshot("backup-error")
	if rec.Code != 500 || !bytes.Equal(before, after) || snapshot.Outcome != "failed" || applyProgressStatus(snapshot, "validation") != "done" || applyProgressStatus(snapshot, "backup") != "failed" || applyProgressStatus(snapshot, "write") != "skipped" {
		t.Fatalf("backup failure was misreported or wrote config: %d %s %v", rec.Code, rec.Body.String(), snapshot)
	}
}

func TestWriteCandidateProfileProgressReportsFilesystemRollbackFailure(t *testing.T) {
	s := reliabilityState(t)
	originalPath := s.cfg.ActiveConfig
	original, _ := os.ReadFile(originalPath)
	backup, err := s.backupActive("fixture")
	if err != nil {
		t.Fatal(err)
	}
	// A directory cannot be atomically replaced by a config file. Both the
	// candidate write and restoration fail at the real filesystem boundary.
	s.cfg.ActiveConfig = t.TempDir()
	report, _ := s.beginConfigApplyProgress("write-error")
	report("write", "running")
	_, _, err = s.writeCandidateProfileProgress(map[string]any{"outbounds": []any{map[string]any{"tag": "direct", "protocol": "freedom"}}}, backup, report)
	if err == nil {
		t.Fatal("filesystem write unexpectedly succeeded")
	}
	outcome := s.configApplyOutcome("write-error", map[string]any{"ok": false})
	s.finishConfigApplyProgress("write-error", false, outcome)
	snapshot, _ := s.configApplyProgressSnapshot("write-error")
	after, _ := os.ReadFile(originalPath)
	if snapshot.Outcome != "rollback_failed" || applyProgressStatus(snapshot, "write") != "failed" || applyProgressStatus(snapshot, "rollback") != "failed" || !bytes.Equal(original, after) {
		t.Fatalf("real filesystem failure was mislabeled: %v", snapshot)
	}
}
