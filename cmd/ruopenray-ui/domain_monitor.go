package main

import (
	"bytes"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"time"

	"github.com/AceAsket/RuOpenRay/internal/domainmon"
)

func (s *serverState) domainMonitor(w http.ResponseWriter, r *http.Request) {
	limit := number(firstNonEmpty(r.URL.Query().Get("limit"), "1000"), 1000)
	if limit < 100 {
		limit = 100
	}
	if limit > 4000 {
		limit = 4000
	}
	leases := dhcpLeases(s.cfg.DataDir)
	devices := map[string]string{}
	for _, lease := range leases {
		ip := strings.TrimSpace(fmt.Sprint(lease["ip"]))
		name := strings.TrimSpace(fmt.Sprint(lease["name"]))
		if ip != "" && name != "" && name != "<nil>" {
			devices[ip] = name
		}
	}
	status := s.domainMonitorRuntime()
	var events []domainmon.Event
	source := "stopped"
	sourcePath := ""
	if status.Running {
		events, source, sourcePath = s.domainMonitorEvents(devices, limit)
	}
	if events == nil {
		events = []domainmon.Event{}
	}
	sort.SliceStable(events, func(i, j int) bool {
		if events[i].Timestamp == events[j].Timestamp {
			return i < j
		}
		return events[i].Timestamp > events[j].Timestamp
	})
	aggregates := domainmon.AggregateDomainEvents(events)
	stats := domainmon.Stats(events, aggregates)
	writeJSON(w, 200, map[string]any{
		"ok":         true,
		"source":     source,
		"sourcePath": sourcePath,
		"running":    status.Running,
		"enabled":    status.Enabled,
		"external":   status.External,
		"service":    status.Service,
		"available":  status.Available,
		"hint":       status.Hint,
		"updatedAt":  time.Now().Format(time.RFC3339),
		"events":     events,
		"domains":    aggregates,
		"devices":    domainmon.AggregateDevices(events),
		"stats":      stats,
	})
}

func (s *serverState) domainMonitorEvents(devices map[string]string, limit int) ([]domainmon.Event, string, string) {
	for _, path := range b4sniLogPaths(s.cfg.DataDir) {
		body, err := os.ReadFile(path)
		if err != nil || len(bytes.TrimSpace(body)) == 0 {
			continue
		}
		events := domainmon.ParseB4SNILines(string(body), devices)
		if len(events) > 0 {
			return domainmon.TrimEvents(events, limit), "b4sni", path
		}
	}
	content, path := s.monitorLogContent()
	events := domainmon.ParseXrayDomainLines(content, devices)
	return domainmon.TrimEvents(events, limit), "xray-access", path
}

func b4sniLogPaths(dataDir string) []string {
	return []string{
		filepath.Join(dataDir, "b4sni.log"),
		"/var/log/ruopenray/b4sni.log",
		"/usr/share/xrayui/logs/b4sni.log",
		"/opt/share/xrayui/logs/b4sni.log",
	}
}

type domainMonitorRuntime struct {
	Running   bool   `json:"running"`
	Enabled   bool   `json:"enabled"`
	External  bool   `json:"external"`
	Available bool   `json:"available"`
	Service   string `json:"service"`
	Hint      string `json:"hint"`
}

func (s *serverState) domainMonitorStatePath() string {
	return filepath.Join(s.cfg.DataDir, "domain-monitor.enabled")
}

func (s *serverState) domainMonitorEnabled() bool {
	body, err := os.ReadFile(s.domainMonitorStatePath())
	if err != nil {
		return true
	}
	return strings.TrimSpace(string(body)) != "0"
}

func (s *serverState) setDomainMonitorEnabled(enabled bool) error {
	if err := os.MkdirAll(s.cfg.DataDir, 0o755); err != nil {
		return err
	}
	value := "0"
	if enabled {
		value = "1"
	}
	return os.WriteFile(s.domainMonitorStatePath(), []byte(value+"\n"), 0o600)
}

func b4sniServiceScript() string {
	for _, path := range []string{"/etc/init.d/b4sni", "/opt/etc/init.d/S99b4sni", "/opt/etc/init.d/S90b4sni"} {
		if info, err := os.Stat(path); err == nil && !info.IsDir() {
			return path
		}
	}
	return ""
}

func (s *serverState) domainMonitorRuntime() domainMonitorRuntime {
	enabled := s.domainMonitorEnabled()
	external := b4sniRunning()
	service := b4sniServiceScript()
	available := service != "" || commandExists("b4sni")
	hint := "Режим наблюдения: RuOpenRay читает b4sni-совместимые файлы и access/logread Xray."
	if available {
		hint = "Найдена b4sni-служба; start/stop будет управлять ей и чтением логов RuOpenRay."
	}
	return domainMonitorRuntime{
		Running: enabled || external, Enabled: enabled, External: external, Available: available, Service: service, Hint: hint,
	}
}

func (s *serverState) controlDomainMonitor(action string) map[string]any {
	action = strings.ToLower(strings.TrimSpace(action))
	result := map[string]any{"ok": true, "stdout": ""}
	switch action {
	case "start":
		if err := s.setDomainMonitorEnabled(true); err != nil {
			return map[string]any{"ok": false, "stderr": err.Error(), "status": s.domainMonitorRuntime()}
		}
		if service := b4sniServiceScript(); service != "" {
			result["service"] = run(service, "start")
		}
		result["stdout"] = "SNI-монитор включен"
	case "stop":
		if err := s.setDomainMonitorEnabled(false); err != nil {
			return map[string]any{"ok": false, "stderr": err.Error(), "status": s.domainMonitorRuntime()}
		}
		if service := b4sniServiceScript(); service != "" {
			result["service"] = run(service, "stop")
		}
		result["stdout"] = "SNI-монитор остановлен"
	case "clear":
		return s.clearDomainMonitorLogs()
	default:
		return map[string]any{"ok": false, "stderr": "Неизвестное действие монитора", "status": s.domainMonitorRuntime()}
	}
	result["status"] = s.domainMonitorRuntime()
	return result
}

func (s *serverState) clearDomainMonitorLogs() map[string]any {
	deleted := 0
	var freed int64
	for _, path := range b4sniLogPaths(s.cfg.DataDir) {
		info, err := os.Stat(path)
		if err != nil || info.IsDir() {
			continue
		}
		if err := os.Remove(path); err != nil {
			continue
		}
		deleted++
		freed += info.Size()
	}
	return map[string]any{
		"ok": true, "deleted": deleted, "freed": freed, "status": s.domainMonitorRuntime(),
		"stdout": fmt.Sprintf("Очищено b4sni-логов: %d, освобождено %.1f KB", deleted, float64(freed)/1024),
	}
}

func b4sniRunning() bool {
	for _, path := range []string{"/var/log/ruopenray/b4sni.pid", "/usr/share/xrayui/logs/b4sni.pid", "/opt/share/xrayui/logs/b4sni.pid"} {
		body, err := os.ReadFile(path)
		if err != nil {
			continue
		}
		pid := strings.TrimSpace(string(body))
		if pid != "" && exec.Command("kill", "-0", pid).Run() == nil {
			return true
		}
	}
	if runtime.GOOS == "windows" {
		return false
	}
	output, err := exec.Command("pidof", "b4sni").Output()
	return err == nil && strings.TrimSpace(string(output)) != ""
}

func (s *serverState) monitorLogContent() (string, string) {
	var blocks []string
	var sourcePaths []string
	paths := []string{
		"/var/log/xray/access.log",
		filepath.Join(s.cfg.DataDir, "access.log"),
		"/var/log/xray/error.log",
		filepath.Join(s.cfg.DataDir, "error.log"),
	}
	if settings := s.loggingSettings(); settings != nil {
		paths = append(paths, cleanLogPath(fmt.Sprint(settings["accessPath"]), ""))
		paths = append(paths, cleanLogPath(fmt.Sprint(settings["errorPath"]), ""))
	}
	if cfg, err := s.readActiveConfig(); err == nil {
		if logConfig, ok := cfg["log"].(map[string]any); ok {
			paths = append(paths, cleanLogPath(fmt.Sprint(logConfig["access"]), ""))
			paths = append(paths, cleanLogPath(fmt.Sprint(logConfig["error"]), ""))
		}
	}
	seenPaths := map[string]bool{}
	for _, path := range paths {
		if path == "" || seenPaths[path] {
			continue
		}
		seenPaths[path] = true
		body, err := os.ReadFile(path)
		if err == nil && len(bytes.TrimSpace(body)) > 0 {
			blocks = append(blocks, string(body))
			sourcePaths = append(sourcePaths, path)
		}
	}
	if runtime.GOOS != "windows" {
		if output, err := exec.Command("logread", "-e", "xray").Output(); err == nil && len(output) > 0 {
			blocks = append(blocks, string(output))
			sourcePaths = append(sourcePaths, "logread:xray")
		}
	}
	return strings.Join(blocks, "\n"), strings.Join(sourcePaths, ", ")
}
