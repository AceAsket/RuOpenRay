package main

import (
	"encoding/json"
	"os"
	"testing"
)

func TestSubscriptionScheduleDefaults(t *testing.T) {
	state := &serverState{cfg: appConfig{DataDir: t.TempDir()}}
	schedule := state.subscriptionSchedule()
	if schedule["enabled"] != false {
		t.Fatalf("schedule should be disabled by default: %#v", schedule)
	}
	if schedule["time"] != "04:10" {
		t.Fatalf("unexpected default subscription update time: %#v", schedule["time"])
	}
}

func TestSubscriptionScheduleCleansSavedTime(t *testing.T) {
	state := &serverState{cfg: appConfig{DataDir: t.TempDir()}}
	body, _ := json.Marshal(map[string]any{"enabled": true, "time": "99:99", "lastRunAt": "2026-06-05T10:00:00Z"})
	if err := os.WriteFile(state.subscriptionSchedulePath(), body, 0o600); err != nil {
		t.Fatalf("write schedule: %v", err)
	}
	schedule := state.subscriptionSchedule()
	if schedule["enabled"] != true {
		t.Fatalf("schedule should stay enabled: %#v", schedule)
	}
	if schedule["time"] != "04:20" {
		t.Fatalf("invalid time was not normalized: %#v", schedule["time"])
	}
}

func TestRefreshAllSubscriptionsRecordsEmptyRun(t *testing.T) {
	state := &serverState{cfg: appConfig{DataDir: t.TempDir()}}
	result := state.refreshAllSubscriptionsAndRecord(false, false)
	if result["ok"] != true {
		t.Fatalf("empty subscription refresh should be ok: %#v", result)
	}
	if result["total"] != 0 {
		t.Fatalf("empty subscription refresh should have zero total: %#v", result["total"])
	}
	schedule := state.subscriptionSchedule()
	if schedule["lastRunAt"] == "" {
		t.Fatalf("manual refresh did not record lastRunAt: %#v", schedule)
	}
}
