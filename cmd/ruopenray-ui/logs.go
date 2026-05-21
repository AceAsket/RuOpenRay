package main

import (
	"context"
	"fmt"
	"net/url"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"github.com/AceAsket/RuOpenRay/internal/logview"
)

func (s *serverState) readLogs(query url.Values) string {
	key := query.Encode()
	now := time.Now()
	s.metricsMu.Lock()
	if key == s.logCacheKey && now.Sub(s.logCacheAt) < 5*time.Second {
		text := s.logCacheText
		s.metricsMu.Unlock()
		return text
	}
	s.metricsMu.Unlock()

	text := s.readLogsUncached(query)
	s.metricsMu.Lock()
	s.logCacheKey = key
	s.logCacheText = text
	s.logCacheAt = time.Now()
	s.metricsMu.Unlock()
	return text
}

func (s *serverState) readLogsUncached(query url.Values) string {
	kind := firstNonEmpty(query.Get("kind"), "error")
	search := strings.ToLower(strings.TrimSpace(query.Get("q")))
	level := strings.ToLower(strings.TrimSpace(query.Get("level")))
	sortOrder := strings.ToLower(strings.TrimSpace(firstNonEmpty(query.Get("sort"), "asc")))
	limit := number(firstNonEmpty(query.Get("lines"), "240"), 240)
	if limit < 20 {
		limit = 20
	}
	if limit > 2000 {
		limit = 2000
	}
	maxLines := limit * 4
	if maxLines < 320 {
		maxLines = 320
	}
	if search != "" {
		maxLines = limit * 8
	}
	if maxLines > 3000 {
		maxLines = 3000
	}
	paths := []string{}
	var blocks []string
	if runtime.GOOS != "windows" && (kind == "system" || kind == "all") {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		output, err := exec.CommandContext(ctx, "logread", "-e", "xray").Output()
		cancel()
		if err == nil && len(output) > 0 {
			if kind == "system" {
				return filterLogLines(string(output), search, level, sortOrder, limit)
			}
			blocks = append(blocks, logview.LastLines(string(output), maxLines))
		}
	}
	if kind == "access" || kind == "all" {
		settings := s.loggingSettings()
		paths = append(paths, s.normalizeManagedLogPath(fmt.Sprint(settings["accessPath"]), s.defaultAccessLogPath()), s.defaultAccessLogPath(), legacyAccessLogPath, filepath.Join(s.cfg.DataDir, "access.log"))
	}
	if kind == "error" || kind == "all" || kind == "system" {
		settings := s.loggingSettings()
		paths = append(paths, s.normalizeManagedLogPath(fmt.Sprint(settings["errorPath"]), s.defaultErrorLogPath()), s.defaultErrorLogPath(), legacyErrorLogPath, filepath.Join(s.cfg.DataDir, "error.log"))
	}
	seen := map[string]bool{}
	for _, path := range paths {
		if seen[path] {
			continue
		}
		seen[path] = true
		body, err := logview.TailFile(path, maxLines)
		if err == nil {
			blocks = append(blocks, body)
		}
	}
	if len(blocks) == 0 {
		return "Лог " + kind + " пока не найден."
	}
	return filterLogLines(strings.Join(blocks, "\n"), search, level, sortOrder, limit)
}

func readLogTailLines(path string, maxLines int) (string, error) {
	return logview.TailFile(path, maxLines)
}

func lastLines(text string, maxLines int) string {
	return logview.LastLines(text, maxLines)
}

func filterLogLines(content, search, level, sortOrder string, limit int) string {
	return logview.FilterLines(content, logview.FilterOptions{
		Search:       search,
		Level:        level,
		Sort:         sortOrder,
		Limit:        limit,
		EmptyMessage: "По выбранным фильтрам строки не найдены.",
	})
}

func parseLogLineTime(line string) int64 {
	return logview.ParseLineTime(line)
}
