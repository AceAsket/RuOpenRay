package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	rsystem "github.com/AceAsket/RuOpenRay/internal/system"
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
	sessionsMu       sync.RWMutex
	draftMu          sync.Mutex
	geoStaging       bool
	sessions         map[string]bool
	sessionUntil     map[string]time.Time
	rememberKey      string
	revokedMemory    map[string]time.Time
	loginMu          sync.Mutex
	loginAttempts    map[string]loginAttempt
	started          time.Time
	systemSampler    *rsystem.Sampler
	metricsMu        sync.Mutex
	prevXrayStats    map[string]uint64
	prevXrayStatsAt  time.Time
	coreVersionCache map[string]any
	coreVersionAt    time.Time
	serviceCache     map[string]any
	serviceAt        time.Time
	xrayStatsCache   map[string]any
	xrayStatsAt      time.Time
	b4Cache          map[string]any
	b4At             time.Time
	amneziaCache     map[string]any
	amneziaAt        time.Time
	logCacheKey      string
	logCacheText     string
	logCacheAt       time.Time
	fallbackMu       sync.Mutex
	adguardMu        sync.Mutex
	backupMu         sync.Mutex
	tlsProbeMu       sync.Mutex
	backupPaths      map[string]string
	b4Mu             sync.Mutex
	b4ControlMu      sync.Mutex
	b4Token          string
	b4LoginAfter     time.Time
	b4LoginKey       string
	fallbackProgress map[string]any
}

func (s *serverState) addSession(token string) {
	s.sessionsMu.Lock()
	defer s.sessionsMu.Unlock()
	if s.sessions == nil {
		s.sessions = map[string]bool{}
	}
	s.sessions[token] = true
	if s.sessionUntil == nil {
		s.sessionUntil = map[string]time.Time{}
	}
	now := time.Now()
	for key, until := range s.sessionUntil {
		if now.After(until) {
			delete(s.sessionUntil, key)
			delete(s.sessions, key)
		}
	}
	for len(s.sessions) > 1024 {
		for key := range s.sessions {
			if key == token {
				continue
			}
			delete(s.sessions, key)
			delete(s.sessionUntil, key)
			break
		}
	}
	s.sessionUntil[token] = now.Add(12 * time.Hour)
}

func (s *serverState) hasSession(token string) bool {
	s.sessionsMu.RLock()
	defer s.sessionsMu.RUnlock()
	until, limited := s.sessionUntil[token]
	return s.sessions != nil && s.sessions[token] && (!limited || time.Now().Before(until))
}

func (s *serverState) clearSessions() {
	s.sessionsMu.Lock()
	defer s.sessionsMu.Unlock()
	s.sessions = map[string]bool{}
	s.sessionUntil = map[string]time.Time{}
}

func (s *serverState) sessionCount() int {
	s.sessionsMu.RLock()
	defer s.sessionsMu.RUnlock()
	return len(s.sessions)
}

func getenv(names []string, fallback string) string {
	for _, name := range names {
		if value := strings.TrimSpace(os.Getenv(name)); value != "" {
			return value
		}
	}
	return fallback
}

func loadAppConfig() appConfig {
	options := appUCIOptions()
	fallback := func(key, value string) string {
		if option := strings.TrimSpace(options[key]); option != "" {
			return option
		}
		return value
	}
	cfg := appConfig{
		DataDir:      getenv([]string{"RUOPENRAY_DATA_DIR", "OPENRAY_DATA_DIR"}, fallback("data_dir", "data")),
		ServiceName:  getenv([]string{"RUOPENRAY_XRAY_SERVICE", "OPENRAY_XRAY_SERVICE"}, fallback("xray_service", "xray")),
		GeoDir:       getenv([]string{"RUOPENRAY_GEO_DIR", "OPENRAY_GEO_DIR"}, fallback("geo_dir", "")),
		Host:         getenv([]string{"RUOPENRAY_HOST", "OPENRAY_HOST"}, fallback("host", "127.0.0.1")),
		Port:         getenv([]string{"RUOPENRAY_PORT", "OPENRAY_PORT"}, fallback("port", "9090")),
		Password:     getenv([]string{"RUOPENRAY_PASSWORD", "RUOPENRAY_TOKEN", "OPENRAY_PASSWORD", "OPENRAY_TOKEN"}, fallback("password", "admin")),
		ActiveConfig: getenv([]string{"RUOPENRAY_ACTIVE_CONFIG", "OPENRAY_ACTIVE_CONFIG"}, fallback("active_config", "")),
		ProfilesDir:  getenv([]string{"RUOPENRAY_PROFILES_DIR", "OPENRAY_PROFILES_DIR"}, ""),
		BackupDir:    getenv([]string{"RUOPENRAY_BACKUP_DIR", "OPENRAY_BACKUP_DIR"}, fallback("backup_dir", "")),
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
		return s.prepareActiveLogFiles()
	}
	if err := os.MkdirAll(filepath.Dir(s.cfg.ActiveConfig), 0o755); err != nil {
		return err
	}
	body, _ := json.MarshalIndent(defaultConfig(), "", "  ")
	if err := os.WriteFile(s.cfg.ActiveConfig, body, 0o600); err != nil {
		return err
	}
	if err := s.prepareActiveLogFiles(); err != nil {
		return err
	}
	if err := os.WriteFile(filepath.Join(s.cfg.ProfilesDir, "default.json"), body, 0o600); err != nil {
		return err
	}
	return s.writeActiveProfileName("default")
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
