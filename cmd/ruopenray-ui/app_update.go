package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

const minRuOpenRayAssetSize = 1024 * 1024

func ruOpenRayAssetName() string {
	switch runtime.GOARCH {
	case "amd64":
		return "ruopenray-ui-linux-amd64"
	case "arm64":
		return "ruopenray-ui-linux-arm64"
	case "arm":
		return "ruopenray-ui-linux-armv7"
	case "mipsle":
		return "ruopenray-ui-linux-mipsle-softfloat"
	case "mips":
		return "ruopenray-ui-linux-mips-softfloat"
	default:
		return "ruopenray-ui-linux-" + runtime.GOARCH
	}
}

func appReleaseAPI(version string) string {
	if version == "" || version == "latest" || version == "<nil>" {
		return "https://api.github.com/repos/" + appRepoFullName + "/releases/latest"
	}
	return "https://api.github.com/repos/" + appRepoFullName + "/releases/tags/" + url.PathEscape(version)
}

func appLatestRelease(channels ...string) (map[string]any, error) {
	req, _ := http.NewRequest(http.MethodGet, "https://api.github.com/repos/"+appRepoFullName+"/releases?per_page=100", nil)
	req.Header.Set("accept", "application/vnd.github+json")
	req.Header.Set("user-agent", "RuOpenRay UI")
	resp, err := (&http.Client{Timeout: 12 * time.Second}).Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusNotFound {
		assetName := ruOpenRayAssetName()
		return map[string]any{"tag": "", "name": "релизов пока нет", "asset": assetName, "assetUrl": "", "assetSize": 0, "current": appVersion, "update": false}, nil
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("GitHub releases HTTP %d", resp.StatusCode)
	}
	var raw []map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return nil, err
	}
	selected := selectAppRelease(raw, appUpdateChannel(channels))
	if selected == nil {
		assetName := ruOpenRayAssetName()
		return map[string]any{"tag": "", "name": "релизов пока нет", "asset": assetName, "assetUrl": "", "assetSize": 0, "current": appVersion, "update": false}, nil
	}
	result := parseAppRelease(selected)
	result["channel"] = appUpdateChannel(channels)
	return result, nil
}

func appRelease(version string, channels ...string) (map[string]any, error) {
	if version == "" || version == "latest" || version == "<nil>" {
		return appLatestRelease(channels...)
	}
	req, _ := http.NewRequest(http.MethodGet, appReleaseAPI(version), nil)
	req.Header.Set("accept", "application/vnd.github+json")
	req.Header.Set("user-agent", "RuOpenRay UI")
	resp, err := (&http.Client{Timeout: 12 * time.Second}).Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("GitHub release HTTP %d", resp.StatusCode)
	}
	var raw map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return nil, err
	}
	return parseAppRelease(raw), nil
}

func appReleaseAssetSize(value any) int {
	switch typed := value.(type) {
	case int:
		return typed
	case int64:
		return int(typed)
	case float64:
		return int(typed)
	case json.Number:
		if n, err := typed.Int64(); err == nil {
			return int(n)
		}
	}
	return number(value, 0)
}

func parseAppRelease(raw map[string]any) map[string]any {
	assetName := ruOpenRayAssetName()
	assetURL := ""
	assetSize := 0
	assetDigest := ""
	for _, item := range asArray(raw["assets"]) {
		asset, ok := item.(map[string]any)
		if !ok || fmt.Sprint(asset["name"]) != assetName {
			continue
		}
		assetURL = strings.TrimSpace(fmt.Sprint(asset["browser_download_url"]))
		assetSize = appReleaseAssetSize(asset["size"])
		assetDigest, _ = asset["digest"].(string)
		if assetSize > 0 && assetSize < minRuOpenRayAssetSize {
			assetSize = 0
		}
		break
	}
	tag := strings.TrimSpace(fmt.Sprint(raw["tag_name"]))
	update, reason := appUpdateDecision(appVersion, tag)
	return map[string]any{
		"tag":         tag,
		"name":        firstNonEmpty(fmt.Sprint(raw["name"]), tag),
		"publishedAt": raw["published_at"],
		"prerelease":  raw["prerelease"],
		"htmlUrl":     raw["html_url"],
		"asset":       assetName,
		"assetUrl":    assetURL,
		"assetSize":   assetSize,
		"assetDigest": assetDigest,
		"current":     appVersion,
		"update":      update,
		"reason":      reason,
	}
}

func replaceExecutableAcrossFilesystems(src string, dst string) error {
	if err := os.Chmod(src, 0o755); err != nil {
		return err
	}
	if err := os.Rename(src, dst); err == nil {
		return nil
	}
	sameDirTmp := filepath.Join(filepath.Dir(dst), "."+filepath.Base(dst)+"-"+time.Now().Format("20060102150405")+".new")
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.OpenFile(sameDirTmp, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o755)
	if err != nil {
		return err
	}
	_, copyErr := io.Copy(out, in)
	closeErr := out.Close()
	if copyErr != nil {
		_ = os.Remove(sameDirTmp)
		return copyErr
	}
	if closeErr != nil {
		_ = os.Remove(sameDirTmp)
		return closeErr
	}
	if err := os.Chmod(sameDirTmp, 0o755); err != nil {
		_ = os.Remove(sameDirTmp)
		return err
	}
	if err := os.Rename(sameDirTmp, dst); err != nil {
		_ = os.Remove(sameDirTmp)
		return err
	}
	_ = os.Remove(src)
	return nil
}

func (s *serverState) updateApp(version string, keepBackup bool, channels ...string) map[string]any {
	release, err := appRelease(version, channels...)
	if err != nil {
		return map[string]any{"ok": false, "stderr": err.Error(), "version": appVersion, "arch": systemArchitecture("github-release")}
	}
	candidate, valid := parseReleaseVersion(fmt.Sprint(release["tag"]))
	if release["update"] != true || !valid || (appUpdateChannel(channels) == "stable" && (release["prerelease"] == true || len(candidate.pre) > 0)) {
		return map[string]any{"ok": false, "stderr": "Обновление отменено: версия не новее текущей либо не принадлежит выбранному каналу", "release": release}
	}
	assetURL := strings.TrimSpace(fmt.Sprint(release["assetUrl"]))
	if assetURL == "" {
		return map[string]any{"ok": false, "stderr": fmt.Sprintf("для %s нет ассета %s", release["tag"], ruOpenRayAssetName()), "release": release}
	}
	expectedSHA, err := appExpectedSHA256(release, downloadAppChecksum)
	if err != nil {
		return map[string]any{"ok": false, "stderr": err.Error(), "release": release}
	}
	exe, err := os.Executable()
	if err != nil {
		return map[string]any{"ok": false, "stderr": err.Error(), "release": release}
	}
	exe, _ = filepath.Abs(exe)
	downloadURL := s.mirrorURL(assetURL)
	resp, err := (&http.Client{Timeout: 70 * time.Second}).Get(downloadURL)
	if err != nil {
		return map[string]any{"ok": false, "stderr": err.Error(), "url": downloadURL, "release": release}
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return map[string]any{"ok": false, "stderr": fmt.Sprintf("download HTTP %d", resp.StatusCode), "url": downloadURL, "release": release}
	}
	out, err := os.CreateTemp(os.TempDir(), "ruopenray-ui-*.new")
	if err != nil {
		return map[string]any{"ok": false, "stderr": err.Error(), "release": release}
	}
	tmp := out.Name()
	hash := sha256.New()
	size, copyErr := io.Copy(io.MultiWriter(out, hash), io.LimitReader(resp.Body, (64<<20)+1))
	if copyErr == nil {
		copyErr = out.Sync()
	}
	closeErr := out.Close()
	if copyErr != nil {
		_ = os.Remove(tmp)
		return map[string]any{"ok": false, "stderr": copyErr.Error(), "release": release}
	}
	if closeErr != nil {
		_ = os.Remove(tmp)
		return map[string]any{"ok": false, "stderr": closeErr.Error(), "release": release}
	}
	if size < minRuOpenRayAssetSize {
		_ = os.Remove(tmp)
		return map[string]any{"ok": false, "stderr": "скачанный бинарник слишком маленький", "size": size, "release": release}
	}
	if size > 64<<20 || hex.EncodeToString(hash.Sum(nil)) != expectedSHA || appReleaseAssetSize(release["assetSize"]) > 0 && size != int64(appReleaseAssetSize(release["assetSize"])) {
		os.Remove(tmp)
		return map[string]any{"ok": false, "stderr": "SHA-256 или размер бинарника не совпадает с официальным релизом"}
	}
	defer os.Remove(tmp)
	if err = os.Chmod(tmp, 0700); err != nil {
		return map[string]any{"ok": false, "stderr": err.Error()}
	}
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	check := exec.CommandContext(ctx, tmp, "--self-check")
	if err = check.Run(); err != nil {
		return map[string]any{"ok": false, "stderr": "Новый бинарник не прошёл автономную проверку запуска"}
	}
	restart, err := s.scheduleAppUpdate(tmp, exe, expectedSHA, keepBackup)
	if err != nil {
		return map[string]any{"ok": false, "stderr": err.Error(), "release": release}
	}
	return map[string]any{
		"ok": true, "version": release["tag"], "previous": appVersion, "release": release,
		"backup": restart["backup"], "backupEnabled": true, "keepBackup": keepBackup, "sha256": expectedSHA, "size": size, "target": exe, "restart": restart,
		"state": "pending", "stdout": fmt.Sprintf("Установлен %s. Независимый watchdog перезапустит панель и проверит готовность; при отказе восстановит прежний бинарник.", release["tag"]),
	}
}
