package main

import (
	"fmt"
	"testing"
	"time"
)

func TestOutboundCheckResultsKeepLastPerTag(t *testing.T) {
	state := &serverState{cfg: appConfig{DataDir: t.TempDir()}}
	if err := state.saveOutboundCheckResults([]map[string]any{
		{"tag": "one", "ok": false, "latencyMs": 100, "checkedAt": "2026-05-24T10:00:00Z"},
	}); err != nil {
		t.Fatalf("save first result: %v", err)
	}
	if err := state.saveOutboundCheckResults([]map[string]any{
		{"tag": "one", "ok": true, "latencyMs": 25, "checkedAt": "2026-05-24T10:01:00Z"},
		{"tag": "two", "ok": true, "latencyMs": 50, "checkedAt": "2026-05-24T10:02:00Z"},
	}); err != nil {
		t.Fatalf("save second result: %v", err)
	}

	results := state.readOutboundCheckResults()
	if len(results) != 2 {
		t.Fatalf("expected 2 stored results, got %d", len(results))
	}
	if results["one"]["ok"] != true {
		t.Fatalf("expected latest one result to win, got %#v", results["one"])
	}
	if got := int(results["one"]["latencyMs"].(float64)); got != 25 {
		t.Fatalf("unexpected latency for one: %d", got)
	}
}

func TestOutboundCheckResultsAreCompact(t *testing.T) {
	state := &serverState{cfg: appConfig{DataDir: t.TempDir()}}
	if err := state.saveOutboundCheckResults([]map[string]any{
		{
			"tag":       "one",
			"ok":        true,
			"checkedAt": "2026-05-24T10:00:00Z",
			"ping":      map[string]any{"stdout": "large ping output"},
		},
	}); err != nil {
		t.Fatalf("save result: %v", err)
	}
	results := state.readOutboundCheckResults()
	if _, ok := results["one"]["ping"]; ok {
		t.Fatalf("stored result should not keep verbose ping output: %#v", results["one"])
	}
}

func TestLimitOutboundCheckResults(t *testing.T) {
	items := map[string]map[string]any{}
	base := time.Date(2026, 5, 24, 10, 0, 0, 0, time.UTC)
	for i := 0; i < 70; i++ {
		tag := fmt.Sprintf("tag-%02d", i)
		items[tag] = map[string]any{"tag": tag, "checkedAt": base.Add(time.Duration(i) * time.Minute).Format(time.RFC3339)}
	}

	limited := limitOutboundCheckResults(items, 64)
	if len(limited) != 64 {
		t.Fatalf("expected 64 items, got %d", len(limited))
	}
	if _, ok := limited["tag-00"]; ok {
		t.Fatalf("oldest item was not trimmed")
	}
	if _, ok := limited["tag-69"]; !ok {
		t.Fatalf("newest item was trimmed")
	}
}
