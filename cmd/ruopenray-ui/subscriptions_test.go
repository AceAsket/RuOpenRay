package main

import (
	"testing"

	rsubscription "github.com/AceAsket/RuOpenRay/internal/subscription"
)

func subscriptionTestOutbound(tag, address string, port int) map[string]any {
	return map[string]any{
		"tag":      tag,
		"protocol": "vless",
		"settings": map[string]any{
			"vnext": []any{map[string]any{"address": address, "port": port}},
		},
	}
}

func TestPreserveSubscriptionActiveKeepsMatchingServer(t *testing.T) {
	previous := rsubscription.Pool{
		Active: 1,
		Candidates: []map[string]any{
			subscriptionTestOutbound("old-a", "one.example", 443),
			subscriptionTestOutbound("stable", "stable.example", 443),
		},
	}
	candidates := []map[string]any{
		subscriptionTestOutbound("new-a", "two.example", 443),
		subscriptionTestOutbound("stable", "stable.example", 443),
	}

	result := preserveSubscriptionActive(previous, candidates)
	if !result.preserved || result.active != 1 || result.missingCandidate != nil {
		t.Fatalf("unexpected preserve result: %#v", result)
	}
}

func TestPreserveSubscriptionActiveMarksRemovedServerMissing(t *testing.T) {
	previous := rsubscription.Pool{
		Active: 1,
		Candidates: []map[string]any{
			subscriptionTestOutbound("old-a", "one.example", 443),
			subscriptionTestOutbound("gone", "gone.example", 443),
		},
	}
	candidates := []map[string]any{
		subscriptionTestOutbound("new-a", "one.example", 443),
		subscriptionTestOutbound("new-b", "two.example", 443),
	}

	result := preserveSubscriptionActive(previous, candidates)
	if result.preserved {
		t.Fatalf("removed active server was marked preserved: %#v", result)
	}
	if result.active != -1 {
		t.Fatalf("active = %d, want -1 when active server disappeared", result.active)
	}
	if result.missingCandidate == nil || result.missingCandidate["tag"] != "gone" {
		t.Fatalf("missing candidate not retained: %#v", result.missingCandidate)
	}
}
