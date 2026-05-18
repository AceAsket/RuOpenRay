package subscription

import (
	"path/filepath"
	"testing"
)

func TestUpsertPoolReplacesExisting(t *testing.T) {
	store := Store{Pools: []Pool{{Tag: "proxy", URL: "old"}, {Tag: "other", URL: "keep"}}}
	next := UpsertPool(store, Pool{Tag: "proxy", URL: "new"})
	if len(next.Pools) != 2 {
		t.Fatalf("pool count = %d, want 2", len(next.Pools))
	}
	if next.Pools[0].URL != "new" || next.Pools[1].URL != "keep" {
		t.Fatalf("unexpected pools: %#v", next.Pools)
	}
}

func TestSaveLoadStoreKeepsEmptyPoolsArray(t *testing.T) {
	path := filepath.Join(t.TempDir(), "subscriptions.json")
	if err := SaveStore(path, Store{}); err != nil {
		t.Fatalf("SaveStore returned error: %v", err)
	}
	loaded := LoadStore(path)
	if loaded.Pools == nil {
		t.Fatal("LoadStore returned nil Pools, want empty slice")
	}
}

func TestPublicPoolActiveCandidate(t *testing.T) {
	pool := Pool{
		Tag:    "proxy",
		Active: 1,
		Candidates: []map[string]any{
			{"tag": "one", "protocol": "vless"},
			{"tag": "two", "protocol": "trojan"},
		},
	}
	public := PublicPool(pool)
	if public["count"] != 2 {
		t.Fatalf("count = %v, want 2", public["count"])
	}
	active, ok := public["activeCandidate"].(map[string]any)
	if !ok || active["tag"] != "two" {
		t.Fatalf("unexpected active candidate: %#v", public["activeCandidate"])
	}
}
