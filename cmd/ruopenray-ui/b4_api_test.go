package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestB4CurrentAuthSparseConfigAndMetrics(t *testing.T) {
	logins := 0
	token := "first"
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/api/version":
			w.Write([]byte(`{"version":"1.85.0"}`))
			return
		case "/api/auth/check":
			w.Write([]byte(`{"auth_required":true,"authenticated":false}`))
			return
		case "/api/auth/login":
			logins++
			var body map[string]string
			json.NewDecoder(r.Body).Decode(&body)
			if body["username"] != "admin" || body["password"] != "test-private-password" {
				t.Error("credentials not sent")
			}
			json.NewEncoder(w).Encode(map[string]string{"token": token})
			return
		}
		if r.Header.Get("Authorization") != "Bearer "+token {
			w.WriteHeader(401)
			w.Write([]byte(`{}`))
			return
		}
		switch r.URL.Path {
		case "/api/config":
			w.Write([]byte(`{"version":52,"sets":[{"name":"Test"}],"system":{"tables":{"skip_setup":true},"web_server":{"password":"secret-hash"}}}`))
		case "/api/sets":
			w.Write([]byte(`[{"id":"test","name":"Test","enabled":true,"revision":"rev1","routing":{"upstream":{"password":"must-not-leak"}},"targets":{"sni_domains":["example.org"]}}]`))
		case "/api/metrics/summary":
			w.Write([]byte(`{"connections":42,"connections_in_sets":7,"connections_last_minute":3,"blocked_total":2,"uptime_s":60,"rss_bytes":1024,"cpu_percent":1.5}`))
		case "/api/metrics":
			w.Write([]byte(`{"engine":{"state":"running","mode":"nfqueue","firewall":"external","threads":4}}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()
	s := &serverState{cfg: appConfig{DataDir: t.TempDir()}}
	result := s.b4Connect(map[string]any{"url": server.URL, "username": "admin", "password": "test-private-password"})
	if !boolMap(result, "ok") {
		t.Fatal(result)
	}
	status := s.b4APIStatus()
	if !boolMap(status, "authRequired") || !boolMap(status, "authenticated") || boolMap(status, "queueActive") {
		t.Fatal(status)
	}
	config := mapValue(status["config"])
	queue := mapValue(config["queue"])
	if !boolMap(queue, "ipv4") || config["queueScope"] != "all" || queue["startNum"] != 537 || queue["mark"] != 32768 || !boolMap(config, "skipSetup") {
		t.Fatal(config)
	}
	if mapValue(status["metrics"])["connections"] != float64(42) {
		t.Fatal(status["metrics"])
	}
	public, _ := json.Marshal(status)
	for _, secret := range []string{"test-private-password", "must-not-leak", "secret-hash"} {
		if strings.Contains(string(public), secret) {
			t.Fatal("credential leaked")
		}
	}
	if logins != 1 {
		t.Fatalf("unnecessary login: %d", logins)
	}
	token = "after-restart"
	if !boolMap(s.b4APIStatus(), "authenticated") || logins != 2 {
		t.Fatal("restart token recovery failed")
	}
	body, err := os.ReadFile(filepath.Join(s.cfg.DataDir, "b4-api.json"))
	if err != nil || !strings.Contains(string(body), "test-private-password") {
		t.Fatal("credentials not saved separately")
	}
}

func TestB4AuthMissingAndRejectedCredentialsDoNotHammerLogin(t *testing.T) {
	logins := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/version" {
			w.Write([]byte(`{"version":"1.85.0"}`))
			return
		}
		if r.URL.Path == "/api/auth/check" {
			w.Write([]byte(`{"auth_required":true}`))
			return
		}
		if r.URL.Path == "/api/auth/login" {
			logins++
		}
		w.WriteHeader(401)
		w.Write([]byte(`{}`))
	}))
	defer server.Close()
	status := b4APIStatusFromBase(server.URL + "/api")
	if !boolMap(status, "authRequired") || boolMap(status, "authenticated") || logins != 0 {
		t.Fatal(status)
	}
	s := &serverState{cfg: appConfig{DataDir: t.TempDir()}}
	payload := map[string]any{"url": server.URL, "username": "admin", "password": "bad"}
	for i := 0; i < 3; i++ {
		if boolMap(s.b4Connect(payload), "ok") {
			t.Fatal("bad password accepted")
		}
	}
	if logins != 1 {
		t.Fatalf("repeated bad credentials caused %d login attempts", logins)
	}
}

func TestB4NoRedirectProxyOrInvalidJSON(t *testing.T) {
	leaked := false
	other := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { leaked = true; w.Write([]byte(`{}`)) }))
	defer other.Close()
	redirect := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { http.Redirect(w, r, other.URL, 302) }))
	defer redirect.Close()
	t.Setenv("HTTP_PROXY", other.URL)
	token := "secret"
	after := time.Time{}
	key := ""
	c := newB4Client(b4Settings{URL: redirect.URL}, &token, &after, &key)
	defer c.close()
	if _, err := c.raw("GET", "/config", nil, nil); err == nil || leaked {
		t.Fatal("redirect/proxy was followed")
	}
	invalid := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.Write([]byte(`<html>not B4</html>`)) }))
	defer invalid.Close()
	if boolMap(b4APIStatusFromBase(invalid.URL+"/api"), "available") {
		t.Fatal("HTML service misidentified as B4")
	}
	for _, address := range []string{"http://example.com:7000", "http://192.168.50.117:7000", "http://127.0.0.1:7000/api", "http://admin:secret@127.0.0.1:7000", "file:///etc/b4.json"} {
		if validateB4URL(address) == nil {
			t.Fatalf("unsafe address allowed %s", address)
		}
	}
}

func TestB4SetEditsPreserveMethodsAndRefuseStaleRevision(t *testing.T) {
	writes := 0
	set := map[string]any{"id": "test", "revision": "r1", "name": "Test", "enabled": false, "fragmentation": map[string]any{"strategy": "combo"}, "targets": map[string]any{"sni_domains": []any{"old.example"}, "ip": []any{"1.2.3.0/24"}}}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/sets/test" {
			t.Errorf("unexpected endpoint %s", r.URL.Path)
			http.NotFound(w, r)
			return
		}
		if r.Method == "GET" {
			json.NewEncoder(w).Encode(set)
			return
		}
		if r.Method != "PUT" {
			t.Error("non-revision write")
			return
		}
		writes++
		var next map[string]any
		json.NewDecoder(r.Body).Decode(&next)
		if mapValue(next["fragmentation"])["strategy"] != "combo" || len(anySlice(mapValue(next["targets"])["ip"])) != 1 || next["revision"] != "r1" {
			t.Error("settings changed")
		}
		set = next
		set["revision"] = "r2"
		json.NewEncoder(w).Encode(set)
	}))
	defer server.Close()
	s := &serverState{cfg: appConfig{DataDir: t.TempDir()}}
	if err := s.saveB4Settings(b4Settings{URL: server.URL}); err != nil {
		t.Fatal(err)
	}
	result := s.b4APIAction(map[string]any{"action": "add-domain", "id": "test", "revision": "r1", "domain": "New.Example"})
	if !boolMap(result, "ok") || writes != 1 || len(anySlice(mapValue(set["targets"])["sni_domains"])) != 2 {
		t.Fatal(result)
	}
	result = s.b4APIAction(map[string]any{"action": "set-enabled", "id": "test", "revision": "r1", "enabled": true})
	if boolMap(result, "ok") || writes != 1 {
		t.Fatal("stale write was not refused")
	}
}

func TestB4ConfiguredSetsAndCapabilityAreNotActualInterception(t *testing.T) {
	if b4StatusActive(map[string]any{"hasQueue": true}, nil, nil, map[string]any{"setsEnabled": true}) {
		t.Fatal("foreign queue/sets misidentified")
	}
	empty := b4ParseNFT("table inet b4 {\n chain output {}\n}\ntable inet other {\n queue num 537\n}")
	if boolMap(empty, "hasB4") || !boolMap(empty, "hasQueue") {
		t.Fatal(empty)
	}
	own := b4ParseNFT("table inet ruopenray_b4_direct {\n tcp dport 443 queue num 537 bypass\n}")
	if !boolMap(own, "hasB4") {
		t.Fatal(own)
	}
	current := b4ParseNFT("table inet ruopenray_b4_direct {\n counter packets 2 bytes 200 queue flags bypass to 537-538\n}")
	if !boolMap(current, "hasB4") {
		t.Fatal("Current nftables queue display not recognized")
	}
	defaults := b4APISummarizeConfig(map[string]any{})
	if len(b4StartIssues(defaults, nil)) == 0 {
		t.Fatal("default all-interface interception allowed")
	}
	safe := b4APISummarizeConfig(map[string]any{"system": map[string]any{"tables": map[string]any{"skip_setup": true}}})
	if len(b4StartIssues(safe, nil)) != 0 {
		t.Fatal("external NFQUEUE refused")
	}
	sparse := map[string]any{"id": "sparse", "routing": map[string]any{"enabled": true}}
	if len(b4StartIssues(safe, []map[string]any{sparse})) == 0 || !boolMap(b4PublicSets([]map[string]any{sparse})[0], "enabled") {
		t.Fatal("omitted enabled must retain B4's enabled-by-default semantics")
	}
	mapValue(safe["queue"])["mark"] = int(0x52000000)
	if len(b4StartIssues(safe, nil)) == 0 {
		t.Fatal("AWG mark conflict allowed")
	}
}

func TestB4DirectRulesOnlyCaptureOptInOutboundAndExcludeDNS(t *testing.T) {
	config := b4APISummarizeConfig(map[string]any{})
	rules, err := b4DirectRules(config)
	if err != nil {
		t.Fatal(err)
	}
	for _, part := range []string{"hook output", "0x80000 == 0x80000", "tcp dport { 80, 443 }", "udp dport 443", "queue num 537-540 bypass", "ct original packets <= 20"} {
		if !strings.Contains(rules, part) {
			t.Fatal(rules)
		}
	}
	for _, part := range []string{"dport 53", "sport 53", "hook forward", "fw4", "delete ruleset"} {
		if strings.Contains(rules, part) {
			t.Fatal("unrelated traffic/firewall captured")
		}
	}
	if !strings.Contains(rules, "prerouting meta nfproto ipv4 ct mark & 0x80000 == 0x80000") || !strings.Contains(rules, "meta mark & 0x8000 != 0 return") {
		t.Fatal("Replies or reinjection are not isolated")
	}
	valid := map[string]any{"outbounds": []any{map[string]any{"tag": "direct-b4", "protocol": "freedom", "streamSettings": map[string]any{"sockopt": map[string]any{"mark": b4DirectMark}}}}}
	if len(b4DirectConfigIssues(valid)) != 0 {
		t.Fatal("prepared outbound refused")
	}
	mapValue(anySlice(valid["outbounds"])[0])["protocol"] = "vless"
	if len(b4DirectConfigIssues(valid)) == 0 {
		t.Fatal("VPN mark accepted")
	}
	mapValue(config["queue"])["threads"] = 0
	if _, err = b4DirectRules(config); err == nil {
		t.Fatal("invalid range accepted")
	}
}

func TestB4LiveQueueRangeMustMatchCurrentConfiguration(t *testing.T) {
	queue := map[string]any{"startNum": 537, "threads": 2}
	if !b4QueueRangeReady("537 13210 0 2\n538 123456 0 2\n", queue) {
		t.Fatal("live queues refused")
	}
	for _, text := range []string{"", "537 13210 0 2\n", "540 12345 0 2\n541 34566 0 2\n"} {
		if b4QueueRangeReady(text, queue) {
			t.Fatal("missing/stale queues accepted")
		}
	}
}

func TestB4ActiveEditRefusesUnsafeFirewallButAllowsDisabling(t *testing.T) {
	writes := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/sets/test":
			if r.Method == "PUT" {
				writes++
				w.Write([]byte(`{"success":true}`))
				return
			}
			w.Write([]byte(`{"id":"test","name":"Test","enabled":true,"revision":"r1"}`))
		case "/api/sets":
			w.Write([]byte(`[{"id":"test","name":"Test","enabled":true,"revision":"r1"}]`))
		case "/api/config":
			w.Write([]byte(`{"version":52}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()
	s := &serverState{cfg: appConfig{DataDir: t.TempDir()}}
	s.saveB4Settings(b4Settings{URL: server.URL})
	result := s.b4APIAction(map[string]any{"action": "set-enabled", "id": "test", "revision": "r1", "enabled": true})
	if boolMap(result, "ok") || writes != 0 {
		t.Fatal("unsafe interception was enabled", result)
	}
	result = s.b4APIAction(map[string]any{"action": "add-domain", "id": "test", "revision": "r1", "domain": "new.example"})
	if boolMap(result, "ok") || writes != 0 {
		t.Fatal("unsafe active set was edited", result)
	}
	result = s.b4APIAction(map[string]any{"action": "set-enabled", "id": "test", "revision": "r1", "enabled": false})
	if !boolMap(result, "ok") || writes != 1 {
		t.Fatal("safe disable was refused", result)
	}
}

func TestB4EnabledQueueProtectsActiveConfigButAllowsProfileStorage(t *testing.T) {
	dir := t.TempDir()
	s := &serverState{cfg: appConfig{DataDir: dir, ActiveConfig: filepath.Join(dir, "xray.json"), ProfilesDir: filepath.Join(dir, "profiles")}}
	valid := map[string]any{"outbounds": []any{map[string]any{"tag": "direct-b4", "protocol": "freedom", "streamSettings": map[string]any{"sockopt": map[string]any{"mark": b4DirectMark}}}}}
	if err := s.saveB4Settings(b4Settings{DirectEnabled: true}); err != nil {
		t.Fatal(err)
	}
	if err := s.writeActiveConfigRaw(valid); err != nil {
		t.Fatal(err)
	}
	before, _ := os.ReadFile(s.cfg.ActiveConfig)
	invalid := cloneConfigMap(valid)
	mapValue(anySlice(invalid["outbounds"])[0])["protocol"] = "vless"
	for _, candidate := range []map[string]any{invalid, {"outbounds": []any{}}} {
		if err := s.writeActiveConfigRaw(candidate); err == nil {
			t.Fatal("Enabled queue accepted a removed or reassigned outbound")
		}
		after, _ := os.ReadFile(s.cfg.ActiveConfig)
		if !bytes.Equal(before, after) {
			t.Fatal("Rejected candidate changed active config")
		}
	}
	if _, err := s.saveProfileConfig("without-b4", map[string]any{"outbounds": []any{}}); err != nil {
		t.Fatal("Storing an inactive profile must remain possible", err)
	}
	if err := s.saveB4Settings(b4Settings{DirectEnabled: false}); err != nil {
		t.Fatal(err)
	}
	if err := s.writeActiveConfigRaw(map[string]any{"outbounds": []any{}}); err != nil {
		t.Fatal("Queue-off config change refused", err)
	}
}
