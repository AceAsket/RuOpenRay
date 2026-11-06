package main

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os/exec"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

const firewallMapFixture = `{"nftables":[
 {"table":{"family":"inet","name":"fixture"}},
 {"chain":{"family":"inet","table":"fixture","name":"entry","hook":"prerouting","prio":-155,"policy":"accept","type":"filter"}},
 {"rule":{"family":"inet","table":"fixture","chain":"entry","handle":12,"expr":[{"counter":{"packets":9007199254740993,"bytes":18446744073709551615}},{"jump":{"target":"child"}}],"comment":"first"}},
 {"rule":{"family":"inet","table":"fixture","chain":"entry","handle":4,"expr":[{"vmap":{"key":{"meta":{"key":"l4proto"}},"data":{"set":[["tcp",{"goto":{"target":"child"}}],["udp",{"jump":{"target":"missing"}}]]}}}]}},
 {"chain":{"family":"inet","table":"fixture","name":"child"}},
 {"chain":{"family":"ip6","table":"fixture","name":"entry","hook":"output","prio":0}},
 {"rule":{"family":"inet","table":"fixture","chain":"child","handle":19,"expr":[{"tproxy":{"family":"ip","port":12345}},{"accept":null}]}},
 {"set":{"family":"inet","table":"fixture","name":"large","elem":["never-forward-set-members"]}},
 {"flowtable":{"family":"inet","table":"fixture","name":"ft"}}
 ]}`

func TestFirewallMapPreservesRuleOrderCountersAndScopedTargets(t *testing.T) {
	x, err := parseFirewallMap([]byte(firewallMapFixture))
	if err != nil {
		t.Fatal(err)
	}
	if !x.OK || len(x.Chains) != 3 || x.RuleCount != 3 || x.Tables != 1 || x.SetCount != 1 || x.Flowtables != 1 {
		t.Fatalf("bad snapshot: %#v", x)
	}
	c := x.Chains[0]
	if c.Priority == nil || *c.Priority != -155 || c.Rules[0].Handle != "12" || c.Rules[1].Handle != "4" {
		t.Fatal("kernel order or priority was lost")
	}
	if c.Rules[0].Packets != "9007199254740993" || c.Rules[0].Bytes != "18446744073709551615" {
		t.Fatal("counters lost precision")
	}
	if len(c.Rules[0].Targets) != 1 || c.Rules[0].Targets[0].ID != x.Chains[1].ID || !c.Rules[0].Targets[0].Exists {
		t.Fatal("jump was not resolved")
	}
	if len(c.Rules[1].Targets) != 2 {
		t.Fatal("vmap targets were lost")
	}
	for _, target := range c.Rules[1].Targets {
		if target.Exists != (target.Name == "child") {
			t.Fatal("missing chain claimed present")
		}
	}
	if x.Chains[0].ID == x.Chains[2].ID || firewallMapChainID("inet", "a:b", "c") == firewallMapChainID("inet", "a", "b:c") {
		t.Fatal("chain ID collision")
	}
	b, _ := json.Marshal(x)
	if strings.Contains(string(b), "never-forward-set-members") {
		t.Fatal("set contents were forwarded")
	}
}

func TestFirewallMapRejectsPartialAndMalformedSnapshots(t *testing.T) {
	for _, body := range []string{"", `{}`, `{"nftables":null}`, `{"nftables":{}}`, `{"nftables":[{"chain":{"family":"inet"}}]}`, `{"nftables":[{"rule":{"family":"inet","table":"x","chain":"missing","expr":[]}}]}`} {
		if _, err := parseFirewallMap([]byte(body)); err == nil {
			t.Fatalf("accepted %s", body)
		}
	}
	x, err := parseFirewallMap([]byte(`{"nftables":[]}`))
	if err != nil || !x.OK || x.Chains == nil {
		t.Fatal("empty ruleset must be a valid empty map")
	}
	if _, err := parseFirewallMap(make([]byte, firewallMapMaxBytes+1)); err == nil {
		t.Fatal("oversized snapshot accepted")
	}
}

type firewallMapReaderOnly struct{ io.Reader }

func TestFirewallMapOutputLimitAppliesToIOCopy(t *testing.T) {
	b := &firewallMapOutput{limit: 7}
	n, err := io.Copy(b, firewallMapReaderOnly{strings.NewReader(strings.Repeat("x", 100))})
	if err != nil || n != 100 || !b.exceeded || b.buffer.Len() != 7 {
		t.Fatalf("output limit bypassed: %d %v %#v", n, err, b)
	}
	if _, err := b.Write([]byte("more")); err != nil || b.buffer.Len() != 7 {
		t.Fatal("output grew past limit")
	}
}

func TestFirewallMapConcurrentReadsAreCoalescedAndDoNotTakeMutationLock(t *testing.T) {
	s := reliabilityState(t)
	unlock, err := s.beginMutation()
	if err != nil {
		t.Fatal(err)
	}
	defer unlock()
	var calls atomic.Int32
	read := func() ([]byte, error) { calls.Add(1); return []byte(firewallMapFixture), nil }
	var wg sync.WaitGroup
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if !s.firewallMapWithReader(read).OK {
				t.Error("read failed")
			}
		}()
	}
	wg.Wait()
	if calls.Load() != 1 {
		t.Fatal("parallel readers repeatedly executed nft")
	}
	s.firewallMapAt = time.Now().Add(-4 * time.Second)
	if !s.firewallMapWithReader(read).OK || calls.Load() != 2 {
		t.Fatal("expired snapshot was not refreshed")
	}
}

func TestFirewallMapAPIRequiresAuthAndRefusesWrites(t *testing.T) {
	s := reliabilityState(t)
	s.addSession("fixture")
	s.firewallMapCache, _ = parseFirewallMap([]byte(firewallMapFixture))
	s.firewallMapAt = time.Now()
	for _, tc := range []struct {
		method, token string
		code          int
	}{{"GET", "", 401}, {"GET", "fixture", 200}, {"POST", "fixture", 405}, {"DELETE", "fixture", 405}} {
		r := httptest.NewRequest(tc.method, "/api/firewall/map", nil)
		if tc.token != "" {
			r.Header.Set("Authorization", "Bearer "+tc.token)
		}
		w := httptest.NewRecorder()
		s.handleAPI(w, r)
		if w.Code != tc.code {
			t.Fatalf("%s %s: %d %s", tc.method, tc.token, w.Code, w.Body.String())
		}
		if tc.code == http.StatusMethodNotAllowed && w.Header().Get("Allow") != "GET" {
			t.Fatal("missing read-only method declaration")
		}
	}
}

func TestFirewallMapMissingToolReturnsNoInventedTopology(t *testing.T) {
	s := &serverState{}
	x := s.firewallMapWithReader(func() ([]byte, error) { return nil, exec.ErrNotFound })
	if x.OK || x.Available || len(x.Chains) != 0 || x.Error == "" {
		t.Fatalf("invented map: %#v", x)
	}
}
