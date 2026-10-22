package main

import (
	"archive/zip"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"time"
)

const fullBackupLimit int64 = 128 << 20

type backupEntry struct {
	Name   string `json:"name"`
	Size   int64  `json:"size"`
	SHA256 string `json:"sha256"`
	Mode   uint32 `json:"mode"`
}

type backupManifest struct {
	Format    int           `json:"format"`
	Version   string        `json:"version"`
	CreatedAt string        `json:"createdAt"`
	Entries   []backupEntry `json:"entries"`
}

func (s *serverState) backupSystemPaths() map[string]string {
	if s.backupPaths != nil {
		return s.backupPaths
	}
	paths := map[string]string{"xray/config.json": s.cfg.ActiveConfig,
		"uci/ruopenray-ui": "/etc/config/ruopenray-ui", "uci/dhcp": "/etc/config/dhcp",
		"uci/xray":    "/etc/config/xray",
		"uci/network": "/etc/config/network", "uci/firewall": "/etc/config/firewall",
		"service/ruopenray-ui.init": "/etc/init.d/ruopenray-ui",
		"service/xray.init":         "/etc/init.d/xray",
		"service/adguard.init":      "/etc/init.d/ruopenray-adguard"}
	if path := adGuardHomeConfigPath(); path != "" {
		paths["adguard/AdGuardHome.yaml"] = path
	}
	return paths
}

func (s *serverState) adGuardBackupFilterDir() string {
	config := s.backupSystemPaths()["adguard/AdGuardHome.yaml"]
	if config == "" {
		return ""
	}
	if s.backupPaths != nil {
		return filepath.Join(filepath.Dir(config), "data", "filters")
	}
	fields := strings.Fields(adGuardHomeProcessText())
	for i, field := range fields {
		if (field == "-w" || field == "--work-dir") && i+1 < len(fields) && filepath.IsAbs(fields[i+1]) {
			return filepath.Join(fields[i+1], "data", "filters")
		}
	}
	for _, directory := range []string{filepath.Dir(config), "/opt/ruopenray-adguard", "/opt/AdGuardHome"} {
		path := filepath.Join(directory, "data", "filters")
		if info, err := os.Stat(path); err == nil && info.IsDir() {
			return path
		}
	}
	return filepath.Join(filepath.Dir(config), "data", "filters")
}

func backupRelative(root, path string) (string, bool) {
	rel, err := filepath.Rel(root, path)
	return rel, err == nil && rel != ".." && !strings.HasPrefix(rel, ".."+string(os.PathSeparator)) && !filepath.IsAbs(rel)
}

func (s *serverState) backupSources() (map[string]string, error) {
	files := map[string]string{}
	for name, path := range s.backupSystemPaths() {
		if _, err := os.Lstat(path); err == nil {
			files[name] = path
		} else if !os.IsNotExist(err) {
			return nil, err
		}
	}
	if _, ok := files["xray/config.json"]; !ok {
		return nil, errors.New("Активная конфигурация Xray недоступна")
	}
	if _, err := os.Stat(s.cfg.DataDir); err == nil {
		err = filepath.WalkDir(s.cfg.DataDir, func(path string, entry fs.DirEntry, walkErr error) error {
			if walkErr != nil {
				return walkErr
			}
			abs, _ := filepath.Abs(path)
			backup, _ := filepath.Abs(s.cfg.BackupDir)
			rel, _ := filepath.Rel(s.cfg.DataDir, path)
			first := strings.Split(filepath.ToSlash(rel), "/")[0]
			if entry.IsDir() {
				if abs == backup || first == "backups" || strings.HasPrefix(first, "backup-") || first == "logs" || first == "checks" {
					return filepath.SkipDir
				}
				return nil
			}
			if entry.Type()&os.ModeSymlink != 0 {
				return fmt.Errorf("Резервная копия не включает символические ссылки: %s", rel)
			}
			for _, known := range files {
				knownAbs, _ := filepath.Abs(known)
				if knownAbs == abs {
					return nil
				}
			}
			files["data/"+filepath.ToSlash(rel)] = path
			return nil
		})
		if err != nil {
			return nil, err
		}
	} else if !os.IsNotExist(err) {
		return nil, err
	}
	if cache := s.adGuardBackupFilterDir(); cache != "" {
		entries, err := os.ReadDir(cache)
		if err != nil && !os.IsNotExist(err) {
			return nil, err
		}
		for _, entry := range entries {
			if !entry.IsDir() && strings.HasSuffix(entry.Name(), ".txt") {
				files["adguard/filters/"+entry.Name()] = filepath.Join(cache, entry.Name())
			}
		}
	}
	return files, nil
}

func (s *serverState) backupBundle() (string, error) {
	s.backupMu.Lock()
	defer s.backupMu.Unlock()
	return s.createBackupBundle()
}

func (s *serverState) createBackupBundle() (target string, err error) {
	files, err := s.backupSources()
	if err != nil {
		return "", err
	}
	if err = os.MkdirAll(s.cfg.BackupDir, 0700); err != nil {
		return "", err
	}
	if err = os.Chmod(s.cfg.BackupDir, 0700); err != nil {
		return "", err
	}
	file, err := os.CreateTemp(s.cfg.BackupDir, ".full-*.partial")
	if err != nil {
		return "", err
	}
	temp := file.Name()
	defer func() { _ = file.Close(); _ = os.Remove(temp) }()
	if err = file.Chmod(0600); err != nil {
		return "", err
	}
	zw := zip.NewWriter(file)
	manifest := backupManifest{Format: 1, Version: appVersion, CreatedAt: time.Now().UTC().Format(time.RFC3339), Entries: []backupEntry{}}
	names := make([]string, 0, len(files))
	for name := range files {
		names = append(names, name)
	}
	sort.Strings(names)
	if len(names) > 2048 {
		return "", errors.New("Слишком много файлов для полной копии")
	}
	var total int64
	for _, name := range names {
		path := files[name]
		info, statErr := os.Lstat(path)
		if statErr != nil {
			return "", statErr
		}
		if !info.Mode().IsRegular() {
			return "", fmt.Errorf("Необычный тип файла: %s", name)
		}
		src, openErr := os.Open(path)
		if openErr != nil {
			return "", openErr
		}
		header := &zip.FileHeader{Name: name, Method: zip.Deflate}
		header.SetMode(0600 | info.Mode().Perm()&0100)
		writer, createErr := zw.CreateHeader(header)
		if createErr != nil {
			_ = src.Close()
			return "", createErr
		}
		hash := sha256.New()
		n, copyErr := io.Copy(io.MultiWriter(writer, hash), io.LimitReader(src, fullBackupLimit-total+1))
		closeErr := src.Close()
		total += n
		if copyErr != nil {
			return "", copyErr
		}
		if closeErr != nil {
			return "", closeErr
		}
		if total > fullBackupLimit {
			return "", errors.New("Полная копия превышает 128 МиБ; удалите ненужные данные")
		}
		manifest.Entries = append(manifest.Entries, backupEntry{Name: name, Size: n, SHA256: hex.EncodeToString(hash.Sum(nil)), Mode: uint32(header.Mode().Perm())})
	}
	writer, err := zw.Create("manifest.json")
	if err != nil {
		return "", err
	}
	if err = json.NewEncoder(writer).Encode(manifest); err != nil {
		return "", err
	}
	if err = zw.Close(); err != nil {
		return "", err
	}
	if err = file.Sync(); err != nil {
		return "", err
	}
	if err = file.Close(); err != nil {
		return "", err
	}
	target = filepath.Join(s.cfg.BackupDir, "ruopenray-full-"+time.Now().UTC().Format("20060102-150405.000000000")+".zip")
	if err = os.Rename(temp, target); err != nil {
		return "", err
	}
	return target, nil
}

func (s *serverState) backupDestination(name string) (string, error) {
	if name == "" || strings.Contains(name, "\\") || strings.Contains(name, ":") || strings.HasPrefix(name, "/") || strings.Contains(name, "//") {
		return "", errors.New("Некорректный путь в архиве")
	}
	for _, part := range strings.Split(name, "/") {
		if part == "." || part == ".." || part == "" {
			return "", errors.New("Некорректный путь в архиве")
		}
	}
	if path, ok := s.backupSystemPaths()[name]; ok {
		return path, nil
	}
	if strings.HasPrefix(name, "data/") {
		path := filepath.Join(s.cfg.DataDir, filepath.FromSlash(strings.TrimPrefix(name, "data/")))
		backup, _ := filepath.Abs(s.cfg.BackupDir)
		abs, _ := filepath.Abs(path)
		if _, inside := backupRelative(backup, abs); inside {
			return "", errors.New("Архив не может изменять каталог резервных копий")
		}
		return path, nil
	}
	if strings.HasPrefix(name, "adguard/filters/") && len(strings.Split(name, "/")) == 3 && strings.HasSuffix(name, ".txt") {
		if directory := s.adGuardBackupFilterDir(); directory != "" {
			return filepath.Join(directory, filepath.Base(name)), nil
		}
	}
	return "", fmt.Errorf("Неподдерживаемый файл в архиве: %s", name)
}

type backupContent struct {
	entry  backupEntry
	path   string
	body   []byte
	remove bool
}

func (s *serverState) fullBackupArchivePath(path string) (string, error) {
	root, err := filepath.EvalSymlinks(s.cfg.BackupDir)
	if err != nil {
		return "", err
	}
	resolved, err := filepath.EvalSymlinks(path)
	if err != nil {
		return "", err
	}
	root, _ = filepath.Abs(root)
	resolved, _ = filepath.Abs(resolved)
	if _, inside := backupRelative(root, resolved); !inside || filepath.Ext(resolved) != ".zip" {
		return "", errors.New("Выберите ZIP из каталога резервных копий панели")
	}
	if info, err := os.Stat(resolved); err != nil || !info.Mode().IsRegular() {
		return "", errors.New("Архив недоступен или не является обычным файлом")
	}
	return resolved, nil
}

func (s *serverState) downloadFullBackup(w http.ResponseWriter, r *http.Request) {
	path, err := s.fullBackupArchivePath(r.URL.Query().Get("path"))
	if err != nil {
		writeJSON(w, 400, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Content-Disposition", mime.FormatMediaType("attachment", map[string]string{"filename": filepath.Base(path)}))
	w.Header().Set("Cache-Control", "no-store")
	http.ServeFile(w, r, path)
}

func (s *serverState) readFullBackup(path string) ([]backupContent, backupManifest, error) {
	var manifest backupManifest
	resolved, err := s.fullBackupArchivePath(path)
	if err != nil {
		return nil, manifest, err
	}
	zr, err := zip.OpenReader(resolved)
	if err != nil {
		return nil, manifest, err
	}
	defer zr.Close()
	files := map[string]*zip.File{}
	if len(zr.File) > 2049 {
		return nil, manifest, errors.New("Слишком много файлов в архиве")
	}
	for _, file := range zr.File {
		if _, duplicate := files[file.Name]; duplicate || !file.Mode().IsRegular() {
			return nil, manifest, errors.New("Повторяющийся или необычный файл в архиве")
		}
		files[file.Name] = file
	}
	meta := files["manifest.json"]
	if meta == nil {
		return nil, manifest, errors.New("Архив старого формата: нет манифеста; автоматическое полное восстановление недоступно")
	}
	rc, err := meta.Open()
	if err != nil {
		return nil, manifest, err
	}
	err = json.NewDecoder(io.LimitReader(rc, 1<<20)).Decode(&manifest)
	_ = rc.Close()
	if err != nil || manifest.Format != 1 || len(manifest.Entries)+1 != len(files) {
		return nil, manifest, errors.New("Некорректный манифест резервной копии")
	}
	result := []backupContent{}
	var total int64
	seen := map[string]bool{}
	destinations := map[string]bool{}
	for _, entry := range manifest.Entries {
		file := files[entry.Name]
		if file == nil || seen[entry.Name] || entry.Name == "manifest.json" || entry.Size < 0 || entry.Size > fullBackupLimit-total {
			return nil, manifest, errors.New("Некорректный состав или размер архива")
		}
		seen[entry.Name] = true
		path, pathErr := s.backupDestination(entry.Name)
		if pathErr != nil {
			return nil, manifest, pathErr
		}
		abs, _ := filepath.Abs(path)
		if destinations[abs] {
			return nil, manifest, errors.New("Разные файлы архива указывают на одно назначение")
		}
		destinations[abs] = true
		rc, err := file.Open()
		if err != nil {
			return nil, manifest, err
		}
		body, err := io.ReadAll(io.LimitReader(rc, entry.Size+1))
		_ = rc.Close()
		if err != nil {
			return nil, manifest, err
		}
		hash := sha256.Sum256(body)
		if int64(len(body)) != entry.Size || hex.EncodeToString(hash[:]) != entry.SHA256 {
			return nil, manifest, fmt.Errorf("Нарушена целостность файла: %s", entry.Name)
		}
		total += entry.Size
		result = append(result, backupContent{entry: entry, path: path, body: body})
	}
	if !seen["xray/config.json"] {
		return nil, manifest, errors.New("В архиве нет конфигурации Xray")
	}
	return result, manifest, nil
}

func (s *serverState) fullBackupAction(payload map[string]any, restore bool) map[string]any {
	s.backupMu.Lock()
	defer s.backupMu.Unlock()
	path, _ := payload["path"].(string)
	content, manifest, err := s.readFullBackup(path)
	fail := func(err error) map[string]any { return map[string]any{"ok": false, "error": err.Error()} }
	if err != nil {
		return fail(err)
	}
	files := []string{}
	for _, file := range content {
		files = append(files, file.entry.Name)
		if file.entry.Name == "adguard/AdGuardHome.yaml" {
			if err := validateBackupAdGuard(file.body); err != nil {
				return fail(err)
			}
		}
		if file.entry.Name == "xray/config.json" {
			var cfg map[string]any
			if json.Unmarshal(file.body, &cfg) != nil || cfg == nil {
				return fail(errors.New("Некорректный JSON Xray в архиве"))
			}
			if test := s.validateConfig(cfg); test["ok"] != true {
				return fail(errors.New("Конфигурация из архива не принимается установленным Xray"))
			}
		}
	}
	result := map[string]any{"ok": true, "format": manifest.Format, "createdAt": manifest.CreatedAt, "version": manifest.Version, "files": files, "restored": false}
	if !restore {
		return result
	}
	if payload["offline"] != true {
		return fail(errors.New("Для полного восстановления остановите Xray и AdGuard Home и укажите offline: true"))
	}
	if runtime.GOOS != "windows" {
		for _, process := range []string{"xray", "AdGuardHome"} {
			if runTimeout(3*time.Second, "pidof", process)["ok"] == true {
				return fail(fmt.Errorf("Перед восстановлением остановите %s", process))
			}
		}
	}
	rollback, err := s.createBackupBundle()
	if err != nil {
		return fail(err)
	}
	// Remove persistent panel files introduced after the snapshot; otherwise a
	// restored profile or group can still be affected by a newer metadata file.
	current, err := s.backupSources()
	if err != nil {
		return fail(err)
	}
	keep := map[string]bool{}
	for _, file := range content {
		keep[file.entry.Name] = true
	}
	for name, path := range current {
		if !keep[name] && (strings.HasPrefix(name, "data/") || strings.HasPrefix(name, "adguard/filters/")) {
			content = append(content, backupContent{path: path, remove: true})
		}
	}
	if err := applyBackupContent(content); err != nil {
		return map[string]any{"ok": false, "error": err.Error(), "rollbackBackup": rollback}
	}
	result["restored"], result["rollbackBackup"] = true, rollback
	result["message"] = "Файлы восстановлены. Запустите AdGuard Home и Xray; для применения UCI перезагрузите роутер в окно обслуживания."
	return result
}

// All archive paths have been mapped to owned files before this transaction.
// A write failure restores every already modified file, reporting rollback errors.
func applyBackupContent(content []backupContent) error {
	return applyBackupContentWithWriter(content, writeFileAtomic)
}

func validateBackupAdGuard(body []byte) error {
	binary := ""
	for _, path := range []string{"/opt/ruopenray-adguard/AdGuardHome", "/usr/bin/AdGuardHome", "/opt/AdGuardHome/AdGuardHome"} {
		if info, err := os.Stat(path); err == nil && info.Mode().IsRegular() {
			binary = path
			break
		}
	}
	if binary == "" {
		return errors.New("Для проверки конфигурации архива установите AdGuard Home")
	}
	dir, err := os.MkdirTemp("", "ruopenray-restore-adguard-")
	if err != nil {
		return err
	}
	defer os.RemoveAll(dir)
	path := filepath.Join(dir, "AdGuardHome.yaml")
	if err := os.WriteFile(path, body, 0600); err != nil {
		return err
	}
	if runTimeout(15*time.Second, binary, "--check-config", "-c", path, "-w", dir)["ok"] != true {
		return errors.New("Конфигурация AdGuard из архива не прошла проверку")
	}
	return nil
}

func applyBackupContentWithWriter(content []backupContent, write func(string, []byte, fs.FileMode) error) error {
	previous := map[string][]byte{}
	modes := map[string]fs.FileMode{}
	for _, file := range content {
		for path := file.path; ; path = filepath.Dir(path) {
			if info, err := os.Lstat(path); err == nil && info.Mode()&os.ModeSymlink != 0 {
				return errors.New("Восстановление через символическую ссылку запрещено")
			} else if err != nil && !os.IsNotExist(err) {
				return err
			}
			if filepath.Dir(path) == path {
				break
			}
		}
		body, err := os.ReadFile(file.path)
		if err != nil && !os.IsNotExist(err) {
			return err
		}
		previous[file.path] = body
		if info, err := os.Stat(file.path); err == nil {
			modes[file.path] = info.Mode().Perm()
		}
	}
	applied := []string{}
	rollback := func(cause error) error {
		errors := []string{}
		for i := len(applied) - 1; i >= 0; i-- {
			path := applied[i]
			var err error
			if previous[path] == nil {
				err = os.Remove(path)
			} else {
				err = write(path, previous[path], modes[path])
			}
			if err != nil {
				errors = append(errors, path)
			}
		}
		if len(errors) > 0 {
			return fmt.Errorf("%w; не удалось откатить: %s", cause, strings.Join(errors, ", "))
		}
		return cause
	}
	for _, file := range content {
		if file.remove {
			if err := os.Remove(file.path); err != nil {
				return rollback(err)
			}
			applied = append(applied, file.path)
			continue
		}
		if err := os.MkdirAll(filepath.Dir(file.path), 0700); err != nil {
			return rollback(err)
		}
		if err := write(file.path, file.body, 0600|fs.FileMode(file.entry.Mode)&0100); err != nil {
			return rollback(err)
		}
		applied = append(applied, file.path)
	}
	return nil
}
