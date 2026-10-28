package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"reflect"
	"testing"
)

func TestAdGuardFilterTogglePreservesNameAndOtherSettings(t *testing.T) {
	mutations := []map[string]any{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/control/filtering/status" {
			writeJSON(w, 200, map[string]any{"filters": []any{map[string]any{"id": 17, "name": "User name", "url": "https://filters.example/list", "enabled": false}}, "user_rules": []string{"@@||vpn.example^"}})
			return
		}
		if r.URL.Path != "/control/filtering/set_url" {
			t.Errorf("unexpected mutation: %s", r.URL.Path)
			w.WriteHeader(400)
			return
		}
		var payload map[string]any
		_ = json.NewDecoder(r.Body).Decode(&payload)
		mutations = append(mutations, payload)
		_, _ = w.Write([]byte("OK"))
	}))
	defer server.Close()
	_, err := adGuardFilterAction(adGuardSettings{URL: server.URL}, map[string]any{"action": "filter-set", "url": "https://filters.example/list", "enabled": true})
	if err != nil {
		t.Fatal(err)
	}
	if len(mutations) != 1 || mutations[0]["whitelist"] != false || !reflect.DeepEqual(mutations[0]["data"], map[string]any{"name": "User name", "url": "https://filters.example/list", "enabled": true}) {
		t.Fatalf("unrelated filter fields changed: %#v", mutations)
	}
}

func TestAdGuardFilterRejectsInvalidOrDuplicateWithoutMutation(t *testing.T) {
	mutations := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/control/filtering/status" {
			writeJSON(w, 200, map[string]any{"filters": []any{map[string]any{"url": "https://filters.example/list"}}})
			return
		}
		mutations++
		w.WriteHeader(400)
	}))
	defer server.Close()
	for _, payload := range []map[string]any{
		{"action": "filter-add", "name": "Duplicate", "url": "https://filters.example/list"},
		{"action": "filter-add", "name": "Local", "url": "https://127.0.0.1/private"},
		{"action": "filter-add", "name": "Credentials", "url": "https://user:password@example.com/list"},
		{"action": "filter-set", "url": "https://missing.example/list", "enabled": true},
		{"action": "filter-set", "url": "https://filters.example/list"},
		{"action": "filter-add", "name": "", "url": "https://other.example/list"},
	} {
		if _, err := adGuardFilterAction(adGuardSettings{URL: server.URL}, payload); err == nil {
			t.Fatalf("accepted invalid operation: %#v", payload)
		}
	}
	if mutations != 0 {
		t.Fatalf("sent %d unexpected mutations", mutations)
	}
}
