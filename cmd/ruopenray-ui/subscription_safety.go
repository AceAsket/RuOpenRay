package main

import (
	"fmt"
	"os"
	"path/filepath"
)

// Preserve the exact saved profile and marker, including a pre-existing drift
// from active config. Callers restore this snapshot if activation fails.
func (s *serverState) writeCandidateProfile(cfg map[string]any, backup string) (string, func() error, error) {
	name := s.currentProfileName()
	paths := []string{s.profilePath(name), s.activeProfilePath()}
	previous := make([][]byte, len(paths))
	existed := make([]bool, len(paths))
	for i, path := range paths {
		body, err := os.ReadFile(path)
		if err != nil && !os.IsNotExist(err) {
			return "", nil, err
		}
		previous[i], existed[i] = body, err == nil
	}
	restore := func() error {
		var failures []error
		for i, path := range paths {
			var err error
			if existed[i] {
				err = writeFileAtomic(path, previous[i], 0600)
			} else {
				err = os.Remove(path)
				if os.IsNotExist(err) {
					err = nil
				}
			}
			if err != nil {
				failures = append(failures, err)
			}
		}
		if len(failures) > 0 {
			return fmt.Errorf("откат профиля: %v", failures)
		}
		return nil
	}
	err := s.writeActiveConfig(cfg)
	if err == nil {
		_, err = s.saveProfileConfig(name, cfg)
	}
	if err == nil {
		err = s.writeActiveProfileName(name)
	}
	if err != nil {
		configErr, profileErr := s.restoreSubscriptionConfig(backup), restore()
		if configErr != nil || profileErr != nil {
			err = fmt.Errorf("%w; откат config: %v; %v", err, configErr, profileErr)
		}
		return name, nil, err
	}
	return name, restore, nil
}

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
	// Bootstrap for the previous config is retained before every candidate write.
	// Restoring that known config must remain possible if AdGuard's API is down.
	return writeFileAtomic(s.cfg.ActiveConfig, body, 0600)
}

func (s *serverState) restartSubscriptionWithRollback(backup string) map[string]any {
	before := s.captureRuntimeHealth(s.runtimeHealthConfig(backup))
	result := s.serviceActionWithHealth("restart", &before)
	if result["ok"] == true {
		return result
	}
	err := s.restoreSubscriptionConfig(backup)
	if err != nil {
		result["rollback"] = map[string]any{"ok": false, "error": err.Error()}
		return result
	}
	result["rollback"] = s.serviceActionWithHealth("restart", &before)
	return result
}
