package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strconv"
	"strings"
	"time"

	rsystem "github.com/AceAsket/RuOpenRay/internal/system"
	rxraystats "github.com/AceAsket/RuOpenRay/internal/xraystats"
)

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

func (s *serverState) cpuPercent() any {
	total, idle := rsystem.ReadCPUStat()
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
	pids, err := rsystem.NumericProcDirs()
	if err != nil {
		return 0, ""
	}
	names := map[string]bool{"xray": true}
	if serviceName != "" {
		names[serviceName] = true
	}
	now := rsystem.RouterUptimeSeconds()
	ticks := clockTicksPerSecond()
	if now <= 0 || ticks <= 0 {
		return 0, ""
	}
	for _, pid := range pids {
		if !names[rsystem.ProcComm(pid)] {
			continue
		}
		start := rsystem.ProcessStartTicks(pid)
		if start <= 0 {
			continue
		}
		uptime := now - start/ticks
		if uptime > 0 {
			return uptime, pid
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

func (s *serverState) trafficStats() map[string]any {
	items := rsystem.ReadNetDevStats()
	if len(items) == 0 {
		return map[string]any{}
	}
	byName := map[string]rsystem.NetDevStat{}
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

func (s *serverState) saveXrayStatsSettings(enabled bool) map[string]any {
	cfg, err := s.readActiveConfig()
	if err != nil {
		return map[string]any{"ok": false, "stderr": err.Error()}
	}
	rxraystats.EnsureConfig(cfg, enabled)
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
	return map[string]any{"ok": restart["ok"], "enabled": enabled, "settings": rxraystats.APIInfo(cfg), "backup": backup, "test": test, "analysis": analysis, "restart": restart}
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
	info := rxraystats.APIInfo(cfg)
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
	counters := rxraystats.ParseOutput(fmt.Sprint(query["stdout"]))
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

	result := rxraystats.TrafficResult(counters, prev, elapsed, rxraystats.OutboundProtocols(cfg), now)
	result["ok"] = true
	result["enabled"] = true
	result["reset"] = reset
	result["settings"] = info
	result["server"] = server
	if !reset {
		s.metricsMu.Lock()
		s.xrayStatsCache = result
		s.xrayStatsAt = now
		s.metricsMu.Unlock()
	}
	return result
}

func (s *serverState) systemMetrics() map[string]any {
	cpu := rsystem.LoadAverage()
	cpu["percent"] = s.cpuPercent()
	return map[string]any{
		"cpu":       cpu,
		"memory":    rsystem.MemoryStats(),
		"tcp":       rsystem.TCPStats(),
		"conntrack": rsystem.ConntrackStats(),
		"disk":      systemDiskInfo(),
		"traffic":   s.trafficStats(),
		"uptime":    rsystem.RouterUptimeSeconds(),
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
