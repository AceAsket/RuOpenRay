package main

import (
	"strings"
	"testing"
)

func TestServerModeAWGRuntimeMetadataQuotesValues(t *testing.T) {
	metadata := serverModeAWGRuntimeMetadata(serverModeAWGServer{
		Interface:   "awg-server0",
		AddressCIDR: "10.70.0.1/24",
	}, "/etc/ruopenray/server mode/server.setconf", 1420)
	for _, expected := range []string{
		"INTERFACE='awg-server0'",
		"ADDRESS='10.70.0.1/24'",
		"MTU='1420'",
		"SETCONF='/etc/ruopenray/server mode/server.setconf'",
	} {
		if !strings.Contains(metadata, expected) {
			t.Fatalf("metadata does not contain %q:\n%s", expected, metadata)
		}
	}
}

func TestServerModeAWGServiceScriptUsesOnlyNativeBackend(t *testing.T) {
	script := serverModeAWGServiceScript("/etc/ruopenray/server-mode/awg")
	for _, expected := range []string{
		`type amneziawg`,
		`awg setconf "$INTERFACE" "$SETCONF"`,
		`ip addr replace "$ADDRESS" dev "$INTERFACE"`,
		`return 0`,
	} {
		if !strings.Contains(script, expected) {
			t.Fatalf("service script does not contain %q:\n%s", expected, script)
		}
	}
	if strings.Contains(script, "type wireguard") {
		t.Fatalf("service script must not silently fall back to WireGuard:\n%s", script)
	}
}

func TestServerModeAWGFirewallSectionsAreManagedAndStable(t *testing.T) {
	awg := serverModeAWGServer{ID: "Office / Main"}
	zone := serverModeAWGFirewallSection(awg, "zone")
	wan := serverModeAWGFirewallSection(awg, "wan")
	if zone != "ruopenray_awg_zone_office_main" {
		t.Fatalf("unexpected zone section: %s", zone)
	}
	if wan != "ruopenray_awg_wan_office_main" {
		t.Fatalf("unexpected wan section: %s", wan)
	}
	if zone == wan {
		t.Fatal("zone and forwarding sections must differ")
	}
}

func TestServerModeAWGFirewallACLsArePerPeer(t *testing.T) {
	awg := serverModeAWGServer{
		ID: "office",
		Peers: []serverModeAWGPeer{
			{ID: "admin", Enabled: true, AllowedIPs: "10.70.0.2/32", AllowLAN: true, AllowRouter: true},
			{ID: "ssh", Enabled: true, AllowedIPs: "10.70.0.3/32", LANAllowedIPs: "192.168.50.20/32", LANAllowedPorts: "22", LANProtocol: "tcp", AllowDNS: true},
		},
	}
	acls := serverModeAWGFirewallACLs(awg, []string{"192.168.50.117"})
	if len(acls) != 5 {
		t.Fatalf("expected admin LAN/router/DNS deny plus limited LAN/DNS ACLs, got %#v", acls)
	}
	if acls[0].DestZone != "lan" || acls[0].SourceIPs[0] != "10.70.0.2/32" {
		t.Fatalf("full LAN ACL must be scoped to admin peer: %#v", acls[0])
	}
	limited := acls[3]
	if limited.DestZone != "lan" || limited.DestIPs[0] != "192.168.50.20/32" || limited.Ports != "22" || limited.Protocol != "tcp" {
		t.Fatalf("limited peer ACL is invalid: %#v", limited)
	}
	if acls[4].Ports != "53" || acls[4].DestIPs[0] != "192.168.50.117" {
		t.Fatalf("DNS-only router ACL is invalid: %#v", acls[4])
	}
}

func TestServerModeAWGFirewallInventoryFindsStaleZone(t *testing.T) {
	output := "firewall.ruopenray_awg_zone_audit=zone\nfirewall.ruopenray_awg_zone_audit.name='ruopenray_awg_zone_audit'\n"
	inventory := serverModeAWGFirewallInventory(serverModeConfig{Enabled: false}, output, nil)
	stale := inventory["stale"].([]string)
	if len(stale) != 1 || stale[0] != "ruopenray_awg_zone_audit" || inventory["healthy"] == true {
		t.Fatalf("stale managed zone was not detected: %#v", inventory)
	}
}

func TestServerModeAWGEnabledCount(t *testing.T) {
	mode := serverModeConfig{Enabled: true, AWG: []serverModeAWGServer{{Enabled: true}, {Enabled: false}, {Enabled: true}}}
	if got := serverModeAWGEnabledCount(mode); got != 2 {
		t.Fatalf("enabled AWG count = %d", got)
	}
	mode.Enabled = false
	if got := serverModeAWGEnabledCount(mode); got != 0 {
		t.Fatalf("disabled server mode must have zero enabled runtimes, got %d", got)
	}
}

func TestServerModeFirewallRestoreCommandQuotesBackupPath(t *testing.T) {
	command := serverModeFirewallRestoreCommand("/etc/ruopenray-ui/backups/server mode's firewall.uci")
	if !strings.Contains(command, `'/etc/ruopenray-ui/backups/server mode'\''s firewall.uci'`) {
		t.Fatalf("backup path is not shell quoted: %s", command)
	}
}

func TestServerModeAWGConfiguredNetworkConflicts(t *testing.T) {
	mode := serverModeConfig{Enabled: true, AWG: []serverModeAWGServer{
		{ID: "one", Enabled: true, AddressCIDR: "10.70.0.1/24"},
		{ID: "two", Enabled: true, AddressCIDR: "10.70.0.129/25"},
	}}
	issues := serverModeAWGConfiguredNetworkConflicts(mode)
	if len(issues) != 1 || issues[0].Title != "Пересекающиеся подсети AWG" {
		t.Fatalf("expected AWG subnet conflict, got %#v", issues)
	}
}

func TestServerModeAWGRouteConflictsAndIgnoresOwnedInterface(t *testing.T) {
	mode := serverModeConfig{Enabled: true, AWG: []serverModeAWGServer{{
		ID: "one", Enabled: true, Interface: "awg-server0", AddressCIDR: "192.168.50.1/24",
	}}}
	routes := "default via 192.168.50.1 dev br-lan\n192.168.50.0/24 dev br-lan proto kernel\n10.70.0.0/24 dev awg-server0 proto kernel\n"
	issues := serverModeAWGRouteConflicts(mode, routes, map[string]bool{"awg-server0": true})
	if len(issues) != 1 || !strings.Contains(issues[0].Detail, "br-lan") {
		t.Fatalf("expected LAN route conflict, got %#v", issues)
	}

	mode.AWG[0].AddressCIDR = "10.70.0.1/24"
	issues = serverModeAWGRouteConflicts(mode, routes, map[string]bool{"awg-server0": true})
	if len(issues) != 0 {
		t.Fatalf("owned AWG route must be ignored, got %#v", issues)
	}
}
