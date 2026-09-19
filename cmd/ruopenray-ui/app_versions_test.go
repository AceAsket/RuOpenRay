package main

import "testing"

func TestAppVersionOrdering(t *testing.T) {
	for _, tc := range []struct {
		current, candidate string
		update             bool
	}{
		{"v0.4.0", "v0.5.0", true}, {"0.5.0-test.9+abc", "0.5.0-test.10+def", true},
		{"0.5.0-test.10", "0.5.0", true}, {"0.5.0", "0.5.0-test.11", false},
		{"0.5.0-test.10", "0.4.0", false}, {"0.5.0+abc", "v0.5.0+def", false},
		{"dev", "0.5.0", false}, {"5.0-test-e37293a", "0.4.0", false},
		{"0.5.0-test.10", "0.5.0-test.2", false}, {"0.5.0", "bad", false},
	} {
		if got, _ := appUpdateDecision(tc.current, tc.candidate); got != tc.update {
			t.Errorf("%s -> %s: %v", tc.current, tc.candidate, got)
		}
	}
}

func TestAppReleaseChannel(t *testing.T) {
	items := []map[string]any{
		{"tag_name": "v0.6.0-test.1", "prerelease": true}, {"tag_name": "v0.5.0"},
		{"tag_name": "v0.7.0", "draft": true}, {"tag_name": "v0.4.0"},
		{"tag_name": "v0.6.0-test.2"}, // pre-release suffix is filtered even if GitHub flag is missing.
	}
	if got := selectAppRelease(items, "stable")["tag_name"]; got != "v0.5.0" {
		t.Fatal(got)
	}
	if got := selectAppRelease(items, "test")["tag_name"]; got != "v0.6.0-test.2" {
		t.Fatal(got)
	}
}
