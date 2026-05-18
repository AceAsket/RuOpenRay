package domainmon

import (
	"testing"
	"time"
)

func TestParseB4SNILines(t *testing.T) {
	devices := map[string]string{"192.168.1.190": "phone"}
	events := ParseB4SNILines("12:34:56.789,TCP,192.168.1.190:5555,1.1.1.1:443,telegram.org\n", devices)
	if len(events) != 1 {
		t.Fatalf("expected one event, got %d", len(events))
	}
	event := events[0]
	if event.Host != "telegram.org" || event.Protocol != "TCP" || event.SourceDevice != "phone" {
		t.Fatalf("unexpected event: %#v", event)
	}
	if event.SourceIP != "192.168.1.190" || event.SourcePort != "5555" || event.DestinationPort != "443" {
		t.Fatalf("unexpected addresses: %#v", event)
	}
}

func TestParseXrayDomainLines(t *testing.T) {
	content := "2026/05/18 12:00:01.123456 [Info] [proxy] app/dns: querying DNS for: telegram.org from tcp:192.168.1.190:53000\n" +
		"2026/05/18 12:00:02.123456 [Info] [proxy] proxy: tunneling request to tcp:chatgpt.com:443 from tcp:192.168.1.190:51234\n"
	devices := map[string]string{"192.168.1.190": "phone"}

	events := ParseXrayDomainLines(content, devices)
	if len(events) != 2 {
		t.Fatalf("expected two events, got %d: %#v", len(events), events)
	}
	if events[0].Host != "telegram.org" || events[0].Protocol != "DNS" || events[0].Outbound != "proxy" {
		t.Fatalf("unexpected DNS event: %#v", events[0])
	}
	if events[1].Host != "chatgpt.com" || events[1].Protocol != "TCP" || events[1].DestinationPort != "443" {
		t.Fatalf("unexpected TCP event: %#v", events[1])
	}
}

func TestAggregateDomainEvents(t *testing.T) {
	events := []Event{
		{Time: "12:00:00", Timestamp: time.Date(2026, 5, 18, 12, 0, 0, 0, time.Local).UnixNano(), Protocol: "TCP", Host: "telegram.org", SourceIP: "192.168.1.190", SourceDevice: "phone", Outbound: "proxy"},
		{Time: "12:01:00", Timestamp: time.Date(2026, 5, 18, 12, 1, 0, 0, time.Local).UnixNano(), Protocol: "UDP", Host: "telegram.org", SourceIP: "192.168.1.190", SourceDevice: "phone", Outbound: "proxy"},
	}
	aggregates := AggregateDomainEvents(events)
	if len(aggregates) != 1 {
		t.Fatalf("expected one aggregate, got %d", len(aggregates))
	}
	if aggregates[0].Hits != 2 || aggregates[0].TCP != 1 || aggregates[0].UDP != 1 {
		t.Fatalf("unexpected aggregate counters: %#v", aggregates[0])
	}
}
