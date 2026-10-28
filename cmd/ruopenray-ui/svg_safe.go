package main

import (
	"encoding/xml"
	"io"
	"regexp"
	"strings"
)

var svgElements = stringSet(strings.Fields("svg g path rect circle ellipse line polyline polygon title desc defs clipPath mask linearGradient radialGradient stop"))
var svgAttributes = stringSet(strings.Fields("viewBox x y width height d fill stroke stroke-width opacity fill-rule clip-rule stroke-linecap stroke-linejoin transform cx cy r rx ry x1 y1 x2 y2 points offset stop-color stop-opacity fill-opacity stroke-opacity stroke-dasharray stroke-dashoffset gradientUnits gradientTransform id clip-path mask preserveAspectRatio vector-effect role aria-hidden focusable class"))
var svgLocalReference = regexp.MustCompile(`^url\(#[A-Za-z_][A-Za-z0-9_.-]*\)$`)

// XML decoding resolves entities before allow-list checks. No links, style,
// animation, handlers, foreign namespaces, directives, or external resources.
func safePresetSVG(svg string) bool {
	if len(svg) == 0 || len(svg) > 20000 {
		return false
	}
	d := xml.NewDecoder(strings.NewReader(svg))
	depth, roots := 0, 0
	for {
		token, err := d.Token()
		if err == io.EOF {
			return depth == 0 && roots == 1
		}
		if err != nil {
			return false
		}
		switch value := token.(type) {
		case xml.StartElement:
			if !svgElements[value.Name.Local] || value.Name.Space != "" && value.Name.Space != "http://www.w3.org/2000/svg" {
				return false
			}
			if depth == 0 {
				roots++
				if roots != 1 || value.Name.Local != "svg" {
					return false
				}
			}
			depth++
			if depth > 32 {
				return false
			}
			for _, attr := range value.Attr {
				if attr.Name.Local == "xmlns" && attr.Name.Space == "" {
					if attr.Value != "http://www.w3.org/2000/svg" {
						return false
					}
					continue
				}
				if attr.Name.Space != "" || !svgAttributes[attr.Name.Local] {
					return false
				}
				text := strings.ToLower(strings.TrimSpace(attr.Value))
				if strings.ContainsAny(text, "\x00\r\n\t") || strings.Contains(text, "javascript:") || strings.Contains(text, "data:") || strings.Contains(text, "url(") && !svgLocalReference.MatchString(attr.Value) {
					return false
				}
			}
		case xml.EndElement:
			depth--
		case xml.CharData:
			if depth == 0 && strings.TrimSpace(string(value)) != "" {
				return false
			}
		case xml.Comment:
		default:
			return false
		}
	}
}
