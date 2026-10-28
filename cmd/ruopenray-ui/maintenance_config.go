package main

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"github.com/AceAsket/RuOpenRay/internal/geodata"
)

func appUCIOptions() map[string]string {
	options := map[string]string{}
	if runtime.GOOS == "windows" || !commandExists("uci") {
		return options
	}
	result := runTimeout(3*time.Second, "uci", "-q", "show", "ruopenray-ui.main")
	if result["ok"] != true {
		return options
	}
	for _, line := range strings.Split(fmt.Sprint(result["stdout"]), "\n") {
		key, value, ok := strings.Cut(line, "=")
		if !ok || !strings.HasPrefix(key, "ruopenray-ui.main.") {
			continue
		}
		if len(value) >= 2 && value[0] == '\'' && value[len(value)-1] == '\'' {
			value = strings.ReplaceAll(value[1:len(value)-1], "'\\''", "'")
		}
		options[strings.TrimPrefix(key, "ruopenray-ui.main.")] = value
	}
	return options
}

func (s *serverState) maintenanceEnvironment() string {
	values := [][2]string{{"RUOPENRAY_DATA_DIR", s.cfg.DataDir}, {"RUOPENRAY_ACTIVE_CONFIG", s.cfg.ActiveConfig}, {"RUOPENRAY_PROFILES_DIR", s.cfg.ProfilesDir}, {"RUOPENRAY_GEO_DIR", s.cfg.GeoDir}, {"RUOPENRAY_BACKUP_DIR", s.cfg.BackupDir}, {"RUOPENRAY_XRAY_SERVICE", s.cfg.ServiceName}, {"GOMEMLIMIT", getenv([]string{"GOMEMLIMIT"}, "48MiB")}, {"GOGC", getenv([]string{"GOGC"}, "60")}}
	parts := make([]string, 0, len(values))
	for _, item := range values {
		parts = append(parts, item[0]+"="+geodata.ShellQuote(item[1]))
	}
	return strings.Join(parts, " ")
}

func (s *serverState) ensureMaintenanceDirs() error {
	for _, directory := range []string{s.cfg.DataDir, s.cfg.ProfilesDir, s.cfg.BackupDir} {
		if err := os.MkdirAll(filepath.Clean(directory), 0700); err != nil {
			return err
		}
	}
	// Do not create or modify ActiveConfig while invoking a maintenance command.
	return nil
}
