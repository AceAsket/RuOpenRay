package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// Only our table is replaced. nft checks and commits the delete + create as a
// single netlink transaction; a failed load leaves the old table installed.
func firewallBatch(body string, exists bool) string {
	if exists {
		return "delete table inet ruopenray\n" + body
	}
	return body
}

func validateFirewallTable(body string) error {
	if strings.TrimSpace(body) == "" {
		return nil
	}
	// Remove comments and quoted strings before checking the outer table. Nested
	// chains/sets are allowed; includes and commands outside our table are not.
	var text strings.Builder
	quoted, escaped, comment := false, false, false
	for _, c := range body {
		if comment {
			if c == '\n' {
				comment = false
				text.WriteRune(c)
			}
			continue
		}
		if quoted {
			if escaped {
				escaped = false
			} else if c == '\\' {
				escaped = true
			} else if c == '"' {
				quoted = false
			}
			continue
		}
		if c == '#' {
			comment = true
			continue
		}
		if c == '"' {
			quoted = true
			continue
		}
		text.WriteRune(c)
	}
	s := strings.TrimSpace(text.String())
	if !strings.HasPrefix(s, "table inet ruopenray") {
		return fmt.Errorf("ожидается только table inet ruopenray")
	}
	s = strings.TrimSpace(strings.TrimPrefix(s, "table inet ruopenray"))
	if !strings.HasPrefix(s, "{") {
		return fmt.Errorf("неверное начало таблицы firewall")
	}
	depth := 0
	for i, c := range s {
		if c == '{' {
			depth++
		}
		if c == '}' {
			depth--
			if depth == 0 && strings.TrimSpace(s[i+1:]) != "" {
				return fmt.Errorf("команды вне таблицы ruopenray запрещены")
			}
		}
		if depth < 0 {
			return fmt.Errorf("неверные скобки firewall")
		}
	}
	if depth != 0 || quoted {
		return fmt.Errorf("незавершённая таблица firewall")
	}
	return nil
}

type firewallFile struct {
	path, backup string
	exists       bool
	mode         os.FileMode
	sha256       string
}

type firewallTransaction struct {
	dir      string
	files    []firewallFile
	table    string
	hadTable bool
	rules    string
	routes   string
	steps    []map[string]any
	run      func(time.Duration, string, ...string) map[string]any
}

func (t *firewallTransaction) cleanup() {
	retired, err := retireRecoveryDirectory(t.dir)
	if err != nil {
		return
	}
	for _, f := range t.files {
		if f.backup != "" {
			os.Remove(f.backup)
		}
	}
	os.RemoveAll(retired)
	syncDirectory(filepath.Dir(t.dir))
}

func (t *firewallTransaction) command(name string, args ...string) (string, error) {
	r := t.run(15*time.Second, name, args...)
	t.steps = append(t.steps, r)
	if r["ok"] != true {
		return "", fmt.Errorf("%s %s: %v", name, strings.Join(args, " "), r["stderr"])
	}
	out, _ := r["stdout"].(string)
	return out, nil
}

func (t *firewallTransaction) load(body string, exists, check bool) error {
	path := filepath.Join(t.dir, "batch.nft")
	if err := writeFileAtomic(path, []byte(firewallBatch(body, exists)), 0600); err != nil {
		return err
	}
	args := []string{"-f", path}
	if check {
		args = append([]string{"--check"}, args...)
	}
	_, err := t.command("nft", args...)
	return err
}

func firewallPolicyOwned(rules, routes string) error {
	for _, line := range strings.Split(strings.TrimSpace(routes), "\n") {
		clean := strings.TrimSpace(line)
		for _, suffix := range []string{" proto kernel", " proto boot", " proto static", " scope host"} {
			clean = strings.ReplaceAll(clean, suffix, "")
		}
		if line != "" && clean != "local default dev lo" && clean != "local 0.0.0.0/0 dev lo" {
			return fmt.Errorf("таблица маршрутизации 100 занята другим маршрутом")
		}
	}
	for _, line := range strings.Split(rules, "\n") {
		if (strings.Contains(line, "lookup 100 ") || strings.HasSuffix(line, "lookup 100")) && !ownedFirewallRule(line) {
			return fmt.Errorf("таблица маршрутизации 100 используется чужим ip rule")
		}
		if (strings.Contains(line, "fwmark 0x1/0x1 ") || strings.Contains(line, "fwmark 0x1 ")) && !ownedFirewallRule(line) {
			return fmt.Errorf("метка TPROXY 1 используется другим правилом")
		}
	}
	return nil
}

func firewallTableRoutes(all string) string {
	var out string
	for _, line := range strings.Split(all, "\n") {
		if strings.Contains(line, " table 100 ") || strings.HasSuffix(line, " table 100") {
			out += strings.ReplaceAll(line, " table 100", "") + "\n"
		}
	}
	return out
}

func ownedFirewallRule(line string) bool {
	fields := strings.Fields(line)
	if len(fields) != 7 {
		return false
	}
	return fields[1] == "from" && fields[2] == "all" && fields[3] == "fwmark" &&
		(fields[4] == "0x1/0x1" || fields[4] == "0x1") && fields[5] == "lookup" && fields[6] == "100"
}

func (s *serverState) beginFirewallTransaction(runCommand func(time.Duration, string, ...string) map[string]any, paths []string) (*firewallTransaction, error) {
	dir, err := os.MkdirTemp(s.cfg.DataDir, ".firewall-transaction-")
	if err != nil {
		return nil, err
	}
	t := &firewallTransaction{dir: dir, run: runCommand}
	ok := false
	defer func() {
		if !ok {
			t.cleanup()
		}
	}()
	for _, path := range paths {
		f := firewallFile{path: path}
		info, err := os.Lstat(path)
		if err == nil {
			if !info.Mode().IsRegular() {
				return nil, fmt.Errorf("необычный файл %s", path)
			}
			f.exists, f.mode = true, info.Mode().Perm()
			body, err := os.ReadFile(path)
			if err != nil {
				return nil, err
			}
			backup, e := os.CreateTemp(filepath.Dir(path), ".firewall-rollback-")
			if e != nil {
				return nil, e
			}
			f.backup = backup.Name()
			backup.Close()
			if err = writeFileAtomic(f.backup, body, f.mode); err != nil {
				os.Remove(f.backup)
				return nil, err
			}
			f.sha256, err = regularFileSHA(f.backup)
			if err != nil {
				return nil, err
			}
		} else if !os.IsNotExist(err) {
			return nil, err
		}
		t.files = append(t.files, f)
	}
	changes, err := t.command("uci", "changes", "dhcp")
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(changes) != "" {
		return nil, fmt.Errorf("сначала сохраните или отмените незавершённые UCI-изменения DHCP")
	}
	tables, err := t.command("nft", "list", "tables")
	if err != nil {
		return nil, err
	}
	for _, line := range strings.Split(tables, "\n") {
		if strings.TrimSpace(line) == "table inet ruopenray" {
			t.hadTable = true
		}
	}
	if t.hadTable {
		t.table, err = t.command("nft", "-s", "list", "table", "inet", "ruopenray")
		if err != nil {
			return nil, err
		}
	}
	t.rules, err = t.command("ip", "-4", "rule", "show")
	if err != nil {
		return nil, err
	}
	// An absent table is normal, but any other ip error must remain an error.
	allRoutes, err := t.command("ip", "-4", "route", "show", "table", "all")
	if err != nil {
		return nil, err
	}
	t.routes = firewallTableRoutes(allRoutes)
	if err = firewallPolicyOwned(t.rules, t.routes); err != nil {
		return nil, err
	}
	// Allocate both inverse variants before any live mutation. After reboot the
	// managed kernel table may be absent, even if it existed before the crash.
	if err = writeFileAtomic(filepath.Join(dir, "rollback.nft"), []byte(firewallBatch(t.table, true)), 0600); err != nil {
		return nil, err
	}
	if err = writeFileAtomic(filepath.Join(dir, "rollback-empty.nft"), []byte(t.table), 0600); err != nil {
		return nil, err
	}
	ok = true
	return t, nil
}

func (t *firewallTransaction) policy(enabled bool) error {
	current, err := t.command("ip", "-4", "rule", "show")
	if err != nil {
		return err
	}
	has := false
	for _, line := range strings.Split(current, "\n") {
		if !ownedFirewallRule(line) {
			continue
		}
		has = true
		if !enabled {
			pref := strings.TrimSuffix(strings.Fields(line)[0], ":")
			if _, err = t.command("ip", "-4", "rule", "del", "pref", pref); err != nil {
				return err
			}
		}
	}
	if enabled {
		if _, err = t.command("ip", "-4", "route", "replace", "local", "0.0.0.0/0", "dev", "lo", "table", "100"); err != nil {
			return err
		}
		if !has {
			_, err = t.command("ip", "-4", "rule", "add", "fwmark", "1/1", "table", "100")
		}
		return err
	}
	// Delete only the exact local route; never flush another application's table.
	all, err := t.command("ip", "-4", "route", "show", "table", "all")
	if err != nil {
		return err
	}
	if firewallTableRoutes(all) != "" {
		_, err = t.command("ip", "-4", "route", "del", "local", "0.0.0.0/0", "dev", "lo", "table", "100")
	}
	return err
}

func (t *firewallTransaction) rollback() map[string]any {
	var failures []string
	add := func(err error) {
		if err != nil {
			failures = append(failures, err.Error())
		}
	}
	// Prepared backups can be renamed even when the filesystem is full.
	for _, f := range t.files {
		add(restoreRecoveryFile(recoveryFile{Path: f.path, Backup: f.backup, Existed: f.exists, Mode: f.mode, SHA256: f.sha256}))
	}
	_, err := t.command("uci", "revert", "dhcp")
	add(err)
	tables, tableErr := t.command("nft", "list", "tables")
	add(tableErr)
	if tableErr == nil {
		inverse := "rollback-empty.nft"
		hasTable := false
		for _, line := range strings.Split(tables, "\n") {
			if strings.TrimSpace(line) == "table inet ruopenray" {
				inverse = "rollback.nft"
				hasTable = true
			}
		}
		path := filepath.Join(t.dir, inverse)
		info, statErr := os.Lstat(path)
		body, readErr := os.ReadFile(path)
		if statErr != nil || !info.Mode().IsRegular() || readErr != nil || string(body) != firewallBatch(t.table, hasTable) {
			add(fmt.Errorf("обратный nft batch не совпадает со снимком"))
		} else {
			_, err = t.command("nft", "-f", path)
			add(err)
		}
	}
	add(t.policy(false))
	if strings.TrimSpace(t.routes) != "" {
		_, err = t.command("ip", "-4", "route", "replace", "local", "0.0.0.0/0", "dev", "lo", "table", "100")
		add(err)
	}
	for _, line := range strings.Split(t.rules, "\n") {
		if ownedFirewallRule(line) {
			fields := strings.Fields(line)
			args := append([]string{"-4", "rule", "add", "pref", strings.TrimSuffix(fields[0], ":")}, fields[1:]...)
			_, err = t.command("ip", args...)
			add(err)
		}
	}
	_, err = t.command("/etc/init.d/dnsmasq", "restart")
	add(err)
	return map[string]any{"ok": len(failures) == 0, "errors": failures, "recoveryDir": t.dir}
}

func (s *serverState) firewallCommit(body, hotplug string, payload map[string]any) map[string]any {
	paths := []string{ruOpenRayFirewallNftPath, ruOpenRayFirewallLegacyNftPath, ruOpenRayFirewallHotplugPath, ruOpenRayFirewallEventPath, ruOpenRayKillSwitchDNSPath, "/etc/config/dhcp"}
	return s.firewallCommitWith(body, hotplug, payload, paths, runTimeout, func() []map[string]any {
		steps := applyKillSwitchDomainProtection(stringList(payload["killSwitchDomains"]), boolPayload(payload, "killSwitch", false), fmt.Sprint(payload["killSwitchDomainMode"]))
		return append(steps, applyRouteDomainNftsets(payload, fmt.Sprint(payload["bypassMode"]))...)
	}, s.firewallStatus)
}

func (s *serverState) firewallCommitWith(body, hotplug string, payload map[string]any, paths []string, runCommand func(time.Duration, string, ...string) map[string]any, dns func() []map[string]any, statusFn func() map[string]any) map[string]any {
	if err := validateFirewallTable(body); err != nil {
		return map[string]any{"ok": false, "error": err.Error()}
	}
	t, err := s.beginFirewallTransaction(runCommand, paths)
	if err != nil {
		return map[string]any{"ok": false, "error": err.Error()}
	}
	failed := func(err error) map[string]any {
		rb := t.rollback()
		if rb["ok"] == true {
			t.cleanup()
		}
		return map[string]any{"ok": false, "error": err.Error(), "rollback": rb, "steps": t.steps}
	}
	if err = t.load(body, t.hadTable, true); err != nil {
		t.cleanup()
		return map[string]any{"ok": false, "error": err.Error(), "steps": t.steps}
	}
	// Allocate all new files before modifying runtime, including on low flash.
	staged := map[string]string{}
	for path, value := range map[string]string{paths[0]: body, paths[2]: hotplug, paths[3]: hotplug} {
		if value == "" {
			continue
		}
		if err = os.MkdirAll(filepath.Dir(path), 0755); err != nil {
			t.cleanup()
			return map[string]any{"ok": false, "error": err.Error()}
		}
		f, e := os.CreateTemp(filepath.Dir(path), ".firewall-candidate-")
		if e != nil {
			err = e
			break
		}
		f.Close()
		mode := os.FileMode(0644)
		if path != paths[0] {
			mode = 0755
		}
		if e = writeFileAtomic(f.Name(), []byte(value), mode); e != nil {
			os.Remove(f.Name())
			err = e
			break
		}
		staged[path] = f.Name()
	}
	defer func() {
		for _, path := range staged {
			os.Remove(path)
		}
	}()
	if err != nil {
		t.cleanup()
		return map[string]any{"ok": false, "error": err.Error()}
	}
	// Both inverse batch and file copies are allocated before the kernel commit.
	if err = writeFileAtomic(filepath.Join(t.dir, "rollback.nft"), []byte(firewallBatch(t.table, body != "")), 0600); err != nil {
		t.cleanup()
		return map[string]any{"ok": false, "error": err.Error()}
	}
	journal := transactionRecovery{Version: 1, Kind: "firewall", Rules: t.rules, Routes: t.routes, Table: t.table, HadTable: t.hadTable}
	for _, f := range t.files {
		journal.Files = append(journal.Files, recoveryFile{Path: f.path, Backup: f.backup, Existed: f.exists, Mode: f.mode, SHA256: f.sha256})
	}
	if err = saveTransactionRecovery(t.dir, journal); err != nil {
		t.cleanup()
		return map[string]any{"ok": false, "error": err.Error()}
	}
	if _, err = t.command("nft", "-f", filepath.Join(t.dir, "batch.nft")); err != nil {
		t.cleanup()
		return map[string]any{"ok": false, "error": err.Error(), "steps": t.steps}
	}
	for _, path := range paths[:4] {
		if candidate := staged[path]; candidate != "" {
			err = renameDurable(candidate, path)
		} else {
			err = removeDurable(path)
			if os.IsNotExist(err) {
				err = nil
			}
		}
		if err != nil {
			return failed(err)
		}
	}
	if err = t.policy(strings.Contains(body, " tproxy ")); err != nil {
		return failed(err)
	}
	dnsSteps := dns()
	t.steps = append(t.steps, dnsSteps...)
	for _, step := range dnsSteps {
		if step["ok"] != true {
			return failed(fmt.Errorf("не удалось применить DNS: %v", step["stderr"]))
		}
	}
	status := statusFn()
	if (body != "" && status["active"] != true) || (body == "" && status["active"] == true) {
		return failed(fmt.Errorf("таблица firewall не прошла проверку"))
	}
	if strings.Contains(body, " tproxy ") && (status["ipRule"] != true || status["ipRoute"] != true) {
		return failed(fmt.Errorf("policy routing TPROXY не прошёл проверку"))
	}
	if err = commitTransactionRecovery(t.dir); err != nil {
		return failed(err)
	}
	t.cleanup()
	return map[string]any{"ok": true, "steps": t.steps, "status": status, "atomic": true}
}
