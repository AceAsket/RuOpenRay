package main

import (
	"fmt"
	"net"
	"net/http"
	"path/filepath"
	"strings"
	"time"

	rproxy "github.com/AceAsket/RuOpenRay/internal/proxy"
	rsubscription "github.com/AceAsket/RuOpenRay/internal/subscription"
)

func (s *serverState) subscriptionStorePath() string {
	return filepath.Join(s.cfg.DataDir, "subscriptions.json")
}

func (s *serverState) readSubscriptionStore() rsubscription.Store {
	return rsubscription.LoadStore(s.subscriptionStorePath())
}

func (s *serverState) writeSubscriptionStore(store rsubscription.Store) error {
	return rsubscription.SaveStore(s.subscriptionStorePath(), store)
}

func (s *serverState) subscriptionReport() map[string]any {
	store := s.readSubscriptionStore()
	return map[string]any{"ok": true, "pools": rsubscription.PublicPools(store)}
}

func (s *serverState) saveSubscriptionPool(w http.ResponseWriter, r *http.Request) {
	payload, _ := readJSON(r)
	tag := strings.TrimSpace(fmt.Sprint(payload["tag"]))
	if tag == "" || tag == "<nil>" {
		writeJSON(w, 400, map[string]any{"ok": false, "error": "Укажите стабильный outbound tag для подписки"})
		return
	}
	candidates := []map[string]any{}
	for _, item := range asArray(payload["outbounds"]) {
		if outbound, ok := item.(map[string]any); ok && fmt.Sprint(outbound["tag"]) != "" {
			candidates = append(candidates, outbound)
		}
	}
	if len(candidates) == 0 {
		writeJSON(w, 400, map[string]any{"ok": false, "error": "В подписке нет кандидатов для pool"})
		return
	}
	active := rsubscription.NormalizeActive(number(payload["active"], 0), len(candidates))
	pool := rsubscription.Pool{
		Tag:        tag,
		URL:        strings.TrimSpace(fmt.Sprint(payload["url"])),
		Active:     active,
		UpdatedAt:  time.Now().Format(time.RFC3339),
		Candidates: candidates,
	}
	store := rsubscription.UpsertPool(s.readSubscriptionStore(), pool)
	if err := s.writeSubscriptionStore(store); err != nil {
		writeJSON(w, 500, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true, "pool": rsubscription.PublicPool(pool)})
}

func (s *serverState) deleteSubscriptionPool(w http.ResponseWriter, r *http.Request) {
	payload, _ := readJSON(r)
	tag := strings.TrimSpace(fmt.Sprint(payload["tag"]))
	if tag == "" || tag == "<nil>" {
		writeJSON(w, 400, map[string]any{"ok": false, "error": "Укажите подписку для удаления"})
		return
	}
	store, removed := rsubscription.RemovePool(s.readSubscriptionStore(), tag)
	if !removed {
		writeJSON(w, 404, map[string]any{"ok": false, "error": "Подписка не найдена"})
		return
	}
	if err := s.writeSubscriptionStore(store); err != nil {
		writeJSON(w, 500, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true, "tag": tag})
}

func (s *serverState) fallbackSubscription(w http.ResponseWriter, r *http.Request) {
	payload, _ := readJSON(r)
	tag := strings.TrimSpace(fmt.Sprint(payload["tag"]))
	store := s.readSubscriptionStore()
	poolIndex := rsubscription.FindPoolIndex(store, tag)
	if poolIndex < 0 {
		writeJSON(w, 404, map[string]any{"ok": false, "error": "Subscription pool не найден"})
		return
	}
	pool := store.Pools[poolIndex]
	if len(pool.Candidates) == 0 {
		writeJSON(w, 400, map[string]any{"ok": false, "error": "В pool нет кандидатов"})
		return
	}
	checkMode := strings.ToLower(firstNonEmpty(fmt.Sprint(payload["mode"]), "http"))
	probeURL := firstNonEmpty(fmt.Sprint(payload["url"]), "https://www.gstatic.com/generate_204")
	timeoutMs := number(payload["timeoutMs"], 2500)
	attempts := number(payload["attempts"], 1)
	if timeoutMs < 300 {
		timeoutMs = 300
	}
	if timeoutMs > 15000 {
		timeoutMs = 15000
	}
	if attempts < 1 {
		attempts = 1
	}
	if attempts > 5 {
		attempts = 5
	}

	results := []map[string]any{}
	selected := -1
	for step := 1; step <= len(pool.Candidates); step++ {
		index := (pool.Active + step) % len(pool.Candidates)
		candidate := pool.Candidates[index]
		summary := rproxy.OutboundSummary(candidate)
		result := map[string]any{"index": index, "tag": summary["tag"], "address": summary["address"], "port": summary["port"]}
		ok := false
		var err error
		if checkMode == "endpoint" {
			address := fmt.Sprint(summary["address"])
			portValue := number(summary["port"], 0)
			started := time.Now()
			conn, dialErr := net.DialTimeout("tcp", net.JoinHostPort(address, fmt.Sprint(portValue)), time.Duration(timeoutMs)*time.Millisecond)
			if dialErr == nil {
				_ = conn.Close()
				ok = true
				result["latencyMs"] = time.Since(started).Milliseconds()
			} else {
				err = dialErr
			}
		} else {
			latency, httpOK, httpErr := s.httpOutboundProbe(candidate, probeURL, timeoutMs, attempts)
			ok = httpOK
			err = httpErr
			if latency > 0 {
				result["latencyMs"] = latency
			}
		}
		result["ok"] = ok
		if err != nil {
			result["error"] = err.Error()
		}
		results = append(results, result)
		if ok {
			selected = index
			break
		}
	}
	if selected < 0 {
		writeJSON(w, 200, map[string]any{"ok": false, "pool": rsubscription.PublicPool(pool), "results": results, "error": "Живой кандидат не найден"})
		return
	}

	cfg, err := s.readActiveConfig()
	if err != nil {
		writeJSON(w, 500, map[string]any{"ok": false, "error": err.Error(), "results": results})
		return
	}
	cfg["outbounds"] = rproxy.ReplaceOutboundByTag(asArray(cfg["outbounds"]), pool.Tag, rproxy.CloneOutboundWithTag(pool.Candidates[selected], pool.Tag))
	backup, _ := s.backupActive("subscription-fallback")
	if err := s.writeActiveConfig(cfg); err != nil {
		writeJSON(w, 500, map[string]any{"ok": false, "error": err.Error(), "backup": backup, "results": results})
		return
	}
	pool.Active = selected
	pool.UpdatedAt = time.Now().Format(time.RFC3339)
	store.Pools[poolIndex] = pool
	_ = s.writeSubscriptionStore(store)
	restart := map[string]any{"ok": true, "stdout": "Xray не перезапущен"}
	if boolPayload(payload, "restart", true) {
		restart = s.serviceAction("restart")
	}
	writeJSON(w, 200, map[string]any{"ok": restart["ok"], "pool": rsubscription.PublicPool(pool), "selected": rproxy.OutboundSummary(pool.Candidates[selected]), "results": results, "backup": backup, "restart": restart})
}

func (s *serverState) checkOutbounds(w http.ResponseWriter, r *http.Request) {
	payload, _ := readJSON(r)
	cfg, err := s.readActiveConfig()
	if err != nil {
		respond(w, nil, err)
		return
	}
	checkMode := strings.ToLower(firstNonEmpty(fmt.Sprint(payload["mode"]), "http"))
	if checkMode != "endpoint" && checkMode != "http" {
		checkMode = "http"
	}
	probeURL := firstNonEmpty(fmt.Sprint(payload["url"]), "https://www.gstatic.com/generate_204")
	timeoutMs := number(payload["timeoutMs"], 2500)
	if timeoutMs < 300 {
		timeoutMs = 300
	}
	if timeoutMs > 15000 {
		timeoutMs = 15000
	}
	attempts := number(payload["attempts"], 1)
	if attempts < 1 {
		attempts = 1
	}
	if attempts > 5 {
		attempts = 5
	}
	filter := map[string]bool{}
	for _, tag := range asArray(payload["tags"]) {
		filter[fmt.Sprint(tag)] = true
	}

	results := []map[string]any{}
	for _, item := range asArray(cfg["outbounds"]) {
		outbound, ok := item.(map[string]any)
		if !ok {
			continue
		}
		summary := rproxy.OutboundSummary(outbound)
		tag := fmt.Sprint(summary["tag"])
		if len(filter) > 0 && !filter[tag] {
			continue
		}
		protocol := fmt.Sprint(summary["protocol"])
		address := fmt.Sprint(summary["address"])
		portValue := number(summary["port"], 0)
		system := protocol == "freedom" || protocol == "blackhole" || protocol == "dns" || tag == "direct" || tag == "block" || tag == "dns-out"
		if system && len(filter) == 0 {
			continue
		}
		result := map[string]any{
			"tag": summary["tag"], "protocol": protocol, "address": address, "port": portValue,
			"network": summary["network"], "security": summary["security"], "checkedAt": time.Now().Format(time.RFC3339), "method": checkMode,
		}
		if system || address == "" || portValue <= 0 {
			result["ok"] = false
			result["skipped"] = true
			result["error"] = "Нет endpoint для проверки"
			results = append(results, result)
			continue
		}
		samples := attempts
		if samples < 2 {
			samples = 2
		}
		best := int64(0)
		checkOK := false
		var lastErr error
		for attempt := 0; attempt < samples; attempt++ {
			started := time.Now()
			conn, err := net.DialTimeout("tcp", net.JoinHostPort(address, fmt.Sprint(portValue)), time.Duration(timeoutMs)*time.Millisecond)
			latency := time.Since(started).Milliseconds()
			if err == nil {
				_ = conn.Close()
				if best == 0 || latency < best {
					best = latency
				}
				checkOK = true
				lastErr = nil
				continue
			}
			lastErr = err
		}
		if best > 0 {
			result["endpointLatencyMs"] = best
		}
		result["endpointOk"] = checkOK
		if checkMode == "endpoint" {
			result["ok"] = checkOK
			if best > 0 {
				result["latencyMs"] = best
			}
			if !checkOK && lastErr != nil {
				result["error"] = lastErr.Error()
			}
			results = append(results, result)
			continue
		}
		httpBest, httpOK, httpErr := s.httpOutboundProbe(outbound, probeURL, timeoutMs, attempts)
		result["url"] = probeURL
		result["httpOk"] = httpOK
		result["ok"] = httpOK
		if httpBest > 0 {
			result["httpLatencyMs"] = httpBest
			result["latencyMs"] = httpBest
		}
		if !httpOK {
			if httpErr != nil {
				result["error"] = httpErr.Error()
			} else if lastErr != nil {
				result["error"] = lastErr.Error()
			} else {
				result["error"] = "HTTP probe failed"
			}
		}
		results = append(results, result)
	}
	writeJSON(w, 200, map[string]any{"ok": true, "timeoutMs": timeoutMs, "attempts": attempts, "mode": checkMode, "url": probeURL, "results": results})
}
