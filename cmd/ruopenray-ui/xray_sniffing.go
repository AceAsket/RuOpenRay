package main

import (
	"encoding/json"
	"fmt"
	"strings"
)

// Newer Xray versions treat unprefixed exclusions as substring matchers. An
// empty string then excludes every domain, disabling domain-based routing.
// Preserve all nonempty matchers and invalid values for normal validation.
func normalizeSniffingDomainExclusions(cfg map[string]any) int {
	removed := 0
	for _, item := range asArray(cfg["inbounds"]) {
		inbound, _ := item.(map[string]any)
		sniffing, _ := inbound["sniffing"].(map[string]any)
		var values []any
		switch raw := sniffing["domainsExcluded"].(type) {
		case []any:
			values = raw
		case []string:
			for _, value := range raw {
				values = append(values, value)
			}
		default:
			continue
		}
		kept := make([]any, 0, len(values))
		for _, value := range values {
			if text, ok := value.(string); ok && strings.TrimSpace(text) == "" {
				continue
			}
			kept = append(kept, value)
		}
		if len(kept) == len(values) {
			continue
		}
		removed += len(values) - len(kept)
		if len(kept) == 0 {
			delete(sniffing, "domainsExcluded")
		} else {
			sniffing["domainsExcluded"] = kept
		}
	}
	return removed
}

func validateCoreUpdateSniffingConfig(body []byte) error {
	var cfg map[string]any
	if err := json.Unmarshal(body, &cfg); err != nil {
		return fmt.Errorf("не удалось прочитать текущую конфигурацию: %w", err)
	}
	if normalizeSniffingDomainExclusions(cfg) > 0 {
		return fmt.Errorf("в domainsExcluded сниффера есть пустые строки: новое ядро может исключить все домены из маршрутизации; сначала проверьте и примените конфигурацию в RuOpenRay — пустые исключения будут удалены")
	}
	return nil
}
