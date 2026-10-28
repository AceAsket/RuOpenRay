package proxy

import (
	"encoding/base64"
	"strings"
)

type ImportIssue struct {
	Entry   int    `json:"entry"`
	Message string `json:"message"`
}
type ImportReport struct {
	Total    int           `json:"total"`
	Accepted int           `json:"accepted"`
	Skipped  int           `json:"skipped"`
	Issues   []ImportIssue `json:"issues"`
}

// Keep unsupported entries so the preview cannot silently hide import failures.
func SubscriptionEntries(body string) []string {
	text := strings.TrimSpace(body)
	if !strings.Contains(text, "://") {
		compact := strings.Join(strings.Fields(text), "")
		for _, encoding := range []*base64.Encoding{base64.StdEncoding, base64.RawStdEncoding, base64.URLEncoding, base64.RawURLEncoding} {
			if decoded, err := encoding.DecodeString(compact); err == nil && strings.Contains(string(decoded), "://") {
				text = string(decoded)
				break
			}
		}
	}
	// A URI fragment may contain unescaped spaces in provider-generated names.
	// Split records only on line breaks, never inside the display name.
	text = strings.TrimPrefix(text, "\ufeff")
	text = strings.ReplaceAll(strings.ReplaceAll(text, "\r\n", "\n"), "\r", "\n")
	entries := []string{}
	for _, line := range strings.Split(text, "\n") {
		line = strings.TrimSpace(line)
		if line != "" && !strings.HasPrefix(line, "#") {
			entries = append(entries, line)
		}
	}
	return entries
}

func ParseSubscriptionEntries(entries []string) ([]map[string]any, ImportReport) {
	report := ImportReport{Total: len(entries), Issues: []ImportIssue{}}
	outbounds := []map[string]any{}
	for i, entry := range entries {
		outbound, err := ParseShareLink(entry)
		if err != nil {
			if len(report.Issues) < 100 {
				report.Issues = append(report.Issues, ImportIssue{Entry: i + 1, Message: err.Error()})
			}
			report.Skipped++
			continue
		}
		outbounds = append(outbounds, outbound)
		report.Accepted++
	}
	return outbounds, report
}
