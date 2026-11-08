package main

import (
	"bytes"
	"context"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"runtime"
	"strconv"
	"strings"
	"time"

	rsystem "github.com/AceAsket/RuOpenRay/internal/system"
)

// Only rules are reloadable here. ReloadRules also reconstructs balancers;
// excluding them preserves live selection overrides and observer state.
func routingRulesOnly(before, after map[string]any) bool {
	if before == nil || after == nil {
		return false
	}
	withoutRules := func(cfg map[string]any) map[string]any {
		copy := map[string]any{}
		for key, value := range cfg {
			copy[key] = value
		}
		routing := map[string]any{}
		for key, value := range mapValue(cfg["routing"]) {
			if key == "balancers" {
				if value == nil {
					continue
				}
				if list, ok := value.([]any); ok && len(list) == 0 {
					continue
				}
			}
			if key != "rules" {
				routing[key] = value
			}
		}
		copy["routing"] = routing
		return copy
	}
	a, ea := json.Marshal(withoutRules(before))
	b, eb := json.Marshal(withoutRules(after))
	x, ex := json.Marshal(mapValue(before["routing"])["rules"])
	y, ey := json.Marshal(mapValue(after["routing"])["rules"])
	return ea == nil && eb == nil && ex == nil && ey == nil && bytes.Equal(a, b) && !bytes.Equal(x, y)
}

func routingAPIServer(cfg map[string]any) (string, error) {
	api := mapValue(cfg["api"])
	tag, _ := api["tag"].(string)
	if listen, _ := api["listen"].(string); listen != "" {
		return localRoutingAddress(listen)
	}
	for _, item := range anySlice(cfg["inbounds"]) {
		inbound := mapValue(item)
		if tag == "" || inbound["tag"] != tag {
			continue
		}
		host, _ := inbound["listen"].(string)
		return localRoutingAddress(net.JoinHostPort(host, strconv.Itoa(intPayload(inbound, "port", 0))))
	}
	return "", fmt.Errorf("Локальный API Xray не настроен")
}

func localRoutingAddress(address string) (string, error) {
	host, port, err := net.SplitHostPort(address)
	ip := net.ParseIP(host)
	n, numberErr := strconv.Atoi(port)
	if err != nil || ip == nil || !ip.IsLoopback() || numberErr != nil || n < 1 || n > 65535 {
		return "", fmt.Errorf("Для горячих правил API Xray должен слушать IP loopback с явным портом")
	}
	return net.JoinHostPort(ip.String(), strconv.Itoa(n)), nil
}

func routingServiceEnabled(cfg map[string]any) bool {
	for _, service := range stringList(mapValue(cfg["api"])["services"]) {
		if service == "RoutingService" {
			return true
		}
	}
	return false
}

func prepareRoutingAPI(cfg map[string]any) error {
	api := mapValue(cfg["api"])
	if len(api) == 0 {
		api = map[string]any{"tag": "ruopenray-routing-api", "listen": "127.0.0.1:10086", "services": []any{}}
		cfg["api"] = api
	}
	if _, err := routingAPIServer(cfg); err != nil {
		return err
	}
	if !routingServiceEnabled(cfg) {
		api["services"] = append(anySlice(api["services"]), "RoutingService")
	}
	return nil
}

func (s *serverState) prepareRoutingAPIRequest(w http.ResponseWriter, r *http.Request) {
	payload, err := readJSON(w, r)
	if err != nil {
		writeJSON(w, 400, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	cfg, valid := payload["config"].(map[string]any)
	if !valid || cfg == nil {
		writeJSON(w, 400, map[string]any{"ok": false, "error": "config должен быть объектом"})
		return
	}
	if err = prepareRoutingAPI(cfg); err != nil {
		writeJSON(w, 422, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	// Preparation only: the existing revision-guarded draft/apply flow owns writes.
	writeJSON(w, 200, map[string]any{"ok": true, "config": cfg})
}

func routingHotVersion(version string) bool {
	fields := strings.Fields(version)
	if len(fields) < 2 || fields[0] != "Xray" {
		return false
	}
	cmp, valid := compareReleaseVersions(fields[1], "26.10.21")
	return valid && cmp >= 0
}

type routingRuntimeRule struct {
	Tag     string `json:"tag"`
	RuleTag string `json:"ruleTag"`
}

func routingRuleSummary(cfg map[string]any) []routingRuntimeRule {
	rules := []routingRuntimeRule{}
	for _, item := range anySlice(mapValue(cfg["routing"])["rules"]) {
		rule := mapValue(item)
		tag, _ := rule["outboundTag"].(string)
		ruleTag, _ := rule["ruleTag"].(string)
		rules = append(rules, routingRuntimeRule{Tag: tag, RuleTag: ruleTag})
	}
	return rules
}

func (s *serverState) routingCommand(input []byte, args ...string) ([]byte, error) {
	return s.routingCommandWithTimeout(7*time.Second, input, args...)
}

func (s *serverState) routingCommandWithTimeout(timeout time.Duration, input []byte, args ...string) ([]byte, error) {
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, "xray", args...)
	cmd.Env = s.xrayEnv()
	cmd.WaitDelay = time.Second
	if input != nil {
		cmd.Stdin = bytes.NewReader(input)
	}
	out, failure := &firewallMapOutput{limit: 2 << 20}, &firewallMapOutput{limit: 16 << 10}
	cmd.Stdout, cmd.Stderr = out, failure
	err := cmd.Run()
	if ctx.Err() != nil {
		return nil, fmt.Errorf("Истёк срок ожидания API Xray")
	}
	if out.exceeded {
		return nil, fmt.Errorf("Ответ API Xray превышает 2 МиБ")
	}
	if err != nil {
		return nil, fmt.Errorf("API Xray не подтвердил операцию: %v: %s", err, strings.TrimSpace(failure.buffer.String()))
	}
	return out.buffer.Bytes(), nil
}

func (s *serverState) routingList(server string) ([]routingRuntimeRule, error) {
	body, err := s.routingCommand(nil, "api", "lsrules", "--server="+server, "--timeout=4")
	if err != nil {
		return nil, err
	}
	var response struct {
		Rules []routingRuntimeRule `json:"rules"`
	}
	if json.Unmarshal(body, &response) != nil {
		return nil, fmt.Errorf("API Xray вернул некорректный список правил")
	}
	if response.Rules == nil {
		response.Rules = []routingRuntimeRule{}
	}
	return response.Rules, nil
}

func (s *serverState) routingReplace(server string, cfg map[string]any) error {
	body, err := json.Marshal(map[string]any{"routing": cfg["routing"]})
	if err != nil {
		return err
	}
	// AddRule compiles the whole rule list, including Geo matchers. Give both
	// apply and rollback more time than lightweight API reads, plus CLI budget
	// for decoding the config before its RPC. A timeout still triggers rollback.
	_, err = s.routingCommandWithTimeout(30*time.Second, body, "api", "adrules", "--server="+server, "--timeout=20", "--append=false", "stdin:")
	return err
}

type routingHotClient struct {
	identity func() (string, error)
	list     func() ([]routingRuntimeRule, error)
	replace  func(map[string]any) error
	process  string
}

func (c *routingHotClient) verify(cfg map[string]any) error {
	pid, err := c.identity()
	if err != nil || pid != c.process {
		return fmt.Errorf("Процесс Xray изменился во время применения")
	}
	rules, err := c.list()
	if err != nil {
		return err
	}
	if !reflect.DeepEqual(rules, routingRuleSummary(cfg)) {
		return fmt.Errorf("Порядок и направления правил в API Xray не совпали с конфигурацией")
	}
	pid, err = c.identity()
	if err != nil || pid != c.process {
		return fmt.Errorf("Процесс Xray изменился во время проверки")
	}
	return nil
}

func (s *serverState) routingHotPlan(before, after map[string]any) (*routingHotClient, string) {
	if !routingRulesOnly(before, after) {
		return nil, "Изменены параметры помимо списка правил"
	}
	routing := mapValue(before["routing"])
	script, _ := routing["script"].(string)
	if len(anySlice(routing["balancers"])) > 0 || script != "" {
		return nil, "Балансировщики и routing script требуют обычного применения"
	}
	if runtime.GOOS != "linux" || s.cfg.ServiceName != "xray" {
		return nil, "Горячее применение доступно для управляемого Xray на Linux"
	}
	if !routingServiceEnabled(before) {
		return nil, "RoutingService ещё не включён; требуется обычное применение"
	}
	server, err := routingAPIServer(before)
	if err != nil {
		return nil, err.Error()
	}
	version, err := s.routingCommand(nil, "version")
	if err != nil || !routingHotVersion(string(version)) {
		return nil, "Для горячих правил нужен Xray 26.10.21 или новее"
	}
	identity := func() (string, error) { return s.routingProcess(server) }
	pid, err := identity()
	if err != nil {
		return nil, err.Error()
	}
	c := &routingHotClient{process: pid, identity: identity, list: func() ([]routingRuntimeRule, error) { return s.routingList(server) }, replace: func(cfg map[string]any) error { return s.routingReplace(server, cfg) }}
	if err = c.verify(before); err != nil {
		return nil, "Исходное состояние API не подтверждено: " + err.Error()
	}
	return c, ""
}

// Bind the API to the one core process using exactly our single config file.
func (s *serverState) routingProcess(server string) (string, error) {
	pids, err := rsystem.NumericProcDirs()
	if err != nil {
		return "", err
	}
	var pid string
	for _, item := range pids {
		if rsystem.ProcComm(item) == "xray" {
			body, err := os.ReadFile(filepath.Join("/proc", item, "cmdline"))
			if os.IsNotExist(err) {
				continue // A short-lived CLI may exit while /proc is scanned.
			}
			if err != nil {
				return "", err
			}
			if routingCLIProcess(strings.Split(strings.TrimRight(string(body), "\x00"), "\x00")) {
				continue
			}
			if pid != "" {
				return "", fmt.Errorf("Запущено несколько Xray")
			}
			pid = item
		}
	}
	if pid == "" {
		return "", fmt.Errorf("Xray не запущен")
	}
	corePath, err := exec.LookPath("xray")
	if err != nil {
		return "", err
	}
	running, runErr := os.Stat(filepath.Join("/proc", pid, "exe"))
	installed, installErr := os.Stat(corePath)
	if runErr != nil || installErr != nil || !os.SameFile(running, installed) {
		return "", fmt.Errorf("Запущенный Xray отличается от установленного бинарника")
	}
	body, err := os.ReadFile(filepath.Join("/proc", pid, "cmdline"))
	if err != nil {
		return "", err
	}
	args := strings.Split(strings.TrimRight(string(body), "\x00"), "\x00")
	configs := 0
	for i := 1; i < len(args); i++ {
		arg := args[i]
		if arg == "run" {
			continue
		}
		if arg == "-config" || arg == "--config" || arg == "-c" {
			i++
			if i >= len(args) || filepath.Clean(args[i]) != filepath.Clean(s.cfg.ActiveConfig) {
				return "", fmt.Errorf("Процесс Xray использует другую конфигурацию")
			}
			configs++
			continue
		}
		if (arg == "-format" || arg == "--format") && i+1 < len(args) && args[i+1] == "json" {
			i++
			continue
		}
		return "", fmt.Errorf("Параметры запуска Xray не подходят для горячего применения")
	}
	start := rsystem.ProcessStartTicks(pid)
	if configs != 1 || start <= 0 || !routingSocketOwned(pid, server) {
		return "", fmt.Errorf("Не подтверждён владелец локального API Xray")
	}
	return pid + ":" + strconv.FormatFloat(start, 'f', 0, 64), nil
}

func routingCLIProcess(args []string) bool {
	// API clients (including dashboard stats queries) and informational CLI
	// commands cannot be the managed core. Keep unknown invocations subject
	// to the existing single-process and exact-config checks.
	if len(args) < 2 {
		return false
	}
	switch args[1] {
	case "api", "version", "help":
		return true
	}
	return false
}

func routingSocketOwned(pid, server string) bool {
	host, port, err := net.SplitHostPort(server)
	if err != nil {
		return false
	}
	n, _ := strconv.Atoi(port)
	ip := net.ParseIP(host)
	if ip == nil {
		return false
	}
	name, hexIP := "tcp", ""
	if ip4 := ip.To4(); ip4 != nil {
		hexIP = fmt.Sprintf("%08X", binary.LittleEndian.Uint32(ip4))
	} else {
		name = "tcp6"
		for i := 0; i < 16; i += 4 {
			hexIP += fmt.Sprintf("%08X", binary.LittleEndian.Uint32(ip[i:i+4]))
		}
	}
	body, err := os.ReadFile("/proc/net/" + name)
	if err != nil {
		return false
	}
	inodes := map[string]bool{}
	for _, line := range strings.Split(string(body), "\n") {
		fields := strings.Fields(line)
		if len(fields) > 9 && fields[1] == fmt.Sprintf("%s:%04X", hexIP, n) && fields[3] == "0A" {
			inodes["socket:["+fields[9]+"]"] = true
		}
	}
	fds, err := os.ReadDir(filepath.Join("/proc", pid, "fd"))
	if err != nil {
		return false
	}
	for _, fd := range fds {
		target, err := os.Readlink(filepath.Join("/proc", pid, "fd", fd.Name()))
		if err == nil && inodes[target] {
			return true
		}
	}
	return false
}

func (s *serverState) activateConfigWithRoutingProgress(backup string, progress configApplyReporter) map[string]any {
	body, err := os.ReadFile(backup)
	var before map[string]any
	if err != nil || json.Unmarshal(body, &before) != nil {
		return map[string]any{"ok": false, "stderr": "Не удалось прочитать резервную копию конфигурации"}
	}
	after, err := s.readActiveConfig()
	if err != nil {
		return map[string]any{"ok": false, "stderr": err.Error()}
	}
	client, reason := s.routingHotPlan(before, after)
	if client == nil {
		result := s.restartSubscriptionWithRollbackProgress(backup, progress)
		result["mode"] = "restart"
		result["hotRoutingReason"] = reason
		return result
	}
	return s.applyHotRouting(client, before, after, backup, progress, func() map[string]any { return s.restartSubscriptionWithRollbackProgress(backup, nil) })
}

func (s *serverState) applyHotRouting(client *routingHotClient, before, after map[string]any, backup string, progress configApplyReporter, recover func() map[string]any) map[string]any {
	reportConfigApply(progress, "hot-routing", "running")
	err := client.verify(before)
	if err == nil {
		err = client.replace(after)
	}
	if err == nil {
		err = client.verify(after)
	}
	if err == nil {
		reportConfigApply(progress, "hot-routing", "done")
		return map[string]any{"ok": true, "mode": "hot-routing", "restarted": false, "stdout": "Правила маршрутизации применены без перезапуска Xray. Уже открытые соединения сохраняют прежний маршрут."}
	}
	// An RPC error can mean a lost acknowledgement: always restore and verify
	// the entire previous list, never append or retry the candidate mutation.
	reportConfigApply(progress, "hot-routing", "failed")
	reportConfigApply(progress, "rollback", "running")
	fileErr := s.restoreSubscriptionConfig(backup)
	pid, pidErr := client.identity()
	var rollbackErr error
	if pidErr != nil || pid != client.process {
		rollbackErr = fmt.Errorf("Процесс Xray изменился")
	} else {
		rollbackErr = client.replace(before)
		if rollbackErr == nil {
			rollbackErr = client.verify(before)
		}
	}
	rollback := map[string]any{"ok": fileErr == nil && rollbackErr == nil, "mode": "hot-routing"}
	if fileErr != nil {
		rollback["error"] = fileErr.Error()
	}
	if fileErr == nil && rollbackErr != nil {
		rollback = recover()
		rollback["mode"] = "restart"
	}
	status := "failed"
	if rollback["ok"] == true {
		status = "done"
	}
	reportConfigApply(progress, "rollback", status)
	return map[string]any{"ok": false, "mode": "hot-routing", "stderr": err.Error(), "rollback": rollback}
}
