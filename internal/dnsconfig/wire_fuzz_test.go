package dnsconfig

import (
	"net"
	"testing"
)

func FuzzDNSWireAnswers(f *testing.F) {
	f.Add([]byte{}, false)
	f.Add([]byte{0, 1, 0x81, 0x80, 0, 1, 0, 1, 0, 0, 0, 0, 0xc0, 0x0c}, false)
	for _, qtype := range []uint16{1, 28} {
		query, err := dnsWireQuery("example.com", qtype)
		if err != nil {
			f.Fatal(err)
		}
		f.Add(benchmarkAnswer(query), qtype == 28)
	}
	f.Fuzz(func(t *testing.T, packet []byte, ipv6 bool) {
		if len(packet) > 65535 {
			t.Skip()
		}
		qtype := uint16(1)
		if ipv6 {
			qtype = 28
		}
		answers, err := parseDNSWireAnswers(packet, qtype)
		if err != nil {
			return
		}
		for _, answer := range answers {
			ip := net.ParseIP(answer)
			if ip == nil || !ipv6 && ip.To4() == nil {
				t.Fatal("accepted malformed address from DNS packet")
			}
		}
	})
}
