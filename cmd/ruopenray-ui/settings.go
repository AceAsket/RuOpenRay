package main

import (
	"crypto/subtle"
	"encoding/json"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"time"
)

func (s *serverState) changePassword(payload map[string]any) map[string]any {
	current := fmt.Sprint(payload["currentPassword"])
	next := strings.TrimSpace(fmt.Sprint(payload["newPassword"]))
	confirm := strings.TrimSpace(fmt.Sprint(payload["confirmPassword"]))
	if subtle.ConstantTimeCompare([]byte(current), []byte(s.cfg.Password)) != 1 {
		return map[string]any{"ok": false, "stderr": "Текущий пароль не подошел"}
	}
	if len(next) < 8 {
		return map[string]any{"ok": false, "stderr": "Новый пароль должен быть не короче 8 символов"}
	}
	if next != confirm {
		return map[string]any{"ok": false, "stderr": "Пароли не совпадают"}
	}

	steps := []map[string]any{}
	persisted := false
	if runtime.GOOS != "windows" && commandExists("uci") {
		set := run("uci", "set", "ruopenray-ui.main.password="+next)
		commit := run("uci", "commit", "ruopenray-ui")
		steps = append(steps, set, commit)
		persisted = set["ok"] == true && commit["ok"] == true
	} else if runtime.GOOS == "windows" {
		persisted = true
	}
	if runtime.GOOS != "windows" && !persisted {
		return map[string]any{"ok": false, "stderr": "Не удалось сохранить пароль в UCI", "steps": steps}
	}

	s.cfg.Password = next
	s.sessions = map[string]bool{}
	return map[string]any{
		"ok":        true,
		"persisted": persisted,
		"steps":     steps,
		"stdout":    "Пароль панели изменен. Войдите заново.",
	}
}

const (
	defaultAccessLogPath = "/var/log/xray/access.log"
	defaultErrorLogPath  = "/var/log/xray/error.log"
)

func (s *serverState) loggingSettingsPath() string {
	return filepath.Join(s.cfg.DataDir, "logging-settings.json")
}

func defaultLoggingSettings() map[string]any {
	return map[string]any{
		"maxSizeMb":      2,
		"rotateCopies":   1,
		"clearOnRestart": false,
	}
}

func (s *serverState) readLoggingRuntimeSettings() map[string]any {
	settings := defaultLoggingSettings()
	body, err := os.ReadFile(s.loggingSettingsPath())
	if err != nil {
		return settings
	}
	var saved map[string]any
	if json.Unmarshal(body, &saved) != nil {
		return settings
	}
	for key, value := range saved {
		settings[key] = value
	}
	return settings
}

func (s *serverState) writeLoggingRuntimeSettings(settings map[string]any) error {
	if err := os.MkdirAll(s.cfg.DataDir, 0o755); err != nil {
		return err
	}
	body, err := json.MarshalIndent(settings, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(s.loggingSettingsPath(), body, 0o600)
}

func (s *serverState) serviceSettingsPath() string {
	return filepath.Join(s.cfg.DataDir, "service-settings.json")
}

func defaultServiceSettings() map[string]any {
	return map[string]any{
		"startupDelaySec": 0,
		"applyDelaySec":   0,
		"goMemLimit":      "48MiB",
		"goGC":            60,
		"downloadMirror":  "direct",
		"mirrorPrefix":    "",
	}
}

func (s *serverState) readServiceRuntimeSettings() map[string]any {
	settings := defaultServiceSettings()
	body, err := os.ReadFile(s.serviceSettingsPath())
	if err != nil {
		if runtime.GOOS != "windows" && commandExists("uci") {
			if value := firstLine(fmt.Sprint(run("uci", "-q", "get", "ruopenray-ui.main.start_delay")["stdout"]), ""); value != "" {
				settings["startupDelaySec"] = number(value, 0)
			}
			if value := firstLine(fmt.Sprint(run("uci", "-q", "get", "ruopenray-ui.main.apply_delay")["stdout"]), ""); value != "" {
				settings["applyDelaySec"] = number(value, 0)
			}
			if value := firstLine(fmt.Sprint(run("uci", "-q", "get", "ruopenray-ui.main.go_memlimit")["stdout"]), ""); value != "" {
				settings["goMemLimit"] = value
			}
			if value := firstLine(fmt.Sprint(run("uci", "-q", "get", "ruopenray-ui.main.go_gc")["stdout"]), ""); value != "" {
				settings["goGC"] = number(value, 60)
			}
			if value := firstLine(fmt.Sprint(run("uci", "-q", "get", "ruopenray-ui.main.download_mirror")["stdout"]), ""); value != "" {
				settings["downloadMirror"] = value
			}
			if value := firstLine(fmt.Sprint(run("uci", "-q", "get", "ruopenray-ui.main.mirror_prefix")["stdout"]), ""); value != "" {
				settings["mirrorPrefix"] = value
			}
		}
		return settings
	}
	var saved map[string]any
	if json.Unmarshal(body, &saved) != nil {
		return settings
	}
	for key, value := range saved {
		settings[key] = value
	}
	return settings
}

func (s *serverState) writeServiceRuntimeSettings(settings map[string]any) error {
	if err := os.MkdirAll(s.cfg.DataDir, 0o755); err != nil {
		return err
	}
	body, err := json.MarshalIndent(settings, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(s.serviceSettingsPath(), body, 0o600)
}

func clampSeconds(value any, fallback int, max int) int {
	out := number(value, fallback)
	if out < 0 {
		return 0
	}
	if out > max {
		return max
	}
	return out
}

func cleanMirrorPrefix(value any) string {
	raw := strings.TrimSpace(fmt.Sprint(value))
	if raw == "" || raw == "<nil>" {
		return ""
	}
	if !strings.HasPrefix(raw, "http://") && !strings.HasPrefix(raw, "https://") {
		return ""
	}
	return raw
}

func cleanGoMemLimit(value any) string {
	raw := strings.TrimSpace(fmt.Sprint(value))
	if raw == "" || raw == "<nil>" {
		return "48MiB"
	}
	matched, _ := regexp.MatchString(`^\d+(?:MiB|GiB|MB|GB|B)?$`, raw)
	if !matched {
		return "48MiB"
	}
	return raw
}

func (s *serverState) serviceSettings() map[string]any {
	settings := s.readServiceRuntimeSettings()
	startupDelay := clampSeconds(settings["startupDelaySec"], 0, 180)
	applyDelay := clampSeconds(settings["applyDelaySec"], 0, 60)
	goMemLimit := cleanGoMemLimit(settings["goMemLimit"])
	goGC := number(settings["goGC"], 60)
	if goGC < 20 {
		goGC = 20
	}
	if goGC > 200 {
		goGC = 200
	}
	mirror := strings.ToLower(strings.TrimSpace(fmt.Sprint(settings["downloadMirror"])))
	prefix := cleanMirrorPrefix(settings["mirrorPrefix"])
	if mirror != "custom" {
		mirror = "direct"
		prefix = ""
	}
	return map[string]any{
		"ok":              true,
		"startupDelaySec": startupDelay,
		"applyDelaySec":   applyDelay,
		"goMemLimit":      goMemLimit,
		"goGC":            goGC,
		"downloadMirror":  mirror,
		"mirrorPrefix":    prefix,
		"uci": map[string]any{
			"available": runtime.GOOS != "windows" && commandExists("uci"),
			"package":   "ruopenray-ui",
		},
	}
}

func (s *serverState) saveServiceSettings(payload map[string]any) map[string]any {
	settings := s.serviceSettings()
	settings["startupDelaySec"] = clampSeconds(payload["startupDelaySec"], number(settings["startupDelaySec"], 0), 180)
	settings["applyDelaySec"] = clampSeconds(payload["applyDelaySec"], number(settings["applyDelaySec"], 0), 60)
	settings["goMemLimit"] = cleanGoMemLimit(payload["goMemLimit"])
	goGC := number(payload["goGC"], number(settings["goGC"], 60))
	if goGC < 20 {
		goGC = 20
	}
	if goGC > 200 {
		goGC = 200
	}
	settings["goGC"] = goGC
	mirror := strings.ToLower(strings.TrimSpace(fmt.Sprint(payload["downloadMirror"])))
	prefix := cleanMirrorPrefix(payload["mirrorPrefix"])
	if mirror != "custom" || prefix == "" {
		mirror = "direct"
		prefix = ""
	}
	settings["downloadMirror"] = mirror
	settings["mirrorPrefix"] = prefix
	delete(settings, "uci")

	if err := s.writeServiceRuntimeSettings(settings); err != nil {
		return map[string]any{"ok": false, "stderr": err.Error(), "settings": s.serviceSettings()}
	}

	steps := []map[string]any{}
	persisted := false
	if runtime.GOOS != "windows" && commandExists("uci") {
		steps = append(steps, run("uci", "set", fmt.Sprintf("ruopenray-ui.main.start_delay=%d", settings["startupDelaySec"])))
		steps = append(steps, run("uci", "set", fmt.Sprintf("ruopenray-ui.main.apply_delay=%d", settings["applyDelaySec"])))
		steps = append(steps, run("uci", "set", "ruopenray-ui.main.go_memlimit="+fmt.Sprint(settings["goMemLimit"])))
		steps = append(steps, run("uci", "set", fmt.Sprintf("ruopenray-ui.main.go_gc=%d", settings["goGC"])))
		steps = append(steps, run("uci", "set", "ruopenray-ui.main.download_mirror="+fmt.Sprint(settings["downloadMirror"])))
		steps = append(steps, run("uci", "set", "ruopenray-ui.main.mirror_prefix="+fmt.Sprint(settings["mirrorPrefix"])))
		steps = append(steps, run("uci", "commit", "ruopenray-ui"))
		persisted = true
		for _, step := range steps {
			persisted = persisted && step["ok"] == true
		}
	}
	return map[string]any{
		"ok":        true,
		"settings":  s.serviceSettings(),
		"persisted": persisted,
		"steps":     steps,
		"stdout":    "Настройки сервиса сохранены",
	}
}

func (s *serverState) applyDelay() time.Duration {
	settings := s.serviceSettings()
	seconds := number(settings["applyDelaySec"], 0)
	if seconds <= 0 {
		return 0
	}
	if seconds > 60 {
		seconds = 60
	}
	return time.Duration(seconds) * time.Second
}

func (s *serverState) waitBeforeXrayAction(action string) map[string]any {
	if action != "start" && action != "restart" {
		return nil
	}
	delay := s.applyDelay()
	if delay <= 0 {
		return nil
	}
	time.Sleep(delay)
	return map[string]any{"ok": true, "stdout": fmt.Sprintf("Задержка перед %s: %s", action, delay)}
}

func (s *serverState) mirrorURL(rawURL string) string {
	settings := s.serviceSettings()
	if fmt.Sprint(settings["downloadMirror"]) != "custom" {
		return rawURL
	}
	prefix := strings.TrimSpace(fmt.Sprint(settings["mirrorPrefix"]))
	if prefix == "" {
		return rawURL
	}
	if strings.Contains(prefix, "{url}") {
		return strings.ReplaceAll(prefix, "{url}", url.QueryEscape(rawURL))
	}
	if strings.HasSuffix(prefix, "/") {
		return prefix + rawURL
	}
	return prefix + rawURL
}

func validLogLevel(value string) string {
	level := strings.ToLower(strings.TrimSpace(value))
	switch level {
	case "none", "error", "warning", "info", "debug":
		return level
	default:
		return "warning"
	}
}

func cleanLogPath(value string, fallback string) string {
	clean := strings.TrimSpace(value)
	if clean == "" || clean == "<nil>" {
		return fallback
	}
	clean = filepath.Clean(clean)
	if runtime.GOOS != "windows" && !strings.HasPrefix(clean, "/") {
		return fallback
	}
	return clean
}

func intSetting(settings map[string]any, key string, fallback int) int {
	if value, ok := settings[key]; ok {
		return number(value, fallback)
	}
	return fallback
}

func fileSize(path string) int64 {
	info, err := os.Stat(path)
	if err != nil || info.IsDir() {
		return 0
	}
	return info.Size()
}

func (s *serverState) loggingSettings() map[string]any {
	cfg, err := s.readActiveConfig()
	if err != nil {
		return map[string]any{"ok": false, "error": err.Error()}
	}
	logConfig, _ := cfg["log"].(map[string]any)
	if logConfig == nil {
		logConfig = map[string]any{}
	}
	runtimeSettings := s.readLoggingRuntimeSettings()
	accessRaw := strings.TrimSpace(fmt.Sprint(logConfig["access"]))
	errorRaw := strings.TrimSpace(fmt.Sprint(logConfig["error"]))
	accessPath := cleanLogPath(accessRaw, defaultAccessLogPath)
	errorPath := cleanLogPath(errorRaw, defaultErrorLogPath)
	return map[string]any{
		"ok":               true,
		"level":            validLogLevel(fmt.Sprint(logConfig["loglevel"])),
		"accessLog":        accessRaw != "" && accessRaw != "<nil>",
		"accessPath":       accessPath,
		"accessSize":       fileSize(accessPath),
		"errorLog":         errorRaw != "" && errorRaw != "<nil>",
		"errorPath":        errorPath,
		"errorSize":        fileSize(errorPath),
		"dnsLog":           boolPayload(logConfig, "dnsLog", false),
		"maxSizeMb":        intSetting(runtimeSettings, "maxSizeMb", 2),
		"rotateCopies":     intSetting(runtimeSettings, "rotateCopies", 1),
		"clearOnRestart":   boolPayload(runtimeSettings, "clearOnRestart", false),
		"maintenanceEvery": "15 мин",
	}
}

func (s *serverState) saveLoggingSettings(payload map[string]any) map[string]any {
	cfg, err := s.readActiveConfig()
	if err != nil {
		return map[string]any{"ok": false, "stderr": err.Error()}
	}
	logConfig, _ := cfg["log"].(map[string]any)
	if logConfig == nil {
		logConfig = map[string]any{}
	}
	level := validLogLevel(fmt.Sprint(payload["level"]))
	accessPath := cleanLogPath(fmt.Sprint(payload["accessPath"]), defaultAccessLogPath)
	errorPath := cleanLogPath(fmt.Sprint(payload["errorPath"]), defaultErrorLogPath)
	accessLog := boolPayload(payload, "accessLog", false)
	errorLog := boolPayload(payload, "errorLog", false)
	logConfig["loglevel"] = level
	if accessLog {
		logConfig["access"] = accessPath
		if err := os.MkdirAll(filepath.Dir(accessPath), 0o755); err != nil {
			return map[string]any{"ok": false, "stderr": err.Error()}
		}
	} else {
		delete(logConfig, "access")
	}
	if errorLog {
		logConfig["error"] = errorPath
		if err := os.MkdirAll(filepath.Dir(errorPath), 0o755); err != nil {
			return map[string]any{"ok": false, "stderr": err.Error()}
		}
	} else {
		delete(logConfig, "error")
	}
	logConfig["dnsLog"] = boolPayload(payload, "dnsLog", false)
	cfg["log"] = logConfig

	runtimeSettings := s.readLoggingRuntimeSettings()
	maxSizeMb := number(payload["maxSizeMb"], intSetting(runtimeSettings, "maxSizeMb", 2))
	if maxSizeMb < 1 {
		maxSizeMb = 1
	}
	if maxSizeMb > 200 {
		maxSizeMb = 200
	}
	rotateCopies := number(payload["rotateCopies"], intSetting(runtimeSettings, "rotateCopies", 1))
	if rotateCopies < 0 {
		rotateCopies = 0
	}
	if rotateCopies > 5 {
		rotateCopies = 5
	}
	runtimeSettings["maxSizeMb"] = maxSizeMb
	runtimeSettings["rotateCopies"] = rotateCopies
	runtimeSettings["clearOnRestart"] = boolPayload(payload, "clearOnRestart", false)

	test := s.validateConfig(cfg)
	if test["ok"] != true {
		return map[string]any{"ok": false, "stderr": "Конфигурация Xray не прошла проверку", "test": test, "settings": s.loggingSettings()}
	}
	backup, backupErr := s.backupActive("logging-before-apply")
	if backupErr != nil {
		return map[string]any{"ok": false, "stderr": backupErr.Error(), "test": test}
	}
	if err := s.writeActiveConfig(cfg); err != nil {
		return map[string]any{"ok": false, "stderr": err.Error(), "test": test, "backup": backup}
	}
	if err := s.writeLoggingRuntimeSettings(runtimeSettings); err != nil {
		return map[string]any{"ok": false, "stderr": err.Error(), "test": test, "backup": backup}
	}
	maintenance := s.maintainLogFiles(false)
	var restart map[string]any
	if boolPayload(payload, "restart", true) {
		restart = s.serviceAction("restart")
	} else {
		restart = map[string]any{"ok": true, "stdout": "Настройки сохранены без перезапуска Xray"}
	}
	return map[string]any{"ok": restart["ok"], "test": test, "backup": backup, "restart": restart, "maintenance": maintenance, "settings": s.loggingSettings(), "stdout": "Настройки логирования сохранены"}
}

func (s *serverState) configuredLogPaths() []string {
	settings := s.loggingSettings()
	paths := []string{
		cleanLogPath(fmt.Sprint(settings["accessPath"]), defaultAccessLogPath),
		cleanLogPath(fmt.Sprint(settings["errorPath"]), defaultErrorLogPath),
		defaultAccessLogPath,
		defaultErrorLogPath,
		filepath.Join(s.cfg.DataDir, "access.log"),
		filepath.Join(s.cfg.DataDir, "error.log"),
	}
	seen := map[string]bool{}
	unique := []string{}
	for _, item := range paths {
		if item == "" || seen[item] {
			continue
		}
		seen[item] = true
		unique = append(unique, item)
	}
	return unique
}

func (s *serverState) clearLogFiles() map[string]any {
	cleared := []map[string]any{}
	errors := []string{}
	for _, path := range s.configuredLogPaths() {
		info, err := os.Stat(path)
		if err != nil || info.IsDir() {
			continue
		}
		if err := os.Truncate(path, 0); err != nil {
			errors = append(errors, fmt.Sprintf("%s: %s", path, err.Error()))
			continue
		}
		cleared = append(cleared, map[string]any{"path": path, "previousSize": info.Size()})
	}
	return map[string]any{
		"ok":       len(errors) == 0,
		"cleared":  cleared,
		"errors":   errors,
		"settings": s.loggingSettings(),
		"stdout":   fmt.Sprintf("Очищено файлов логов: %d", len(cleared)),
		"stderr":   strings.Join(errors, "\n"),
	}
}

func (s *serverState) startLogMaintenance() {
	go func() {
		ticker := time.NewTicker(15 * time.Minute)
		defer ticker.Stop()
		for range ticker.C {
			s.maintainLogFiles(false)
		}
	}()
}

func (s *serverState) maintainLogFiles(restart bool) map[string]any {
	settings := s.loggingSettings()
	if settings["ok"] != true {
		return map[string]any{"ok": false, "stderr": fmt.Sprint(settings["error"])}
	}
	if restart && boolPayload(settings, "clearOnRestart", false) {
		result := s.clearLogFiles()
		result["action"] = "clear"
		return result
	}
	maxSizeMb := number(settings["maxSizeMb"], 2)
	rotateCopies := number(settings["rotateCopies"], 1)
	if maxSizeMb <= 0 || rotateCopies <= 0 {
		return map[string]any{"ok": true, "rotated": []any{}}
	}
	maxBytes := int64(maxSizeMb) * 1024 * 1024
	rotated := []map[string]any{}
	errors := []string{}
	for _, path := range s.configuredLogPaths() {
		info, err := os.Stat(path)
		if err != nil || info.IsDir() || info.Size() <= maxBytes {
			continue
		}
		if err := rotateLogFile(path, rotateCopies); err != nil {
			errors = append(errors, fmt.Sprintf("%s: %s", path, err.Error()))
			continue
		}
		rotated = append(rotated, map[string]any{"path": path, "previousSize": info.Size()})
	}
	return map[string]any{"ok": len(errors) == 0, "rotated": rotated, "errors": errors, "stderr": strings.Join(errors, "\n")}
}

func rotateLogFile(logPath string, copies int) error {
	if err := os.MkdirAll(filepath.Dir(logPath), 0o755); err != nil {
		return err
	}
	if copies < 1 {
		return os.Truncate(logPath, 0)
	}
	_ = os.Remove(fmt.Sprintf("%s.%d", logPath, copies))
	for i := copies - 1; i >= 1; i-- {
		_ = os.Rename(fmt.Sprintf("%s.%d", logPath, i), fmt.Sprintf("%s.%d", logPath, i+1))
	}
	if err := os.Rename(logPath, logPath+".1"); err != nil {
		return err
	}
	return os.WriteFile(logPath, []byte{}, 0o644)
}
