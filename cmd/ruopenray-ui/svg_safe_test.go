package main

import "testing"

func TestPresetSVGRejectsActiveAndEncodedContent(t *testing.T) {
	for _, svg := range []string{
		`<svg><a href="java&#x73;cript:void(0)"><text>link</text></a></svg>`,
		`<svg><animate attributeName="href" values="javascript:void(0)"/></svg>`,
		`<svg><path fill="u&#x72;l(https://example.test/a)"/></svg>`,
		`<svg/><svg/>`, `<svg/><img src="x"/>`, `<svg xmlns="https://example.test"/>`,
		`<!DOCTYPE svg><svg/>`, `<svg><foreignObject/></svg>`, `<svg><path onload="void(0)"/></svg>`,
	} {
		if safePresetSVG(svg) {
			t.Fatalf("unsafe SVG accepted: %s", svg)
		}
	}
	for _, svg := range []string{`<svg class="brand-icon" viewBox="0 0 24 24"><path fill="#fff" d="M0 0z"/></svg>`, `<svg xmlns="http://www.w3.org/2000/svg"><defs><clipPath id="shape"><rect width="1" height="1"/></clipPath></defs><path clip-path="url(#shape)" d="M0 0z"/></svg>`} {
		if !safePresetSVG(svg) {
			t.Fatalf("safe SVG rejected: %s", svg)
		}
	}
}
