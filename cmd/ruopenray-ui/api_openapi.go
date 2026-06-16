package main

const ruOpenRayAPIVersion = "0.1.0"

type apiEndpoint struct {
	method      string
	path        string
	tag         string
	summary     string
	description string
	request     string
	response    string
}

func apiVersionPayload() map[string]any {
	return map[string]any{
		"ok":         true,
		"name":       "RuOpenRay UI API",
		"apiVersion": ruOpenRayAPIVersion,
		"appVersion": appVersion,
		"openapi":    "/api/openapi.json",
		"auth": map[string]any{
			"type":        "bearer-or-cookie",
			"login":       "/api/login",
			"check":       "/api/auth/check",
			"cookieName":  "openray_session",
			"bearerUsage": "Authorization: Bearer <token>",
		},
	}
}

func openAPISpec() map[string]any {
	paths := map[string]any{}
	for _, endpoint := range apiEndpoints() {
		addOpenAPIEndpoint(paths, endpoint)
	}
	return map[string]any{
		"openapi": "3.0.3",
		"info": map[string]any{
			"title":       "RuOpenRay UI API",
			"version":     ruOpenRayAPIVersion,
			"description": "HTTP API for RuOpenRay UI integrations, diagnostics and router/Xray control.",
		},
		"servers": []map[string]any{
			{"url": "/api", "description": "Current RuOpenRay instance"},
		},
		"tags": []map[string]string{
			{"name": "Auth", "description": "Login and session checks"},
			{"name": "System", "description": "Version, status, diagnostics and service control"},
			{"name": "Config", "description": "Xray active config and draft management"},
			{"name": "Firewall", "description": "Traffic interception and nftables/firewall state"},
			{"name": "DNS", "description": "DNS servers, LAN DNS and DNS diagnostics"},
			{"name": "Routing", "description": "Routing rules, scenario presets and rule metadata"},
			{"name": "Servers", "description": "Outbound servers, subscriptions and proxy checks"},
			{"name": "Profiles", "description": "Profile storage and activation"},
			{"name": "Diagnostics", "description": "Probes, live domain monitor and downloadable diagnostic package"},
			{"name": "AmneziaWG", "description": "AmneziaWG/WireGuard detection and planned split-routing integration"},
			{"name": "Geo", "description": "GeoIP/geosite files and custom lists"},
			{"name": "Backups", "description": "Configuration backups and restore"},
		},
		"components": map[string]any{
			"securitySchemes": map[string]any{
				"BearerAuth": map[string]any{
					"type":         "http",
					"scheme":       "bearer",
					"bearerFormat": "RuOpenRay session token",
				},
				"SessionCookie": map[string]any{
					"type": "apiKey",
					"in":   "cookie",
					"name": "openray_session",
				},
			},
			"schemas": openAPISchemas(),
		},
		"paths": paths,
	}
}

func apiEndpoints() []apiEndpoint {
	return []apiEndpoint{
		{"get", "/version", "System", "Get API and application version", "Public endpoint used by integrations to discover RuOpenRay.", "", "VersionResponse"},
		{"get", "/openapi.json", "System", "Get OpenAPI schema", "Public machine-readable OpenAPI 3.0 schema.", "", "Object"},
		{"post", "/login", "Auth", "Login with panel password", "Creates a session cookie and returns a token. Set remember=true for a signed long-lived token.", "LoginRequest", "LoginResponse"},
		{"get", "/auth/check", "Auth", "Check current session", "Returns ok=true when Authorization bearer token or session cookie is accepted.", "", "OkResponse"},
		{"get", "/status", "System", "Get router and Xray status", "Main dashboard snapshot: service state, resources, compatibility detectors, versions and warnings.", "", "Object"},
		{"post", "/service", "System", "Control Xray service", "Start, stop or restart managed Xray service.", "GenericObject", "Object"},
		{"post", "/compat/stop-ruopenray", "System", "Stop RuOpenRay mode", "Disables RuOpenRay interception and stops managed Xray without deleting third-party services.", "", "Object"},
		{"get", "/compat/status", "Compatibility", "Get third-party compatibility status", "Reports detected AdGuard Home, Podkop and B4 services with safe web links.", "", "Object"},
		{"post", "/compat/b4", "Compatibility", "Control B4 service", "Starts, stops, restarts, enables, disables or clears B4 tables on the router.", "GenericObject", "Object"},
		{"get", "/amnezia/status", "AmneziaWG", "Get AmneziaWG status", "Detects awg/wg interfaces, service state, routes and the future RuOpenRay split-routing plan.", "", "Object"},
		{"get", "/amnezia/config", "AmneziaWG", "Get saved AmneziaWG client config", "Returns the saved client config for editing.", "", "Object"},
		{"post", "/amnezia/config", "AmneziaWG", "Save AmneziaWG client config", "Validates and stores an AmneziaWG client config without starting the tunnel.", "GenericObject", "Object"},
		{"post", "/amnezia/config/delete", "AmneziaWG", "Delete saved AmneziaWG client config", "", "GenericObject", "Object"},
		{"post", "/amnezia/profile/load", "AmneziaWG", "Load AmneziaWG profile", "Loads a saved profile config into the editor.", "GenericObject", "Object"},
		{"post", "/amnezia/profile/activate", "AmneziaWG", "Activate AmneziaWG profile", "Copies a saved profile to the active client config without starting the tunnel.", "GenericObject", "Object"},
		{"post", "/amnezia/profile/pool", "AmneziaWG", "Save AmneziaWG profile pool", "Stores selected AmneziaWG profiles, balancing strategy and Xray integration mode.", "GenericObject", "Object"},
		{"post", "/amnezia/policy", "AmneziaWG", "Save direct AmneziaWG policy rules", "Stores routing-section rules that bypass Xray and target AmneziaWG policy routing.", "GenericObject", "Object"},
		{"post", "/amnezia/profile/delete", "AmneziaWG", "Delete AmneziaWG profile", "", "GenericObject", "Object"},
		{"post", "/amnezia/preflight", "AmneziaWG", "Check AmneziaWG preflight", "Validates config, tools, kernel module and route safety without changing the system.", "GenericObject", "Object"},
		{"post", "/amnezia/prepare", "AmneziaWG", "Prepare AmneziaWG plan", "Dry-run preparation for future AmneziaWG routing. Does not start tunnel or change firewall.", "GenericObject", "Object"},
		{"post", "/amnezia/userspace/prepare", "AmneziaWG", "Prepare userspace AmneziaWG backend", "Downloads amneziawg-go from an explicit URL into RuOpenRay data dir or returns a dry-run plan. Does not start tunnel or change firewall.", "GenericObject", "Object"},

		{"get", "/config", "Config", "Get active Xray config", "Returns parsed /etc/xray/config.json.", "", "Object"},
		{"get", "/config/draft", "Config", "Get config draft", "Returns current UI draft if it exists.", "", "Object"},
		{"post", "/config/draft", "Config", "Save config draft", "Stores a draft config without applying it.", "GenericObject", "Object"},
		{"delete", "/config/draft", "Config", "Clear config draft", "Removes the saved draft.", "", "OkResponse"},
		{"post", "/config/test", "Config", "Validate config", "Runs Xray config validation and RuOpenRay geo/routing checks.", "ConfigRequest", "Object"},
		{"post", "/config/analyze", "Config", "Analyze config", "Returns a UI-oriented analysis of routes, outbounds, DNS and inbounds.", "ConfigRequest", "Object"},
		{"post", "/config/apply", "Config", "Apply config", "Writes active Xray config and restarts/reloads according to service settings.", "ConfigRequest", "Object"},

		{"get", "/firewall/status", "Firewall", "Get interception status", "Current RuOpenRay nftables/firewall, policy routing and LAN interception state.", "", "Object"},
		{"get", "/firewall/snapshot", "Firewall", "Get rollback snapshot", "Captures enough firewall/DNS state for setup rollback.", "", "Object"},
		{"post", "/firewall/preview", "Firewall", "Preview interception changes", "Returns commands and warnings without changing firewall.", "GenericObject", "Object"},
		{"post", "/firewall/apply", "Firewall", "Apply interception", "Applies RuOpenRay transparent proxy/firewall mode after compatibility preflight.", "GenericObject", "Object"},
		{"post", "/firewall/disable", "Firewall", "Disable interception", "Removes RuOpenRay-owned interception rules.", "", "Object"},
		{"post", "/firewall/restore", "Firewall", "Restore firewall snapshot", "Restores firewall/DNS state captured earlier.", "GenericObject", "Object"},

		{"get", "/dns/diagnostics", "DNS", "Get DNS diagnostics", "Reports dnsmasq, Xray DNS inbound/outbound, ports and AdGuard compatibility.", "", "Object"},
		{"post", "/dns/check", "DNS", "Check DNS server", "Tests DNS resolution through a selected DNS server.", "GenericObject", "Object"},
		{"get", "/dns/lan-upstream", "DNS", "Get LAN DNS mode", "Shows current dnsmasq upstream mode and Xray/AdGuard compatibility state.", "", "Object"},
		{"post", "/dns/lan-upstream", "DNS", "Apply LAN DNS mode", "Applies LAN DNS mode: Xray, AdGuard after Xray, external DNS/Pi-hole or OpenWrt resolver.", "GenericObject", "Object"},

		{"get", "/routing/disabled", "Routing", "List disabled route rules", "", "", "Object"},
		{"post", "/routing/disabled", "Routing", "Save disabled route rules", "", "GenericObject", "Object"},
		{"get", "/routing/names", "Routing", "Get route names/groups", "", "", "Object"},
		{"post", "/routing/names", "Routing", "Save route names/groups", "", "GenericObject", "Object"},
		{"get", "/routing/presets", "Routing", "List route scenarios", "Returns built-in/local/Git scenarios with icons and source metadata.", "", "Object"},
		{"post", "/routing/presets", "Routing", "Save local route scenarios", "", "GenericObject", "Object"},
		{"post", "/routing/preset-sources/check", "Routing", "Check route scenario source", "Validates external scenario source URL.", "GenericObject", "Object"},
		{"post", "/routing/preset-sources", "Routing", "Add route scenario source", "", "GenericObject", "Object"},
		{"post", "/routing/preset-sources/update", "Routing", "Update route scenario sources", "", "GenericObject", "Object"},
		{"post", "/routing/preset-sources/delete", "Routing", "Delete route scenario source", "", "GenericObject", "Object"},
		{"post", "/routing/preset-sources/toggle", "Routing", "Enable or disable route scenario source", "", "GenericObject", "Object"},

		{"get", "/server-meta", "Servers", "Get server metadata", "Country, labels, active server and user metadata for outbounds.", "", "Object"},
		{"post", "/server-meta", "Servers", "Save server metadata", "", "GenericObject", "Object"},
		{"post", "/outbounds/check", "Servers", "Check outbound proxies", "Runs connectivity checks for one or more outbound tags.", "GenericObject", "Object"},
		{"post", "/outbounds/check-history/settings", "Servers", "Save outbound check history settings", "", "GenericObject", "Object"},
		{"get", "/subscriptions", "Servers", "Get subscriptions", "Subscription pools, candidates, selected servers and refresh schedule.", "", "Object"},
		{"post", "/subscriptions/pool", "Servers", "Save subscription pool", "", "GenericObject", "Object"},
		{"post", "/subscriptions/delete", "Servers", "Delete subscription pool", "", "GenericObject", "Object"},
		{"post", "/subscriptions/select", "Servers", "Select subscription candidate", "", "GenericObject", "Object"},
		{"post", "/subscriptions/check-candidate", "Servers", "Check subscription candidate", "", "GenericObject", "Object"},
		{"post", "/subscriptions/export", "Servers", "Export subscription candidates", "", "GenericObject", "Object"},
		{"post", "/subscriptions/refresh", "Servers", "Refresh subscription", "", "GenericObject", "Object"},
		{"post", "/subscriptions/refresh-all", "Servers", "Refresh all subscriptions", "", "GenericObject", "Object"},
		{"post", "/subscriptions/schedule", "Servers", "Save subscription auto-refresh schedule", "", "GenericObject", "Object"},
		{"post", "/subscriptions/fallback", "Servers", "Run subscription fallback", "", "GenericObject", "Object"},
		{"get", "/subscriptions/fallback-progress", "Servers", "Get fallback progress", "", "", "Object"},

		{"get", "/profiles", "Profiles", "List profiles", "", "", "Object"},
		{"post", "/profiles", "Profiles", "Save profile", "", "GenericObject", "Object"},
		{"get", "/profiles/get", "Profiles", "Get profile", "Query parameter: name.", "", "Object"},
		{"post", "/profiles/delete", "Profiles", "Delete profile", "", "GenericObject", "Object"},
		{"post", "/profiles/activate", "Profiles", "Activate profile", "", "GenericObject", "Object"},

		{"get", "/diagnostics", "Diagnostics", "Get diagnostics snapshot", "Router, Xray, DNS, Podkop, B4, firewall and service diagnostics.", "", "Object"},
		{"get", "/diagnostics/package", "Diagnostics", "Download diagnostic package", "Returns a zip archive with sanitized config, status and command outputs.", "", "Binary"},
		{"post", "/diagnostics/http-probe", "Diagnostics", "Run router HTTP probe", "", "GenericObject", "Object"},
		{"post", "/diagnostics/domain-probe", "Diagnostics", "Run domain proxy probe", "", "GenericObject", "Object"},
		{"post", "/diagnostics/dpi-probe", "Diagnostics", "Run DPI/connectivity probe", "", "GenericObject", "Object"},
		{"get", "/domain-monitor", "Diagnostics", "Get live domain monitor", "Query parameter: limit.", "", "Object"},
		{"post", "/domain-monitor", "Diagnostics", "Control live domain monitor", "Starts, stops or clears the monitor.", "GenericObject", "Object"},
		{"get", "/logs", "Diagnostics", "Read RuOpenRay logs", "Returns text/plain. Query parameters select log kind and line count.", "", "Text"},
		{"post", "/sni/scan", "Diagnostics", "Scan SNI proximity", "", "GenericObject", "Object"},
		{"get", "/dhcp/leases", "Diagnostics", "List DHCP leases", "", "", "Object"},

		{"get", "/geo/status", "Geo", "Get geodata status", "", "", "Object"},
		{"get", "/geo/catalog", "Geo", "Read geodata catalog", "Query parameters: kind, code, full, file.", "", "Object"},
		{"post", "/geo/catalog", "Geo", "Save geodata catalog category", "", "GenericObject", "Object"},
		{"post", "/geo/audit", "Geo", "Audit geodata/rules", "", "GenericObject", "Object"},
		{"post", "/geo/sources", "Geo", "Save custom geodata sources", "", "GenericObject", "Object"},
		{"post", "/geo/preset-overrides", "Geo", "Save geodata preset overrides", "", "GenericObject", "Object"},
		{"post", "/geo/lists", "Geo", "Save user geo lists", "", "GenericObject", "Object"},
		{"post", "/geo/update", "Geo", "Update geodata", "", "GenericObject", "Object"},
		{"post", "/geo/upload", "Geo", "Upload geodata file", "multipart/form-data upload.", "MultipartForm", "Object"},
		{"get", "/geo/download", "Geo", "Download geodata file", "Query parameter: file.", "", "Binary"},
		{"post", "/geo/delete", "Geo", "Delete geodata file", "", "GenericObject", "Object"},
		{"post", "/geo/schedule", "Geo", "Save geodata update schedule", "", "GenericObject", "Object"},
		{"post", "/geo/cleanup", "Geo", "Cleanup geodata backups", "", "GenericObject", "Object"},

		{"post", "/import", "Servers", "Import server link", "", "GenericObject", "Object"},
		{"post", "/import/preview", "Servers", "Preview import", "", "GenericObject", "Object"},
		{"post", "/import/subscription", "Servers", "Import subscription", "", "GenericObject", "Object"},

		{"get", "/settings/logging", "System", "Get logging settings", "", "", "Object"},
		{"post", "/settings/logging", "System", "Save logging settings", "", "GenericObject", "Object"},
		{"post", "/settings/logging/clear", "System", "Clear log files", "", "", "Object"},
		{"get", "/settings/service", "System", "Get service settings", "", "", "Object"},
		{"post", "/settings/service", "System", "Save service settings", "", "GenericObject", "Object"},
		{"post", "/settings/password", "Auth", "Change panel password", "", "GenericObject", "Object"},
		{"get", "/storage/report", "System", "Get storage report", "", "", "Object"},
		{"post", "/storage/cleanup", "System", "Cleanup storage", "", "GenericObject", "Object"},
		{"get", "/install/plan", "System", "Get install plan", "", "", "Object"},
		{"get", "/network/tcp-fast-open", "System", "Get TCP Fast Open status", "", "", "Object"},
		{"post", "/network/tcp-fast-open", "System", "Set TCP Fast Open", "", "GenericObject", "Object"},
		{"get", "/xray/stats", "System", "Get Xray traffic stats", "", "", "Object"},
		{"post", "/xray/stats/settings", "System", "Save Xray stats settings", "", "GenericObject", "Object"},
		{"post", "/xray/stats/reset", "System", "Reset Xray traffic stats", "", "", "Object"},
		{"get", "/core/releases", "System", "List Xray-core releases", "", "", "Object"},
		{"post", "/core/update", "System", "Update Xray-core", "", "GenericObject", "Object"},
		{"get", "/app/releases", "System", "Get RuOpenRay UI release", "", "", "Object"},
		{"post", "/app/update", "System", "Update RuOpenRay UI", "", "GenericObject", "Object"},
		{"post", "/backup", "Backups", "Create active config backup", "", "", "Object"},
		{"post", "/backup/full", "Backups", "Create full backup bundle", "", "", "Object"},
		{"get", "/backup/latest", "Backups", "Get latest backup", "", "", "Object"},
		{"post", "/backup/restore", "Backups", "Restore backup", "", "GenericObject", "Object"},
	}
}

func addOpenAPIEndpoint(paths map[string]any, endpoint apiEndpoint) {
	item, _ := paths[endpoint.path].(map[string]any)
	if item == nil {
		item = map[string]any{}
		paths[endpoint.path] = item
	}
	operation := map[string]any{
		"tags":        []string{endpoint.tag},
		"summary":     endpoint.summary,
		"description": endpoint.description,
		"responses": map[string]any{
			"200": map[string]any{
				"description": "OK",
				"content":     openAPIResponseContent(endpoint.response),
			},
			"401": map[string]any{
				"description": "Unauthorized",
				"content":     openAPIJSONRef("ErrorResponse"),
			},
			"404": map[string]any{
				"description": "Not found",
				"content":     openAPIJSONRef("ErrorResponse"),
			},
		},
	}
	if endpoint.path != "/version" && endpoint.path != "/openapi.json" && endpoint.path != "/login" {
		operation["security"] = []map[string][]string{{"BearerAuth": {}}, {"SessionCookie": {}}}
	}
	if endpoint.request != "" {
		operation["requestBody"] = map[string]any{
			"required": true,
			"content":  openAPIRequestContent(endpoint.request),
		}
	}
	item[endpoint.method] = operation
}

func openAPISchemas() map[string]any {
	return map[string]any{
		"OkResponse": map[string]any{
			"type":       "object",
			"properties": map[string]any{"ok": map[string]string{"type": "boolean"}},
		},
		"ErrorResponse": map[string]any{
			"type":       "object",
			"properties": map[string]any{"ok": map[string]string{"type": "boolean"}, "error": map[string]string{"type": "string"}},
		},
		"LoginRequest": map[string]any{
			"type":       "object",
			"required":   []string{"password"},
			"properties": map[string]any{"password": map[string]string{"type": "string"}, "remember": map[string]string{"type": "boolean"}},
		},
		"LoginResponse": map[string]any{
			"type":       "object",
			"properties": map[string]any{"ok": map[string]string{"type": "boolean"}, "token": map[string]string{"type": "string"}},
		},
		"VersionResponse": map[string]any{
			"type": "object",
			"properties": map[string]any{
				"ok":         map[string]string{"type": "boolean"},
				"name":       map[string]string{"type": "string"},
				"apiVersion": map[string]string{"type": "string"},
				"appVersion": map[string]string{"type": "string"},
				"openapi":    map[string]string{"type": "string"},
				"auth":       map[string]string{"type": "object"},
			},
		},
		"ConfigRequest": map[string]any{
			"type":       "object",
			"properties": map[string]any{"config": map[string]string{"type": "object"}},
		},
		"GenericObject": map[string]string{"type": "object"},
		"Object":        map[string]string{"type": "object"},
	}
}

func openAPIRequestContent(schemaName string) map[string]any {
	if schemaName == "MultipartForm" {
		return map[string]any{
			"multipart/form-data": map[string]any{"schema": map[string]string{"type": "object"}},
		}
	}
	return openAPIJSONRef(schemaName)
}

func openAPIResponseContent(schemaName string) map[string]any {
	switch schemaName {
	case "Binary":
		return map[string]any{"application/octet-stream": map[string]any{"schema": map[string]string{"type": "string", "format": "binary"}}}
	case "Text":
		return map[string]any{"text/plain": map[string]any{"schema": map[string]string{"type": "string"}}}
	default:
		return openAPIJSONRef(schemaName)
	}
}

func openAPIJSONRef(schemaName string) map[string]any {
	if schemaName == "" {
		schemaName = "Object"
	}
	return map[string]any{
		"application/json": map[string]any{
			"schema": map[string]string{"$ref": "#/components/schemas/" + schemaName},
		},
	}
}
