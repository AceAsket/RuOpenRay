package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

// API credentials stay outside Xray profiles, backups and exported configs.
type b4Settings struct {
	DirectEnabled bool   `json:"directEnabled"`
	URL           string `json:"url"`
	Username      string `json:"username"`
	Password      string `json:"password"`
}

func (s *serverState) loadB4Settings() (b4Settings, error) {
	cfg := b4Settings{URL: "http://127.0.0.1:7000"}
	body, err := os.ReadFile(filepath.Join(s.cfg.DataDir, "b4-api.json"))
	if os.IsNotExist(err) {
		return cfg, nil
	}
	if err != nil {
		return cfg, err
	}
	err = json.Unmarshal(body, &cfg)
	return cfg, err
}

func validateB4URL(address string) error {
	if validateAdGuardURL(address) != nil {
		return errors.New("Укажите локальный HTTP(S)-адрес B4 на 127.0.0.1 или [::1], без пути и пароля в URL")
	}
	return nil
}

type b4Client struct {
	cfg        b4Settings
	http       *http.Client
	token      *string
	loginAfter *time.Time
	loginKey   *string
}

func newB4Client(cfg b4Settings, token *string, loginAfter *time.Time, loginKey *string) *b4Client {
	return &b4Client{cfg: cfg, token: token, loginAfter: loginAfter, loginKey: loginKey, http: &http.Client{
		Timeout:       4 * time.Second,
		Transport:     &http.Transport{Proxy: nil},
		CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
	}}
}

func (c *b4Client) close() { c.http.CloseIdleConnections() }

func (c *b4Client) raw(method, path string, payload any, result any) (int, error) {
	if err := validateB4URL(c.cfg.URL); err != nil {
		return 0, err
	}
	var body io.Reader
	if payload != nil {
		data, err := json.Marshal(payload)
		if err != nil {
			return 0, err
		}
		body = bytes.NewReader(data)
	}
	req, err := http.NewRequest(method, strings.TrimRight(c.cfg.URL, "/")+"/api"+path, body)
	if err != nil {
		return 0, errors.New("Некорректный запрос B4")
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Content-Type", "application/json")
	if *c.token != "" {
		req.Header.Set("Authorization", "Bearer "+*c.token)
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return 0, errors.New("Локальный API B4 не отвечает; проверьте сервис и адрес")
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		// Never forward arbitrary upstream errors: config responses can contain secrets.
		return resp.StatusCode, fmt.Errorf("B4: HTTP %d", resp.StatusCode)
	}
	data, err := io.ReadAll(io.LimitReader(resp.Body, maxJSONBodyBytes+1))
	if err != nil || len(data) > maxJSONBodyBytes {
		return resp.StatusCode, errors.New("Ответ B4 слишком велик или не прочитан")
	}
	if !json.Valid(data) {
		return resp.StatusCode, errors.New("Некорректный JSON в ответе API B4")
	}
	if result != nil {
		if err := json.Unmarshal(data, result); err != nil {
			return resp.StatusCode, errors.New("Неожиданный формат ответа API B4")
		}
	}
	return resp.StatusCode, nil
}

func (c *b4Client) login() error {
	if c.cfg.Username == "" || c.cfg.Password == "" {
		return errors.New("API B4 требует логин и пароль")
	}
	keyData, _ := json.Marshal(b4Settings{URL: c.cfg.URL, Username: c.cfg.Username, Password: c.cfg.Password})
	key := fmt.Sprintf("%x", sha256.Sum256(keyData))
	if key == *c.loginKey && time.Now().Before(*c.loginAfter) {
		return errors.New("Вход в B4 временно приостановлен после ошибки авторизации; проверьте логин и пароль")
	}
	*c.token = ""
	var reply struct {
		Token        string `json:"token"`
		AuthRequired *bool  `json:"auth_required"`
	}
	code, err := c.raw(http.MethodPost, "/auth/login", map[string]any{"username": c.cfg.Username, "password": c.cfg.Password}, &reply)
	if err != nil {
		if code == 401 || code == 429 {
			*c.loginAfter = time.Now().Add(15 * time.Minute)
			*c.loginKey = key
		}
		return errors.New("Не удалось войти в B4; проверьте логин и пароль (при частых ошибках B4 временно блокирует вход)")
	}
	if reply.Token == "" && (reply.AuthRequired == nil || *reply.AuthRequired) {
		return errors.New("B4 не выдал токен авторизации")
	}
	*c.token = reply.Token
	*c.loginAfter = time.Time{}
	*c.loginKey = ""
	return nil
}

func (c *b4Client) call(method, path string, payload any, result any) error {
	code, err := c.raw(method, path, payload, result)
	// Retry only explicit 401: B4 refuses the request before performing any mutation.
	if code == 401 {
		if err = c.login(); err != nil {
			return err
		}
		code, err = c.raw(method, path, payload, result)
	}
	if code == 409 {
		return errors.New("Сет B4 изменён в другой вкладке. Обновите список и повторите действие")
	}
	return err
}

func (s *serverState) b4Connect(payload map[string]any) map[string]any {
	s.b4ControlMu.Lock()
	defer s.b4ControlMu.Unlock()
	s.b4Mu.Lock()
	defer s.b4Mu.Unlock()
	previous, err := s.loadB4Settings()
	if err != nil {
		return b4Error("Не удалось прочитать настройки B4")
	}
	next := b4Settings{URL: strings.TrimSpace(stringValue(payload["url"])), Username: strings.TrimSpace(stringValue(payload["username"])), Password: stringValue(payload["password"])}
	if next.URL == "" {
		next.URL = previous.URL
	}
	if previous.DirectEnabled && next.URL != previous.URL {
		return b4Error("Сначала отключите direct → B4 перед сменой адреса API")
	}
	next.DirectEnabled = previous.DirectEnabled
	if next.Password == "" && next.URL == previous.URL && next.Username == previous.Username {
		next.Password = previous.Password
	}
	if err := validateB4URL(next.URL); err != nil {
		return b4Error(err.Error())
	}
	if boolPayload(payload, "clearCredentials", false) {
		next.Username = ""
		next.Password = ""
	}
	token := ""
	// Do not bypass the backoff by repeatedly submitting the same rejected credentials.
	after := s.b4LoginAfter

	c := newB4Client(next, &token, &after, &s.b4LoginKey)
	defer c.close()
	var config map[string]any
	if err := c.call(http.MethodGet, "/config", nil, &config); err != nil {
		s.b4LoginAfter = after
		return b4Error(err.Error())
	}
	if _, ok := config["queue"]; !ok {
		if _, ok := config["version"]; !ok {
			return b4Error("Ответ не похож на конфигурацию B4")
		}
	}
	body, _ := json.MarshalIndent(next, "", "  ")
	if err := os.MkdirAll(s.cfg.DataDir, 0700); err != nil {
		return b4Error("Не удалось сохранить настройки B4")
	}
	if err := writeFileAtomic(filepath.Join(s.cfg.DataDir, "b4-api.json"), body, 0600); err != nil {
		return b4Error("Не удалось сохранить настройки B4")
	}
	s.b4Token = token
	s.b4LoginAfter = after
	s.clearB4Cache()
	return map[string]any{"ok": true, "message": "API B4 подключён"}
}

func b4Error(message string) map[string]any { return map[string]any{"ok": false, "message": message} }

func stringValue(value any) string { text, _ := value.(string); return text }

func strconvParseMark(value string) (uint32, error) {
	n, err := strconv.ParseUint(value, 0, 32)
	return uint32(n), err
}

func (s *serverState) b4APIAction(payload map[string]any) map[string]any {
	s.b4ControlMu.Lock()
	defer s.b4ControlMu.Unlock()
	s.b4Mu.Lock()
	defer s.b4Mu.Unlock()
	cfg, err := s.loadB4Settings()
	if err != nil {
		return b4Error("Не удалось прочитать настройки B4")
	}
	c := newB4Client(cfg, &s.b4Token, &s.b4LoginAfter, &s.b4LoginKey)
	defer c.close()
	action := stringValue(payload["action"])
	domain := b4Domain(stringValue(payload["domain"]))
	if action == "check-domain" {
		if domain == "" {
			return b4Error("Введите домен без схемы, порта или пути")
		}
		var matches []map[string]any
		if err := c.call(http.MethodGet, "/sets/check-domain?domain="+url.QueryEscape(domain), nil, &matches); err != nil {
			return b4Error(err.Error())
		}
		return map[string]any{"ok": true, "domain": domain, "matches": matches}
	}
	if action != "set-enabled" && action != "add-domain" {
		return b4Error("Неподдерживаемое действие API B4")
	}
	id := stringValue(payload["id"])
	if !b4SetIDValid(id) {
		return b4Error("Некорректный идентификатор сета B4")
	}
	var set map[string]any
	if err := c.call(http.MethodGet, "/sets/"+url.PathEscape(id), nil, &set); err != nil {
		return b4Error(err.Error())
	}
	revision := stringValue(payload["revision"])
	if revision == "" || stringValue(set["revision"]) == "" {
		return b4Error("Эта версия B4 не поддерживает защиту от одновременного редактирования; измените сет в админке B4")
	}
	if revision != stringValue(set["revision"]) {
		return b4Error("Сет B4 изменён в другой вкладке. Обновите список и повторите действие")
	}
	if action == "set-enabled" {
		set["enabled"] = boolPayload(payload, "enabled", false)
	} else {
		if domain == "" {
			return b4Error("Введите домен без схемы, порта или пути")
		}
		targets := mapValue(set["targets"])
		if targets == nil {
			targets = map[string]any{}
		}
		domains := anySlice(targets["sni_domains"])
		for _, entry := range domains {
			if strings.EqualFold(stringValue(entry), domain) {
				return map[string]any{"ok": true, "message": "Домен уже есть в сете"}
			}
		}
		targets["sni_domains"] = append(domains, domain)
		set["targets"] = targets
	}
	if boolPayload(set, "enabled", true) {
		var full map[string]any
		if err := c.call(http.MethodGet, "/config", nil, &full); err != nil {
			return b4Error(err.Error())
		}
		var sets []map[string]any
		if err := c.call(http.MethodGet, "/sets", nil, &sets); err != nil {
			return b4Error("Не удалось проверить остальные сеты B4")
		}
		for index, current := range sets {
			if stringValue(current["id"]) == id {
				sets[index] = set
			}
		}
		if issues := b4StartIssues(b4APISummarizeConfig(full), sets); len(issues) > 0 {
			return map[string]any{"ok": false, "message": "Изменение активного сета заблокировано: " + strings.Join(issues, " "), "issues": issues}
		}
		var frame map[string]any
		if err := c.call(http.MethodGet, "/metrics", nil, &frame); err != nil {
			return b4Error("Действующий движок B4 не проверен; активный сет не изменён")
		}
		engine := mapValue(frame["engine"])
		if stringValue(engine["mode"]) != "nfqueue" || stringValue(engine["firewall"]) != "external" {
			return b4Error("Действующий B4 ещё не использует внешнюю NFQUEUE; примените настройки и перезапустите B4")
		}
		nft := b4NFTStatus()
		iptables := b4IPTablesStatus()
		if boolMap(nft, "otherB4") || boolMap(nft, "foreignQueue") || boolMap(iptables, "hasNFQUEUE") {
			return b4Error("Остались другие правила B4/NFQUEUE; активный сет не изменён до очистки старого перехвата")
		}
	}
	// PUT with revision preserves every method/target and does not silently move
	// the domain out of other sets, unlike B4's add-domain endpoint.
	var reply map[string]any
	if err := c.call(http.MethodPut, "/sets/"+url.PathEscape(id), set, &reply); err != nil {
		return b4Error(err.Error())
	}
	s.clearB4Cache()
	return map[string]any{"ok": true, "message": "Сет B4 обновлён"}
}

func b4SetIDValid(id string) bool {
	if len(id) == 0 || len(id) > 128 {
		return false
	}
	for _, r := range id {
		if !(r >= 'a' && r <= 'z' || r >= 'A' && r <= 'Z' || r >= '0' && r <= '9' || r == '-' || r == '_') {
			return false
		}
	}
	return true
}

// The built-in B4 firewall queues outgoing and reply traffic, including DNS.
// Interface selection alone does not isolate Xray's direct outbound. Combined
// operation therefore requires externally owned, explicitly limited NFQUEUE.
func b4StartIssues(config map[string]any, sets []map[string]any) []string {
	issues := []string{}
	queue := mapValue(config["queue"])
	if stringValue(queue["mode"]) != "nfqueue" {
		issues = append(issues, "TUN B4 изменяет маршрутизацию; используйте NFQUEUE для совместной работы.")
	}
	if !boolMap(config, "skipSetup") {
		issues = append(issues, "Встроенный firewall B4 может захватить VPN и DNS. Нужны system.tables.skip_setup=true и отдельные NFQUEUE-правила только для direct-трафика.")
	}
	mark := uint32(b4IntFromAny(queue["mark"]))
	awgMark, _ := strconvParseMark(amneziaFwMark)
	legacyMark, _ := strconvParseMark(amneziaLegacyFwMark)
	if mark == 0 || mark&(awgMark|legacyMark|1|b4DirectMark) != 0 {
		issues = append(issues, "Packet mark B4 пересекается с метками Xray/AWG.")
	}
	for _, set := range sets {
		if !boolPayload(set, "enabled", true) {
			continue
		}
		if boolMap(mapValue(set["routing"]), "enabled") {
			issues = append(issues, "Сет «"+stringValue(set["name"])+"» включает маршрутизацию B4; отключите её в админке.")
		}
		if boolMap(mapValue(set["dns"]), "enabled") {
			issues = append(issues, "Сет «"+stringValue(set["name"])+"» меняет DNS; DNS должен оставаться у AdGuard/Xray.")
		}
	}
	return issues
}

func (s *serverState) b4ServiceStartIssues() []string {
	s.b4Mu.Lock()
	defer s.b4Mu.Unlock()
	cfg, err := s.loadB4Settings()
	if err != nil {
		return []string{"Настройки API B4 не прочитаны."}
	}
	c := newB4Client(cfg, &s.b4Token, &s.b4LoginAfter, &s.b4LoginKey)
	defer c.close()
	var full map[string]any
	if err = c.call(http.MethodGet, "/config", nil, &full); err != nil {
		// A stopped service has no API: check its persisted configuration instead.
		for _, path := range b4ConfigPaths() {
			body, readErr := os.ReadFile(path)
			if readErr == nil && json.Unmarshal(body, &full) == nil && full["queue"] != nil {
				break
			}
			full = nil
		}
	}
	if full == nil {
		return []string{"Не удалось проверить конфигурацию B4 до запуска. Подключите API или проверьте файл b4.json."}
	}
	var sets []map[string]any
	if err = c.call(http.MethodGet, "/sets", nil, &sets); err != nil {
		for _, item := range anySlice(full["sets"]) {
			set := mapValue(item)
			set["enabled"] = boolPayload(set, "enabled", true)
			sets = append(sets, set)
		}
	}
	return b4StartIssues(b4APISummarizeConfig(full), sets)
}

func b4Domain(value string) string {
	if strings.ContainsAny(value, ":/?!@#*") {
		return ""
	}
	return adGuardDomain(value)
}
