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

	"github.com/AceAsket/RuOpenRay/internal/geodata"
)

func (s *serverState) subscriptionSchedulePath() string {
	return filepath.Join(s.cfg.DataDir, "subscription-schedule.json")
}

func (s *serverState) subscriptionSchedule() map[string]any {
	defaults := map[string]any{
		"enabled": false, "time": "04:10", "lastRunAt": "", "lastResult": nil,
	}
	body, err := os.ReadFile(s.subscriptionSchedulePath())
	if err != nil {
		return defaults
	}
	var saved map[string]any
	if json.Unmarshal(body, &saved) != nil {
		return defaults
	}
	for key, value := range defaults {
		if _, ok := saved[key]; !ok {
			saved[key] = value
		}
	}
	hour, minute := geodata.CleanScheduleTime(fmt.Sprint(saved["time"]))
	saved["time"] = fmt.Sprintf("%02d:%02d", hour, minute)
	saved["enabled"] = saved["enabled"] == true
	return saved
}

func (s *serverState) saveSubscriptionSchedule(payload map[string]any) map[string]any {
	current := s.subscriptionSchedule()
	timeValue := fmt.Sprint(current["time"])
	if value, ok := payload["time"]; ok && strings.TrimSpace(fmt.Sprint(value)) != "" && strings.TrimSpace(fmt.Sprint(value)) != "<nil>" {
		timeValue = fmt.Sprint(value)
	}
	hour, minute := geodata.CleanScheduleTime(timeValue)
	schedule := map[string]any{
		"enabled":    boolPayload(payload, "enabled", false),
		"time":       fmt.Sprintf("%02d:%02d", hour, minute),
		"lastRunAt":  current["lastRunAt"],
		"lastResult": current["lastResult"],
	}
	body, _ := json.MarshalIndent(schedule, "", "  ")
	if err := os.WriteFile(s.subscriptionSchedulePath(), body, 0o600); err != nil {
		return map[string]any{"ok": false, "stderr": err.Error(), "schedule": schedule}
	}
	cron := s.installSubscriptionCron(schedule)
	return map[string]any{"ok": cron["ok"], "schedule": schedule, "cron": cron, "subscriptions": s.subscriptionReport(), "stdout": cron["stdout"], "stderr": cron["stderr"]}
}

func (s *serverState) installSubscriptionCron(schedule map[string]any) map[string]any {
	if runtime.GOOS == "windows" {
		return map[string]any{"ok": true, "stdout": "dev-mode: расписание подписок сохранено без установки cron"}
	}
	const marker = "# RuOpenRay subscription update"
	rootCrontab := "/etc/crontabs/root"
	body, _ := os.ReadFile(rootCrontab)
	var lines []string
	for _, line := range strings.Split(string(body), "\n") {
		if strings.Contains(line, marker) || strings.TrimSpace(line) == "" {
			continue
		}
		lines = append(lines, line)
	}
	if schedule["enabled"] == true {
		hour, minute := geodata.CleanScheduleTime(fmt.Sprint(schedule["time"]))
		binary := os.Args[0]
		if !filepath.IsAbs(binary) {
			binary = "/usr/bin/ruopenray-ui"
		}
		env := fmt.Sprintf("RUOPENRAY_DATA_DIR=%s", geodata.ShellQuote(s.cfg.DataDir))
		lines = append(lines, fmt.Sprintf("%d %d * * * %s %s --subscriptions-update-scheduled >/tmp/ruopenray-subscriptions-update.log 2>&1 %s", minute, hour, env, geodata.ShellQuote(binary), marker))
	}
	content := strings.Join(lines, "\n")
	if strings.TrimSpace(content) != "" {
		content += "\n"
	}
	if err := os.WriteFile(rootCrontab, []byte(content), 0o600); err != nil {
		return map[string]any{"ok": false, "stderr": err.Error()}
	}
	restart := exec.Command("/etc/init.d/cron", "restart").Run()
	if restart != nil {
		return map[string]any{"ok": true, "stdout": "cron-файл обновлен, но cron не удалось перезапустить: " + restart.Error()}
	}
	return map[string]any{"ok": true, "stdout": "Расписание подписок обновлено"}
}

func (s *serverState) refreshAllSubscriptionsAndRecord(applyActive bool, restart bool) map[string]any {
	result := s.refreshAllSubscriptions(applyActive, restart)
	schedule := s.subscriptionSchedule()
	summary := map[string]any{
		"ok":      result["ok"],
		"updated": result["updated"],
		"failed":  result["failed"],
		"total":   result["total"],
	}
	schedule["lastRunAt"] = time.Now().Format(time.RFC3339)
	schedule["lastResult"] = summary
	body, _ := json.MarshalIndent(schedule, "", "  ")
	_ = os.WriteFile(s.subscriptionSchedulePath(), body, 0o600)
	result["schedule"] = schedule
	return result
}

func (s *serverState) runScheduledSubscriptionUpdate() map[string]any {
	schedule := s.subscriptionSchedule()
	if schedule["enabled"] != true {
		return map[string]any{"ok": true, "stdout": "Расписание подписок выключено", "schedule": schedule}
	}
	return s.refreshAllSubscriptionsAndRecord(false, false)
}
