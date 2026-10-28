package proxy

import (
	"encoding/base64"
	"encoding/json"
	"strings"
	"testing"
)

func FuzzShareImport(f *testing.F) {
	for _, seed := range []string{
		"", "vless://", "ss://YWVzLTEyOC1nY206dGVzdA@example.com:8388#demo",
		"vless://00000000-0000-0000-0000-000000000000@example.com:443?type=grpc&security=tls&serviceName=example#demo",
		"trojan://test@example.com:443?security=tls&sni=example.com",
		"vmess://" + base64.StdEncoding.EncodeToString([]byte(`{"v":"2","add":"example.com","port":"443","id":"00000000-0000-0000-0000-000000000000","net":"ws","tls":"tls"}`)),
	} {
		f.Add(seed)
	}
	f.Fuzz(func(t *testing.T, input string) {
		if len(input) > 16<<10 {
			t.Skip()
		}
		// Exercise raw and encoded subscription framing as well as individual
		// URI decoders. Nothing is dialed and generated credentials stay local.
		links := DecodeSubscription(input)
		for _, link := range append(links, input) {
			outbound, err := ParseShareLink(link)
			if err != nil {
				continue
			}
			if outbound == nil || outbound["protocol"] == nil {
				t.Fatal("successful import returned no protocol")
			}
			if body, err := json.Marshal(outbound); err != nil || !json.Valid(body) {
				t.Fatal("import cannot be represented as Xray JSON")
			}
			if body, err := json.Marshal(OutboundSummary(outbound)); err != nil || !json.Valid(body) {
				t.Fatal("import cannot be summarized")
			}
		}
		for _, link := range links {
			if !strings.Contains(link, "://") {
				t.Fatal("subscription returned an unframed URI")
			}
		}
	})
}
