package firewall

import (
	"reflect"
	"strings"
	"testing"
)

func TestPortList(t *testing.T) {
	tests := []struct {
		name    string
		payload map[string]any
		want    []string
	}{
		{
			name:    "default ports",
			payload: map[string]any{},
			want:    []string{"80", "443"},
		},
		{
			name: "all ports",
			payload: map[string]any{
				"portMode": "all",
				"ports":    []any{"80", "443"},
			},
			want: []string{},
		},
		{
			name: "clean custom ports",
			payload: map[string]any{
				"ports": []any{"80", "443", "1000:2000", "bad"},
			},
			want: []string{"80", "443", "1000-2000"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := PortList(tt.payload); !reflect.DeepEqual(got, tt.want) {
				t.Fatalf("PortList() = %#v, want %#v", got, tt.want)
			}
		})
	}
}

func TestNativeNftTProxy(t *testing.T) {
	body, meta := NativeNft(map[string]any{
		"routerMode":      "tproxy",
		"lanInterface":    "br-lan",
		"transparentPort": "52345",
		"ports":           []any{"80", "443"},
	})
	if !strings.Contains(body, "tproxy ip to :52345") {
		t.Fatalf("nft body does not contain tproxy rule:\n%s", body)
	}
	if meta["routerMode"] != "tproxy" {
		t.Fatalf("routerMode = %#v, want tproxy", meta["routerMode"])
	}
}

func TestStepOKAllowsMissingDeletes(t *testing.T) {
	if !StepOK(map[string]any{"ok": false, "stderr": "No such file or directory"}) {
		t.Fatal("StepOK should allow idempotent missing-file errors")
	}
	if StepOK(map[string]any{"ok": false, "stderr": "Error: syntax error"}) {
		t.Fatal("StepOK should reject real nft syntax errors")
	}
}
