package main

import (
	"context"
	"errors"
	"fmt"
	"math"
	"reflect"
	"strings"
	"sync"
	"time"

	"github.com/AceAsket/RuOpenRay/internal/dnsconfig"
)

func adGuardGeneralUpstreams(upstreams []string) []string {
	result := []string{}
	for _, value := range upstreams {
		value = strings.TrimSpace(value)
		if value != "" && !strings.HasPrefix(value, "[/") && !strings.HasPrefix(value, "#") {
			result = append(result, value)
		}
	}
	return result
}

func adGuardValidateUpstreams(payload map[string]any) ([]string, error) {
	switch values := payload["upstreams"].(type) {
	case []string:
	case []any:
		for _, value := range values {
			if _, ok := value.(string); !ok {
				return nil, errors.New("DoH-серверы должны быть списком строк")
			}
		}
	default:
		return nil, errors.New("DoH-серверы должны быть списком строк")
	}
	values := stringSlice(payload["upstreams"])
	if len(values) == 0 || len(values) > 8 {
		return nil, errors.New("Укажите от 1 до 8 DoH-серверов")
	}
	result := []string{}
	seen := map[string]bool{}
	for _, value := range values {
		value = strings.TrimSpace(value)
		if len(value) > 1024 || strings.HasPrefix(value, "[/") || !adGuardDirectDoH([]string{value}, nil) {
			return nil, errors.New("Укажите HTTPS URL с публичным IP, например https://1.1.1.1/dns-query. Такой DoH не требует DNS для запуска; доменные маршруты сохраняются отдельно")
		}
		key := adGuardDoHURLKey(value)
		if seen[key] {
			return nil, errors.New("DoH-сервер повторяется в списке")
		}
		seen[key] = true
		result = append(result, value)
	}
	return result, nil
}

func adGuardBenchmark(upstreams []string) map[string]any {
	ctx, cancel := context.WithTimeout(context.Background(), 28*time.Second)
	defer cancel()
	results := make([]dnsconfig.DoHBenchmark, len(upstreams))
	var wg sync.WaitGroup
	limit := make(chan struct{}, 3)
	for index, upstream := range upstreams {
		wg.Add(1)
		go func(index int, upstream string) {
			defer wg.Done()
			limit <- struct{}{}
			defer func() { <-limit }()
			results[index] = dnsconfig.BenchmarkDoH(ctx, upstream)
		}(index, upstream)
	}
	wg.Wait()
	return map[string]any{"ok": true, "results": results, "checkedAt": time.Now().UTC().Format(time.RFC3339), "route": "router-https"}
}

// Statistics are historical and may include a resolver no longer configured.
func adGuardUpstreamStatistics(stats map[string]any) []map[string]any {
	rows := map[string]map[string]any{}
	for _, field := range []struct{ source, target string }{{"top_upstreams_avg_time", "averageMs"}, {"top_upstreams_responses", "responses"}} {
		for _, item := range anySlice(stats[field.source]) {
			for address, raw := range mapValue(item) {
				value, ok := raw.(float64)
				if !ok || value < 0 || math.IsNaN(value) || math.IsInf(value, 0) {
					continue
				}
				key := adGuardDoHURLKey(address)
				if rows[key] == nil {
					rows[key] = map[string]any{"url": address}
				}
				if field.target == "averageMs" {
					value *= 1000
				}
				rows[key][field.target] = value
			}
		}
	}
	keys := map[string]bool{}
	for key := range rows {
		keys[key] = true
	}
	result := []map[string]any{}
	for _, key := range sortedAdGuardKeys(keys) {
		result = append(result, rows[key])
	}
	return result
}

func adGuardSaveUpstreams(cfg adGuardSettings, payload map[string]any) (map[string]any, error) {
	candidates, err := adGuardValidateUpstreams(payload)
	if err != nil {
		return nil, err
	}
	var current map[string]any
	if err := adGuardCall(cfg, "dns_info", nil, &current); err != nil {
		return nil, err
	}
	if file, _ := current["upstream_dns_file"].(string); strings.TrimSpace(file) != "" {
		return nil, errors.New("Upstream читаются из файла AdGuard; редактирование через панель недоступно")
	}
	previous := stringSlice(current["upstream_dns"])
	if _, ok := payload["baseUpstreams"]; !ok || !reflect.DeepEqual(previous, stringSlice(payload["baseUpstreams"])) {
		return nil, errors.New("DNS AdGuard изменился после загрузки формы. Обновите список и повторите сохранение")
	}
	var probes map[string]string
	if err := adGuardCall(cfg, "test_upstream_dns", map[string]any{"upstream_dns": candidates}, &probes); err != nil {
		return nil, fmt.Errorf("Проверка AdGuard не завершена; настройки не изменены: %w", err)
	}
	for _, candidate := range candidates {
		ready := false
		for tested, status := range probes {
			if adGuardDoHURLKey(candidate) == adGuardDoHURLKey(tested) && status == "OK" {
				ready = true
			}
		}
		if !ready {
			return nil, fmt.Errorf("DoH %s не прошёл проверку AdGuard; настройки не изменены", candidate)
		}
	}
	// Re-read after the network test to catch edits in the native dashboard.
	if err := adGuardCall(cfg, "dns_info", nil, &current); err != nil {
		return nil, err
	}
	if !reflect.DeepEqual(previous, stringSlice(current["upstream_dns"])) || current["upstream_dns_file"] != "" && current["upstream_dns_file"] != nil {
		return nil, errors.New("DNS AdGuard изменился во время проверки. Обновите список; настройки не изменены")
	}
	next := append([]string{}, candidates...)
	for _, value := range previous {
		trimmed := strings.TrimSpace(value)
		if strings.HasPrefix(trimmed, "[/") || strings.HasPrefix(trimmed, "#") {
			next = append(next, value)
		}
	}
	if reflect.DeepEqual(previous, next) {
		return map[string]any{"ok": true, "upstreams": candidates, "unchanged": true}, nil
	}
	err = adGuardCall(cfg, "dns_config", map[string]any{"upstream_dns": next}, nil)
	var actual map[string]any
	readErr := adGuardCall(cfg, "dns_info", nil, &actual)
	if err == nil && readErr == nil && reflect.DeepEqual(next, stringSlice(actual["upstream_dns"])) {
		return map[string]any{"ok": true, "upstreams": candidates}, nil
	}
	// A lost response may mean the write succeeded. Restore only our generation,
	// never overwrite a third-party edit made in the native AdGuard dashboard.
	if readErr == nil && reflect.DeepEqual(previous, stringSlice(actual["upstream_dns"])) {
		return nil, errors.New("AdGuard не сохранил DoH; прежние настройки сохранены")
	}
	if readErr == nil && reflect.DeepEqual(next, stringSlice(actual["upstream_dns"])) {
		rollback := adGuardCall(cfg, "dns_config", map[string]any{"upstream_dns": previous}, nil)
		var restored map[string]any
		verify := adGuardCall(cfg, "dns_info", nil, &restored)
		if rollback == nil && verify == nil && reflect.DeepEqual(previous, stringSlice(restored["upstream_dns"])) {
			return nil, errors.New("Не удалось подтвердить сохранение DoH; прежний список восстановлен")
		}
	}
	return nil, errors.New("Не удалось подтвердить DNS AdGuard или восстановить список. Проверьте upstream в админке AdGuard Home")
}
