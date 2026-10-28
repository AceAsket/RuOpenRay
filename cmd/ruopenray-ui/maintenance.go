package main

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

const geoCronMarker = "# RuOpenRay geo update"

func (s *serverState) runCLI(args []string) int {
	if len(args) == 0 {
		args = []string{"help"}
	}
	command := strings.ToLower(strings.TrimSpace(args[0]))
	switch command {
	case "help", "-h", "--help":
		fmt.Println(strings.TrimSpace(`RuOpenRay UI

Usage:
  ruopenray-ui serve
  ruopenray-ui version
  ruopenray-ui status
  ruopenray-ui diagnostics
  ruopenray-ui backup
  ruopenray-ui update [version] [--backup]
  ruopenray-ui route-presets add-source [url] [--name name] [--auto-update]
  ruopenray-ui route-presets update [source-id]
  ruopenray-ui start|stop|restart
  ruopenray-ui uninstall [--purge]

All operational commands print JSON. The web service is the default when no command is provided.`))
		return 0
	case "version", "-v", "--version":
		printJSON(map[string]any{"ok": true, "version": appVersion, "asset": ruOpenRayAssetName(), "arch": systemArchitecture("github-release")})
		return 0
	case "status":
		printJSON(map[string]any{"ok": true, "service": s.xrayServiceStatus(), "core": runTimeout(5*time.Second, "xray", "version"), "system": s.systemMetrics(), "app": map[string]any{"version": appVersion, "asset": ruOpenRayAssetName()}})
		return 0
	case "diagnostics", "diag":
		printJSON(s.diagnostics())
		return 0
	case "backup":
		path, err := s.backupBundle()
		printJSON(map[string]any{"ok": err == nil, "path": path, "stderr": errString(err)})
		if err != nil {
			return 1
		}
		return 0
	case "update", "self-update":
		version := ""
		keepBackup := false
		for _, arg := range args[1:] {
			switch strings.TrimSpace(arg) {
			case "--backup":
				keepBackup = true
			case "--no-backup":
				keepBackup = false
			default:
				if !strings.HasPrefix(arg, "-") && version == "" {
					version = arg
				}
			}
		}
		result := s.updateApp(version, keepBackup)
		printJSON(result)
		if result["ok"] != true {
			return 1
		}
		return 0
	case "route-presets", "scenarios":
		result := s.routePresetSourcesCLI(args[1:])
		printJSON(result)
		if result["ok"] != true {
			return 1
		}
		return 0
	case "start", "stop", "restart":
		result := s.serviceAction(command)
		printJSON(result)
		if result["ok"] != true {
			return 1
		}
		return 0
	case "uninstall", "remove":
		purge := false
		for _, arg := range args[1:] {
			if arg == "--purge" {
				purge = true
			}
		}
		result := s.uninstallApp(purge)
		printJSON(result)
		if result["ok"] != true {
			return 1
		}
		return 0
	default:
		printJSON(map[string]any{"ok": false, "stderr": "unknown command: " + command})
		return 2
	}
}

func (s *serverState) uninstallApp(purge bool) map[string]any {
	steps := []map[string]any{}
	if runtime.GOOS != "windows" {
		if _, err := os.Stat("/etc/init.d/" + appServiceName); err == nil {
			steps = append(steps, run("/etc/init.d/"+appServiceName, "disable"))
			steps = append(steps, run("/etc/init.d/"+appServiceName, "stop"))
		}
	}
	_ = s.removeGeoCron()
	paths := []string{
		"/etc/init.d/" + appServiceName,
		"/etc/config/ruopenray-ui",
		"/usr/share/luci/menu.d/luci-app-ruopenray.json",
		"/usr/share/rpcd/acl.d/luci-app-ruopenray.json",
		"/usr/share/ucode/luci/template/ruopenray",
	}
	for _, item := range paths {
		if err := os.RemoveAll(item); err != nil && !os.IsNotExist(err) {
			steps = append(steps, map[string]any{"ok": false, "command": "remove " + item, "stderr": err.Error()})
		} else {
			steps = append(steps, map[string]any{"ok": true, "command": "remove " + item})
		}
	}
	if purge {
		if err := os.RemoveAll(s.cfg.DataDir); err != nil && !os.IsNotExist(err) {
			steps = append(steps, map[string]any{"ok": false, "command": "purge " + s.cfg.DataDir, "stderr": err.Error()})
		} else {
			steps = append(steps, map[string]any{"ok": true, "command": "purge " + s.cfg.DataDir})
		}
	}
	if commandExists("uci") {
		steps = append(steps, run("uci", "delete", "ruopenray-ui.main"))
		steps = append(steps, run("uci", "commit", "ruopenray-ui"))
	}
	if runtime.GOOS != "windows" {
		if exe, err := os.Executable(); err == nil {
			if abs, err := filepath.Abs(exe); err == nil && strings.Contains(abs, appServiceName) {
				if err := os.Remove(abs); err != nil && !os.IsNotExist(err) {
					steps = append(steps, map[string]any{"ok": false, "command": "remove " + abs, "stderr": err.Error()})
				} else {
					steps = append(steps, map[string]any{"ok": true, "command": "remove " + abs})
				}
			}
		}
	}
	ok := true
	for _, step := range steps {
		ok = ok && step["ok"] == true
	}
	return map[string]any{"ok": ok, "purge": purge, "steps": steps}
}

func (s *serverState) removeGeoCron() map[string]any {
	if runtime.GOOS == "windows" {
		return map[string]any{"ok": true, "stdout": "dev-mode"}
	}
	const rootCrontab = "/etc/crontabs/root"
	body, err := os.ReadFile(rootCrontab)
	if err != nil {
		return map[string]any{"ok": true, "stdout": "crontab not found"}
	}
	content, changed := removeGeoCronLines(string(body))
	if !changed {
		return map[string]any{"ok": true, "stdout": "cron unchanged"}
	}
	if err := os.WriteFile(rootCrontab, []byte(content), 0o600); err != nil {
		return map[string]any{"ok": false, "stderr": err.Error()}
	}
	_ = exec.Command("/etc/init.d/cron", "restart").Run()
	return map[string]any{"ok": true, "stdout": "geo cron removed"}
}

func removeGeoCronLines(content string) (string, bool) {
	var lines []string
	changed := false
	for _, line := range strings.Split(content, "\n") {
		if strings.Contains(line, geoCronMarker) {
			changed = true
			continue
		}
		if strings.TrimSpace(line) != "" {
			lines = append(lines, line)
		}
	}
	if !changed {
		return content, false
	}
	next := strings.Join(lines, "\n")
	if strings.TrimSpace(next) != "" {
		next += "\n"
	}
	return next, true
}

func printJSON(payload any) {
	body, err := json.MarshalIndent(payload, "", "  ")
	if err != nil {
		fmt.Println(`{"ok":false,"stderr":"json marshal failed"}`)
		return
	}
	fmt.Println(string(body))
}
