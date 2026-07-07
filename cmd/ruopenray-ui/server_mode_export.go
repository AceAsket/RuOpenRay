package main

import (
	"encoding/json"
	"fmt"
	"net"
	"net/url"
	"regexp"
	"strings"
)

type serverModeClientExport struct {
	OK       bool           `json:"ok"`
	URI      string         `json:"uri"`
	Outbound map[string]any `json:"outbound"`
	Filename string         `json:"filename"`
	Host     string         `json:"host"`
	Warnings []string       `json:"warnings,omitempty"`
	Error    string         `json:"error,omitempty"`
}

func (s *serverState) serverModeClientExport(payload map[string]any) map[string]any {
	export := s.buildServerModeClientExport(payload)
	body, _ := json.Marshal(export)
	var out map[string]any
	if err := json.Unmarshal(body, &out); err != nil {
		return map[string]any{"ok": false, "error": err.Error()}
	}
	return out
}

func (s *serverState) buildServerModeClientExport(payload map[string]any) serverModeClientExport {
	mode, err := s.serverModePayloadOrStored(payload)
	if err != nil {
		return serverModeClientExport{OK: false, Error: err.Error()}
	}
	inboundID := cleanPayloadString(payload, "inboundId")
	clientID := cleanPayloadString(payload, "clientId")
	inbound, client, ok := findServerModeXrayClient(mode, inboundID, clientID)
	if !ok {
		return serverModeClientExport{OK: false, Error: "server-mode client not found"}
	}
	host := serverModeExportHost(firstNonEmpty(cleanPayloadString(payload, "host"), inbound.PublicHost), inbound.Listen)
	warnings := serverModeExportWarnings(inbound, client, host)
	outbound := serverModeClientOutbound(inbound, client, host)
	uri := serverModeClientURI(inbound, client, host)
	filename := serverModeExportFilename(firstNonEmpty(client.Name, client.Email, client.ID, "ruopenray-client")) + ".json"
	return serverModeClientExport{
		OK:       true,
		URI:      uri,
		Outbound: outbound,
		Filename: filename,
		Host:     host,
		Warnings: warnings,
	}
}

func findServerModeXrayClient(mode serverModeConfig, inboundID, clientID string) (serverModeXrayInbound, serverModeClient, bool) {
	for _, inbound := range mode.Xray {
		if inboundID != "" && inbound.ID != inboundID {
			continue
		}
		for _, client := range inbound.Clients {
			if clientID != "" && client.ID != clientID {
				continue
			}
			return inbound, client, true
		}
	}
	return serverModeXrayInbound{}, serverModeClient{}, false
}

func serverModeExportHost(host, listen string) string {
	host = strings.TrimSpace(host)
	if host != "" {
		return serverModeCleanHost(host)
	}
	listen = strings.TrimSpace(listen)
	if listen != "" && listen != "0.0.0.0" && listen != "::" && listen != "::0" {
		return serverModeCleanHost(listen)
	}
	if router := strings.TrimSpace(routerLANAddress()); router != "" && router != "<nil>" {
		return router
	}
	return "example.com"
}

func serverModeCleanHost(value string) string {
	clean := strings.TrimSpace(value)
	if strings.Contains(clean, "://") {
		if parsed, err := url.Parse(clean); err == nil && parsed.Host != "" {
			clean = parsed.Host
		}
	}
	clean = strings.TrimSpace(strings.Split(clean, "/")[0])
	if host, _, err := net.SplitHostPort(clean); err == nil && host != "" {
		clean = host
	}
	return strings.Trim(clean, "[]")
}

func serverModeExportWarnings(inbound serverModeXrayInbound, client serverModeClient, host string) []string {
	warnings := []string{}
	if serverModeExportHostNeedsReview(host) {
		warnings = append(warnings, "перед отправкой клиенту укажите публичный домен или WAN IP")
	}
	if strings.EqualFold(inbound.Security, "reality") && strings.TrimSpace(inbound.Reality.PublicKey) == "" {
		warnings = append(warnings, "Reality publicKey пустой: сгенерируйте пару ключей или вставьте public key во вход")
	}
	if strings.TrimSpace(client.UUID) == "" {
		warnings = append(warnings, "UUID клиента пустой")
	}
	if inbound.OpenFirewall != true {
		warnings = append(warnings, "WAN firewall не отмечен для этого входа")
	}
	return warnings
}

func serverModeExportHostNeedsReview(host string) bool {
	clean := strings.Trim(strings.ToLower(strings.TrimSpace(host)), "[]")
	if clean == "" || clean == "example.com" || clean == "localhost" {
		return true
	}
	if ip := net.ParseIP(clean); ip != nil {
		return ip.IsUnspecified() || ip.IsLoopback() || ip.IsPrivate()
	}
	return false
}

func serverModeClientOutbound(inbound serverModeXrayInbound, client serverModeClient, host string) map[string]any {
	user := map[string]any{
		"id":         client.UUID,
		"encryption": "none",
		"level":      client.Level,
	}
	if client.Flow != "" {
		user["flow"] = client.Flow
	}
	stream := map[string]any{
		"network": firstNonEmpty(inbound.Network, "tcp"),
	}
	switch strings.ToLower(inbound.Security) {
	case "reality":
		stream["security"] = "reality"
		stream["realitySettings"] = map[string]any{
			"serverName":  firstServerModeSNI(inbound),
			"fingerprint": "chrome",
			"publicKey":   inbound.Reality.PublicKey,
			"shortId":     firstServerModeShortID(inbound),
			"spiderX":     "/",
		}
	case "tls":
		stream["security"] = "tls"
		stream["tlsSettings"] = map[string]any{
			"serverName": firstServerModeSNI(inbound),
		}
	default:
		stream["security"] = "none"
	}
	return map[string]any{
		"tag":      serverModeExportFilename(firstNonEmpty(client.Name, client.Email, client.ID, "server-mode-client")),
		"protocol": firstNonEmpty(inbound.Protocol, "vless"),
		"settings": map[string]any{
			"vnext": []any{
				map[string]any{
					"address": host,
					"port":    inbound.Port,
					"users":   []any{user},
				},
			},
		},
		"streamSettings": stream,
	}
}

func serverModeClientURI(inbound serverModeXrayInbound, client serverModeClient, host string) string {
	params := url.Values{}
	params.Set("type", firstNonEmpty(inbound.Network, "tcp"))
	params.Set("security", firstNonEmpty(inbound.Security, "none"))
	params.Set("encryption", "none")
	if client.Flow != "" {
		params.Set("flow", client.Flow)
	}
	if sni := firstServerModeSNI(inbound); sni != "" {
		params.Set("sni", sni)
	}
	switch strings.ToLower(inbound.Security) {
	case "reality":
		params.Set("fp", "chrome")
		params.Set("pbk", inbound.Reality.PublicKey)
		params.Set("sid", firstServerModeShortID(inbound))
		params.Set("spx", "/")
	}
	authority := net.JoinHostPort(host, fmt.Sprint(inbound.Port))
	return "vless://" + url.PathEscape(client.UUID) + "@" + authority + "?" + params.Encode() + "#" + url.QueryEscape(firstNonEmpty(client.Name, client.Email, client.ID, inbound.Name))
}

func firstServerModeSNI(inbound serverModeXrayInbound) string {
	for _, value := range inbound.Reality.ServerNames {
		if clean := strings.TrimSpace(value); clean != "" {
			return clean
		}
	}
	host, _, err := net.SplitHostPort(inbound.Reality.Dest)
	if err == nil && host != "" {
		return host
	}
	return strings.TrimSpace(strings.Split(inbound.Reality.Dest, ":")[0])
}

func firstServerModeShortID(inbound serverModeXrayInbound) string {
	for _, value := range inbound.Reality.ShortIDs {
		if clean := strings.TrimSpace(value); clean != "" {
			return clean
		}
	}
	return ""
}

var serverModeExportFilenameReplace = regexp.MustCompile(`[^a-zA-Z0-9._-]+`)

func serverModeExportFilename(value string) string {
	clean := strings.TrimSpace(value)
	clean = serverModeExportFilenameReplace.ReplaceAllString(clean, "-")
	clean = strings.Trim(clean, "-_.")
	if clean == "" {
		return "ruopenray-client"
	}
	if len(clean) > 64 {
		clean = clean[:64]
		clean = strings.Trim(clean, "-_.")
	}
	return clean
}
