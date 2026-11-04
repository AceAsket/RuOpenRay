package main

import (
	"fmt"

	rproxy "github.com/AceAsket/RuOpenRay/internal/proxy"
)

// The stable pool outbound owns the user's transport policy. Subscription
// candidates still supply fresh endpoints, credentials and TLS settings.
func cloneSubscriptionOutbound(candidate, current map[string]any, tag string) map[string]any {
	cloned := rproxy.CloneOutboundWithTag(candidate, tag)
	currentClone := rproxy.CloneOutboundWithTag(current, tag)
	currentStream := mapValue(currentClone["streamSettings"])
	mask, hasMask := currentStream["finalmask"]
	dialer := fragmentDialerProxy(currentClone)
	if !hasMask && dialer == "" {
		return cloned
	}
	stream, _ := cloned["streamSettings"].(map[string]any)
	if stream == nil {
		stream = map[string]any{}
		cloned["streamSettings"] = stream
	}
	if hasMask {
		stream["finalmask"] = mask
	}
	if dialer != "" {
		sockopt, _ := stream["sockopt"].(map[string]any)
		if sockopt == nil {
			sockopt = map[string]any{}
			stream["sockopt"] = sockopt
		}
		sockopt["dialerProxy"] = dialer
	} else if _, generated := rproxy.FragmentOutboundFromTag(fragmentDialerProxy(cloned)); generated && hasNativeTCPFragment(currentStream) {
		// A provider's legacy companion must not add a second fragment layer to
		// the locally selected native mask. Custom dialers remain untouched.
		sockopt := mapValue(stream["sockopt"])
		delete(sockopt, "dialerProxy")
		if len(sockopt) == 0 {
			delete(stream, "sockopt")
		}
	}
	return cloned
}

func hasNativeTCPFragment(stream map[string]any) bool {
	for _, item := range anySlice(mapValue(stream["finalmask"])["tcp"]) {
		if mapValue(item)["type"] == "fragment" {
			return true
		}
	}
	return false
}

func activeOutboundByTag(outbounds []any, tag string) map[string]any {
	for _, item := range outbounds {
		if outbound, ok := item.(map[string]any); ok && fmt.Sprint(outbound["tag"]) == tag {
			return outbound
		}
	}
	return nil
}
