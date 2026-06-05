package main

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestDiagnosticsPackageContainsRedactedConfig(t *testing.T) {
	dir := t.TempDir()
	active := filepath.Join(dir, "config.json")
	if err := os.WriteFile(active, []byte(`{
  "outbounds": [
    {
      "tag": "secret-server",
      "protocol": "vless",
      "settings": {
        "vnext": [{
          "address": "vpn.example.test",
          "users": [{"id": "97e4c10c-4579-42d0-8a95-5d5e3c9a1111"}]
        }]
      },
      "streamSettings": {
        "realitySettings": {
          "serverName": "masked.example.test",
          "privateKey": "very-secret-private-key"
        }
      }
    },
    {"tag": "direct", "protocol": "freedom"}
  ],
  "routing": {
    "rules": [{"type": "field", "domain": ["domain:example.com"], "outboundTag": "secret-server"}]
  }
}`), 0o600); err != nil {
		t.Fatalf("write active config: %v", err)
	}
	state := &serverState{cfg: appConfig{
		DataDir:      dir,
		BackupDir:    filepath.Join(dir, "backup"),
		GeoDir:       filepath.Join(dir, "geo"),
		ActiveConfig: active,
		ServiceName:  "xray",
	}}
	var buffer bytes.Buffer
	if err := state.buildDiagnosticsPackage(&buffer); err != nil {
		t.Fatalf("buildDiagnosticsPackage returned error: %v", err)
	}
	files := readDiagnosticsArchive(t, buffer.Bytes())
	config := files["config/active-anonymized.json"]
	if !strings.Contains(config, `"tag": "proxy-1"`) {
		t.Fatalf("anonymized config did not rename proxy tag: %s", config)
	}
	for _, secret := range []string{"secret-server", "vpn.example.test", "97e4c10c-4579-42d0-8a95-5d5e3c9a1111", "very-secret-private-key", "masked.example.test"} {
		if strings.Contains(config, secret) {
			t.Fatalf("anonymized config contains secret %q: %s", secret, config)
		}
	}
}

func readDiagnosticsArchive(t *testing.T, body []byte) map[string]string {
	t.Helper()
	gz, err := gzip.NewReader(bytes.NewReader(body))
	if err != nil {
		t.Fatalf("open gzip: %v", err)
	}
	defer gz.Close()
	tr := tar.NewReader(gz)
	files := map[string]string{}
	for {
		header, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			t.Fatalf("read tar: %v", err)
		}
		content, err := io.ReadAll(tr)
		if err != nil {
			t.Fatalf("read %s: %v", header.Name, err)
		}
		files[header.Name] = string(content)
	}
	return files
}
