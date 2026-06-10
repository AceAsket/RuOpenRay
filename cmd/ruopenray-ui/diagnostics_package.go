package main

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"
)

func (s *serverState) downloadDiagnosticsPackage(w http.ResponseWriter, r *http.Request) {
	var buffer bytes.Buffer
	if err := s.buildDiagnosticsPackage(&buffer); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	name := "ruopenray-diagnostics-" + time.Now().Format("20060102-150405") + ".tar.gz"
	w.Header().Set("Content-Type", "application/gzip")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, name))
	w.Header().Set("Cache-Control", "no-store")
	_, _ = io.Copy(w, &buffer)
}

func (s *serverState) buildDiagnosticsPackage(out io.Writer) error {
	gz := gzip.NewWriter(out)
	tw := tar.NewWriter(gz)
	now := time.Now()
	addText := func(name, body string) error {
		return diagnosticsTarText(tw, now, name, body)
	}
	addJSON := func(name string, payload any) error {
		body, err := json.MarshalIndent(payload, "", "  ")
		if err != nil {
			return err
		}
		return addText(name, string(body)+"\n")
	}

	cfg, cfgErr := s.readActiveConfig()
	if err := addJSON("manifest.json", map[string]any{
		"generatedAt": now.Format(time.RFC3339),
		"appVersion":  appVersion,
		"asset":       ruOpenRayAssetName(),
		"note":        "Пакет содержит обезличенный Xray-конфиг, статусы сервисов, системные команды и хвосты логов для диагностики RuOpenRay.",
		"redaction":   "Пароли, uuid, privateKey, shortId, адреса proxy-серверов и userinfo в URL маскируются.",
		"paths": map[string]any{
			"dataDir":      s.cfg.DataDir,
			"backupDir":    s.cfg.BackupDir,
			"geoDir":       s.cfg.GeoDir,
			"activeConfig": s.cfg.ActiveConfig,
		},
	}); err != nil {
		return err
	}
	if err := addJSON("diagnostics.json", s.redactedDiagnostics()); err != nil {
		return err
	}
	if cfgErr != nil {
		if err := addText("config/read-error.txt", cfgErr.Error()+"\n"); err != nil {
			return err
		}
	} else {
		if err := addJSON("config/active-anonymized.json", anonymizeConfigForSupport(cfg)); err != nil {
			return err
		}
		if err := addJSON("config/analysis.json", s.analyzeConfig(cloneConfigMap(cfg))); err != nil {
			return err
		}
		if err := addJSON("config/test.json", s.validateConfig(cloneConfigMap(cfg))); err != nil {
			return err
		}
	}
	if draft := s.readConfigDraft(); boolPayload(draft, "exists", false) {
		if draftCfg, ok := draft["config"].(map[string]any); ok {
			draft["config"] = anonymizeConfigForSupport(draftCfg)
		}
		if err := addJSON("config/draft-anonymized.json", draft); err != nil {
			return err
		}
	}
	for _, item := range s.diagnosticsStatusPayloads() {
		if err := addJSON(item.name, item.payload); err != nil {
			return err
		}
	}
	for _, item := range s.diagnosticsCommands() {
		if err := addText(item.name, diagnosticsCommandText(item.timeout, item.command, item.args...)); err != nil {
			return err
		}
	}
	for _, item := range s.diagnosticsLogFiles() {
		if err := addText(item.name, item.body); err != nil {
			return err
		}
	}
	if err := s.addDiagnosticsExistingFiles(addText); err != nil {
		return err
	}
	if err := tw.Close(); err != nil {
		return err
	}
	return gz.Close()
}

type diagnosticsNamedPayload struct {
	name    string
	payload any
}

func (s *serverState) diagnosticsStatusPayloads() []diagnosticsNamedPayload {
	return []diagnosticsNamedPayload{
		{name: "status/system.json", payload: s.systemMetrics()},
		{name: "status/storage.json", payload: s.storageReport()},
		{name: "status/logging.json", payload: s.loggingSettings()},
		{name: "status/log-maintenance.json", payload: s.maintainLogFiles(false)},
		{name: "status/firewall.json", payload: s.firewallStatus()},
		{name: "status/lan-dns.json", payload: s.lanDNSUpstreamStatus(nil)},
		{name: "status/adguard-home.json", payload: s.adGuardHomeStatus("", s.xrayDNSUpstreamTarget())},
		{name: "status/podkop.json", payload: s.podkopStatus()},
		{name: "status/b4.json", payload: s.b4Status()},
		{name: "status/b4-api.json", payload: b4APIStatus()},
		{name: "status/amneziawg.json", payload: s.amneziaStatus()},
		{name: "status/geo.json", payload: s.geoStatus()},
		{name: "status/subscriptions.json", payload: redactDiagnosticAny(s.subscriptionReport(), nil, "", "")},
		{name: "status/subscription-schedule.json", payload: s.subscriptionSchedule()},
		{name: "status/route-presets.json", payload: s.routePresetsReport()},
	}
}

type diagnosticsCommand struct {
	name    string
	timeout time.Duration
	command string
	args    []string
}

func (s *serverState) diagnosticsCommands() []diagnosticsCommand {
	return []diagnosticsCommand{
		{name: "commands/ruopenray-ui-status.txt", timeout: 5 * time.Second, command: "/etc/init.d/ruopenray-ui", args: []string{"status"}},
		{name: "commands/xray-status.txt", timeout: 5 * time.Second, command: "/etc/init.d/" + s.cfg.ServiceName, args: []string{"status"}},
		{name: "commands/podkop-status.txt", timeout: 5 * time.Second, command: "/etc/init.d/podkop", args: []string{"status"}},
		{name: "commands/b4-status.txt", timeout: 5 * time.Second, command: "/etc/init.d/b4", args: []string{"status"}},
		{name: "commands/amneziawg-status.txt", timeout: 5 * time.Second, command: "/etc/init.d/amneziawg", args: []string{"status"}},
		{name: "commands/awg-show.txt", timeout: 5 * time.Second, command: "awg", args: []string{"show"}},
		{name: "commands/wg-show.txt", timeout: 5 * time.Second, command: "wg", args: []string{"show"}},
		{name: "commands/xray-version.txt", timeout: 5 * time.Second, command: "xray", args: []string{"version"}},
		{name: "commands/ps.txt", timeout: 5 * time.Second, command: "ps", args: []string{"w"}},
		{name: "commands/top.txt", timeout: 5 * time.Second, command: "sh", args: []string{"-c", "top -bn1 | head -n 60"}},
		{name: "commands/df.txt", timeout: 5 * time.Second, command: "df", args: []string{"-h"}},
		{name: "commands/free.txt", timeout: 5 * time.Second, command: "free", args: []string{"-m"}},
		{name: "commands/ip-rule.txt", timeout: 5 * time.Second, command: "ip", args: []string{"rule", "show"}},
		{name: "commands/ip-route-main.txt", timeout: 5 * time.Second, command: "ip", args: []string{"route", "show"}},
		{name: "commands/ip-route-100.txt", timeout: 5 * time.Second, command: "ip", args: []string{"route", "show", "table", "100"}},
		{name: "commands/ip-route-podkop.txt", timeout: 5 * time.Second, command: "ip", args: []string{"route", "show", "table", "podkop"}},
		{name: "commands/ip-route-105.txt", timeout: 5 * time.Second, command: "ip", args: []string{"route", "show", "table", "105"}},
		{name: "commands/ip-route-b4-route.txt", timeout: 5 * time.Second, command: "ip", args: []string{"route", "show", "table", "b4_route"}},
		{name: "commands/ip-link-awg-wg.txt", timeout: 5 * time.Second, command: "sh", args: []string{"-c", "ip -o link show | grep -Ei '(^[0-9]+: (a?wg|.*amnezia))' || true"}},
		{name: "commands/ip-route-amnezia.txt", timeout: 5 * time.Second, command: "ip", args: []string{"route", "show", "table", amneziaRouteTable}},
		{name: "commands/nft-ruopenray.txt", timeout: 5 * time.Second, command: "nft", args: []string{"list", "table", "inet", "ruopenray"}},
		{name: "commands/nft-podkop.txt", timeout: 5 * time.Second, command: "nft", args: []string{"list", "table", "inet", "PodkopTable"}},
		{name: "commands/nft-b4-grep.txt", timeout: 8 * time.Second, command: "sh", args: []string{"-c", "nft list ruleset 2>/dev/null | grep -Ei 'b4|nfqueue| queue | dport 53|redirect' | head -n 240"}},
		{name: "commands/nft-ruleset.txt", timeout: 8 * time.Second, command: "nft", args: []string{"list", "ruleset"}},
		{name: "commands/iptables-save.txt", timeout: 8 * time.Second, command: "iptables-save"},
		{name: "commands/uci-ruopenray-ui.txt", timeout: 5 * time.Second, command: "uci", args: []string{"show", "ruopenray-ui"}},
		{name: "commands/uci-xray.txt", timeout: 5 * time.Second, command: "uci", args: []string{"show", "xray"}},
		{name: "commands/uci-podkop.txt", timeout: 5 * time.Second, command: "uci", args: []string{"show", "podkop"}},
		{name: "commands/uci-b4.txt", timeout: 5 * time.Second, command: "uci", args: []string{"show", "b4"}},
		{name: "commands/uci-dhcp-dnsmasq.txt", timeout: 5 * time.Second, command: "sh", args: []string{"-c", "uci show dhcp | grep dnsmasq"}},
		{name: "commands/dhcp-leases.txt", timeout: 5 * time.Second, command: "cat", args: []string{"/tmp/dhcp.leases"}},
		{name: "commands/logread-tail.txt", timeout: 8 * time.Second, command: "sh", args: []string{"-c", "logread | tail -n 300"}},
		{name: "commands/dmesg-tail.txt", timeout: 8 * time.Second, command: "sh", args: []string{"-c", "dmesg | tail -n 150"}},
		{name: "commands/log-dir.txt", timeout: 5 * time.Second, command: "ls", args: []string{"-lh", filepath.Join(s.cfg.DataDir, "logs")}},
	}
}

type diagnosticsLogFile struct {
	name string
	body string
}

func (s *serverState) diagnosticsLogFiles() []diagnosticsLogFile {
	paths := append([]string{}, s.configuredLogPaths()...)
	sort.Strings(paths)
	out := []diagnosticsLogFile{}
	for _, path := range paths {
		if path == "" || !fileExists(path) {
			continue
		}
		name := "logs/" + diagnosticsSafeName(filepath.Base(path)) + ".tail.log"
		body := "$ tail -n 500 " + path + "\n\n" + fmt.Sprint(runTimeout(5*time.Second, "tail", "-n", "500", path)["stdout"]) + "\n"
		out = append(out, diagnosticsLogFile{name: name, body: redactSupportText(body)})
	}
	return out
}

func (s *serverState) addDiagnosticsExistingFiles(addText func(string, string) error) error {
	for _, item := range []struct {
		name string
		path string
	}{
		{name: "files/openwrt-release.txt", path: "/etc/openwrt_release"},
		{name: "files/firewall.nft", path: "/etc/ruopenray-ui/firewall.nft"},
		{name: "files/ruopenray-ui-firewall.nft", path: filepath.Join(s.cfg.DataDir, "firewall.nft")},
	} {
		body, err := os.ReadFile(item.path)
		if err != nil {
			continue
		}
		if err := addText(item.name, redactSupportText(string(body))); err != nil {
			return err
		}
	}
	return nil
}

func diagnosticsCommandText(timeout time.Duration, command string, args ...string) string {
	result := runTimeout(timeout, command, args...)
	stdout := redactSupportText(fmt.Sprint(result["stdout"]))
	stderr := redactSupportText(fmt.Sprint(result["stderr"]))
	return strings.TrimSpace(fmt.Sprintf("$ %s %s\nok: %v\ncode: %v\n\nstdout:\n%s\n\nstderr:\n%s\n",
		command, strings.Join(args, " "), result["ok"], result["code"], stdout, stderr)) + "\n"
}

func diagnosticsTarText(tw *tar.Writer, modTime time.Time, name string, body string) error {
	body = strings.ReplaceAll(body, "\r\n", "\n")
	header := &tar.Header{
		Name:    strings.TrimPrefix(filepath.ToSlash(name), "/"),
		Mode:    0o600,
		Size:    int64(len([]byte(body))),
		ModTime: modTime,
	}
	if err := tw.WriteHeader(header); err != nil {
		return err
	}
	_, err := tw.Write([]byte(body))
	return err
}

func (s *serverState) redactedDiagnostics() map[string]any {
	payload := s.diagnostics()
	if cfg, err := s.readActiveConfig(); err == nil {
		tags := supportProxyTagMap(cfg)
		return redactDiagnosticAny(payload, tags, "", "").(map[string]any)
	}
	return redactDiagnosticAny(payload, nil, "", "").(map[string]any)
}

func anonymizeConfigForSupport(cfg map[string]any) map[string]any {
	clone := cloneConfigMap(cfg)
	tags := supportProxyTagMap(clone)
	for _, item := range anySlice(clone["outbounds"]) {
		outbound, ok := item.(map[string]any)
		if !ok {
			continue
		}
		tag := strings.TrimSpace(fmt.Sprint(outbound["tag"]))
		if replacement := tags[tag]; replacement != "" {
			outbound["tag"] = replacement
		}
	}
	redacted := redactDiagnosticAny(clone, tags, "", "")
	out, ok := redacted.(map[string]any)
	if !ok {
		return map[string]any{}
	}
	out["_ruopenraySupportExport"] = map[string]any{
		"anonymized":  true,
		"generatedAt": time.Now().Format(time.RFC3339),
	}
	return out
}

func supportProxyTagMap(cfg map[string]any) map[string]string {
	tags := map[string]string{}
	index := 1
	for _, item := range anySlice(cfg["outbounds"]) {
		outbound, ok := item.(map[string]any)
		if !ok || isSystemOutbound(outbound) {
			continue
		}
		tag := strings.TrimSpace(fmt.Sprint(outbound["tag"]))
		if tag == "" || tag == "<nil>" || tags[tag] != "" {
			continue
		}
		tags[tag] = fmt.Sprintf("proxy-%d", index)
		index++
	}
	return tags
}

func cloneConfigMap(value map[string]any) map[string]any {
	body, err := json.Marshal(value)
	if err != nil {
		return map[string]any{}
	}
	var out map[string]any
	if err := json.Unmarshal(body, &out); err != nil {
		return map[string]any{}
	}
	return out
}

func redactDiagnosticAny(value any, tags map[string]string, key string, parentKey string) any {
	switch typed := value.(type) {
	case map[string]any:
		out := map[string]any{}
		for childKey, childValue := range typed {
			out[childKey] = redactDiagnosticAny(childValue, tags, childKey, key)
		}
		return out
	case []any:
		out := make([]any, 0, len(typed))
		for _, item := range typed {
			out = append(out, redactDiagnosticAny(item, tags, key, parentKey))
		}
		return out
	case string:
		return redactDiagnosticString(typed, tags, key, parentKey)
	default:
		return typed
	}
}

func redactDiagnosticString(value string, tags map[string]string, key string, parentKey string) string {
	if replacement := tags[value]; replacement != "" {
		return replacement
	}
	if diagnosticsSensitiveKey(key, parentKey) {
		if strings.TrimSpace(value) == "" {
			return value
		}
		return "[masked]"
	}
	return redactSupportText(value)
}

func diagnosticsSensitiveKey(key string, parentKey string) bool {
	normalized := strings.ToLower(strings.ReplaceAll(strings.ReplaceAll(key, "_", ""), "-", ""))
	parent := strings.ToLower(parentKey)
	switch normalized {
	case "password", "pass", "secret", "token", "privatekey", "shortid", "shortids", "spiderx", "id", "uuid", "alterid", "address", "server", "servername", "sni", "host", "dest", "publickey", "email":
		return true
	}
	return parent == "headers" && normalized == "host"
}

var supportRedactors = []*regexp.Regexp{
	regexp.MustCompile(`(?i)(://)[^/@\s:]+:[^/@\s]+@`),
	regexp.MustCompile(`(?i)(password[=:'"\s]+)[^'"\s]+`),
	regexp.MustCompile(`(?i)(passwd[=:'"\s]+)[^'"\s]+`),
	regexp.MustCompile(`(?i)(privateKey[=:'"\s]+)[^'"\s]+`),
	regexp.MustCompile(`(?i)(shortId[=:'"\s]+)[^'"\s]+`),
	regexp.MustCompile(`(?i)(token[=:'"\s]+)[^'"\s]+`),
}

func redactSupportText(value string) string {
	out := value
	for _, re := range supportRedactors {
		out = re.ReplaceAllString(out, "${1}[masked]")
	}
	return out
}

func diagnosticsSafeName(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return "log"
	}
	value = strings.NewReplacer("\\", "-", "/", "-", ":", "-", " ", "-").Replace(value)
	return strings.Trim(value, ".-")
}
