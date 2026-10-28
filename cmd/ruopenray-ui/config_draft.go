package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

func (s *serverState) configDraftPath() string {
	return filepath.Join(s.cfg.DataDir, "config-draft.json")
}

func (s *serverState) readConfigDraft() map[string]any {
	s.draftMu.Lock()
	defer s.draftMu.Unlock()
	result := s.readConfigDraftLocked()
	if body, err := os.ReadFile(s.cfg.ActiveConfig); err == nil {
		var active map[string]any
		if json.Unmarshal(body, &active) == nil && active != nil {
			result["activeConfig"] = active
			result["activeRevision"] = draftRevision(body)
		}
	}
	return result
}

func draftRevision(body []byte) string {
	sum := sha256.Sum256(body)
	return hex.EncodeToString(sum[:])
}

func (s *serverState) readConfigDraftLocked() map[string]any {
	path := s.configDraftPath()
	info, err := os.Stat(path)
	if err != nil {
		if os.IsNotExist(err) {
			return map[string]any{"ok": true, "exists": false, "revision": "", "activeRevision": s.activeConfigRevision()}
		}
		return map[string]any{"ok": false, "exists": false, "error": err.Error()}
	}
	body, err := os.ReadFile(path)
	if err != nil {
		return map[string]any{"ok": false, "exists": false, "error": err.Error()}
	}
	var cfg map[string]any
	if err := json.Unmarshal(body, &cfg); err != nil {
		return map[string]any{"ok": false, "exists": false, "error": err.Error()}
	}
	normalizeCatchAllRoutingRules(cfg)
	normalizeSniffingDomainExclusions(cfg)
	return map[string]any{
		"ok":             true,
		"exists":         true,
		"config":         cfg,
		"updatedAt":      info.ModTime().Format(time.RFC3339),
		"path":           path,
		"revision":       draftRevision(body),
		"activeRevision": s.activeConfigRevision(),
	}
}

func (s *serverState) activeConfigRevision() string {
	body, err := os.ReadFile(s.cfg.ActiveConfig)
	if err != nil {
		return ""
	}
	return draftRevision(body)
}

func (s *serverState) saveConfigDraft(payload map[string]any) map[string]any {
	s.draftMu.Lock()
	defer s.draftMu.Unlock()
	if expected, supplied := payload["expectedRevision"]; supplied {
		current := s.readConfigDraftLocked()
		if current["ok"] != true || expected != current["revision"] {
			return map[string]any{"ok": false, "conflict": true, "error": "Черновик изменился в другой вкладке. Обновите его перед сохранением.", "revision": current["revision"]}
		}
	}
	cfg, ok := payload["config"].(map[string]any)
	if !ok || cfg == nil {
		return map[string]any{"ok": false, "error": "config draft is missing"}
	}
	normalizeCatchAllRoutingRules(cfg)
	normalizeSniffingDomainExclusions(cfg)
	body, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return map[string]any{"ok": false, "error": err.Error()}
	}
	path := s.configDraftPath()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return map[string]any{"ok": false, "error": err.Error()}
	}
	if err := writeFileAtomic(path, body, 0o600); err != nil {
		return map[string]any{"ok": false, "error": err.Error()}
	}
	return map[string]any{"ok": true, "exists": true, "updatedAt": time.Now().Format(time.RFC3339), "path": path, "revision": draftRevision(body)}
}

func (s *serverState) clearConfigDraft() map[string]any {
	return s.clearConfigDraftRevision(nil)
}

// A successful apply must not remove a draft saved while it was running.
func (s *serverState) clearConfigDraftRevision(expected *string) map[string]any {
	s.draftMu.Lock()
	defer s.draftMu.Unlock()
	if expected != nil {
		current := s.readConfigDraftLocked()
		if current["ok"] != true || current["revision"] != *expected {
			return map[string]any{"ok": true, "exists": current["exists"], "preserved": true, "revision": current["revision"]}
		}
	}
	path := s.configDraftPath()
	if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
		return map[string]any{"ok": false, "error": fmt.Sprintf("remove draft: %v", err)}
	}
	return map[string]any{"ok": true, "exists": false, "revision": ""}
}
