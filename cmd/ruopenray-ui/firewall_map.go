package main

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"os/exec"
	"runtime"
	"strconv"
	"time"
)

const firewallMapMaxBytes = 8 << 20
const firewallMapMaxChains = 2048
const firewallMapMaxRules = 16384

type firewallMapTarget struct {
	Kind   string `json:"kind"`
	Name   string `json:"name"`
	ID     string `json:"id"`
	Exists bool   `json:"exists"`
}

type firewallMapRule struct {
	Handle  string              `json:"handle"`
	Comment string              `json:"comment,omitempty"`
	Expr    json.RawMessage     `json:"expr"`
	Packets string              `json:"packets,omitempty"`
	Bytes   string              `json:"bytes,omitempty"`
	Targets []firewallMapTarget `json:"targets"`
}

type firewallMapChain struct {
	ID       string            `json:"id"`
	Family   string            `json:"family"`
	Table    string            `json:"table"`
	Name     string            `json:"name"`
	Type     string            `json:"type,omitempty"`
	Hook     string            `json:"hook,omitempty"`
	Priority *int64            `json:"priority"`
	Policy   string            `json:"policy,omitempty"`
	Rules    []firewallMapRule `json:"rules"`
}

type firewallMapSnapshot struct {
	OK         bool               `json:"ok"`
	Available  bool               `json:"available"`
	Backend    string             `json:"backend"`
	CapturedAt string             `json:"capturedAt"`
	Error      string             `json:"error,omitempty"`
	Tables     int                `json:"tables"`
	RuleCount  int                `json:"ruleCount"`
	SetCount   int                `json:"setCount"`
	Flowtables int                `json:"flowtables"`
	Chains     []firewallMapChain `json:"chains"`
}

func firewallMapChainID(family, table, chain string) string {
	return base64.RawURLEncoding.EncodeToString([]byte(family + "\x00" + table + "\x00" + chain))
}

// Bounded output is discarded after the limit; the subprocess is also timed out.
type firewallMapOutput struct {
	buffer   bytes.Buffer
	limit    int
	exceeded bool
}

func (b *firewallMapOutput) Write(p []byte) (int, error) {
	n := len(p)
	remaining := b.limit - b.buffer.Len()
	if len(p) > remaining {
		b.exceeded = true
		p = p[:remaining]
	}
	_, _ = b.buffer.Write(p)
	return n, nil
}

func readFirewallMap() ([]byte, error) {
	if runtime.GOOS != "linux" {
		return nil, exec.ErrNotFound
	}
	ctx, cancel := context.WithTimeout(context.Background(), 6*time.Second)
	defer cancel()
	// Listing only: terse omits potentially huge set contents, not counters.
	cmd := exec.CommandContext(ctx, "nft", "-j", "-a", "-t", "-n", "-y", "list", "ruleset")
	cmd.WaitDelay = time.Second
	stdout := &firewallMapOutput{limit: firewallMapMaxBytes}
	stderr := &firewallMapOutput{limit: 16 << 10}
	cmd.Stdout, cmd.Stderr = stdout, stderr
	err := cmd.Run()
	if ctx.Err() != nil {
		return nil, fmt.Errorf("Чтение nftables превысило лимит времени")
	}
	if stdout.exceeded {
		return nil, fmt.Errorf("Снимок nftables превышает 8 МиБ; частичная карта не показана")
	}
	if err != nil {
		return nil, fmt.Errorf("Не удалось прочитать nftables в JSON: %w", err)
	}
	return stdout.buffer.Bytes(), nil
}

func (s *serverState) firewallMap() *firewallMapSnapshot {
	return s.firewallMapWithReader(readFirewallMap)
}

func (s *serverState) firewallMapWithReader(read func() ([]byte, error)) *firewallMapSnapshot {
	s.firewallMapMu.Lock()
	defer s.firewallMapMu.Unlock()
	if s.firewallMapCache != nil && time.Since(s.firewallMapAt) < 3*time.Second {
		return s.firewallMapCache
	}
	body, err := read()
	var result *firewallMapSnapshot
	if err == nil {
		result, err = parseFirewallMap(body)
	}
	if err != nil {
		result = &firewallMapSnapshot{Backend: "nftables", Available: !errors.Is(err, exec.ErrNotFound), Error: err.Error(), Chains: []firewallMapChain{}}
		if !result.Available {
			result.Error = "Для карты нужен nftables с поддержкой JSON на роутере"
		}
	}
	result.CapturedAt = time.Now().UTC().Format(time.RFC3339)
	s.firewallMapCache, s.firewallMapAt = result, time.Now()
	return result
}

func parseFirewallMap(body []byte) (*firewallMapSnapshot, error) {
	if len(body) > firewallMapMaxBytes {
		return nil, fmt.Errorf("Снимок nftables превышает 8 МиБ")
	}
	var root struct {
		Nftables json.RawMessage `json:"nftables"`
	}
	if err := json.Unmarshal(body, &root); err != nil || len(bytes.TrimSpace(root.Nftables)) == 0 || bytes.TrimSpace(root.Nftables)[0] != '[' {
		return nil, fmt.Errorf("nftables не вернул корректный JSON-снимок")
	}
	var entries []map[string]json.RawMessage
	if err := json.Unmarshal(root.Nftables, &entries); err != nil {
		return nil, fmt.Errorf("Не удалось разобрать объекты nftables")
	}
	result := &firewallMapSnapshot{OK: true, Available: true, Backend: "nftables", Chains: []firewallMapChain{}}
	index := map[string]int{}
	for _, entry := range entries {
		if _, ok := entry["table"]; ok {
			result.Tables++
		}
		if _, ok := entry["set"]; ok {
			result.SetCount++
		}
		if _, ok := entry["map"]; ok {
			result.SetCount++
		}
		if _, ok := entry["flowtable"]; ok {
			result.Flowtables++
		}
		raw, ok := entry["chain"]
		if !ok {
			continue
		}
		var chain struct {
			Family string          `json:"family"`
			Table  string          `json:"table"`
			Name   string          `json:"name"`
			Type   string          `json:"type"`
			Hook   string          `json:"hook"`
			Policy string          `json:"policy"`
			Prio   json.RawMessage `json:"prio"`
		}
		if json.Unmarshal(raw, &chain) != nil || chain.Family == "" || chain.Table == "" || chain.Name == "" {
			return nil, fmt.Errorf("Некорректная цепочка nftables; частичная карта не показана")
		}
		id := firewallMapChainID(chain.Family, chain.Table, chain.Name)
		if _, exists := index[id]; exists {
			return nil, fmt.Errorf("Повторяющаяся цепочка nftables")
		}
		if len(index) >= firewallMapMaxChains {
			return nil, fmt.Errorf("Слишком много цепочек nftables для карты")
		}
		var priority *int64
		if n, err := strconv.ParseInt(string(chain.Prio), 10, 64); err == nil {
			priority = &n
		}
		index[id] = len(result.Chains)
		result.Chains = append(result.Chains, firewallMapChain{ID: id, Family: chain.Family, Table: chain.Table, Name: chain.Name, Type: chain.Type, Hook: chain.Hook, Priority: priority, Policy: chain.Policy, Rules: []firewallMapRule{}})
	}
	for _, entry := range entries {
		raw, ok := entry["rule"]
		if !ok {
			continue
		}
		var rule struct {
			Family  string          `json:"family"`
			Table   string          `json:"table"`
			Chain   string          `json:"chain"`
			Handle  json.RawMessage `json:"handle"`
			Comment string          `json:"comment"`
			Expr    json.RawMessage `json:"expr"`
		}
		if json.Unmarshal(raw, &rule) != nil {
			return nil, fmt.Errorf("Некорректное правило nftables")
		}
		ci, exists := index[firewallMapChainID(rule.Family, rule.Table, rule.Chain)]
		if !exists {
			return nil, fmt.Errorf("Правило ссылается на отсутствующую цепочку; обновите снимок")
		}
		if result.RuleCount >= firewallMapMaxRules {
			return nil, fmt.Errorf("Слишком много правил nftables для карты")
		}
		if len(rule.Expr) > 128<<10 {
			return nil, fmt.Errorf("Выражение nftables слишком велико для карты")
		}
		var expressions []map[string]any
		decoder := json.NewDecoder(bytes.NewReader(rule.Expr))
		decoder.UseNumber()
		if decoder.Decode(&expressions) != nil || expressions == nil {
			return nil, fmt.Errorf("Некорректные выражения правила nftables")
		}
		item := firewallMapRule{Handle: string(rule.Handle), Comment: rule.Comment, Expr: rule.Expr, Targets: []firewallMapTarget{}}
		for _, expr := range expressions {
			if counter, ok := expr["counter"].(map[string]any); ok {
				if n, ok := counter["packets"].(json.Number); ok {
					item.Packets = n.String()
				}
				if n, ok := counter["bytes"].(json.Number); ok {
					item.Bytes = n.String()
				}
			}
		}
		if err := firewallMapTargets(expressions, 0, func(kind, name string) {
			id := firewallMapChainID(rule.Family, rule.Table, name)
			_, exists := index[id]
			for _, target := range item.Targets {
				if target.ID == id && target.Kind == kind {
					return
				}
			}
			item.Targets = append(item.Targets, firewallMapTarget{Kind: kind, Name: name, ID: id, Exists: exists})
		}); err != nil {
			return nil, err
		}
		result.Chains[ci].Rules = append(result.Chains[ci].Rules, item)
		result.RuleCount++
	}
	return result, nil
}

func firewallMapTargets(value any, depth int, visit func(string, string)) error {
	if depth > 32 {
		return fmt.Errorf("Выражение nftables слишком вложено для карты")
	}
	switch node := value.(type) {
	case []map[string]any:
		for _, child := range node {
			if err := firewallMapTargets(child, depth+1, visit); err != nil {
				return err
			}
		}
	case []any:
		for _, child := range node {
			if err := firewallMapTargets(child, depth+1, visit); err != nil {
				return err
			}
		}
	case map[string]any:
		for key, child := range node {
			if key == "jump" || key == "goto" {
				if target, ok := child.(map[string]any); ok {
					if name, ok := target["target"].(string); ok {
						visit(key, name)
					}
				}
			}
			if err := firewallMapTargets(child, depth+1, visit); err != nil {
				return err
			}
		}
	}
	return nil
}
