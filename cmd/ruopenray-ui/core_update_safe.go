package main

import (
	"archive/zip"
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"sync"
	"time"
)

var coreUpdateMu sync.Mutex

func boundedDownload(address string, limit int64) ([]byte, error) {
	resp, err := (&http.Client{Timeout: 90 * time.Second}).Get(address)
	if err != nil {
		return nil, fmt.Errorf("не удалось скачать файл")
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("download HTTP %d", resp.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, limit+1))
	if err != nil {
		return nil, err
	}
	if int64(len(body)) > limit {
		return nil, fmt.Errorf("файл превышает допустимый размер")
	}
	return body, nil
}

func verifyCoreDigest(body, digest []byte) error {
	match := regexp.MustCompile(`(?im)^SHA(?:2)?-256\s*=\s*([a-f0-9]{64})\s*$`).FindSubmatch(digest)
	if len(match) != 2 {
		return fmt.Errorf("в официальном .dgst отсутствует SHA-256")
	}
	sum := sha256.Sum256(body)
	if !strings.EqualFold(hex.EncodeToString(sum[:]), string(match[1])) {
		return fmt.Errorf("SHA-256 архива Xray не совпадает")
	}
	return nil
}

// Stage on the destination filesystem, flush and close before any rename.
func stageExecutable(target string, body []byte) (string, error) {
	f, err := os.CreateTemp(filepath.Dir(target), ".xray-update-*")
	if err != nil {
		return "", err
	}
	name := f.Name()
	ok := false
	defer func() {
		_ = f.Close()
		if !ok {
			_ = os.Remove(name)
		}
	}()
	if err = f.Chmod(0700); err != nil {
		return "", err
	}
	if _, err = f.Write(body); err != nil {
		return "", err
	}
	if err = f.Sync(); err != nil {
		return "", err
	}
	if err = f.Close(); err != nil {
		return "", err
	}
	ok = true
	return name, nil
}

// Preparation and the mandatory rollback copy precede replacement/restart.
// A stopped service stays stopped. A failed rollback keeps its backup for recovery.
func replaceCoreTransaction(target, staged string, keep bool, prepare func() error, activate func() error) (string, error) {
	if err := prepare(); err != nil {
		return "", err
	}
	old, err := os.ReadFile(target)
	if err != nil {
		return "", err
	}
	backup, err := stageExecutable(target, old)
	if err != nil {
		return "", fmt.Errorf("резервная копия: %w", err)
	}
	if err = os.Chmod(staged, 0755); err == nil {
		err = os.Rename(staged, target)
	}
	if err != nil {
		_ = os.Remove(backup)
		return "", err
	}
	if err = activate(); err != nil {
		// Reuse the prepared copy: rollback must not require extra free disk space.
		copyErr := os.Chmod(backup, 0755)
		if copyErr == nil {
			copyErr = os.Rename(backup, target)
		}
		if copyErr != nil {
			return backup, fmt.Errorf("%v; восстановление бинарника не удалось: %w; копия: %s", err, copyErr, backup)
		}
		backup = ""

		if rollbackErr := activate(); rollbackErr != nil {
			return backup, fmt.Errorf("%v; прежний бинарник восстановлен в %s, но сервис не прошёл проверку: %w", err, target, rollbackErr)
		}
		return backup, fmt.Errorf("%v; выполнен откат к прежнему Xray", err)
	}
	if !keep {
		_ = os.Remove(backup)
		backup = ""
	}
	return backup, nil
}

func (s *serverState) installCoreRelease(version string, keepBackup bool) map[string]any {
	fail := func(err error) map[string]any { return map[string]any{"ok": false, "stderr": err.Error()} }
	if runtime.GOOS != "linux" {
		return fail(fmt.Errorf("обновление ядра доступно только на Linux"))
	}
	status := s.xrayServiceStatus()
	running := status["running"] == true
	if running && (status["managed"] != true || s.cfg.ServiceName != "xray") {
		return fail(fmt.Errorf("Xray запущен вне управляемого сервиса; автоматическая замена отменена"))
	}
	assetURL, assetName, err := findReleaseAsset(version)
	if err != nil {
		return fail(err)
	}
	body, err := boundedDownload(s.mirrorURL(assetURL), 128<<20)
	if err != nil {
		return fail(err)
	}
	// Fetch the checksum directly from the official release, independently of mirrors.
	digest, err := boundedDownload(assetURL+".dgst", 16<<10)
	if err != nil {
		return fail(err)
	}
	if err = verifyCoreDigest(body, digest); err != nil {
		return fail(err)
	}
	reader, err := zip.NewReader(bytes.NewReader(body), int64(len(body)))
	if err != nil {
		return fail(err)
	}
	var binary []byte
	for _, file := range reader.File {
		if file.Name != "xray" {
			continue
		}
		rc, err := file.Open()
		if err != nil {
			return fail(err)
		}
		binary, err = io.ReadAll(io.LimitReader(rc, (256<<20)+1))
		_ = rc.Close()
		if err != nil {
			return fail(err)
		}
		break
	}
	if len(binary) == 0 || len(binary) > 256<<20 {
		return fail(fmt.Errorf("недопустимый бинарник в архиве Xray"))
	}
	const target = "/usr/bin/xray"
	staged, err := stageExecutable(target, binary)
	if err != nil {
		return fail(err)
	}
	defer os.Remove(staged)
	config, err := os.ReadFile(s.cfg.ActiveConfig)
	if err != nil {
		return fail(err)
	}
	prepare := func() error {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		cmd := exec.CommandContext(ctx, staged, "run", "-test", "-config", s.cfg.ActiveConfig)
		cmd.Env = s.xrayEnv()
		if output, err := cmd.CombinedOutput(); err != nil {
			return fmt.Errorf("новое ядро не принимает текущий конфиг: %s", strings.TrimSpace(string(output)))
		}
		current, err := os.ReadFile(s.cfg.ActiveConfig)
		if err != nil || !bytes.Equal(config, current) {
			return fmt.Errorf("конфигурация изменилась во время подготовки; повторите обновление")
		}
		latest := s.xrayServiceStatus()
		if latest["running"] != status["running"] || latest["pid"] != status["pid"] {
			return fmt.Errorf("состояние Xray изменилось во время подготовки")
		}
		return nil
	}
	activate := func() error {
		if !running {
			return nil
		}
		result := runTimeout(30*time.Second, "/etc/init.d/"+s.cfg.ServiceName, "restart")
		if result["ok"] != true {
			return fmt.Errorf("перезапуск Xray не удался")
		}
		// Require a managed process with an unchanged PID for five consecutive seconds.
		var last any
		stable := 0
		for i := 0; i < 15; i++ {
			time.Sleep(time.Second)
			now := s.xrayServiceStatus()
			executable, _ := os.Readlink(fmt.Sprintf("/proc/%v/exe", now["pid"]))
			if executable == target && now["managed"] == true && now["pid"] != nil && fmt.Sprint(now["pid"]) != "0" {
				if now["pid"] == last {
					stable++
				} else {
					stable = 0
				}
				last = now["pid"]
				if stable >= 5 {
					return nil
				}
			} else {
				stable = 0
				last = nil
			}
		}
		return fmt.Errorf("Xray не прошёл проверку стабильности процесса")
	}
	backup, err := replaceCoreTransaction(target, staged, keepBackup, prepare, activate)
	s.metricsMu.Lock()
	s.coreVersionCache = nil
	s.serviceCache = nil
	s.metricsMu.Unlock()
	if err != nil {
		result := fail(err)
		result["backup"] = backup
		return result
	}
	return map[string]any{"ok": true, "stdout": fmt.Sprintf("Установлен %s из %s; SHA-256 и конфигурация проверены", version, assetName), "backup": backup, "backupEnabled": keepBackup}
}
