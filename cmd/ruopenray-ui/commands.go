package main

import (
	"context"
	"fmt"
	"os/exec"
	"strings"
	"time"
)

func run(name string, args ...string) map[string]any {
	cmd := exec.Command(name, args...)
	out, err := cmd.CombinedOutput()
	stdout := strings.TrimSpace(string(out))
	result := map[string]any{"ok": err == nil, "code": 0, "stdout": stdout, "stderr": "", "message": ""}
	if err != nil {
		result["message"] = err.Error()
		result["stderr"] = err.Error()
	}
	return result
}

func runTimeout(timeout time.Duration, name string, args ...string) map[string]any {
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, name, args...)
	out, err := cmd.CombinedOutput()
	stdout := strings.TrimSpace(string(out))
	result := map[string]any{"ok": err == nil, "code": 0, "stdout": stdout, "stderr": "", "message": ""}
	if ctx.Err() == context.DeadlineExceeded {
		result["ok"] = false
		result["stderr"] = "команда превысила лимит времени"
		result["message"] = ctx.Err().Error()
		return result
	}
	if err != nil {
		result["message"] = err.Error()
		result["stderr"] = err.Error()
	}
	return result
}

func concatCommandOutput(items ...map[string]any) string {
	var lines []string
	for _, item := range items {
		if item == nil {
			continue
		}
		if stdout := strings.TrimSpace(fmt.Sprint(item["stdout"])); stdout != "" && stdout != "<nil>" {
			lines = append(lines, stdout)
		}
		if stderr := strings.TrimSpace(fmt.Sprint(item["stderr"])); stderr != "" && stderr != "<nil>" {
			lines = append(lines, stderr)
		}
	}
	return strings.Join(lines, "\n\n")
}
