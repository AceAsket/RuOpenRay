package main

import (
	"os"
	"path/filepath"
)

func writeFileAtomic(path string, body []byte, mode os.FileMode) error {
	f, err := os.CreateTemp(filepath.Dir(path), ".ruopenray-write-*")
	if err != nil {
		return err
	}
	defer os.Remove(f.Name())
	defer f.Close()
	if err = f.Chmod(mode); err != nil {
		return err
	}
	if _, err = f.Write(body); err != nil {
		return err
	}
	if err = f.Sync(); err != nil {
		return err
	}
	if err = f.Close(); err != nil {
		return err
	}
	return os.Rename(f.Name(), path)
}

func (s *serverState) restoreSubscriptionConfig(backup string) error {
	body, err := os.ReadFile(backup)
	if err != nil {
		return err
	}
	return writeFileAtomic(s.cfg.ActiveConfig, body, 0600)
}

func (s *serverState) restartSubscriptionWithRollback(backup string) map[string]any {
	result := s.serviceAction("restart")
	if result["ok"] == true {
		return result
	}
	err := s.restoreSubscriptionConfig(backup)
	if err != nil {
		result["rollback"] = map[string]any{"ok": false, "error": err.Error()}
		return result
	}
	result["rollback"] = s.serviceAction("restart")
	return result
}
