package firewall

import (
	"fmt"
	"net"
	"regexp"
	"strconv"
	"strings"
)

const DefaultNftPath = "/etc/ruopenray-ui/firewall.nft"

func PayloadString(payload map[string]any, key, fallback string) string {
	value := strings.TrimSpace(fmt.Sprint(payload[key]))
	if value == "" || value == "<nil>" {
		return fallback
	}
	return value
}

func PortList(payload map[string]any) []string {
	if PayloadString(payload, "portMode", "custom") == "all" {
		return []string{}
	}
	ports := []string{}
	for _, item := range stringList(payload["ports"]) {
		clean := strings.ReplaceAll(strings.TrimSpace(item), ":", "-")
		if regexp.MustCompile(`^\d+(-\d+)?$`).MatchString(clean) {
			ports = append(ports, clean)
		}
	}
	if len(ports) == 0 {
		return []string{"80", "443"}
	}
	return ports
}

func IPList(value any) []string {
	out := []string{}
	for _, item := range stringList(value) {
		if net.ParseIP(item) != nil {
			out = append(out, item)
		}
	}
	return out
}

func NftSet(items []string) string {
	if len(items) == 0 {
		return ""
	}
	return "{ " + strings.Join(items, ", ") + " }"
}

func DportExpression(ports []string, protocol string) string {
	if len(ports) == 0 {
		return ""
	}
	if protocol == "tcp" {
		return " tcp dport " + NftSet(ports)
	}
	return " th dport " + NftSet(ports)
}

func NativeNft(payload map[string]any) (string, map[string]any) {
	routerMode := PayloadString(payload, "routerMode", "tproxy")
	if routerMode != "redirect" {
		routerMode = "tproxy"
	}
	bypassMode := PayloadString(payload, "bypassMode", "off")
	if bypassMode != "bypass" && bypassMode != "redirect" {
		bypassMode = "off"
	}
	deviceMode := PayloadString(payload, "deviceMode", "all")
	if deviceMode != "selected" && deviceMode != "exclude" {
		deviceMode = "all"
	}
	lanInterface := PayloadString(payload, "lanInterface", "br-lan")
	transparentPort := number(payload["transparentPort"], 52345)
	if transparentPort <= 0 || transparentPort > 65535 {
		transparentPort = 52345
	}
	ports := PortList(payload)
	devices := IPList(payload["devices"])
	blockQuic := boolPayload(payload, "blockQuic", true)
	localBypass := []string{"0.0.0.0/8", "10.0.0.0/8", "100.64.0.0/10", "127.0.0.0/8", "169.254.0.0/16", "172.16.0.0/12", "192.168.0.0/16", "224.0.0.0/3"}
	setLines := []string{}
	chainLines := []string{"  chain prerouting {"}
	if routerMode == "redirect" {
		chainLines = append(chainLines, "    type nat hook prerouting priority dstnat; policy accept;")
	} else {
		chainLines = append(chainLines, "    type filter hook prerouting priority mangle; policy accept;")
	}
	chainLines = append(chainLines,
		fmt.Sprintf("    iifname != %q return", lanInterface),
		"    ip daddr "+NftSet(localBypass)+" return",
	)
	if deviceMode == "exclude" && len(devices) > 0 {
		chainLines = append(chainLines, "    ip saddr "+NftSet(devices)+" return")
	}
	if blockQuic {
		chainLines = append(chainLines, fmt.Sprintf("    iifname %q udp dport 443 drop comment %q", lanInterface, "RuOpenRay Block QUIC"))
	}
	if bypassMode == "bypass" {
		setLines = append(setLines, "  set bypass4 { type ipv4_addr; flags interval; elements = "+NftSet([]string{"10.0.0.0/8", "127.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"})+"; }")
		chainLines = append(chainLines,
			"    ip daddr @bypass4 return",
		)
	}
	targetPrefix := fmt.Sprintf("    iifname %q ", lanInterface)
	if deviceMode == "selected" && len(devices) > 0 {
		targetPrefix += "ip saddr " + NftSet(devices) + " "
	}
	if bypassMode == "redirect" {
		setLines = append(setLines, "  set proxy4 { type ipv4_addr; flags interval; }")
		targetPrefix += "ip daddr @proxy4 "
	}
	if routerMode == "redirect" {
		redirectMatch := "meta l4proto tcp"
		if len(ports) > 0 {
			redirectMatch = "tcp dport " + NftSet(ports)
		}
		chainLines = append(chainLines, targetPrefix+redirectMatch+" redirect to :"+strconv.Itoa(transparentPort))
	} else {
		chainLines = append(chainLines, targetPrefix+"meta l4proto { tcp, udp }"+DportExpression(ports, "meta")+" counter tproxy ip to :"+strconv.Itoa(transparentPort)+" meta mark set 1")
	}
	chainLines = append(chainLines, "  }")
	lines := []string{"table inet ruopenray {"}
	lines = append(lines, setLines...)
	lines = append(lines, chainLines...)
	lines = append(lines, "}")
	meta := map[string]any{
		"routerMode":      routerMode,
		"bypassMode":      bypassMode,
		"deviceMode":      deviceMode,
		"devices":         devices,
		"ports":           ports,
		"portMode":        PayloadString(payload, "portMode", "custom"),
		"blockQuic":       blockQuic,
		"lanInterface":    lanInterface,
		"transparentPort": transparentPort,
		"path":            DefaultNftPath,
	}
	return strings.Join(lines, "\n") + "\n", meta
}

func HotplugScript() string {
	return `#!/bin/sh
[ "$ACTION" = "ifup" ] || [ "$ACTION" = "ifupdate" ] || [ "$ACTION" = "ifdown" ] || exit 0
NFT_FILE="/etc/ruopenray-ui/firewall.nft"
nft delete table inet ruopenray 2>/dev/null
[ -s "$NFT_FILE" ] && nft -f "$NFT_FILE" 2>/dev/null
ip rule del fwmark 1 table 100 2>/dev/null
ip route flush table 100 2>/dev/null
ip rule add fwmark 1 table 100 2>/dev/null
ip route add local 0.0.0.0/0 dev lo table 100 2>/dev/null
exit 0
`
}

func StepOK(step map[string]any) bool {
	stderr := strings.TrimSpace(fmt.Sprint(step["stderr"]))
	stdout := strings.TrimSpace(fmt.Sprint(step["stdout"]))
	message := strings.TrimSpace(fmt.Sprint(step["message"]))
	combined := strings.ToLower(stderr + " " + stdout + " " + message)
	missing := strings.Contains(combined, "no such file") || strings.Contains(combined, "not found") || strings.Contains(combined, "no such process")
	if strings.Contains(combined, "error:") && !missing {
		return false
	}
	if step["ok"] == true {
		return true
	}
	return missing
}

func AllStepsOK(steps []map[string]any) bool {
	for _, step := range steps {
		if !StepOK(step) {
			return false
		}
	}
	return true
}

func stringList(value any) []string {
	var out []string
	switch typed := value.(type) {
	case []any:
		for _, item := range typed {
			if clean := strings.TrimSpace(fmt.Sprint(item)); clean != "" && clean != "<nil>" {
				out = append(out, clean)
			}
		}
	case []string:
		for _, item := range typed {
			if clean := strings.TrimSpace(item); clean != "" {
				out = append(out, clean)
			}
		}
	case string:
		for _, item := range strings.Split(typed, ",") {
			if clean := strings.TrimSpace(item); clean != "" {
				out = append(out, clean)
			}
		}
	}
	return out
}

func boolPayload(payload map[string]any, key string, fallback bool) bool {
	value, ok := payload[key]
	if !ok {
		return fallback
	}
	switch typed := value.(type) {
	case bool:
		return typed
	case string:
		clean := strings.ToLower(strings.TrimSpace(typed))
		return clean == "true" || clean == "1" || clean == "yes" || clean == "on"
	default:
		return fmt.Sprint(value) == "1"
	}
}

func number(value any, fallback int) int {
	clean := strings.TrimSpace(fmt.Sprint(value))
	if clean == "" || clean == "<nil>" {
		return fallback
	}
	parsed, err := strconv.Atoi(clean)
	if err != nil {
		return fallback
	}
	return parsed
}
