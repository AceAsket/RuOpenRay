package proxy

import (
	"encoding/base64"
	"encoding/json"
	"strings"
	"testing"
)

func TestSubscriptionReportDoesNotHideFailuresOrSecrets(t *testing.T) {
	text := "trojan://secret@example.com:443#valid\ntrojan://secret@example.com:443?allowInsecure=true\nhysteria2://secret@example.com\nvless://secret@%invalid"
	for _, body := range []string{text, base64.StdEncoding.EncodeToString([]byte(text)), base64.RawURLEncoding.EncodeToString([]byte(text))} {
		outbounds, report := ParseSubscriptionEntries(SubscriptionEntries(body))
		if len(outbounds) != 1 || report.Total != 4 || report.Accepted != 1 || report.Skipped != 3 {
			t.Fatalf("%+v", report)
		}
		encoded, _ := json.Marshal(report)
		if strings.Contains(string(encoded), "secret") || strings.Contains(string(encoded), "example.com") {
			t.Fatal("report leaks URL")
		}
	}
}

func TestRemovedTLSAndUnsupportedParameters(t *testing.T) {
	for _, query := range []string{"insecure=1", "allowInsecure=true", "allowInsecure=false&insecure=true", "allowInsecure=false&allowInsecure=true", "insecure=maybe", "extra=%7B%7D", "fm=2", "type=kcp"} {
		if _, err := ParseShareLink("vless://id@example.com:443?" + query); err == nil {
			t.Errorf("silently accepted %s", query)
		}
	}
}

func TestSubscriptionPreservesNamesWithSpaces(t *testing.T) {
	raw := "# provider comment\r\n\r\nvless://00000000-0000-0000-0000-000000000000@example.test:443#Demo server EU 1\r\ntrojan://test@example.test:443#Demo server EU 2\r\n"
	for _, body := range []string{raw, base64.RawURLEncoding.EncodeToString([]byte(raw))} {
		outbounds, report := ParseSubscriptionEntries(SubscriptionEntries(body))
		if report.Total != 2 || report.Accepted != 2 || report.Skipped != 0 {
			t.Fatalf("%+v", report)
		}
		if outbounds[0]["tag"] != "Demo server EU 1" || outbounds[1]["tag"] != "Demo server EU 2" {
			t.Fatal("display names truncated")
		}
	}
}
