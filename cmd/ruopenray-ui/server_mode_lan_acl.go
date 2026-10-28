package main

import (
	"fmt"
	"net"
	"strconv"
	"strings"
)

func serverModeNormalizeLANProtocol(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	switch value {
	case "", "any":
		return "any"
	case "tcp":
		return "tcp"
	case "udp":
		return "udp"
	default:
		return value
	}
}

func serverModeLANACLValidationIssue(ips, ports, protocol, source string) *serverModeIssue {
	if _, _, _, err := serverModeNormalizeLANACL(ips, ports, protocol); err != nil {
		return &serverModeIssue{Severity: "error", Title: "Некорректное ограничение LAN", Detail: err.Error(), Source: source}
	}
	return nil
}

func serverModeNormalizeLANACL(ips, ports, protocol string) ([]string, string, string, error) {
	protocol = serverModeNormalizeLANProtocol(protocol)
	if protocol != "any" && protocol != "tcp" && protocol != "udp" {
		return nil, "", protocol, fmt.Errorf("протокол LAN %q не поддерживается; используйте any, tcp или udp", protocol)
	}
	cleanIPs, err := serverModeNormalizePrivateIPv4List(ips)
	if err != nil {
		return nil, "", protocol, err
	}
	cleanPorts, err := serverModeNormalizePortList(ports)
	if err != nil {
		return nil, "", protocol, err
	}
	if len(cleanIPs) == 0 && cleanPorts != "" {
		return nil, "", protocol, fmt.Errorf("порты LAN заданы без разрешённого CIDR/IP")
	}
	return cleanIPs, cleanPorts, protocol, nil
}

func serverModeNormalizePrivateIPv4List(value string) ([]string, error) {
	items := strings.FieldsFunc(value, func(r rune) bool { return r == ',' || r == ';' || r == '\n' || r == '\r' })
	out := []string{}
	seen := map[string]bool{}
	for _, item := range items {
		clean := strings.TrimSpace(item)
		if clean == "" {
			continue
		}
		if strings.Contains(clean, "/") {
			ip, network, err := net.ParseCIDR(clean)
			if err != nil || ip.To4() == nil || !serverModePrivateIPv4Network(network) {
				return nil, fmt.Errorf("%q не является приватной IPv4 подсетью", clean)
			}
			clean = network.String()
		} else {
			ip := net.ParseIP(clean)
			if ip == nil || ip.To4() == nil || !ip.IsPrivate() {
				return nil, fmt.Errorf("%q не является приватным IPv4 адресом", clean)
			}
			clean = ip.String()
		}
		if !seen[clean] {
			seen[clean] = true
			out = append(out, clean)
		}
	}
	return out, nil
}

func serverModePrivateIPv4Network(network *net.IPNet) bool {
	if network == nil || network.IP.To4() == nil {
		return false
	}
	first := network.IP.To4()
	last := make(net.IP, len(first))
	for i := range first {
		last[i] = first[i] | ^network.Mask[i]
	}
	return first.IsPrivate() && last.IsPrivate()
}

func serverModeNormalizePortList(value string) (string, error) {
	items := strings.FieldsFunc(value, func(r rune) bool { return r == ',' || r == ';' || r == ' ' || r == '\t' || r == '\n' || r == '\r' })
	out := []string{}
	seen := map[string]bool{}
	for _, item := range items {
		clean := strings.TrimSpace(item)
		if clean == "" {
			continue
		}
		parts := strings.Split(clean, "-")
		if len(parts) > 2 {
			return "", fmt.Errorf("%q не является портом или диапазоном портов", clean)
		}
		first, err := strconv.Atoi(parts[0])
		if err != nil || first < 1 || first > 65535 {
			return "", fmt.Errorf("порт %q вне диапазона 1-65535", parts[0])
		}
		if len(parts) == 2 {
			last, rangeErr := strconv.Atoi(parts[1])
			if rangeErr != nil || last < first || last > 65535 {
				return "", fmt.Errorf("диапазон портов %q некорректен", clean)
			}
			clean = fmt.Sprintf("%d-%d", first, last)
		} else {
			clean = strconv.Itoa(first)
		}
		if !seen[clean] {
			seen[clean] = true
			out = append(out, clean)
		}
	}
	return strings.Join(out, ","), nil
}

func serverModeLimitedLANXrayRule(inboundTag, user []any, ips, ports, protocol string) (map[string]any, bool) {
	cleanIPs, cleanPorts, cleanProtocol, err := serverModeNormalizeLANACL(ips, ports, protocol)
	if err != nil || len(cleanIPs) == 0 {
		return nil, false
	}
	rule := map[string]any{
		"type":        "field",
		"inboundTag":  inboundTag,
		"user":        user,
		"ip":          stringsToAny(cleanIPs),
		"outboundTag": "direct",
	}
	if cleanPorts != "" {
		rule["port"] = cleanPorts
	}
	if cleanProtocol != "any" {
		rule["network"] = cleanProtocol
	}
	return rule, true
}
