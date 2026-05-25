package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

const maxStoredOutboundChecks = 64

type outboundCheckResultsStore struct {
	UpdatedAt string                    `json:"updatedAt"`
	Results   map[string]map[string]any `json:"results"`
}

func (s *serverState) outboundCheckResultsPath() string {
	return filepath.Join(s.cfg.DataDir, "checks", "results.json")
}

func (s *serverState) readOutboundCheckResults() map[string]map[string]any {
	body, err := os.ReadFile(s.outboundCheckResultsPath())
	if err != nil {
		return map[string]map[string]any{}
	}
	var store outboundCheckResultsStore
	if err := json.Unmarshal(body, &store); err != nil || store.Results == nil {
		return map[string]map[string]any{}
	}
	return store.Results
}

func (s *serverState) saveOutboundCheckResults(results []map[string]any) error {
	if len(results) == 0 {
		return nil
	}
	dir := filepath.Dir(s.outboundCheckResultsPath())
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return err
	}
	current := s.readOutboundCheckResults()
	for _, result := range results {
		tag := stringsTrim(result["tag"])
		if tag == "" {
			continue
		}
		if stringsTrim(result["checkedAt"]) == "" {
			result["checkedAt"] = time.Now().Format(time.RFC3339)
		}
		current[tag] = sanitizeOutboundCheckResult(result)
	}
	current = limitOutboundCheckResults(current, maxStoredOutboundChecks)
	store := outboundCheckResultsStore{
		UpdatedAt: time.Now().Format(time.RFC3339),
		Results:   current,
	}
	body, err := json.MarshalIndent(store, "", "  ")
	if err != nil {
		return err
	}
	tmp, err := os.CreateTemp(dir, ".results-*.json")
	if err != nil {
		return err
	}
	tmpPath := tmp.Name()
	if _, err := tmp.Write(body); err != nil {
		_ = tmp.Close()
		_ = os.Remove(tmpPath)
		return err
	}
	if err := tmp.Close(); err != nil {
		_ = os.Remove(tmpPath)
		return err
	}
	if err := os.Chmod(tmpPath, 0o600); err != nil {
		_ = os.Remove(tmpPath)
		return err
	}
	if err := os.Rename(tmpPath, s.outboundCheckResultsPath()); err != nil {
		_ = os.Remove(tmpPath)
		return err
	}
	return nil
}

func limitOutboundCheckResults(items map[string]map[string]any, limit int) map[string]map[string]any {
	if limit <= 0 || len(items) <= limit {
		return items
	}
	type checkItem struct {
		tag string
		at  time.Time
	}
	ordered := make([]checkItem, 0, len(items))
	for tag, item := range items {
		at, _ := time.Parse(time.RFC3339, stringsTrim(item["checkedAt"]))
		ordered = append(ordered, checkItem{tag: tag, at: at})
	}
	sort.Slice(ordered, func(i, j int) bool {
		return ordered[i].at.After(ordered[j].at)
	})
	next := map[string]map[string]any{}
	for index, item := range ordered {
		if index >= limit {
			break
		}
		next[item.tag] = items[item.tag]
	}
	return next
}

func sanitizeOutboundCheckResult(result map[string]any) map[string]any {
	allowed := []string{
		"tag", "ok", "skipped", "error", "method", "url", "checkedAt",
		"latencyMs", "httpLatencyMs", "endpointLatencyMs", "pingLatencyMs",
		"httpOk", "endpointOk", "pingOk",
		"protocol", "address", "port", "network", "security",
	}
	clean := map[string]any{}
	for _, key := range allowed {
		if value, ok := result[key]; ok {
			clean[key] = value
		}
	}
	return clean
}

func stringsTrim(value any) string {
	return strings.TrimSpace(fmt.Sprint(value))
}
