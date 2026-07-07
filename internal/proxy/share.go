package proxy

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"regexp"
	"strconv"
	"strings"
)

func OutboundSummary(outbound map[string]any) map[string]any {
	address, portValue := "", any("")
	if vnext := asArray(getNested(outbound, "settings", "vnext")); len(vnext) > 0 {
		if first, ok := vnext[0].(map[string]any); ok {
			address = fmt.Sprint(first["address"])
			portValue = first["port"]
		}
	}
	if servers := asArray(getNested(outbound, "settings", "servers")); len(servers) > 0 {
		if first, ok := servers[0].(map[string]any); ok {
			address = fmt.Sprint(first["address"])
			portValue = first["port"]
		}
	}
	tag := fmt.Sprint(outbound["tag"])
	summary := map[string]any{
		"tag": tag, "protocol": outbound["protocol"], "address": address, "port": portValue,
		"network":  firstNonEmpty(fmt.Sprint(getNested(outbound, "streamSettings", "network")), "tcp"),
		"security": firstNonEmpty(fmt.Sprint(getNested(outbound, "streamSettings", "security")), "none"),
	}
	country := ""
	if country := normalizedCountry(fmt.Sprint(outbound["country"])); country != "" {
		summary["country"] = country
	} else if country := normalizedCountry(fmt.Sprint(getNested(outbound, "meta", "country"))); country != "" {
		summary["country"] = country
	}
	if value, ok := summary["country"].(string); ok {
		country = value
	}
	if displayTag := cleanCountryPrefixedTag(tag, country); displayTag != "" && displayTag != tag {
		summary["displayTag"] = displayTag
	}
	return summary
}

func OutboundDisplayTag(outbound map[string]any) string {
	tag := fmt.Sprint(outbound["tag"])
	country := normalizedCountry(fmt.Sprint(outbound["country"]))
	if country == "" {
		country = normalizedCountry(fmt.Sprint(getNested(outbound, "meta", "country")))
	}
	return firstNonEmpty(cleanCountryPrefixedTag(tag, country), tag)
}

func CloneOutboundWithTag(outbound map[string]any, tag string) map[string]any {
	body, _ := json.Marshal(outbound)
	var cloned map[string]any
	_ = json.Unmarshal(body, &cloned)
	if cloned == nil {
		cloned = map[string]any{}
	}
	cloned["tag"] = tag
	return cloned
}

func CloneOutboundWithTagAndDialerProxy(outbound map[string]any, tag string, dialerProxy string) map[string]any {
	cloned := CloneOutboundWithTag(outbound, tag)
	dialerProxy = strings.TrimSpace(dialerProxy)
	if dialerProxy == "" {
		return cloned
	}
	stream, _ := cloned["streamSettings"].(map[string]any)
	if stream == nil {
		stream = map[string]any{}
		cloned["streamSettings"] = stream
	}
	sockopt, _ := stream["sockopt"].(map[string]any)
	if sockopt == nil {
		sockopt = map[string]any{}
		stream["sockopt"] = sockopt
	}
	sockopt["dialerProxy"] = dialerProxy
	return cloned
}

func ReplaceOutboundByTag(items []any, tag string, outbound map[string]any) []any {
	next := []any{}
	replaced := false
	for _, item := range items {
		object, ok := item.(map[string]any)
		if ok && fmt.Sprint(object["tag"]) == tag {
			if !replaced {
				next = append(next, outbound)
				replaced = true
			}
			continue
		}
		next = append(next, item)
	}
	if !replaced {
		next = append([]any{outbound}, next...)
	}
	return next
}

func DecodeSubscription(body string) []string {
	text := strings.TrimSpace(body)
	candidates := []string{text}
	if !strings.Contains(text, "://") {
		if decoded, err := base64.StdEncoding.DecodeString(text); err == nil {
			candidates = append([]string{string(decoded)}, candidates...)
		}
	}
	for _, candidate := range candidates {
		var links []string
		for _, item := range strings.Fields(candidate) {
			if regexp.MustCompile(`(?i)^(vless|vmess|trojan|ss)://`).MatchString(item) {
				links = append(links, item)
			}
		}
		if len(links) > 0 {
			return links
		}
	}
	return nil
}

func ParseShareLink(raw string) (map[string]any, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil, errors.New("пустая ссылка для импорта")
	}
	u, err := url.Parse(raw)
	if err != nil {
		return nil, err
	}
	switch u.Scheme {
	case "vless":
		return parseVless(u), nil
	case "trojan":
		return parseTrojan(u), nil
	case "ss":
		return parseSS(u), nil
	case "vmess":
		return parseVMess(u)
	default:
		return nil, fmt.Errorf("неподдерживаемый протокол ссылки: %s", u.Scheme)
	}
}

func tagFromURL(u *url.URL, fallback string) string {
	tag, _ := tagAndCountryFromURL(u, fallback)
	return tag
}

func tagAndCountryFromURL(u *url.URL, fallback string) (string, string) {
	if u.Fragment != "" {
		if value, err := url.QueryUnescape(u.Fragment); err == nil {
			tag, country := cleanShareTag(value)
			if tag != "" {
				return tag, country
			}
		}
	}
	return fallback, ""
}

func cleanShareTag(value string) (string, string) {
	tag := strings.TrimSpace(value)
	if tag == "" {
		return "", ""
	}
	country, rest := flagCountryPrefix(tag)
	if country != "" {
		tag = strings.TrimLeft(strings.TrimSpace(rest), " \t\r\n-_·|")
		tag = cleanCountryPrefixedTag(tag, country)
	}
	return tag, country
}

func cleanCountryPrefixedTag(tag string, country string) string {
	tag = strings.TrimSpace(tag)
	country = normalizedCountry(country)
	if tag == "" || country == "" {
		return tag
	}
	code := strings.ToLower(country)
	lower := strings.ToLower(tag)
	if !strings.HasPrefix(lower, code) {
		return tag
	}
	rest := tag[len(code):]
	if !hasCountryPrefix(rest, country) {
		return tag
	}
	return strings.TrimLeft(strings.TrimSpace(rest), " \t\r\n-_·|")
}

func hasCountryPrefix(value string, country string) bool {
	lower := strings.ToLower(strings.TrimSpace(value))
	if lower == "" {
		return false
	}
	prefixes := []string{strings.ToLower(country)}
	if country == "FI" {
		prefixes = append(prefixes, "fin", "finnish")
	}
	for _, prefix := range prefixes {
		if lower == prefix {
			return true
		}
		if strings.HasPrefix(lower, prefix) {
			rest := strings.TrimPrefix(lower, prefix)
			if rest != "" && strings.ContainsRune("-_ .|·", []rune(rest)[0]) {
				return true
			}
		}
	}
	return false
}

func flagCountryPrefix(value string) (string, string) {
	runes := []rune(strings.TrimSpace(value))
	if len(runes) < 2 || !isRegionalIndicator(runes[0]) || !isRegionalIndicator(runes[1]) {
		return "", ""
	}
	code := string([]rune{
		rune('A') + (runes[0] - 0x1F1E6),
		rune('A') + (runes[1] - 0x1F1E6),
	})
	return code, string(runes[2:])
}

func isRegionalIndicator(value rune) bool {
	return value >= 0x1F1E6 && value <= 0x1F1FF
}

func normalizedCountry(value string) string {
	country := strings.ToUpper(strings.TrimSpace(value))
	if matched, _ := regexp.MatchString(`^[A-Z]{2}$`, country); matched {
		return country
	}
	return ""
}

func applyOutboundCountry(outbound map[string]any, country string) {
	if country = normalizedCountry(country); country != "" {
		outbound["country"] = country
	}
}

func parseVless(u *url.URL) map[string]any {
	q := u.Query()
	tag, country := tagAndCountryFromURL(u, "vless-out")
	network := firstNonEmpty(q.Get("type"), "tcp")
	security := firstNonEmpty(q.Get("security"), "none")
	user := map[string]any{"id": u.User.Username(), "encryption": firstNonEmpty(q.Get("encryption"), "none")}
	if flow := q.Get("flow"); flow != "" {
		user["flow"] = flow
	}
	stream := map[string]any{"network": network, "security": security}
	if security == "tls" {
		stream["tlsSettings"] = map[string]any{"serverName": firstNonEmpty(q.Get("sni"), u.Hostname())}
	}
	if security == "reality" {
		reality := map[string]any{
			"serverName": firstNonEmpty(q.Get("sni"), u.Hostname()),
			"publicKey":  q.Get("pbk"),
			"shortId":    q.Get("sid"),
		}
		if fingerprint := q.Get("fp"); fingerprint != "" {
			reality["fingerprint"] = fingerprint
		}
		if spiderX := q.Get("spx"); spiderX != "" {
			reality["spiderX"] = spiderX
		}
		stream["realitySettings"] = reality
	}
	if network == "ws" {
		stream["wsSettings"] = map[string]any{"path": firstNonEmpty(q.Get("path"), "/")}
	}
	if fragment := strings.TrimSpace(q.Get("fragment")); fragment != "" {
		sockopt, _ := stream["sockopt"].(map[string]any)
		if sockopt == nil {
			sockopt = map[string]any{}
		}
		sockopt["dialerProxy"] = FragmentOutboundTag(fragment)
		stream["sockopt"] = sockopt
	}
	outbound := map[string]any{
		"tag": tag, "protocol": "vless",
		"settings":       map[string]any{"vnext": []any{map[string]any{"address": u.Hostname(), "port": port(u, 443), "users": []any{user}}}},
		"streamSettings": stream,
	}
	applyOutboundCountry(outbound, country)
	if strings.EqualFold(q.Get("mux"), "true") || q.Get("mux") == "1" {
		mux := map[string]any{"enabled": true}
		if concurrency := q.Get("muxConcurrency"); concurrency != "" {
			if value, err := strconv.Atoi(concurrency); err == nil {
				mux["concurrency"] = value
			}
		}
		outbound["mux"] = mux
	}
	return outbound
}

const FragmentTagPrefix = "ruopenray-fragment-"

func FragmentOutboundTag(raw string) string {
	encoded := base64.RawURLEncoding.EncodeToString([]byte(strings.TrimSpace(raw)))
	return FragmentTagPrefix + encoded
}

func FragmentOutboundFromTag(tag string) (map[string]any, bool) {
	if !strings.HasPrefix(tag, FragmentTagPrefix) {
		return nil, false
	}
	raw, err := base64.RawURLEncoding.DecodeString(strings.TrimPrefix(tag, FragmentTagPrefix))
	if err != nil {
		return nil, false
	}
	parts := strings.SplitN(strings.TrimSpace(string(raw)), ",", 3)
	length := "100-200"
	interval := "10-20"
	packets := "tlshello"
	if len(parts) > 0 && strings.TrimSpace(parts[0]) != "" {
		length = strings.TrimSpace(parts[0])
	}
	if len(parts) > 1 && strings.TrimSpace(parts[1]) != "" {
		interval = strings.TrimSpace(parts[1])
	}
	if len(parts) > 2 && strings.TrimSpace(parts[2]) != "" {
		packets = strings.TrimSpace(parts[2])
	}
	return map[string]any{
		"tag":      tag,
		"protocol": "freedom",
		"settings": map[string]any{"fragment": map[string]any{
			"length":   length,
			"interval": interval,
			"packets":  packets,
		}},
	}, true
}

func parseTrojan(u *url.URL) map[string]any {
	q := u.Query()
	tag, country := tagAndCountryFromURL(u, "trojan-out")
	outbound := map[string]any{
		"tag": tag, "protocol": "trojan",
		"settings":       map[string]any{"servers": []any{map[string]any{"address": u.Hostname(), "port": port(u, 443), "password": u.User.Username()}}},
		"streamSettings": map[string]any{"network": firstNonEmpty(q.Get("type"), "tcp"), "security": firstNonEmpty(q.Get("security"), "tls")},
	}
	applyOutboundCountry(outbound, country)
	return outbound
}

func parseSS(u *url.URL) map[string]any {
	q := u.Query()
	tag, country := tagAndCountryFromURL(u, "ss-out")
	outbound := map[string]any{
		"tag": tag, "protocol": "shadowsocks",
		"settings": map[string]any{"servers": []any{map[string]any{
			"address": u.Hostname(), "port": port(u, 443), "method": firstNonEmpty(q.Get("method"), "2022-blake3-aes-128-gcm"), "password": u.User.Username(),
		}}},
	}
	applyOutboundCountry(outbound, country)
	return outbound
}

func parseVMess(u *url.URL) (map[string]any, error) {
	body := strings.TrimLeft(u.Opaque+u.Host+u.Path, "/")
	decoded, err := base64.RawStdEncoding.DecodeString(body)
	if err != nil {
		decoded, err = base64.StdEncoding.DecodeString(body)
	}
	if err != nil {
		return nil, err
	}
	var raw map[string]any
	if err := json.Unmarshal(decoded, &raw); err != nil {
		return nil, err
	}
	tag, country := cleanShareTag(firstNonEmpty(fmt.Sprint(raw["ps"]), "vmess-out"))
	tag = firstNonEmpty(tag, "vmess-out")
	outbound := map[string]any{
		"tag": tag, "protocol": "vmess",
		"settings": map[string]any{"vnext": []any{map[string]any{
			"address": raw["add"], "port": number(raw["port"], 443),
			"users": []any{map[string]any{"id": raw["id"], "alterId": number(raw["aid"], 0), "security": firstNonEmpty(fmt.Sprint(raw["scy"]), "auto")}},
		}}},
		"streamSettings": map[string]any{"network": firstNonEmpty(fmt.Sprint(raw["net"]), "tcp"), "security": firstNonEmpty(fmt.Sprint(raw["tls"]), "none")},
	}
	applyOutboundCountry(outbound, country)
	return outbound, nil
}

func asArray(value any) []any {
	items, _ := value.([]any)
	return items
}

func getNested(root map[string]any, path ...string) any {
	var current any = root
	for _, key := range path {
		object, ok := current.(map[string]any)
		if !ok {
			return nil
		}
		current = object[key]
	}
	return current
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" && value != "<nil>" {
			return value
		}
	}
	return ""
}

func port(u *url.URL, fallback int) int {
	return number(u.Port(), fallback)
}

func number(value any, fallback int) int {
	switch typed := value.(type) {
	case int:
		return typed
	case float64:
		return int(typed)
	case string:
		var out int
		if _, err := fmt.Sscanf(strings.TrimSpace(typed), "%d", &out); err == nil {
			return out
		}
	}
	return fallback
}
