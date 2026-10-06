package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"sort"
	"strings"
	"time"
)

// Credentials and ownership live outside profiles and exported Xray configs.
type adGuardSettings struct {
	Enabled          bool     `json:"enabled"`
	URL              string   `json:"url"`
	Username         string   `json:"username"`
	Password         string   `json:"password"`
	BootstrapDNS     []string `json:"bootstrapDns"`
	ManagedUpstreams []string `json:"managedUpstreams"`
	ManagedRules     []string `json:"managedRules"`
	Domains          []string `json:"domains"`
}

func (s *serverState) adGuardSettingsPath() string {
	return filepath.Join(s.cfg.DataDir, "adguard.json")
}

func (s *serverState) loadAdGuardSettings() (adGuardSettings, error) {
	var cfg adGuardSettings
	body, err := os.ReadFile(s.adGuardSettingsPath())
	if os.IsNotExist(err) {
		return cfg, nil
	}
	if err != nil {
		return cfg, err
	}
	err = json.Unmarshal(body, &cfg)
	return cfg, err
}

func (s *serverState) saveAdGuardSettings(cfg adGuardSettings) error {
	if err := os.MkdirAll(s.cfg.DataDir, 0700); err != nil {
		return err
	}
	body, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	return writeFileAtomic(s.adGuardSettingsPath(), body, 0600)
}

func validateAdGuardURL(address string) error {
	u, err := url.Parse(address)
	if err != nil {
		return errors.New("Некорректный адрес AdGuard Home")
	}
	ip := net.ParseIP(u.Hostname())
	if (u.Scheme != "http" && u.Scheme != "https") || ip == nil || !ip.IsLoopback() || u.User != nil || (u.Path != "" && u.Path != "/") || u.RawQuery != "" || u.Fragment != "" {
		return errors.New("Для управления AdGuard Home укажите HTTP(S)-адрес на 127.0.0.1 или [::1] без пути и пароля в URL")
	}
	return nil
}

func adGuardDoHURLKey(value string) string {
	u, err := url.Parse(value)
	if err != nil {
		return value
	}
	port := u.Port()
	if port == "" {
		port = "443"
	}
	u.Host = net.JoinHostPort(strings.ToLower(u.Hostname()), port)
	return u.String()
}

func adGuardCall(cfg adGuardSettings, path string, payload any, result any) error {
	if err := validateAdGuardURL(cfg.URL); err != nil {
		return err
	}
	method := http.MethodGet
	var body io.Reader
	if payload != nil {
		method = http.MethodPost
		data, err := json.Marshal(payload)
		if err != nil {
			return err
		}
		body = bytes.NewReader(data)
	}
	req, err := http.NewRequest(method, strings.TrimRight(cfg.URL, "/")+"/control/"+path, body)
	if err != nil {
		return errors.New("Не удалось создать запрос AdGuard Home")
	}
	req.SetBasicAuth(cfg.Username, cfg.Password)
	req.Header.Set("Content-Type", "application/json")
	transport := &http.Transport{Proxy: nil}
	defer transport.CloseIdleConnections()
	client := &http.Client{Timeout: 8 * time.Second, Transport: transport, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	resp, err := client.Do(req)
	if err != nil {
		return errors.New("AdGuard Home не отвечает на локальный API; проверьте сервис и адрес")
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("AdGuard Home: HTTP %d при %s", resp.StatusCode, strings.Split(path, "?")[0])
	}
	if result == nil {
		_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, maxJSONBodyBytes))
		return nil
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, maxJSONBodyBytes)).Decode(result); err != nil {
		return errors.New("Некорректный ответ API AdGuard Home")
	}
	return nil
}

func adGuardDomain(value string) string {
	value = strings.ToLower(strings.TrimSuffix(strings.TrimSpace(value), "."))
	if host, _, err := net.SplitHostPort(value); err == nil {
		value = host
	}
	if net.ParseIP(strings.Trim(value, "[]")) != nil || len(value) > 253 || !strings.Contains(value, ".") {
		return ""
	}
	for _, label := range strings.Split(value, ".") {
		if len(label) == 0 || len(label) > 63 || label[0] == '-' || label[len(label)-1] == '-' {
			return ""
		}
		for _, c := range label {
			if !(c >= 'a' && c <= 'z' || c >= '0' && c <= '9' || c == '-') {
				return ""
			}
		}
	}
	return value
}

func adGuardConfigDomains(cfg map[string]any) []string {
	seen := map[string]bool{}
	for _, item := range anySlice(cfg["outbounds"]) {
		outbound := mapValue(item)
		switch fmt.Sprint(outbound["protocol"]) {
		case "vless", "vmess", "trojan", "shadowsocks", "socks", "http", "wireguard":
		default:
			continue
		}
		settings := mapValue(outbound["settings"])
		for _, key := range []string{"vnext", "servers", "peers"} {
			for _, server := range anySlice(settings[key]) {
				for _, field := range []string{"address", "endpoint"} {
					if domain := adGuardDomain(fmt.Sprint(mapValue(server)[field])); domain != "" {
						seen[domain] = true
					}
				}
			}
		}
	}
	return sortedAdGuardKeys(seen)
}

func sortedAdGuardKeys(seen map[string]bool) []string {
	out := []string{}
	for key := range seen {
		out = append(out, key)
	}
	sort.Strings(out)
	return out
}

// Include saved profiles and the current config so a switch and its rollback can
// both bootstrap while the VPN is down. Routing domains are never exempted.
func (s *serverState) adGuardDomains(candidate map[string]any) ([]string, error) {
	seen := map[string]bool{}
	add := func(cfg map[string]any) {
		for _, domain := range adGuardConfigDomains(cfg) {
			seen[domain] = true
		}
	}
	add(candidate)
	if cfg, err := s.readActiveConfig(); err == nil {
		add(cfg)
	}
	files, err := filepath.Glob(filepath.Join(s.cfg.ProfilesDir, "*.json"))
	if err != nil {
		return nil, err
	}
	for _, file := range files {
		body, err := os.ReadFile(file)
		if err != nil {
			return nil, err
		}
		var cfg map[string]any
		if err := json.Unmarshal(body, &cfg); err != nil {
			return nil, fmt.Errorf("Не удалось прочитать профиль %s для DNS bootstrap", filepath.Base(file))
		}
		add(cfg)
	}
	for _, pool := range s.readSubscriptionStore().Pools {
		for _, outbound := range pool.Candidates {
			add(map[string]any{"outbounds": []any{outbound}})
		}
	}
	return sortedAdGuardKeys(seen), nil
}

func adGuardManagedEntries(domains, resolvers []string) ([]string, []string) {
	upstreams, rules := []string{}, []string{}
	if len(domains) > 0 {
		for _, resolver := range resolvers {
			upstreams = append(upstreams, "[/"+strings.Join(domains, "/")+"/]"+resolver)
		}
		for _, domain := range domains {
			rules = append(rules, "@@||"+domain+"^")
		}
	}
	return upstreams, rules
}

// Do not take ownership of an identical rule already added by the user.
func adGuardMerge(current, owned, wanted []string) (merged, managed []string) {
	remove, seen := map[string]bool{}, map[string]bool{}
	merged, managed = []string{}, []string{}
	for _, item := range owned {
		remove[item] = true
	}
	for _, item := range current {
		if !remove[item] {
			merged = append(merged, item)
			seen[item] = true
		}
	}
	for _, item := range wanted {
		if !seen[item] {
			merged = append(merged, item)
			managed = append(managed, item)
			seen[item] = true
		}
	}
	return
}

func adGuardUnion(a, b []string) []string {
	seen := map[string]bool{}
	for _, item := range append(append([]string{}, a...), b...) {
		seen[item] = true
	}
	return sortedAdGuardKeys(seen)
}

// set_rules schedules an asynchronous engine rebuild. Wait for the actual
// filter result before invalidating caches or restarting the VPN.
func adGuardWaitException(cfg adGuardSettings, domain string, remove bool) error {
	deadline := time.Now().Add(5 * time.Second)
	rule := "@@||" + domain + "^"
	for {
		var result map[string]any
		if err := adGuardCall(cfg, "filtering/check_host?name="+url.QueryEscape(domain), nil, &result); err != nil {
			return err
		}
		present := result["rule"] == rule
		for _, item := range anySlice(result["rules"]) {
			present = present || mapValue(item)["text"] == rule
		}
		if remove && !present || !remove && result["reason"] == "NotFilteredWhiteList" {
			return nil
		}
		if time.Now().After(deadline) {
			return errors.New("AdGuard сохранил правило, но ещё не применил фильтр; повторите проверку домена")
		}
		time.Sleep(150 * time.Millisecond)
	}
}

func adGuardRefreshDNSCache(cfg adGuardSettings) error {
	if err := adGuardCall(cfg, "cache_clear", map[string]any{}, nil); err != nil {
		return err
	}
	if runtime.GOOS == "windows" || !commandExists("uci") {
		return nil
	}
	var status map[string]any
	if err := adGuardCall(cfg, "status", nil, &status); err != nil {
		return err
	}
	port := number(status["dns_port"], 0)
	if port <= 0 {
		return nil
	}
	for _, server := range dnsmasqServerList() {
		if server == fmt.Sprintf("127.0.0.1#%d", port) || server == fmt.Sprintf("::1#%d", port) {
			if result := runTimeout(3*time.Second, "/etc/init.d/dnsmasq", "reload"); result["ok"] != true {
				return errors.New("AdGuard обновлён, но не удалось очистить кэш dnsmasq")
			}
			break
		}
	}
	return nil
}

// Caller holds adguardMu. Pending ownership is persisted before API mutations;
// after an interrupted sync the next run can remove either partial generation.
func (s *serverState) reconcileAdGuard(cfg adGuardSettings, domains []string) (adGuardSettings, func() error, error) {
	previous, err := s.loadAdGuardSettings()
	if err != nil {
		return cfg, nil, err
	}
	var dns, filtering map[string]any
	if err := adGuardCall(cfg, "dns_info", nil, &dns); err != nil {
		return cfg, nil, err
	}
	if err := adGuardCall(cfg, "filtering/status", nil, &filtering); err != nil {
		return cfg, nil, err
	}
	oldUpstreams, oldRules := stringSlice(dns["upstream_dns"]), stringSlice(filtering["user_rules"])
	wantedUpstreams, wantedRules := adGuardManagedEntries(domains, cfg.BootstrapDNS)
	upstreams, managedUpstreams := adGuardMerge(oldUpstreams, cfg.ManagedUpstreams, wantedUpstreams)
	rules, managedRules := adGuardMerge(oldRules, cfg.ManagedRules, wantedRules)
	next := cfg
	next.Domains, next.ManagedUpstreams, next.ManagedRules = domains, managedUpstreams, managedRules
	changedDNS, changedRules := !reflect.DeepEqual(oldUpstreams, upstreams), !reflect.DeepEqual(oldRules, rules)
	undo := func() error {
		var failures []error
		if changedDNS {
			failures = append(failures, adGuardCall(cfg, "dns_config", map[string]any{"upstream_dns": oldUpstreams}, nil))
		}
		if changedRules {
			failures = append(failures, adGuardCall(cfg, "filtering/set_rules", map[string]any{"rules": oldRules}, nil))
		}
		if err := errors.Join(failures...); err != nil {
			return err
		}
		return s.saveAdGuardSettings(previous)
	}
	pending := cfg
	pending.ManagedUpstreams, pending.ManagedRules = adGuardUnion(cfg.ManagedUpstreams, managedUpstreams), adGuardUnion(cfg.ManagedRules, managedRules)
	if err := s.saveAdGuardSettings(pending); err != nil {
		return cfg, nil, err
	}
	fail := func(err error) (adGuardSettings, func() error, error) {
		if rollbackErr := undo(); rollbackErr != nil {
			return cfg, nil, fmt.Errorf("%w; откат AdGuard: %v", err, rollbackErr)
		}
		return cfg, nil, err
	}
	if changedDNS {
		if err := adGuardCall(cfg, "dns_config", map[string]any{"upstream_dns": upstreams}, nil); err != nil {
			return fail(err)
		}
	}
	if changedRules {
		if err := adGuardCall(cfg, "filtering/set_rules", map[string]any{"rules": rules}, nil); err != nil {
			return fail(err)
		}
		for _, domain := range domains {
			if err := adGuardWaitException(cfg, domain, false); err != nil {
				return fail(err)
			}
		}
		if err := adGuardRefreshDNSCache(cfg); err != nil {
			return fail(err)
		}
	}
	if err := s.saveAdGuardSettings(next); err != nil {
		return fail(err)
	}
	return next, undo, nil
}

func (s *serverState) withAdGuardBootstrap(candidate map[string]any, write func() error) error {
	s.adguardMu.Lock()
	defer s.adguardMu.Unlock()
	cfg, err := s.loadAdGuardSettings()
	if err != nil {
		return err
	}
	if !cfg.Enabled {
		return write()
	}
	domains, err := s.adGuardDomains(candidate)
	if err != nil {
		return err
	}
	_, undo, err := s.reconcileAdGuard(cfg, domains)
	if err != nil {
		return fmt.Errorf("DNS bootstrap не обновлён; конфигурация VPN сохранена: %w", err)
	}
	if err := write(); err != nil {
		if rollbackErr := undo(); rollbackErr != nil {
			return fmt.Errorf("%w; откат AdGuard: %v", err, rollbackErr)
		}
		return err
	}
	return nil
}

func (s *serverState) adGuardIntegrationStatus() map[string]any {
	s.adguardMu.Lock()
	defer s.adguardMu.Unlock()
	cfg, err := s.loadAdGuardSettings()
	result := map[string]any{"ok": err == nil, "configured": cfg.URL != "", "enabled": cfg.Enabled, "url": cfg.URL, "username": cfg.Username, "bootstrapDns": cfg.BootstrapDNS, "domains": cfg.Domains}
	if err != nil {
		result["error"] = err.Error()
		return result
	}
	if cfg.URL == "" {
		return result
	}
	var status, stats, filtering map[string]any
	if err := adGuardCall(cfg, "status", nil, &status); err != nil {
		result["ok"] = false
		result["error"] = err.Error()
		return result
	}
	result["running"], result["protectionEnabled"], result["version"] = status["running"], status["protection_enabled"], status["version"]
	if err := adGuardCall(cfg, "stats", nil, &stats); err == nil {
		result["queries"], result["blocked"], result["averageProcessingTime"] = stats["num_dns_queries"], stats["num_blocked_filtering"], stats["avg_processing_time"]
	}
	if err := adGuardCall(cfg, "filtering/status", nil, &filtering); err == nil {
		result["filteringEnabled"] = filtering["enabled"]
		count := 0
		for _, filter := range anySlice(filtering["filters"]) {
			if mapValue(filter)["enabled"] == true {
				count++
			}
		}
		result["filters"] = count
	}
	return result
}

func (s *serverState) adGuardAction(payload map[string]any) (map[string]any, error) {
	s.adguardMu.Lock()
	defer s.adguardMu.Unlock()
	cfg, err := s.loadAdGuardSettings()
	if err != nil {
		return nil, err
	}
	action := fmt.Sprint(payload["action"])
	if action == "configure" {
		next := cfg
		next.URL = strings.TrimRight(strings.TrimSpace(fmt.Sprint(payload["url"])), "/")
		next.Username = strings.TrimSpace(fmt.Sprint(payload["username"]))
		if password, ok := payload["password"].(string); ok && password != "" {
			next.Password = password
		} else if next.URL != cfg.URL || next.Username != cfg.Username {
			next.Password = ""
		}
		if err := validateAdGuardURL(next.URL); err != nil {
			return nil, err
		}
		if cfg.Enabled && next.URL != cfg.URL {
			return nil, errors.New("Сначала отключите синхронизацию прежнего AdGuard Home")
		}
		if next.URL != cfg.URL {
			next.ManagedUpstreams, next.ManagedRules, next.Domains = nil, nil, nil
		}
		next.Enabled, _ = payload["enabled"].(bool)
		next.BootstrapDNS = stringSlice(payload["bootstrapDns"])
		if len(next.BootstrapDNS) == 0 {
			next.BootstrapDNS = []string{"https://8.8.8.8/dns-query", "https://1.1.1.1/dns-query"}
		}
		for _, resolver := range next.BootstrapDNS {
			u, err := url.Parse(resolver)
			if err != nil || u.Scheme != "https" || net.ParseIP(u.Hostname()) == nil || u.User != nil || u.RawQuery != "" || u.Fragment != "" {
				return nil, errors.New("Bootstrap DNS должен быть DoH с IP-адресом и проверкой TLS, например https://8.8.8.8/dns-query")
			}
		}
		var status map[string]any
		if err := adGuardCall(next, "status", nil, &status); err != nil {
			return nil, err
		}
		if next.Enabled {
			var probes map[string]string
			if err := adGuardCall(next, "test_upstream_dns", map[string]any{"upstream_dns": next.BootstrapDNS}, &probes); err != nil {
				return nil, err
			}
			ready := false
			for _, resolver := range next.BootstrapDNS {
				for tested, result := range probes {
					if adGuardDoHURLKey(tested) == adGuardDoHURLKey(resolver) && result == "OK" {
						ready = true
					}
				}
			}
			if !ready {
				return nil, errors.New("Ни один bootstrap DoH не прошёл проверку AdGuard Home; настройки не изменены")
			}
		}
		if !next.Enabled {
			// Pausing automation must not remove bootstrap needed to bring the
			// current VPN back after a cold boot. Keep the last static generation.
			if err := s.saveAdGuardSettings(next); err != nil {
				return nil, err
			}
			return map[string]any{"ok": true, "domains": next.Domains}, nil
		}
		domains, err := s.adGuardDomains(nil)
		if err != nil {
			return nil, err
		}
		// An explicitly requested first adoption registers only the exact pilot
		// generation. Other upstreams and filtering exceptions stay user-owned.
		if payload["adoptExisting"] == true && cfg.URL == "" {
			next.ManagedUpstreams, next.ManagedRules = adGuardManagedEntries(domains, next.BootstrapDNS)
		}
		_, _, err = s.reconcileAdGuard(next, domains)
		if err != nil {
			return nil, err
		}
		return map[string]any{"ok": true, "domains": domains}, nil
	}
	if cfg.URL == "" {
		return nil, errors.New("Сначала подключите локальный API AdGuard Home")
	}
	switch action {
	case "sync":
		if !cfg.Enabled {
			return nil, errors.New("Автоматическая синхронизация отключена")
		}
		domains, err := s.adGuardDomains(nil)
		if err != nil {
			return nil, err
		}
		_, _, err = s.reconcileAdGuard(cfg, domains)
		return map[string]any{"ok": err == nil, "domains": domains}, err
	case "protection":
		enabled, ok := payload["enabled"].(bool)
		if !ok {
			return nil, errors.New("Укажите enabled: true или false")
		}
		err = adGuardCall(cfg, "protection", map[string]any{"enabled": enabled, "duration": 0}, nil)
		if err == nil {
			err = adGuardRefreshDNSCache(cfg)
		}
	case "exception", "check":
		domain := adGuardDomain(fmt.Sprint(payload["domain"]))
		if domain == "" {
			return nil, errors.New("Укажите домен без URL, пути и шаблонов")
		}
		if action == "check" {
			var result map[string]any
			err = adGuardCall(cfg, "filtering/check_host?name="+url.QueryEscape(domain), nil, &result)
			return map[string]any{"ok": err == nil, "domain": domain, "result": result}, err
		}
		var filtering map[string]any
		if err := adGuardCall(cfg, "filtering/status", nil, &filtering); err != nil {
			return nil, err
		}
		rule := "@@||" + domain + "^"
		rules := stringSlice(filtering["user_rules"])
		remove := payload["remove"] == true
		if remove {
			for _, managed := range cfg.ManagedRules {
				if rule == managed {
					return nil, errors.New("Это исключение поддерживает запуск VPN. Отключите синхронизацию или удалите сервер из профилей")
				}
			}
			filtered := []string{}
			for _, item := range rules {
				if item != rule {
					filtered = append(filtered, item)
				}
			}
			rules = filtered
		} else {
			exists := false
			for _, item := range rules {
				if item == rule {
					exists = true
				}
			}
			if !exists {
				rules = append(rules, rule)
			}
		}
		err = adGuardCall(cfg, "filtering/set_rules", map[string]any{"rules": rules}, nil)
		if err == nil {
			err = adGuardWaitException(cfg, domain, remove)
		}
		if err == nil {
			err = adGuardRefreshDNSCache(cfg)
		}
	default:
		return nil, errors.New("Неподдерживаемое действие AdGuard Home")
	}
	return map[string]any{"ok": err == nil}, err
}
