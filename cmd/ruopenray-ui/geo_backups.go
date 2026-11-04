package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"

	"github.com/AceAsket/RuOpenRay/internal/geodata"
)

var geoTransactionMu sync.Mutex
var geoBackupDirPattern = regexp.MustCompile(`^geo-transaction-[0-9]+$`)

const geoBackupManifestName = ".ruopenray-geo-backup.json"

type geoBackupFile struct {
	Name   string `json:"name"`
	SHA256 string `json:"sha256"`
}

type geoBackupManifest struct {
	Version int             `json:"version"`
	Kind    string          `json:"kind"`
	State   string          `json:"state"`
	Files   []geoBackupFile `json:"files"`
}

// This ownership marker is written only after the live transaction commits.
// Unmarked or damaged snapshots remain available for manual recovery.
func completeGeoBackup(dir string) error {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return err
	}
	manifest := geoBackupManifest{Version: 1, Kind: "ruopenray-geo-backup", State: "complete"}
	for _, entry := range entries {
		if entry.Type()&os.ModeSymlink != 0 || entry.IsDir() || geodata.CleanFileName(entry.Name()) != entry.Name() {
			return fmt.Errorf("необычный файл geo-бэкапа")
		}
		sha, err := regularFileSHA(filepath.Join(dir, entry.Name()))
		if err != nil {
			return err
		}
		manifest.Files = append(manifest.Files, geoBackupFile{Name: entry.Name(), SHA256: sha})
	}
	body, _ := json.Marshal(manifest)
	return writeFileAtomic(filepath.Join(dir, geoBackupManifestName), body, 0600)
}

func (s *serverState) hasPendingGeoJournal() (bool, error) {
	entries, err := os.ReadDir(s.cfg.DataDir)
	if os.IsNotExist(err) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	for _, entry := range entries {
		if !strings.HasPrefix(entry.Name(), ".geo-transaction-") {
			continue
		}
		dir := filepath.Join(s.cfg.DataDir, entry.Name())
		if entry.Type()&os.ModeSymlink != 0 || !entry.IsDir() {
			return true, nil
		}
		if _, err := os.Lstat(filepath.Join(dir, "recovery.json")); os.IsNotExist(err) {
			continue // An interrupted allocation did not modify live state.
		}
		info, err := os.Lstat(filepath.Join(dir, "committed"))
		if err != nil || !info.Mode().IsRegular() {
			return true, nil
		}
		body, err := os.ReadFile(filepath.Join(dir, "committed"))
		if err != nil || string(body) != "committed\n" {
			return true, nil
		}
	}
	return false, nil
}

func removeCompletedGeoBackup(root, dir string) (int64, error) {
	root, err := filepath.Abs(root)
	if err != nil {
		return 0, err
	}
	dir, err = filepath.Abs(dir)
	if err != nil || filepath.Dir(dir) != root || !geoBackupDirPattern.MatchString(filepath.Base(dir)) {
		return 0, fmt.Errorf("неразрешённый каталог geo-бэкапа")
	}
	info, err := os.Lstat(dir)
	if err != nil || !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
		return 0, fmt.Errorf("необычный каталог geo-бэкапа")
	}
	marker := filepath.Join(dir, geoBackupManifestName)
	info, err = os.Lstat(marker)
	if err != nil || !info.Mode().IsRegular() || info.Size() > 128<<10 {
		return 0, fmt.Errorf("нет подтверждения завершённого geo-бэкапа")
	}
	body, err := os.ReadFile(marker)
	if err != nil {
		return 0, err
	}
	var manifest geoBackupManifest
	if json.Unmarshal(body, &manifest) != nil || manifest.Version != 1 || manifest.Kind != "ruopenray-geo-backup" || manifest.State != "complete" || len(manifest.Files) > 512 {
		return 0, fmt.Errorf("повреждён маркер geo-бэкапа")
	}
	allowed := map[string]bool{geoBackupManifestName: true}
	var freed int64
	for _, file := range manifest.Files {
		if allowed[file.Name] || geodata.CleanFileName(file.Name) != file.Name || !strings.HasSuffix(file.Name, ".dat") {
			return 0, fmt.Errorf("неразрешённый файл geo-бэкапа")
		}
		allowed[file.Name] = true
		path := filepath.Join(dir, file.Name)
		sha, err := regularFileSHA(path)
		if err != nil || sha != file.SHA256 {
			return 0, fmt.Errorf("файл geo-бэкапа изменён")
		}
	}
	entries, err := os.ReadDir(dir)
	if err != nil || len(entries) != len(allowed) {
		return 0, fmt.Errorf("содержимое geo-бэкапа изменено")
	}
	for _, entry := range entries {
		info, err := entry.Info()
		if err != nil || !allowed[entry.Name()] || !info.Mode().IsRegular() || entry.Type()&os.ModeSymlink != 0 {
			return 0, fmt.Errorf("необычное содержимое geo-бэкапа")
		}
		freed += info.Size()
	}
	// Remove only validated immediate children; never recurse through directories.
	for _, entry := range entries {
		if err := os.Remove(filepath.Join(dir, entry.Name())); err != nil {
			return 0, err
		}
	}
	if err := removeDurable(dir); err != nil {
		return 0, err
	}
	return freed, nil
}
