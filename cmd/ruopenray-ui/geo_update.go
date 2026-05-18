package main

import (
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/AceAsket/RuOpenRay/internal/geodata"
)

func (s *serverState) updateGeo(payload map[string]any) map[string]any {
	geoipURL := strings.TrimSpace(fmt.Sprint(payload["geoipUrl"]))
	geositeURL := strings.TrimSpace(fmt.Sprint(payload["geositeUrl"]))
	backup := boolPayload(payload, "backup", false)
	selected := stringList(payload["presets"])
	if len(selected) == 0 {
		if presetID := strings.TrimSpace(fmt.Sprint(payload["preset"])); presetID != "" && presetID != "<nil>" {
			selected = append(selected, presetID)
		}
	}
	if err := os.MkdirAll(s.cfg.GeoDir, 0o755); err != nil {
		return map[string]any{"ok": false, "stderr": err.Error()}
	}
	updates := []map[string]any{}
	baseCount := 0
	for _, presetID := range selected {
		if presetID == "custom" {
			continue
		}
		found := false
		for _, preset := range geoPresets() {
			if fmt.Sprint(preset["id"]) != presetID {
				continue
			}
			found = true
			if installable, ok := preset["installable"].(bool); ok && !installable {
				return map[string]any{"ok": false, "stderr": "Этот источник справочный и не устанавливается в Xray автоматически"}
			}
			mode := fmt.Sprint(preset["mode"])
			if mode == "extra-geosite" {
				target := strings.TrimSpace(fmt.Sprint(preset["target"]))
				url := strings.TrimSpace(fmt.Sprint(preset["geositeUrl"]))
				if target == "" || target == "<nil>" || url == "" || url == "<nil>" {
					return map[string]any{"ok": false, "stderr": "Для дополнительного geosite-файла не задана ссылка или имя файла"}
				}
				updates = append(updates, s.downloadGeoFile(target, url, backup))
				continue
			}
			baseCount++
			if baseCount > 1 {
				return map[string]any{"ok": false, "stderr": "Выберите только один базовый источник geoip.dat/geosite.dat. Дополнительные DAT можно ставить вместе с ним."}
			}
			if mode == "geoip-only" {
				url := strings.TrimSpace(fmt.Sprint(preset["geoipUrl"]))
				if url == "" || url == "<nil>" {
					return map[string]any{"ok": false, "stderr": "Для источника geoip.dat не задана ссылка"}
				}
				updates = append(updates, s.downloadGeoFile("geoip.dat", url, backup))
				continue
			}
			updates = append(updates, s.downloadGeoFile("geoip.dat", fmt.Sprint(preset["geoipUrl"]), backup))
			updates = append(updates, s.downloadGeoFile("geosite.dat", fmt.Sprint(preset["geositeUrl"]), backup))
		}
		if !found {
			return map[string]any{"ok": false, "stderr": "Неизвестный geo-источник: " + presetID}
		}
	}
	customIDs := stringList(payload["customSourceIds"])
	if len(customIDs) > 0 {
		sources := s.geoCustomSources()
		for _, sourceID := range customIDs {
			found := false
			for _, source := range sources {
				if fmt.Sprint(source["id"]) != sourceID {
					continue
				}
				found = true
				if source["enabled"] == false {
					return map[string]any{"ok": false, "stderr": "Источник geodata выключен: " + sourceID}
				}
				if fmt.Sprint(source["kind"]) == "extra" {
					target := geodata.CleanTarget(fmt.Sprint(source["target"]))
					rawURL := strings.TrimSpace(fmt.Sprint(source["url"]))
					if target == "" || rawURL == "" || rawURL == "<nil>" {
						return map[string]any{"ok": false, "stderr": "Для дополнительного dat-источника не задан URL или имя файла: " + sourceID}
					}
					updates = append(updates, s.downloadGeoFile(target, rawURL, backup))
					continue
				}
				baseCount++
				if baseCount > 1 {
					return map[string]any{"ok": false, "stderr": "Выберите только один базовый источник geoip.dat/geosite.dat. Дополнительные DAT можно ставить вместе с ним."}
				}
				geoipURL := strings.TrimSpace(fmt.Sprint(source["geoipUrl"]))
				geositeURL := strings.TrimSpace(fmt.Sprint(source["geositeUrl"]))
				if geoipURL == "" || geositeURL == "" || geoipURL == "<nil>" || geositeURL == "<nil>" {
					return map[string]any{"ok": false, "stderr": "Для базового geodata-источника не заданы обе ссылки: " + sourceID}
				}
				updates = append(updates, s.downloadGeoFile("geoip.dat", geoipURL, backup))
				updates = append(updates, s.downloadGeoFile("geosite.dat", geositeURL, backup))
			}
			if !found {
				return map[string]any{"ok": false, "stderr": "Неизвестный пользовательский geodata-источник: " + sourceID}
			}
		}
	}
	if (len(selected) == 0 && len(customIDs) == 0) || containsString(selected, "custom") {
		if geoipURL == "" || geositeURL == "" || geoipURL == "<nil>" || geositeURL == "<nil>" {
			return map[string]any{"ok": false, "stderr": "Укажите ссылки на geoip.dat и geosite.dat"}
		}
		updates = append(updates, s.downloadGeoFile("geoip.dat", geoipURL, backup))
		updates = append(updates, s.downloadGeoFile("geosite.dat", geositeURL, backup))
	}
	ok := len(updates) > 0
	for _, update := range updates {
		ok = ok && update["ok"] == true
	}
	restart := map[string]any{"ok": true, "stdout": ""}
	if ok {
		restart = s.serviceAction("restart")
		ok = restart["ok"].(bool)
	}
	items := []map[string]any{}
	for _, update := range updates {
		items = append(items, update)
	}
	items = append(items, restart)
	return map[string]any{"ok": ok, "backup": backup, "updates": updates, "restart": restart, "status": s.geoStatus(), "stdout": concatCommandOutput(items...)}
}

func (s *serverState) updateGeoLegacy(payload map[string]any) map[string]any {
	geoipURL := strings.TrimSpace(fmt.Sprint(payload["geoipUrl"]))
	geositeURL := strings.TrimSpace(fmt.Sprint(payload["geositeUrl"]))
	mode := "custom"
	target := ""
	if presetID := strings.TrimSpace(fmt.Sprint(payload["preset"])); presetID != "" && presetID != "<nil>" {
		for _, preset := range geoPresets() {
			if fmt.Sprint(preset["id"]) == presetID {
				if installable, ok := preset["installable"].(bool); ok && !installable {
					return map[string]any{"ok": false, "stderr": "Этот источник добавлен как справочный и не устанавливается в Xray автоматически"}
				}
				mode = fmt.Sprint(preset["mode"])
				target = strings.TrimSpace(fmt.Sprint(preset["target"]))
				geoipURL = fmt.Sprint(preset["geoipUrl"])
				geositeURL = fmt.Sprint(preset["geositeUrl"])
			}
		}
	}
	if mode == "extra-geosite" {
		if geositeURL == "" || geositeURL == "<nil>" || target == "" || target == "<nil>" {
			return map[string]any{"ok": false, "stderr": "Для дополнительного geosite-файла не задана ссылка или имя файла"}
		}
		if err := os.MkdirAll(s.cfg.GeoDir, 0o755); err != nil {
			return map[string]any{"ok": false, "stderr": err.Error()}
		}
		geosite := s.downloadGeoFile(target, geositeURL)
		ok := geosite["ok"].(bool)
		restart := map[string]any{"ok": true, "stdout": ""}
		if ok {
			restart = s.serviceAction("restart")
			ok = restart["ok"].(bool)
		}
		return map[string]any{"ok": ok, "geosite": geosite, "restart": restart, "status": s.geoStatus(), "stdout": concatCommandOutput(geosite, restart)}
	}
	if mode == "geoip-only" {
		if geoipURL == "" || geoipURL == "<nil>" {
			return map[string]any{"ok": false, "stderr": "Для источника geoip.dat не задана ссылка"}
		}
		if err := os.MkdirAll(s.cfg.GeoDir, 0o755); err != nil {
			return map[string]any{"ok": false, "stderr": err.Error()}
		}
		geoip := s.downloadGeoFile("geoip.dat", geoipURL)
		ok := geoip["ok"].(bool)
		restart := map[string]any{"ok": true, "stdout": ""}
		if ok {
			restart = s.serviceAction("restart")
			ok = restart["ok"].(bool)
		}
		return map[string]any{"ok": ok, "geoip": geoip, "restart": restart, "status": s.geoStatus(), "stdout": concatCommandOutput(geoip, restart)}
	}
	if geoipURL == "" || geositeURL == "" || geoipURL == "<nil>" || geositeURL == "<nil>" {
		return map[string]any{"ok": false, "stderr": "Укажите ссылки на geoip.dat и geosite.dat"}
	}
	if err := os.MkdirAll(s.cfg.GeoDir, 0o755); err != nil {
		return map[string]any{"ok": false, "stderr": err.Error()}
	}
	geoip := s.downloadGeoFile("geoip.dat", geoipURL)
	geosite := s.downloadGeoFile("geosite.dat", geositeURL)
	ok := geoip["ok"].(bool) && geosite["ok"].(bool)
	restart := map[string]any{"ok": true, "stdout": ""}
	if ok {
		restart = s.serviceAction("restart")
		ok = restart["ok"].(bool)
	}
	return map[string]any{"ok": ok, "geoip": geoip, "geosite": geosite, "restart": restart, "status": s.geoStatus(), "stdout": concatCommandOutput(geoip, geosite, restart)}
}

func (s *serverState) cleanupGeoBackups() map[string]any {
	entries, err := os.ReadDir(s.cfg.BackupDir)
	if err != nil {
		return map[string]any{"ok": false, "stderr": err.Error()}
	}
	prefixes := []string{"geoip.dat-", "geosite.dat-"}
	for _, preset := range geoPresets() {
		if target := strings.TrimSpace(fmt.Sprint(preset["target"])); target != "" && target != "<nil>" {
			prefixes = append(prefixes, target+"-")
		}
	}
	deleted := 0
	var freed int64
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		name := entry.Name()
		matched := false
		for _, prefix := range prefixes {
			if strings.HasPrefix(name, prefix) {
				matched = true
				break
			}
		}
		if !matched {
			continue
		}
		path := filepath.Join(s.cfg.BackupDir, name)
		info, err := entry.Info()
		if err == nil {
			freed += info.Size()
		}
		if err := os.Remove(path); err == nil {
			deleted++
		}
	}
	return map[string]any{"ok": true, "deleted": deleted, "freed": freed, "status": s.geoStatus(), "stdout": fmt.Sprintf("Удалено geo-бэкапов: %d, освобождено %.1f MB", deleted, float64(freed)/1024/1024)}
}

func (s *serverState) deleteGeoFiles(payload map[string]any) map[string]any {
	files := stringList(payload["files"])
	if file := strings.TrimSpace(fmt.Sprint(payload["file"])); file != "" && file != "<nil>" {
		files = append(files, file)
	}
	if len(files) == 0 {
		return map[string]any{"ok": false, "stderr": "Выберите dat-файл для удаления", "status": s.geoStatus()}
	}
	deleted := []map[string]any{}
	errors := []string{}
	var freed int64
	for _, raw := range files {
		name := geodata.CleanFileName(raw)
		if name == "" {
			errors = append(errors, fmt.Sprintf("Некорректное имя файла: %s", raw))
			continue
		}
		target := filepath.Join(s.cfg.GeoDir, name)
		info, err := os.Stat(target)
		if err != nil {
			errors = append(errors, fmt.Sprintf("%s: %s", name, err.Error()))
			continue
		}
		if err := os.Remove(target); err != nil {
			errors = append(errors, fmt.Sprintf("%s: %s", name, err.Error()))
			continue
		}
		freed += info.Size()
		deleted = append(deleted, map[string]any{"name": name, "size": info.Size()})
	}
	ok := len(errors) == 0
	stdout := fmt.Sprintf("Удалено dat-файлов: %d, освобождено %.1f MB. Xray не перезапускался автоматически.", len(deleted), float64(freed)/1024/1024)
	return map[string]any{"ok": ok, "deleted": deleted, "errors": errors, "freed": freed, "status": s.geoStatus(), "stdout": stdout, "stderr": strings.Join(errors, "\n")}
}

func (s *serverState) downloadGeoFile(name string, rawURL string, keepBackup ...bool) map[string]any {
	downloadURL := s.mirrorURL(rawURL)
	resp, err := (&http.Client{Timeout: 90 * time.Second}).Get(downloadURL)
	if err != nil {
		return map[string]any{"ok": false, "stderr": err.Error(), "url": downloadURL, "sourceUrl": rawURL}
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return map[string]any{"ok": false, "stderr": fmt.Sprintf("download HTTP %d", resp.StatusCode), "url": downloadURL, "sourceUrl": rawURL}
	}
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return map[string]any{"ok": false, "stderr": err.Error(), "url": downloadURL, "sourceUrl": rawURL}
	}
	if len(body) < 1024 {
		return map[string]any{"ok": false, "stderr": "файл слишком маленький, похоже на ошибку загрузки", "url": downloadURL, "sourceUrl": rawURL}
	}
	target := filepath.Join(s.cfg.GeoDir, name)
	backup := len(keepBackup) == 0 || keepBackup[0]
	if backup {
		if err := os.MkdirAll(s.cfg.BackupDir, 0o755); err != nil {
			return map[string]any{"ok": false, "stderr": err.Error(), "url": downloadURL, "sourceUrl": rawURL}
		}
	}
	if backup {
		current, err := os.ReadFile(target)
		if err == nil && len(current) > 0 {
			backup := filepath.Join(s.cfg.BackupDir, name+"-"+time.Now().Format("20060102-150405"))
			_ = os.WriteFile(backup, current, 0o644)
		}
	}
	if err := os.WriteFile(target, body, 0o644); err != nil {
		return map[string]any{"ok": false, "stderr": err.Error(), "url": downloadURL, "sourceUrl": rawURL}
	}
	return map[string]any{"ok": true, "stdout": fmt.Sprintf("%s обновлен: %.1f MB", name, float64(len(body))/1024/1024), "url": downloadURL, "sourceUrl": rawURL, "size": len(body)}
}
