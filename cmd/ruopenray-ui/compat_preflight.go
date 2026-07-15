package main

import (
	"fmt"
	"strings"
)

const firewallCompatibilityConfirmKey = "compatConfirmed"

func (s *serverState) firewallCompatibilityPreflight(payload map[string]any, meta map[string]any) map[string]any {
	return firewallCompatibilityPreflightFromStatuses(payload, meta, s.cachedB4Status())
}

func firewallCompatibilityPreflightFromStatuses(payload map[string]any, meta map[string]any, b4 map[string]any) map[string]any {
	issues := []map[string]any{}
	routerMode := strings.TrimSpace(fmt.Sprint(meta["routerMode"]))
	if routerMode == "" || routerMode == "<nil>" {
		routerMode = "unknown"
	}
	dnsIntercept := boolPayload(payload, "dnsIntercept", false)
	if value, ok := meta["dnsIntercept"].(bool); ok {
		dnsIntercept = value
	}
	if b4 != nil && b4["active"] == true {
		severity := "warn"
		detail := "B4 уже может использовать NFQUEUE/firewall для DPI-обхода. Перед параллельной работой нужно понимать, кто владеет LAN-перехватом."
		if nft, ok := b4["nft"].(map[string]any); ok && boolMap(nft, "hasDNSRedirect") {
			detail += " Найдены признаки DNS redirect/NFQUEUE."
		}
		if routing, ok := b4["routing"].(map[string]any); ok && (boolMap(routing, "ipRule") || boolMap(routing, "route")) {
			detail += " Найдены policy routing правила B4."
			if boolMap(routing, "markConflict") {
				detail += fmt.Sprintf(" Обнаружен прямой конфликт fwmark %s с RuOpenRay AWG; параллельный запуск небезопасен до смены mark.", amneziaFwMark)
				severity = "danger"
			}
		}
		if api, ok := b4["api"].(map[string]any); ok {
			if config, ok := api["config"].(map[string]any); ok && fmt.Sprint(config["queueScope"]) == "all" {
				detail += " Пустой список interfaces в B4 означает NFQUEUE на всех интерфейсах; исключите LAN ingress RuOpenRay или задайте явный список до совместного запуска."
				severity = "danger"
			}
		}
		issues = append(issues, compatibilityIssue("b4", severity, "B4 активен", detail))
	} else if b4 != nil {
		nft, _ := b4["nft"].(map[string]any)
		iptables, _ := b4["iptables"].(map[string]any)
		service, _ := b4["service"].(map[string]any)
		if boolMap(service, "enabled") {
			issues = append(issues, compatibilityIssue("b4", "warn", "B4 включен в автозапуск", "Сейчас активных правил B4 не видно, но после перезагрузки сервис может поднять NFQUEUE/firewall рядом с RuOpenRay. Если RuOpenRay должен быть главным, отключите автозапуск B4."))
		}
		if boolMap(nft, "hasQueue") || boolMap(iptables, "hasNFQUEUE") {
			issues = append(issues, compatibilityIssue("b4", "warn", "Найдены NFQUEUE-правила", "На роутере есть NFQUEUE-правила без явно активного B4. Проверьте, не обрабатывает ли другой сервис те же LAN-пакеты."))
		}
	}
	if dnsIntercept && len(issues) > 0 {
		issues = append(issues, compatibilityIssue("dns", "warn", "DNS-перехват RuOpenRay", "Вы включаете DNS-перехват вместе с найденными сторонними правилами. Это безопасно только если DNS-путь заранее разведен."))
	}
	summary := "Конфликтов совместимости не найдено"
	if len(issues) > 0 {
		summary = "Найдены сторонние правила перехвата. Нужно подтверждение перед применением firewall."
	}
	return map[string]any{
		"ok":                   len(issues) == 0,
		"requiresConfirmation": len(issues) > 0,
		"summary":              summary,
		"routerMode":           routerMode,
		"dnsIntercept":         dnsIntercept,
		"issues":               issues,
		"b4":                   b4,
	}
}

func compatibilityIssue(source, severity, title, detail string) map[string]any {
	return map[string]any{
		"source":   source,
		"severity": severity,
		"title":    title,
		"detail":   detail,
	}
}
