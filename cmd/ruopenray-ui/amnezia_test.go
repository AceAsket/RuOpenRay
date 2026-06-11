package main

import (
	"encoding/base64"
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"testing"
)

func TestParseIPLinkInterfaces(t *testing.T) {
	text := `5: awg0: <POINTOPOINT,NOARP,UP,LOWER_UP> mtu 1420 qdisc noqueue state UNKNOWN mode DEFAULT group default qlen 1000
6: wg-home@if7: <POINTOPOINT,NOARP> mtu 1420 qdisc noqueue state DOWN mode DEFAULT group default qlen 1000`
	got := parseIPLinkInterfaces(text)
	if len(got) != 2 {
		t.Fatalf("expected 2 interfaces, got %d: %#v", len(got), got)
	}
	if got[0]["name"] != "awg0" || got[0]["up"] != true || got[0]["state"] != "UNKNOWN" {
		t.Fatalf("unexpected first interface: %#v", got[0])
	}
	if got[1]["name"] != "wg-home" || got[1]["up"] != false || got[1]["state"] != "DOWN" {
		t.Fatalf("unexpected second interface: %#v", got[1])
	}
}

func TestParseWGShowInterfaces(t *testing.T) {
	text := `interface: awg0
  public key: redacted
peer: abc

interface: wg1
  public key: redacted
interface: awg0`
	got := parseWGShowInterfaces(text)
	want := []string{"awg0", "wg1"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("interfaces mismatch: got %#v want %#v", got, want)
	}
}

func TestAmneziaServiceStatusTextRunning(t *testing.T) {
	cases := []struct {
		name string
		text string
		want bool
	}{
		{"running", "running", true},
		{"started", "service started", true},
		{"inactive wins", "inactive (dead)", false},
		{"stopped wins", "stopped", false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := amneziaServiceStatusTextRunning(tc.text); got != tc.want {
				t.Fatalf("got %v want %v for %q", got, tc.want, tc.text)
			}
		})
	}
}

func TestAmneziaInterfaceNameLooksRelevant(t *testing.T) {
	for _, name := range []string{"awg0", "wg-client", "home-amnezia"} {
		if !amneziaInterfaceNameLooksRelevant(name) {
			t.Fatalf("%q should look relevant", name)
		}
	}
	for _, name := range []string{"eth0", "br-lan", "tailscale0"} {
		if amneziaInterfaceNameLooksRelevant(name) {
			t.Fatalf("%q should not look relevant", name)
		}
	}
}

func TestParseAmneziaClientConfig(t *testing.T) {
	raw := `[Interface]
PrivateKey = private
Address = 10.8.0.2/32
DNS = 1.1.1.1
Jc = 4
Jmin = 40
Jmax = 70
S1 = 1
S3 = 3
H1 = 10
I1 = 64

[Peer]
PublicKey = public
PresharedKey = shared
Endpoint = vpn.example.com:443
AllowedIPs = 0.0.0.0/0`
	got := parseAmneziaClientConfig(raw)
	if len(got.errors) != 0 {
		t.Fatalf("unexpected errors: %#v", got.errors)
	}
	if got.iface["address"] != "10.8.0.2/32" {
		t.Fatalf("address = %#v", got.iface["address"])
	}
	if got.peer["endpoint"] != "vpn.example.com:443" {
		t.Fatalf("endpoint = %#v", got.peer["endpoint"])
	}
	if got.iface["hasPrivateKey"] != true || got.peer["hasPresharedKey"] != true {
		t.Fatalf("key flags not set: iface=%#v peer=%#v", got.iface, got.peer)
	}
	if len(got.awgOptions) < 4 {
		t.Fatalf("awg options not detected: %#v", got.awgOptions)
	}
	if !reflect.DeepEqual(got.awgOptions, []string{"H1", "I1", "Jc", "Jmax", "Jmin", "S1", "S3"}) {
		t.Fatalf("unexpected awg options: %#v", got.awgOptions)
	}
}

func TestParseAmneziaClientConfigValidation(t *testing.T) {
	got := parseAmneziaClientConfig(`[Interface]
Address = 10.8.0.2/32`)
	if len(got.errors) == 0 {
		t.Fatalf("expected validation errors")
	}
}

func TestParseAmneziaClientConfigPlainWireGuardWarning(t *testing.T) {
	raw := `[Interface]
PrivateKey = private
Address = 10.8.0.2/32

[Peer]
PublicKey = public
Endpoint = vpn.example.com:443
AllowedIPs = 0.0.0.0/0`
	got := parseAmneziaClientConfig(raw)
	if len(got.errors) != 0 {
		t.Fatalf("unexpected errors: %#v", got.errors)
	}
	if len(got.awgOptions) != 0 {
		t.Fatalf("plain WireGuard must not expose awg options: %#v", got.awgOptions)
	}
	if len(got.warnings) == 0 {
		t.Fatalf("expected plain WireGuard warning")
	}
}

func TestVersionAtLeast(t *testing.T) {
	cases := []struct {
		version string
		want    bool
	}{
		{"4.8.3-op24", false},
		{"4.9.0", true},
		{"4.10.1", true},
		{"5.0.0", true},
	}
	for _, tc := range cases {
		t.Run(tc.version, func(t *testing.T) {
			if got := versionAtLeast(tc.version, 4, 9); got != tc.want {
				t.Fatalf("got %v want %v", got, tc.want)
			}
		})
	}
}

func TestAmneziaProfileRegistryRoundTrip(t *testing.T) {
	state := &serverState{}
	state.cfg.DataDir = t.TempDir()
	raw := `[Interface]
PrivateKey = private
Address = 10.8.0.2/32
Jc = 4
Jmin = 40
Jmax = 70

[Peer]
PublicKey = public
Endpoint = vpn.example.com:443
AllowedIPs = 0.0.0.0/0`
	if err := state.saveAmneziaProfile(raw, "Test AWG", "", true); err != nil {
		t.Fatalf("save profile: %v", err)
	}
	profiles := state.amneziaProfiles()
	items, _ := profiles["items"].([]map[string]any)
	if len(items) != 1 {
		t.Fatalf("profiles = %#v", profiles)
	}
	if items[0]["name"] != "Test AWG" || items[0]["active"] != true {
		t.Fatalf("unexpected profile: %#v", items[0])
	}
	id := items[0]["id"].(string)
	rawLoaded, ok := state.loadAmneziaProfileConfig(id)
	if !ok || rawLoaded == "" {
		t.Fatalf("profile config not loaded")
	}
	if info, err := os.Stat(filepath.Join(state.amneziaProfilesDir(), id+".conf")); err != nil || (runtime.GOOS != "windows" && info.Mode().Perm() != 0o600) {
		t.Fatalf("profile file mode/stat = %#v %v", info, err)
	}
}

func TestAmneziaPreflightRejectsEmptyConfig(t *testing.T) {
	state := &serverState{}
	state.cfg.DataDir = t.TempDir()
	preflight := state.amneziaPreflightForConfig("")
	if preflight["ok"] == true {
		t.Fatalf("empty config must not pass preflight: %#v", preflight)
	}
}

func TestAmneziaLooksLikeWGKey(t *testing.T) {
	key := base64.StdEncoding.EncodeToString(make([]byte, 32))
	if !amneziaLooksLikeWGKey(key) {
		t.Fatalf("generated 32-byte base64 key should pass")
	}
	if amneziaLooksLikeWGKey("private") {
		t.Fatalf("plain text must not pass as WireGuard key")
	}
}

func TestAmneziaEndpointParts(t *testing.T) {
	cases := []struct {
		endpoint string
		host     string
		port     string
	}{
		{"vpn.example.com:443", "vpn.example.com", "443"},
		{"[2001:db8::1]:51820", "2001:db8::1", "51820"},
		{"vpn.example.com", "vpn.example.com", ""},
	}
	for _, tc := range cases {
		t.Run(tc.endpoint, func(t *testing.T) {
			host, port := amneziaEndpointParts(tc.endpoint)
			if host != tc.host || port != tc.port {
				t.Fatalf("got %q %q want %q %q", host, port, tc.host, tc.port)
			}
		})
	}
}
