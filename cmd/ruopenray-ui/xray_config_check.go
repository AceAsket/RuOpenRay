package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

func (s *serverState) validateConfig(cfg map[string]any) map[string]any {
	if cfg == nil {
		var err error
		cfg, err = s.readActiveConfig()
		if err != nil {
			return map[string]any{"ok": false, "stderr": err.Error()}
		}
	}
	if runtime.GOOS == "windows" {
		return map[string]any{"ok": true, "stdout": "dev-mode: JSON корректен; бинарник xray на Windows не проверялся"}
	}
	body, _ := json.MarshalIndent(cfg, "", "  ")
	tmp := filepath.Join(s.cfg.DataDir, fmt.Sprintf(".test-%d.json", time.Now().UnixNano()))
	if err := os.WriteFile(tmp, body, 0o600); err != nil {
		return map[string]any{"ok": false, "stderr": err.Error()}
	}
	defer os.Remove(tmp)
	return s.runXray("run", "-test", "-config", tmp)
}

func (s *serverState) analyzeConfig(cfg map[string]any) map[string]any {
	if cfg == nil {
		var err error
		cfg, err = s.readActiveConfig()
		if err != nil {
			return map[string]any{"ok": false, "errors": []string{err.Error()}}
		}
	}
	outbounds := map[string]map[string]any{}
	for _, item := range asArray(cfg["outbounds"]) {
		if outbound, ok := item.(map[string]any); ok {
			tag := strings.TrimSpace(fmt.Sprint(outbound["tag"]))
			if tag != "" && tag != "<nil>" {
				outbounds[tag] = outbound
			}
		}
	}
	apiTags := map[string]bool{}
	if api, ok := cfg["api"].(map[string]any); ok {
		if tag := strings.TrimSpace(fmt.Sprint(api["tag"])); tag != "" && tag != "<nil>" {
			apiTags[tag] = true
		}
	}
	warnings := []string{}
	errors := []string{}
	info := []string{}
	counts := map[string]int{"proxy": 0, "direct": 0, "block": 0, "other": 0, "total": 0}
	geoipPath := filepath.Join(s.cfg.GeoDir, "geoip.dat")
	geositePath := filepath.Join(s.cfg.GeoDir, "geosite.dat")
	routing, _ := cfg["routing"].(map[string]any)
	balancers := map[string]bool{}
	rawBalancers := asArray(routing["balancers"])
	observatory, _ := cfg["observatory"].(map[string]any)
	observatorySelectors := map[string]bool{}
	for _, item := range asArray(observatory["subjectSelector"]) {
		selector := strings.TrimSpace(fmt.Sprint(item))
		if selector != "" && selector != "<nil>" {
			observatorySelectors[selector] = true
		}
	}
	burstObservatory, _ := cfg["burstObservatory"].(map[string]any)
	burstObservatorySelectors := map[string]bool{}
	for _, item := range asArray(burstObservatory["subjectSelector"]) {
		selector := strings.TrimSpace(fmt.Sprint(item))
		if selector != "" && selector != "<nil>" {
			burstObservatorySelectors[selector] = true
		}
	}
	for index, item := range rawBalancers {
		if balancer, ok := item.(map[string]any); ok {
			tag := strings.TrimSpace(fmt.Sprint(balancer["tag"]))
			if tag != "" && tag != "<nil>" {
				balancers[tag] = true
			}
			strategy := "random"
			if strategyMap, ok := balancer["strategy"].(map[string]any); ok {
				strategy = strings.TrimSpace(fmt.Sprint(strategyMap["type"]))
			}
			if strategy == "leastPing" || strategy == "leastLoad" {
				requiredSelectors := observatorySelectors
				requiredName := "observatory.subjectSelector"
				if strategy == "leastLoad" {
					requiredSelectors = burstObservatorySelectors
					requiredName = "burstObservatory.subjectSelector"
				}
				hasSelector := false
				for _, selector := range asArray(balancer["selector"]) {
					if requiredSelectors[strings.TrimSpace(fmt.Sprint(selector))] {
						hasSelector = true
						break
					}
				}
				if !hasSelector {
					warnings = append(warnings, fmt.Sprintf("Балансировщик %d: strategy %s требует %s", index+1, strategy, requiredName))
				}
			}
		}
	}
	for index, item := range asArray(routing["rules"]) {
		rule, ok := item.(map[string]any)
		if !ok {
			continue
		}
		counts["total"]++
		tag := strings.TrimSpace(fmt.Sprint(rule["outboundTag"]))
		if tag == "<nil>" {
			tag = ""
		}
		balancerTag := strings.TrimSpace(fmt.Sprint(rule["balancerTag"]))
		if balancerTag == "<nil>" {
			balancerTag = ""
		}
		if tag != "" && balancerTag != "" {
			errors = append(errors, fmt.Sprintf("Правило %d: укажите outboundTag или balancerTag, но не оба сразу", index+1))
		} else if tag == "" && balancerTag == "" {
			warnings = append(warnings, fmt.Sprintf("Правило %d: не указан outboundTag или balancerTag", index+1))
		} else if balancerTag != "" && !balancers[balancerTag] {
			errors = append(errors, fmt.Sprintf("Правило %d: balancerTag %q не найден в routing.balancers", index+1, balancerTag))
		} else if tag != "" {
			if _, exists := outbounds[tag]; !exists && !apiTags[tag] {
				errors = append(errors, fmt.Sprintf("Правило %d: outboundTag %q не найден в outbounds", index+1, tag))
			}
		}
		switch {
		case balancerTag != "":
			counts["proxy"]++
		case tag == "direct":
			counts["direct"]++
		case tag == "block":
			counts["block"]++
		default:
			if outbound, exists := outbounds[tag]; exists && !isSystemOutbound(outbound) {
				counts["proxy"]++
			} else {
				counts["other"]++
			}
		}
		if fmt.Sprint(rule["port"]) == "0-65535" && len(asArray(rule["domain"])) == 0 && len(asArray(rule["ip"])) == 0 && len(asArray(rule["source"])) == 0 {
			target := firstNonEmpty(tag, "не задано")
			if balancerTag != "" {
				target = "balancer:" + balancerTag
			}
			info = append(info, fmt.Sprintf("Правило %d: default/catch-all идет в %s", index+1, target))
		}
		for _, value := range asArray(rule["domain"]) {
			domain := strings.TrimSpace(fmt.Sprint(value))
			if strings.HasPrefix(domain, "geosite:") && !fileExists(geositePath) {
				warnings = append(warnings, fmt.Sprintf("Правило %d: geosite требует %s", index+1, geositePath))
			}
			if strings.HasPrefix(domain, "ext:") {
				file := extDatFile(domain)
				if file == "" {
					warnings = append(warnings, fmt.Sprintf("Правило %d: ext-список указан без имени .dat файла", index+1))
				} else if !fileExists(filepath.Join(s.cfg.GeoDir, file)) {
					warnings = append(warnings, fmt.Sprintf("Правило %d: ext-списку нужен %s", index+1, filepath.Join(s.cfg.GeoDir, file)))
				}
			}
		}
		for _, value := range asArray(rule["ip"]) {
			ip := strings.TrimSpace(fmt.Sprint(value))
			if strings.HasPrefix(ip, "geoip:") && !fileExists(geoipPath) {
				warnings = append(warnings, fmt.Sprintf("Правило %d: geoip требует %s", index+1, geoipPath))
			}
		}
	}
	return map[string]any{"ok": len(errors) == 0, "errors": errors, "warnings": warnings, "info": info, "counts": counts}
}
