package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	rproxy "github.com/AceAsket/RuOpenRay/internal/proxy"
	rsubscription "github.com/AceAsket/RuOpenRay/internal/subscription"
)

func TestSubscriptionTCPCheckAcceptsFastLocalConnections(t *testing.T) {
	listener, err := net.Listen("tcp4", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()
	port := listener.Addr().(*net.TCPAddr).Port
	_, ok, err := directEndpointTCPProbe(context.Background(), "127.0.0.1", port, 300, 1)
	if !ok || err != nil {
		t.Fatalf("open TCP port did not pass: %v", err)
	}
}

func TestCheckOutboundsUsesRequestedEndpointOptions(t *testing.T) {
	s := reliabilityState(t)
	listener, err := net.Listen("tcp4", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()
	port := listener.Addr().(*net.TCPAddr).Port
	outbound := subscriptionTestOutbound("checked", "127.0.0.1", port)
	if err := s.writeActiveConfig(map[string]any{"outbounds": []any{outbound}}); err != nil {
		t.Fatal(err)
	}
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/outbounds/check", strings.NewReader(`{"tags":["checked"],"mode":"endpoint","timeoutMs":350,"attempts":1}`))
	s.checkOutbounds(rec, req)
	var response struct {
		OK        bool
		TimeoutMs int
		Attempts  int
		Results   []map[string]any
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &response); err != nil {
		t.Fatal(err)
	}
	if rec.Code != 200 || !response.OK || response.TimeoutMs != 350 || response.Attempts != 1 ||
		len(response.Results) != 1 || response.Results[0]["endpointOk"] != true || response.Results[0]["method"] != "endpoint" {
		t.Fatalf("unexpected endpoint check result: %s", rec.Body.String())
	}
}

func nativeSubscriptionMask() map[string]any {
	return map[string]any{
		"tcp": []any{
			map[string]any{"type": "fragment", "settings": map[string]any{"packets": "tlshello", "length": "100-200", "delay": "10-20"}},
			map[string]any{"type": "custom-tcp", "settings": map[string]any{"value": "keep-tcp"}},
		},
		"udp":    []any{map[string]any{"type": "custom-udp", "settings": map[string]any{"value": "keep-udp"}}},
		"future": map[string]any{"enabled": true},
	}
}

func transportJSON(value any) string {
	body, _ := json.Marshal(value)
	return string(body)
}

func TestCloneSubscriptionOutboundPreservesLocalTransportPolicy(t *testing.T) {
	legacy := rproxy.FragmentOutboundTag("10-20,1-2,tlshello")
	for _, tc := range []struct {
		name, currentDialer, candidateDialer, wantDialer string
		currentMask, candidateMask                       any
		hasCurrentMask                                   bool
	}{
		{name: "native replaces incoming legacy", currentMask: nativeSubscriptionMask(), hasCurrentMask: true, candidateDialer: legacy},
		{name: "native keeps incoming custom chain", currentMask: nativeSubscriptionMask(), hasCurrentMask: true, candidateDialer: "provider-hop", wantDialer: "provider-hop"},
		{name: "native keeps custom tag with invalid reserved suffix", currentMask: nativeSubscriptionMask(), hasCurrentMask: true, candidateDialer: "ruopenray-fragment-!", wantDialer: "ruopenray-fragment-!"},
		{name: "local custom chain wins", currentMask: nativeSubscriptionMask(), hasCurrentMask: true, currentDialer: "local-hop", candidateDialer: legacy, wantDialer: "local-hop"},
		{name: "existing legacy stays legacy", currentDialer: legacy, candidateDialer: "provider-hop", wantDialer: legacy},
		{name: "other masks replace provider mask", currentMask: map[string]any{"udp": []any{map[string]any{"type": "custom-udp"}}}, hasCurrentMask: true, candidateMask: nativeSubscriptionMask()},
		{name: "explicit empty mask retained", currentMask: map[string]any{}, hasCurrentMask: true, candidateMask: nativeSubscriptionMask()},
		{name: "explicit null mask retained", currentMask: nil, hasCurrentMask: true, candidateMask: nativeSubscriptionMask()},
		{name: "fresh candidate keeps provider policy", candidateMask: nativeSubscriptionMask(), candidateDialer: "provider-hop", wantDialer: "provider-hop"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			current := subscriptionTestOutbound("pool", "old.example.test", 443)
			currentStream := map[string]any{"security": "tls", "tlsSettings": map[string]any{"serverName": "old.example.test"}, "sockopt": map[string]any{"mark": 128}}
			current["streamSettings"] = currentStream
			if tc.hasCurrentMask {
				currentStream["finalmask"] = tc.currentMask
			}
			if tc.currentDialer != "" {
				mapValue(currentStream["sockopt"])["dialerProxy"] = tc.currentDialer
			}
			candidate := subscriptionTestOutbound("provider-tag", "new.example.test", 8443)
			candidateStream := map[string]any{"security": "tls", "tlsSettings": map[string]any{"serverName": "new.example.test"}, "sockopt": map[string]any{"mark": 256}}
			candidate["streamSettings"] = candidateStream
			if tc.candidateMask != nil {
				candidateStream["finalmask"] = tc.candidateMask
			}
			if tc.candidateDialer != "" {
				mapValue(candidateStream["sockopt"])["dialerProxy"] = tc.candidateDialer
			}
			beforeCurrent, beforeCandidate := transportJSON(current), transportJSON(candidate)
			cloned := cloneSubscriptionOutbound(candidate, current, "pool")
			stream := mapValue(cloned["streamSettings"])
			wantMask := tc.candidateMask
			if tc.hasCurrentMask {
				wantMask = tc.currentMask
			}
			if transportJSON(stream["finalmask"]) != transportJSON(wantMask) || fragmentDialerProxy(cloned) != tc.wantDialer {
				t.Fatalf("transport policy changed: %s", transportJSON(cloned))
			}
			if cloned["tag"] != "pool" || mapValue(stream["tlsSettings"])["serverName"] != "new.example.test" || number(mapValue(stream["sockopt"])["mark"], 0) != 256 || rproxy.OutboundSummary(cloned)["address"] != "new.example.test" {
				t.Fatalf("provider transport or endpoint was overwritten: %s", transportJSON(cloned))
			}
			if tc.hasCurrentMask {
				if _, present := stream["finalmask"]; !present {
					t.Fatal("explicit finalmask property disappeared")
				}
			}
			if mask, ok := stream["finalmask"].(map[string]any); ok {
				mask["mutated-clone"] = true
				if tcp := anySlice(mask["tcp"]); len(tcp) > 0 {
					mapValue(tcp[0])["type"] = "mutated-clone"
				}
			}
			mapValue(stream["tlsSettings"])["serverName"] = "mutated-clone"
			if transportJSON(current) != beforeCurrent || transportJSON(candidate) != beforeCandidate {
				t.Fatal("clone aliases current or provider outbound")
			}
		})
	}
}

func TestSubscriptionSelectAndRefreshKeepNativeMask(t *testing.T) {
	for _, action := range []string{"select", "refresh"} {
		t.Run(action, func(t *testing.T) {
			s := reliabilityState(t)
			current := subscriptionTestOutbound("pool", "old.example.test", 443)
			mask := nativeSubscriptionMask()
			current["streamSettings"] = map[string]any{"finalmask": mask}
			orphanTag := rproxy.FragmentOutboundTag("20-30,2-3,tlshello")
			orphan, _ := rproxy.FragmentOutboundFromTag(orphanTag)
			cfg := map[string]any{"outbounds": []any{current, orphan}}
			if err := s.writeActiveConfig(cfg); err != nil {
				t.Fatal(err)
			}
			if _, err := s.syncCurrentProfile(cfg); err != nil {
				t.Fatal(err)
			}
			candidate := subscriptionTestOutbound("provider-new", "new.example.test", 8443)
			candidate["streamSettings"] = map[string]any{"tlsSettings": map[string]any{"serverName": "new.example.test"}, "sockopt": map[string]any{"dialerProxy": rproxy.FragmentOutboundTag("10-20,1-2,tlshello")}}
			store := rsubscription.Store{Pools: []rsubscription.Pool{{Tag: "pool", Active: 0, Candidates: []map[string]any{candidate}}}}
			if err := s.writeSubscriptionStoreRaw(store); err != nil {
				t.Fatal(err)
			}
			if action == "select" {
				rec := httptest.NewRecorder()
				s.selectSubscriptionCandidate(rec, httptest.NewRequest(http.MethodPost, "/api/subscriptions/select", strings.NewReader(`{"tag":"pool","index":0,"restart":false}`)))
				var response map[string]any
				_ = json.Unmarshal(rec.Body.Bytes(), &response)
				if rec.Code != 200 || response["ok"] != true {
					t.Fatalf("select: %d %s", rec.Code, rec.Body.String())
				}
			} else if result := s.applySubscriptionActiveOutbounds(store, []int{0}, false); result["ok"] != true {
				t.Fatal(result)
			}
			active, err := s.readActiveConfig()
			if err != nil {
				t.Fatal(err)
			}
			got := activeOutboundByTag(asArray(active["outbounds"]), "pool")
			if rproxy.OutboundSummary(got)["address"] != "new.example.test" || fragmentDialerProxy(got) != "" || transportJSON(mapValue(got["streamSettings"])["finalmask"]) != transportJSON(mask) {
				t.Fatalf("native policy lost: %s", transportJSON(active))
			}
			if len(asArray(active["outbounds"])) != 2 || activeOutboundByTag(asArray(active["outbounds"]), orphanTag) == nil {
				t.Fatal("native mode generated a companion or removed an existing orphan")
			}
			profile, err := os.ReadFile(s.profilePath(s.currentProfileName()))
			if err != nil || !strings.Contains(string(profile), `"finalmask"`) || !strings.Contains(string(profile), "new.example.test") {
				t.Fatalf("saved profile diverged from active config: %v %s", err, profile)
			}
		})
	}
}

func TestSubscriptionManualAndFallbackProbeEffectiveCandidate(t *testing.T) {
	for _, action := range []string{"manual", "fallback"} {
		t.Run(action, func(t *testing.T) {
			s := reliabilityState(t)
			current := subscriptionTestOutbound("pool", "old.example.test", 443)
			mask := nativeSubscriptionMask()
			current["streamSettings"] = map[string]any{"finalmask": mask, "sockopt": map[string]any{"dialerProxy": "local-hop"}}
			cfg := map[string]any{"outbounds": []any{current, map[string]any{"tag": "local-hop", "protocol": "freedom"}}}
			if err := s.writeActiveConfig(cfg); err != nil {
				t.Fatal(err)
			}
			candidate := subscriptionTestOutbound("provider-candidate", "new.example.test", 8443)
			store := rsubscription.Store{Pools: []rsubscription.Pool{{Tag: "pool", Active: 0, Candidates: []map[string]any{candidate}}}}
			if err := s.writeSubscriptionStoreRaw(store); err != nil {
				t.Fatal(err)
			}
			calls := 0
			probe := func(_ context.Context, index int, effective map[string]any, all []any, options subscriptionCandidateCheckOptions) map[string]any {
				calls++
				if action == "fallback" && options.mode != "http" {
					t.Fatalf("automatic selection must check the tunnel, got %s", options.mode)
				}
				if effective["tag"] != "provider-candidate" || fragmentDialerProxy(effective) != "local-hop" || transportJSON(mapValue(effective["streamSettings"])["finalmask"]) != transportJSON(mask) {
					t.Fatalf("probe did not use effective candidate: %s", transportJSON(effective))
				}
				if outs, err := runtimeProbeOutbounds(effective, all); err != nil || len(outs) != 2 {
					t.Fatalf("probe lost custom chain: %s %v", transportJSON(outs), err)
				}
				active, _ := s.readActiveConfig()
				if rproxy.OutboundSummary(activeOutboundByTag(asArray(active["outbounds"]), "pool"))["address"] != "old.example.test" {
					t.Fatal("candidate was installed before its probe finished")
				}
				return map[string]any{"index": index, "tag": effective["tag"], "ok": true}
			}
			rec := httptest.NewRecorder()
			req := httptest.NewRequest(http.MethodPost, "/api/subscriptions/"+action, strings.NewReader(`{"tag":"pool","index":0,"mode":"endpoint","restart":false}`))
			if action == "manual" {
				s.checkSubscriptionCandidateWithProbe(rec, req, probe)
			} else {
				s.fallbackSubscriptionWithProbe(rec, req, probe)
			}
			var response map[string]any
			_ = json.Unmarshal(rec.Body.Bytes(), &response)
			if rec.Code != 200 || response["ok"] != true || calls != 1 {
				t.Fatalf("%s: %d %s calls=%d", action, rec.Code, rec.Body.String(), calls)
			}
			if saved := s.readSubscriptionCandidateCheckResults()["pool"][fmt.Sprint(0)]; saved["tag"] != "provider-candidate" {
				t.Fatalf("probe cache lost provider identity: %v", saved)
			}
			if action == "fallback" {
				active, _ := s.readActiveConfig()
				got := activeOutboundByTag(asArray(active["outbounds"]), "pool")
				if fragmentDialerProxy(got) != "local-hop" || transportJSON(mapValue(got["streamSettings"])["finalmask"]) != transportJSON(mask) || rproxy.OutboundSummary(got)["address"] != "new.example.test" {
					t.Fatalf("fallback installed a different policy from its probe: %s", transportJSON(got))
				}
			}
		})
	}
}
