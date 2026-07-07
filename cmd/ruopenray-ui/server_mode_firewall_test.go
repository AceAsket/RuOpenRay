package main

import (
	"strings"
	"testing"
)

func TestServerModeWANRulesBuildsXrayAndAWG(t *testing.T) {
	mode := defaultServerModeConfig()
	mode.Enabled = true
	mode.Xray = []serverModeXrayInbound{
		{ID: "public reality", Name: "Reality вход", Enabled: true, Port: 443, OpenFirewall: true},
		{ID: "closed", Name: "Закрытый вход", Enabled: true, Port: 8443, OpenFirewall: false},
	}
	mode.AWG = []serverModeAWGServer{
		{ID: "awg main", Name: "AWG вход", Enabled: true, ListenPort: 51820, OpenFirewall: true},
	}

	rules := serverModeWANRules(mode)
	if len(rules) != 2 {
		t.Fatalf("expected 2 WAN rules, got %d: %#v", len(rules), rules)
	}
	if rules[0].Protocol != "tcp" || rules[0].Port != 443 || rules[0].Kind != "xray" {
		t.Fatalf("unexpected xray rule: %#v", rules[0])
	}
	if rules[1].Protocol != "udp" || rules[1].Port != 51820 || rules[1].Kind != "awg" {
		t.Fatalf("unexpected awg rule: %#v", rules[1])
	}
	for _, rule := range rules {
		if !strings.HasPrefix(rule.Section, serverModeFirewallSectionPrefix) {
			t.Fatalf("section %q does not use managed prefix", rule.Section)
		}
	}
}

func TestParseServerModeFirewallRules(t *testing.T) {
	input := `
firewall.ruopenray_server_xray_public_443=rule
firewall.ruopenray_server_xray_public_443.name='RuOpenRay server-mode xray tcp 443'
firewall.ruopenray_server_xray_public_443.src='wan'
firewall.ruopenray_server_xray_public_443.proto='tcp'
firewall.ruopenray_server_xray_public_443.dest_port='443'
firewall.ruopenray_server_xray_public_443.target='ACCEPT'
firewall.ruopenray_server_xray_public_443.enabled='1'
firewall.not_ruopenray=rule
firewall.not_ruopenray.name='Other rule'
`
	rules := parseServerModeFirewallRules(input)
	if len(rules) != 1 {
		t.Fatalf("expected one managed firewall rule, got %d: %#v", len(rules), rules)
	}
	rule := rules[0]
	if rule["section"] != "ruopenray_server_xray_public_443" || rule["source"] != "wan" || rule["protocol"] != "tcp" || rule["port"] != "443" || rule["target"] != "ACCEPT" {
		t.Fatalf("unexpected parsed rule: %#v", rule)
	}
	if rule["enabled"] != true {
		t.Fatalf("expected enabled rule, got %#v", rule["enabled"])
	}
}

func TestServerModeFirewallCommandsUseOnlyManagedSections(t *testing.T) {
	rules := []serverModeWANRule{{
		Section:  "ruopenray_server_xray_public_443",
		Kind:     "xray",
		Name:     "Reality вход",
		Protocol: "tcp",
		Port:     443,
		Source:   "wan",
	}}
	commands := strings.Join(serverModeFirewallCommands(rules), "\n")
	if !strings.Contains(commands, "firewall\\.ruopenray_server_") {
		t.Fatalf("delete command must target only managed sections: %s", commands)
	}
	if strings.Contains(commands, "not_ruopenray") {
		t.Fatalf("commands should not mention unrelated firewall sections: %s", commands)
	}
	if !strings.Contains(commands, "uci set firewall.ruopenray_server_xray_public_443=rule") {
		t.Fatalf("missing managed UCI section create command: %s", commands)
	}
	if !strings.Contains(commands, "dest_port=443") || !strings.Contains(commands, "proto='tcp'") {
		t.Fatalf("missing port/proto commands: %s", commands)
	}
}
