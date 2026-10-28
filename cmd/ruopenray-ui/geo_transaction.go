package main

import (
	"bytes"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
)

const maxGeoDataBytes = 64 << 20

// Validate protobuf framing without copying every category into a second buffer.
// Native Xray validation below checks the referenced categories and semantics.
func validateGeoData(body []byte) error {
	if len(body) == 0 || len(body) > maxGeoDataBytes {
		return fmt.Errorf("DAT должен иметь размер от 1 байта до 64 МиБ")
	}
	count := 0
	for pos := 0; pos < len(body); {
		field, wire, ok := geoReadTag(body, &pos)
		if !ok || field != 1 || wire != 2 {
			return fmt.Errorf("Некорректный формат DAT")
		}
		entry, ok := geoReadBytes(body, &pos)
		if !ok {
			return fmt.Errorf("DAT обрезан")
		}
		code := ""
		for offset := 0; offset < len(entry); {
			key, kind, ok := geoReadTag(entry, &offset)
			if !ok {
				return fmt.Errorf("Повреждена категория DAT")
			}
			if key == 1 && kind == 2 {
				code, ok = geoReadString(entry, &offset)
			} else {
				ok = geoSkipField(entry, &offset, kind)
			}
			if !ok {
				return fmt.Errorf("Повреждены данные DAT")
			}
		}
		if strings.TrimSpace(code) == "" {
			return fmt.Errorf("В категории DAT нет кода")
		}
		count++
	}
	if count == 0 {
		return fmt.Errorf("DAT не содержит категорий")
	}
	return nil
}

func copyGeoFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.OpenFile(dst, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if err != nil {
		return err
	}
	_, copyErr := io.Copy(out, in)
	if copyErr == nil {
		copyErr = out.Sync()
	}
	closeErr := out.Close()
	if copyErr != nil {
		return copyErr
	}
	return closeErr
}

func (s *serverState) runGeoTransaction(keep, restart bool, prepare func(*serverState) map[string]any) map[string]any {
	fail := func(err error) map[string]any { return map[string]any{"ok": false, "stderr": err.Error()} }
	if err := os.MkdirAll(s.cfg.GeoDir, 0755); err != nil {
		return fail(err)
	}
	stageDir, err := os.MkdirTemp(s.cfg.GeoDir, ".ruopenray-geo-stage-")
	if err != nil {
		return fail(err)
	}
	defer os.RemoveAll(stageDir)
	entries, err := os.ReadDir(s.cfg.GeoDir)
	if err != nil {
		return fail(err)
	}
	for _, entry := range entries {
		if !entry.IsDir() && strings.HasSuffix(entry.Name(), ".dat") {
			if err := copyGeoFile(filepath.Join(s.cfg.GeoDir, entry.Name()), filepath.Join(stageDir, entry.Name())); err != nil {
				return fail(err)
			}
		}
	}
	stage := &serverState{cfg: s.cfg, geoStaging: true}
	stage.cfg.GeoDir = stageDir
	stage.cfg.BackupDir = filepath.Join(stageDir, "backups")
	result := prepare(stage)
	if result["ok"] != true {
		return result
	}
	changed := []string{}
	stagedEntries, err := os.ReadDir(stageDir)
	if err != nil {
		return fail(err)
	}
	for _, entry := range stagedEntries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".dat") {
			continue
		}
		body, err := os.ReadFile(filepath.Join(stageDir, entry.Name()))
		if err != nil {
			return fail(err)
		}
		old, _ := os.ReadFile(filepath.Join(s.cfg.GeoDir, entry.Name()))
		if bytes.Equal(body, old) {
			continue
		}
		if err := validateGeoData(body); err != nil {
			return fail(fmt.Errorf("%s: %w", entry.Name(), err))
		}
		changed = append(changed, entry.Name())
	}
	if len(changed) == 0 {
		result["unchanged"] = true
		result["status"] = s.geoStatus()
		return result
	}
	cfg, err := s.readActiveConfig()
	if err != nil {
		return fail(err)
	}
	if test := stage.validateConfig(cfg); test["ok"] != true {
		return map[string]any{"ok": false, "stderr": "Xray не принимает конфигурацию с новыми geo-базами; рабочие файлы сохранены", "test": test}
	}
	if err := os.MkdirAll(s.cfg.BackupDir, 0700); err != nil {
		return fail(err)
	}
	backup, err := os.MkdirTemp(s.cfg.BackupDir, "geo-transaction-")
	if err != nil {
		return fail(err)
	}
	existed := map[string]bool{}
	for _, name := range changed {
		path := filepath.Join(s.cfg.GeoDir, name)
		if _, err := os.Stat(path); err == nil {
			if err := copyGeoFile(path, filepath.Join(backup, name)); err != nil {
				return fail(err)
			}
			existed[name] = true
		} else if !os.IsNotExist(err) {
			return fail(err)
		}
	}
	applied := []string{}
	rollback := func() error {
		var errors []string
		for _, name := range applied {
			path := filepath.Join(s.cfg.GeoDir, name)
			var err error
			if existed[name] {
				err = os.Rename(filepath.Join(backup, name), path)
			} else {
				err = os.Remove(path)
			}
			if err != nil {
				errors = append(errors, name+": "+err.Error())
			}
		}
		if len(errors) > 0 {
			return fmt.Errorf("%s", strings.Join(errors, "; "))
		}
		return nil
	}
	for _, name := range changed {
		if err := os.Rename(filepath.Join(stageDir, name), filepath.Join(s.cfg.GeoDir, name)); err != nil {
			return map[string]any{"ok": false, "stderr": err.Error(), "rollbackError": fmt.Sprint(rollback()), "rollbackBackup": backup}
		}
		applied = append(applied, name)
	}
	activation := map[string]any{"ok": true, "skipped": true, "stdout": "Xray не перезапускался"}
	if restart {
		activation = s.serviceAction("restart")
	}
	if activation["ok"] != true {
		restoreErr := rollback()
		var restored map[string]any
		if restoreErr == nil {
			restored = s.serviceAction("restart")
		}
		return map[string]any{"ok": false, "stderr": "Новые geo-базы не активированы; выполнен откат", "restart": activation, "rollback": restored, "rollbackError": fmt.Sprint(restoreErr), "rollbackBackup": backup}
	}
	if !keep {
		_ = os.RemoveAll(backup)
	} else {
		result["rollbackBackup"] = backup
	}
	result["restart"], result["status"], result["changedFiles"] = activation, s.geoStatus(), changed
	return result
}

func (s *serverState) restartGeoService() map[string]any {
	if s.geoStaging {
		return map[string]any{"ok": true, "skipped": true}
	}
	return s.serviceAction("restart")
}
