package main

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
)

// A successful rename is atomic, but its directory entry must also be flushed
// before a later transaction phase may rely on it surviving a power failure.
func syncDirectory(path string) error {
	if runtime.GOOS == "windows" {
		return nil
	}
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	defer f.Close()
	return f.Sync()
}

func renameDurable(from, to string) error {
	if err := os.Rename(from, to); err != nil {
		return err
	}
	if err := syncDirectory(filepath.Dir(to)); err != nil {
		return err
	}
	if filepath.Dir(from) != filepath.Dir(to) {
		return syncDirectory(filepath.Dir(from))
	}
	return nil
}

func removeDurable(path string) error {
	if err := os.Remove(path); err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	return syncDirectory(filepath.Dir(path))
}

type recoveryFile struct {
	Path    string      `json:"path"`
	Backup  string      `json:"backup"`
	Existed bool        `json:"existed"`
	Mode    os.FileMode `json:"mode"`
	SHA256  string      `json:"sha256"`
}

func regularFileSHA(path string) (string, error) {
	info, err := os.Lstat(path)
	if err != nil {
		return "", err
	}
	if !info.Mode().IsRegular() {
		return "", fmt.Errorf("ожидается обычный файл: %s", path)
	}
	return executableSHA(path)
}

func prepareRecoveryFile(path, prefix string) (recoveryFile, error) {
	f := recoveryFile{Path: path}
	info, err := os.Lstat(path)
	if os.IsNotExist(err) {
		return f, nil
	}
	if err != nil {
		return f, err
	}
	if !info.Mode().IsRegular() {
		return f, fmt.Errorf("необычный файл %s", path)
	}
	body, err := os.ReadFile(path)
	if err != nil {
		return f, err
	}
	f.Existed, f.Mode = true, info.Mode().Perm()
	sum := sha256.Sum256(body)
	f.SHA256 = hex.EncodeToString(sum[:])
	backup, err := os.CreateTemp(filepath.Dir(path), prefix)
	if err != nil {
		return f, err
	}
	f.Backup = backup.Name()
	backup.Close()
	if err = writeFileAtomic(f.Backup, body, f.Mode); err != nil {
		os.Remove(f.Backup)
		return f, err
	}
	return f, nil
}

// Restoring may itself be interrupted after consuming a same-filesystem backup.
// The original hash makes a second recovery pass safe and idempotent.
func checkRecoveryFile(f recoveryFile) error {
	if !f.Existed {
		if info, err := os.Lstat(f.Path); err == nil && !info.Mode().IsRegular() {
			return fmt.Errorf("необычный целевой файл %s", f.Path)
		} else if err != nil && !os.IsNotExist(err) {
			return err
		}
		return nil
	}
	actual, err := regularFileSHA(f.Backup)
	if os.IsNotExist(err) {
		actual, err = regularFileSHA(f.Path)
		if err == nil && actual == f.SHA256 {
			return nil
		}
		return fmt.Errorf("нет резервной копии и исходного файла %s", f.Path)
	}
	if err != nil {
		return err
	}
	if actual != f.SHA256 {
		return fmt.Errorf("SHA-256 резервной копии не совпадает: %s", f.Path)
	}
	if info, err := os.Lstat(f.Path); err == nil && !info.Mode().IsRegular() {
		return fmt.Errorf("необычный целевой файл %s", f.Path)
	} else if err != nil && !os.IsNotExist(err) {
		return err
	}
	return nil
}

func restoreRecoveryFile(f recoveryFile) error {
	if err := checkRecoveryFile(f); err != nil {
		return err
	}
	if !f.Existed {
		return removeDurable(f.Path)
	}
	if _, err := os.Lstat(f.Backup); os.IsNotExist(err) {
		return nil // A prior recovery pass already restored and verified the target.
	}
	if err := os.Chmod(f.Backup, f.Mode.Perm()); err != nil {
		return err
	}
	return renameDurable(f.Backup, f.Path)
}

// Move a completed journal outside the pending namespace before unlinking its
// marker or backup files. Interrupted cleanup can then never look uncommitted.
func retireRecoveryDirectory(dir string) (string, error) {
	retired := filepath.Join(filepath.Dir(dir), ".finished"+filepath.Base(dir))
	if err := renameDurable(dir, retired); err != nil {
		return "", err
	}
	return retired, nil
}
