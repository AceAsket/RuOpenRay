package main

import (
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/AceAsket/RuOpenRay/internal/geodata"
)

const maxGeoUploadBytes = maxGeoDataBytes

func (s *serverState) uploadGeoFile(r *http.Request) map[string]any {
	tempPath, filename, written, err := s.readGeoUpload(r)
	if err != nil {
		return map[string]any{"ok": false, "stderr": err.Error(), "status": s.geoStatus()}
	}
	defer os.Remove(tempPath)
	if !strings.HasSuffix(strings.ToLower(filename), ".dat") {
		return map[string]any{"ok": false, "stderr": "Можно загрузить только файл с расширением .dat", "status": s.geoStatus()}
	}

	target, err := geoUploadTarget(r, filename)
	if err != nil {
		return map[string]any{"ok": false, "stderr": err.Error(), "status": s.geoStatus()}
	}
	backup := formBool(r, "backup", false)
	return s.runGeoTransaction(backup, formBool(r, "restart", true), func(stage *serverState) map[string]any {
		if err := os.Rename(tempPath, filepath.Join(stage.cfg.GeoDir, target)); err != nil {
			return map[string]any{"ok": false, "stderr": err.Error()}
		}
		return map[string]any{"ok": true, "file": target, "size": written, "backup": backup, "stdout": fmt.Sprintf("%s загружен: %s", target, byteCount(written))}
	})
}

func geoUploadTarget(r *http.Request, uploadedName string) (string, error) {
	mode := strings.ToLower(strings.TrimSpace(formValue(r, "target")))
	switch mode {
	case "", "geosite":
		return "geosite.dat", nil
	case "geoip":
		return "geoip.dat", nil
	case "custom", "extra", "separate":
		name := geodata.CleanTarget(formValue(r, "name"))
		if name == "" {
			name = geodata.CleanFileName(uploadedName)
		}
		if name == "" || name == "geoip.dat" || name == "geosite.dat" {
			return "", fmt.Errorf("Для отдельного DAT задайте имя файла, например my-source.dat")
		}
		return name, nil
	default:
		return "", fmt.Errorf("Неизвестный тип сохранения DAT: %s", mode)
	}
}

func (s *serverState) backupGeoDat(name string, targetPath string) error {
	current, err := os.ReadFile(targetPath)
	if err != nil || len(current) == 0 {
		return nil
	}
	if err := os.MkdirAll(s.cfg.BackupDir, 0o755); err != nil {
		return err
	}
	backup := filepath.Join(s.cfg.BackupDir, name+"-"+time.Now().Format("20060102-150405"))
	return os.WriteFile(backup, current, 0o644)
}

func formBool(r *http.Request, key string, fallback bool) bool {
	clean := strings.ToLower(strings.TrimSpace(formValue(r, key)))
	if clean == "" {
		return fallback
	}
	return clean == "1" || clean == "true" || clean == "yes" || clean == "on"
}

func formValue(r *http.Request, key string) string {
	if r == nil {
		return ""
	}
	if r.PostForm != nil {
		if value := r.PostForm.Get(key); value != "" {
			return value
		}
	}
	if r.Form != nil {
		if value := r.Form.Get(key); value != "" {
			return value
		}
	}
	return r.FormValue(key)
}
