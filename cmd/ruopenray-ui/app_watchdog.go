package main

import (
	"context"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

type appUpdatePlan struct {
	Target, Backup, ExpectedSHA, PreviousSHA, ProbeToken, ReadyURL, ServiceScript string
	KeepBackup                                                                    bool
	TimeoutSeconds                                                                int
}

func panelSelfCheck(files fs.FS) error {
	for _, path := range []string{"web/index.html", "web/app.js", "web/styles.css"} {
		b, err := fs.ReadFile(files, path)
		if err != nil || len(b) == 0 {
			return fmt.Errorf("нет обязательного ресурса панели: %s", path)
		}
	}
	return nil
}

func executableSHA(path string) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()
	h := sha256.New()
	if _, err = io.Copy(h, f); err != nil {
		return "", err
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}

func (s *serverState) appUpdatePlanPath() string {
	return filepath.Join(s.cfg.DataDir, "app-update-pending.json")
}

func readAppUpdatePlan(path string) (appUpdatePlan, error) {
	var p appUpdatePlan
	b, err := os.ReadFile(path)
	if err == nil {
		err = json.Unmarshal(b, &p)
	}
	return p, err
}

func (s *serverState) appUpdateReady(w http.ResponseWriter, r *http.Request) {
	p, err := readAppUpdatePlan(s.appUpdatePlanPath())
	if err != nil || len(p.ProbeToken) < 32 || subtle.ConstantTimeCompare([]byte(p.ProbeToken), []byte(r.Header.Get("X-RuOpenRay-Update-Token"))) != 1 {
		http.NotFound(w, r)
		return
	}
	path, err := os.Executable()
	if runtime.GOOS == "linux" {
		path = "/proc/self/exe"
	}
	sha, e := executableSHA(path)
	assetErr := panelSelfCheck(embeddedFiles)
	writeJSON(w, 200, map[string]any{"ok": err == nil && e == nil && assetErr == nil, "sha256": sha, "version": appVersion})
}

func appWatchdogProbe(p appUpdatePlan, expected string) bool {
	req, err := http.NewRequest(http.MethodGet, p.ReadyURL, nil)
	if err != nil {
		return false
	}
	req.Header.Set("X-RuOpenRay-Update-Token", p.ProbeToken)
	// Never follow redirects or use an environment proxy for a local readiness check.
	client := &http.Client{Timeout: 2 * time.Second, Transport: &http.Transport{Proxy: nil}, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	defer client.CloseIdleConnections()
	res, err := client.Do(req)
	if err != nil {
		return false
	}
	defer res.Body.Close()
	var result struct {
		OK  bool   `json:"ok"`
		SHA string `json:"sha256"`
	}
	return res.StatusCode == 200 && json.NewDecoder(io.LimitReader(res.Body, 4096)).Decode(&result) == nil && result.OK && result.SHA == expected
}

func waitAppWatchdog(p appUpdatePlan, expected string, probe func(appUpdatePlan, string) bool) bool {
	deadline := time.Now().Add(time.Duration(p.TimeoutSeconds) * time.Second)
	stable := 0
	for time.Now().Before(deadline) {
		if probe(p, expected) {
			stable++
		} else {
			stable = 0
		}
		if stable >= 3 {
			return true
		}
		time.Sleep(time.Second)
	}
	return false
}

func executeAppWatchdog(p appUpdatePlan, restart func() error, wait func(string) bool) map[string]any {
	// Refuse to overwrite a binary installed by another update or the operator.
	current, err := executableSHA(p.Target)
	if err != nil || current != p.ExpectedSHA {
		return map[string]any{"ok": false, "state": "superseded", "error": "целевой бинарник изменился; автоматический откат отменён"}
	}
	if err = restart(); err == nil && wait(p.ExpectedSHA) {
		if !p.KeepBackup {
			os.Remove(p.Backup)
		}
		return map[string]any{"ok": true, "state": "healthy", "sha256": p.ExpectedSHA}
	}
	previous, e := executableSHA(p.Backup)
	if e != nil || previous != p.PreviousSHA {
		return map[string]any{"ok": false, "state": "rollback_failed", "error": "резервный бинарник не прошёл проверку SHA-256"}
	}
	current, e = executableSHA(p.Target)
	if e != nil || current != p.ExpectedSHA {
		return map[string]any{"ok": false, "state": "superseded", "error": "бинарник изменился во время ожидания"}
	}
	if e = os.Chmod(p.Backup, 0755); e == nil {
		e = os.Rename(p.Backup, p.Target)
	}
	if e != nil {
		return map[string]any{"ok": false, "state": "rollback_failed", "error": e.Error(), "backup": p.Backup}
	}
	e = restart()
	healthy := e == nil && wait(p.PreviousSHA)
	return map[string]any{"ok": false, "state": "rolled_back", "rollbackOK": healthy, "error": "новая панель не подтвердила готовность; восстановлен прежний бинарник"}
}

func runAppUpdateWatchdog(path string) int {
	p, err := readAppUpdatePlan(path)
	if err != nil {
		return 1
	}
	if p.TimeoutSeconds < 3 || p.TimeoutSeconds > 90 {
		return 1
	}
	if err = writeFileAtomic(path+".watching", []byte("ready"), 0600); err != nil {
		return 1
	}
	armed := false
	for i := 0; i < 150; i++ {
		if _, e := os.Stat(path + ".armed"); e == nil {
			armed = true
			break
		}
		time.Sleep(100 * time.Millisecond)
	}
	if !armed {
		return 1
	}
	time.Sleep(time.Second) // allow the update response to reach the browser
	restart := func() error {
		ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
		defer cancel()
		return exec.CommandContext(ctx, p.ServiceScript, "restart").Run()
	}
	result := executeAppWatchdog(p, restart, func(expected string) bool { return waitAppWatchdog(p, expected, appWatchdogProbe) })
	result["expectedSHA"] = p.ExpectedSHA
	b, _ := json.Marshal(result)
	recorded := writeFileAtomic(filepath.Join(filepath.Dir(path), "app-update-result.json"), b, 0600) == nil
	if recorded && (result["state"] == "healthy" || result["rollbackOK"] == true) {
		os.Remove(path)
	}
	os.Remove(path + ".watching")
	os.Remove(path + ".armed")
	if result["ok"] == true {
		return 0
	}
	return 1
}

func (s *serverState) scheduleAppUpdate(staged, target, expected string, keep bool) (map[string]any, error) {
	return s.scheduleAppUpdateWithScript(staged, target, expected, keep, "/etc/init.d/"+appServiceName)
}

func (s *serverState) scheduleAppUpdateWithScript(staged, target, expected string, keep bool, script string) (map[string]any, error) {
	if runtime.GOOS != "linux" {
		return nil, fmt.Errorf("безопасное самообновление доступно только на Linux")
	}
	if _, err := os.Stat(script); err != nil {
		return nil, fmt.Errorf("отсутствует init-скрипт панели; автоматическое обновление отменено")
	}
	path := s.appUpdatePlanPath()
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		return nil, fmt.Errorf("предыдущее обновление ещё не завершено; проверьте app-update-result.json")
	}
	old, err := os.ReadFile(target)
	if err != nil {
		return nil, err
	}
	backup, err := stageExecutable(target, old)
	if err != nil {
		return nil, err
	}
	cleanup := true
	defer func() {
		if cleanup {
			os.Remove(backup)
			os.Remove(path)
			os.Remove(path + ".waiting")
			os.Remove(path + ".watching")
		}
	}()
	sha := sha256.Sum256(old)
	host := strings.Trim(s.cfg.Host, "[]")
	if host == "" || host == "0.0.0.0" {
		host = "127.0.0.1"
	}
	if host == "::" {
		host = "::1"
	}
	p := appUpdatePlan{Target: target, Backup: backup, ExpectedSHA: expected, PreviousSHA: hex.EncodeToString(sha[:]), ProbeToken: randomToken(), ReadyURL: "http://" + net.JoinHostPort(host, s.cfg.Port) + "/api/app/update-ready", ServiceScript: script, KeepBackup: keep, TimeoutSeconds: 45}
	b, _ := json.Marshal(p)
	if err = writeFileAtomic(path, b, 0600); err != nil {
		return nil, err
	}
	if err = writeFileAtomic(path+".waiting", []byte("armed"), 0600); err != nil {
		return nil, err
	}
	cmd := exec.Command(backup, "--app-update-watchdog", path)
	detachAppWatchdog(cmd)
	if err = cmd.Start(); err != nil {
		return nil, err
	}
	defer cmd.Process.Release()
	watching := false
	for i := 0; i < 40; i++ {
		if _, e := os.Stat(path + ".watching"); e == nil {
			watching = true
			break
		}
		time.Sleep(50 * time.Millisecond)
	}
	if !watching {
		cmd.Process.Kill()
		return nil, fmt.Errorf("независимый watchdog не подтвердил запуск")
	}
	if err = replaceExecutableAcrossFilesystems(staged, target); err != nil {
		cmd.Process.Kill()
		return nil, err
	}
	if err = os.Rename(path+".waiting", path+".armed"); err != nil {
		cmd.Process.Kill()
		os.Rename(backup, target)
		return nil, err
	}
	cleanup = false
	return map[string]any{"ok": true, "watchdogPID": cmd.Process.Pid, "backup": backup, "readinessTimeoutSeconds": 45, "state": "pending"}, nil
}
