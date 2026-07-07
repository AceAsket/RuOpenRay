package main

import (
	"fmt"
	"strings"
)

func (s *serverState) serverModeSecurity(payload map[string]any) map[string]any {
	mode, err := s.serverModePayloadOrStored(payload)
	if err != nil {
		return map[string]any{"ok": false, "error": err.Error()}
	}
	return serverModeSecurityReport(mode)
}

func serverModeSecurityReport(mode serverModeConfig) map[string]any {
	mode = normalizeServerModeConfig(mode)
	routerIPs := serverModeRouterIPs()
	clients := []map[string]any{}
	peers := []map[string]any{}
	warnings := []serverModeIssue{}
	totals := map[string]int{
		"xrayClients":  0,
		"awgPeers":     0,
		"managedRules": 0,
		"lanAllowed":   0,
		"dnsAllowed":   0,
		"routerOnly":   0,
		"highRisk":     0,
	}
	for _, inbound := range mode.Xray {
		for _, client := range inbound.Clients {
			row := serverModeClientPolicy(inbound, client, routerIPs)
			clients = append(clients, row)
			if row["enabled"] != true {
				continue
			}
			totals["xrayClients"]++
			totals["managedRules"] += int(numberAny(row["managedRules"]))
			if row["lan"] == "allowed" {
				totals["lanAllowed"]++
			}
			if row["dns"] == "allowed" {
				totals["dnsAllowed"]++
			}
			if row["router"] == "allowed" && row["lan"] != "allowed" {
				totals["routerOnly"]++
			}
			if row["risk"] == "high" {
				totals["highRisk"]++
				warnings = append(warnings, serverModeIssue{
					Severity: "warning",
					Title:    "Клиенту открыт LAN",
					Detail:   fmt.Sprintf("%s сможет обращаться к приватным адресам через router.", firstNonEmpty(client.Name, client.Email, client.ID)),
					Source:   "xray:" + inbound.ID + "/client:" + client.ID,
				})
			}
		}
	}
	for _, awg := range mode.AWG {
		for _, peer := range awg.Peers {
			row := serverModeAWGPeerPolicy(awg, peer)
			peers = append(peers, row)
			if row["enabled"] != true {
				continue
			}
			totals["awgPeers"]++
			if row["lan"] == "allowed" {
				totals["lanAllowed"]++
				totals["highRisk"]++
				warnings = append(warnings, serverModeIssue{
					Severity: "warning",
					Title:    "AWG peer получает LAN",
					Detail:   fmt.Sprintf("%s сможет обращаться к приватным адресам через router.", firstNonEmpty(peer.Name, peer.ID)),
					Source:   "awg:" + awg.ID + "/peer:" + peer.ID,
				})
			}
		}
	}
	return map[string]any{
		"ok":        true,
		"safe":      totals["highRisk"] == 0,
		"enabled":   mode.Enabled,
		"clients":   clients,
		"peers":     peers,
		"warnings":  warnings,
		"summary":   totals,
		"routerIps": stringsToAny(routerIPs),
	}
}

func serverModeClientPolicy(inbound serverModeXrayInbound, client serverModeClient, routerIPs []string) map[string]any {
	enabled := inbound.Enabled && client.Enabled
	lan := "blocked"
	router := "blocked"
	dns := "blocked"
	risk := "low"
	managedRules := 0
	if enabled {
		managedRules = 1
	}
	if client.AllowLAN {
		lan = "allowed"
		router = "allowed"
		risk = "high"
	} else {
		if enabled {
			managedRules++
		}
		if client.AllowRouter && len(routerIPs) > 0 {
			router = "allowed"
			if enabled {
				managedRules++
			}
			risk = "medium"
		}
	}
	if client.AllowDNS {
		dns = "allowed"
		if risk == "low" {
			risk = "medium"
		}
	} else if enabled {
		managedRules++
	}
	return map[string]any{
		"kind":         "xray",
		"inboundId":    inbound.ID,
		"inboundName":  inbound.Name,
		"clientId":     client.ID,
		"name":         firstNonEmpty(client.Name, client.Email, client.ID),
		"email":        client.Email,
		"enabled":      enabled,
		"egressTag":    firstNonEmpty(client.EgressTag, "direct"),
		"lan":          lan,
		"router":       router,
		"dns":          dns,
		"risk":         risk,
		"managedRules": managedRules,
	}
}

func serverModeAWGPeerPolicy(awg serverModeAWGServer, peer serverModeAWGPeer) map[string]any {
	enabled := awg.Enabled && peer.Enabled
	lan := "blocked"
	risk := "low"
	if awg.AllowLAN {
		lan = "allowed"
		risk = "high"
	}
	return map[string]any{
		"kind":         "awg",
		"serverId":     awg.ID,
		"serverName":   awg.Name,
		"peerId":       peer.ID,
		"name":         firstNonEmpty(peer.Name, peer.ID),
		"enabled":      enabled,
		"egressTag":    firstNonEmpty(awg.EgressTag, "direct"),
		"lan":          lan,
		"router":       lan,
		"dns":          "by-client",
		"risk":         risk,
		"allowedIps":   strings.TrimSpace(peer.AllowedIPs),
		"managedRules": 0,
	}
}
