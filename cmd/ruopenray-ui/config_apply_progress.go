package main

import (
	"fmt"
	"net/http"
	"regexp"
	"time"
)

const configApplyProgressLimit = 16
const configApplyProgressTTL = 30 * time.Minute

var configApplyOperationID = regexp.MustCompile(`^[A-Za-z0-9_-]{1,96}$`)
var configApplyStages = []string{"validation", "backup", "write", "baseline", "restart", "hot-routing", "readiness", "health", "rollback"}

type configApplyStage struct {
	ID     string `json:"id"`
	Status string `json:"status"`
}

type configApplyOperation struct {
	OperationID string             `json:"operationId"`
	Active      bool               `json:"active"`
	Terminal    bool               `json:"terminal"`
	Stage       string             `json:"stage"`
	Outcome     string             `json:"outcome"`
	Sequence    uint64             `json:"sequence"`
	StartedAt   string             `json:"startedAt"`
	UpdatedAt   string             `json:"updatedAt"`
	Stages      []configApplyStage `json:"stages"`
	updated     time.Time
	order       uint64
}

type configApplyReporter func(stage, status string)

func reportConfigApply(report configApplyReporter, stage, status string) {
	if report != nil {
		report(stage, status)
	}
}

func (s *serverState) pruneConfigApplyProgress(now time.Time) {
	for id, operation := range s.applyProgress {
		if operation.Terminal && now.Sub(operation.updated) > configApplyProgressTTL {
			delete(s.applyProgress, id)
		}
	}
}

func (s *serverState) beginConfigApplyProgress(id string) (configApplyReporter, bool) {
	s.applyProgressMu.Lock()
	defer s.applyProgressMu.Unlock()
	now := time.Now()
	s.pruneConfigApplyProgress(now)
	if s.applyProgress == nil {
		s.applyProgress = map[string]*configApplyOperation{}
	}
	if _, exists := s.applyProgress[id]; exists {
		return nil, false
	}
	for len(s.applyProgress) >= configApplyProgressLimit {
		oldest := ""
		for key, operation := range s.applyProgress {
			if operation.Terminal && (oldest == "" || operation.updated.Before(s.applyProgress[oldest].updated) || (operation.updated.Equal(s.applyProgress[oldest].updated) && operation.order < s.applyProgress[oldest].order)) {
				oldest = key
			}
		}
		if oldest == "" {
			return nil, false
		}
		delete(s.applyProgress, oldest)
	}
	stages := make([]configApplyStage, len(configApplyStages))
	for index, stage := range configApplyStages {
		stages[index] = configApplyStage{stage, "pending"}
	}
	stages[0].Status = "running"
	stamp := now.UTC().Format(time.RFC3339Nano)
	s.applyProgressOrder++
	s.applyProgress[id] = &configApplyOperation{OperationID: id, Active: true, Stage: "validation", Sequence: 1, StartedAt: stamp, UpdatedAt: stamp, Stages: stages, updated: now, order: s.applyProgressOrder}
	return func(stage, status string) { s.reportConfigApplyProgress(id, stage, status) }, true
}

func (s *serverState) reportConfigApplyProgress(id, stage, status string) {
	s.applyProgressMu.Lock()
	defer s.applyProgressMu.Unlock()
	operation := s.applyProgress[id]
	if operation == nil || operation.Terminal {
		return
	}
	index := -1
	for i, row := range operation.Stages {
		if row.ID == stage {
			index = i
			break
		}
	}
	if index < 0 || (status != "running" && status != "done" && status != "failed") || operation.Stages[index].Status == status {
		return
	}
	if status == "running" {
		for i := range operation.Stages {
			if operation.Stages[i].Status == "running" {
				operation.Stages[i].Status = "done"
			}
		}
	}
	operation.Stage = stage
	operation.Stages[index].Status = status
	operation.Sequence++
	operation.updated = time.Now()
	operation.UpdatedAt = operation.updated.UTC().Format(time.RFC3339Nano)
}

func (s *serverState) finishConfigApplyProgress(id string, success bool, outcome string) {
	s.applyProgressMu.Lock()
	defer s.applyProgressMu.Unlock()
	operation := s.applyProgress[id]
	if operation == nil || operation.Terminal {
		return
	}
	for i := range operation.Stages {
		switch operation.Stages[i].Status {
		case "pending":
			operation.Stages[i].Status = "skipped"
		case "running":
			if success {
				operation.Stages[i].Status = "done"
			} else {
				operation.Stages[i].Status = "failed"
			}
		}
	}
	operation.Active, operation.Terminal = false, true
	operation.Stage = "failed"
	if success {
		operation.Stage = "complete"
	}
	operation.Outcome = outcome
	operation.Sequence++
	operation.updated = time.Now()
	operation.UpdatedAt = operation.updated.UTC().Format(time.RFC3339Nano)
}

func (s *serverState) configApplyProgressSnapshot(id string) (configApplyOperation, bool) {
	s.applyProgressMu.Lock()
	defer s.applyProgressMu.Unlock()
	s.pruneConfigApplyProgress(time.Now())
	operation := s.applyProgress[id]
	if operation == nil {
		return configApplyOperation{}, false
	}
	snapshot := *operation
	snapshot.Stages = append([]configApplyStage(nil), operation.Stages...)
	return snapshot, true
}

func (s *serverState) configApplyProgressAPI(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("operationId")
	if !configApplyOperationID.MatchString(id) {
		writeJSON(w, http.StatusBadRequest, map[string]any{"ok": false, "error": "Укажите корректный operationId"})
		return
	}
	operation, found := s.configApplyProgressSnapshot(id)
	if !found {
		writeJSON(w, http.StatusNotFound, map[string]any{"ok": false, "operationId": id, "error": "Операция не найдена"})
		return
	}
	writeJSON(w, http.StatusOK, struct {
		OK bool `json:"ok"`
		configApplyOperation
	}{true, operation})
}

func configApplyID(payload map[string]any) (string, error) {
	id, supplied := payload["operationId"]
	if !supplied {
		return randomToken(), nil
	}
	text, valid := id.(string)
	if !valid || !configApplyOperationID.MatchString(text) {
		return "", fmt.Errorf("operationId должен содержать 1–96 ASCII букв, цифр, дефисов или подчёркиваний")
	}
	return text, nil
}

func (s *serverState) configApplyOutcome(id string, response map[string]any) string {
	if response["ok"] == true {
		if mapValue(mapValue(response["restart"])["health"])["state"] == "inconclusive" {
			return "inconclusive"
		}
		return "healthy"
	}
	if snapshot, found := s.configApplyProgressSnapshot(id); found {
		for _, stage := range snapshot.Stages {
			if stage.ID == "rollback" {
				if stage.Status == "done" {
					return "rolled_back"
				}
				if stage.Status == "failed" {
					return "rollback_failed"
				}
			}
		}
	}
	return "failed"
}
