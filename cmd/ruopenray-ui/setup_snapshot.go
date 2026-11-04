package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

func (s *serverState) setupSnapshotPath() string {
	return filepath.Join(s.cfg.DataDir, "setup-snapshot.json")
}

func validateSetupRecoverySnapshot(snapshot map[string]any) error {
	if cfg, ok := snapshot["config"].(map[string]any); !ok || cfg == nil {
		return fmt.Errorf("Отсутствует конфигурация Xray для отката")
	}
	firewall := mapValue(snapshot["firewall"])
	status, statusOK := firewall["status"].(map[string]any)
	nft, nftOK := firewall["nftBody"].(string)
	_, hotplugOK := firewall["hotplugBody"].(string)
	_, activeOK := status["active"].(bool)
	if firewall["ok"] != true || !statusOK || !activeOK || !nftOK || !hotplugOK || (status["active"] == true && strings.TrimSpace(nft) == "") {
		return fmt.Errorf("Отсутствует полный снимок firewall для отката")
	}
	dns := mapValue(snapshot["lanDns"])
	mode, _ := dns["mode"].(string)
	if dns == nil || dns["ok"] == false || mode == "" {
		return fmt.Errorf("Отсутствует состояние LAN DNS для отката")
	}
	for _, flag := range []string{"dnsMutationAttempted", "recoveryPending"} {
		if _, ok := snapshot[flag].(bool); !ok {
			return fmt.Errorf("Некорректное состояние снимка: %s", flag)
		}
	}
	if at, ok := snapshot["createdAt"].(string); !ok {
		return fmt.Errorf("Отсутствует время создания снимка")
	} else if _, err := time.Parse(time.RFC3339Nano, at); err != nil {
		return fmt.Errorf("Некорректное время создания снимка")
	}
	return nil
}

func (s *serverState) readSetupSnapshot() map[string]any {
	body, err := os.ReadFile(s.setupSnapshotPath())
	if os.IsNotExist(err) {
		return map[string]any{"ok": true, "exists": false, "revision": ""}
	}
	var snapshot map[string]any
	if err == nil {
		err = json.Unmarshal(body, &snapshot)
	}
	if err == nil {
		err = validateSetupRecoverySnapshot(snapshot)
	}
	if err != nil {
		return map[string]any{"ok": false, "error": fmt.Sprintf("Не удалось прочитать точку отката мастера: %v", err)}
	}
	return map[string]any{"ok": true, "exists": true, "revision": draftRevision(body), "snapshot": snapshot}
}

// The API mutation lock excludes other processes. This mutex also protects
// callers within the process, including tests and future internal entrypoints.
func (s *serverState) saveSetupSnapshot(payload map[string]any) map[string]any {
	s.setupSnapshotMu.Lock()
	defer s.setupSnapshotMu.Unlock()
	current := s.readSetupSnapshot()
	if current["ok"] != true {
		return current
	}
	expected, supplied := payload["expectedRevision"].(string)
	if !supplied || expected != current["revision"] {
		return map[string]any{"ok": false, "conflict": true, "error": "Точка отката изменилась в другой вкладке. Откройте мастер заново."}
	}
	snapshot := mapValue(payload["snapshot"])
	if err := validateSetupRecoverySnapshot(snapshot); err != nil {
		return map[string]any{"ok": false, "error": err.Error()}
	}
	previous := mapValue(current["snapshot"])
	if previous["recoveryPending"] == true {
		// An incomplete operation must retain the original config/DNS/firewall,
		// even when another tab attempts to start a new wizard.
		for _, key := range []string{"id", "createdAt", "config", "firewall", "lanDns"} {
			before, _ := json.Marshal(previous[key])
			after, _ := json.Marshal(snapshot[key])
			if !bytes.Equal(before, after) {
				return map[string]any{"ok": false, "conflict": true, "error": "Сохранена точка отката незавершённого запуска. Сначала завершите запуск или откат."}
			}
		}
	}
	if id, _ := snapshot["id"].(string); id == "" {
		snapshot["id"] = randomToken()
	}
	body, err := json.MarshalIndent(snapshot, "", "  ")
	if err == nil {
		err = os.MkdirAll(s.cfg.DataDir, 0700)
	}
	if err == nil {
		err = writeFileAtomic(s.setupSnapshotPath(), body, 0600)
	}
	if err != nil {
		return map[string]any{"ok": false, "error": fmt.Sprintf("Не удалось сохранить точку отката: %v", err)}
	}
	return map[string]any{"ok": true, "exists": true, "revision": draftRevision(body), "snapshot": snapshot}
}

func (s *serverState) clearSetupSnapshot(payload map[string]any) map[string]any {
	s.setupSnapshotMu.Lock()
	defer s.setupSnapshotMu.Unlock()
	current := s.readSetupSnapshot()
	if current["ok"] != true {
		return current
	}
	expected, supplied := payload["expectedRevision"].(string)
	if !supplied || expected != current["revision"] {
		return map[string]any{"ok": false, "conflict": true, "error": "Точка отката изменилась в другой вкладке и сохранена на роутере."}
	}
	if err := removeDurable(s.setupSnapshotPath()); err != nil && !os.IsNotExist(err) {
		return map[string]any{"ok": false, "error": err.Error()}
	}
	return map[string]any{"ok": true, "exists": false, "revision": ""}
}

func (s *serverState) setupSnapshotAPI(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodGet {
		respond(w, s.readSetupSnapshot(), nil)
		return
	}
	payload, err := readJSON(w, r)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	if _, supplied := payload["expectedRevision"].(string); !supplied {
		writeJSON(w, http.StatusPreconditionRequired, map[string]any{"ok": false, "error": "Загрузите ревизию точки отката"})
		return
	}
	var result map[string]any
	if r.Method == http.MethodDelete {
		result = s.clearSetupSnapshot(payload)
	} else {
		result = s.saveSetupSnapshot(payload)
	}
	code := http.StatusOK
	if result["conflict"] == true {
		code = http.StatusConflict
	} else if result["ok"] != true {
		code = http.StatusBadRequest
	}
	writeJSON(w, code, result)
}
