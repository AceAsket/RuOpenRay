package main

import "testing"

func TestRouterIPv4FromUbus(t *testing.T) {
	raw := `{"up":true,"ipv4-address":[{"address":"192.168.50.117","mask":24}]}`
	if got := routerIPv4FromUbus(raw); got != "192.168.50.117" {
		t.Fatalf("routerIPv4FromUbus() = %q", got)
	}
}

func TestRouterIPv4FromIPOutput(t *testing.T) {
	cases := []struct {
		name string
		raw  string
		want string
	}{
		{name: "address", raw: "8: br-lan inet 192.168.50.117/24 brd 192.168.50.255 scope global br-lan", want: "192.168.50.117"},
		{name: "route source", raw: "default via 192.168.50.1 dev br-lan proto static src 192.168.50.117", want: "192.168.50.117"},
		{name: "reject loopback", raw: "1: lo inet 127.0.0.1/8 scope host lo", want: ""},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := routerIPv4FromIPOutput(tc.raw); got != tc.want {
				t.Fatalf("routerIPv4FromIPOutput() = %q, want %q", got, tc.want)
			}
		})
	}
}
