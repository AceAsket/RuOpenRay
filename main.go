package main

import (
	"archive/zip"
	"bufio"
	"bytes"
	"context"
	"crypto/rand"
	"crypto/subtle"
	"crypto/tls"
	"embed"
	"encoding/base64"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"log"
	"mime"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path"
	"path/filepath"
	"regexp"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

//go:embed web/*
var embeddedFiles embed.FS

var appVersion = "dev"

var logLineTimePattern = regexp.MustCompile(`\d{4}/\d{2}/\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?`)

const (
	appRepoFullName = "AceAsket/RuOpenRay"
	appServiceName  = "ruopenray-ui"
)

type appConfig struct {
	DataDir      string
	ProfilesDir  string
	BackupDir    string
	ActiveConfig string
	ServiceName  string
	GeoDir       string
	Host         string
	Port         string
	Password     string
}

type serverState struct {
	cfg              appConfig
	sessions         map[string]bool
	started          time.Time
	metricsMu        sync.Mutex
	prevCPUTotal     uint64
	prevCPUIdle      uint64
	prevCPUSeenAt    time.Time
	prevTrafficIf    string
	prevTrafficRx    uint64
	prevTrafficTx    uint64
	prevTrafficAt    time.Time
	prevXrayStats    map[string]uint64
	prevXrayStatsAt  time.Time
	coreVersionCache map[string]any
	coreVersionAt    time.Time
	serviceCache     map[string]any
	serviceAt        time.Time
	xrayStatsCache   map[string]any
	xrayStatsAt      time.Time
	logCacheKey      string
	logCacheText     string
	logCacheAt       time.Time
}

type subscriptionPool struct {
	Tag        string           `json:"tag"`
	URL        string           `json:"url"`
	Active     int              `json:"active"`
	UpdatedAt  string           `json:"updatedAt"`
	Candidates []map[string]any `json:"candidates"`
}

type subscriptionStore struct {
	Pools []subscriptionPool `json:"pools"`
}

func getenv(names []string, fallback string) string {
	for _, name := range names {
		if value := strings.TrimSpace(os.Getenv(name)); value != "" {
			return value
		}
	}
	return fallback
}

func main() {
	cfg := loadAppConfig()
	state := &serverState{cfg: cfg, sessions: map[string]bool{}, started: time.Now()}
	if err := state.ensureData(); err != nil {
		log.Fatal(err)
	}
	state.startLogMaintenance()
	if len(os.Args) > 1 && os.Args[1] == "--geo-update-scheduled" {
		payload := state.runScheduledGeoUpdate()
		body, _ := json.MarshalIndent(payload, "", "  ")
		fmt.Println(string(body))
		return
	}
	if len(os.Args) > 1 && os.Args[1] != "serve" {
		os.Exit(state.runCLI(os.Args[1:]))
	}
	mux := http.NewServeMux()
	mux.HandleFunc("/api/", state.handleAPI)
	mux.HandleFunc("/", state.handleStatic)
	addr := cfg.Host + ":" + cfg.Port
	log.Printf("RuOpenRay UI слушает http://%s", addr)
	log.Fatal(http.ListenAndServe(addr, mux))
}

func loadAppConfig() appConfig {
	cfg := appConfig{
		DataDir:      getenv([]string{"RUOPENRAY_DATA_DIR", "OPENRAY_DATA_DIR"}, "data"),
		ServiceName:  getenv([]string{"RUOPENRAY_XRAY_SERVICE", "OPENRAY_XRAY_SERVICE"}, "xray"),
		GeoDir:       getenv([]string{"RUOPENRAY_GEO_DIR", "OPENRAY_GEO_DIR"}, ""),
		Host:         getenv([]string{"RUOPENRAY_HOST", "OPENRAY_HOST"}, "127.0.0.1"),
		Port:         getenv([]string{"RUOPENRAY_PORT", "OPENRAY_PORT"}, "9090"),
		Password:     getenv([]string{"RUOPENRAY_PASSWORD", "RUOPENRAY_TOKEN", "OPENRAY_PASSWORD", "OPENRAY_TOKEN"}, "admin"),
		ActiveConfig: getenv([]string{"RUOPENRAY_ACTIVE_CONFIG", "OPENRAY_ACTIVE_CONFIG"}, ""),
		ProfilesDir:  getenv([]string{"RUOPENRAY_PROFILES_DIR", "OPENRAY_PROFILES_DIR"}, ""),
		BackupDir:    getenv([]string{"RUOPENRAY_BACKUP_DIR", "OPENRAY_BACKUP_DIR"}, ""),
	}
	if cfg.ActiveConfig == "" {
		cfg.ActiveConfig = filepath.Join(cfg.DataDir, "config.json")
	}
	if cfg.ProfilesDir == "" {
		cfg.ProfilesDir = filepath.Join(cfg.DataDir, "profiles")
	}
	if cfg.BackupDir == "" {
		cfg.BackupDir = filepath.Join(cfg.DataDir, "backups")
	}
	if cfg.GeoDir == "" {
		cfg.GeoDir = defaultGeoDir()
	}
	return cfg
}

func defaultGeoDir() string {
	for _, candidate := range []string{"/usr/share/xray", "/usr/local/share/xray"} {
		if info, err := os.Stat(candidate); err == nil && info.IsDir() {
			return candidate
		}
	}
	return "/usr/share/xray"
}

func (s *serverState) ensureData() error {
	if err := os.MkdirAll(s.cfg.ProfilesDir, 0o755); err != nil {
		return err
	}
	if err := os.MkdirAll(s.cfg.BackupDir, 0o755); err != nil {
		return err
	}
	if _, err := os.Stat(s.cfg.ActiveConfig); err == nil {
		return nil
	}
	if err := os.MkdirAll(filepath.Dir(s.cfg.ActiveConfig), 0o755); err != nil {
		return err
	}
	body, _ := json.MarshalIndent(defaultConfig(), "", "  ")
	if err := os.WriteFile(s.cfg.ActiveConfig, body, 0o600); err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(s.cfg.ProfilesDir, "default.json"), body, 0o600)
}

func defaultConfig() map[string]any {
	return map[string]any{
		"log": map[string]any{"loglevel": "warning"},
		"inbounds": []any{map[string]any{
			"tag": "socks-in", "port": 10808, "listen": "127.0.0.1", "protocol": "socks",
			"settings": map[string]any{"udp": true},
		}},
		"outbounds": []any{
			map[string]any{"tag": "direct", "protocol": "freedom"},
			map[string]any{"tag": "block", "protocol": "blackhole"},
		},
		"routing": map[string]any{"domainStrategy": "AsIs", "rules": []any{}},
	}
}

func writeJSON(w http.ResponseWriter, code int, payload any) {
	w.Header().Set("content-type", "application/json; charset=utf-8")
	w.Header().Set("cache-control", "no-store")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(payload)
}

func readJSON(r *http.Request) (map[string]any, error) {
	if r.Body == nil {
		return map[string]any{}, nil
	}
	defer r.Body.Close()
	body, err := io.ReadAll(r.Body)
	if err != nil || len(bytes.TrimSpace(body)) == 0 {
		return map[string]any{}, err
	}
	var payload map[string]any
	err = json.Unmarshal(body, &payload)
	return payload, err
}

func (s *serverState) handleAPI(w http.ResponseWriter, r *http.Request) {
	defer func() {
		if recovered := recover(); recovered != nil {
			writeJSON(w, 500, map[string]any{"ok": false, "error": fmt.Sprint(recovered)})
		}
	}()
	path := strings.TrimPrefix(r.URL.Path, "/api")
	if path == "/login" && r.Method == http.MethodPost {
		payload, err := readJSON(r)
		if err != nil {
			writeJSON(w, 400, map[string]any{"ok": false, "error": err.Error()})
			return
		}
		if subtle.ConstantTimeCompare([]byte(fmt.Sprint(payload["password"])), []byte(s.cfg.Password)) != 1 {
			writeJSON(w, 401, map[string]any{"ok": false, "error": "Неверный пароль"})
			return
		}
		token := randomToken()
		s.sessions[token] = true
		http.SetCookie(w, &http.Cookie{Name: "openray_session", Value: token, Path: "/", HttpOnly: true, SameSite: http.SameSiteLaxMode})
		writeJSON(w, 200, map[string]any{"ok": true, "token": token})
		return
	}
	if !s.authed(r) {
		writeJSON(w, 401, map[string]any{"ok": false, "error": "Требуется авторизация"})
		return
	}
	switch {
	case path == "/status" && r.Method == http.MethodGet:
		s.status(w)
	case path == "/config" && r.Method == http.MethodGet:
		cfg, err := s.readActiveConfig()
		respond(w, cfg, err)
	case path == "/config/test" && r.Method == http.MethodPost:
		payload, _ := readJSON(r)
		cfg, _ := payload["config"].(map[string]any)
		result := s.validateConfig(cfg)
		writeJSON(w, 200, result)
	case path == "/config/analyze" && r.Method == http.MethodPost:
		payload, _ := readJSON(r)
		cfg, _ := payload["config"].(map[string]any)
		writeJSON(w, 200, s.analyzeConfig(cfg))
	case path == "/config/apply" && r.Method == http.MethodPost:
		s.applyConfig(w, r)
	case path == "/routing/disabled" && r.Method == http.MethodGet:
		writeJSON(w, 200, map[string]any{"ok": true, "rules": s.disabledRouteRules()})
	case path == "/routing/disabled" && r.Method == http.MethodPost:
		payload, _ := readJSON(r)
		writeJSON(w, 200, s.saveDisabledRouteRules(payload))
	case path == "/service" && r.Method == http.MethodPost:
		payload, _ := readJSON(r)
		writeJSON(w, 200, s.serviceAction(fmt.Sprint(payload["action"])))
	case path == "/settings/password" && r.Method == http.MethodPost:
		payload, _ := readJSON(r)
		writeJSON(w, 200, s.changePassword(payload))
	case path == "/settings/logging" && r.Method == http.MethodGet:
		writeJSON(w, 200, s.loggingSettings())
	case path == "/settings/logging" && r.Method == http.MethodPost:
		payload, _ := readJSON(r)
		writeJSON(w, 200, s.saveLoggingSettings(payload))
	case path == "/settings/logging/clear" && r.Method == http.MethodPost:
		writeJSON(w, 200, s.clearLogFiles())
	case path == "/settings/service" && r.Method == http.MethodGet:
		writeJSON(w, 200, s.serviceSettings())
	case path == "/settings/service" && r.Method == http.MethodPost:
		payload, _ := readJSON(r)
		writeJSON(w, 200, s.saveServiceSettings(payload))
	case path == "/install/plan" && r.Method == http.MethodGet:
		writeJSON(w, 200, s.installPlan())
	case path == "/network/tcp-fast-open" && r.Method == http.MethodGet:
		writeJSON(w, 200, tcpFastOpenStatus())
	case path == "/network/tcp-fast-open" && r.Method == http.MethodPost:
		payload, _ := readJSON(r)
		writeJSON(w, 200, setTCPFastOpen(boolPayload(payload, "enabled", true)))
	case path == "/firewall/status" && r.Method == http.MethodGet:
		writeJSON(w, 200, s.firewallStatus())
	case path == "/firewall/snapshot" && r.Method == http.MethodGet:
		writeJSON(w, 200, s.firewallSnapshot())
	case path == "/firewall/apply" && r.Method == http.MethodPost:
		payload, _ := readJSON(r)
		writeJSON(w, 200, s.applyFirewall(payload))
	case path == "/firewall/disable" && r.Method == http.MethodPost:
		writeJSON(w, 200, s.disableFirewall())
	case path == "/firewall/restore" && r.Method == http.MethodPost:
		payload, _ := readJSON(r)
		writeJSON(w, 200, s.restoreFirewallSnapshot(payload))
	case path == "/xray/stats" && r.Method == http.MethodGet:
		cfg, _ := s.readActiveConfig()
		writeJSON(w, 200, s.xrayTrafficStats(cfg, false))
	case path == "/xray/stats/settings" && r.Method == http.MethodPost:
		payload, _ := readJSON(r)
		writeJSON(w, 200, s.saveXrayStatsSettings(boolPayload(payload, "enabled", true)))
	case path == "/xray/stats/reset" && r.Method == http.MethodPost:
		cfg, _ := s.readActiveConfig()
		writeJSON(w, 200, s.xrayTrafficStats(cfg, true))
	case path == "/core/releases" && r.Method == http.MethodGet:
		releases, err := xrayCoreReleases()
		respond(w, map[string]any{"ok": true, "releases": releases, "asset": xrayAssetName(), "arch": systemArchitecture("github-release")}, err)
	case path == "/core/update" && r.Method == http.MethodPost:
		payload, _ := readJSON(r)
		writeJSON(w, 200, s.updateCore(strings.TrimSpace(fmt.Sprint(payload["version"])), boolPayload(payload, "backup", false)))
	case path == "/app/releases" && r.Method == http.MethodGet:
		release, err := appLatestRelease()
		respond(w, map[string]any{"ok": true, "version": appVersion, "asset": ruOpenRayAssetName(), "arch": systemArchitecture("github-release"), "release": release}, err)
	case path == "/app/update" && r.Method == http.MethodPost:
		payload, _ := readJSON(r)
		writeJSON(w, 200, s.updateApp(strings.TrimSpace(fmt.Sprint(payload["version"])), boolPayload(payload, "backup", false)))
	case path == "/diagnostics" && r.Method == http.MethodGet:
		writeJSON(w, 200, s.diagnostics())
	case path == "/diagnostics/http-probe" && r.Method == http.MethodPost:
		payload, _ := readJSON(r)
		writeJSON(w, 200, routerHTTPProbe(payload))
	case path == "/diagnostics/domain-probe" && r.Method == http.MethodPost:
		payload, _ := readJSON(r)
		writeJSON(w, 200, s.domainProxyProbe(payload))
	case path == "/geo/status" && r.Method == http.MethodGet:
		writeJSON(w, 200, s.geoStatus())
	case path == "/geo/sources" && r.Method == http.MethodPost:
		payload, _ := readJSON(r)
		writeJSON(w, 200, s.saveGeoCustomSources(payload))
	case path == "/geo/update" && r.Method == http.MethodPost:
		payload, _ := readJSON(r)
		writeJSON(w, 200, s.updateGeo(payload))
	case path == "/geo/delete" && r.Method == http.MethodPost:
		payload, _ := readJSON(r)
		writeJSON(w, 200, s.deleteGeoFiles(payload))
	case path == "/geo/schedule" && r.Method == http.MethodPost:
		payload, _ := readJSON(r)
		writeJSON(w, 200, s.saveGeoSchedule(payload))
	case path == "/geo/cleanup" && r.Method == http.MethodPost:
		writeJSON(w, 200, s.cleanupGeoBackups())
	case path == "/profiles" && r.Method == http.MethodGet:
		profiles, err := s.listProfiles()
		respond(w, profiles, err)
	case path == "/profiles" && r.Method == http.MethodPost:
		s.saveProfile(w, r)
	case path == "/profiles/activate" && r.Method == http.MethodPost:
		s.activateProfile(w, r)
	case path == "/import" && r.Method == http.MethodPost:
		s.importLink(w, r)
	case path == "/import/preview" && r.Method == http.MethodPost:
		s.importPreview(w, r)
	case path == "/import/subscription" && r.Method == http.MethodPost:
		s.importSubscription(w, r)
	case path == "/subscriptions" && r.Method == http.MethodGet:
		writeJSON(w, 200, s.subscriptionReport())
	case path == "/subscriptions/pool" && r.Method == http.MethodPost:
		s.saveSubscriptionPool(w, r)
	case path == "/subscriptions/fallback" && r.Method == http.MethodPost:
		s.fallbackSubscription(w, r)
	case path == "/dhcp/leases" && r.Method == http.MethodGet:
		writeJSON(w, 200, dhcpLeaseReport(s.cfg.DataDir))
	case path == "/dns/check" && r.Method == http.MethodPost:
		s.checkDNS(w, r)
	case path == "/dns/lan-upstream" && r.Method == http.MethodGet:
		writeJSON(w, 200, s.lanDNSUpstreamStatus(nil))
	case path == "/dns/lan-upstream" && r.Method == http.MethodPost:
		payload, _ := readJSON(r)
		writeJSON(w, 200, s.applyLANDNSUpstream(payload))
	case path == "/outbounds/check" && r.Method == http.MethodPost:
		s.checkOutbounds(w, r)
	case path == "/sni/scan" && r.Method == http.MethodPost:
		s.scanSNI(w, r)
	case path == "/domain-monitor" && r.Method == http.MethodGet:
		s.domainMonitor(w, r)
	case path == "/domain-monitor" && r.Method == http.MethodPost:
		payload, _ := readJSON(r)
		writeJSON(w, 200, s.controlDomainMonitor(strings.TrimSpace(fmt.Sprint(payload["action"]))))
	case path == "/logs" && r.Method == http.MethodGet:
		w.Header().Set("content-type", "text/plain; charset=utf-8")
		_, _ = w.Write([]byte(s.readLogs(r.URL.Query())))
	case path == "/backup" && r.Method == http.MethodPost:
		backup, err := s.backupActive()
		respond(w, map[string]any{"ok": true, "path": backup}, err)
	case path == "/backup/full" && r.Method == http.MethodPost:
		backup, err := s.backupBundle()
		respond(w, map[string]any{"ok": true, "path": backup}, err)
	case path == "/backup/latest" && r.Method == http.MethodGet:
		backup, err := s.latestBackup()
		respond(w, map[string]any{"ok": true, "backup": backup}, err)
	case path == "/backup/restore" && r.Method == http.MethodPost:
		payload, _ := readJSON(r)
		writeJSON(w, 200, s.restoreBackup(strings.TrimSpace(fmt.Sprint(payload["path"]))))
	default:
		writeJSON(w, 404, map[string]any{"ok": false, "error": "Неизвестный API-маршрут"})
	}
}

func respond(w http.ResponseWriter, payload any, err error) {
	if err != nil {
		writeJSON(w, 500, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	writeJSON(w, 200, payload)
}

func (s *serverState) authed(r *http.Request) bool {
	if header := r.Header.Get("Authorization"); strings.HasPrefix(strings.ToLower(header), "bearer ") {
		return s.sessions[strings.TrimSpace(header[7:])]
	}
	cookie, err := r.Cookie("openray_session")
	return err == nil && s.sessions[cookie.Value]
}

func randomToken() string {
	buf := make([]byte, 24)
	_, _ = rand.Read(buf)
	return hex.EncodeToString(buf)
}

func (s *serverState) readActiveConfig() (map[string]any, error) {
	body, err := os.ReadFile(s.cfg.ActiveConfig)
	if err != nil {
		return nil, err
	}
	var cfg map[string]any
	err = json.Unmarshal(body, &cfg)
	return cfg, err
}

func (s *serverState) writeActiveConfig(cfg map[string]any) error {
	body, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(s.cfg.ActiveConfig, body, 0o600)
}

func (s *serverState) status(w http.ResponseWriter) {
	cfg, err := s.readActiveConfig()
	if err != nil {
		writeJSON(w, 500, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	version := s.cachedXrayVersion()
	service := s.cachedXrayServiceStatus()
	profiles, _ := s.listProfiles()
	writeJSON(w, 200, map[string]any{
		"app": map[string]any{
			"version": appVersion,
			"asset":   ruOpenRayAssetName(),
			"arch":    systemArchitecture("github-release"),
		},
		"service": service,
		"core": map[string]any{
			"available": version["ok"],
			"version":   firstLine(version["stdout"].(string), "xray не найден"),
			"detail":    version["stderr"],
		},
		"config": map[string]any{
			"path":         s.cfg.ActiveConfig,
			"inbounds":     lenArray(cfg["inbounds"]),
			"outbounds":    lenArray(cfg["outbounds"]),
			"routingRules": lenArray(getNested(cfg, "routing", "rules")),
		},
		"profiles":  len(profiles),
		"system":    s.systemMetrics(),
		"xrayStats": s.xrayTrafficStats(cfg, false),
		"uptime":    time.Since(s.started).Seconds(),
		"now":       time.Now().Format(time.RFC3339),
	})
}

func (s *serverState) cachedXrayVersion() map[string]any {
	now := time.Now()
	s.metricsMu.Lock()
	if s.coreVersionCache != nil && now.Sub(s.coreVersionAt) < time.Minute {
		cached := s.coreVersionCache
		s.metricsMu.Unlock()
		return cached
	}
	s.metricsMu.Unlock()
	version := run("xray", "version")
	s.metricsMu.Lock()
	s.coreVersionCache = version
	s.coreVersionAt = now
	s.metricsMu.Unlock()
	return version
}

func (s *serverState) cachedXrayServiceStatus() map[string]any {
	now := time.Now()
	s.metricsMu.Lock()
	if s.serviceCache != nil && now.Sub(s.serviceAt) < 2*time.Second {
		cached := s.serviceCache
		s.metricsMu.Unlock()
		return cached
	}
	s.metricsMu.Unlock()
	service := s.xrayServiceStatus()
	s.metricsMu.Lock()
	s.serviceCache = service
	s.serviceAt = now
	s.metricsMu.Unlock()
	return service
}

func (s *serverState) xrayServiceStatus() map[string]any {
	if runtime.GOOS == "windows" {
		return map[string]any{"running": true, "detail": "dev-mode: имитация сервиса"}
	}
	result := run("/etc/init.d/"+s.cfg.ServiceName, "status")
	text := result["stdout"].(string) + " " + result["stderr"].(string)
	normalized := strings.ToLower(text)
	running := result["ok"].(bool) && !strings.Contains(normalized, "no instances") && regexp.MustCompile(`(?i)running|active`).MatchString(text)
	service := map[string]any{"running": running, "detail": strings.TrimSpace(text)}
	if running {
		if uptime, pid := xrayProcessUptimeSeconds(s.cfg.ServiceName); uptime > 0 {
			service["uptime"] = uptime
			service["pid"] = pid
		}
	}
	return service
}

func parseUintField(value string) uint64 {
	n, _ := strconv.ParseUint(strings.TrimSpace(value), 10, 64)
	return n
}

func readCPUStat() (total uint64, idle uint64) {
	body, err := os.ReadFile("/proc/stat")
	if err != nil {
		return 0, 0
	}
	line := strings.SplitN(string(body), "\n", 2)[0]
	fields := strings.Fields(line)
	if len(fields) < 5 || fields[0] != "cpu" {
		return 0, 0
	}
	for _, field := range fields[1:] {
		total += parseUintField(field)
	}
	idle = parseUintField(fields[4])
	if len(fields) > 5 {
		idle += parseUintField(fields[5])
	}
	return total, idle
}

func (s *serverState) cpuPercent() any {
	total, idle := readCPUStat()
	if total == 0 {
		return nil
	}
	s.metricsMu.Lock()
	defer s.metricsMu.Unlock()
	prevTotal, prevIdle := s.prevCPUTotal, s.prevCPUIdle
	s.prevCPUTotal, s.prevCPUIdle, s.prevCPUSeenAt = total, idle, time.Now()
	if prevTotal == 0 || total <= prevTotal || idle < prevIdle {
		return nil
	}
	totalDelta := total - prevTotal
	idleDelta := idle - prevIdle
	if totalDelta == 0 {
		return nil
	}
	used := float64(totalDelta-idleDelta) / float64(totalDelta) * 100
	return int(used + 0.5)
}

func loadAverage() map[string]any {
	body, err := os.ReadFile("/proc/loadavg")
	if err != nil {
		return map[string]any{}
	}
	fields := strings.Fields(string(body))
	load := map[string]any{}
	if len(fields) > 0 {
		load["load1"] = fields[0]
	}
	if len(fields) > 1 {
		load["load5"] = fields[1]
	}
	if len(fields) > 2 {
		load["load15"] = fields[2]
	}
	return load
}

func memoryStats() map[string]any {
	body, err := os.ReadFile("/proc/meminfo")
	if err != nil {
		return map[string]any{}
	}
	values := map[string]uint64{}
	for _, line := range strings.Split(string(body), "\n") {
		parts := strings.Fields(line)
		if len(parts) >= 2 {
			values[strings.TrimSuffix(parts[0], ":")] = parseUintField(parts[1]) * 1024
		}
	}
	total := values["MemTotal"]
	available := values["MemAvailable"]
	if available == 0 {
		available = values["MemFree"] + values["Buffers"] + values["Cached"]
	}
	used := uint64(0)
	percent := 0
	if total > available {
		used = total - available
	}
	if total > 0 {
		percent = int(float64(used)/float64(total)*100 + 0.5)
	}
	return map[string]any{"total": total, "available": available, "used": used, "usedPercent": percent}
}

func tcpStats() map[string]any {
	read := func(file string) (total int, established int) {
		body, err := os.ReadFile(file)
		if err != nil {
			return 0, 0
		}
		for index, line := range strings.Split(string(body), "\n") {
			fields := strings.Fields(line)
			if index == 0 || len(fields) < 4 {
				continue
			}
			total++
			if fields[3] == "01" {
				established++
			}
		}
		return total, established
	}
	t4, e4 := read("/proc/net/tcp")
	t6, e6 := read("/proc/net/tcp6")
	return map[string]any{"total": t4 + t6, "established": e4 + e6}
}

func conntrackStats() map[string]any {
	file := "/proc/net/nf_conntrack"
	body, err := os.ReadFile(file)
	if err != nil {
		file = "/proc/net/ip_conntrack"
		body, err = os.ReadFile(file)
	}
	if err != nil {
		return map[string]any{"ok": false, "total": 0, "tcp": 0, "udp": 0, "path": ""}
	}
	total := 0
	tcp := 0
	udp := 0
	for _, line := range strings.Split(string(body), "\n") {
		fields := strings.Fields(line)
		if len(fields) < 3 {
			continue
		}
		total++
		switch fields[2] {
		case "tcp":
			tcp++
		case "udp":
			udp++
		}
	}
	return map[string]any{"ok": true, "total": total, "tcp": tcp, "udp": udp, "path": file}
}

func routerUptimeSeconds() float64 {
	body, err := os.ReadFile("/proc/uptime")
	if err != nil {
		return 0
	}
	fields := strings.Fields(string(body))
	if len(fields) == 0 {
		return 0
	}
	value, err := strconv.ParseFloat(fields[0], 64)
	if err != nil {
		return 0
	}
	return value
}

func processStartTicks(pid string) float64 {
	body, err := os.ReadFile(filepath.Join("/proc", pid, "stat"))
	if err != nil {
		return 0
	}
	line := string(body)
	end := strings.LastIndex(line, ")")
	if end < 0 || end+2 >= len(line) {
		return 0
	}
	fields := strings.Fields(line[end+2:])
	if len(fields) < 20 {
		return 0
	}
	value, err := strconv.ParseFloat(fields[19], 64)
	if err != nil {
		return 0
	}
	return value
}

func clockTicksPerSecond() float64 {
	result := run("getconf", "CLK_TCK")
	if result["ok"] == true {
		value, err := strconv.ParseFloat(strings.TrimSpace(fmt.Sprint(result["stdout"])), 64)
		if err == nil && value > 0 {
			return value
		}
	}
	return 100
}

func xrayProcessUptimeSeconds(serviceName string) (float64, string) {
	if runtime.GOOS == "windows" {
		return 0, ""
	}
	entries, err := os.ReadDir("/proc")
	if err != nil {
		return 0, ""
	}
	names := map[string]bool{"xray": true}
	if serviceName != "" {
		names[serviceName] = true
	}
	now := routerUptimeSeconds()
	ticks := clockTicksPerSecond()
	if now <= 0 || ticks <= 0 {
		return 0, ""
	}
	for _, entry := range entries {
		if !entry.IsDir() || !regexp.MustCompile(`^\d+$`).MatchString(entry.Name()) {
			continue
		}
		comm, err := os.ReadFile(filepath.Join("/proc", entry.Name(), "comm"))
		if err != nil || !names[strings.TrimSpace(string(comm))] {
			continue
		}
		start := processStartTicks(entry.Name())
		if start <= 0 {
			continue
		}
		uptime := now - start/ticks
		if uptime > 0 {
			return uptime, entry.Name()
		}
	}
	return 0, ""
}

func tcpFastOpenStatus() map[string]any {
	body, err := os.ReadFile("/proc/sys/net/ipv4/tcp_fastopen")
	if err != nil {
		return map[string]any{"ok": false, "available": false, "enabled": false, "value": 0, "error": err.Error()}
	}
	value := number(strings.TrimSpace(string(body)), 0)
	return map[string]any{
		"ok":               true,
		"available":        true,
		"enabled":          value&1 == 1,
		"serverEnabled":    value&2 == 2,
		"value":            value,
		"path":             "/proc/sys/net/ipv4/tcp_fastopen",
		"persistentPath":   "/etc/sysctl.d/90-ruopenray-tcp-fastopen.conf",
		"recommendedValue": 3,
	}
}

func setTCPFastOpen(enabled bool) map[string]any {
	if runtime.GOOS == "windows" {
		return map[string]any{"ok": true, "available": true, "enabled": enabled, "stdout": "dev-mode: TCP Fast Open будет настроен через sysctl на OpenWrt"}
	}
	value := "0"
	if enabled {
		value = "3"
	}
	if err := os.WriteFile("/proc/sys/net/ipv4/tcp_fastopen", []byte(value+"\n"), 0o644); err != nil {
		return map[string]any{"ok": false, "stderr": err.Error(), "status": tcpFastOpenStatus()}
	}
	persistentPath := "/etc/sysctl.d/90-ruopenray-tcp-fastopen.conf"
	if err := os.MkdirAll(filepath.Dir(persistentPath), 0o755); err != nil {
		return map[string]any{"ok": false, "stderr": err.Error(), "status": tcpFastOpenStatus()}
	}
	body := "net.ipv4.tcp_fastopen=" + value + "\n"
	if err := os.WriteFile(persistentPath, []byte(body), 0o644); err != nil {
		return map[string]any{"ok": false, "stderr": err.Error(), "status": tcpFastOpenStatus()}
	}
	status := tcpFastOpenStatus()
	status["ok"] = true
	status["stdout"] = "TCP Fast Open настроен в системе"
	return status
}

type netDevStat struct {
	Name      string
	RxBytes   uint64
	TxBytes   uint64
	RxPackets uint64
	TxPackets uint64
}

func defaultRouteInterface() string {
	result := run("ip", "route", "show", "default")
	if result["ok"] != true {
		return ""
	}
	fields := strings.Fields(fmt.Sprint(result["stdout"]))
	for index, field := range fields {
		if field == "dev" && index+1 < len(fields) {
			return fields[index+1]
		}
	}
	return ""
}

func readNetDevStats() []netDevStat {
	body, err := os.ReadFile("/proc/net/dev")
	if err != nil {
		return nil
	}
	items := []netDevStat{}
	for _, line := range strings.Split(string(body), "\n") {
		parts := strings.Split(line, ":")
		if len(parts) != 2 {
			continue
		}
		name := strings.TrimSpace(parts[0])
		if name == "" || name == "lo" {
			continue
		}
		fields := strings.Fields(parts[1])
		if len(fields) >= 16 {
			items = append(items, netDevStat{
				Name:      name,
				RxBytes:   parseUintField(fields[0]),
				RxPackets: parseUintField(fields[1]),
				TxBytes:   parseUintField(fields[8]),
				TxPackets: parseUintField(fields[9]),
			})
		}
	}
	return items
}

func (s *serverState) trafficStats() map[string]any {
	items := readNetDevStats()
	if len(items) == 0 {
		return map[string]any{}
	}
	byName := map[string]netDevStat{}
	for _, item := range items {
		byName[item.Name] = item
	}
	selectedName := defaultRouteInterface()
	selected, ok := byName[selectedName]
	if !ok {
		for _, item := range items {
			if !strings.HasPrefix(item.Name, "br-") {
				selected = item
				selectedName = item.Name
				ok = true
				break
			}
		}
	}
	if !ok {
		selected = items[0]
		selectedName = selected.Name
	}
	now := time.Now()
	var rxRate, txRate float64
	s.metricsMu.Lock()
	if s.prevTrafficIf == selectedName && !s.prevTrafficAt.IsZero() && selected.RxBytes >= s.prevTrafficRx && selected.TxBytes >= s.prevTrafficTx {
		elapsed := now.Sub(s.prevTrafficAt).Seconds()
		if elapsed > 0 {
			rxRate = float64(selected.RxBytes-s.prevTrafficRx) / elapsed
			txRate = float64(selected.TxBytes-s.prevTrafficTx) / elapsed
		}
	}
	s.prevTrafficIf, s.prevTrafficRx, s.prevTrafficTx, s.prevTrafficAt = selectedName, selected.RxBytes, selected.TxBytes, now
	s.metricsMu.Unlock()
	interfaces := []map[string]any{}
	for _, item := range items {
		interfaces = append(interfaces, map[string]any{
			"name":      item.Name,
			"rxBytes":   item.RxBytes,
			"txBytes":   item.TxBytes,
			"rxPackets": item.RxPackets,
			"txPackets": item.TxPackets,
			"selected":  item.Name == selectedName,
		})
	}
	return map[string]any{
		"interface":  selectedName,
		"rxBytes":    selected.RxBytes,
		"txBytes":    selected.TxBytes,
		"rxRate":     rxRate,
		"txRate":     txRate,
		"interfaces": interfaces,
	}
}

const (
	ruOpenRayStatsAPITag  = "ruopenray-api"
	ruOpenRayStatsAPIPort = 10085
)

func containsStringList(value any, expected string) bool {
	for _, item := range asArray(value) {
		if strings.TrimSpace(fmt.Sprint(item)) == expected {
			return true
		}
	}
	return strings.TrimSpace(fmt.Sprint(value)) == expected
}

func xrayStatsServices(api map[string]any) []string {
	services := []string{}
	for _, item := range asArray(api["services"]) {
		value := strings.TrimSpace(fmt.Sprint(item))
		if value != "" && value != "<nil>" {
			services = append(services, value)
		}
	}
	return services
}

func hasXrayStatsService(api map[string]any) bool {
	for _, service := range xrayStatsServices(api) {
		if service == "StatsService" {
			return true
		}
	}
	return false
}

func xrayStatsAPIInfo(cfg map[string]any) map[string]any {
	tag := ruOpenRayStatsAPITag
	server := fmt.Sprintf("127.0.0.1:%d", ruOpenRayStatsAPIPort)
	if cfg == nil {
		return map[string]any{"enabled": false, "server": server, "tag": tag}
	}
	statsEnabled := false
	if _, ok := cfg["stats"].(map[string]any); ok {
		statsEnabled = true
	}
	api, _ := cfg["api"].(map[string]any)
	if value := strings.TrimSpace(fmt.Sprint(api["tag"])); value != "" && value != "<nil>" {
		tag = value
	}
	for _, item := range asArray(cfg["inbounds"]) {
		inbound, ok := item.(map[string]any)
		if !ok || strings.TrimSpace(fmt.Sprint(inbound["tag"])) != tag {
			continue
		}
		listen := strings.TrimSpace(fmt.Sprint(inbound["listen"]))
		if listen == "" || listen == "<nil>" || listen == "0.0.0.0" || listen == "::" {
			listen = "127.0.0.1"
		}
		if port := number(inbound["port"], ruOpenRayStatsAPIPort); port > 0 {
			server = fmt.Sprintf("%s:%d", listen, port)
		}
		break
	}
	policy, _ := cfg["policy"].(map[string]any)
	system, _ := policy["system"].(map[string]any)
	policyEnabled := boolPayload(system, "statsOutboundUplink", false) && boolPayload(system, "statsOutboundDownlink", false)
	enabled := statsEnabled && hasXrayStatsService(api) && policyEnabled
	return map[string]any{"enabled": enabled, "stats": statsEnabled, "api": hasXrayStatsService(api), "policy": policyEnabled, "server": server, "tag": tag}
}

func ensureXrayStatsConfig(cfg map[string]any, enabled bool) {
	if cfg == nil {
		return
	}
	if !enabled {
		delete(cfg, "stats")
		if policy, ok := cfg["policy"].(map[string]any); ok {
			if system, ok := policy["system"].(map[string]any); ok {
				delete(system, "statsInboundUplink")
				delete(system, "statsInboundDownlink")
				delete(system, "statsOutboundUplink")
				delete(system, "statsOutboundDownlink")
				if len(system) == 0 {
					delete(policy, "system")
				}
			}
			if len(policy) == 0 {
				delete(cfg, "policy")
			}
		}
		if api, ok := cfg["api"].(map[string]any); ok {
			tag := strings.TrimSpace(fmt.Sprint(api["tag"]))
			if tag == ruOpenRayStatsAPITag || tag == "" || tag == "<nil>" {
				delete(cfg, "api")
			} else {
				services := []any{}
				for _, service := range xrayStatsServices(api) {
					if service != "StatsService" {
						services = append(services, service)
					}
				}
				api["services"] = services
			}
		}
		inbounds := []any{}
		for _, item := range asArray(cfg["inbounds"]) {
			if inbound, ok := item.(map[string]any); ok && strings.TrimSpace(fmt.Sprint(inbound["tag"])) == ruOpenRayStatsAPITag {
				continue
			}
			inbounds = append(inbounds, item)
		}
		cfg["inbounds"] = inbounds
		if routing, ok := cfg["routing"].(map[string]any); ok {
			rules := []any{}
			for _, item := range asArray(routing["rules"]) {
				rule, ok := item.(map[string]any)
				if ok && strings.TrimSpace(fmt.Sprint(rule["outboundTag"])) == ruOpenRayStatsAPITag && containsStringList(rule["inboundTag"], ruOpenRayStatsAPITag) {
					continue
				}
				rules = append(rules, item)
			}
			routing["rules"] = rules
		}
		return
	}

	cfg["stats"] = map[string]any{}
	policy, _ := cfg["policy"].(map[string]any)
	if policy == nil {
		policy = map[string]any{}
		cfg["policy"] = policy
	}
	system, _ := policy["system"].(map[string]any)
	if system == nil {
		system = map[string]any{}
		policy["system"] = system
	}
	system["statsInboundUplink"] = true
	system["statsInboundDownlink"] = true
	system["statsOutboundUplink"] = true
	system["statsOutboundDownlink"] = true

	api, _ := cfg["api"].(map[string]any)
	if api == nil {
		api = map[string]any{}
		cfg["api"] = api
	}
	tag := strings.TrimSpace(fmt.Sprint(api["tag"]))
	if tag == "" || tag == "<nil>" {
		tag = ruOpenRayStatsAPITag
		api["tag"] = tag
	}
	services := map[string]bool{"StatsService": true}
	for _, service := range xrayStatsServices(api) {
		services[service] = true
	}
	serviceList := []any{}
	for _, service := range sortedKeys(services) {
		serviceList = append(serviceList, service)
	}
	api["services"] = serviceList

	inbounds := asArray(cfg["inbounds"])
	hasInbound := false
	for _, item := range inbounds {
		inbound, ok := item.(map[string]any)
		if !ok || strings.TrimSpace(fmt.Sprint(inbound["tag"])) != tag {
			continue
		}
		hasInbound = true
		if strings.TrimSpace(fmt.Sprint(inbound["listen"])) == "" || fmt.Sprint(inbound["listen"]) == "<nil>" {
			inbound["listen"] = "127.0.0.1"
		}
		if number(inbound["port"], 0) == 0 {
			inbound["port"] = ruOpenRayStatsAPIPort
		}
		if strings.TrimSpace(fmt.Sprint(inbound["protocol"])) == "" || fmt.Sprint(inbound["protocol"]) == "<nil>" {
			inbound["protocol"] = "dokodemo-door"
		}
		if _, ok := inbound["settings"].(map[string]any); !ok {
			inbound["settings"] = map[string]any{"address": "127.0.0.1"}
		}
	}
	if !hasInbound {
		inbounds = append(inbounds, map[string]any{
			"tag":      tag,
			"listen":   "127.0.0.1",
			"port":     ruOpenRayStatsAPIPort,
			"protocol": "dokodemo-door",
			"settings": map[string]any{"address": "127.0.0.1"},
		})
		cfg["inbounds"] = inbounds
	}
	routing, _ := cfg["routing"].(map[string]any)
	if routing == nil {
		routing = map[string]any{"domainStrategy": "AsIs"}
		cfg["routing"] = routing
	}
	rules := asArray(routing["rules"])
	hasRule := false
	for _, item := range rules {
		rule, ok := item.(map[string]any)
		if ok && strings.TrimSpace(fmt.Sprint(rule["outboundTag"])) == tag && containsStringList(rule["inboundTag"], tag) {
			hasRule = true
			break
		}
	}
	if !hasRule {
		routing["rules"] = append([]any{map[string]any{"type": "field", "inboundTag": []any{tag}, "outboundTag": tag}}, rules...)
	}
}

func (s *serverState) saveXrayStatsSettings(enabled bool) map[string]any {
	cfg, err := s.readActiveConfig()
	if err != nil {
		return map[string]any{"ok": false, "stderr": err.Error()}
	}
	ensureXrayStatsConfig(cfg, enabled)
	test := s.validateConfig(cfg)
	analysis := s.analyzeConfig(cfg)
	if test["ok"] != true {
		return map[string]any{"ok": false, "test": test, "analysis": analysis, "stderr": "Конфигурация Xray Stats не прошла проверку"}
	}
	backup, err := s.backupActive("config-before-xray-stats")
	if err != nil {
		return map[string]any{"ok": false, "stderr": err.Error(), "test": test, "analysis": analysis}
	}
	if err := s.writeActiveConfig(cfg); err != nil {
		return map[string]any{"ok": false, "stderr": err.Error(), "backup": backup, "test": test, "analysis": analysis}
	}
	s.metricsMu.Lock()
	s.prevXrayStats = nil
	s.prevXrayStatsAt = time.Time{}
	s.metricsMu.Unlock()
	restart := s.serviceAction("restart")
	return map[string]any{"ok": restart["ok"], "enabled": enabled, "settings": xrayStatsAPIInfo(cfg), "backup": backup, "test": test, "analysis": analysis, "restart": restart}
}

func xrayOutboundKind(tag, protocol string) string {
	normalizedTag := strings.ToLower(strings.TrimSpace(tag))
	normalizedProtocol := strings.ToLower(strings.TrimSpace(protocol))
	switch {
	case normalizedProtocol == "freedom" || normalizedTag == "direct":
		return "direct"
	case normalizedProtocol == "blackhole" || normalizedTag == "block":
		return "block"
	case normalizedTag == "" || normalizedTag == "api" || normalizedTag == ruOpenRayStatsAPITag:
		return "system"
	default:
		return "proxy"
	}
}

func xrayOutboundProtocols(cfg map[string]any) map[string]string {
	result := map[string]string{}
	for _, item := range asArray(cfg["outbounds"]) {
		outbound, ok := item.(map[string]any)
		if !ok {
			continue
		}
		tag := strings.TrimSpace(fmt.Sprint(outbound["tag"]))
		if tag == "" || tag == "<nil>" {
			continue
		}
		result[tag] = strings.TrimSpace(fmt.Sprint(outbound["protocol"]))
	}
	return result
}

func parseXrayStatsOutput(stdout string) map[string]uint64 {
	counters := map[string]uint64{}
	var payload struct {
		Stat []struct {
			Name  string `json:"name"`
			Value uint64 `json:"value"`
		} `json:"stat"`
		Stats []struct {
			Name  string `json:"name"`
			Value uint64 `json:"value"`
		} `json:"stats"`
	}
	if json.Unmarshal([]byte(stdout), &payload) == nil {
		for _, item := range payload.Stat {
			if item.Name != "" {
				counters[item.Name] = item.Value
			}
		}
		for _, item := range payload.Stats {
			if item.Name != "" {
				counters[item.Name] = item.Value
			}
		}
		if len(counters) > 0 {
			return counters
		}
	}
	re := regexp.MustCompile(`(?s)name:\s*"?([^"\s]+)"?.{0,120}?value:\s*(\d+)`)
	for _, match := range re.FindAllStringSubmatch(stdout, -1) {
		value, _ := strconv.ParseUint(match[2], 10, 64)
		counters[strings.TrimSpace(match[1])] = value
	}
	if len(counters) > 0 {
		return counters
	}
	lineRe := regexp.MustCompile(`(?m)(outbound>>>[^\s:]+>>>traffic>>>(?:uplink|downlink))\D+(\d+)`)
	for _, match := range lineRe.FindAllStringSubmatch(stdout, -1) {
		value, _ := strconv.ParseUint(match[2], 10, 64)
		counters[strings.TrimSpace(match[1])] = value
	}
	return counters
}

func (s *serverState) queryXrayStats(server string, reset bool) map[string]any {
	args := []string{"api", "statsquery", "--server=" + server, "-timeout", "3", "-pattern", "outbound"}
	if reset {
		args = append(args, "-reset")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, "xray", args...)
	cmd.Env = s.xrayEnv()
	out, err := cmd.CombinedOutput()
	stdout := strings.TrimSpace(string(out))
	result := map[string]any{"ok": err == nil, "stdout": stdout, "stderr": "", "message": ""}
	if ctx.Err() == context.DeadlineExceeded {
		result["ok"] = false
		result["stderr"] = "xray api statsquery превысил лимит времени"
		return result
	}
	if err != nil {
		result["stderr"] = strings.TrimSpace(stdout + "\n" + err.Error())
		result["message"] = err.Error()
	}
	return result
}

func (s *serverState) xrayTrafficStats(cfg map[string]any, reset bool) map[string]any {
	info := xrayStatsAPIInfo(cfg)
	if info["enabled"] != true {
		return map[string]any{"ok": true, "enabled": false, "settings": info, "outbounds": []any{}, "groups": map[string]any{}}
	}
	if !reset {
		now := time.Now()
		s.metricsMu.Lock()
		if s.xrayStatsCache != nil && now.Sub(s.xrayStatsAt) < 15*time.Second {
			cached := s.xrayStatsCache
			s.metricsMu.Unlock()
			return cached
		}
		s.metricsMu.Unlock()
	}
	server := fmt.Sprint(info["server"])
	query := s.queryXrayStats(server, reset)
	if query["ok"] != true {
		return map[string]any{"ok": false, "enabled": true, "settings": info, "outbounds": []any{}, "groups": map[string]any{}, "stderr": query["stderr"]}
	}
	counters := parseXrayStatsOutput(fmt.Sprint(query["stdout"]))
	now := time.Now()
	prev := map[string]uint64{}
	elapsed := 0.0
	s.metricsMu.Lock()
	if reset {
		s.prevXrayStats = nil
		s.prevXrayStatsAt = time.Time{}
		s.xrayStatsCache = nil
		s.xrayStatsAt = time.Time{}
	} else {
		for key, value := range s.prevXrayStats {
			prev[key] = value
		}
		if !s.prevXrayStatsAt.IsZero() {
			elapsed = now.Sub(s.prevXrayStatsAt).Seconds()
		}
	}
	s.prevXrayStats = counters
	s.prevXrayStatsAt = now
	s.metricsMu.Unlock()

	type outboundCounter struct {
		Tag      string
		Protocol string
		Kind     string
		Uplink   uint64
		Downlink uint64
		UpRate   float64
		DownRate float64
	}
	protocols := xrayOutboundProtocols(cfg)
	byTag := map[string]*outboundCounter{}
	for name, value := range counters {
		parts := strings.Split(name, ">>>")
		if len(parts) < 4 || parts[0] != "outbound" || parts[2] != "traffic" {
			continue
		}
		tag := parts[1]
		direction := parts[len(parts)-1]
		item := byTag[tag]
		if item == nil {
			protocol := protocols[tag]
			item = &outboundCounter{Tag: tag, Protocol: protocol, Kind: xrayOutboundKind(tag, protocol)}
			byTag[tag] = item
		}
		if direction == "uplink" {
			item.Uplink = value
		} else if direction == "downlink" {
			item.Downlink = value
		}
		if elapsed > 0 {
			previous := prev[name]
			if value >= previous {
				rate := float64(value-previous) / elapsed
				if direction == "uplink" {
					item.UpRate = rate
				} else if direction == "downlink" {
					item.DownRate = rate
				}
			}
		}
	}
	for tag, protocol := range protocols {
		if byTag[tag] == nil {
			byTag[tag] = &outboundCounter{Tag: tag, Protocol: protocol, Kind: xrayOutboundKind(tag, protocol)}
		}
	}
	tags := make([]string, 0, len(byTag))
	for tag := range byTag {
		tags = append(tags, tag)
	}
	sort.Strings(tags)
	groups := map[string]map[string]any{}
	for _, key := range []string{"proxy", "direct", "block", "system", "other"} {
		groups[key] = map[string]any{"uplink": uint64(0), "downlink": uint64(0), "upRate": float64(0), "downRate": float64(0), "count": 0}
	}
	outbounds := []map[string]any{}
	for _, tag := range tags {
		item := byTag[tag]
		kind := item.Kind
		if _, ok := groups[kind]; !ok {
			kind = "other"
		}
		group := groups[kind]
		group["uplink"] = group["uplink"].(uint64) + item.Uplink
		group["downlink"] = group["downlink"].(uint64) + item.Downlink
		group["upRate"] = group["upRate"].(float64) + item.UpRate
		group["downRate"] = group["downRate"].(float64) + item.DownRate
		group["count"] = group["count"].(int) + 1
		outbounds = append(outbounds, map[string]any{"tag": item.Tag, "protocol": item.Protocol, "kind": item.Kind, "uplink": item.Uplink, "downlink": item.Downlink, "upRate": item.UpRate, "downRate": item.DownRate})
	}
	result := map[string]any{"ok": true, "enabled": true, "reset": reset, "settings": info, "server": server, "outbounds": outbounds, "groups": groups, "updatedAt": now.Format(time.RFC3339)}
	if !reset {
		s.metricsMu.Lock()
		s.xrayStatsCache = result
		s.xrayStatsAt = now
		s.metricsMu.Unlock()
	}
	return result
}

func (s *serverState) systemMetrics() map[string]any {
	cpu := loadAverage()
	cpu["percent"] = s.cpuPercent()
	return map[string]any{
		"cpu":       cpu,
		"memory":    memoryStats(),
		"tcp":       tcpStats(),
		"conntrack": conntrackStats(),
		"disk":      systemDiskInfo(),
		"traffic":   s.trafficStats(),
		"uptime":    routerUptimeSeconds(),
	}
}

func systemDiskInfo() map[string]any {
	if _, err := os.Stat("/overlay"); err == nil {
		info := diskInfo("/overlay")
		info["label"] = "overlay"
		return info
	}
	info := diskInfo("/")
	info["label"] = "/"
	return info
}

func run(name string, args ...string) map[string]any {
	cmd := exec.Command(name, args...)
	out, err := cmd.CombinedOutput()
	stdout := strings.TrimSpace(string(out))
	result := map[string]any{"ok": err == nil, "code": 0, "stdout": stdout, "stderr": "", "message": ""}
	if err != nil {
		result["message"] = err.Error()
		result["stderr"] = err.Error()
	}
	return result
}

func runTimeout(timeout time.Duration, name string, args ...string) map[string]any {
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, name, args...)
	out, err := cmd.CombinedOutput()
	stdout := strings.TrimSpace(string(out))
	result := map[string]any{"ok": err == nil, "code": 0, "stdout": stdout, "stderr": "", "message": ""}
	if ctx.Err() == context.DeadlineExceeded {
		result["ok"] = false
		result["stderr"] = "команда превысила лимит времени"
		result["message"] = ctx.Err().Error()
		return result
	}
	if err != nil {
		result["message"] = err.Error()
		result["stderr"] = err.Error()
	}
	return result
}

func (s *serverState) xrayEnv() []string {
	env := os.Environ()
	if strings.TrimSpace(s.cfg.GeoDir) != "" {
		env = append(env, "XRAY_LOCATION_ASSET="+s.cfg.GeoDir, "V2RAY_LOCATION_ASSET="+s.cfg.GeoDir)
	}
	return env
}

const (
	ruOpenRayFirewallNftPath       = "/etc/ruopenray-ui/firewall.nft"
	ruOpenRayFirewallLegacyNftPath = "/etc/nftables.d/ruopenray.nft"
	ruOpenRayFirewallHotplugPath   = "/etc/hotplug.d/iface/90-ruopenray-tproxy"
)

func firewallPayloadString(payload map[string]any, key, fallback string) string {
	value := strings.TrimSpace(fmt.Sprint(payload[key]))
	if value == "" || value == "<nil>" {
		return fallback
	}
	return value
}

func firewallPortList(payload map[string]any) []string {
	if firewallPayloadString(payload, "portMode", "custom") == "all" {
		return []string{}
	}
	ports := []string{}
	for _, item := range stringList(payload["ports"]) {
		clean := strings.ReplaceAll(strings.TrimSpace(item), ":", "-")
		if regexp.MustCompile(`^\d+(-\d+)?$`).MatchString(clean) {
			ports = append(ports, clean)
		}
	}
	if len(ports) == 0 {
		return []string{"80", "443"}
	}
	return ports
}

func firewallIPList(value any) []string {
	out := []string{}
	for _, item := range stringList(value) {
		if net.ParseIP(item) != nil {
			out = append(out, item)
		}
	}
	return out
}

func nftSet(items []string) string {
	if len(items) == 0 {
		return ""
	}
	return "{ " + strings.Join(items, ", ") + " }"
}

func firewallDportExpression(ports []string, protocol string) string {
	if len(ports) == 0 {
		return ""
	}
	if protocol == "tcp" {
		return " tcp dport " + nftSet(ports)
	}
	return " th dport " + nftSet(ports)
}

func firewallNativeNft(payload map[string]any) (string, map[string]any) {
	routerMode := firewallPayloadString(payload, "routerMode", "tproxy")
	if routerMode != "redirect" {
		routerMode = "tproxy"
	}
	bypassMode := firewallPayloadString(payload, "bypassMode", "off")
	if bypassMode != "bypass" && bypassMode != "redirect" {
		bypassMode = "off"
	}
	deviceMode := firewallPayloadString(payload, "deviceMode", "all")
	if deviceMode != "selected" && deviceMode != "exclude" {
		deviceMode = "all"
	}
	lanInterface := firewallPayloadString(payload, "lanInterface", "br-lan")
	transparentPort := number(payload["transparentPort"], 52345)
	if transparentPort <= 0 || transparentPort > 65535 {
		transparentPort = 52345
	}
	ports := firewallPortList(payload)
	devices := firewallIPList(payload["devices"])
	blockQuic := boolPayload(payload, "blockQuic", true)
	localBypass := []string{"0.0.0.0/8", "10.0.0.0/8", "100.64.0.0/10", "127.0.0.0/8", "169.254.0.0/16", "172.16.0.0/12", "192.168.0.0/16", "224.0.0.0/3"}
	setLines := []string{}
	chainLines := []string{"  chain prerouting {"}
	if routerMode == "redirect" {
		chainLines = append(chainLines, "    type nat hook prerouting priority dstnat; policy accept;")
	} else {
		chainLines = append(chainLines, "    type filter hook prerouting priority mangle; policy accept;")
	}
	chainLines = append(chainLines,
		fmt.Sprintf("    iifname != %q return", lanInterface),
		"    ip daddr "+nftSet(localBypass)+" return",
	)
	if deviceMode == "exclude" && len(devices) > 0 {
		chainLines = append(chainLines, "    ip saddr "+nftSet(devices)+" return")
	}
	if blockQuic {
		chainLines = append(chainLines, fmt.Sprintf("    iifname %q udp dport 443 drop comment %q", lanInterface, "RuOpenRay Block QUIC"))
	}
	if bypassMode == "bypass" {
		setLines = append(setLines, "  set bypass4 { type ipv4_addr; flags interval; elements = "+nftSet([]string{"10.0.0.0/8", "127.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"})+"; }")
		chainLines = append(chainLines,
			"    ip daddr @bypass4 return",
		)
	}
	targetPrefix := fmt.Sprintf("    iifname %q ", lanInterface)
	if deviceMode == "selected" && len(devices) > 0 {
		targetPrefix += "ip saddr " + nftSet(devices) + " "
	}
	if bypassMode == "redirect" {
		setLines = append(setLines, "  set proxy4 { type ipv4_addr; flags interval; }")
		targetPrefix += "ip daddr @proxy4 "
	}
	if routerMode == "redirect" {
		redirectMatch := "meta l4proto tcp"
		if len(ports) > 0 {
			redirectMatch = "tcp dport " + nftSet(ports)
		}
		chainLines = append(chainLines, targetPrefix+redirectMatch+" redirect to :"+strconv.Itoa(transparentPort))
	} else {
		chainLines = append(chainLines, targetPrefix+"meta l4proto { tcp, udp }"+firewallDportExpression(ports, "meta")+" counter tproxy ip to :"+strconv.Itoa(transparentPort)+" meta mark set 1")
	}
	chainLines = append(chainLines, "  }")
	lines := []string{"table inet ruopenray {"}
	lines = append(lines, setLines...)
	lines = append(lines, chainLines...)
	lines = append(lines, "}")
	meta := map[string]any{
		"routerMode":      routerMode,
		"bypassMode":      bypassMode,
		"deviceMode":      deviceMode,
		"devices":         devices,
		"ports":           ports,
		"portMode":        firewallPayloadString(payload, "portMode", "custom"),
		"blockQuic":       blockQuic,
		"lanInterface":    lanInterface,
		"transparentPort": transparentPort,
		"path":            ruOpenRayFirewallNftPath,
	}
	return strings.Join(lines, "\n") + "\n", meta
}

func firewallHotplugScript() string {
	return `#!/bin/sh
[ "$ACTION" = "ifup" ] || [ "$ACTION" = "ifupdate" ] || [ "$ACTION" = "ifdown" ] || exit 0
NFT_FILE="/etc/ruopenray-ui/firewall.nft"
nft delete table inet ruopenray 2>/dev/null
[ -s "$NFT_FILE" ] && nft -f "$NFT_FILE" 2>/dev/null
ip rule del fwmark 1 table 100 2>/dev/null
ip route flush table 100 2>/dev/null
ip rule add fwmark 1 table 100 2>/dev/null
ip route add local 0.0.0.0/0 dev lo table 100 2>/dev/null
exit 0
`
}

func applyTProxyPolicyRouting(enabled bool) []map[string]any {
	if !enabled {
		return []map[string]any{
			runTimeout(5*time.Second, "ip", "rule", "del", "fwmark", "1", "table", "100"),
			runTimeout(5*time.Second, "ip", "route", "flush", "table", "100"),
		}
	}
	return []map[string]any{
		runTimeout(5*time.Second, "ip", "rule", "del", "fwmark", "1", "table", "100"),
		runTimeout(5*time.Second, "ip", "route", "flush", "table", "100"),
		runTimeout(5*time.Second, "ip", "rule", "add", "fwmark", "1", "table", "100"),
		runTimeout(5*time.Second, "ip", "route", "add", "local", "0.0.0.0/0", "dev", "lo", "table", "100"),
	}
}

func stepOK(step map[string]any) bool {
	stderr := strings.TrimSpace(fmt.Sprint(step["stderr"]))
	stdout := strings.TrimSpace(fmt.Sprint(step["stdout"]))
	message := strings.TrimSpace(fmt.Sprint(step["message"]))
	combined := strings.ToLower(stderr + " " + stdout + " " + message)
	missing := strings.Contains(combined, "no such file") || strings.Contains(combined, "not found") || strings.Contains(combined, "no such process")
	if strings.Contains(combined, "error:") && !missing {
		return false
	}
	if step["ok"] == true {
		return true
	}
	return missing
}

func allStepsOK(steps []map[string]any) bool {
	for _, step := range steps {
		if !stepOK(step) {
			return false
		}
	}
	return true
}

func (s *serverState) firewallStatus() map[string]any {
	nftExists := false
	nftBody := ""
	if body, err := os.ReadFile(ruOpenRayFirewallNftPath); err == nil {
		nftExists = true
		nftBody = string(body)
	}
	hotplugExists := false
	if _, err := os.Stat(ruOpenRayFirewallHotplugPath); err == nil {
		hotplugExists = true
	}
	nftActive := runTimeout(5*time.Second, "nft", "list", "table", "inet", "ruopenray")
	ipRules := runTimeout(5*time.Second, "ip", "rule", "show")
	ipRoutes := runTimeout(5*time.Second, "ip", "route", "show", "table", "100")
	ipRuleActive := strings.Contains(fmt.Sprint(ipRules["stdout"]), "fwmark 0x1") && strings.Contains(fmt.Sprint(ipRules["stdout"]), "lookup 100")
	ipRouteActive := strings.Contains(fmt.Sprint(ipRoutes["stdout"]), "local") && strings.Contains(fmt.Sprint(ipRoutes["stdout"]), "dev lo")
	routerMode := "unknown"
	if strings.Contains(nftBody, " tproxy ") {
		routerMode = "tproxy"
	} else if strings.Contains(nftBody, " redirect ") {
		routerMode = "redirect"
	}
	return map[string]any{
		"ok":          true,
		"available":   runtime.GOOS != "windows" && commandExists("nft"),
		"persistent":  nftExists,
		"active":      nftActive["ok"] == true,
		"nftPath":     ruOpenRayFirewallNftPath,
		"hotplugPath": ruOpenRayFirewallHotplugPath,
		"hotplug":     hotplugExists,
		"routerMode":  routerMode,
		"ipRule":      ipRuleActive,
		"ipRoute":     ipRouteActive,
		"nft":         nftActive,
		"ipRules":     ipRules,
		"ipRoutes":    ipRoutes,
		"tproxyModules": tproxyModuleStatus(func() string {
			if commandExists("apk") {
				return "apk"
			}
			if commandExists("opkg") {
				return "opkg"
			}
			return ""
		}()),
		"needsPolicyFix": routerMode == "tproxy" && (!ipRuleActive || !ipRouteActive || !hotplugExists),
	}
}

func (s *serverState) firewallSnapshot() map[string]any {
	status := s.firewallStatus()
	nftBody := ""
	if body, err := os.ReadFile(ruOpenRayFirewallNftPath); err == nil {
		nftBody = string(body)
	}
	hotplugBody := ""
	if body, err := os.ReadFile(ruOpenRayFirewallHotplugPath); err == nil {
		hotplugBody = string(body)
	}
	return map[string]any{
		"ok":          true,
		"status":      status,
		"nftBody":     nftBody,
		"hotplugBody": hotplugBody,
	}
}

func (s *serverState) applyFirewall(payload map[string]any) map[string]any {
	if runtime.GOOS == "windows" || !commandExists("nft") {
		return map[string]any{"ok": false, "available": false, "error": "nftables недоступен на этой системе"}
	}
	body, meta := firewallNativeNft(payload)
	routerMode := fmt.Sprint(meta["routerMode"])
	steps := []map[string]any{}
	if err := os.MkdirAll(filepath.Dir(ruOpenRayFirewallNftPath), 0o755); err != nil {
		return map[string]any{"ok": false, "error": err.Error(), "nft": body, "meta": meta}
	}
	if err := os.WriteFile(ruOpenRayFirewallNftPath, []byte(body), 0o644); err != nil {
		return map[string]any{"ok": false, "error": err.Error(), "nft": body, "meta": meta}
	}
	_ = os.Remove(ruOpenRayFirewallLegacyNftPath)
	if routerMode == "tproxy" {
		_ = os.MkdirAll(filepath.Dir(ruOpenRayFirewallHotplugPath), 0o755)
		if err := os.WriteFile(ruOpenRayFirewallHotplugPath, []byte(firewallHotplugScript()), 0o755); err != nil {
			return map[string]any{"ok": false, "error": err.Error(), "nft": body, "meta": meta}
		}
	} else {
		_ = os.Remove(ruOpenRayFirewallHotplugPath)
	}
	if commandExists("/etc/init.d/firewall") {
		steps = append(steps, runTimeout(20*time.Second, "/etc/init.d/firewall", "reload"))
	}
	steps = append(steps, runTimeout(5*time.Second, "nft", "delete", "table", "inet", "ruopenray"))
	steps = append(steps, runTimeout(10*time.Second, "nft", "-f", ruOpenRayFirewallNftPath))
	steps = append(steps, applyTProxyPolicyRouting(routerMode == "tproxy")...)
	status := s.firewallStatus()
	ok := allStepsOK(steps) && status["active"] == true
	if routerMode == "tproxy" {
		ok = ok && status["ipRule"] == true && status["ipRoute"] == true
	}
	return map[string]any{"ok": ok, "nft": body, "meta": meta, "steps": steps, "status": status}
}

func (s *serverState) restoreFirewallSnapshot(payload map[string]any) map[string]any {
	rawSnapshot := payload
	if nested, ok := payload["snapshot"].(map[string]any); ok {
		rawSnapshot = nested
	}
	nftBody := cleanPayloadString(rawSnapshot, "nftBody")
	hotplugBody := cleanPayloadString(rawSnapshot, "hotplugBody")
	if strings.TrimSpace(nftBody) == "" {
		return s.disableFirewall()
	}
	steps := []map[string]any{}
	if err := os.MkdirAll(filepath.Dir(ruOpenRayFirewallNftPath), 0o755); err != nil {
		return map[string]any{"ok": false, "error": err.Error()}
	}
	if err := os.WriteFile(ruOpenRayFirewallNftPath, []byte(nftBody), 0o644); err != nil {
		return map[string]any{"ok": false, "error": err.Error()}
	}
	if strings.TrimSpace(hotplugBody) != "" {
		_ = os.MkdirAll(filepath.Dir(ruOpenRayFirewallHotplugPath), 0o755)
		if err := os.WriteFile(ruOpenRayFirewallHotplugPath, []byte(hotplugBody), 0o755); err != nil {
			return map[string]any{"ok": false, "error": err.Error()}
		}
	} else {
		_ = os.Remove(ruOpenRayFirewallHotplugPath)
	}
	_ = os.Remove(ruOpenRayFirewallLegacyNftPath)
	if commandExists("/etc/init.d/firewall") {
		steps = append(steps, runTimeout(20*time.Second, "/etc/init.d/firewall", "reload"))
	}
	if commandExists("nft") {
		steps = append(steps, runTimeout(5*time.Second, "nft", "delete", "table", "inet", "ruopenray"))
		steps = append(steps, runTimeout(10*time.Second, "nft", "-f", ruOpenRayFirewallNftPath))
	}
	routerMode := "redirect"
	if strings.Contains(nftBody, " tproxy ") {
		routerMode = "tproxy"
	}
	steps = append(steps, applyTProxyPolicyRouting(routerMode == "tproxy")...)
	status := s.firewallStatus()
	ok := allStepsOK(steps) && status["active"] == true
	if routerMode == "tproxy" {
		ok = ok && status["ipRule"] == true && status["ipRoute"] == true
	}
	return map[string]any{"ok": ok, "steps": steps, "status": status}
}

func (s *serverState) disableFirewall() map[string]any {
	steps := []map[string]any{}
	_ = os.Remove(ruOpenRayFirewallNftPath)
	_ = os.Remove(ruOpenRayFirewallLegacyNftPath)
	_ = os.Remove(ruOpenRayFirewallHotplugPath)
	if commandExists("/etc/init.d/firewall") {
		steps = append(steps, runTimeout(20*time.Second, "/etc/init.d/firewall", "reload"))
	}
	if commandExists("nft") {
		steps = append(steps, runTimeout(5*time.Second, "nft", "delete", "table", "inet", "ruopenray"))
	}
	steps = append(steps, applyTProxyPolicyRouting(false)...)
	status := s.firewallStatus()
	return map[string]any{"ok": allStepsOK(steps), "steps": steps, "status": status}
}

func (s *serverState) lanDNSUpstreamStatus(plan map[string]any) map[string]any {
	available := runtime.GOOS != "windows" && commandExists("uci")
	result := map[string]any{
		"ok":         true,
		"available":  available,
		"mode":       "unknown",
		"noresolv":   false,
		"servers":    []string{},
		"routerLan":  "192.168.1.1",
		"xrayTarget": "127.0.0.1#5353",
	}
	if !available {
		result["mode"] = "manual"
		result["hint"] = "UCI недоступен, настройте dnsmasq вручную."
		if plan != nil {
			result["plan"] = plan
		}
		return result
	}
	noresolv := strings.TrimSpace(fmt.Sprint(run("uci", "-q", "get", "dhcp.@dnsmasq[0].noresolv")["stdout"])) == "1"
	servers := dnsmasqServerList()
	lanIP := firstLine(fmt.Sprint(run("uci", "-q", "get", "network.lan.ipaddr")["stdout"]), "")
	if lanIP == "" || lanIP == "<nil>" {
		lanIP = "192.168.1.1"
	}
	if strings.Contains(lanIP, "/") {
		lanIP = strings.SplitN(lanIP, "/", 2)[0]
	}
	mode := "system"
	if noresolv && len(servers) == 1 && servers[0] == "127.0.0.1#5353" {
		mode = "xray"
	} else if noresolv && len(servers) > 0 {
		mode = "upstream"
	}
	result["mode"] = mode
	result["noresolv"] = noresolv
	result["servers"] = servers
	result["routerLan"] = lanIP
	result["readiness"] = s.lanDNSReadiness()
	if plan != nil {
		result["plan"] = plan
	}
	return result
}

func dnsmasqServerList() []string {
	out := fmt.Sprint(run("uci", "-q", "get", "dhcp.@dnsmasq[0].server")["stdout"])
	fields := strings.Fields(strings.TrimSpace(out))
	servers := []string{}
	for _, item := range fields {
		item = strings.Trim(item, "'\" \t\r\n")
		if item != "" && item != "<nil>" {
			servers = append(servers, item)
		}
	}
	return servers
}

func normalizeDnsmasqServer(value string) string {
	raw := strings.TrimSpace(value)
	if raw == "" {
		return ""
	}
	if strings.Contains(raw, "#") {
		return raw
	}
	if strings.HasPrefix(raw, "[") {
		if strings.Contains(raw, "]:") {
			return strings.Replace(raw, "]:", "]#", 1)
		}
		return raw + "#53"
	}
	if host, port, err := net.SplitHostPort(raw); err == nil && host != "" && port != "" {
		return strings.Trim(host, "[]") + "#" + port
	}
	if strings.Count(raw, ":") == 1 {
		parts := strings.Split(raw, ":")
		if parts[0] != "" && parts[1] != "" {
			return parts[0] + "#" + parts[1]
		}
	}
	return raw + "#53"
}

func (s *serverState) applyLANDNSUpstream(payload map[string]any) map[string]any {
	if runtime.GOOS == "windows" || !commandExists("uci") {
		return map[string]any{"ok": false, "available": false, "error": "UCI недоступен на этой системе"}
	}
	mode := strings.TrimSpace(fmt.Sprint(payload["mode"]))
	if mode == "" {
		mode = "xray"
	}
	restart := true
	if value, ok := payload["restart"].(bool); ok {
		restart = value
	}
	dryRun := boolPayload(payload, "dryRun", false)
	plan, err := lanDNSCommandPlan(mode, fmt.Sprint(payload["upstream"]), restart)
	if err != nil {
		status := s.lanDNSUpstreamStatus(plan)
		status["ok"] = false
		status["error"] = err.Error()
		return status
	}
	if dryRun {
		status := s.lanDNSUpstreamStatus(plan)
		status["ok"] = true
		status["dryRun"] = true
		return status
	}
	readiness := s.lanDNSReadiness()
	if mode == "xray" && readiness["ready"] != true {
		status := s.lanDNSUpstreamStatus(plan)
		status["ok"] = false
		status["readiness"] = readiness
		status["error"] = "DNS inbound Xray еще не готов. Сначала примените конфигурацию Xray и убедитесь, что порт 127.0.0.1:5353 слушает."
		return status
	}
	steps := []map[string]any{}
	for _, command := range planCommands(plan) {
		if len(command) == 0 {
			continue
		}
		if command[0] == "/etc/init.d/dnsmasq" {
			steps = append(steps, runTimeout(15*time.Second, command[0], command[1:]...))
			continue
		}
		steps = append(steps, run(command[0], command[1:]...))
	}
	ok := true
	for _, step := range steps {
		if step["ok"] != true {
			ok = false
		}
	}
	status := s.lanDNSUpstreamStatus(plan)
	status["ok"] = ok
	status["steps"] = steps
	return status
}

func lanDNSCommandPlan(mode, upstream string, restart bool) (map[string]any, error) {
	commands := [][]string{}
	display := []string{}
	warnings := []string{}
	switch mode {
	case "system":
		commands = append(commands,
			[]string{"uci", "-q", "delete", "dhcp.@dnsmasq[0].noresolv"},
			[]string{"uci", "-q", "delete", "dhcp.@dnsmasq[0].server"},
		)
	case "xray":
		commands = append(commands,
			[]string{"uci", "set", "dhcp.@dnsmasq[0].noresolv=1"},
			[]string{"uci", "-q", "delete", "dhcp.@dnsmasq[0].server"},
			[]string{"uci", "add_list", "dhcp.@dnsmasq[0].server=127.0.0.1#5353"},
		)
		warnings = append(warnings, "Если Xray DNS inbound не запущен, устройства в LAN временно потеряют DNS.")
	case "upstream":
		server := normalizeDnsmasqServer(upstream)
		if server == "" {
			return nil, errors.New("Укажите адрес внешнего DNS или Pi-hole")
		}
		commands = append(commands,
			[]string{"uci", "set", "dhcp.@dnsmasq[0].noresolv=1"},
			[]string{"uci", "-q", "delete", "dhcp.@dnsmasq[0].server"},
			[]string{"uci", "add_list", "dhcp.@dnsmasq[0].server=" + server},
		)
	default:
		return nil, errors.New("Неизвестный режим LAN DNS")
	}
	commands = append(commands, []string{"uci", "commit", "dhcp"})
	if restart {
		commands = append(commands, []string{"/etc/init.d/dnsmasq", "restart"})
		warnings = append(warnings, "dnsmasq будет перезапущен, DNS может пропасть на несколько секунд.")
	}
	for _, command := range commands {
		display = append(display, shellCommandLine(command))
	}
	return map[string]any{"mode": mode, "commands": display, "argv": commands, "warnings": warnings}, nil
}

func planCommands(plan map[string]any) [][]string {
	commands := [][]string{}
	if typed, ok := plan["argv"].([][]string); ok {
		return typed
	}
	for _, raw := range anySlice(plan["argv"]) {
		row := stringSlice(raw)
		if len(row) > 0 {
			commands = append(commands, row)
		}
	}
	return commands
}

func shellCommandLine(args []string) string {
	quoted := make([]string, 0, len(args))
	for _, arg := range args {
		if arg == "" || strings.ContainsAny(arg, " \t'\"") {
			quoted = append(quoted, "'"+strings.ReplaceAll(arg, "'", "'\"'\"'")+"'")
			continue
		}
		quoted = append(quoted, arg)
	}
	return strings.Join(quoted, " ")
}

func (s *serverState) lanDNSReadiness() map[string]any {
	cfg, err := s.readActiveConfig()
	if err != nil {
		return map[string]any{"ready": false, "error": err.Error()}
	}
	inboundReady := false
	outboundReady := false
	ruleReady := false
	for _, item := range anySlice(cfg["inbounds"]) {
		inbound, ok := item.(map[string]any)
		if !ok || fmt.Sprint(inbound["tag"]) != "ruopenray_dns_in" {
			continue
		}
		port := number(inbound["port"], 0)
		listen := strings.TrimSpace(fmt.Sprint(inbound["listen"]))
		inboundReady = port == 5353 && (listen == "" || listen == "<nil>" || listen == "127.0.0.1")
	}
	for _, item := range anySlice(cfg["outbounds"]) {
		outbound, ok := item.(map[string]any)
		if ok && fmt.Sprint(outbound["tag"]) == "dns-out" && fmt.Sprint(outbound["protocol"]) == "dns" {
			outboundReady = true
		}
	}
	for _, item := range anySlice(getNested(cfg, "routing", "rules")) {
		rule, ok := item.(map[string]any)
		if !ok || fmt.Sprint(rule["outboundTag"]) != "dns-out" {
			continue
		}
		for _, tag := range stringSlice(rule["inboundTag"]) {
			if tag == "ruopenray_dns_in" {
				ruleReady = true
				break
			}
		}
	}
	portReady := tcpPortOpen("127.0.0.1:5353", 700*time.Millisecond)
	return map[string]any{
		"ready":    inboundReady && outboundReady && ruleReady && portReady,
		"inbound":  inboundReady,
		"outbound": outboundReady,
		"rule":     ruleReady,
		"port":     portReady,
	}
}

func tcpPortOpen(address string, timeout time.Duration) bool {
	conn, err := net.DialTimeout("tcp", address, timeout)
	if err != nil {
		return false
	}
	_ = conn.Close()
	return true
}

func (s *serverState) runXray(args ...string) map[string]any {
	cmd := exec.Command("xray", args...)
	cmd.Env = s.xrayEnv()
	out, err := cmd.CombinedOutput()
	stdout := strings.TrimSpace(string(out))
	result := map[string]any{"ok": err == nil, "code": 0, "stdout": stdout, "stderr": "", "message": ""}
	if err != nil {
		result["message"] = err.Error()
		result["stderr"] = err.Error()
	}
	return result
}

func concatCommandOutput(items ...map[string]any) string {
	var lines []string
	for _, item := range items {
		if item == nil {
			continue
		}
		if stdout := strings.TrimSpace(fmt.Sprint(item["stdout"])); stdout != "" && stdout != "<nil>" {
			lines = append(lines, stdout)
		}
		if stderr := strings.TrimSpace(fmt.Sprint(item["stderr"])); stderr != "" && stderr != "<nil>" {
			lines = append(lines, stderr)
		}
	}
	return strings.Join(lines, "\n\n")
}

func firstLine(value, fallback string) string {
	for _, line := range strings.Split(value, "\n") {
		if strings.TrimSpace(line) != "" {
			return strings.TrimSpace(line)
		}
	}
	return fallback
}

func lenArray(value any) int {
	items, ok := value.([]any)
	if !ok {
		return 0
	}
	return len(items)
}

func anySlice(value any) []any {
	items, ok := value.([]any)
	if !ok {
		return []any{}
	}
	return items
}

func stringSlice(value any) []string {
	switch typed := value.(type) {
	case []string:
		return typed
	case []any:
		out := make([]string, 0, len(typed))
		for _, item := range typed {
			text := strings.TrimSpace(fmt.Sprint(item))
			if text != "" && text != "<nil>" {
				out = append(out, text)
			}
		}
		return out
	case string:
		text := strings.TrimSpace(typed)
		if text == "" {
			return []string{}
		}
		return []string{text}
	default:
		return []string{}
	}
}

func getNested(root map[string]any, keys ...string) any {
	var current any = root
	for _, key := range keys {
		object, ok := current.(map[string]any)
		if !ok {
			return nil
		}
		current = object[key]
	}
	return current
}

func (s *serverState) serviceAction(action string) map[string]any {
	switch action {
	case "start", "stop", "restart", "enable", "disable":
	default:
		return map[string]any{"ok": false, "stderr": "Неподдерживаемое действие сервиса"}
	}
	var logMaintenance map[string]any
	var xrayEnable map[string]any
	if action == "start" || action == "restart" {
		logMaintenance = s.maintainLogFiles(true)
		if s.cfg.ServiceName == "xray" {
			xrayEnable = enableXrayServiceConfig()
		}
	}
	delay := s.waitBeforeXrayAction(action)
	if runtime.GOOS == "windows" {
		return map[string]any{"ok": true, "stdout": "dev-mode: был бы выполнен сервис " + s.cfg.ServiceName + " " + action, "logMaintenance": logMaintenance, "delay": delay}
	}
	result := run("/etc/init.d/"+s.cfg.ServiceName, action)
	if logMaintenance != nil {
		result["logMaintenance"] = logMaintenance
	}
	if xrayEnable != nil {
		result["xrayEnable"] = xrayEnable
		result["stdout"] = concatCommandOutput(xrayEnable, result)
	}
	if delay != nil {
		result["delay"] = delay
		result["stdout"] = concatCommandOutput(delay, result)
	}
	return result
}

func (s *serverState) changePassword(payload map[string]any) map[string]any {
	current := fmt.Sprint(payload["currentPassword"])
	next := strings.TrimSpace(fmt.Sprint(payload["newPassword"]))
	confirm := strings.TrimSpace(fmt.Sprint(payload["confirmPassword"]))
	if subtle.ConstantTimeCompare([]byte(current), []byte(s.cfg.Password)) != 1 {
		return map[string]any{"ok": false, "stderr": "Текущий пароль не подошел"}
	}
	if len(next) < 8 {
		return map[string]any{"ok": false, "stderr": "Новый пароль должен быть не короче 8 символов"}
	}
	if next != confirm {
		return map[string]any{"ok": false, "stderr": "Пароли не совпадают"}
	}

	steps := []map[string]any{}
	persisted := false
	if runtime.GOOS != "windows" && commandExists("uci") {
		set := run("uci", "set", "ruopenray-ui.main.password="+next)
		commit := run("uci", "commit", "ruopenray-ui")
		steps = append(steps, set, commit)
		persisted = set["ok"] == true && commit["ok"] == true
	} else if runtime.GOOS == "windows" {
		persisted = true
	}
	if runtime.GOOS != "windows" && !persisted {
		return map[string]any{"ok": false, "stderr": "Не удалось сохранить пароль в UCI", "steps": steps}
	}

	s.cfg.Password = next
	s.sessions = map[string]bool{}
	return map[string]any{
		"ok":        true,
		"persisted": persisted,
		"steps":     steps,
		"stdout":    "Пароль панели изменен. Войдите заново.",
	}
}

const (
	defaultAccessLogPath = "/var/log/xray/access.log"
	defaultErrorLogPath  = "/var/log/xray/error.log"
)

func (s *serverState) loggingSettingsPath() string {
	return filepath.Join(s.cfg.DataDir, "logging-settings.json")
}

func defaultLoggingSettings() map[string]any {
	return map[string]any{
		"maxSizeMb":      2,
		"rotateCopies":   1,
		"clearOnRestart": false,
	}
}

func (s *serverState) readLoggingRuntimeSettings() map[string]any {
	settings := defaultLoggingSettings()
	body, err := os.ReadFile(s.loggingSettingsPath())
	if err != nil {
		return settings
	}
	var saved map[string]any
	if json.Unmarshal(body, &saved) != nil {
		return settings
	}
	for key, value := range saved {
		settings[key] = value
	}
	return settings
}

func (s *serverState) writeLoggingRuntimeSettings(settings map[string]any) error {
	if err := os.MkdirAll(s.cfg.DataDir, 0o755); err != nil {
		return err
	}
	body, err := json.MarshalIndent(settings, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(s.loggingSettingsPath(), body, 0o600)
}

func (s *serverState) serviceSettingsPath() string {
	return filepath.Join(s.cfg.DataDir, "service-settings.json")
}

func defaultServiceSettings() map[string]any {
	return map[string]any{
		"startupDelaySec": 0,
		"applyDelaySec":   0,
		"goMemLimit":      "48MiB",
		"goGC":            60,
		"downloadMirror":  "direct",
		"mirrorPrefix":    "",
	}
}

func (s *serverState) readServiceRuntimeSettings() map[string]any {
	settings := defaultServiceSettings()
	body, err := os.ReadFile(s.serviceSettingsPath())
	if err != nil {
		if runtime.GOOS != "windows" && commandExists("uci") {
			if value := firstLine(fmt.Sprint(run("uci", "-q", "get", "ruopenray-ui.main.start_delay")["stdout"]), ""); value != "" {
				settings["startupDelaySec"] = number(value, 0)
			}
			if value := firstLine(fmt.Sprint(run("uci", "-q", "get", "ruopenray-ui.main.apply_delay")["stdout"]), ""); value != "" {
				settings["applyDelaySec"] = number(value, 0)
			}
			if value := firstLine(fmt.Sprint(run("uci", "-q", "get", "ruopenray-ui.main.go_memlimit")["stdout"]), ""); value != "" {
				settings["goMemLimit"] = value
			}
			if value := firstLine(fmt.Sprint(run("uci", "-q", "get", "ruopenray-ui.main.go_gc")["stdout"]), ""); value != "" {
				settings["goGC"] = number(value, 60)
			}
			if value := firstLine(fmt.Sprint(run("uci", "-q", "get", "ruopenray-ui.main.download_mirror")["stdout"]), ""); value != "" {
				settings["downloadMirror"] = value
			}
			if value := firstLine(fmt.Sprint(run("uci", "-q", "get", "ruopenray-ui.main.mirror_prefix")["stdout"]), ""); value != "" {
				settings["mirrorPrefix"] = value
			}
		}
		return settings
	}
	var saved map[string]any
	if json.Unmarshal(body, &saved) != nil {
		return settings
	}
	for key, value := range saved {
		settings[key] = value
	}
	return settings
}

func (s *serverState) writeServiceRuntimeSettings(settings map[string]any) error {
	if err := os.MkdirAll(s.cfg.DataDir, 0o755); err != nil {
		return err
	}
	body, err := json.MarshalIndent(settings, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(s.serviceSettingsPath(), body, 0o600)
}

func clampSeconds(value any, fallback int, max int) int {
	out := number(value, fallback)
	if out < 0 {
		return 0
	}
	if out > max {
		return max
	}
	return out
}

func cleanMirrorPrefix(value any) string {
	raw := strings.TrimSpace(fmt.Sprint(value))
	if raw == "" || raw == "<nil>" {
		return ""
	}
	if !strings.HasPrefix(raw, "http://") && !strings.HasPrefix(raw, "https://") {
		return ""
	}
	return raw
}

func cleanGoMemLimit(value any) string {
	raw := strings.TrimSpace(fmt.Sprint(value))
	if raw == "" || raw == "<nil>" {
		return "48MiB"
	}
	matched, _ := regexp.MatchString(`^\d+(?:MiB|GiB|MB|GB|B)?$`, raw)
	if !matched {
		return "48MiB"
	}
	return raw
}

func (s *serverState) serviceSettings() map[string]any {
	settings := s.readServiceRuntimeSettings()
	startupDelay := clampSeconds(settings["startupDelaySec"], 0, 180)
	applyDelay := clampSeconds(settings["applyDelaySec"], 0, 60)
	goMemLimit := cleanGoMemLimit(settings["goMemLimit"])
	goGC := number(settings["goGC"], 60)
	if goGC < 20 {
		goGC = 20
	}
	if goGC > 200 {
		goGC = 200
	}
	mirror := strings.ToLower(strings.TrimSpace(fmt.Sprint(settings["downloadMirror"])))
	prefix := cleanMirrorPrefix(settings["mirrorPrefix"])
	if mirror != "custom" {
		mirror = "direct"
		prefix = ""
	}
	return map[string]any{
		"ok":              true,
		"startupDelaySec": startupDelay,
		"applyDelaySec":   applyDelay,
		"goMemLimit":      goMemLimit,
		"goGC":            goGC,
		"downloadMirror":  mirror,
		"mirrorPrefix":    prefix,
		"uci": map[string]any{
			"available": runtime.GOOS != "windows" && commandExists("uci"),
			"package":   "ruopenray-ui",
		},
	}
}

func (s *serverState) saveServiceSettings(payload map[string]any) map[string]any {
	settings := s.serviceSettings()
	settings["startupDelaySec"] = clampSeconds(payload["startupDelaySec"], number(settings["startupDelaySec"], 0), 180)
	settings["applyDelaySec"] = clampSeconds(payload["applyDelaySec"], number(settings["applyDelaySec"], 0), 60)
	settings["goMemLimit"] = cleanGoMemLimit(payload["goMemLimit"])
	goGC := number(payload["goGC"], number(settings["goGC"], 60))
	if goGC < 20 {
		goGC = 20
	}
	if goGC > 200 {
		goGC = 200
	}
	settings["goGC"] = goGC
	mirror := strings.ToLower(strings.TrimSpace(fmt.Sprint(payload["downloadMirror"])))
	prefix := cleanMirrorPrefix(payload["mirrorPrefix"])
	if mirror != "custom" || prefix == "" {
		mirror = "direct"
		prefix = ""
	}
	settings["downloadMirror"] = mirror
	settings["mirrorPrefix"] = prefix
	delete(settings, "uci")

	if err := s.writeServiceRuntimeSettings(settings); err != nil {
		return map[string]any{"ok": false, "stderr": err.Error(), "settings": s.serviceSettings()}
	}

	steps := []map[string]any{}
	persisted := false
	if runtime.GOOS != "windows" && commandExists("uci") {
		steps = append(steps, run("uci", "set", fmt.Sprintf("ruopenray-ui.main.start_delay=%d", settings["startupDelaySec"])))
		steps = append(steps, run("uci", "set", fmt.Sprintf("ruopenray-ui.main.apply_delay=%d", settings["applyDelaySec"])))
		steps = append(steps, run("uci", "set", "ruopenray-ui.main.go_memlimit="+fmt.Sprint(settings["goMemLimit"])))
		steps = append(steps, run("uci", "set", fmt.Sprintf("ruopenray-ui.main.go_gc=%d", settings["goGC"])))
		steps = append(steps, run("uci", "set", "ruopenray-ui.main.download_mirror="+fmt.Sprint(settings["downloadMirror"])))
		steps = append(steps, run("uci", "set", "ruopenray-ui.main.mirror_prefix="+fmt.Sprint(settings["mirrorPrefix"])))
		steps = append(steps, run("uci", "commit", "ruopenray-ui"))
		persisted = true
		for _, step := range steps {
			persisted = persisted && step["ok"] == true
		}
	}
	return map[string]any{
		"ok":        true,
		"settings":  s.serviceSettings(),
		"persisted": persisted,
		"steps":     steps,
		"stdout":    "Настройки сервиса сохранены",
	}
}

func (s *serverState) applyDelay() time.Duration {
	settings := s.serviceSettings()
	seconds := number(settings["applyDelaySec"], 0)
	if seconds <= 0 {
		return 0
	}
	if seconds > 60 {
		seconds = 60
	}
	return time.Duration(seconds) * time.Second
}

func (s *serverState) waitBeforeXrayAction(action string) map[string]any {
	if action != "start" && action != "restart" {
		return nil
	}
	delay := s.applyDelay()
	if delay <= 0 {
		return nil
	}
	time.Sleep(delay)
	return map[string]any{"ok": true, "stdout": fmt.Sprintf("Задержка перед %s: %s", action, delay)}
}

func (s *serverState) mirrorURL(rawURL string) string {
	settings := s.serviceSettings()
	if fmt.Sprint(settings["downloadMirror"]) != "custom" {
		return rawURL
	}
	prefix := strings.TrimSpace(fmt.Sprint(settings["mirrorPrefix"]))
	if prefix == "" {
		return rawURL
	}
	if strings.Contains(prefix, "{url}") {
		return strings.ReplaceAll(prefix, "{url}", url.QueryEscape(rawURL))
	}
	if strings.HasSuffix(prefix, "/") {
		return prefix + rawURL
	}
	return prefix + rawURL
}

func validLogLevel(value string) string {
	level := strings.ToLower(strings.TrimSpace(value))
	switch level {
	case "none", "error", "warning", "info", "debug":
		return level
	default:
		return "warning"
	}
}

func cleanLogPath(value string, fallback string) string {
	clean := strings.TrimSpace(value)
	if clean == "" || clean == "<nil>" {
		return fallback
	}
	clean = filepath.Clean(clean)
	if runtime.GOOS != "windows" && !strings.HasPrefix(clean, "/") {
		return fallback
	}
	return clean
}

func intSetting(settings map[string]any, key string, fallback int) int {
	if value, ok := settings[key]; ok {
		return number(value, fallback)
	}
	return fallback
}

func fileSize(path string) int64 {
	info, err := os.Stat(path)
	if err != nil || info.IsDir() {
		return 0
	}
	return info.Size()
}

func (s *serverState) loggingSettings() map[string]any {
	cfg, err := s.readActiveConfig()
	if err != nil {
		return map[string]any{"ok": false, "error": err.Error()}
	}
	logConfig, _ := cfg["log"].(map[string]any)
	if logConfig == nil {
		logConfig = map[string]any{}
	}
	runtimeSettings := s.readLoggingRuntimeSettings()
	accessRaw := strings.TrimSpace(fmt.Sprint(logConfig["access"]))
	errorRaw := strings.TrimSpace(fmt.Sprint(logConfig["error"]))
	accessPath := cleanLogPath(accessRaw, defaultAccessLogPath)
	errorPath := cleanLogPath(errorRaw, defaultErrorLogPath)
	return map[string]any{
		"ok":               true,
		"level":            validLogLevel(fmt.Sprint(logConfig["loglevel"])),
		"accessLog":        accessRaw != "" && accessRaw != "<nil>",
		"accessPath":       accessPath,
		"accessSize":       fileSize(accessPath),
		"errorLog":         errorRaw != "" && errorRaw != "<nil>",
		"errorPath":        errorPath,
		"errorSize":        fileSize(errorPath),
		"dnsLog":           boolPayload(logConfig, "dnsLog", false),
		"maxSizeMb":        intSetting(runtimeSettings, "maxSizeMb", 2),
		"rotateCopies":     intSetting(runtimeSettings, "rotateCopies", 1),
		"clearOnRestart":   boolPayload(runtimeSettings, "clearOnRestart", false),
		"maintenanceEvery": "15 мин",
	}
}

func (s *serverState) saveLoggingSettings(payload map[string]any) map[string]any {
	cfg, err := s.readActiveConfig()
	if err != nil {
		return map[string]any{"ok": false, "stderr": err.Error()}
	}
	logConfig, _ := cfg["log"].(map[string]any)
	if logConfig == nil {
		logConfig = map[string]any{}
	}
	level := validLogLevel(fmt.Sprint(payload["level"]))
	accessPath := cleanLogPath(fmt.Sprint(payload["accessPath"]), defaultAccessLogPath)
	errorPath := cleanLogPath(fmt.Sprint(payload["errorPath"]), defaultErrorLogPath)
	accessLog := boolPayload(payload, "accessLog", false)
	errorLog := boolPayload(payload, "errorLog", false)
	logConfig["loglevel"] = level
	if accessLog {
		logConfig["access"] = accessPath
		if err := os.MkdirAll(filepath.Dir(accessPath), 0o755); err != nil {
			return map[string]any{"ok": false, "stderr": err.Error()}
		}
	} else {
		delete(logConfig, "access")
	}
	if errorLog {
		logConfig["error"] = errorPath
		if err := os.MkdirAll(filepath.Dir(errorPath), 0o755); err != nil {
			return map[string]any{"ok": false, "stderr": err.Error()}
		}
	} else {
		delete(logConfig, "error")
	}
	logConfig["dnsLog"] = boolPayload(payload, "dnsLog", false)
	cfg["log"] = logConfig

	runtimeSettings := s.readLoggingRuntimeSettings()
	maxSizeMb := number(payload["maxSizeMb"], intSetting(runtimeSettings, "maxSizeMb", 2))
	if maxSizeMb < 1 {
		maxSizeMb = 1
	}
	if maxSizeMb > 200 {
		maxSizeMb = 200
	}
	rotateCopies := number(payload["rotateCopies"], intSetting(runtimeSettings, "rotateCopies", 1))
	if rotateCopies < 0 {
		rotateCopies = 0
	}
	if rotateCopies > 5 {
		rotateCopies = 5
	}
	runtimeSettings["maxSizeMb"] = maxSizeMb
	runtimeSettings["rotateCopies"] = rotateCopies
	runtimeSettings["clearOnRestart"] = boolPayload(payload, "clearOnRestart", false)

	test := s.validateConfig(cfg)
	if test["ok"] != true {
		return map[string]any{"ok": false, "stderr": "Конфигурация Xray не прошла проверку", "test": test, "settings": s.loggingSettings()}
	}
	backup, backupErr := s.backupActive("logging-before-apply")
	if backupErr != nil {
		return map[string]any{"ok": false, "stderr": backupErr.Error(), "test": test}
	}
	if err := s.writeActiveConfig(cfg); err != nil {
		return map[string]any{"ok": false, "stderr": err.Error(), "test": test, "backup": backup}
	}
	if err := s.writeLoggingRuntimeSettings(runtimeSettings); err != nil {
		return map[string]any{"ok": false, "stderr": err.Error(), "test": test, "backup": backup}
	}
	maintenance := s.maintainLogFiles(false)
	var restart map[string]any
	if boolPayload(payload, "restart", true) {
		restart = s.serviceAction("restart")
	} else {
		restart = map[string]any{"ok": true, "stdout": "Настройки сохранены без перезапуска Xray"}
	}
	return map[string]any{"ok": restart["ok"], "test": test, "backup": backup, "restart": restart, "maintenance": maintenance, "settings": s.loggingSettings(), "stdout": "Настройки логирования сохранены"}
}

func (s *serverState) configuredLogPaths() []string {
	settings := s.loggingSettings()
	paths := []string{
		cleanLogPath(fmt.Sprint(settings["accessPath"]), defaultAccessLogPath),
		cleanLogPath(fmt.Sprint(settings["errorPath"]), defaultErrorLogPath),
		defaultAccessLogPath,
		defaultErrorLogPath,
		filepath.Join(s.cfg.DataDir, "access.log"),
		filepath.Join(s.cfg.DataDir, "error.log"),
	}
	seen := map[string]bool{}
	unique := []string{}
	for _, item := range paths {
		if item == "" || seen[item] {
			continue
		}
		seen[item] = true
		unique = append(unique, item)
	}
	return unique
}

func (s *serverState) clearLogFiles() map[string]any {
	cleared := []map[string]any{}
	errors := []string{}
	for _, path := range s.configuredLogPaths() {
		info, err := os.Stat(path)
		if err != nil || info.IsDir() {
			continue
		}
		if err := os.Truncate(path, 0); err != nil {
			errors = append(errors, fmt.Sprintf("%s: %s", path, err.Error()))
			continue
		}
		cleared = append(cleared, map[string]any{"path": path, "previousSize": info.Size()})
	}
	return map[string]any{
		"ok":       len(errors) == 0,
		"cleared":  cleared,
		"errors":   errors,
		"settings": s.loggingSettings(),
		"stdout":   fmt.Sprintf("Очищено файлов логов: %d", len(cleared)),
		"stderr":   strings.Join(errors, "\n"),
	}
}

func (s *serverState) startLogMaintenance() {
	go func() {
		ticker := time.NewTicker(15 * time.Minute)
		defer ticker.Stop()
		for range ticker.C {
			s.maintainLogFiles(false)
		}
	}()
}

func (s *serverState) maintainLogFiles(restart bool) map[string]any {
	settings := s.loggingSettings()
	if settings["ok"] != true {
		return map[string]any{"ok": false, "stderr": fmt.Sprint(settings["error"])}
	}
	if restart && boolPayload(settings, "clearOnRestart", false) {
		result := s.clearLogFiles()
		result["action"] = "clear"
		return result
	}
	maxSizeMb := number(settings["maxSizeMb"], 2)
	rotateCopies := number(settings["rotateCopies"], 1)
	if maxSizeMb <= 0 || rotateCopies <= 0 {
		return map[string]any{"ok": true, "rotated": []any{}}
	}
	maxBytes := int64(maxSizeMb) * 1024 * 1024
	rotated := []map[string]any{}
	errors := []string{}
	for _, path := range s.configuredLogPaths() {
		info, err := os.Stat(path)
		if err != nil || info.IsDir() || info.Size() <= maxBytes {
			continue
		}
		if err := rotateLogFile(path, rotateCopies); err != nil {
			errors = append(errors, fmt.Sprintf("%s: %s", path, err.Error()))
			continue
		}
		rotated = append(rotated, map[string]any{"path": path, "previousSize": info.Size()})
	}
	return map[string]any{"ok": len(errors) == 0, "rotated": rotated, "errors": errors, "stderr": strings.Join(errors, "\n")}
}

func rotateLogFile(logPath string, copies int) error {
	if err := os.MkdirAll(filepath.Dir(logPath), 0o755); err != nil {
		return err
	}
	if copies < 1 {
		return os.Truncate(logPath, 0)
	}
	_ = os.Remove(fmt.Sprintf("%s.%d", logPath, copies))
	for i := copies - 1; i >= 1; i-- {
		_ = os.Rename(fmt.Sprintf("%s.%d", logPath, i), fmt.Sprintf("%s.%d", logPath, i+1))
	}
	if err := os.Rename(logPath, logPath+".1"); err != nil {
		return err
	}
	return os.WriteFile(logPath, []byte{}, 0o644)
}

func enableXrayServiceConfig() map[string]any {
	if runtime.GOOS == "windows" {
		return map[string]any{"ok": true, "stdout": "dev-mode: enable xray service config"}
	}
	steps := []map[string]any{}
	if commandExists("uci") {
		steps = append(steps, run("uci", "set", "xray.enabled.enabled=1"))
		steps = append(steps, run("uci", "commit", "xray"))
	}
	if _, err := os.Stat("/etc/init.d/xray"); err == nil {
		steps = append(steps, run("/etc/init.d/xray", "enable"))
	}
	ok := true
	for _, step := range steps {
		if value, _ := step["ok"].(bool); !value {
			ok = false
		}
	}
	return map[string]any{"ok": ok, "steps": steps, "stdout": concatCommandOutput(steps...)}
}

func xrayCoreReleases() ([]map[string]any, error) {
	req, _ := http.NewRequest(http.MethodGet, "https://api.github.com/repos/XTLS/Xray-core/releases?per_page=50", nil)
	req.Header.Set("accept", "application/vnd.github+json")
	req.Header.Set("user-agent", "RuOpenRay UI")
	resp, err := (&http.Client{Timeout: 12 * time.Second}).Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("GitHub releases HTTP %d", resp.StatusCode)
	}
	var raw []map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return nil, err
	}
	releases := []map[string]any{}
	assetName := xrayAssetName()
	for _, item := range raw {
		tag := fmt.Sprint(item["tag_name"])
		assets := asArray(item["assets"])
		assetURL := ""
		for _, asset := range assets {
			if obj, ok := asset.(map[string]any); ok && fmt.Sprint(obj["name"]) == assetName {
				assetURL = fmt.Sprint(obj["browser_download_url"])
				break
			}
		}
		releases = append(releases, map[string]any{
			"tag": tag, "name": firstNonEmpty(fmt.Sprint(item["name"]), tag),
			"publishedAt": item["published_at"], "asset": assetName, "assetUrl": assetURL,
			"prerelease": item["prerelease"],
		})
	}
	return releases, nil
}

func xrayAssetName() string {
	switch runtime.GOARCH {
	case "amd64":
		return "Xray-linux-64.zip"
	case "386":
		return "Xray-linux-32.zip"
	case "arm64":
		return "Xray-linux-arm64-v8a.zip"
	case "arm":
		return "Xray-linux-arm32-v7a.zip"
	case "mipsle":
		return "Xray-linux-mips32le.zip"
	case "mips":
		return "Xray-linux-mips32.zip"
	case "mips64le":
		return "Xray-linux-mips64le.zip"
	case "mips64":
		return "Xray-linux-mips64.zip"
	default:
		return "Xray-linux-" + runtime.GOARCH + ".zip"
	}
}

func packageArchitecture(manager string) string {
	switch manager {
	case "apk":
		out := runTimeout(5*time.Second, "apk", "--print-arch")
		return firstLine(fmt.Sprint(out["stdout"]), "")
	case "opkg":
		out := runTimeout(5*time.Second, "opkg", "print-architecture")
		selected := ""
		for _, line := range strings.Split(fmt.Sprint(out["stdout"]), "\n") {
			fields := strings.Fields(line)
			if len(fields) >= 2 && fields[0] == "arch" && fields[1] != "all" && fields[1] != "noarch" {
				selected = fields[1]
			}
		}
		return selected
	default:
		return ""
	}
}

func tproxyModuleStatus(manager string) map[string]any {
	required := []string{"kmod-nf-tproxy", "kmod-nft-tproxy", "kmod-nft-socket"}
	if runtime.GOOS == "windows" {
		return map[string]any{
			"ok":        true,
			"required":  required,
			"installed": []string{},
			"missing":   []string{},
			"detail":    "проверяется на OpenWrt",
		}
	}
	installed := []string{}
	missing := []string{}
	for _, pkg := range required {
		ok := false
		switch manager {
		case "apk":
			ok = runTimeout(5*time.Second, "apk", "info", "-e", pkg)["ok"] == true
		case "opkg":
			ok = runTimeout(5*time.Second, "opkg", "status", pkg)["ok"] == true
		}
		if ok {
			installed = append(installed, pkg)
		} else {
			missing = append(missing, pkg)
		}
	}
	detail := "установлены: " + strings.Join(installed, ", ")
	if len(installed) == 0 {
		detail = "не установлены"
	}
	if len(missing) > 0 {
		detail = "не хватает: " + strings.Join(missing, ", ")
	}
	return map[string]any{
		"ok":        len(missing) == 0,
		"required":  required,
		"installed": installed,
		"missing":   missing,
		"detail":    detail,
	}
}

func systemArchitecture(manager string) map[string]any {
	uname := runTimeout(5*time.Second, "uname", "-m")
	return map[string]any{
		"goos":           runtime.GOOS,
		"goarch":         runtime.GOARCH,
		"uname":          firstLine(fmt.Sprint(uname["stdout"]), runtime.GOARCH),
		"packageManager": manager,
		"packageArch":    packageArchitecture(manager),
		"githubAsset":    xrayAssetName(),
	}
}

func findReleaseAsset(version string) (string, string, error) {
	releases, err := xrayCoreReleases()
	if err != nil {
		return "", "", err
	}
	for _, release := range releases {
		if fmt.Sprint(release["tag"]) == version {
			url := strings.TrimSpace(fmt.Sprint(release["assetUrl"]))
			if url == "" {
				return "", "", fmt.Errorf("для %s нет ассета %s", version, xrayAssetName())
			}
			return url, fmt.Sprint(release["asset"]), nil
		}
	}
	return "", "", fmt.Errorf("релиз %s не найден среди последних 10", version)
}

func (s *serverState) installCoreRelease(version string, keepBackup bool) map[string]any {
	arch := systemArchitecture("github-release")
	assetURL, assetName, err := findReleaseAsset(version)
	if err != nil {
		return map[string]any{"ok": false, "stderr": err.Error(), "arch": arch}
	}
	downloadURL := s.mirrorURL(assetURL)
	resp, err := (&http.Client{Timeout: 90 * time.Second}).Get(downloadURL)
	if err != nil {
		return map[string]any{"ok": false, "stderr": err.Error(), "arch": arch, "url": downloadURL}
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return map[string]any{"ok": false, "stderr": fmt.Sprintf("download HTTP %d", resp.StatusCode), "arch": arch, "url": downloadURL}
	}
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return map[string]any{"ok": false, "stderr": err.Error(), "arch": arch}
	}
	reader, err := zip.NewReader(bytes.NewReader(body), int64(len(body)))
	if err != nil {
		return map[string]any{"ok": false, "stderr": err.Error(), "arch": arch}
	}
	var binary []byte
	for _, file := range reader.File {
		if filepath.Base(file.Name) != "xray" {
			continue
		}
		rc, err := file.Open()
		if err != nil {
			return map[string]any{"ok": false, "stderr": err.Error(), "arch": arch}
		}
		binary, err = io.ReadAll(rc)
		_ = rc.Close()
		if err != nil {
			return map[string]any{"ok": false, "stderr": err.Error(), "arch": arch}
		}
		break
	}
	if len(binary) == 0 {
		return map[string]any{"ok": false, "stderr": "в архиве не найден бинарник xray"}
	}
	target := "/usr/bin/xray"
	current, _ := os.ReadFile(target)
	backup := ""
	if keepBackup && len(current) > 0 {
		_ = os.MkdirAll(s.cfg.BackupDir, 0o755)
		backup = filepath.Join(s.cfg.BackupDir, "xray-"+time.Now().Format("20060102-150405"))
	}
	_ = os.Remove(target)
	if err := os.WriteFile(target, binary, 0o755); err != nil {
		if len(current) > 0 {
			_ = os.WriteFile(target, current, 0o755)
		}
		return map[string]any{"ok": false, "stderr": err.Error()}
	}
	if len(current) > 0 && backup != "" {
		_ = os.WriteFile(backup, current, 0o755)
	}
	return map[string]any{"ok": true, "stdout": fmt.Sprintf("Установлен %s из %s", version, assetName), "backup": backup, "backupEnabled": keepBackup, "url": downloadURL}
}

func (s *serverState) updateCore(version string, keepBackup bool) map[string]any {
	before := firstLine(fmt.Sprint(run("xray", "version")["stdout"]), "xray не найден")
	if version != "" && version != "<nil>" {
		stop := s.serviceAction("stop")
		install := s.installCoreRelease(version, keepBackup)
		after := firstLine(fmt.Sprint(run("xray", "version")["stdout"]), "xray не найден")
		restart := s.serviceAction("restart")
		ok := install["ok"].(bool) && restart["ok"].(bool)
		return map[string]any{
			"ok": ok, "packageManager": "github-release", "version": version,
			"before": before, "after": after, "stop": stop, "install": install, "restart": restart,
			"arch":   systemArchitecture("github-release"),
			"stdout": concatCommandOutput(stop, install, restart),
		}
	}
	if runtime.GOOS == "windows" {
		return map[string]any{
			"ok":             true,
			"packageManager": "dev-mode",
			"before":         before,
			"after":          before,
			"stdout":         "dev-mode: на OpenWrt будет выполнено обновление пакета xray-core",
		}
	}

	var manager string
	var update map[string]any
	var install map[string]any
	switch {
	case commandExists("apk"):
		manager = "apk"
		update = runTimeout(90*time.Second, "apk", "update")
		install = runTimeout(180*time.Second, "apk", "add", "--upgrade", "xray-core", "kmod-nf-tproxy", "kmod-nft-tproxy", "kmod-nft-socket")
	case commandExists("opkg"):
		manager = "opkg"
		update = runTimeout(90*time.Second, "opkg", "update")
		install = runTimeout(180*time.Second, "opkg", "install", "xray-core", "kmod-nf-tproxy", "kmod-nft-tproxy", "kmod-nft-socket")
	default:
		return map[string]any{"ok": false, "stderr": "Не найден пакетный менеджер apk или opkg"}
	}

	after := firstLine(fmt.Sprint(run("xray", "version")["stdout"]), "xray не найден")
	enable := enableXrayServiceConfig()
	arch := systemArchitecture(manager)
	restart := s.serviceAction("restart")
	ok := update["ok"].(bool) && install["ok"].(bool) && enable["ok"].(bool) && restart["ok"].(bool)
	return map[string]any{
		"ok":             ok,
		"packageManager": manager,
		"arch":           arch,
		"before":         before,
		"after":          after,
		"update":         update,
		"install":        install,
		"enable":         enable,
		"restart":        restart,
		"stdout":         concatCommandOutput(update, install, enable, restart),
	}
}

func (s *serverState) installPlan() map[string]any {
	manager := "не найден"
	if commandExists("apk") {
		manager = "apk"
	} else if commandExists("opkg") {
		manager = "opkg"
	}
	tproxyModules := tproxyModuleStatus(manager)
	coreVersion := runTimeout(5*time.Second, "xray", "version")
	geo := s.geoStatus()
	geoip := mapValue(geo["geoip"])
	geosite := mapValue(geo["geosite"])
	system := s.systemMetrics()
	disk := mapValue(system["disk"])
	free := numberAny(disk["free"])
	xrayInstalled := coreVersion["ok"] == true
	geoInstalled := geoip["exists"] == true && geosite["exists"] == true
	panelSize := fileSizeOrZero(os.Args[0])
	xraySize := fileSizeOrZero("/usr/bin/xray")
	geoCurrent := numberAny(geoip["size"]) + numberAny(geosite["size"])
	backupCurrent := dirSizeOrZero(s.cfg.BackupDir)
	xrayNeeded := int64(30 * 1024 * 1024)
	if xrayInstalled {
		xrayNeeded = 0
	}
	leanGeoNeeded := int64(8 * 1024 * 1024)
	fullGeoNeeded := int64(32 * 1024 * 1024)
	if geoInstalled {
		leanGeoNeeded = 0
		fullGeoNeeded = 0
	}
	leanRequired := xrayNeeded + leanGeoNeeded + 2*1024*1024
	fullRequired := xrayNeeded + fullGeoNeeded + 2*1024*1024
	storage := map[string]any{
		"panelSize":       panelSize,
		"xraySize":        xraySize,
		"geoCurrent":      geoCurrent,
		"backupCurrent":   backupCurrent,
		"leanRequired":    leanRequired,
		"fullRequired":    fullRequired,
		"leanOk":          free == 0 || free >= leanRequired,
		"fullOk":          free == 0 || free >= fullRequired,
		"recommendedGeo":  "Nidelon",
		"recommendedMode": "NAND-friendly: без бэкапов, компактный geosite/geoip, удаление лишних dat",
	}
	steps := []map[string]any{
		{"id": "manager", "title": "Пакетный менеджер", "ok": manager == "apk" || manager == "opkg", "detail": manager},
		{"id": "arch", "title": "Архитектура", "ok": true, "detail": fmt.Sprint(systemArchitecture("github-release")["uname"]) + " / " + xrayAssetName()},
		{"id": "space", "title": "Свободное место", "ok": storage["leanOk"], "detail": fmt.Sprintf("%s свободно · нужно от %s", byteCount(free), byteCount(leanRequired))},
		{"id": "xray", "title": "Xray-core", "ok": coreVersion["ok"] == true, "detail": firstLine(fmt.Sprint(coreVersion["stdout"]), "не найден")},
		{"id": "geo", "title": "Geo-файлы", "ok": geoip["exists"] == true && geosite["exists"] == true, "detail": fmt.Sprintf("geoip.dat: %v · geosite.dat: %v", geoip["exists"], geosite["exists"])},
		{"id": "tproxy", "title": "TPROXY-модули", "ok": tproxyModules["ok"], "detail": tproxyModules["detail"]},
		{"id": "nand", "title": "NAND-friendly", "ok": storage["leanOk"], "detail": fmt.Sprintf("экономный режим: %s, полный geo: %s", byteCount(leanRequired), byteCount(fullRequired))},
		{"id": "service", "title": "Сервис", "ok": true, "detail": "/etc/init.d/" + s.cfg.ServiceName},
	}
	return map[string]any{
		"ok":             true,
		"packageManager": manager,
		"arch":           systemArchitecture(manager),
		"core":           coreVersion,
		"geo":            geo,
		"tproxyModules":  tproxyModules,
		"disk":           disk,
		"storage":        storage,
		"steps":          steps,
		"installable":    (manager == "apk" || manager == "opkg") && runtime.GOOS != "windows",
	}
}

func fileSizeOrZero(path string) int64 {
	info, err := os.Stat(path)
	if err != nil {
		return 0
	}
	return info.Size()
}

func dirSizeOrZero(path string) int64 {
	var total int64
	_ = filepath.WalkDir(path, func(item string, entry os.DirEntry, err error) error {
		if err != nil || entry == nil || entry.IsDir() {
			return nil
		}
		if info, err := entry.Info(); err == nil {
			total += info.Size()
		}
		return nil
	})
	return total
}

func ruOpenRayAssetName() string {
	switch runtime.GOARCH {
	case "amd64":
		return "ruopenray-ui-linux-amd64"
	case "arm64":
		return "ruopenray-ui-linux-arm64"
	case "arm":
		return "ruopenray-ui-linux-armv7"
	case "mipsle":
		return "ruopenray-ui-linux-mipsle-softfloat"
	case "mips":
		return "ruopenray-ui-linux-mips-softfloat"
	default:
		return "ruopenray-ui-linux-" + runtime.GOARCH
	}
}

func appReleaseAPI(version string) string {
	if version == "" || version == "latest" || version == "<nil>" {
		return "https://api.github.com/repos/" + appRepoFullName + "/releases/latest"
	}
	return "https://api.github.com/repos/" + appRepoFullName + "/releases/tags/" + url.PathEscape(version)
}

func appLatestRelease() (map[string]any, error) {
	req, _ := http.NewRequest(http.MethodGet, "https://api.github.com/repos/"+appRepoFullName+"/releases?per_page=1", nil)
	req.Header.Set("accept", "application/vnd.github+json")
	req.Header.Set("user-agent", "RuOpenRay UI")
	resp, err := (&http.Client{Timeout: 12 * time.Second}).Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusNotFound {
		assetName := ruOpenRayAssetName()
		return map[string]any{"tag": "", "name": "релизов пока нет", "asset": assetName, "assetUrl": "", "assetSize": 0, "current": appVersion, "update": false}, nil
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("GitHub releases HTTP %d", resp.StatusCode)
	}
	var raw []map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return nil, err
	}
	if len(raw) == 0 {
		assetName := ruOpenRayAssetName()
		return map[string]any{"tag": "", "name": "релизов пока нет", "asset": assetName, "assetUrl": "", "assetSize": 0, "current": appVersion, "update": false}, nil
	}
	return parseAppRelease(raw[0]), nil
}

func appRelease(version string) (map[string]any, error) {
	if version == "" || version == "latest" || version == "<nil>" {
		return appLatestRelease()
	}
	req, _ := http.NewRequest(http.MethodGet, appReleaseAPI(version), nil)
	req.Header.Set("accept", "application/vnd.github+json")
	req.Header.Set("user-agent", "RuOpenRay UI")
	resp, err := (&http.Client{Timeout: 12 * time.Second}).Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("GitHub release HTTP %d", resp.StatusCode)
	}
	var raw map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return nil, err
	}
	return parseAppRelease(raw), nil
}

func parseAppRelease(raw map[string]any) map[string]any {
	assetName := ruOpenRayAssetName()
	assetURL := ""
	assetSize := 0
	for _, item := range asArray(raw["assets"]) {
		asset, ok := item.(map[string]any)
		if !ok || fmt.Sprint(asset["name"]) != assetName {
			continue
		}
		assetURL = strings.TrimSpace(fmt.Sprint(asset["browser_download_url"]))
		assetSize = number(asset["size"], 0)
		break
	}
	tag := strings.TrimSpace(fmt.Sprint(raw["tag_name"]))
	return map[string]any{
		"tag":         tag,
		"name":        firstNonEmpty(fmt.Sprint(raw["name"]), tag),
		"publishedAt": raw["published_at"],
		"prerelease":  raw["prerelease"],
		"htmlUrl":     raw["html_url"],
		"asset":       assetName,
		"assetUrl":    assetURL,
		"assetSize":   assetSize,
		"current":     appVersion,
		"update":      tag != "" && tag != appVersion,
	}
}

func replaceExecutableAcrossFilesystems(src string, dst string) error {
	if err := os.Chmod(src, 0o755); err != nil {
		return err
	}
	if err := os.Rename(src, dst); err == nil {
		return nil
	}
	sameDirTmp := filepath.Join(filepath.Dir(dst), "."+filepath.Base(dst)+"-"+time.Now().Format("20060102150405")+".new")
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.OpenFile(sameDirTmp, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o755)
	if err != nil {
		return err
	}
	_, copyErr := io.Copy(out, in)
	closeErr := out.Close()
	if copyErr != nil {
		_ = os.Remove(sameDirTmp)
		return copyErr
	}
	if closeErr != nil {
		_ = os.Remove(sameDirTmp)
		return closeErr
	}
	if err := os.Chmod(sameDirTmp, 0o755); err != nil {
		_ = os.Remove(sameDirTmp)
		return err
	}
	if err := os.Rename(sameDirTmp, dst); err != nil {
		_ = os.Remove(sameDirTmp)
		return err
	}
	_ = os.Remove(src)
	return nil
}

func (s *serverState) updateApp(version string, keepBackup bool) map[string]any {
	release, err := appRelease(version)
	if err != nil {
		return map[string]any{"ok": false, "stderr": err.Error(), "version": appVersion, "arch": systemArchitecture("github-release")}
	}
	assetURL := strings.TrimSpace(fmt.Sprint(release["assetUrl"]))
	if assetURL == "" {
		return map[string]any{"ok": false, "stderr": fmt.Sprintf("для %s нет ассета %s", release["tag"], ruOpenRayAssetName()), "release": release}
	}
	exe, err := os.Executable()
	if err != nil {
		return map[string]any{"ok": false, "stderr": err.Error(), "release": release}
	}
	exe, _ = filepath.Abs(exe)
	downloadURL := s.mirrorURL(assetURL)
	resp, err := (&http.Client{Timeout: 120 * time.Second}).Get(downloadURL)
	if err != nil {
		return map[string]any{"ok": false, "stderr": err.Error(), "url": downloadURL, "release": release}
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return map[string]any{"ok": false, "stderr": fmt.Sprintf("download HTTP %d", resp.StatusCode), "url": downloadURL, "release": release}
	}
	tmp := filepath.Join(os.TempDir(), fmt.Sprintf("ruopenray-ui-%d.new", time.Now().UnixNano()))
	out, err := os.OpenFile(tmp, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o755)
	if err != nil {
		return map[string]any{"ok": false, "stderr": err.Error(), "release": release}
	}
	size, copyErr := io.Copy(out, io.LimitReader(resp.Body, 64*1024*1024))
	closeErr := out.Close()
	if copyErr != nil {
		_ = os.Remove(tmp)
		return map[string]any{"ok": false, "stderr": copyErr.Error(), "release": release}
	}
	if closeErr != nil {
		_ = os.Remove(tmp)
		return map[string]any{"ok": false, "stderr": closeErr.Error(), "release": release}
	}
	if size < 1024*1024 {
		_ = os.Remove(tmp)
		return map[string]any{"ok": false, "stderr": "скачанный бинарник слишком маленький", "size": size, "release": release}
	}
	backup := ""
	if keepBackup {
		_ = os.MkdirAll(s.cfg.BackupDir, 0o755)
		backup = filepath.Join(s.cfg.BackupDir, "ruopenray-ui-"+time.Now().Format("20060102-150405"))
		if body, err := os.ReadFile(exe); err == nil {
			_ = os.WriteFile(backup, body, 0o755)
		}
	}
	if err := replaceExecutableAcrossFilesystems(tmp, exe); err != nil {
		_ = os.Remove(tmp)
		return map[string]any{"ok": false, "stderr": err.Error(), "release": release, "target": exe}
	}
	restart := s.restartAppServiceLater()
	return map[string]any{
		"ok": true, "version": release["tag"], "previous": appVersion, "release": release,
		"backup": backup, "backupEnabled": keepBackup, "size": size, "target": exe, "restart": restart,
		"stdout": fmt.Sprintf("RuOpenRay UI обновлен до %s. Сервис будет перезапущен.", release["tag"]),
	}
}

func (s *serverState) restartAppServiceLater() map[string]any {
	if runtime.GOOS == "windows" {
		return map[string]any{"ok": true, "stdout": "dev-mode: перезапуск ruopenray-ui пропущен"}
	}
	if _, err := os.Stat("/etc/init.d/" + appServiceName); err != nil {
		return map[string]any{"ok": true, "stdout": "init-скрипт ruopenray-ui не найден; перезапустите сервис вручную"}
	}
	cmd := exec.Command("sh", "-c", "sleep 1; /etc/init.d/ruopenray-ui restart >/tmp/ruopenray-ui-update.log 2>&1")
	if err := cmd.Start(); err != nil {
		return map[string]any{"ok": false, "stderr": err.Error()}
	}
	return map[string]any{"ok": true, "stdout": "запланирован перезапуск ruopenray-ui", "pid": cmd.Process.Pid}
}

func (s *serverState) backupBundle() (string, error) {
	if err := os.MkdirAll(s.cfg.BackupDir, 0o755); err != nil {
		return "", err
	}
	target := filepath.Join(s.cfg.BackupDir, "ruopenray-full-"+time.Now().Format("20060102-150405")+".zip")
	absTarget, _ := filepath.Abs(target)
	absBackupDir, _ := filepath.Abs(s.cfg.BackupDir)
	file, err := os.Create(target)
	if err != nil {
		return "", err
	}
	defer file.Close()
	zw := zip.NewWriter(file)
	defer zw.Close()
	addFile := func(name, filePath string) error {
		info, err := os.Stat(filePath)
		if err != nil || info.IsDir() {
			return nil
		}
		header, err := zip.FileInfoHeader(info)
		if err != nil {
			return err
		}
		header.Name = filepath.ToSlash(name)
		header.Method = zip.Deflate
		writer, err := zw.CreateHeader(header)
		if err != nil {
			return err
		}
		src, err := os.Open(filePath)
		if err != nil {
			return err
		}
		defer src.Close()
		_, err = io.Copy(writer, src)
		return err
	}
	_ = addFile("xray/config.json", s.cfg.ActiveConfig)
	_ = addFile("uci/ruopenray-ui", "/etc/config/ruopenray-ui")
	_ = addFile("service/ruopenray-ui.init", "/etc/init.d/ruopenray-ui")
	if info, err := os.Stat(s.cfg.DataDir); err == nil && info.IsDir() {
		err = filepath.WalkDir(s.cfg.DataDir, func(path string, entry fs.DirEntry, walkErr error) error {
			if walkErr != nil {
				return walkErr
			}
			absPath, _ := filepath.Abs(path)
			if entry.IsDir() {
				if absPath == absBackupDir {
					return filepath.SkipDir
				}
				return nil
			}
			if absPath == absTarget {
				return nil
			}
			rel, _ := filepath.Rel(s.cfg.DataDir, path)
			return addFile(filepath.Join("data", rel), path)
		})
		if err != nil {
			return "", err
		}
	}
	return target, nil
}

func (s *serverState) runCLI(args []string) int {
	if len(args) == 0 {
		args = []string{"help"}
	}
	command := strings.ToLower(strings.TrimSpace(args[0]))
	switch command {
	case "help", "-h", "--help":
		fmt.Println(strings.TrimSpace(`RuOpenRay UI

Usage:
  ruopenray-ui serve
  ruopenray-ui version
  ruopenray-ui status
  ruopenray-ui diagnostics
  ruopenray-ui backup
  ruopenray-ui update [version] [--backup]
  ruopenray-ui start|stop|restart
  ruopenray-ui uninstall [--purge]

All operational commands print JSON. The web service is the default when no command is provided.`))
		return 0
	case "version", "-v", "--version":
		printJSON(map[string]any{"ok": true, "version": appVersion, "asset": ruOpenRayAssetName(), "arch": systemArchitecture("github-release")})
		return 0
	case "status":
		printJSON(map[string]any{"ok": true, "service": s.xrayServiceStatus(), "core": runTimeout(5*time.Second, "xray", "version"), "system": s.systemMetrics(), "app": map[string]any{"version": appVersion, "asset": ruOpenRayAssetName()}})
		return 0
	case "diagnostics", "diag":
		printJSON(s.diagnostics())
		return 0
	case "backup":
		path, err := s.backupBundle()
		printJSON(map[string]any{"ok": err == nil, "path": path, "stderr": errString(err)})
		if err != nil {
			return 1
		}
		return 0
	case "update", "self-update":
		version := ""
		keepBackup := false
		for _, arg := range args[1:] {
			switch strings.TrimSpace(arg) {
			case "--backup":
				keepBackup = true
			case "--no-backup":
				keepBackup = false
			default:
				if !strings.HasPrefix(arg, "-") && version == "" {
					version = arg
				}
			}
		}
		result := s.updateApp(version, keepBackup)
		printJSON(result)
		if result["ok"] != true {
			return 1
		}
		return 0
	case "start", "stop", "restart":
		result := s.serviceAction(command)
		printJSON(result)
		if result["ok"] != true {
			return 1
		}
		return 0
	case "uninstall", "remove":
		purge := false
		for _, arg := range args[1:] {
			if arg == "--purge" {
				purge = true
			}
		}
		result := s.uninstallApp(purge)
		printJSON(result)
		if result["ok"] != true {
			return 1
		}
		return 0
	default:
		printJSON(map[string]any{"ok": false, "stderr": "unknown command: " + command})
		return 2
	}
}

func (s *serverState) uninstallApp(purge bool) map[string]any {
	steps := []map[string]any{}
	if runtime.GOOS != "windows" {
		if _, err := os.Stat("/etc/init.d/" + appServiceName); err == nil {
			steps = append(steps, run("/etc/init.d/"+appServiceName, "disable"))
			steps = append(steps, run("/etc/init.d/"+appServiceName, "stop"))
		}
	}
	_ = s.removeGeoCron()
	paths := []string{
		"/etc/init.d/" + appServiceName,
		"/etc/config/ruopenray-ui",
		"/usr/share/luci/menu.d/luci-app-ruopenray.json",
		"/usr/share/rpcd/acl.d/luci-app-ruopenray.json",
		"/usr/share/ucode/luci/template/ruopenray",
	}
	for _, item := range paths {
		if err := os.RemoveAll(item); err != nil && !os.IsNotExist(err) {
			steps = append(steps, map[string]any{"ok": false, "command": "remove " + item, "stderr": err.Error()})
		} else {
			steps = append(steps, map[string]any{"ok": true, "command": "remove " + item})
		}
	}
	if purge {
		if err := os.RemoveAll(s.cfg.DataDir); err != nil && !os.IsNotExist(err) {
			steps = append(steps, map[string]any{"ok": false, "command": "purge " + s.cfg.DataDir, "stderr": err.Error()})
		} else {
			steps = append(steps, map[string]any{"ok": true, "command": "purge " + s.cfg.DataDir})
		}
	}
	if commandExists("uci") {
		steps = append(steps, run("uci", "delete", "ruopenray-ui.main"))
		steps = append(steps, run("uci", "commit", "ruopenray-ui"))
	}
	if runtime.GOOS != "windows" {
		if exe, err := os.Executable(); err == nil {
			if abs, err := filepath.Abs(exe); err == nil && strings.Contains(abs, appServiceName) {
				if err := os.Remove(abs); err != nil && !os.IsNotExist(err) {
					steps = append(steps, map[string]any{"ok": false, "command": "remove " + abs, "stderr": err.Error()})
				} else {
					steps = append(steps, map[string]any{"ok": true, "command": "remove " + abs})
				}
			}
		}
	}
	ok := true
	for _, step := range steps {
		ok = ok && step["ok"] == true
	}
	return map[string]any{"ok": ok, "purge": purge, "steps": steps}
}

func (s *serverState) removeGeoCron() map[string]any {
	if runtime.GOOS == "windows" {
		return map[string]any{"ok": true, "stdout": "dev-mode"}
	}
	const marker = "# RuOpenRay geo update"
	rootCrontab := "/etc/crontabs/root"
	body, err := os.ReadFile(rootCrontab)
	if err != nil {
		return map[string]any{"ok": true, "stdout": "crontab not found"}
	}
	var lines []string
	changed := false
	for _, line := range strings.Split(string(body), "\n") {
		if strings.Contains(line, marker) {
			changed = true
			continue
		}
		if strings.TrimSpace(line) != "" {
			lines = append(lines, line)
		}
	}
	if !changed {
		return map[string]any{"ok": true, "stdout": "cron unchanged"}
	}
	content := strings.Join(lines, "\n")
	if strings.TrimSpace(content) != "" {
		content += "\n"
	}
	if err := os.WriteFile(rootCrontab, []byte(content), 0o600); err != nil {
		return map[string]any{"ok": false, "stderr": err.Error()}
	}
	_ = exec.Command("/etc/init.d/cron", "restart").Run()
	return map[string]any{"ok": true, "stdout": "geo cron removed"}
}

func printJSON(payload any) {
	body, err := json.MarshalIndent(payload, "", "  ")
	if err != nil {
		fmt.Println(`{"ok":false,"stderr":"json marshal failed"}`)
		return
	}
	fmt.Println(string(body))
}

func (s *serverState) diagnostics() map[string]any {
	cfg, cfgErr := s.readActiveConfig()
	var test map[string]any
	var analysis map[string]any
	if cfgErr == nil {
		test = s.validateConfig(cfg)
		analysis = s.analyzeConfig(cfg)
	}
	return map[string]any{
		"ok": true,
		"app": map[string]any{
			"version": appVersion,
			"asset":   ruOpenRayAssetName(),
			"binary":  os.Args[0],
		},
		"openwrt": map[string]any{
			"release": firstLine(readFileString("/etc/openwrt_release"), ""),
			"manager": firstNonEmpty(commandName("apk"), commandName("opkg"), "не найден"),
		},
		"service": map[string]any{
			"ruopenray": runTimeout(5*time.Second, "/etc/init.d/ruopenray-ui", "status"),
			"xray":      runTimeout(5*time.Second, "/etc/init.d/"+s.cfg.ServiceName, "status"),
		},
		"paths": map[string]any{
			"dataDir":      s.cfg.DataDir,
			"backupDir":    s.cfg.BackupDir,
			"geoDir":       s.cfg.GeoDir,
			"activeConfig": s.cfg.ActiveConfig,
		},
		"system":   s.systemMetrics(),
		"core":     runTimeout(5*time.Second, "xray", "version"),
		"config":   map[string]any{"readError": errString(cfgErr), "test": test, "analysis": analysis},
		"geo":      s.geoStatus(),
		"firewall": map[string]any{"nft": runTimeout(5*time.Second, "nft", "list", "ruleset"), "iptables": runTimeout(5*time.Second, "iptables-save")},
		"now":      time.Now().Format(time.RFC3339),
	}
}

func routerHTTPProbe(payload map[string]any) map[string]any {
	rawURL := strings.TrimSpace(fmt.Sprint(payload["url"]))
	if rawURL == "" || rawURL == "<nil>" {
		rawURL = "https://www.gstatic.com/generate_204"
	}
	parsed, err := url.Parse(rawURL)
	if err != nil || parsed.Host == "" || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		return map[string]any{"ok": false, "error": "нужен http/https URL"}
	}
	timeoutSeconds := 8
	if rawTimeout := strings.TrimSpace(fmt.Sprint(payload["timeout"])); rawTimeout != "" && rawTimeout != "<nil>" {
		if parsedTimeout, err := strconv.Atoi(rawTimeout); err == nil {
			timeoutSeconds = parsedTimeout
		}
	}
	if timeoutSeconds < 2 {
		timeoutSeconds = 2
	}
	if timeoutSeconds > 30 {
		timeoutSeconds = 30
	}
	timeout := time.Duration(timeoutSeconds) * time.Second
	if curl, err := exec.LookPath("curl"); err == nil {
		result := runTimeout(timeout+time.Second, curl, "-L", "-k", "-sS", "-o", "/dev/null", "-w", "%{http_code}", "--max-time", strconv.Itoa(timeoutSeconds), rawURL)
		result["tool"] = "curl"
		result["url"] = rawURL
		result["status"] = strings.TrimSpace(fmt.Sprint(result["stdout"]))
		return result
	}
	if wget, err := exec.LookPath("wget"); err == nil {
		result := runTimeout(timeout+time.Second, wget, "-q", "-T", strconv.Itoa(timeoutSeconds), "-O", "/dev/null", rawURL)
		result["tool"] = "wget"
		result["url"] = rawURL
		return result
	}
	return map[string]any{"ok": false, "url": rawURL, "error": "на роутере не найден curl или wget"}
}

func domainProbeURL(rawHost string, rawURL string) (string, string, string, string, error) {
	value := strings.TrimSpace(firstNonEmpty(rawURL, rawHost))
	value = strings.TrimPrefix(value, "domain:")
	value = strings.TrimPrefix(value, "regexp:")
	value = strings.TrimPrefix(value, "full:")
	if value == "" || value == "<nil>" {
		return "", "", "", "", fmt.Errorf("укажите домен или URL")
	}
	if !strings.Contains(value, "://") {
		value = "https://" + strings.Trim(value, "/")
	}
	parsed, err := url.Parse(value)
	if err != nil || parsed.Host == "" || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		return "", "", "", "", fmt.Errorf("нужен домен или http/https URL")
	}
	port := parsed.Port()
	if port == "" {
		if parsed.Scheme == "http" {
			port = "80"
		} else {
			port = "443"
		}
	}
	return value, parsed.Hostname(), port, parsed.Scheme, nil
}

func directHTTPProbe(rawURL string, timeoutMs int) map[string]any {
	if timeoutMs < 500 {
		timeoutMs = 500
	}
	if timeoutMs > 15000 {
		timeoutMs = 15000
	}
	transport := &http.Transport{TLSClientConfig: &tls.Config{MinVersion: tls.VersionTLS12}}
	client := &http.Client{Timeout: time.Duration(timeoutMs) * time.Millisecond, Transport: transport}
	started := time.Now()
	resp, err := client.Get(rawURL)
	latency := time.Since(started).Milliseconds()
	if err != nil {
		return map[string]any{"ok": false, "latencyMs": latency, "error": err.Error()}
	}
	defer resp.Body.Close()
	_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 1024))
	ok := resp.StatusCode < 500
	result := map[string]any{"ok": ok, "status": resp.StatusCode, "latencyMs": latency}
	if !ok {
		result["error"] = fmt.Sprintf("HTTP %d", resp.StatusCode)
	}
	return result
}

func directTCPProbe(host string, port string, timeoutMs int) map[string]any {
	if timeoutMs < 500 {
		timeoutMs = 500
	}
	if timeoutMs > 15000 {
		timeoutMs = 15000
	}
	address := net.JoinHostPort(host, port)
	started := time.Now()
	conn, err := net.DialTimeout("tcp", address, time.Duration(timeoutMs)*time.Millisecond)
	latency := time.Since(started).Milliseconds()
	if err != nil {
		return map[string]any{"ok": false, "latencyMs": latency, "address": address, "error": err.Error()}
	}
	_ = conn.Close()
	return map[string]any{"ok": true, "latencyMs": latency, "address": address}
}

func directPingProbe(host string, timeoutMs int) map[string]any {
	ping, err := exec.LookPath("ping")
	if err != nil {
		return map[string]any{"ok": false, "skipped": true, "error": "ping не найден на роутере"}
	}
	if timeoutMs < 1000 {
		timeoutMs = 1000
	}
	if timeoutMs > 15000 {
		timeoutMs = 15000
	}
	timeoutSeconds := (timeoutMs + 999) / 1000
	result := runTimeout(time.Duration(timeoutMs)*time.Millisecond+time.Second, ping, "-c", "1", "-W", strconv.Itoa(timeoutSeconds), host)
	result["host"] = host
	result["tool"] = "ping"
	stdout := fmt.Sprint(result["stdout"])
	if match := regexp.MustCompile(`time[=<]([0-9.]+)\s*ms`).FindStringSubmatch(stdout); len(match) == 2 {
		if latency, err := strconv.ParseFloat(match[1], 64); err == nil {
			result["latencyMs"] = int64(latency)
		}
	}
	return result
}

func firstProxyOutbound(cfg map[string]any) (map[string]any, string) {
	for _, item := range asArray(cfg["outbounds"]) {
		outbound, ok := item.(map[string]any)
		if !ok {
			continue
		}
		tag := strings.TrimSpace(fmt.Sprint(outbound["tag"]))
		protocol := strings.ToLower(strings.TrimSpace(fmt.Sprint(outbound["protocol"])))
		if tag == "" || tag == "<nil>" || protocol == "freedom" || protocol == "blackhole" || protocol == "dns" || tag == "direct" || tag == "block" || tag == "dns-out" {
			continue
		}
		return outbound, tag
	}
	return nil, ""
}

func findOutboundByTag(cfg map[string]any, tag string) map[string]any {
	for _, item := range asArray(cfg["outbounds"]) {
		outbound, ok := item.(map[string]any)
		if !ok {
			continue
		}
		if strings.TrimSpace(fmt.Sprint(outbound["tag"])) == tag {
			return outbound
		}
	}
	return nil
}

func domainProbeVerdict(ping map[string]any, directTCP map[string]any, proxyTCP map[string]any, directHTTP map[string]any, proxyHTTP map[string]any) map[string]any {
	directHTTPOK := boolPayload(directHTTP, "ok", false)
	proxyHTTPOK := boolPayload(proxyHTTP, "ok", false)
	directTCPOK := boolPayload(directTCP, "ok", false)
	proxyTCPOK := boolPayload(proxyTCP, "ok", false)
	pingOK := boolPayload(ping, "ok", false)
	switch {
	case proxyHTTPOK && !directHTTPOK:
		return map[string]any{"code": "proxy-needed", "label": "нужен proxy", "detail": "HTTP напрямую не открылся, через proxy работает"}
	case proxyHTTPOK && directHTTPOK:
		return map[string]any{"code": "both-ok", "label": "доступен", "detail": "HTTP открывается и напрямую, и через proxy"}
	case directHTTPOK && !proxyHTTPOK:
		return map[string]any{"code": "direct-only", "label": "напрямую", "detail": "HTTP напрямую работает, через выбранный proxy нет"}
	case proxyTCPOK && !directTCPOK:
		return map[string]any{"code": "proxy-tcp", "label": "TCP через proxy", "detail": "порт через proxy открыт, HTTP не ответил"}
	case directTCPOK && !proxyTCPOK:
		return map[string]any{"code": "direct-tcp", "label": "TCP напрямую", "detail": "порт напрямую открыт, через выбранный proxy нет"}
	case proxyTCPOK && directTCPOK:
		return map[string]any{"code": "tcp-open", "label": "TCP открыт", "detail": "порт открыт напрямую и через proxy, HTTP не ответил"}
	case pingOK:
		return map[string]any{"code": "ping-only", "label": "есть ping", "detail": "ICMP отвечает с роутера, TCP/HTTP не подтвердились"}
	default:
		return map[string]any{"code": "down", "label": "не открылся", "detail": "ping, TCP и HTTP не подтвердили доступность"}
	}
}

func (s *serverState) domainProxyProbe(payload map[string]any) map[string]any {
	cfg, err := s.readActiveConfig()
	if err != nil {
		return map[string]any{"ok": false, "stderr": err.Error()}
	}
	rawURL, host, port, scheme, err := domainProbeURL(strings.TrimSpace(fmt.Sprint(payload["host"])), strings.TrimSpace(fmt.Sprint(payload["url"])))
	if err != nil {
		return map[string]any{"ok": false, "stderr": err.Error()}
	}
	timeoutMs := number(payload["timeoutMs"], 5000)
	if timeoutMs < 1000 {
		timeoutMs = 1000
	}
	if timeoutMs > 15000 {
		timeoutMs = 15000
	}
	ping := directPingProbe(host, timeoutMs)
	directTCP := directTCPProbe(host, port, timeoutMs)
	direct := directHTTPProbe(rawURL, timeoutMs)
	tag := strings.TrimSpace(fmt.Sprint(payload["tag"]))
	outbound := map[string]any(nil)
	if tag != "" && tag != "<nil>" {
		outbound = findOutboundByTag(cfg, tag)
	} else {
		outbound, tag = firstProxyOutbound(cfg)
	}
	proxyTCP := map[string]any{"ok": false, "error": "proxy outbound не найден"}
	proxy := map[string]any{"ok": false, "error": "proxy outbound не найден"}
	if outbound != nil {
		tcpLatency, tcpOK, tcpErr := s.tcpOutboundProbe(outbound, host, port, timeoutMs, 1)
		proxyTCP = map[string]any{"ok": tcpOK, "tag": tag, "address": net.JoinHostPort(host, port)}
		if tcpLatency > 0 {
			proxyTCP["latencyMs"] = tcpLatency
		}
		if tcpErr != nil {
			proxyTCP["error"] = tcpErr.Error()
		}
		latency, ok, probeErr := s.httpOutboundProbe(outbound, rawURL, timeoutMs, 1)
		proxy = map[string]any{"ok": ok, "tag": tag}
		if latency > 0 {
			proxy["latencyMs"] = latency
		}
		if probeErr != nil {
			proxy["error"] = probeErr.Error()
		}
	}
	checks := map[string]any{
		"ping":       ping,
		"tcpDirect":  directTCP,
		"tcpProxy":   proxyTCP,
		"httpDirect": direct,
		"httpProxy":  proxy,
	}
	verdict := domainProbeVerdict(ping, directTCP, proxyTCP, direct, proxy)
	return map[string]any{
		"ok":       true,
		"host":     host,
		"url":      rawURL,
		"endpoint": map[string]any{"host": host, "port": port, "scheme": scheme},
		"tag":      tag,
		"direct":   direct,
		"proxy":    proxy,
		"checks":   checks,
		"verdict":  verdict,
	}
}

func readFileString(path string) string {
	body, err := os.ReadFile(path)
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(body))
}

func commandName(name string) string {
	if commandExists(name) {
		return name
	}
	return ""
}

func errString(err error) string {
	if err == nil {
		return ""
	}
	return err.Error()
}

func commandExists(name string) bool {
	_, err := exec.LookPath(name)
	return err == nil
}

func geoPresets() []map[string]any {
	return []map[string]any{
		{
			"id": "loyalsoldier", "name": "Loyalsoldier", "purpose": "универсальный набор", "mode": "replace", "compat": "Xray DAT", "installable": true,
			"estimatedBytes": 32 * 1024 * 1024, "detail": "Базовый набор geoip.dat/geosite.dat для маршрутизации Xray.",
			"geoipUrl": "https://github.com/Loyalsoldier/v2ray-rules-dat/releases/latest/download/geoip.dat", "geositeUrl": "https://github.com/Loyalsoldier/v2ray-rules-dat/releases/latest/download/geosite.dat",
		},
		{
			"id": "loyalsoldier-cdn", "name": "Loyalsoldier CDN", "purpose": "универсальный набор через CDN", "mode": "replace", "compat": "Xray DAT", "installable": true,
			"estimatedBytes": 32 * 1024 * 1024, "detail": "То же содержимое через jsDelivr, удобно если GitHub с роутера открывается нестабильно.",
			"geoipUrl": "https://cdn.jsdelivr.net/gh/Loyalsoldier/v2ray-rules-dat@release/geoip.dat", "geositeUrl": "https://cdn.jsdelivr.net/gh/Loyalsoldier/v2ray-rules-dat@release/geosite.dat",
		},
		{
			"id": "runetfreedom", "name": "RUNET Freedom", "purpose": "российские блокировки", "mode": "replace", "compat": "Xray DAT", "installable": true,
			"estimatedBytes": 28 * 1024 * 1024, "detail": "Набор для российского сегмента: заблокированные домены, IP-диапазоны и популярные сервисы для обхода.",
			"ruleHint":   "domain(geosite:ru-blocked) -> proxy",
			"geoipUrl":   "https://raw.githubusercontent.com/runetfreedom/russia-v2ray-rules-dat/release/geoip.dat",
			"geositeUrl": "https://raw.githubusercontent.com/runetfreedom/russia-v2ray-rules-dat/release/geosite.dat",
		},
		{
			"id": "nidelon", "name": "Nidelon", "purpose": "российские блокировки", "mode": "replace", "compat": "Xray DAT", "installable": true,
			"estimatedBytes": 8 * 1024 * 1024, "detail": "Компактный набор блокировок РКН. В оригинальном проекте используется как отдельные ext-файлы, но здесь может заменить базовые geoip/geosite.",
			"ruleHint":   "ext:geosite_RU.dat:ru-block / ext:geoip_RU.dat:ru-block",
			"geoipUrl":   "https://raw.githubusercontent.com/Nidelon/ru-block-v2ray-rules/release/geoip.dat",
			"geositeUrl": "https://raw.githubusercontent.com/Nidelon/ru-block-v2ray-rules/release/geosite.dat",
		},
		{
			"id": "b4geoip", "name": "b4geoip", "purpose": "расширенный GeoIP", "mode": "geoip-only", "compat": "Xray geoip.dat", "installable": true,
			"estimatedBytes": 21 * 1024 * 1024, "detail": "GeoIP от DanielLavrushin/b4geoip: обновляет только geoip.dat и оставляет текущий geosite.dat без изменений.",
			"ruleHint":  "ip(geoip:...) -> proxy/direct",
			"geoipUrl":  "https://github.com/DanielLavrushin/b4geoip/releases/latest/download/geoip.dat",
			"sourceUrl": "https://github.com/DanielLavrushin/b4geoip",
		},
		{
			"id": "dustinwin", "name": "DustinWin", "purpose": "Китай и CDN", "mode": "replace", "compat": "mihomo/Xray DAT", "installable": true,
			"estimatedBytes": 30 * 1024 * 1024, "detail": "Китайский ruleset/geodata набор с категориями для CN, CDN, медиа и популярных сервисов.",
			"geoipUrl": "https://github.com/DustinWin/ruleset_geodata/releases/download/mihomo-geodata/geoip.dat", "geositeUrl": "https://github.com/DustinWin/ruleset_geodata/releases/download/mihomo-geodata/geosite.dat",
		},
		{
			"id": "chocolate4u", "name": "Chocolate4U", "purpose": "Иран", "mode": "replace", "compat": "Xray DAT", "installable": true,
			"estimatedBytes": 24 * 1024 * 1024, "detail": "Иранский набор: локальные домены, sanctioned, ads, malware, phishing и другие категории.",
			"geoipUrl": "https://cdn.jsdelivr.net/gh/chocolate4u/Iran-v2ray-rules@release/geoip.dat", "geositeUrl": "https://cdn.jsdelivr.net/gh/chocolate4u/Iran-v2ray-rules@release/geosite.dat",
		},
		{
			"id": "antifilter-community", "name": "antifilter-community", "purpose": "РФ блокировки", "mode": "extra-geosite", "compat": "Xray ext DAT", "installable": true,
			"estimatedBytes": 256 * 1024, "detail": "Дополнительный geosite-файл для правил ext по спискам community.antifilter.download.",
			"target": "LoyalsoldierSite.dat", "ruleHint": "domain(ext:\"LoyalsoldierSite.dat:antifilter-community\") -> proxy",
			"geositeUrl": "https://github.com/1andrevich/antifilter-domain/releases/latest/download/geosite.dat",
		},
		{
			"id": "metacubex", "name": "MetaCubeX", "purpose": "AI/CDN/Discord", "mode": "replace", "compat": "Xray DAT", "installable": true,
			"estimatedBytes": 24 * 1024 * 1024, "detail": "Альтернативный rules-dat с актуальными категориями для mihomo/Clash.Meta и Xray DAT.",
			"geoipUrl": "https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/geoip.dat", "geositeUrl": "https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/geosite.dat",
		},
		{
			"id": "sagernet", "name": "SagerNet", "purpose": "OpenWrt/sing-box", "mode": "reference", "compat": "sing-box DB", "installable": false,
			"detail":   "Справочные sing-box базы geoip.db/geosite.db. Xray не читает этот формат напрямую.",
			"geoipUrl": "https://github.com/SagerNet/sing-geoip/releases/latest/download/geoip.db", "geositeUrl": "https://github.com/SagerNet/sing-geosite/releases/latest/download/geosite.db",
		},
		{
			"id": "blockcheck", "name": "blockcheck", "purpose": "диагностика DPI", "mode": "diagnostic", "compat": "zapret", "installable": false,
			"detail":    "Диагностический сценарий zapret для подбора DPI-стратегий; это не geo-файл Xray.",
			"sourceUrl": "https://github.com/bol-van/zapret/blob/master/blockcheck.sh",
		},
		{
			"id": "official", "name": "XTLS install-geodata", "purpose": "официальный скрипт", "mode": "reference", "compat": "Xray install script", "installable": false,
			"detail":    "Официальный install-geodata работает через XTLS/Xray-install, а не через прямые release-ассеты geoip.dat/geosite.dat.",
			"sourceUrl": "https://github.com/XTLS/Xray-install",
		},
	}
}

func visibleGeoPresets() []map[string]any {
	presets := []map[string]any{}
	for _, preset := range geoPresets() {
		mode := fmt.Sprint(preset["mode"])
		if mode == "reference" || mode == "diagnostic" {
			continue
		}
		presets = append(presets, preset)
	}
	return presets
}

func geoFileInfo(path string) map[string]any {
	info, err := os.Stat(path)
	if err != nil {
		return map[string]any{"exists": false, "path": path}
	}
	return map[string]any{"exists": true, "path": path, "size": info.Size(), "modifiedAt": info.ModTime().Format(time.RFC3339)}
}

func diskInfo(path string) map[string]any {
	target := path
	if _, err := os.Stat(target); err != nil {
		target = filepath.Dir(target)
	}
	output, err := exec.Command("df", "-Pk", target).Output()
	if err != nil {
		return map[string]any{"ok": false, "path": path, "error": err.Error()}
	}
	lines := strings.Fields(string(output))
	if len(lines) < 12 {
		return map[string]any{"ok": false, "path": path, "error": "не удалось разобрать df"}
	}
	total := parseInt64(lines[len(lines)-5]) * 1024
	used := parseInt64(lines[len(lines)-4]) * 1024
	free := parseInt64(lines[len(lines)-3]) * 1024
	return map[string]any{"ok": true, "path": path, "total": total, "used": used, "free": free, "usedPercent": lines[len(lines)-2]}
}

func (s *serverState) geoStatus() map[string]any {
	extras := []map[string]any{}
	for _, preset := range geoPresets() {
		if target := strings.TrimSpace(fmt.Sprint(preset["target"])); target != "" && target != "<nil>" {
			extras = append(extras, map[string]any{"id": preset["id"], "name": preset["name"], "file": geoFileInfo(filepath.Join(s.cfg.GeoDir, target)), "ruleHint": preset["ruleHint"]})
		}
	}
	geoip := geoFileInfo(filepath.Join(s.cfg.GeoDir, "geoip.dat"))
	geosite := geoFileInfo(filepath.Join(s.cfg.GeoDir, "geosite.dat"))
	currentDatBytes := numberAny(geoip["size"]) + numberAny(geosite["size"])
	return map[string]any{
		"ok": true, "dir": s.cfg.GeoDir, "disk": diskInfo(s.cfg.GeoDir), "presets": visibleGeoPresets(), "extras": extras, "files": s.geoInstalledFiles(), "customSources": s.geoCustomSources(),
		"geoip": geoip, "geosite": geosite, "schedule": s.geoSchedule(),
		"storage": map[string]any{
			"currentDatBytes": currentDatBytes,
			"backupBytes":     dirSizeOrZero(s.cfg.BackupDir),
			"compactPreset":   "nidelon",
			"compactEstimate": 8 * 1024 * 1024,
			"fullEstimate":    32 * 1024 * 1024,
		},
	}
}

func (s *serverState) geoInstalledFiles() []map[string]any {
	entries, err := os.ReadDir(s.cfg.GeoDir)
	if err != nil {
		return []map[string]any{}
	}
	files := []map[string]any{}
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(strings.ToLower(entry.Name()), ".dat") {
			continue
		}
		info := geoFileInfo(filepath.Join(s.cfg.GeoDir, entry.Name()))
		info["name"] = entry.Name()
		if entry.Name() == "geoip.dat" || entry.Name() == "geosite.dat" {
			info["role"] = "base"
		} else {
			info["role"] = "extra"
		}
		files = append(files, info)
	}
	sort.Slice(files, func(i, j int) bool {
		return fmt.Sprint(files[i]["name"]) < fmt.Sprint(files[j]["name"])
	})
	return files
}

func (s *serverState) geoSourcesPath() string {
	return filepath.Join(s.cfg.DataDir, "geo-sources.json")
}

func cleanGeoSourceID(value string) string {
	clean := strings.ToLower(strings.TrimSpace(value))
	clean = regexp.MustCompile(`[^a-z0-9_-]+`).ReplaceAllString(clean, "-")
	clean = strings.Trim(clean, "-_")
	if clean == "" {
		clean = fmt.Sprintf("source-%d", time.Now().Unix())
	}
	if !strings.HasPrefix(clean, "custom-") {
		clean = "custom-" + clean
	}
	return clean
}

func cleanGeoTarget(value string) string {
	name := filepath.Base(strings.TrimSpace(value))
	name = strings.ReplaceAll(name, "\\", "")
	if name == "." || name == "/" || name == "" {
		return ""
	}
	if !strings.HasSuffix(strings.ToLower(name), ".dat") {
		name += ".dat"
	}
	return name
}

func normalizeGeoSource(raw map[string]any, index int) map[string]any {
	name := strings.TrimSpace(fmt.Sprint(raw["name"]))
	if name == "" || name == "<nil>" {
		name = fmt.Sprintf("Custom source %d", index+1)
	}
	kind := strings.TrimSpace(fmt.Sprint(raw["kind"]))
	if kind != "extra" {
		kind = "base"
	}
	id := cleanGeoSourceID(firstNonEmpty(fmt.Sprint(raw["id"]), name))
	source := map[string]any{
		"id":             id,
		"name":           name,
		"kind":           kind,
		"enabled":        boolPayload(raw, "enabled", true),
		"estimatedBytes": 24 * 1024 * 1024,
	}
	if kind == "extra" {
		source["target"] = cleanGeoTarget(fmt.Sprint(raw["target"]))
		source["url"] = strings.TrimSpace(fmt.Sprint(raw["url"]))
		source["estimatedBytes"] = 512 * 1024
		return source
	}
	source["geoipUrl"] = strings.TrimSpace(fmt.Sprint(raw["geoipUrl"]))
	source["geositeUrl"] = strings.TrimSpace(fmt.Sprint(raw["geositeUrl"]))
	return source
}

func (s *serverState) geoCustomSources() []map[string]any {
	body, err := os.ReadFile(s.geoSourcesPath())
	if err != nil {
		return []map[string]any{}
	}
	var raw []map[string]any
	if json.Unmarshal(body, &raw) != nil {
		return []map[string]any{}
	}
	sources := make([]map[string]any, 0, len(raw))
	for index, item := range raw {
		sources = append(sources, normalizeGeoSource(item, index))
	}
	return sources
}

func (s *serverState) saveGeoCustomSources(payload map[string]any) map[string]any {
	var raw []map[string]any
	if values, ok := payload["sources"].([]any); ok {
		for _, value := range values {
			if item, ok := value.(map[string]any); ok {
				raw = append(raw, item)
			}
		}
	}
	sources := make([]map[string]any, 0, len(raw))
	seen := map[string]bool{}
	for index, item := range raw {
		source := normalizeGeoSource(item, index)
		id := fmt.Sprint(source["id"])
		if seen[id] {
			source["id"] = fmt.Sprintf("%s-%d", id, index+1)
		}
		seen[fmt.Sprint(source["id"])] = true
		sources = append(sources, source)
	}
	body, _ := json.MarshalIndent(sources, "", "  ")
	if err := os.MkdirAll(s.cfg.DataDir, 0o755); err != nil {
		return map[string]any{"ok": false, "stderr": err.Error()}
	}
	if err := os.WriteFile(s.geoSourcesPath(), body, 0o600); err != nil {
		return map[string]any{"ok": false, "stderr": err.Error(), "sources": sources}
	}
	return map[string]any{"ok": true, "sources": sources, "status": s.geoStatus(), "stdout": "Свои источники geodata сохранены"}
}

func stringList(value any) []string {
	var out []string
	switch typed := value.(type) {
	case []any:
		for _, item := range typed {
			if clean := strings.TrimSpace(fmt.Sprint(item)); clean != "" && clean != "<nil>" {
				out = append(out, clean)
			}
		}
	case []string:
		for _, item := range typed {
			if clean := strings.TrimSpace(item); clean != "" {
				out = append(out, clean)
			}
		}
	case string:
		for _, item := range strings.Split(typed, ",") {
			if clean := strings.TrimSpace(item); clean != "" {
				out = append(out, clean)
			}
		}
	}
	return out
}

func containsString(values []string, needle string) bool {
	for _, value := range values {
		if value == needle {
			return true
		}
	}
	return false
}

func boolPayload(payload map[string]any, key string, fallback bool) bool {
	value, ok := payload[key]
	if !ok {
		return fallback
	}
	switch typed := value.(type) {
	case bool:
		return typed
	case string:
		clean := strings.ToLower(strings.TrimSpace(typed))
		return clean == "true" || clean == "1" || clean == "yes" || clean == "on"
	default:
		return fmt.Sprint(value) == "1"
	}
}

func cleanPayloadString(payload map[string]any, key string) string {
	value, ok := payload[key]
	if !ok || value == nil {
		return ""
	}
	text := fmt.Sprint(value)
	if text == "<nil>" {
		return ""
	}
	return text
}

func (s *serverState) geoSchedulePath() string {
	return filepath.Join(s.cfg.DataDir, "geo-schedule.json")
}

func (s *serverState) geoSchedule() map[string]any {
	defaults := map[string]any{
		"enabled": false, "interval": "weekly", "weekday": "0", "time": "04:20",
		"preset": "nidelon", "presets": []string{"nidelon"}, "customSourceIds": []string{}, "backup": false,
	}
	body, err := os.ReadFile(s.geoSchedulePath())
	if err != nil {
		return defaults
	}
	var saved map[string]any
	if json.Unmarshal(body, &saved) != nil {
		return defaults
	}
	for key, value := range defaults {
		if _, ok := saved[key]; !ok {
			saved[key] = value
		}
	}
	return saved
}

func cleanScheduleTime(value string) (int, int) {
	hour, minute := 4, 20
	parts := strings.Split(value, ":")
	if len(parts) == 2 {
		hour = number(parts[0], hour)
		minute = number(parts[1], minute)
	}
	if hour < 0 || hour > 23 {
		hour = 4
	}
	if minute < 0 || minute > 59 {
		minute = 20
	}
	return hour, minute
}

func cleanWeekday(value string) int {
	weekday := number(value, 0)
	if weekday < 0 || weekday > 6 {
		return 0
	}
	return weekday
}

func shellQuote(value string) string {
	return "'" + strings.ReplaceAll(value, "'", "'\"'\"'") + "'"
}

func (s *serverState) saveGeoSchedule(payload map[string]any) map[string]any {
	presets := stringList(payload["presets"])
	if len(presets) == 0 {
		if preset := strings.TrimSpace(fmt.Sprint(payload["preset"])); preset != "" && preset != "<nil>" {
			presets = append(presets, preset)
		}
	}
	if len(presets) == 0 {
		presets = []string{"loyalsoldier"}
	}
	hour, minute := cleanScheduleTime(fmt.Sprint(payload["time"]))
	weekday := cleanWeekday(fmt.Sprint(payload["weekday"]))
	schedule := map[string]any{
		"enabled": boolPayload(payload, "enabled", false), "interval": firstNonEmpty(fmt.Sprint(payload["interval"]), "weekly"),
		"weekday": fmt.Sprint(weekday), "time": fmt.Sprintf("%02d:%02d", hour, minute), "presets": presets,
		"preset": presets[0], "customSourceIds": stringList(payload["customSourceIds"]), "backup": boolPayload(payload, "backup", false),
		"geoipUrl": strings.TrimSpace(fmt.Sprint(payload["geoipUrl"])), "geositeUrl": strings.TrimSpace(fmt.Sprint(payload["geositeUrl"])),
	}
	body, _ := json.MarshalIndent(schedule, "", "  ")
	if err := os.WriteFile(s.geoSchedulePath(), body, 0o600); err != nil {
		return map[string]any{"ok": false, "stderr": err.Error(), "schedule": schedule}
	}
	cron := s.installGeoCron(schedule)
	return map[string]any{"ok": cron["ok"], "schedule": schedule, "cron": cron, "status": s.geoStatus(), "stdout": cron["stdout"], "stderr": cron["stderr"]}
}

func (s *serverState) installGeoCron(schedule map[string]any) map[string]any {
	if runtime.GOOS == "windows" {
		return map[string]any{"ok": true, "stdout": "dev-mode: расписание сохранено без установки cron"}
	}
	const marker = "# RuOpenRay geo update"
	rootCrontab := "/etc/crontabs/root"
	body, _ := os.ReadFile(rootCrontab)
	var lines []string
	for _, line := range strings.Split(string(body), "\n") {
		if strings.Contains(line, marker) || strings.TrimSpace(line) == "" {
			continue
		}
		lines = append(lines, line)
	}
	if schedule["enabled"] == true {
		hour, minute := cleanScheduleTime(fmt.Sprint(schedule["time"]))
		weekday := cleanWeekday(fmt.Sprint(schedule["weekday"]))
		dow := "*"
		if fmt.Sprint(schedule["interval"]) == "weekly" {
			dow = fmt.Sprint(weekday)
		}
		binary := os.Args[0]
		if !filepath.IsAbs(binary) {
			binary = "/usr/bin/ruopenray-ui"
		}
		env := fmt.Sprintf("RUOPENRAY_DATA_DIR=%s RUOPENRAY_GEO_DIR=%s RUOPENRAY_BACKUP_DIR=%s RUOPENRAY_XRAY_SERVICE=%s", shellQuote(s.cfg.DataDir), shellQuote(s.cfg.GeoDir), shellQuote(s.cfg.BackupDir), shellQuote(s.cfg.ServiceName))
		lines = append(lines, fmt.Sprintf("%d %d * * %s %s %s --geo-update-scheduled >/tmp/ruopenray-geo-update.log 2>&1 %s", minute, hour, dow, env, shellQuote(binary), marker))
	}
	content := strings.Join(lines, "\n")
	if strings.TrimSpace(content) != "" {
		content += "\n"
	}
	if err := os.WriteFile(rootCrontab, []byte(content), 0o600); err != nil {
		return map[string]any{"ok": false, "stderr": err.Error()}
	}
	restart := exec.Command("/etc/init.d/cron", "restart").Run()
	if restart != nil {
		return map[string]any{"ok": true, "stdout": "cron-файл обновлен, но cron не удалось перезапустить: " + restart.Error()}
	}
	return map[string]any{"ok": true, "stdout": "Расписание geo обновлено"}
}

func (s *serverState) runScheduledGeoUpdate() map[string]any {
	schedule := s.geoSchedule()
	if schedule["enabled"] != true {
		return map[string]any{"ok": true, "stdout": "Расписание geo выключено"}
	}
	return s.updateGeo(schedule)
}

func (s *serverState) updateGeo(payload map[string]any) map[string]any {
	geoipURL := strings.TrimSpace(fmt.Sprint(payload["geoipUrl"]))
	geositeURL := strings.TrimSpace(fmt.Sprint(payload["geositeUrl"]))
	backup := boolPayload(payload, "backup", false)
	selected := stringList(payload["presets"])
	if len(selected) == 0 {
		if presetID := strings.TrimSpace(fmt.Sprint(payload["preset"])); presetID != "" && presetID != "<nil>" {
			selected = append(selected, presetID)
		}
	}
	if err := os.MkdirAll(s.cfg.GeoDir, 0o755); err != nil {
		return map[string]any{"ok": false, "stderr": err.Error()}
	}
	updates := []map[string]any{}
	baseCount := 0
	for _, presetID := range selected {
		if presetID == "custom" {
			continue
		}
		found := false
		for _, preset := range geoPresets() {
			if fmt.Sprint(preset["id"]) != presetID {
				continue
			}
			found = true
			if installable, ok := preset["installable"].(bool); ok && !installable {
				return map[string]any{"ok": false, "stderr": "Этот источник справочный и не устанавливается в Xray автоматически"}
			}
			mode := fmt.Sprint(preset["mode"])
			if mode == "extra-geosite" {
				target := strings.TrimSpace(fmt.Sprint(preset["target"]))
				url := strings.TrimSpace(fmt.Sprint(preset["geositeUrl"]))
				if target == "" || target == "<nil>" || url == "" || url == "<nil>" {
					return map[string]any{"ok": false, "stderr": "Для дополнительного geosite-файла не задана ссылка или имя файла"}
				}
				updates = append(updates, s.downloadGeoFile(target, url, backup))
				continue
			}
			baseCount++
			if baseCount > 1 {
				return map[string]any{"ok": false, "stderr": "Выберите только один базовый источник geoip.dat/geosite.dat. Дополнительные DAT можно ставить вместе с ним."}
			}
			if mode == "geoip-only" {
				url := strings.TrimSpace(fmt.Sprint(preset["geoipUrl"]))
				if url == "" || url == "<nil>" {
					return map[string]any{"ok": false, "stderr": "Для источника geoip.dat не задана ссылка"}
				}
				updates = append(updates, s.downloadGeoFile("geoip.dat", url, backup))
				continue
			}
			updates = append(updates, s.downloadGeoFile("geoip.dat", fmt.Sprint(preset["geoipUrl"]), backup))
			updates = append(updates, s.downloadGeoFile("geosite.dat", fmt.Sprint(preset["geositeUrl"]), backup))
		}
		if !found {
			return map[string]any{"ok": false, "stderr": "Неизвестный geo-источник: " + presetID}
		}
	}
	customIDs := stringList(payload["customSourceIds"])
	if len(customIDs) > 0 {
		sources := s.geoCustomSources()
		for _, sourceID := range customIDs {
			found := false
			for _, source := range sources {
				if fmt.Sprint(source["id"]) != sourceID {
					continue
				}
				found = true
				if source["enabled"] == false {
					return map[string]any{"ok": false, "stderr": "Источник geodata выключен: " + sourceID}
				}
				if fmt.Sprint(source["kind"]) == "extra" {
					target := cleanGeoTarget(fmt.Sprint(source["target"]))
					rawURL := strings.TrimSpace(fmt.Sprint(source["url"]))
					if target == "" || rawURL == "" || rawURL == "<nil>" {
						return map[string]any{"ok": false, "stderr": "Для дополнительного dat-источника не задан URL или имя файла: " + sourceID}
					}
					updates = append(updates, s.downloadGeoFile(target, rawURL, backup))
					continue
				}
				baseCount++
				if baseCount > 1 {
					return map[string]any{"ok": false, "stderr": "Выберите только один базовый источник geoip.dat/geosite.dat. Дополнительные DAT можно ставить вместе с ним."}
				}
				geoipURL := strings.TrimSpace(fmt.Sprint(source["geoipUrl"]))
				geositeURL := strings.TrimSpace(fmt.Sprint(source["geositeUrl"]))
				if geoipURL == "" || geositeURL == "" || geoipURL == "<nil>" || geositeURL == "<nil>" {
					return map[string]any{"ok": false, "stderr": "Для базового geodata-источника не заданы обе ссылки: " + sourceID}
				}
				updates = append(updates, s.downloadGeoFile("geoip.dat", geoipURL, backup))
				updates = append(updates, s.downloadGeoFile("geosite.dat", geositeURL, backup))
			}
			if !found {
				return map[string]any{"ok": false, "stderr": "Неизвестный пользовательский geodata-источник: " + sourceID}
			}
		}
	}
	if (len(selected) == 0 && len(customIDs) == 0) || containsString(selected, "custom") {
		if geoipURL == "" || geositeURL == "" || geoipURL == "<nil>" || geositeURL == "<nil>" {
			return map[string]any{"ok": false, "stderr": "Укажите ссылки на geoip.dat и geosite.dat"}
		}
		updates = append(updates, s.downloadGeoFile("geoip.dat", geoipURL, backup))
		updates = append(updates, s.downloadGeoFile("geosite.dat", geositeURL, backup))
	}
	ok := len(updates) > 0
	for _, update := range updates {
		ok = ok && update["ok"] == true
	}
	restart := map[string]any{"ok": true, "stdout": ""}
	if ok {
		restart = s.serviceAction("restart")
		ok = restart["ok"].(bool)
	}
	items := []map[string]any{}
	for _, update := range updates {
		items = append(items, update)
	}
	items = append(items, restart)
	return map[string]any{"ok": ok, "backup": backup, "updates": updates, "restart": restart, "status": s.geoStatus(), "stdout": concatCommandOutput(items...)}
}

func (s *serverState) updateGeoLegacy(payload map[string]any) map[string]any {
	geoipURL := strings.TrimSpace(fmt.Sprint(payload["geoipUrl"]))
	geositeURL := strings.TrimSpace(fmt.Sprint(payload["geositeUrl"]))
	mode := "custom"
	target := ""
	if presetID := strings.TrimSpace(fmt.Sprint(payload["preset"])); presetID != "" && presetID != "<nil>" {
		for _, preset := range geoPresets() {
			if fmt.Sprint(preset["id"]) == presetID {
				if installable, ok := preset["installable"].(bool); ok && !installable {
					return map[string]any{"ok": false, "stderr": "Этот источник добавлен как справочный и не устанавливается в Xray автоматически"}
				}
				mode = fmt.Sprint(preset["mode"])
				target = strings.TrimSpace(fmt.Sprint(preset["target"]))
				geoipURL = fmt.Sprint(preset["geoipUrl"])
				geositeURL = fmt.Sprint(preset["geositeUrl"])
			}
		}
	}
	if mode == "extra-geosite" {
		if geositeURL == "" || geositeURL == "<nil>" || target == "" || target == "<nil>" {
			return map[string]any{"ok": false, "stderr": "Для дополнительного geosite-файла не задана ссылка или имя файла"}
		}
		if err := os.MkdirAll(s.cfg.GeoDir, 0o755); err != nil {
			return map[string]any{"ok": false, "stderr": err.Error()}
		}
		geosite := s.downloadGeoFile(target, geositeURL)
		ok := geosite["ok"].(bool)
		restart := map[string]any{"ok": true, "stdout": ""}
		if ok {
			restart = s.serviceAction("restart")
			ok = restart["ok"].(bool)
		}
		return map[string]any{"ok": ok, "geosite": geosite, "restart": restart, "status": s.geoStatus(), "stdout": concatCommandOutput(geosite, restart)}
	}
	if mode == "geoip-only" {
		if geoipURL == "" || geoipURL == "<nil>" {
			return map[string]any{"ok": false, "stderr": "Для источника geoip.dat не задана ссылка"}
		}
		if err := os.MkdirAll(s.cfg.GeoDir, 0o755); err != nil {
			return map[string]any{"ok": false, "stderr": err.Error()}
		}
		geoip := s.downloadGeoFile("geoip.dat", geoipURL)
		ok := geoip["ok"].(bool)
		restart := map[string]any{"ok": true, "stdout": ""}
		if ok {
			restart = s.serviceAction("restart")
			ok = restart["ok"].(bool)
		}
		return map[string]any{"ok": ok, "geoip": geoip, "restart": restart, "status": s.geoStatus(), "stdout": concatCommandOutput(geoip, restart)}
	}
	if geoipURL == "" || geositeURL == "" || geoipURL == "<nil>" || geositeURL == "<nil>" {
		return map[string]any{"ok": false, "stderr": "Укажите ссылки на geoip.dat и geosite.dat"}
	}
	if err := os.MkdirAll(s.cfg.GeoDir, 0o755); err != nil {
		return map[string]any{"ok": false, "stderr": err.Error()}
	}
	geoip := s.downloadGeoFile("geoip.dat", geoipURL)
	geosite := s.downloadGeoFile("geosite.dat", geositeURL)
	ok := geoip["ok"].(bool) && geosite["ok"].(bool)
	restart := map[string]any{"ok": true, "stdout": ""}
	if ok {
		restart = s.serviceAction("restart")
		ok = restart["ok"].(bool)
	}
	return map[string]any{"ok": ok, "geoip": geoip, "geosite": geosite, "restart": restart, "status": s.geoStatus(), "stdout": concatCommandOutput(geoip, geosite, restart)}
}

func (s *serverState) cleanupGeoBackups() map[string]any {
	entries, err := os.ReadDir(s.cfg.BackupDir)
	if err != nil {
		return map[string]any{"ok": false, "stderr": err.Error()}
	}
	prefixes := []string{"geoip.dat-", "geosite.dat-"}
	for _, preset := range geoPresets() {
		if target := strings.TrimSpace(fmt.Sprint(preset["target"])); target != "" && target != "<nil>" {
			prefixes = append(prefixes, target+"-")
		}
	}
	deleted := 0
	var freed int64
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		name := entry.Name()
		matched := false
		for _, prefix := range prefixes {
			if strings.HasPrefix(name, prefix) {
				matched = true
				break
			}
		}
		if !matched {
			continue
		}
		path := filepath.Join(s.cfg.BackupDir, name)
		info, err := entry.Info()
		if err == nil {
			freed += info.Size()
		}
		if err := os.Remove(path); err == nil {
			deleted++
		}
	}
	return map[string]any{"ok": true, "deleted": deleted, "freed": freed, "status": s.geoStatus(), "stdout": fmt.Sprintf("Удалено geo-бэкапов: %d, освобождено %.1f MB", deleted, float64(freed)/1024/1024)}
}

func cleanGeoFileName(value string) string {
	name := filepath.Base(strings.TrimSpace(value))
	name = strings.ReplaceAll(name, "\\", "")
	if name == "." || name == "/" || name == "" || !strings.HasSuffix(strings.ToLower(name), ".dat") {
		return ""
	}
	return name
}

func (s *serverState) deleteGeoFiles(payload map[string]any) map[string]any {
	files := stringList(payload["files"])
	if file := strings.TrimSpace(fmt.Sprint(payload["file"])); file != "" && file != "<nil>" {
		files = append(files, file)
	}
	if len(files) == 0 {
		return map[string]any{"ok": false, "stderr": "Выберите dat-файл для удаления", "status": s.geoStatus()}
	}
	deleted := []map[string]any{}
	errors := []string{}
	var freed int64
	for _, raw := range files {
		name := cleanGeoFileName(raw)
		if name == "" {
			errors = append(errors, fmt.Sprintf("Некорректное имя файла: %s", raw))
			continue
		}
		target := filepath.Join(s.cfg.GeoDir, name)
		info, err := os.Stat(target)
		if err != nil {
			errors = append(errors, fmt.Sprintf("%s: %s", name, err.Error()))
			continue
		}
		if err := os.Remove(target); err != nil {
			errors = append(errors, fmt.Sprintf("%s: %s", name, err.Error()))
			continue
		}
		freed += info.Size()
		deleted = append(deleted, map[string]any{"name": name, "size": info.Size()})
	}
	ok := len(errors) == 0
	stdout := fmt.Sprintf("Удалено dat-файлов: %d, освобождено %.1f MB. Xray не перезапускался автоматически.", len(deleted), float64(freed)/1024/1024)
	return map[string]any{"ok": ok, "deleted": deleted, "errors": errors, "freed": freed, "status": s.geoStatus(), "stdout": stdout, "stderr": strings.Join(errors, "\n")}
}

func (s *serverState) downloadGeoFile(name string, rawURL string, keepBackup ...bool) map[string]any {
	downloadURL := s.mirrorURL(rawURL)
	resp, err := (&http.Client{Timeout: 90 * time.Second}).Get(downloadURL)
	if err != nil {
		return map[string]any{"ok": false, "stderr": err.Error(), "url": downloadURL, "sourceUrl": rawURL}
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return map[string]any{"ok": false, "stderr": fmt.Sprintf("download HTTP %d", resp.StatusCode), "url": downloadURL, "sourceUrl": rawURL}
	}
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return map[string]any{"ok": false, "stderr": err.Error(), "url": downloadURL, "sourceUrl": rawURL}
	}
	if len(body) < 1024 {
		return map[string]any{"ok": false, "stderr": "файл слишком маленький, похоже на ошибку загрузки", "url": downloadURL, "sourceUrl": rawURL}
	}
	target := filepath.Join(s.cfg.GeoDir, name)
	backup := len(keepBackup) == 0 || keepBackup[0]
	if backup {
		if err := os.MkdirAll(s.cfg.BackupDir, 0o755); err != nil {
			return map[string]any{"ok": false, "stderr": err.Error(), "url": downloadURL, "sourceUrl": rawURL}
		}
	}
	if backup {
		current, err := os.ReadFile(target)
		if err == nil && len(current) > 0 {
			backup := filepath.Join(s.cfg.BackupDir, name+"-"+time.Now().Format("20060102-150405"))
			_ = os.WriteFile(backup, current, 0o644)
		}
	}
	if err := os.WriteFile(target, body, 0o644); err != nil {
		return map[string]any{"ok": false, "stderr": err.Error(), "url": downloadURL, "sourceUrl": rawURL}
	}
	return map[string]any{"ok": true, "stdout": fmt.Sprintf("%s обновлен: %.1f MB", name, float64(len(body))/1024/1024), "url": downloadURL, "sourceUrl": rawURL, "size": len(body)}
}

func (s *serverState) validateConfig(cfg map[string]any) map[string]any {
	if cfg == nil {
		var err error
		cfg, err = s.readActiveConfig()
		if err != nil {
			return map[string]any{"ok": false, "stderr": err.Error()}
		}
	}
	if runtime.GOOS == "windows" {
		return map[string]any{"ok": true, "stdout": "dev-mode: JSON корректен; бинарник xray на Windows не проверялся"}
	}
	body, _ := json.MarshalIndent(cfg, "", "  ")
	tmp := filepath.Join(s.cfg.DataDir, fmt.Sprintf(".test-%d.json", time.Now().UnixNano()))
	if err := os.WriteFile(tmp, body, 0o600); err != nil {
		return map[string]any{"ok": false, "stderr": err.Error()}
	}
	defer os.Remove(tmp)
	return s.runXray("run", "-test", "-config", tmp)
}

func (s *serverState) analyzeConfig(cfg map[string]any) map[string]any {
	if cfg == nil {
		var err error
		cfg, err = s.readActiveConfig()
		if err != nil {
			return map[string]any{"ok": false, "errors": []string{err.Error()}}
		}
	}
	outbounds := map[string]map[string]any{}
	for _, item := range asArray(cfg["outbounds"]) {
		if outbound, ok := item.(map[string]any); ok {
			tag := strings.TrimSpace(fmt.Sprint(outbound["tag"]))
			if tag != "" && tag != "<nil>" {
				outbounds[tag] = outbound
			}
		}
	}
	apiTags := map[string]bool{}
	if api, ok := cfg["api"].(map[string]any); ok {
		if tag := strings.TrimSpace(fmt.Sprint(api["tag"])); tag != "" && tag != "<nil>" {
			apiTags[tag] = true
		}
	}
	warnings := []string{}
	errors := []string{}
	info := []string{}
	counts := map[string]int{"proxy": 0, "direct": 0, "block": 0, "other": 0, "total": 0}
	geoipPath := filepath.Join(s.cfg.GeoDir, "geoip.dat")
	geositePath := filepath.Join(s.cfg.GeoDir, "geosite.dat")
	routing, _ := cfg["routing"].(map[string]any)
	balancers := map[string]bool{}
	rawBalancers := asArray(routing["balancers"])
	observatory, _ := cfg["observatory"].(map[string]any)
	observatorySelectors := map[string]bool{}
	for _, item := range asArray(observatory["subjectSelector"]) {
		selector := strings.TrimSpace(fmt.Sprint(item))
		if selector != "" && selector != "<nil>" {
			observatorySelectors[selector] = true
		}
	}
	burstObservatory, _ := cfg["burstObservatory"].(map[string]any)
	burstObservatorySelectors := map[string]bool{}
	for _, item := range asArray(burstObservatory["subjectSelector"]) {
		selector := strings.TrimSpace(fmt.Sprint(item))
		if selector != "" && selector != "<nil>" {
			burstObservatorySelectors[selector] = true
		}
	}
	for index, item := range rawBalancers {
		if balancer, ok := item.(map[string]any); ok {
			tag := strings.TrimSpace(fmt.Sprint(balancer["tag"]))
			if tag != "" && tag != "<nil>" {
				balancers[tag] = true
			}
			strategy := "random"
			if strategyMap, ok := balancer["strategy"].(map[string]any); ok {
				strategy = strings.TrimSpace(fmt.Sprint(strategyMap["type"]))
			}
			if strategy == "leastPing" || strategy == "leastLoad" {
				requiredSelectors := observatorySelectors
				requiredName := "observatory.subjectSelector"
				if strategy == "leastLoad" {
					requiredSelectors = burstObservatorySelectors
					requiredName = "burstObservatory.subjectSelector"
				}
				hasSelector := false
				for _, selector := range asArray(balancer["selector"]) {
					if requiredSelectors[strings.TrimSpace(fmt.Sprint(selector))] {
						hasSelector = true
						break
					}
				}
				if !hasSelector {
					warnings = append(warnings, fmt.Sprintf("Балансировщик %d: strategy %s требует %s", index+1, strategy, requiredName))
				}
			}
		}
	}
	for index, item := range asArray(routing["rules"]) {
		rule, ok := item.(map[string]any)
		if !ok {
			continue
		}
		counts["total"]++
		tag := strings.TrimSpace(fmt.Sprint(rule["outboundTag"]))
		if tag == "<nil>" {
			tag = ""
		}
		balancerTag := strings.TrimSpace(fmt.Sprint(rule["balancerTag"]))
		if balancerTag == "<nil>" {
			balancerTag = ""
		}
		if tag != "" && balancerTag != "" {
			errors = append(errors, fmt.Sprintf("Правило %d: укажите outboundTag или balancerTag, но не оба сразу", index+1))
		} else if tag == "" && balancerTag == "" {
			warnings = append(warnings, fmt.Sprintf("Правило %d: не указан outboundTag или balancerTag", index+1))
		} else if balancerTag != "" && !balancers[balancerTag] {
			errors = append(errors, fmt.Sprintf("Правило %d: balancerTag %q не найден в routing.balancers", index+1, balancerTag))
		} else if tag != "" {
			if _, exists := outbounds[tag]; !exists && !apiTags[tag] {
				errors = append(errors, fmt.Sprintf("Правило %d: outboundTag %q не найден в outbounds", index+1, tag))
			}
		}
		switch {
		case balancerTag != "":
			counts["proxy"]++
		case tag == "direct":
			counts["direct"]++
		case tag == "block":
			counts["block"]++
		default:
			if outbound, exists := outbounds[tag]; exists && !isSystemOutbound(outbound) {
				counts["proxy"]++
			} else {
				counts["other"]++
			}
		}
		if fmt.Sprint(rule["port"]) == "0-65535" && len(asArray(rule["domain"])) == 0 && len(asArray(rule["ip"])) == 0 && len(asArray(rule["source"])) == 0 {
			target := firstNonEmpty(tag, "не задано")
			if balancerTag != "" {
				target = "balancer:" + balancerTag
			}
			info = append(info, fmt.Sprintf("Правило %d: default/catch-all идет в %s", index+1, target))
		}
		for _, value := range asArray(rule["domain"]) {
			domain := strings.TrimSpace(fmt.Sprint(value))
			if strings.HasPrefix(domain, "geosite:") && !fileExists(geositePath) {
				warnings = append(warnings, fmt.Sprintf("Правило %d: geosite требует %s", index+1, geositePath))
			}
			if strings.HasPrefix(domain, "ext:") {
				file := extDatFile(domain)
				if file == "" {
					warnings = append(warnings, fmt.Sprintf("Правило %d: ext-список указан без имени .dat файла", index+1))
				} else if !fileExists(filepath.Join(s.cfg.GeoDir, file)) {
					warnings = append(warnings, fmt.Sprintf("Правило %d: ext-списку нужен %s", index+1, filepath.Join(s.cfg.GeoDir, file)))
				}
			}
		}
		for _, value := range asArray(rule["ip"]) {
			ip := strings.TrimSpace(fmt.Sprint(value))
			if strings.HasPrefix(ip, "geoip:") && !fileExists(geoipPath) {
				warnings = append(warnings, fmt.Sprintf("Правило %d: geoip требует %s", index+1, geoipPath))
			}
		}
	}
	return map[string]any{"ok": len(errors) == 0, "errors": errors, "warnings": warnings, "info": info, "counts": counts}
}

func isSystemOutbound(outbound map[string]any) bool {
	tag := fmt.Sprint(outbound["tag"])
	protocol := fmt.Sprint(outbound["protocol"])
	return tag == "direct" || tag == "block" || tag == "dns-out" || protocol == "freedom" || protocol == "blackhole" || protocol == "dns"
}

func fileExists(path string) bool {
	info, err := os.Stat(path)
	return err == nil && !info.IsDir()
}

func extDatFile(value string) string {
	raw := strings.TrimPrefix(strings.TrimSpace(value), "ext:")
	raw = strings.Trim(raw, "\"")
	parts := strings.SplitN(raw, ":", 2)
	return strings.TrimSpace(parts[0])
}

func (s *serverState) applyConfig(w http.ResponseWriter, r *http.Request) {
	payload, err := readJSON(r)
	if err != nil {
		writeJSON(w, 400, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	if cfg, ok := payload["config"].(map[string]any); ok {
		test := s.validateConfig(cfg)
		analysis := s.analyzeConfig(cfg)
		if test["ok"] != true {
			writeJSON(w, 422, map[string]any{"ok": false, "test": test, "analysis": analysis})
			return
		}
		backup, err := s.backupActive("config-before-apply")
		if err != nil {
			writeJSON(w, 500, map[string]any{"ok": false, "error": err.Error(), "test": test, "analysis": analysis})
			return
		}
		if err := s.writeActiveConfig(cfg); err != nil {
			writeJSON(w, 500, map[string]any{"ok": false, "error": err.Error(), "backup": backup, "test": test, "analysis": analysis})
			return
		}
		restart := s.serviceAction("restart")
		writeJSON(w, 200, map[string]any{"ok": restart["ok"], "test": test, "analysis": analysis, "restart": restart, "backup": backup})
		return
	}
	test := s.validateConfig(nil)
	if test["ok"] != true {
		writeJSON(w, 422, map[string]any{"ok": false, "test": test})
		return
	}
	restart := s.serviceAction("restart")
	writeJSON(w, 200, map[string]any{"ok": restart["ok"], "test": test, "restart": restart})
}

type profileInfo struct {
	Name      string `json:"name"`
	File      string `json:"file"`
	Size      int64  `json:"size"`
	UpdatedAt string `json:"updatedAt"`
	Active    bool   `json:"active"`
}

func (s *serverState) listProfiles() ([]profileInfo, error) {
	activeBody, _ := os.ReadFile(s.cfg.ActiveConfig)
	entries, err := os.ReadDir(s.cfg.ProfilesDir)
	if err != nil {
		return nil, err
	}
	var profiles []profileInfo
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".json") {
			continue
		}
		path := filepath.Join(s.cfg.ProfilesDir, entry.Name())
		info, err := entry.Info()
		if err != nil {
			continue
		}
		body, _ := os.ReadFile(path)
		profiles = append(profiles, profileInfo{
			Name: strings.TrimSuffix(entry.Name(), ".json"), File: entry.Name(), Size: info.Size(),
			UpdatedAt: info.ModTime().Format(time.RFC3339), Active: bytes.Equal(bytes.TrimSpace(body), bytes.TrimSpace(activeBody)),
		})
	}
	sort.Slice(profiles, func(i, j int) bool {
		if profiles[i].Active != profiles[j].Active {
			return profiles[i].Active
		}
		return profiles[i].Name < profiles[j].Name
	})
	return profiles, nil
}

func cleanProfileName(name string) string {
	re := regexp.MustCompile(`[^a-zA-Z0-9._-]+`)
	base := filepath.Base(strings.TrimSpace(name))
	if base == "." {
		base = ""
	}
	clean := re.ReplaceAllString(base, "-")
	if clean == "" {
		clean = "profile"
	}
	if !strings.HasSuffix(clean, ".json") {
		clean += ".json"
	}
	return clean
}

func profileNameFallback(values ...string) string {
	for _, value := range values {
		clean := strings.TrimSpace(value)
		if clean != "" && clean != "<nil>" && clean != "undefined" && clean != "null" {
			return clean
		}
	}
	return "profile"
}

func outboundTagFallback(value string) string {
	clean := strings.TrimSpace(value)
	if clean == "" || clean == "<nil>" || clean == "undefined" || clean == "null" {
		return ""
	}
	clean = strings.TrimPrefix(clean, "outbound:")
	clean = strings.TrimPrefix(clean, "balancer:")
	clean = regexp.MustCompile(`[^A-Za-z0-9._:-]+`).ReplaceAllString(clean, "-")
	clean = strings.Trim(clean, "-_.:")
	if len(clean) > 96 {
		clean = clean[:96]
	}
	return clean
}

func profileNameFromURL(rawURL string) string {
	parsed, err := url.Parse(strings.TrimSpace(rawURL))
	if err != nil {
		return ""
	}
	base := path.Base(parsed.Path)
	if base != "." && base != "/" {
		base = strings.TrimSuffix(base, path.Ext(base))
		if strings.TrimSpace(base) != "" {
			return base
		}
	}
	host := strings.TrimPrefix(parsed.Hostname(), "www.")
	if host == "" {
		return ""
	}
	return strings.Split(host, ".")[0]
}

func (s *serverState) profilePath(name string) string {
	return filepath.Join(s.cfg.ProfilesDir, cleanProfileName(name))
}

func (s *serverState) saveProfile(w http.ResponseWriter, r *http.Request) {
	payload, _ := readJSON(r)
	name := fmt.Sprint(payload["name"])
	cfg, ok := payload["config"].(map[string]any)
	if !ok {
		cfg, _ = s.readActiveConfig()
	}
	body, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		writeJSON(w, 400, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	path := s.profilePath(name)
	if err := os.WriteFile(path, body, 0o600); err != nil {
		writeJSON(w, 500, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true, "profile": strings.TrimSuffix(filepath.Base(path), ".json")})
}

func (s *serverState) activateProfile(w http.ResponseWriter, r *http.Request) {
	payload, _ := readJSON(r)
	body, err := os.ReadFile(s.profilePath(fmt.Sprint(payload["name"])))
	if err != nil {
		writeJSON(w, 500, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	err = os.WriteFile(s.cfg.ActiveConfig, body, 0o600)
	respond(w, map[string]any{"ok": true, "active": payload["name"]}, err)
}

func (s *serverState) importLink(w http.ResponseWriter, r *http.Request) {
	payload, _ := readJSON(r)
	outbound, err := parseShareLink(fmt.Sprint(payload["link"]))
	if err != nil {
		writeJSON(w, 400, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	if tag := outboundTagFallback(fmt.Sprint(payload["outboundTag"])); tag != "" {
		outbound["tag"] = tag
	}
	cfg, _ := s.readActiveConfig()
	outbounds := removeOutboundByTag(asArray(cfg["outbounds"]), fmt.Sprint(outbound["tag"]))
	cfg["outbounds"] = append([]any{outbound}, outbounds...)
	name := profileNameFallback(fmt.Sprint(payload["profileName"]), fmt.Sprint(outbound["tag"]), "server")
	body, _ := json.MarshalIndent(cfg, "", "  ")
	path := s.profilePath(name)
	if err := os.WriteFile(path, body, 0o600); err != nil {
		writeJSON(w, 500, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true, "outbound": outbound, "profile": strings.TrimSuffix(filepath.Base(path), ".json")})
}

func outboundSummary(outbound map[string]any) map[string]any {
	address, portValue := "", any("")
	if vnext := asArray(getNested(outbound, "settings", "vnext")); len(vnext) > 0 {
		if first, ok := vnext[0].(map[string]any); ok {
			address = fmt.Sprint(first["address"])
			portValue = first["port"]
		}
	}
	if servers := asArray(getNested(outbound, "settings", "servers")); len(servers) > 0 {
		if first, ok := servers[0].(map[string]any); ok {
			address = fmt.Sprint(first["address"])
			portValue = first["port"]
		}
	}
	return map[string]any{
		"tag": outbound["tag"], "protocol": outbound["protocol"], "address": address, "port": portValue,
		"network":  firstNonEmpty(fmt.Sprint(getNested(outbound, "streamSettings", "network")), "tcp"),
		"security": firstNonEmpty(fmt.Sprint(getNested(outbound, "streamSettings", "security")), "none"),
	}
}

func (s *serverState) subscriptionStorePath() string {
	return filepath.Join(s.cfg.DataDir, "subscriptions.json")
}

func (s *serverState) disabledRouteRulesPath() string {
	return filepath.Join(s.cfg.DataDir, "disabled-routes.json")
}

func (s *serverState) disabledRouteRules() []map[string]any {
	var rules []map[string]any
	body, err := os.ReadFile(s.disabledRouteRulesPath())
	if err != nil {
		return []map[string]any{}
	}
	if err := json.Unmarshal(body, &rules); err != nil {
		return []map[string]any{}
	}
	cleaned := make([]map[string]any, 0, len(rules))
	for _, item := range rules {
		if item == nil || item["rule"] == nil {
			continue
		}
		cleaned = append(cleaned, item)
		if len(cleaned) >= 200 {
			break
		}
	}
	return cleaned
}

func (s *serverState) saveDisabledRouteRules(payload map[string]any) map[string]any {
	raw, _ := payload["rules"].([]any)
	rules := make([]map[string]any, 0, len(raw))
	for _, value := range raw {
		item, ok := value.(map[string]any)
		if !ok || item["rule"] == nil {
			continue
		}
		rules = append(rules, item)
		if len(rules) >= 200 {
			break
		}
	}
	if err := os.MkdirAll(s.cfg.DataDir, 0o755); err != nil {
		return map[string]any{"ok": false, "error": err.Error()}
	}
	body, err := json.MarshalIndent(rules, "", "  ")
	if err != nil {
		return map[string]any{"ok": false, "error": err.Error()}
	}
	if err := os.WriteFile(s.disabledRouteRulesPath(), body, 0o600); err != nil {
		return map[string]any{"ok": false, "error": err.Error()}
	}
	return map[string]any{"ok": true, "rules": rules}
}

func (s *serverState) readSubscriptionStore() subscriptionStore {
	var store subscriptionStore
	body, err := os.ReadFile(s.subscriptionStorePath())
	if err == nil {
		_ = json.Unmarshal(body, &store)
	}
	if store.Pools == nil {
		store.Pools = []subscriptionPool{}
	}
	return store
}

func (s *serverState) writeSubscriptionStore(store subscriptionStore) error {
	if err := os.MkdirAll(s.cfg.DataDir, 0o755); err != nil {
		return err
	}
	body, err := json.MarshalIndent(store, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(s.subscriptionStorePath(), body, 0o600)
}

func cloneOutboundWithTag(outbound map[string]any, tag string) map[string]any {
	body, _ := json.Marshal(outbound)
	var cloned map[string]any
	_ = json.Unmarshal(body, &cloned)
	if cloned == nil {
		cloned = map[string]any{}
	}
	cloned["tag"] = tag
	return cloned
}

func replaceOutboundByTag(items []any, tag string, outbound map[string]any) []any {
	next := []any{}
	replaced := false
	for _, item := range items {
		object, ok := item.(map[string]any)
		if ok && fmt.Sprint(object["tag"]) == tag {
			if !replaced {
				next = append(next, outbound)
				replaced = true
			}
			continue
		}
		next = append(next, item)
	}
	if !replaced {
		next = append([]any{outbound}, next...)
	}
	return next
}

func subscriptionPoolPublic(pool subscriptionPool) map[string]any {
	candidates := []map[string]any{}
	for _, candidate := range pool.Candidates {
		candidates = append(candidates, outboundSummary(candidate))
	}
	active := map[string]any{}
	if pool.Active >= 0 && pool.Active < len(pool.Candidates) {
		active = outboundSummary(pool.Candidates[pool.Active])
	}
	return map[string]any{
		"tag": pool.Tag, "url": pool.URL, "active": pool.Active, "updatedAt": pool.UpdatedAt,
		"count": len(pool.Candidates), "activeCandidate": active, "candidates": candidates,
	}
}

func (s *serverState) subscriptionReport() map[string]any {
	store := s.readSubscriptionStore()
	pools := []map[string]any{}
	for _, pool := range store.Pools {
		pools = append(pools, subscriptionPoolPublic(pool))
	}
	return map[string]any{"ok": true, "pools": pools}
}

func (s *serverState) saveSubscriptionPool(w http.ResponseWriter, r *http.Request) {
	payload, _ := readJSON(r)
	tag := strings.TrimSpace(fmt.Sprint(payload["tag"]))
	if tag == "" || tag == "<nil>" {
		writeJSON(w, 400, map[string]any{"ok": false, "error": "Укажите стабильный outbound tag для подписки"})
		return
	}
	candidates := []map[string]any{}
	for _, item := range asArray(payload["outbounds"]) {
		if outbound, ok := item.(map[string]any); ok && fmt.Sprint(outbound["tag"]) != "" {
			candidates = append(candidates, outbound)
		}
	}
	if len(candidates) == 0 {
		writeJSON(w, 400, map[string]any{"ok": false, "error": "В подписке нет кандидатов для pool"})
		return
	}
	active := number(payload["active"], 0)
	if active < 0 || active >= len(candidates) {
		active = 0
	}
	pool := subscriptionPool{
		Tag:        tag,
		URL:        strings.TrimSpace(fmt.Sprint(payload["url"])),
		Active:     active,
		UpdatedAt:  time.Now().Format(time.RFC3339),
		Candidates: candidates,
	}
	store := s.readSubscriptionStore()
	replaced := false
	for index := range store.Pools {
		if store.Pools[index].Tag == tag {
			store.Pools[index] = pool
			replaced = true
			break
		}
	}
	if !replaced {
		store.Pools = append([]subscriptionPool{pool}, store.Pools...)
	}
	if err := s.writeSubscriptionStore(store); err != nil {
		writeJSON(w, 500, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true, "pool": subscriptionPoolPublic(pool)})
}

func (s *serverState) fallbackSubscription(w http.ResponseWriter, r *http.Request) {
	payload, _ := readJSON(r)
	tag := strings.TrimSpace(fmt.Sprint(payload["tag"]))
	store := s.readSubscriptionStore()
	poolIndex := -1
	for index, pool := range store.Pools {
		if pool.Tag == tag {
			poolIndex = index
			break
		}
	}
	if poolIndex < 0 {
		writeJSON(w, 404, map[string]any{"ok": false, "error": "Subscription pool не найден"})
		return
	}
	pool := store.Pools[poolIndex]
	if len(pool.Candidates) == 0 {
		writeJSON(w, 400, map[string]any{"ok": false, "error": "В pool нет кандидатов"})
		return
	}
	checkMode := strings.ToLower(firstNonEmpty(fmt.Sprint(payload["mode"]), "http"))
	probeURL := firstNonEmpty(fmt.Sprint(payload["url"]), "https://www.gstatic.com/generate_204")
	timeoutMs := number(payload["timeoutMs"], 2500)
	attempts := number(payload["attempts"], 1)
	if timeoutMs < 300 {
		timeoutMs = 300
	}
	if timeoutMs > 15000 {
		timeoutMs = 15000
	}
	if attempts < 1 {
		attempts = 1
	}
	if attempts > 5 {
		attempts = 5
	}

	results := []map[string]any{}
	selected := -1
	for step := 1; step <= len(pool.Candidates); step++ {
		index := (pool.Active + step) % len(pool.Candidates)
		candidate := pool.Candidates[index]
		summary := outboundSummary(candidate)
		result := map[string]any{"index": index, "tag": summary["tag"], "address": summary["address"], "port": summary["port"]}
		ok := false
		var err error
		if checkMode == "endpoint" {
			address := fmt.Sprint(summary["address"])
			portValue := number(summary["port"], 0)
			started := time.Now()
			conn, dialErr := net.DialTimeout("tcp", net.JoinHostPort(address, fmt.Sprint(portValue)), time.Duration(timeoutMs)*time.Millisecond)
			if dialErr == nil {
				_ = conn.Close()
				ok = true
				result["latencyMs"] = time.Since(started).Milliseconds()
			} else {
				err = dialErr
			}
		} else {
			latency, httpOK, httpErr := s.httpOutboundProbe(candidate, probeURL, timeoutMs, attempts)
			ok = httpOK
			err = httpErr
			if latency > 0 {
				result["latencyMs"] = latency
			}
		}
		result["ok"] = ok
		if err != nil {
			result["error"] = err.Error()
		}
		results = append(results, result)
		if ok {
			selected = index
			break
		}
	}
	if selected < 0 {
		writeJSON(w, 200, map[string]any{"ok": false, "pool": subscriptionPoolPublic(pool), "results": results, "error": "Живой кандидат не найден"})
		return
	}

	cfg, err := s.readActiveConfig()
	if err != nil {
		writeJSON(w, 500, map[string]any{"ok": false, "error": err.Error(), "results": results})
		return
	}
	cfg["outbounds"] = replaceOutboundByTag(asArray(cfg["outbounds"]), pool.Tag, cloneOutboundWithTag(pool.Candidates[selected], pool.Tag))
	backup, _ := s.backupActive("subscription-fallback")
	if err := s.writeActiveConfig(cfg); err != nil {
		writeJSON(w, 500, map[string]any{"ok": false, "error": err.Error(), "backup": backup, "results": results})
		return
	}
	pool.Active = selected
	pool.UpdatedAt = time.Now().Format(time.RFC3339)
	store.Pools[poolIndex] = pool
	_ = s.writeSubscriptionStore(store)
	restart := map[string]any{"ok": true, "stdout": "Xray не перезапущен"}
	if boolPayload(payload, "restart", true) {
		restart = s.serviceAction("restart")
	}
	writeJSON(w, 200, map[string]any{"ok": restart["ok"], "pool": subscriptionPoolPublic(pool), "selected": outboundSummary(pool.Candidates[selected]), "results": results, "backup": backup, "restart": restart})
}

func (s *serverState) checkOutbounds(w http.ResponseWriter, r *http.Request) {
	payload, _ := readJSON(r)
	cfg, err := s.readActiveConfig()
	if err != nil {
		respond(w, nil, err)
		return
	}
	checkMode := strings.ToLower(firstNonEmpty(fmt.Sprint(payload["mode"]), "http"))
	if checkMode != "endpoint" && checkMode != "http" {
		checkMode = "http"
	}
	probeURL := firstNonEmpty(fmt.Sprint(payload["url"]), "https://www.gstatic.com/generate_204")
	timeoutMs := number(payload["timeoutMs"], 2500)
	if timeoutMs < 300 {
		timeoutMs = 300
	}
	if timeoutMs > 15000 {
		timeoutMs = 15000
	}
	attempts := number(payload["attempts"], 1)
	if attempts < 1 {
		attempts = 1
	}
	if attempts > 5 {
		attempts = 5
	}
	filter := map[string]bool{}
	for _, tag := range asArray(payload["tags"]) {
		filter[fmt.Sprint(tag)] = true
	}

	results := []map[string]any{}
	for _, item := range asArray(cfg["outbounds"]) {
		outbound, ok := item.(map[string]any)
		if !ok {
			continue
		}
		summary := outboundSummary(outbound)
		tag := fmt.Sprint(summary["tag"])
		if len(filter) > 0 && !filter[tag] {
			continue
		}
		protocol := fmt.Sprint(summary["protocol"])
		address := fmt.Sprint(summary["address"])
		portValue := number(summary["port"], 0)
		system := protocol == "freedom" || protocol == "blackhole" || protocol == "dns" || tag == "direct" || tag == "block" || tag == "dns-out"
		if system && len(filter) == 0 {
			continue
		}
		result := map[string]any{
			"tag": summary["tag"], "protocol": protocol, "address": address, "port": portValue,
			"network": summary["network"], "security": summary["security"], "checkedAt": time.Now().Format(time.RFC3339), "method": checkMode,
		}
		if system || address == "" || portValue <= 0 {
			result["ok"] = false
			result["skipped"] = true
			result["error"] = "Нет endpoint для проверки"
			results = append(results, result)
			continue
		}
		samples := attempts
		if samples < 2 {
			samples = 2
		}
		best := int64(0)
		checkOK := false
		var lastErr error
		for attempt := 0; attempt < samples; attempt++ {
			started := time.Now()
			conn, err := net.DialTimeout("tcp", net.JoinHostPort(address, fmt.Sprint(portValue)), time.Duration(timeoutMs)*time.Millisecond)
			latency := time.Since(started).Milliseconds()
			if err == nil {
				_ = conn.Close()
				if best == 0 || latency < best {
					best = latency
				}
				checkOK = true
				lastErr = nil
				continue
			}
			lastErr = err
		}
		if best > 0 {
			result["endpointLatencyMs"] = best
		}
		result["endpointOk"] = checkOK
		if checkMode == "endpoint" {
			result["ok"] = checkOK
			if best > 0 {
				result["latencyMs"] = best
			}
			if !checkOK && lastErr != nil {
				result["error"] = lastErr.Error()
			}
			results = append(results, result)
			continue
		}
		httpBest, httpOK, httpErr := s.httpOutboundProbe(outbound, probeURL, timeoutMs, attempts)
		result["url"] = probeURL
		result["httpOk"] = httpOK
		result["ok"] = httpOK
		if httpBest > 0 {
			result["httpLatencyMs"] = httpBest
			result["latencyMs"] = httpBest
		}
		if !httpOK {
			if httpErr != nil {
				result["error"] = httpErr.Error()
			} else if lastErr != nil {
				result["error"] = lastErr.Error()
			} else {
				result["error"] = "HTTP probe failed"
			}
		}
		results = append(results, result)
	}
	writeJSON(w, 200, map[string]any{"ok": true, "timeoutMs": timeoutMs, "attempts": attempts, "mode": checkMode, "url": probeURL, "results": results})
}

func (s *serverState) httpOutboundProbe(outbound map[string]any, probeURL string, timeoutMs int, attempts int) (int64, bool, error) {
	port, err := freeLocalPort()
	if err != nil {
		return 0, false, err
	}
	config := map[string]any{
		"log": map[string]any{"loglevel": "warning"},
		"inbounds": []any{map[string]any{
			"tag": "ruopenray-probe", "listen": "127.0.0.1", "port": port, "protocol": "http", "settings": map[string]any{},
		}},
		"outbounds": []any{outbound},
	}
	dir := filepath.Join(s.cfg.DataDir, "checks")
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return 0, false, err
	}
	file, err := os.CreateTemp(dir, "outbound-*.json")
	if err != nil {
		return 0, false, err
	}
	path := file.Name()
	if err := json.NewEncoder(file).Encode(config); err != nil {
		_ = file.Close()
		_ = os.Remove(path)
		return 0, false, err
	}
	_ = file.Close()
	defer os.Remove(path)

	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(timeoutMs*(attempts+2))*time.Millisecond+5*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, "xray", "run", "-config", path)
	cmd.Env = s.xrayEnv()
	var stderr bytes.Buffer
	cmd.Stdout = &stderr
	cmd.Stderr = &stderr
	if err := cmd.Start(); err != nil {
		return 0, false, err
	}
	defer func() {
		if cmd.Process != nil {
			_ = cmd.Process.Kill()
		}
		_ = cmd.Wait()
	}()
	if err := waitTCPPort("127.0.0.1", port, 2500); err != nil {
		detail := strings.TrimSpace(stderr.String())
		if detail != "" {
			return 0, false, fmt.Errorf("%w: %s", err, lastLine(detail))
		}
		return 0, false, err
	}

	proxyURL, _ := url.Parse(fmt.Sprintf("http://127.0.0.1:%d", port))
	client := &http.Client{
		Timeout: time.Duration(timeoutMs) * time.Millisecond,
		Transport: &http.Transport{
			Proxy: http.ProxyURL(proxyURL),
			TLSClientConfig: &tls.Config{
				MinVersion: tls.VersionTLS12,
			},
		},
	}
	samples := attempts
	if samples < 1 {
		samples = 1
	}
	var best int64
	var lastErr error
	for attempt := 0; attempt < samples; attempt++ {
		started := time.Now()
		resp, err := client.Get(probeURL)
		latency := time.Since(started).Milliseconds()
		if err == nil {
			_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 1024))
			_ = resp.Body.Close()
			if resp.StatusCode < 500 {
				if best == 0 || latency < best {
					best = latency
				}
				lastErr = nil
				continue
			}
			lastErr = fmt.Errorf("HTTP %d", resp.StatusCode)
			continue
		}
		lastErr = err
	}
	if best > 0 {
		return best, true, nil
	}
	return 0, false, lastErr
}

func (s *serverState) tcpOutboundProbe(outbound map[string]any, host string, targetPort string, timeoutMs int, attempts int) (int64, bool, error) {
	port, err := freeLocalPort()
	if err != nil {
		return 0, false, err
	}
	config := map[string]any{
		"log": map[string]any{"loglevel": "warning"},
		"inbounds": []any{map[string]any{
			"tag": "ruopenray-probe", "listen": "127.0.0.1", "port": port, "protocol": "http", "settings": map[string]any{},
		}},
		"outbounds": []any{outbound},
	}
	dir := filepath.Join(s.cfg.DataDir, "checks")
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return 0, false, err
	}
	file, err := os.CreateTemp(dir, "outbound-tcp-*.json")
	if err != nil {
		return 0, false, err
	}
	path := file.Name()
	if err := json.NewEncoder(file).Encode(config); err != nil {
		_ = file.Close()
		_ = os.Remove(path)
		return 0, false, err
	}
	_ = file.Close()
	defer os.Remove(path)

	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(timeoutMs*(attempts+2))*time.Millisecond+5*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, "xray", "run", "-config", path)
	cmd.Env = s.xrayEnv()
	var stderr bytes.Buffer
	cmd.Stdout = &stderr
	cmd.Stderr = &stderr
	if err := cmd.Start(); err != nil {
		return 0, false, err
	}
	defer func() {
		if cmd.Process != nil {
			_ = cmd.Process.Kill()
		}
		_ = cmd.Wait()
	}()
	if err := waitTCPPort("127.0.0.1", port, 2500); err != nil {
		detail := strings.TrimSpace(stderr.String())
		if detail != "" {
			return 0, false, fmt.Errorf("%w: %s", err, lastLine(detail))
		}
		return 0, false, err
	}

	samples := attempts
	if samples < 1 {
		samples = 1
	}
	target := net.JoinHostPort(host, targetPort)
	var best int64
	var lastErr error
	for attempt := 0; attempt < samples; attempt++ {
		started := time.Now()
		conn, err := net.DialTimeout("tcp", net.JoinHostPort("127.0.0.1", fmt.Sprint(port)), time.Duration(timeoutMs)*time.Millisecond)
		if err != nil {
			lastErr = err
			continue
		}
		_ = conn.SetDeadline(time.Now().Add(time.Duration(timeoutMs) * time.Millisecond))
		_, _ = fmt.Fprintf(conn, "CONNECT %s HTTP/1.1\r\nHost: %s\r\n\r\n", target, target)
		reader := bufio.NewReader(conn)
		line, readErr := reader.ReadString('\n')
		connectOK := readErr == nil && strings.Contains(line, " 200 ")
		if connectOK {
			if targetPort == "443" {
				tlsConn := tls.Client(conn, &tls.Config{ServerName: host, InsecureSkipVerify: true, MinVersion: tls.VersionTLS12})
				readErr = tlsConn.Handshake()
			} else if targetPort == "80" {
				_, _ = fmt.Fprintf(conn, "HEAD / HTTP/1.1\r\nHost: %s\r\nConnection: close\r\n\r\n", host)
				line, readErr = reader.ReadString('\n')
				if readErr == nil && !strings.Contains(line, "HTTP/") {
					readErr = errors.New(strings.TrimSpace(line))
				}
			}
		}
		_ = conn.Close()
		latency := time.Since(started).Milliseconds()
		if readErr == nil && connectOK {
			if best == 0 || latency < best {
				best = latency
			}
			lastErr = nil
			continue
		}
		if readErr != nil {
			lastErr = readErr
		} else {
			lastErr = errors.New(strings.TrimSpace(line))
		}
	}
	if best > 0 {
		return best, true, nil
	}
	return 0, false, lastErr
}

func freeLocalPort() (int, error) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return 0, err
	}
	defer listener.Close()
	return listener.Addr().(*net.TCPAddr).Port, nil
}

func waitTCPPort(host string, port int, timeoutMs int) error {
	deadline := time.Now().Add(time.Duration(timeoutMs) * time.Millisecond)
	address := net.JoinHostPort(host, fmt.Sprint(port))
	var lastErr error
	for time.Now().Before(deadline) {
		conn, err := net.DialTimeout("tcp", address, 150*time.Millisecond)
		if err == nil {
			_ = conn.Close()
			return nil
		}
		lastErr = err
		time.Sleep(100 * time.Millisecond)
	}
	if lastErr != nil {
		return lastErr
	}
	return fmt.Errorf("probe HTTP inbound did not start")
}

func lastLine(value string) string {
	lines := strings.Split(strings.TrimSpace(value), "\n")
	if len(lines) == 0 {
		return value
	}
	return strings.TrimSpace(lines[len(lines)-1])
}

func (s *serverState) scanSNI(w http.ResponseWriter, r *http.Request) {
	payload, _ := readJSON(r)
	target := strings.TrimSpace(fmt.Sprint(payload["target"]))
	if target == "" || target == "<nil>" {
		writeJSON(w, 400, map[string]any{"ok": false, "error": "Укажите IP или домен для поиска"})
		return
	}
	targetIP, err := resolveIPv4(target)
	if err != nil {
		writeJSON(w, 400, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	cidr := number(payload["cidr"], 24)
	if cidr < 24 {
		cidr = 24
	}
	if cidr > 32 {
		cidr = 32
	}
	timeoutMs := number(payload["timeoutMs"], 1500)
	if timeoutMs < 500 {
		timeoutMs = 500
	}
	if timeoutMs > 8000 {
		timeoutMs = 8000
	}
	threads := number(payload["threads"], 64)
	if threads < 1 {
		threads = 1
	}
	if threads > 128 {
		threads = 128
	}
	limit := number(payload["limit"], 256)
	if limit < 1 {
		limit = 1
	}
	if limit > 1024 {
		limit = 1024
	}

	ips, network := cidrHosts(targetIP, cidr, limit)
	jobs := make(chan net.IP)
	results := make(chan map[string]any, len(ips))
	for worker := 0; worker < threads; worker++ {
		go func() {
			for ip := range jobs {
				results <- probeSNI(ip, targetIP, timeoutMs)
			}
		}()
	}
	for _, ip := range ips {
		jobs <- ip
	}
	close(jobs)

	found := []map[string]any{}
	for completed := 0; completed < len(ips); completed++ {
		if item := <-results; item != nil {
			found = append(found, item)
		}
	}
	sort.Slice(found, func(i, j int) bool {
		return number(found[i]["proximity"], 0) > number(found[j]["proximity"], 0)
	})
	writeJSON(w, 200, map[string]any{
		"ok": true, "target": target, "targetIp": targetIP.String(), "cidr": cidr, "network": network,
		"scanned": len(ips), "results": found,
	})
}

func resolveIPv4(value string) (net.IP, error) {
	if ip := net.ParseIP(value).To4(); ip != nil {
		return ip, nil
	}
	ips, err := net.LookupIP(value)
	if err != nil {
		return nil, err
	}
	for _, ip := range ips {
		if v4 := ip.To4(); v4 != nil {
			return v4, nil
		}
	}
	return nil, fmt.Errorf("IPv4 для %s не найден", value)
}

func cidrHosts(target net.IP, cidr int, limit int) ([]net.IP, string) {
	mask := net.CIDRMask(cidr, 32)
	networkIP := target.Mask(mask).To4()
	ones, bits := mask.Size()
	total := 1 << (bits - ones)
	if total > limit {
		total = limit
	}
	base := ipToUint32(networkIP)
	ips := make([]net.IP, 0, total)
	for offset := 0; offset < total; offset++ {
		ip := uint32ToIP(base + uint32(offset))
		if cidr < 31 && (offset == 0 || offset == (1<<(bits-ones))-1) {
			continue
		}
		if ip.Equal(target) {
			continue
		}
		ips = append(ips, ip)
	}
	return ips, fmt.Sprintf("%s/%d", networkIP.String(), cidr)
}

func probeSNI(ip net.IP, target net.IP, timeoutMs int) map[string]any {
	started := time.Now()
	dialer := &net.Dialer{Timeout: time.Duration(timeoutMs) * time.Millisecond}
	conn, err := tls.DialWithDialer(dialer, "tcp", net.JoinHostPort(ip.String(), "443"), &tls.Config{
		InsecureSkipVerify: true,
		NextProtos:         []string{"h2", "http/1.1"},
	})
	latency := time.Since(started).Milliseconds()
	if err != nil {
		return nil
	}
	defer conn.Close()
	state := conn.ConnectionState()
	if len(state.PeerCertificates) == 0 {
		return nil
	}
	cert := state.PeerCertificates[0]
	domain := cert.Subject.CommonName
	if domain == "" && len(cert.DNSNames) > 0 {
		domain = cert.DNSNames[0]
	}
	if domain == "" {
		domain = ip.String()
	}
	return map[string]any{
		"ip": ip.String(), "domain": domain, "issuer": cert.Issuer.CommonName,
		"dnsNames": cert.DNSNames, "latencyMs": latency, "proximity": proximity(ip, target),
	}
}

func ipToUint32(ip net.IP) uint32 {
	v := ip.To4()
	return uint32(v[0])<<24 | uint32(v[1])<<16 | uint32(v[2])<<8 | uint32(v[3])
}

func uint32ToIP(value uint32) net.IP {
	return net.IPv4(byte(value>>24), byte(value>>16), byte(value>>8), byte(value))
}

func proximity(ip net.IP, target net.IP) int {
	diff := int64(ipToUint32(ip)) - int64(ipToUint32(target))
	if diff < 0 {
		diff = -diff
	}
	score := 100 - int(diff*100/256)
	if score < 0 {
		return 0
	}
	return score
}

func decodeSubscription(body string) []string {
	text := strings.TrimSpace(body)
	candidates := []string{text}
	if !strings.Contains(text, "://") {
		if decoded, err := base64.StdEncoding.DecodeString(text); err == nil {
			candidates = append([]string{string(decoded)}, candidates...)
		}
	}
	for _, candidate := range candidates {
		var links []string
		for _, item := range strings.Fields(candidate) {
			if regexp.MustCompile(`(?i)^(vless|vmess|trojan|ss)://`).MatchString(item) {
				links = append(links, item)
			}
		}
		if len(links) > 0 {
			return links
		}
	}
	return nil
}

func subscriptionLinks(rawURL string) ([]string, error) {
	client := &http.Client{Timeout: 12 * time.Second}
	resp, err := client.Get(rawURL)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("subscription HTTP %d", resp.StatusCode)
	}
	body, _ := io.ReadAll(resp.Body)
	return decodeSubscription(string(body)), nil
}

func (s *serverState) importPreview(w http.ResponseWriter, r *http.Request) {
	payload, _ := readJSON(r)
	if rawURL := strings.TrimSpace(fmt.Sprint(payload["url"])); rawURL != "" && rawURL != "<nil>" {
		links, err := subscriptionLinks(rawURL)
		if err != nil {
			writeJSON(w, 500, map[string]any{"ok": false, "error": err.Error()})
			return
		}
		var items []map[string]any
		var outbounds []map[string]any
		for _, link := range links {
			outbound, err := parseShareLink(link)
			if err == nil {
				items = append(items, outboundSummary(outbound))
				outbounds = append(outbounds, outbound)
			}
			if len(items) >= 50 {
				break
			}
		}
		writeJSON(w, 200, map[string]any{"ok": true, "source": "subscription", "links": len(links), "items": items, "outbounds": outbounds})
		return
	}
	outbound, err := parseShareLink(fmt.Sprint(payload["link"]))
	if err != nil {
		writeJSON(w, 400, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	if tag := outboundTagFallback(fmt.Sprint(payload["outboundTag"])); tag != "" {
		outbound["tag"] = tag
	}
	writeJSON(w, 200, map[string]any{"ok": true, "source": "link", "links": 1, "items": []any{outboundSummary(outbound)}, "outbound": outbound})
}

func (s *serverState) importSubscription(w http.ResponseWriter, r *http.Request) {
	payload, _ := readJSON(r)
	links, err := subscriptionLinks(fmt.Sprint(payload["url"]))
	if err != nil {
		writeJSON(w, 500, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	cfg, _ := s.readActiveConfig()
	outbounds := asArray(cfg["outbounds"])
	var imported []map[string]any
	for _, link := range links {
		outbound, err := parseShareLink(link)
		if err != nil {
			continue
		}
		outbounds = removeOutboundByTag(outbounds, fmt.Sprint(outbound["tag"]))
		outbounds = append([]any{outbound}, outbounds...)
		imported = append(imported, outboundSummary(outbound))
	}
	if len(imported) == 0 {
		writeJSON(w, 400, map[string]any{"ok": false, "error": "В подписке не найдены поддерживаемые ссылки"})
		return
	}
	cfg["outbounds"] = outbounds
	name := profileNameFallback(fmt.Sprint(payload["profileName"]), fmt.Sprint(imported[0]["tag"]), profileNameFromURL(fmt.Sprint(payload["url"])), "subscription")
	body, _ := json.MarshalIndent(cfg, "", "  ")
	path := s.profilePath(name)
	if err := os.WriteFile(path, body, 0o600); err != nil {
		writeJSON(w, 500, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true, "profile": strings.TrimSuffix(filepath.Base(path), ".json"), "imported": imported})
}

func dhcpLeases(dataDir string) []map[string]any {
	report := dhcpLeaseReport(dataDir)
	if leases, ok := report["leases"].([]map[string]any); ok {
		return leases
	}
	return []map[string]any{}
}

func dhcpLeaseReport(dataDir string) map[string]any {
	for _, path := range []string{"/tmp/dhcp.leases", "/var/dhcp.leases", filepath.Join(dataDir, "dhcp.leases")} {
		body, err := os.ReadFile(path)
		if err != nil {
			continue
		}
		var leases []map[string]any
		for _, line := range strings.Split(string(body), "\n") {
			parts := strings.Fields(line)
			if len(parts) >= 4 {
				name := parts[3]
				if name == "*" {
					name = ""
				}
				expires := parseInt64(parts[0])
				remaining := expires - time.Now().Unix()
				if expires <= 0 || remaining < 0 {
					remaining = 0
				}
				leases = append(leases, map[string]any{
					"expires":   parts[0],
					"remaining": remaining,
					"mac":       parts[1],
					"ip":        parts[2],
					"name":      name,
					"source":    path,
				})
			}
		}
		return map[string]any{"ok": true, "source": path, "leases": leases}
	}
	return map[string]any{"ok": true, "source": "", "leases": []map[string]any{}}
}

func (s *serverState) checkDNS(w http.ResponseWriter, r *http.Request) {
	payload, _ := readJSON(r)
	server := strings.TrimSpace(fmt.Sprint(payload["server"]))
	host := cleanDNSCheckHost(firstNonEmpty(fmt.Sprint(payload["host"]), "example.com"))
	warnings := []string{}
	if !strings.HasPrefix(server, "https://") {
		warnings = append(warnings, "DNS не DoH: возможна видимость DNS-запросов у провайдера")
	}
	a, aaaa, err := resolveViaDNSServer(server, host)
	if err != nil {
		writeJSON(w, 200, map[string]any{"ok": false, "server": server, "host": host, "addresses": []string{}, "a": []string{}, "aaaa": []string{}, "warnings": warnings, "error": err.Error()})
		return
	}
	addresses := append([]string{}, a...)
	addresses = append(addresses, aaaa...)
	writeJSON(w, 200, map[string]any{"ok": true, "server": server, "host": host, "addresses": addresses, "a": a, "aaaa": aaaa, "warnings": warnings})
}

func cleanDNSCheckHost(value string) string {
	clean := strings.TrimSpace(value)
	if clean == "" || clean == "<nil>" {
		return "example.com"
	}
	if strings.Contains(clean, "://") {
		if parsed, err := url.Parse(clean); err == nil && parsed.Hostname() != "" {
			clean = parsed.Hostname()
		}
	}
	clean = strings.Trim(clean, " .\t\r\n")
	if clean == "" {
		return "example.com"
	}
	return clean
}

func resolveViaDNSServer(server string, host string) ([]string, []string, error) {
	server = strings.TrimSpace(server)
	if server == "" || server == "<nil>" {
		server = "system"
	}
	if strings.HasPrefix(strings.ToLower(server), "https://") {
		a, errA := dohLookup(server, host, 1)
		aaaa, errAAAA := dohLookup(server, host, 28)
		if errA != nil && errAAAA != nil {
			return nil, nil, errA
		}
		return a, aaaa, nil
	}
	resolver, err := dnsResolverForServer(server)
	if err != nil {
		return nil, nil, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	var a []string
	var aaaa []string
	if ips, err := resolver.LookupIP(ctx, "ip4", host); err == nil {
		for _, ip := range ips {
			a = append(a, ip.String())
		}
	}
	if ips, err := resolver.LookupIP(ctx, "ip6", host); err == nil {
		for _, ip := range ips {
			aaaa = append(aaaa, ip.String())
		}
	}
	if len(a) == 0 && len(aaaa) == 0 {
		return a, aaaa, errors.New("DNS-сервер ответил, но A/AAAA-записей не найдено")
	}
	return a, aaaa, nil
}

func dnsResolverForServer(server string) (*net.Resolver, error) {
	server = strings.TrimSpace(server)
	if server == "" || server == "system" {
		return net.DefaultResolver, nil
	}
	network := "udp"
	target := server
	if strings.HasPrefix(strings.ToLower(server), "tcp://") {
		network = "tcp"
		target = strings.TrimPrefix(server, "tcp://")
	} else if strings.HasPrefix(strings.ToLower(server), "udp://") {
		target = strings.TrimPrefix(server, "udp://")
	}
	if strings.Contains(target, "://") {
		return nil, fmt.Errorf("тип DNS-сервера пока не поддержан: %s", server)
	}
	if _, _, err := net.SplitHostPort(target); err != nil {
		target = net.JoinHostPort(target, "53")
	}
	dialer := &net.Dialer{Timeout: 4 * time.Second}
	return &net.Resolver{
		PreferGo: true,
		Dial: func(ctx context.Context, _, _ string) (net.Conn, error) {
			return dialer.DialContext(ctx, network, target)
		},
	}, nil
}

func dohLookup(endpoint string, host string, qtype uint16) ([]string, error) {
	query, err := dnsWireQuery(host, qtype)
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 7*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(query))
	if err != nil {
		return nil, err
	}
	req.Header.Set("accept", "application/dns-message")
	req.Header.Set("content-type", "application/dns-message")
	req.Header.Set("user-agent", "RuOpenRay UI")
	resp, err := (&http.Client{Timeout: 8 * time.Second}).Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("DoH HTTP %d", resp.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 64*1024))
	if err != nil {
		return nil, err
	}
	return parseDNSWireAnswers(body, qtype)
}

func dnsWireQuery(host string, qtype uint16) ([]byte, error) {
	var id [2]byte
	_, _ = rand.Read(id[:])
	buf := bytes.NewBuffer(nil)
	buf.Write(id[:])
	buf.Write([]byte{0x01, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00})
	for _, label := range strings.Split(strings.Trim(host, "."), ".") {
		if label == "" || len(label) > 63 {
			return nil, fmt.Errorf("некорректный домен для DNS-проверки: %s", host)
		}
		buf.WriteByte(byte(len(label)))
		buf.WriteString(label)
	}
	buf.WriteByte(0)
	var tail [4]byte
	binary.BigEndian.PutUint16(tail[0:2], qtype)
	binary.BigEndian.PutUint16(tail[2:4], 1)
	buf.Write(tail[:])
	return buf.Bytes(), nil
}

func parseDNSWireAnswers(message []byte, qtype uint16) ([]string, error) {
	if len(message) < 12 {
		return nil, errors.New("короткий DNS-ответ")
	}
	rcode := message[3] & 0x0f
	if rcode != 0 && rcode != 3 {
		return nil, fmt.Errorf("DNS rcode %d", rcode)
	}
	qd := int(binary.BigEndian.Uint16(message[4:6]))
	an := int(binary.BigEndian.Uint16(message[6:8]))
	offset := 12
	for i := 0; i < qd; i++ {
		next, err := skipDNSName(message, offset)
		if err != nil {
			return nil, err
		}
		offset = next + 4
		if offset > len(message) {
			return nil, errors.New("поврежденный DNS-вопрос")
		}
	}
	var out []string
	for i := 0; i < an; i++ {
		next, err := skipDNSName(message, offset)
		if err != nil {
			return nil, err
		}
		offset = next
		if offset+10 > len(message) {
			return nil, errors.New("поврежденная DNS-запись")
		}
		typ := binary.BigEndian.Uint16(message[offset : offset+2])
		class := binary.BigEndian.Uint16(message[offset+2 : offset+4])
		rdlen := int(binary.BigEndian.Uint16(message[offset+8 : offset+10]))
		offset += 10
		if offset+rdlen > len(message) {
			return nil, errors.New("поврежденные DNS-данные")
		}
		rdata := message[offset : offset+rdlen]
		if class == 1 && typ == qtype {
			if typ == 1 && rdlen == net.IPv4len {
				out = append(out, net.IP(rdata).String())
			}
			if typ == 28 && rdlen == net.IPv6len {
				out = append(out, net.IP(rdata).String())
			}
		}
		offset += rdlen
	}
	return out, nil
}

func skipDNSName(message []byte, offset int) (int, error) {
	for {
		if offset >= len(message) {
			return offset, errors.New("поврежденное DNS-имя")
		}
		length := int(message[offset])
		if length == 0 {
			return offset + 1, nil
		}
		if length&0xc0 == 0xc0 {
			if offset+1 >= len(message) {
				return offset, errors.New("поврежденный DNS-pointer")
			}
			return offset + 2, nil
		}
		if length&0xc0 != 0 {
			return offset, errors.New("неподдерживаемое DNS-имя")
		}
		offset += 1 + length
	}
}

func asArray(value any) []any {
	items, _ := value.([]any)
	return items
}

func removeOutboundByTag(items []any, tag string) []any {
	var result []any
	for _, item := range items {
		object, ok := item.(map[string]any)
		if !ok || fmt.Sprint(object["tag"]) != tag {
			result = append(result, item)
		}
	}
	return result
}

func parseShareLink(raw string) (map[string]any, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil, errors.New("Пустая ссылка для импорта")
	}
	u, err := url.Parse(raw)
	if err != nil {
		return nil, err
	}
	switch u.Scheme {
	case "vless":
		return parseVless(u), nil
	case "trojan":
		return parseTrojan(u), nil
	case "ss":
		return parseSS(u), nil
	case "vmess":
		return parseVMess(u)
	default:
		return nil, fmt.Errorf("Неподдерживаемый протокол ссылки: %s", u.Scheme)
	}
}

func tagFromURL(u *url.URL, fallback string) string {
	if u.Fragment != "" {
		if value, err := url.QueryUnescape(u.Fragment); err == nil && value != "" {
			return value
		}
	}
	return fallback
}

func parseVless(u *url.URL) map[string]any {
	q := u.Query()
	network := firstNonEmpty(q.Get("type"), "tcp")
	security := firstNonEmpty(q.Get("security"), "none")
	user := map[string]any{"id": u.User.Username(), "encryption": firstNonEmpty(q.Get("encryption"), "none")}
	if flow := q.Get("flow"); flow != "" {
		user["flow"] = flow
	}
	stream := map[string]any{"network": network, "security": security}
	if security == "tls" {
		stream["tlsSettings"] = map[string]any{"serverName": firstNonEmpty(q.Get("sni"), u.Hostname())}
	}
	if security == "reality" {
		stream["realitySettings"] = map[string]any{"serverName": q.Get("sni"), "publicKey": q.Get("pbk"), "shortId": q.Get("sid")}
	}
	if network == "ws" {
		stream["wsSettings"] = map[string]any{"path": firstNonEmpty(q.Get("path"), "/")}
	}
	return map[string]any{
		"tag": tagFromURL(u, "vless-out"), "protocol": "vless",
		"settings":       map[string]any{"vnext": []any{map[string]any{"address": u.Hostname(), "port": port(u, 443), "users": []any{user}}}},
		"streamSettings": stream,
	}
}

func parseTrojan(u *url.URL) map[string]any {
	q := u.Query()
	return map[string]any{
		"tag": tagFromURL(u, "trojan-out"), "protocol": "trojan",
		"settings":       map[string]any{"servers": []any{map[string]any{"address": u.Hostname(), "port": port(u, 443), "password": u.User.Username()}}},
		"streamSettings": map[string]any{"network": firstNonEmpty(q.Get("type"), "tcp"), "security": firstNonEmpty(q.Get("security"), "tls")},
	}
}

func parseSS(u *url.URL) map[string]any {
	q := u.Query()
	return map[string]any{
		"tag": tagFromURL(u, "ss-out"), "protocol": "shadowsocks",
		"settings": map[string]any{"servers": []any{map[string]any{
			"address": u.Hostname(), "port": port(u, 443), "method": firstNonEmpty(q.Get("method"), "2022-blake3-aes-128-gcm"), "password": u.User.Username(),
		}}},
	}
}

func parseVMess(u *url.URL) (map[string]any, error) {
	body := strings.TrimLeft(u.Opaque+u.Host+u.Path, "/")
	decoded, err := base64.RawStdEncoding.DecodeString(body)
	if err != nil {
		decoded, err = base64.StdEncoding.DecodeString(body)
	}
	if err != nil {
		return nil, err
	}
	var raw map[string]any
	if err := json.Unmarshal(decoded, &raw); err != nil {
		return nil, err
	}
	return map[string]any{
		"tag": firstNonEmpty(fmt.Sprint(raw["ps"]), "vmess-out"), "protocol": "vmess",
		"settings": map[string]any{"vnext": []any{map[string]any{
			"address": raw["add"], "port": number(raw["port"], 443),
			"users": []any{map[string]any{"id": raw["id"], "alterId": number(raw["aid"], 0), "security": firstNonEmpty(fmt.Sprint(raw["scy"]), "auto")}},
		}}},
		"streamSettings": map[string]any{"network": firstNonEmpty(fmt.Sprint(raw["net"]), "tcp"), "security": firstNonEmpty(fmt.Sprint(raw["tls"]), "none")},
	}, nil
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if value != "" && value != "<nil>" {
			return value
		}
	}
	return ""
}

func port(u *url.URL, fallback int) int {
	if u.Port() == "" {
		return fallback
	}
	return number(u.Port(), fallback)
}

func number(value any, fallback int) int {
	var out int
	if _, err := fmt.Sscanf(fmt.Sprint(value), "%d", &out); err != nil {
		return fallback
	}
	return out
}

func numberAny(value any) int64 {
	var out int64
	if _, err := fmt.Sscanf(fmt.Sprint(value), "%d", &out); err != nil {
		return 0
	}
	return out
}

func mapValue(value any) map[string]any {
	if m, ok := value.(map[string]any); ok {
		return m
	}
	return map[string]any{}
}

func byteCount(size int64) string {
	if size >= 1024*1024*1024 {
		return fmt.Sprintf("%.1f GB", float64(size)/1024/1024/1024)
	}
	if size >= 1024*1024 {
		return fmt.Sprintf("%.1f MB", float64(size)/1024/1024)
	}
	if size >= 1024 {
		return fmt.Sprintf("%d KB", size/1024)
	}
	return fmt.Sprintf("%d B", size)
}

func parseInt64(value string) int64 {
	var out int64
	_, _ = fmt.Sscanf(value, "%d", &out)
	return out
}

func (s *serverState) readLogs(query url.Values) string {
	key := query.Encode()
	now := time.Now()
	s.metricsMu.Lock()
	if key == s.logCacheKey && now.Sub(s.logCacheAt) < 5*time.Second {
		text := s.logCacheText
		s.metricsMu.Unlock()
		return text
	}
	s.metricsMu.Unlock()

	text := s.readLogsUncached(query)
	s.metricsMu.Lock()
	s.logCacheKey = key
	s.logCacheText = text
	s.logCacheAt = time.Now()
	s.metricsMu.Unlock()
	return text
}

func (s *serverState) readLogsUncached(query url.Values) string {
	kind := firstNonEmpty(query.Get("kind"), "error")
	search := strings.ToLower(strings.TrimSpace(query.Get("q")))
	level := strings.ToLower(strings.TrimSpace(query.Get("level")))
	sortOrder := strings.ToLower(strings.TrimSpace(firstNonEmpty(query.Get("sort"), "asc")))
	limit := number(firstNonEmpty(query.Get("lines"), "240"), 240)
	if limit < 20 {
		limit = 20
	}
	if limit > 2000 {
		limit = 2000
	}
	maxLines := limit * 4
	if maxLines < 320 {
		maxLines = 320
	}
	if search != "" {
		maxLines = limit * 8
	}
	if maxLines > 3000 {
		maxLines = 3000
	}
	paths := []string{}
	var blocks []string
	if runtime.GOOS != "windows" && (kind == "system" || kind == "all") {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		output, err := exec.CommandContext(ctx, "logread", "-e", "xray").Output()
		cancel()
		if err == nil && len(output) > 0 {
			if kind == "system" {
				return filterLogLines(string(output), search, level, sortOrder, limit)
			}
			blocks = append(blocks, lastLines(string(output), maxLines))
		}
	}
	if kind == "access" || kind == "all" {
		settings := s.loggingSettings()
		paths = append(paths, cleanLogPath(fmt.Sprint(settings["accessPath"]), defaultAccessLogPath), defaultAccessLogPath, filepath.Join(s.cfg.DataDir, "access.log"))
	}
	if kind == "error" || kind == "all" || kind == "system" {
		settings := s.loggingSettings()
		paths = append(paths, cleanLogPath(fmt.Sprint(settings["errorPath"]), defaultErrorLogPath), defaultErrorLogPath, filepath.Join(s.cfg.DataDir, "error.log"))
	}
	seen := map[string]bool{}
	for _, path := range paths {
		if seen[path] {
			continue
		}
		seen[path] = true
		body, err := readLogTailLines(path, maxLines)
		if err == nil {
			blocks = append(blocks, body)
		}
	}
	if len(blocks) == 0 {
		return "Лог " + kind + " пока не найден."
	}
	return filterLogLines(strings.Join(blocks, "\n"), search, level, sortOrder, limit)
}

func readLogTailLines(path string, maxLines int) (string, error) {
	file, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer file.Close()
	info, err := file.Stat()
	if err != nil {
		return "", err
	}
	size := info.Size()
	if size <= 0 {
		return "", nil
	}
	if maxLines <= 0 {
		maxLines = 320
	}
	const chunkSize int64 = 32 * 1024
	chunks := [][]byte{}
	newlines := 0
	for offset := size; offset > 0 && newlines <= maxLines; {
		readSize := chunkSize
		if offset < readSize {
			readSize = offset
		}
		offset -= readSize
		buf := make([]byte, readSize)
		n, err := file.ReadAt(buf, offset)
		if err != nil && !errors.Is(err, io.EOF) {
			return "", err
		}
		buf = buf[:n]
		for _, b := range buf {
			if b == '\n' {
				newlines++
			}
		}
		chunks = append(chunks, buf)
	}
	var builder strings.Builder
	for i := len(chunks) - 1; i >= 0; i-- {
		builder.Write(chunks[i])
	}
	return lastLines(builder.String(), maxLines), nil
}

func lastLines(text string, maxLines int) string {
	if maxLines <= 0 {
		return text
	}
	lines := strings.Split(text, "\n")
	if len(lines) <= maxLines {
		return text
	}
	return strings.Join(lines[len(lines)-maxLines:], "\n")
}

type logLine struct {
	text  string
	when  int64
	index int
}

func filterLogLines(content, search, level, sortOrder string, limit int) string {
	lines := strings.Split(content, "\n")
	var filtered []logLine
	for index, line := range lines {
		if strings.TrimSpace(line) == "" {
			continue
		}
		lower := strings.ToLower(line)
		if search != "" && !strings.Contains(lower, search) {
			continue
		}
		if level != "" && level != "all" && !strings.Contains(lower, level) {
			continue
		}
		filtered = append(filtered, logLine{text: line, when: parseLogLineTime(line), index: index})
	}
	sort.SliceStable(filtered, func(i, j int) bool {
		left := filtered[i]
		right := filtered[j]
		if left.when == right.when {
			return left.index > right.index
		}
		if left.when == 0 {
			return false
		}
		if right.when == 0 {
			return true
		}
		return left.when > right.when
	})
	if len(filtered) > limit {
		filtered = filtered[:limit]
	}
	if sortOrder != "desc" {
		sort.SliceStable(filtered, func(i, j int) bool {
			left := filtered[i]
			right := filtered[j]
			if left.when == right.when {
				return left.index < right.index
			}
			if left.when == 0 {
				return true
			}
			if right.when == 0 {
				return false
			}
			return left.when < right.when
		})
	}
	if len(filtered) == 0 {
		return "По выбранным фильтрам строки не найдены."
	}
	out := make([]string, len(filtered))
	for index, item := range filtered {
		out[index] = item.text
	}
	return strings.Join(out, "\n")
}

type domainMonitorEvent struct {
	Time            string `json:"time"`
	Timestamp       int64  `json:"timestamp"`
	Protocol        string `json:"protocol"`
	SourceIP        string `json:"sourceIp"`
	SourcePort      string `json:"sourcePort"`
	SourceDevice    string `json:"sourceDevice,omitempty"`
	DestinationIP   string `json:"destinationIp"`
	DestinationPort string `json:"destinationPort"`
	Host            string `json:"host"`
	Outbound        string `json:"outbound,omitempty"`
	Source          string `json:"source"`
	Raw             string `json:"raw"`
}

type domainMonitorDevice struct {
	IP   string `json:"ip"`
	Name string `json:"name"`
	Hits int    `json:"hits"`
}

type domainMonitorAggregate struct {
	Host       string                `json:"host"`
	Hits       int                   `json:"hits"`
	TCP        int                   `json:"tcp"`
	UDP        int                   `json:"udp"`
	FirstSeen  string                `json:"firstSeen"`
	LastSeen   string                `json:"lastSeen"`
	LastSeenTs int64                 `json:"lastSeenTs"`
	Protocols  []string              `json:"protocols"`
	Outbounds  []string              `json:"outbounds"`
	Devices    []domainMonitorDevice `json:"devices"`
	Samples    []domainMonitorEvent  `json:"samples"`
	deviceHits map[string]*domainMonitorDevice
	protocols  map[string]bool
	outbounds  map[string]bool
	firstTs    int64
}

func (s *serverState) domainMonitor(w http.ResponseWriter, r *http.Request) {
	limit := number(firstNonEmpty(r.URL.Query().Get("limit"), "1000"), 1000)
	if limit < 100 {
		limit = 100
	}
	if limit > 4000 {
		limit = 4000
	}
	leases := dhcpLeases(s.cfg.DataDir)
	devices := map[string]string{}
	for _, lease := range leases {
		ip := strings.TrimSpace(fmt.Sprint(lease["ip"]))
		name := strings.TrimSpace(fmt.Sprint(lease["name"]))
		if ip != "" && name != "" && name != "<nil>" {
			devices[ip] = name
		}
	}
	status := s.domainMonitorRuntime()
	var events []domainMonitorEvent
	source := "stopped"
	sourcePath := ""
	if status.Running {
		events, source, sourcePath = s.domainMonitorEvents(devices, limit)
	}
	if events == nil {
		events = []domainMonitorEvent{}
	}
	sort.SliceStable(events, func(i, j int) bool {
		if events[i].Timestamp == events[j].Timestamp {
			return i < j
		}
		return events[i].Timestamp > events[j].Timestamp
	})
	aggregates := aggregateDomainEvents(events)
	stats := domainMonitorStats(events, aggregates)
	writeJSON(w, 200, map[string]any{
		"ok":         true,
		"source":     source,
		"sourcePath": sourcePath,
		"running":    status.Running,
		"enabled":    status.Enabled,
		"external":   status.External,
		"service":    status.Service,
		"available":  status.Available,
		"hint":       status.Hint,
		"updatedAt":  time.Now().Format(time.RFC3339),
		"events":     events,
		"domains":    aggregates,
		"devices":    aggregateMonitorDevices(events),
		"stats":      stats,
	})
}

func (s *serverState) domainMonitorEvents(devices map[string]string, limit int) ([]domainMonitorEvent, string, string) {
	for _, path := range b4sniLogPaths(s.cfg.DataDir) {
		body, err := os.ReadFile(path)
		if err != nil || len(bytes.TrimSpace(body)) == 0 {
			continue
		}
		events := parseB4SNILines(string(body), devices)
		if len(events) > 0 {
			return trimMonitorEvents(events, limit), "b4sni", path
		}
	}
	content, path := s.monitorLogContent()
	events := parseXrayDomainLines(content, devices)
	return trimMonitorEvents(events, limit), "xray-access", path
}

func b4sniLogPaths(dataDir string) []string {
	return []string{
		filepath.Join(dataDir, "b4sni.log"),
		"/var/log/ruopenray/b4sni.log",
		"/usr/share/xrayui/logs/b4sni.log",
		"/opt/share/xrayui/logs/b4sni.log",
	}
}

type domainMonitorRuntime struct {
	Running   bool   `json:"running"`
	Enabled   bool   `json:"enabled"`
	External  bool   `json:"external"`
	Available bool   `json:"available"`
	Service   string `json:"service"`
	Hint      string `json:"hint"`
}

func (s *serverState) domainMonitorStatePath() string {
	return filepath.Join(s.cfg.DataDir, "domain-monitor.enabled")
}

func (s *serverState) domainMonitorEnabled() bool {
	body, err := os.ReadFile(s.domainMonitorStatePath())
	if err != nil {
		return true
	}
	return strings.TrimSpace(string(body)) != "0"
}

func (s *serverState) setDomainMonitorEnabled(enabled bool) error {
	if err := os.MkdirAll(s.cfg.DataDir, 0o755); err != nil {
		return err
	}
	value := "0"
	if enabled {
		value = "1"
	}
	return os.WriteFile(s.domainMonitorStatePath(), []byte(value+"\n"), 0o600)
}

func b4sniServiceScript() string {
	for _, path := range []string{"/etc/init.d/b4sni", "/opt/etc/init.d/S99b4sni", "/opt/etc/init.d/S90b4sni"} {
		if info, err := os.Stat(path); err == nil && !info.IsDir() {
			return path
		}
	}
	return ""
}

func (s *serverState) domainMonitorRuntime() domainMonitorRuntime {
	enabled := s.domainMonitorEnabled()
	external := b4sniRunning()
	service := b4sniServiceScript()
	available := service != "" || commandExists("b4sni")
	hint := "Режим наблюдения: RuOpenRay читает b4sni-совместимые файлы и access/logread Xray."
	if available {
		hint = "Найдена b4sni-служба; start/stop будет управлять ей и чтением логов RuOpenRay."
	}
	return domainMonitorRuntime{
		Running: enabled || external, Enabled: enabled, External: external, Available: available, Service: service, Hint: hint,
	}
}

func (s *serverState) controlDomainMonitor(action string) map[string]any {
	action = strings.ToLower(strings.TrimSpace(action))
	result := map[string]any{"ok": true, "stdout": ""}
	switch action {
	case "start":
		if err := s.setDomainMonitorEnabled(true); err != nil {
			return map[string]any{"ok": false, "stderr": err.Error(), "status": s.domainMonitorRuntime()}
		}
		if service := b4sniServiceScript(); service != "" {
			result["service"] = run(service, "start")
		}
		result["stdout"] = "SNI-монитор включен"
	case "stop":
		if err := s.setDomainMonitorEnabled(false); err != nil {
			return map[string]any{"ok": false, "stderr": err.Error(), "status": s.domainMonitorRuntime()}
		}
		if service := b4sniServiceScript(); service != "" {
			result["service"] = run(service, "stop")
		}
		result["stdout"] = "SNI-монитор остановлен"
	case "clear":
		return s.clearDomainMonitorLogs()
	default:
		return map[string]any{"ok": false, "stderr": "Неизвестное действие монитора", "status": s.domainMonitorRuntime()}
	}
	result["status"] = s.domainMonitorRuntime()
	return result
}

func (s *serverState) clearDomainMonitorLogs() map[string]any {
	deleted := 0
	var freed int64
	for _, path := range b4sniLogPaths(s.cfg.DataDir) {
		info, err := os.Stat(path)
		if err != nil || info.IsDir() {
			continue
		}
		if err := os.Remove(path); err != nil {
			continue
		}
		deleted++
		freed += info.Size()
	}
	return map[string]any{
		"ok": true, "deleted": deleted, "freed": freed, "status": s.domainMonitorRuntime(),
		"stdout": fmt.Sprintf("Очищено b4sni-логов: %d, освобождено %.1f KB", deleted, float64(freed)/1024),
	}
}

func b4sniRunning() bool {
	for _, path := range []string{"/var/log/ruopenray/b4sni.pid", "/usr/share/xrayui/logs/b4sni.pid", "/opt/share/xrayui/logs/b4sni.pid"} {
		body, err := os.ReadFile(path)
		if err != nil {
			continue
		}
		pid := strings.TrimSpace(string(body))
		if pid != "" && exec.Command("kill", "-0", pid).Run() == nil {
			return true
		}
	}
	if runtime.GOOS == "windows" {
		return false
	}
	output, err := exec.Command("pidof", "b4sni").Output()
	return err == nil && strings.TrimSpace(string(output)) != ""
}

func (s *serverState) monitorLogContent() (string, string) {
	var blocks []string
	var sourcePaths []string
	paths := []string{
		"/var/log/xray/access.log",
		filepath.Join(s.cfg.DataDir, "access.log"),
		"/var/log/xray/error.log",
		filepath.Join(s.cfg.DataDir, "error.log"),
	}
	if settings := s.loggingSettings(); settings != nil {
		paths = append(paths, cleanLogPath(fmt.Sprint(settings["accessPath"]), ""))
		paths = append(paths, cleanLogPath(fmt.Sprint(settings["errorPath"]), ""))
	}
	if cfg, err := s.readActiveConfig(); err == nil {
		if logConfig, ok := cfg["log"].(map[string]any); ok {
			paths = append(paths, cleanLogPath(fmt.Sprint(logConfig["access"]), ""))
			paths = append(paths, cleanLogPath(fmt.Sprint(logConfig["error"]), ""))
		}
	}
	seenPaths := map[string]bool{}
	for _, path := range paths {
		if path == "" || seenPaths[path] {
			continue
		}
		seenPaths[path] = true
		body, err := os.ReadFile(path)
		if err == nil && len(bytes.TrimSpace(body)) > 0 {
			blocks = append(blocks, string(body))
			sourcePaths = append(sourcePaths, path)
		}
	}
	if runtime.GOOS != "windows" {
		if output, err := exec.Command("logread", "-e", "xray").Output(); err == nil && len(output) > 0 {
			blocks = append(blocks, string(output))
			sourcePaths = append(sourcePaths, "logread:xray")
		}
	}
	return strings.Join(blocks, "\n"), strings.Join(sourcePaths, ", ")
}

func trimMonitorEvents(events []domainMonitorEvent, limit int) []domainMonitorEvent {
	if len(events) <= limit {
		return events
	}
	return events[len(events)-limit:]
}

func parseB4SNILines(content string, devices map[string]string) []domainMonitorEvent {
	var events []domainMonitorEvent
	now := time.Now()
	for _, line := range strings.Split(content, "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		parts := strings.Split(line, ",")
		if len(parts) < 5 || !regexp.MustCompile(`^\d{1,2}:\d{2}:\d{2}\.\d{3}$`).MatchString(strings.TrimSpace(parts[0])) {
			continue
		}
		protocol := strings.ToUpper(strings.TrimSpace(parts[1]))
		if protocol != "TCP" && protocol != "UDP" {
			continue
		}
		sourceIP, sourcePort := splitHostPortLast(strings.TrimSpace(parts[2]))
		destIP, destPort := splitHostPortLast(strings.TrimSpace(parts[3]))
		host := normalizeMonitorHost(strings.Join(parts[4:], ","))
		if host == "" {
			continue
		}
		ts := parseB4SNITimestamp(strings.TrimSpace(parts[0]), now)
		events = append(events, domainMonitorEvent{
			Time:            formatMonitorTime(ts, strings.TrimSpace(parts[0])),
			Timestamp:       ts.UnixNano(),
			Protocol:        protocol,
			SourceIP:        sourceIP,
			SourcePort:      sourcePort,
			SourceDevice:    devices[sourceIP],
			DestinationIP:   destIP,
			DestinationPort: destPort,
			Host:            host,
			Source:          "b4sni",
			Raw:             line,
		})
	}
	return events
}

func parseB4SNITimestamp(value string, now time.Time) time.Time {
	parsed, err := time.ParseInLocation("15:04:05.000", value, time.Local)
	if err != nil {
		return now
	}
	ts := time.Date(now.Year(), now.Month(), now.Day(), parsed.Hour(), parsed.Minute(), parsed.Second(), parsed.Nanosecond(), time.Local)
	if ts.After(now.Add(1 * time.Hour)) {
		ts = ts.Add(-24 * time.Hour)
	}
	return ts
}

func parseXrayDomainLines(content string, devices map[string]string) []domainMonitorEvent {
	privateIP := regexp.MustCompile(`\b(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(?::(\d+))?\b`)
	targetRe := regexp.MustCompile(`(?i)\b(tcp|udp):([^/\s,\[\]\(\)]+)(?::(\d+))?`)
	domainRe := regexp.MustCompile(`(?i)(?:sniffed domain:|querying(?: DNS for)?:|got answer:|domain\s+)([a-z0-9](?:[a-z0-9_.-]*[a-z0-9])?\.[a-z0-9](?:[a-z0-9_.-]*[a-z0-9])?)\.?`)
	outboundRe := regexp.MustCompile(`\[([A-Za-z0-9_.:-]+)\](?:\s|$)`)
	var events []domainMonitorEvent
	for _, line := range strings.Split(content, "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		sourceIP, sourcePort := "", ""
		if match := privateIP.FindStringSubmatch(line); len(match) > 0 {
			sourceIP, sourcePort = splitHostPortLast(match[0])
		}
		outbound := ""
		if match := outboundRe.FindStringSubmatch(line); len(match) > 1 {
			outbound = match[1]
		}
		timestamp := parseLogLineTime(line)
		if timestamp == 0 {
			timestamp = time.Now().UnixNano()
		}
		if match := domainRe.FindStringSubmatch(line); len(match) > 1 {
			host := normalizeMonitorHost(match[1])
			if host != "" && net.ParseIP(host) == nil {
				events = append(events, domainMonitorEvent{
					Time:         formatMonitorTime(time.Unix(0, timestamp), ""),
					Timestamp:    timestamp,
					Protocol:     "DNS",
					SourceIP:     sourceIP,
					SourcePort:   sourcePort,
					SourceDevice: devices[sourceIP],
					Host:         host,
					Outbound:     outbound,
					Source:       "xray-dns",
					Raw:          line,
				})
				continue
			}
		}
		matches := targetRe.FindAllStringSubmatch(line, -1)
		if len(matches) == 0 {
			continue
		}
		var host, port, protocol string
		for i := len(matches) - 1; i >= 0; i-- {
			candidate := normalizeMonitorHost(matches[i][2])
			if candidate == "" || isPrivateMonitorIP(candidate) {
				continue
			}
			host = candidate
			port = strings.TrimSpace(matches[i][3])
			protocol = strings.ToUpper(matches[i][1])
			if strings.ContainsAny(candidate, ".-") {
				break
			}
		}
		if host == "" {
			continue
		}
		events = append(events, domainMonitorEvent{
			Time:            formatMonitorTime(time.Unix(0, timestamp), ""),
			Timestamp:       timestamp,
			Protocol:        protocol,
			SourceIP:        sourceIP,
			SourcePort:      sourcePort,
			SourceDevice:    devices[sourceIP],
			DestinationIP:   ipHost(host),
			DestinationPort: port,
			Host:            host,
			Outbound:        outbound,
			Source:          "xray",
			Raw:             line,
		})
	}
	return events
}

func splitHostPortLast(value string) (string, string) {
	value = strings.TrimSpace(strings.Trim(value, "[]"))
	if value == "" {
		return "", ""
	}
	index := strings.LastIndex(value, ":")
	if index <= 0 || index == len(value)-1 {
		return value, ""
	}
	return strings.Trim(value[:index], "[]"), value[index+1:]
}

func normalizeMonitorHost(value string) string {
	value = strings.TrimSpace(strings.Trim(value, "[]()\"'"))
	value = strings.TrimRight(value, ".,;")
	if value == "" || value == "127.0.0.1" || value == "::1" || strings.EqualFold(value, "localhost") {
		return ""
	}
	if strings.Contains(value, "://") {
		if parsed, err := url.Parse(value); err == nil {
			value = parsed.Hostname()
		}
	}
	if strings.Contains(value, ":") {
		host, _ := splitHostPortLast(value)
		value = host
	}
	value = strings.ToLower(strings.TrimSpace(value))
	if value == "" || strings.ContainsAny(value, "/\\") {
		return ""
	}
	return value
}

func isPrivateMonitorIP(value string) bool {
	return strings.HasPrefix(value, "10.") || strings.HasPrefix(value, "192.168.") || regexp.MustCompile(`^172\.(1[6-9]|2\d|3[01])\.`).MatchString(value)
}

func ipHost(value string) string {
	if net.ParseIP(value) != nil {
		return value
	}
	return ""
}

func formatMonitorTime(ts time.Time, fallback string) string {
	if !ts.IsZero() {
		return ts.Format("15:04:05")
	}
	if fallback != "" {
		return strings.Split(fallback, ".")[0]
	}
	return ""
}

func aggregateDomainEvents(events []domainMonitorEvent) []domainMonitorAggregate {
	byHost := map[string]*domainMonitorAggregate{}
	for i := len(events) - 1; i >= 0; i-- {
		event := events[i]
		if event.Host == "" {
			continue
		}
		item := byHost[event.Host]
		if item == nil {
			item = &domainMonitorAggregate{
				Host:       event.Host,
				FirstSeen:  event.Time,
				LastSeen:   event.Time,
				LastSeenTs: event.Timestamp,
				firstTs:    event.Timestamp,
				deviceHits: map[string]*domainMonitorDevice{},
				protocols:  map[string]bool{},
				outbounds:  map[string]bool{},
			}
			byHost[event.Host] = item
		}
		item.Hits++
		if event.Protocol == "TCP" {
			item.TCP++
		}
		if event.Protocol == "UDP" {
			item.UDP++
		}
		if event.Protocol != "" {
			item.protocols[event.Protocol] = true
		}
		if event.Outbound != "" {
			item.outbounds[event.Outbound] = true
		}
		if event.Timestamp >= item.LastSeenTs {
			item.LastSeenTs = event.Timestamp
			item.LastSeen = event.Time
		}
		if item.firstTs == 0 || event.Timestamp <= item.firstTs {
			item.firstTs = event.Timestamp
			item.FirstSeen = event.Time
		}
		deviceKey := firstNonEmpty(event.SourceIP, "router")
		device := item.deviceHits[deviceKey]
		if device == nil {
			device = &domainMonitorDevice{IP: event.SourceIP, Name: firstNonEmpty(event.SourceDevice, event.SourceIP, "router")}
			item.deviceHits[deviceKey] = device
		}
		device.Hits++
		if len(item.Samples) < 3 {
			item.Samples = append(item.Samples, event)
		}
	}
	out := make([]domainMonitorAggregate, 0, len(byHost))
	for _, item := range byHost {
		item.Protocols = sortedKeys(item.protocols)
		item.Outbounds = sortedKeys(item.outbounds)
		for _, device := range item.deviceHits {
			item.Devices = append(item.Devices, *device)
		}
		sort.SliceStable(item.Devices, func(i, j int) bool { return item.Devices[i].Hits > item.Devices[j].Hits })
		item.deviceHits = nil
		item.protocols = nil
		item.outbounds = nil
		out = append(out, *item)
	}
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].Hits == out[j].Hits {
			return out[i].LastSeenTs > out[j].LastSeenTs
		}
		return out[i].Hits > out[j].Hits
	})
	if len(out) > 160 {
		out = out[:160]
	}
	return out
}

func aggregateMonitorDevices(events []domainMonitorEvent) []map[string]any {
	type deviceAgg struct {
		ip        string
		name      string
		hits      int
		domains   map[string]int
		protocols map[string]bool
	}
	byDevice := map[string]*deviceAgg{}
	for _, event := range events {
		key := firstNonEmpty(event.SourceIP, "router")
		item := byDevice[key]
		if item == nil {
			item = &deviceAgg{ip: event.SourceIP, name: firstNonEmpty(event.SourceDevice, event.SourceIP, "router"), domains: map[string]int{}, protocols: map[string]bool{}}
			byDevice[key] = item
		}
		item.hits++
		if event.Host != "" {
			item.domains[event.Host]++
		}
		if event.Protocol != "" {
			item.protocols[event.Protocol] = true
		}
	}
	out := []map[string]any{}
	for _, item := range byDevice {
		top := make([]map[string]any, 0, len(item.domains))
		for host, hits := range item.domains {
			top = append(top, map[string]any{"host": host, "hits": hits})
		}
		sort.SliceStable(top, func(i, j int) bool { return top[i]["hits"].(int) > top[j]["hits"].(int) })
		if len(top) > 5 {
			top = top[:5]
		}
		out = append(out, map[string]any{"ip": item.ip, "name": item.name, "hits": item.hits, "protocols": sortedKeys(item.protocols), "topDomains": top})
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i]["hits"].(int) > out[j]["hits"].(int) })
	return out
}

func domainMonitorStats(events []domainMonitorEvent, domains []domainMonitorAggregate) map[string]any {
	tcp, udp := 0, 0
	for _, event := range events {
		if event.Protocol == "TCP" {
			tcp++
		}
		if event.Protocol == "UDP" {
			udp++
		}
	}
	topDomain := ""
	topHits := 0
	if len(domains) > 0 {
		topDomain = domains[0].Host
		topHits = domains[0].Hits
	}
	return map[string]any{"total": len(events), "tcp": tcp, "udp": udp, "uniqueDomains": len(domains), "topDomain": topDomain, "topHits": topHits}
}

func sortedKeys(values map[string]bool) []string {
	out := make([]string, 0, len(values))
	for key := range values {
		out = append(out, key)
	}
	sort.Strings(out)
	return out
}

func parseLogLineTime(line string) int64 {
	if match := logLineTimePattern.FindString(line); match != "" {
		for _, layout := range []string{"2006/01/02 15:04:05.999999", "2006/01/02 15:04:05"} {
			if ts, err := time.ParseInLocation(layout, match, time.Local); err == nil {
				return ts.UnixNano()
			}
		}
	}
	if len(line) >= 24 {
		if ts, err := time.ParseInLocation("Mon Jan _2 15:04:05 2006", line[:24], time.Local); err == nil {
			return ts.UnixNano()
		}
	}
	return 0
}

func (s *serverState) backupActive(prefixes ...string) (string, error) {
	prefix := "config"
	if len(prefixes) > 0 && strings.TrimSpace(prefixes[0]) != "" {
		prefix = strings.TrimSpace(prefixes[0])
	}
	stamp := strings.NewReplacer(":", "-", ".", "-").Replace(time.Now().Format(time.RFC3339Nano))
	path := filepath.Join(s.cfg.BackupDir, prefix+"-"+stamp+".json")
	body, err := os.ReadFile(s.cfg.ActiveConfig)
	if err != nil {
		return "", err
	}
	if err := os.MkdirAll(s.cfg.BackupDir, 0o755); err != nil {
		return "", err
	}
	return path, os.WriteFile(path, body, 0o600)
}

func (s *serverState) latestBackup() (map[string]any, error) {
	entries, err := os.ReadDir(s.cfg.BackupDir)
	if err != nil {
		return nil, err
	}
	var latestPath string
	var latestInfo os.FileInfo
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".json") {
			continue
		}
		info, err := entry.Info()
		if err != nil {
			continue
		}
		if latestInfo == nil || info.ModTime().After(latestInfo.ModTime()) {
			latestInfo = info
			latestPath = filepath.Join(s.cfg.BackupDir, entry.Name())
		}
	}
	if latestInfo == nil {
		return nil, errors.New("бэкапы конфигурации пока не найдены")
	}
	return map[string]any{"path": latestPath, "name": filepath.Base(latestPath), "size": latestInfo.Size(), "modifiedAt": latestInfo.ModTime().Format(time.RFC3339)}, nil
}

func (s *serverState) restoreBackup(rawPath string) map[string]any {
	backupPath := rawPath
	if backupPath == "" || backupPath == "<nil>" {
		latest, err := s.latestBackup()
		if err != nil {
			return map[string]any{"ok": false, "stderr": err.Error()}
		}
		backupPath = fmt.Sprint(latest["path"])
	}
	if !filepath.IsAbs(backupPath) {
		backupPath = filepath.Join(s.cfg.BackupDir, filepath.Base(backupPath))
	}
	cleanBackupDir, _ := filepath.Abs(s.cfg.BackupDir)
	cleanBackupPath, _ := filepath.Abs(backupPath)
	if !strings.HasPrefix(cleanBackupPath, cleanBackupDir+string(os.PathSeparator)) {
		return map[string]any{"ok": false, "stderr": "можно восстановить только файл из backup-каталога"}
	}
	body, err := os.ReadFile(cleanBackupPath)
	if err != nil {
		return map[string]any{"ok": false, "stderr": err.Error()}
	}
	var cfg map[string]any
	if err := json.Unmarshal(body, &cfg); err != nil {
		return map[string]any{"ok": false, "stderr": err.Error()}
	}
	test := s.validateConfig(cfg)
	analysis := s.analyzeConfig(cfg)
	if test["ok"] != true {
		return map[string]any{"ok": false, "test": test, "analysis": analysis, "stderr": "backup не прошел xray -test"}
	}
	before, _ := s.backupActive("config-before-restore")
	if err := s.writeActiveConfig(cfg); err != nil {
		return map[string]any{"ok": false, "stderr": err.Error(), "backup": before}
	}
	restart := s.serviceAction("restart")
	return map[string]any{"ok": restart["ok"], "path": cleanBackupPath, "backup": before, "test": test, "analysis": analysis, "restart": restart}
}

func (s *serverState) handleStatic(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/")
	if path == "" {
		path = "index.html"
	}
	fullPath := "web/" + filepath.ToSlash(path)
	body, err := embeddedFiles.ReadFile(fullPath)
	if err != nil {
		if _, statErr := fs.Stat(embeddedFiles, fullPath); statErr != nil {
			http.NotFound(w, r)
			return
		}
	}
	if ctype := mime.TypeByExtension(filepath.Ext(path)); ctype != "" {
		w.Header().Set("content-type", ctype)
	}
	_, _ = w.Write(body)
}
