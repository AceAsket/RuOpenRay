package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

type transactionRecovery struct {
	Version  int            `json:"version"`
	Kind     string         `json:"kind"`
	Files    []recoveryFile `json:"files"`
	Table    string         `json:"table,omitempty"`
	HadTable bool           `json:"hadTable,omitempty"`
	Rules    string         `json:"rules,omitempty"`
	Routes   string         `json:"routes,omitempty"`
	GeoDir   string         `json:"geoDir,omitempty"`
	Restart  bool           `json:"restart,omitempty"`
}

func saveTransactionRecovery(dir string, record transactionRecovery) error {
	b, err := json.Marshal(record)
	if err != nil {
		return err
	}
	if err = writeFileAtomic(filepath.Join(dir, "recovery.json"), b, 0600); err != nil {
		return err
	}
	return syncDirectory(filepath.Dir(dir))
}

func commitTransactionRecovery(dir string) error {
	return writeFileAtomic(filepath.Join(dir, "committed"), []byte("committed\n"), 0600)
}

func firewallRecoveryPaths() []string {
	return []string{ruOpenRayFirewallNftPath, ruOpenRayFirewallLegacyNftPath, ruOpenRayFirewallHotplugPath, ruOpenRayFirewallEventPath, ruOpenRayKillSwitchDNSPath, "/etc/config/dhcp"}
}

func validateRecoveryFiles(files []recoveryFile, allowed map[string]bool, prefix string) error {
	seen := map[string]bool{}
	for _, f := range files {
		if !allowed[f.Path] || seen[f.Path] || !filepath.IsAbs(f.Path) || filepath.Clean(f.Path) != f.Path {
			return fmt.Errorf("неразрешённый путь восстановления %s", f.Path)
		}
		seen[f.Path] = true
		if !f.Existed && (f.Backup != "" || f.SHA256 != "") {
			return fmt.Errorf("неверный снимок отсутствующего файла")
		}
		if f.Existed && (filepath.Dir(f.Backup) != filepath.Dir(f.Path) || !strings.HasPrefix(filepath.Base(f.Backup), prefix) || len(f.SHA256) != 64) {
			return fmt.Errorf("неверная резервная копия %s", f.Path)
		}
	}
	return nil
}

func (s *serverState) recoverPendingTransactions() error {
	return s.recoverPendingTransactionsWith(runTimeout, firewallRecoveryPaths())
}

func (s *serverState) recoverPendingTransactionsWith(run func(time.Duration, string, ...string) map[string]any, firewallPaths []string) error {
	entries, err := os.ReadDir(s.cfg.DataDir)
	if os.IsNotExist(err) {
		return nil
	}
	if err != nil {
		return err
	}
	for _, entry := range entries {
		if !strings.HasPrefix(entry.Name(), ".firewall-transaction-") && !strings.HasPrefix(entry.Name(), ".geo-transaction-") {
			continue
		}
		if !entry.IsDir() || entry.Type()&os.ModeSymlink != 0 {
			return fmt.Errorf("необычный каталог восстановления")
		}
		dir := filepath.Join(s.cfg.DataDir, entry.Name())
		b, err := os.ReadFile(filepath.Join(dir, "recovery.json"))
		// An allocation interrupted before its journal never changed live state.
		if os.IsNotExist(err) {
			continue
		}
		if err != nil {
			return err
		}
		if info, err := os.Lstat(filepath.Join(dir, "recovery.json")); err != nil || !info.Mode().IsRegular() {
			return fmt.Errorf("необычный файл журнала")
		}
		var r transactionRecovery
		if len(b) > 4<<20 || json.Unmarshal(b, &r) != nil || r.Version != 1 {
			return fmt.Errorf("неверный журнал восстановления %s", dir)
		}
		allowed, prefix := map[string]bool{}, ".firewall-rollback-"
		switch r.Kind {
		case "firewall":
			if !strings.HasPrefix(entry.Name(), ".firewall-transaction-") {
				return fmt.Errorf("тип журнала не совпадает")
			}
			for _, path := range firewallPaths {
				allowed[path] = true
			}
			if len(r.Files) != len(firewallPaths) || validateFirewallTable(r.Table) != nil || firewallPolicyOwned(r.Rules, r.Routes) != nil {
				return fmt.Errorf("неверный снимок firewall")
			}
		case "geo":
			if !strings.HasPrefix(entry.Name(), ".geo-transaction-") || r.GeoDir != s.cfg.GeoDir {
				return fmt.Errorf("каталог geo изменился; требуется ручное восстановление")
			}
			prefix = ".ruopenray-geo-rollback-"
			if len(r.Files) == 0 || len(r.Files) > 512 {
				return fmt.Errorf("неверный список geo-файлов")
			}
			for _, f := range r.Files {
				if filepath.Dir(f.Path) != s.cfg.GeoDir || !strings.HasSuffix(filepath.Base(f.Path), ".dat") || strings.HasPrefix(filepath.Base(f.Path), ".") {
					return fmt.Errorf("неверный geo-файл")
				}
				allowed[f.Path] = true
			}
		default:
			return fmt.Errorf("неизвестный тип восстановления")
		}
		if err := validateRecoveryFiles(r.Files, allowed, prefix); err != nil {
			return err
		}
		committed, err := os.ReadFile(filepath.Join(dir, "committed"))
		if err != nil && !os.IsNotExist(err) {
			return err
		}
		if err == nil {
			info, statErr := os.Lstat(filepath.Join(dir, "committed"))
			if statErr != nil || !info.Mode().IsRegular() || string(committed) != "committed\n" {
				return fmt.Errorf("повреждён маркер завершения транзакции")
			}
		}
		if string(committed) != "committed\n" {
			// Reject a damaged later snapshot before restoring any earlier file.
			for _, f := range r.Files {
				if err := checkRecoveryFile(f); err != nil {
					return err
				}
			}
			if r.Kind == "firewall" {
				t := &firewallTransaction{dir: dir, table: r.Table, hadTable: r.HadTable, rules: r.Rules, routes: r.Routes, run: run}
				for _, f := range r.Files {
					t.files = append(t.files, firewallFile{path: f.Path, backup: f.Backup, exists: f.Existed, mode: f.Mode, sha256: f.SHA256})
				}
				if result := t.rollback(); result["ok"] != true {
					return fmt.Errorf("восстановление firewall: %v", result["errors"])
				}
			} else {
				for _, f := range r.Files {
					if err := restoreRecoveryFile(f); err != nil {
						return err
					}
				}
				if r.Restart {
					name := s.cfg.ServiceName
					if name == "" {
						name = "xray"
					}
					if result := run(30*time.Second, "/etc/init.d/"+name, "restart"); result["ok"] != true {
						return fmt.Errorf("Xray после восстановления geo: %v", result["stderr"])
					}
				}
			}
			if err := commitTransactionRecovery(dir); err != nil {
				return err
			}
		}
		retired, err := retireRecoveryDirectory(dir)
		if err != nil {
			return err
		}
		for _, f := range r.Files {
			if f.Backup != "" {
				if err := removeDurable(f.Backup); err != nil {
					return err
				}
			}
		}
		if err := os.RemoveAll(retired); err != nil {
			return err
		}
		if err := syncDirectory(s.cfg.DataDir); err != nil {
			return err
		}
	}
	return nil
}
