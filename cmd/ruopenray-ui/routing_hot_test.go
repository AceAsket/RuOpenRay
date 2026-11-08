package main

import (
	"encoding/json"
	"fmt"
	"net/http/httptest"
	"os"
	"reflect"
	"strings"
	"testing"
)

func hotFixture(tag string) map[string]any {
	return map[string]any{"api": map[string]any{"tag": "api", "listen": "127.0.0.1:10086", "services": []any{"RoutingService"}}, "outbounds": []any{map[string]any{"tag": "direct", "protocol": "freedom"}, map[string]any{"tag": "block", "protocol": "blackhole"}}, "routing": map[string]any{"domainStrategy": "AsIs", "rules": []any{map[string]any{"type": "field", "domain": []any{"example.test"}, "outboundTag": tag, "ruleTag": "fixture-" + tag}}}}
}

func TestHotRoutingRequiresAnExclusiveRuleListChange(t *testing.T) {
	a, b := hotFixture("direct"), hotFixture("block")
	if !routingRulesOnly(a, b) || routingRulesOnly(a, a) {
		t.Fatal("route-only detection failed")
	}
	mapValue(b["routing"])["balancers"] = []any{}
	if !routingRulesOnly(a, b) {
		t.Fatal("UI's empty balancer list changed the apply mode")
	}
	for _, key := range []string{"dns", "api", "inbounds", "outbounds", "policy", "log", "observatory", "remark"} {
		candidate := hotFixture("block")
		candidate[key] = map[string]any{"changed": true}
		if routingRulesOnly(a, candidate) {
			t.Fatal("accepted change to " + key)
		}
	}
	for _, key := range []string{"domainStrategy", "domainMatcher", "balancers", "script", "futureOption"} {
		candidate := hotFixture("block")
		mapValue(candidate["routing"])[key] = "changed"
		if routingRulesOnly(a, candidate) {
			t.Fatal("accepted global routing change to " + key)
		}
	}
}

func TestHotRoutingAPIPreparationIsLocalAndPreservesOtherServices(t *testing.T) {
	cfg := map[string]any{}
	if err := prepareRoutingAPI(cfg); err != nil {
		t.Fatal(err)
	}
	if server, err := routingAPIServer(cfg); err != nil || server != "127.0.0.1:10086" || !routingServiceEnabled(cfg) {
		t.Fatal(cfg, err)
	}
	legacy := map[string]any{"api": map[string]any{"tag": "existing", "services": []any{"StatsService"}}, "inbounds": []any{map[string]any{"tag": "existing", "listen": "::1", "port": 12345}}}
	if err := prepareRoutingAPI(legacy); err != nil {
		t.Fatal(err)
	}
	if server, _ := routingAPIServer(legacy); server != "[::1]:12345" || len(anySlice(mapValue(legacy["api"])["services"])) != 2 {
		t.Fatal(legacy)
	}
	for _, address := range []string{"0.0.0.0:8080", "192.168.1.1:10085", "localhost:10085", "[::]:10085", "127.0.0.1:0", "127.0.0.1:65536", "http://127.0.0.1:10085"} {
		if _, err := localRoutingAddress(address); err == nil {
			t.Fatal("accepted " + address)
		}
	}
	for _, version := range []string{"Xray 26.3.27", "Xray 26.9.9", "unknown", "Xray 26.10.21-beta.1"} {
		if routingHotVersion(version) {
			t.Fatal(version)
		}
	}
	if !routingHotVersion("Xray 26.10.31 (Xray, Penetrates Everything.)") {
		t.Fatal("current core rejected")
	}
}

func TestHotRoutingPreparationDoesNotWriteOrApplyAndRequiresAuth(t *testing.T) {
	s := reliabilityState(t)
	s.addSession("fixture")
	before, _ := os.ReadFile(s.cfg.ActiveConfig)
	for _, token := range []string{"", "fixture"} {
		r := httptest.NewRequest("POST", "/api/config/routing-api", strings.NewReader(`{"config":{}}`))
		if token != "" {
			r.Header.Set("Authorization", "Bearer "+token)
		}
		w := httptest.NewRecorder()
		s.handleAPI(w, r)
		want := 401
		if token != "" {
			want = 200
		}
		if w.Code != want {
			t.Fatal(w.Code, w.Body.String())
		}
	}
	after, _ := os.ReadFile(s.cfg.ActiveConfig)
	if string(before) != string(after) {
		t.Fatal("preparation wrote live config")
	}
}

func TestHotRoutingRollbackHandlesLostAcknowledgementAndRetainsPreviousConfig(t *testing.T) {
	for _, failure := range []string{"none", "lost-ack", "wrong-order", "pid-change", "rollback-failed"} {
		t.Run(failure, func(t *testing.T) {
			s := reliabilityState(t)
			old, next := hotFixture("direct"), hotFixture("block")
			oldBody, _ := json.Marshal(old)
			if err := os.WriteFile(s.cfg.ActiveConfig, oldBody, 0600); err != nil {
				t.Fatal(err)
			}
			backup, err := s.backupActive()
			if err != nil {
				t.Fatal(err)
			}
			nextBody, _ := json.Marshal(next)
			if err := os.WriteFile(s.cfg.ActiveConfig, nextBody, 0600); err != nil {
				t.Fatal(err)
			}
			runtimeRules := routingRuleSummary(old)
			calls, restarts := 0, 0
			pid := "123:456"
			c := &routingHotClient{process: pid, identity: func() (string, error) { return pid, nil }, list: func() ([]routingRuntimeRule, error) { return runtimeRules, nil }}
			c.replace = func(cfg map[string]any) error {
				calls++
				runtimeRules = routingRuleSummary(cfg)
				if calls == 1 {
					switch failure {
					case "lost-ack", "rollback-failed":
						return fmt.Errorf("ack lost")
					case "wrong-order":
						runtimeRules = []routingRuntimeRule{}
					case "pid-change":
						pid = "124:789"
					}
				}
				if calls > 1 && failure == "rollback-failed" {
					return fmt.Errorf("rollback API unavailable")
				}
				return nil
			}
			result := s.applyHotRouting(c, old, next, backup, nil, func() map[string]any {
				restarts++
				runtimeRules = routingRuleSummary(old)
				return map[string]any{"ok": true}
			})
			body, _ := os.ReadFile(s.cfg.ActiveConfig)
			if failure == "none" {
				if result["ok"] != true || calls != 1 || restarts != 0 || string(body) != string(nextBody) {
					t.Fatal(result, calls, restarts)
				}
			} else {
				if result["ok"] != false || mapValue(result["rollback"])["ok"] != true || string(body) != string(oldBody) || !reflect.DeepEqual(runtimeRules, routingRuleSummary(old)) {
					t.Fatal(result, calls, restarts)
				}
				if (failure == "pid-change" || failure == "rollback-failed") != (restarts == 1) {
					t.Fatal("unexpected recovery restart", restarts)
				}
			}
		})
	}
}
