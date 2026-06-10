package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestB4StatusTextRunning(t *testing.T) {
	if b4StatusTextRunning("inactive") {
		t.Fatal("inactive service must not be treated as running")
	}
	if b4StatusTextRunning("not running") {
		t.Fatal("not running service must not be treated as running")
	}
	if !b4StatusTextRunning("running") {
		t.Fatal("running service should be treated as running")
	}
}

func TestB4Warnings(t *testing.T) {
	status := map[string]any{
		"nft":      map[string]any{"hasQueue": true, "hasDNSRedirect": true},
		"iptables": map[string]any{"hasNFQUEUE": false},
		"routing":  map[string]any{"ipRule": true},
	}
	warnings := b4Warnings(status)
	if len(warnings) != 3 {
		t.Fatalf("warnings = %#v, want 3 items", warnings)
	}
}

func TestB4RouteOutputActiveIgnoresMissingTableErrors(t *testing.T) {
	if b4RouteOutputActive(map[string]any{
		"ok":     false,
		"stdout": `Error: argument "b4_route" is wrong: table id value is invalid`,
	}) {
		t.Fatal("missing b4_route table error must not be treated as active route")
	}
	if !b4RouteOutputActive(map[string]any{"ok": true, "stdout": "default dev lo scope link"}) {
		t.Fatal("valid route output should be treated as active route")
	}
}

func TestB4ProcessLinesIgnoresDiagnosticShell(t *testing.T) {
	output := `29251 root 1348 S ash -c echo status; /etc/init.d/b4 status 2>&1 || true
29299 root 1348 S grep b4
29300 root 1348 S ash -c /usr/bin/ruopenray-ui diagnostics | jq '{podkop:.podkop, b4:.b4}'
29310 root 2048 S /usr/bin/b4 --config /etc/b4/config.json`
	lines := b4ProcessLines(output)
	if len(lines) != 1 {
		t.Fatalf("process lines = %#v, want one real b4 process", lines)
	}
}

func TestB4APIStatusSummarizesReadOnlyEndpoints(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/api/version":
			_, _ = w.Write([]byte(`{"version":"1.64.0"}`))
		case "/api/auth/check":
			_, _ = w.Write([]byte(`{"success":true,"message":"ok"}`))
		case "/api/system/diagnostics":
			_, _ = w.Write([]byte(`{"success":true,"data":{"b4":{"running":true,"pid":123,"version":"1.64.0","config_path":"/etc/b4/config.json","service_manager":"procd"}}}`))
		case "/api/config":
			_, _ = w.Write([]byte(`{"success":true,"version":"1.64.0","available_ifaces":["br-lan"],"queue":{"interfaces":["br-lan"],"ipv4":true,"ipv6":false,"mark":4,"start_num":400,"threads":2},"sets":[{"id":"discord","name":"Discord","enabled":true},{"id":"off","name":"Disabled","enabled":false}]}`))
		case "/api/metrics/summary":
			_, _ = w.Write([]byte(`{"success":true,"data":{"total_packets":42,"active_connections":3}}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	status := b4APIStatusFromBase(server.URL + "/api")
	if !boolMap(status, "available") {
		t.Fatalf("api status = %#v, want available", status)
	}
	if !boolMap(status, "running") {
		t.Fatalf("api status = %#v, want running", status)
	}
	if !boolMap(status, "queueActive") || !boolMap(status, "setsEnabled") {
		t.Fatalf("api status = %#v, want queue and sets enabled", status)
	}
	config, _ := status["config"].(map[string]any)
	sets, _ := config["sets"].(map[string]any)
	if got := b4IntFromAny(sets["enabledCount"]); got != 1 {
		t.Fatalf("enabledCount = %d, want 1", got)
	}
}

func TestB4APIStatusReportsAuthRequired(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/api/version":
			_, _ = w.Write([]byte(`{"version":"1.64.0"}`))
		case "/api/auth/check":
			w.WriteHeader(http.StatusUnauthorized)
			_, _ = w.Write([]byte(`{"success":false}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	status := b4APIStatusFromBase(server.URL + "/api")
	if !boolMap(status, "available") {
		t.Fatalf("api status = %#v, want available", status)
	}
	if !boolMap(status, "authRequired") {
		t.Fatalf("api status = %#v, want authRequired", status)
	}
	if boolMap(status, "running") {
		t.Fatalf("api status = %#v, auth-only status must not claim running", status)
	}
}

func TestB4APIStatusDoesNotTreatDefaultIPv4AsActiveQueue(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/api/version":
			_, _ = w.Write([]byte(`{"version":"1.67.0"}`))
		case "/api/auth/check":
			_, _ = w.Write([]byte(`{"success":true}`))
		case "/api/system/diagnostics":
			_, _ = w.Write([]byte(`{"success":true,"data":{"b4":{"running":true},"firewall":{"backend":"none","nfqueue_works":false}}}`))
		case "/api/config":
			_, _ = w.Write([]byte(`{"success":true,"queue":{"interfaces":[],"ipv4":true,"ipv6":false},"sets":[]}`))
		default:
			_, _ = w.Write([]byte(`{"success":true}`))
		}
	}))
	defer server.Close()

	status := b4APIStatusFromBase(server.URL + "/api")
	if !boolMap(status, "running") {
		t.Fatalf("api status = %#v, want running", status)
	}
	if boolMap(status, "queueActive") {
		t.Fatalf("api status = %#v, default ipv4 without firewall backend must not be queueActive", status)
	}
}
