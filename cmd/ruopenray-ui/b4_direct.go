package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"
)

const b4DirectMark = 0x80000
const b4DirectTable = "ruopenray_b4_direct"

func b4DirectConfigIssues(config map[string]any) []string {
	issues := []string{}
	marked := false
	for _, item := range anySlice(config["outbounds"]) {
		out := mapValue(item)
		mark := intFromAny(mapValue(mapValue(out["streamSettings"])["sockopt"])["mark"])
		if mark&b4DirectMark == 0 {
			continue
		}
		if stringValue(out["protocol"]) != "freedom" || stringValue(out["tag"]) != "direct-b4" {
			issues = append(issues, "Метка B4 должна принадлежать только выходу direct-b4/freedom.")
		} else {
			marked = true
			socket := mapValue(mapValue(out["streamSettings"])["sockopt"])
			if mark & ^(b4DirectMark|0xff) != 0 || stringValue(socket["interface"]) != "" || stringValue(mapValue(out["proxySettings"])["tag"]) != "" {
				issues = append(issues, "Выход direct-b4 не должен иметь метку AWG, привязку к интерфейсу или цепочку через другой прокси.")
			}
		}
	}
	if !marked {
		issues = append(issues, "Сначала подготовьте выход direct-b4 в черновике Xray и примените конфигурацию Xray.")
	}
	return issues
}

func b4DirectRules(config map[string]any) (string, error) {
	queue := mapValue(config["queue"])
	first := b4IntFromAny(queue["startNum"])
	threads := b4IntFromAny(queue["threads"])
	if first < 0 || threads < 1 || threads > 128 || first+threads > 65536 {
		return "", fmt.Errorf("Некорректный диапазон NFQUEUE B4")
	}
	if !boolMap(queue, "ipv4") && !boolMap(queue, "ipv6") {
		return "", fmt.Errorf("В B4 отключены IPv4 и IPv6")
	}
	filter := ""
	if !boolMap(queue, "ipv4") {
		filter = "meta nfproto ipv6 "
	} else if !boolMap(queue, "ipv6") {
		filter = "meta nfproto ipv4 "
	}
	num := fmt.Sprint(first)
	if threads > 1 {
		num = fmt.Sprintf("%d-%d", first, first+threads-1)
	}
	mark := b4IntFromAny(queue["mark"])
	if mark <= 0 {
		return "", fmt.Errorf("Для очереди B4 требуется отдельный packet mark")
	}
	var rules strings.Builder
	fmt.Fprintf(&rules, "add table inet %s\nflush table inet %s\n", b4DirectTable, b4DirectTable)
	for _, chain := range []string{"output", "prerouting"} {
		fmt.Fprintf(&rules, "add chain inet %s %s { type filter hook %s priority -151; policy accept; }\n", b4DirectTable, chain, chain)
		fmt.Fprintf(&rules, "add rule inet %s %s meta mark & 0x%x != 0 return\n", b4DirectTable, chain, mark)
	}
	// Record only opted-in flows, so their replies (SYN-ACK/RST/TLS/QUIC) reach
	// B4 too. Its injected packets carry its own mark and bypass both hooks.
	for _, ports := range []string{"tcp dport { 80, 443 }", "udp dport 443"} {
		fmt.Fprintf(&rules, "add rule inet %s output %smeta mark & 0x%x == 0x%x %s ct mark set ct mark | 0x%x\n", b4DirectTable, filter, b4DirectMark, b4DirectMark, ports, b4DirectMark)
	}
	for _, entry := range []struct{ chain, match, count string }{
		{"output", "meta mark", "original"}, {"prerouting", "ct mark", "reply"},
	} {
		port := "dport"
		if entry.chain == "prerouting" {
			port = "sport"
		}
		fmt.Fprintf(&rules, "add rule inet %s %s %s%s & 0x%x == 0x%x tcp %s { 80, 443 } ct %s packets <= 20 counter queue num %s bypass\n", b4DirectTable, entry.chain, filter, entry.match, b4DirectMark, b4DirectMark, port, entry.count, num)
		fmt.Fprintf(&rules, "add rule inet %s %s %s%s & 0x%x == 0x%x udp %s 443 ct %s packets <= 9 counter queue num %s bypass\n", b4DirectTable, entry.chain, filter, entry.match, b4DirectMark, b4DirectMark, port, entry.count, num)
	}
	return rules.String(), nil
}

func (s *serverState) b4DirectControl(enabled bool) map[string]any {
	return s.b4DirectApply(enabled, false)
}

func (s *serverState) b4DirectApply(enabled, restoring bool) map[string]any {
	if runtime.GOOS == "windows" {
		return b4Error("NFQUEUE B4 управляется только на роутере")
	}
	s.b4ControlMu.Lock()
	defer s.b4ControlMu.Unlock()
	s.b4Mu.Lock()
	defer s.b4Mu.Unlock()
	cfg, err := s.loadB4Settings()
	if err != nil {
		return b4Error("Не удалось прочитать настройки B4")
	}
	// A concurrent user disable takes precedence over a background restore.
	if restoring && !cfg.DirectEnabled {
		return map[string]any{"ok": true, "skipped": true}
	}
	if !enabled {
		return s.b4DisableDirectLocked(cfg)
	}

	c := newB4Client(cfg, &s.b4Token, &s.b4LoginAfter, &s.b4LoginKey)
	defer c.close()
	status := b4APIStatusWithClient(c)
	if !boolMap(status, "authenticated") {
		return b4Error("Сначала подключите API B4")
	}
	config := mapValue(status["config"])
	issues := b4StringSliceFromAny(status["startIssues"], 0) // []string in-process is handled below.
	if v, ok := status["startIssues"].([]string); ok {
		issues = v
	}
	active, err := s.readActiveConfig()
	if err != nil {
		return b4Error("Не удалось прочитать действующую конфигурацию Xray")
	}
	issues = append(issues, b4DirectConfigIssues(active)...)
	if len(issues) > 0 {
		return b4Error(strings.Join(issues, " "))
	}
	if stringValue(mapValue(status["engine"])["state"]) != "running" {
		return b4Error("Движок B4 не работает. Запустите B4 и проверьте NFQUEUE")
	}
	engine := mapValue(status["engine"])
	if stringValue(engine["mode"]) != "nfqueue" || stringValue(engine["firewall"]) != "external" {
		return b4Error("Действующий движок B4 ещё не работает в режиме внешнего NFQUEUE. Примените настройки B4 и перезапустите его")
	}
	liveQueues, readErr := os.ReadFile("/proc/net/netfilter/nfnetlink_queue")
	if readErr != nil || !b4QueueRangeReady(string(liveQueues), mapValue(config["queue"])) {
		return b4Error("Диапазон NFQUEUE из конфигурации B4 ещё не слушается. Примените настройки B4 и перезапустите движок")
	}
	nft := b4NFTStatus()
	iptables := b4IPTablesStatus()
	routing := b4RoutingStatus()
	if boolMap(nft, "otherB4") || boolMap(nft, "foreignQueue") || boolMap(iptables, "hasNFQUEUE") || boolMap(routing, "explicitB4") {
		return b4Error("Найдены другие правила B4/NFQUEUE или маршруты B4. Сначала остановите старый перехват и очистите его таблицы; direct → B4 не включён")
	}
	if status["setsError"] != nil {
		return b4Error("Сеты B4 не прочитаны; включать перехват пока нельзя")
	}
	if !commandExists("nft") {
		return b4Error("Для direct → B4 требуется nftables и модуль nft_queue")
	}
	script, err := b4DirectRules(config)
	if err != nil {
		return b4Error(err.Error())
	}
	file, err := os.CreateTemp("", "ruopenray-b4-*.nft")
	if err != nil {
		return b4Error("Не удалось подготовить NFQUEUE-правила B4")
	}
	name := file.Name()
	defer os.Remove(name)
	_, err = file.WriteString(script)
	closeErr := file.Close()
	if err != nil || closeErr != nil {
		return b4Error("Не удалось записать NFQUEUE-правила B4")
	}
	if result := runTimeout(4*time.Second, "nft", "-c", "-f", name); result["ok"] != true {
		return b4Error("nftables отклонил правила direct → B4; проверьте nft_queue и conntrack. Firewall не изменён")
	}
	if result := runTimeout(4*time.Second, "nft", "-f", name); result["ok"] != true {
		return b4Error("Не удалось применить правила direct → B4")
	}
	cfg.DirectEnabled = true
	if err := s.saveB4Settings(cfg); err != nil {
		runTimeout(3*time.Second, "nft", "delete", "table", "inet", b4DirectTable)
		return b4Error("Не удалось сохранить настройку B4; новые правила удалены")
	}
	s.clearB4Cache()
	return map[string]any{"ok": true, "message": "direct → B4 включён: только выход direct-b4, TCP 80/443 и UDP 443. Обычный direct, VPN и порт DNS 53 не перехватываются"}
}

func (s *serverState) saveB4Settings(cfg b4Settings) error {
	if err := os.MkdirAll(s.cfg.DataDir, 0700); err != nil {
		return err
	}
	body, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	return writeFileAtomic(filepath.Join(s.cfg.DataDir, "b4-api.json"), body, 0600)
}

func (s *serverState) restoreB4Direct() {
	s.b4DirectApply(true, true)
}

func (s *serverState) maintainB4Direct() {
	// nft rules outside fw4 normally survive its reload. Restore our own table
	// if a firewall reload removes it, and after B4 finishes starting at boot.
	for {
		cfg, err := s.loadB4Settings()
		if runtime.GOOS != "windows" && err == nil && cfg.DirectEnabled && commandExists("nft") {
			if status := runTimeout(3*time.Second, "nft", "list", "table", "inet", b4DirectTable); status["ok"] != true {
				s.restoreB4Direct()
			}
		}
		time.Sleep(15 * time.Second)
	}
}

func (s *serverState) b4DisableDirectLocked(cfg b4Settings) map[string]any {
	if commandExists("nft") {
		check := runTimeout(3*time.Second, "nft", "list", "table", "inet", b4DirectTable)
		if check["ok"] == true {
			if result := runTimeout(3*time.Second, "nft", "delete", "table", "inet", b4DirectTable); result["ok"] != true {
				return b4Error("Не удалось удалить NFQUEUE-правила direct → B4")
			}
		}
	}
	cfg.DirectEnabled = false
	if err := s.saveB4Settings(cfg); err != nil {
		return b4Error("Правила удалены, но настройка автозапуска не сохранена")
	}
	s.clearB4Cache()
	return map[string]any{"ok": true, "message": "direct → B4 отключён; маршруты Xray сохранены"}
}

func b4QueueRangeReady(text string, queue map[string]any) bool {
	first := b4IntFromAny(queue["startNum"])
	count := b4IntFromAny(queue["threads"])
	if first < 0 || count < 1 || count > 128 || first+count > 65536 {
		return false
	}
	seen := map[int]bool{}
	for _, line := range strings.Split(text, "\n") {
		fields := strings.Fields(line)
		if len(fields) < 2 {
			continue
		}
		if num, err := strconv.Atoi(fields[0]); err == nil {
			seen[num] = true
		}
	}
	for n := first; n < first+count; n++ {
		if !seen[n] {
			return false
		}
	}
	return true
}
