package main

import (
	"regexp"
	"strconv"
	"strings"
)

type releaseVersion struct {
	numbers [3]int
	pre     []string
}

func parseReleaseVersion(raw string) (releaseVersion, bool) {
	var result releaseVersion
	m := regexp.MustCompile(`^v?(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$`).FindStringSubmatch(raw)
	if m == nil {
		return result, false
	}
	for i := range result.numbers {
		n, err := strconv.Atoi(m[i+1])
		if err != nil {
			return result, false
		}
		result.numbers[i] = n
	}
	if m[4] != "" {
		result.pre = strings.Split(m[4], ".")
		for _, p := range result.pre {
			if p == "" {
				return result, false
			}
			if _, err := strconv.ParseUint(p, 10, 64); err == nil && len(p) > 1 && p[0] == '0' {
				return result, false
			}
		}
	}
	return result, true
}

func compareReleaseVersions(a, b string) (int, bool) {
	x, ok := parseReleaseVersion(a)
	if !ok {
		return 0, false
	}
	y, ok := parseReleaseVersion(b)
	if !ok {
		return 0, false
	}
	cmp := func(a, b int) int {
		if a < b {
			return -1
		}
		if a > b {
			return 1
		}
		return 0
	}
	for i := range x.numbers {
		if c := cmp(x.numbers[i], y.numbers[i]); c != 0 {
			return c, true
		}
	}
	if len(x.pre) == 0 && len(y.pre) == 0 {
		return 0, true
	}
	if len(x.pre) == 0 {
		return 1, true
	}
	if len(y.pre) == 0 {
		return -1, true
	}
	for i := 0; i < len(x.pre) && i < len(y.pre); i++ {
		a, b := x.pre[i], y.pre[i]
		if a == b {
			continue
		}
		an, ae := strconv.ParseUint(a, 10, 64)
		bn, be := strconv.ParseUint(b, 10, 64)
		if ae == nil && be == nil {
			if an < bn {
				return -1, true
			}
			return 1, true
		}
		if ae == nil {
			return -1, true
		}
		if be == nil {
			return 1, true
		}
		return strings.Compare(a, b), true
	}
	return cmp(len(x.pre), len(y.pre)), true
}

func appUpdateDecision(current, candidate string) (bool, string) {
	c, ok := compareReleaseVersions(candidate, current)
	if !ok {
		return false, "Версия сборки не допускает автоматическое сравнение; требуется выпуск с номером major.minor.patch"
	}
	if c <= 0 {
		return false, "В выбранном канале нет более новой версии"
	}
	return true, "Доступна более новая версия"
}

func appUpdateChannel(channels []string) string {
	if len(channels) > 0 && channels[0] == "test" {
		return "test"
	}
	return "stable"
}

func selectAppRelease(items []map[string]any, channel string) map[string]any {
	var selected map[string]any
	for _, item := range items {
		tag, _ := item["tag_name"].(string)
		version, valid := parseReleaseVersion(tag)
		if !valid || item["draft"] == true || (channel != "test" && (item["prerelease"] == true || len(version.pre) > 0)) {
			continue
		}
		if selected == nil {
			selected = item
			continue
		}
		if c, ok := compareReleaseVersions(tag, selected["tag_name"].(string)); ok && c > 0 {
			selected = item
		}
	}
	return selected
}
