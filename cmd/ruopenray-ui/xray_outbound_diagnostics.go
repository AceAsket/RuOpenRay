package main

import (
	"context"
	"regexp"
	"runtime"
	"strings"
	"time"
)

const maxOutboundValidationErrors = 8

var outboundBuildFailure = regexp.MustCompile(`(?i)failed to build outbound config with tag `)

type xrayConfigTester func(context.Context, map[string]any) map[string]any

// Match a configured tag, not a guessed transport restriction. Xray's tag is
// unquoted, so ambiguous tags or an unfamiliar error format remain unassigned.
func xrayOutboundError(cfg, result map[string]any) (map[string]any, bool) {
	if result["ok"] == true {
		return nil, false
	}
	output := stringsTrim(result["stdout"]) + "\n" + stringsTrim(result["stderr"])
	position := outboundBuildFailure.FindStringIndex(output)
	if position == nil {
		return nil, false
	}
	remainder := output[position[1]:]
	var tag, message string
	matches := 0
	for _, item := range asArray(cfg["outbounds"]) {
		candidate, _ := mapValue(item)["tag"].(string)
		if candidate == "" || !strings.HasPrefix(remainder, candidate+" > ") {
			continue
		}
		reason := strings.SplitN(strings.TrimPrefix(remainder, candidate+" > "), "\n", 2)[0]
		if reason = strings.TrimSpace(reason); reason != "" {
			matches++
			tag, message = candidate, reason
		}
	}
	if matches == 1 {
		return map[string]any{"tag": tag, "message": message, "source": "xray"}, true
	}
	return nil, false
}

// After each confirmed failure, substitute an inert outbound only in a private
// copy. Retaining its tag keeps routing and dialer references intact while the
// real core checks the remaining outbounds. The original validation result and
// the user's candidate are never replaced by these diagnostic configurations.
func collectXrayOutboundErrors(ctx context.Context, cfg, first map[string]any, test xrayConfigTester) ([]map[string]any, bool) {
	errors := []map[string]any{}
	if first["ok"] == true {
		return errors, true
	}
	candidate := cloneConfigMap(cfg)
	seen := map[string]bool{}
	result := first
	for {
		failure, found := xrayOutboundError(candidate, result)
		if !found || len(errors) >= maxOutboundValidationErrors {
			return errors, false
		}
		tag := failure["tag"].(string)
		if seen[tag] {
			return errors, false
		}
		seen[tag] = true
		errors = append(errors, failure)
		for index, item := range asArray(candidate["outbounds"]) {
			if mapValue(item)["tag"] == tag {
				asArray(candidate["outbounds"])[index] = map[string]any{"tag": tag, "protocol": "freedom"}
				break
			}
		}
		if ctx.Err() != nil {
			return errors, false
		}
		result = test(ctx, candidate)
		if ctx.Err() != nil {
			return errors, false
		}
		if result["ok"] == true {
			return errors, true
		}
	}
}

func (s *serverState) attachXrayOutboundErrors(cfg, result map[string]any) {
	result["outboundErrors"] = []map[string]any{}
	result["outboundErrorsComplete"] = false
	if runtime.GOOS == "windows" {
		// validateConfig's Windows development mode does not run an Xray core.
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	normalized := cloneConfigMap(cfg)
	normalizeCatchAllRoutingRules(normalized)
	normalizeSniffingDomainExclusions(normalized)
	ensureFragmentOutboundsInConfig(normalized)
	errors, complete := collectXrayOutboundErrors(ctx, normalized, result, s.testXrayConfig)
	result["outboundErrors"] = errors
	result["outboundErrorsComplete"] = complete
}
