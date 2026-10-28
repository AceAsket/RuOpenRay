package main

import (
	"errors"
	"fmt"
	"net"
	"net/url"
	"strings"
	"time"
)

func adGuardFilterCatalog() []map[string]any {
	return []map[string]any{
		{"name": "AdGuard DNS filter", "url": "https://adguardteam.github.io/AdGuardSDNSFilter/Filters/filter.txt"},
		{"name": "AdGuard DNS Popup Hosts filter", "url": "https://adguardteam.github.io/AdGuardSDNSFilter/Filters/adguard_popup_filter.txt"},
		{"name": "HaGeZi Multi NORMAL", "url": "https://raw.githubusercontent.com/hagezi/dns-blocklists/main/adblock/multi.txt"},
	}
}

func adGuardFilterLists(status map[string]any) []map[string]any {
	result := []map[string]any{}
	for _, item := range anySlice(status["filters"]) {
		filter := mapValue(item)
		result = append(result, map[string]any{"id": filter["id"], "name": filter["name"], "url": filter["url"],
			"enabled": filter["enabled"] == true, "rules": filter["rules_count"], "updatedAt": filter["last_updated"]})
	}
	return result
}

func validateAdGuardFilterURL(value string) error {
	u, err := url.Parse(value)
	if err != nil || u.Scheme != "https" || u.Hostname() == "" || u.User != nil || u.Fragment != "" || len(value) > 2048 {
		return errors.New("Укажите HTTPS URL списка без логина, пароля и фрагмента")
	}
	host := strings.ToLower(strings.TrimSuffix(u.Hostname(), "."))
	if host == "localhost" || strings.HasSuffix(host, ".localhost") || strings.HasSuffix(host, ".local") || !strings.Contains(host, ".") {
		return errors.New("Для списка нужен публичный адрес")
	}
	if ip := net.ParseIP(host); ip != nil && (!ip.IsGlobalUnicast() || ip.IsPrivate() || ip.IsLoopback() || ip.IsLinkLocalUnicast()) {
		return errors.New("Для списка нужен публичный адрес")
	}
	return nil
}

// This changes only the explicitly selected blocklist; allowlists, user rules,
// DNS upstreams and integration-owned VPN exceptions remain untouched.
func adGuardFilterAction(cfg adGuardSettings, payload map[string]any) (map[string]any, error) {
	action, _ := payload["action"].(string)
	var before map[string]any
	if err := adGuardCall(cfg, "filtering/status", nil, &before); err != nil {
		return nil, err
	}
	if action == "filter-refresh" {
		var result map[string]any
		if err := adGuardCallTimeout(cfg, "filtering/refresh", map[string]any{"whitelist": false}, &result, 45*time.Second); err != nil {
			return nil, err
		}
		return map[string]any{"ok": true, "updated": result["updated"]}, nil
	}
	address, _ := payload["url"].(string)
	address = strings.TrimSpace(address)
	var existing map[string]any
	for _, item := range anySlice(before["filters"]) {
		if filter := mapValue(item); filter["url"] == address {
			existing = filter
			break
		}
	}
	path := ""
	var request map[string]any
	switch action {
	case "filter-add":
		if err := validateAdGuardFilterURL(address); err != nil {
			return nil, err
		}
		name, _ := payload["name"].(string)
		name = strings.TrimSpace(name)
		if name == "" || len([]rune(name)) > 120 || strings.ContainsAny(name, "\r\n\x00") {
			return nil, errors.New("Название списка должно содержать от 1 до 120 символов без переносов строк")
		}
		if existing != nil {
			return nil, errors.New("Этот список уже добавлен; измените его состояние в таблице")
		}
		path, request = "filtering/add_url", map[string]any{"name": name, "url": address, "whitelist": false}
	case "filter-set":
		if existing == nil {
			return nil, errors.New("Список уже изменён или удалён; обновите статус")
		}
		enabled, ok := payload["enabled"].(bool)
		if !ok {
			return nil, errors.New("Укажите enabled: true или false")
		}
		// Never rename or replace the URL while toggling a list.
		path, request = "filtering/set_url", map[string]any{"url": address, "whitelist": false,
			"data": map[string]any{"name": existing["name"], "url": address, "enabled": enabled}}
	case "filter-remove":
		if existing == nil {
			return nil, errors.New("Список уже удалён; обновите статус")
		}
		path, request = "filtering/remove_url", map[string]any{"url": address, "whitelist": false}
	default:
		return nil, errors.New("Неизвестная операция со списком фильтрации")
	}
	if err := adGuardCallTimeout(cfg, path, request, nil, 45*time.Second); err != nil {
		// Do not retry a mutation after an ambiguous timeout.
		return nil, fmt.Errorf("%w; обновите статус перед повторной попыткой", err)
	}
	return map[string]any{"ok": true}, nil
}
