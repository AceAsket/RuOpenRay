package main

import (
	"encoding/hex"
	"fmt"
	"strings"
	"time"
)

func appExpectedSHA256(release map[string]any, fetch func(string, int64) ([]byte, error)) (string, error) {
	valid := func(value string) bool {
		decoded, err := hex.DecodeString(value)
		return err == nil && len(decoded) == 32
	}
	if digest, _ := release["assetDigest"].(string); digest != "" {
		if !strings.HasPrefix(digest, "sha256:") || !valid(strings.TrimPrefix(digest, "sha256:")) {
			return "", fmt.Errorf("Некорректный digest бинарника в GitHub release")
		}
		return strings.ToLower(strings.TrimPrefix(digest, "sha256:")), nil
	}
	address, _ := release["assetUrl"].(string)
	if !strings.HasPrefix(address, "https://github.com/"+appRepoFullName+"/releases/download/") {
		return "", fmt.Errorf("Контрольная сумма должна поступать из официального релиза")
	}
	body, err := fetch(address+".sha256", 16<<10)
	if err != nil {
		return "", fmt.Errorf("Не удалось получить официальный SHA-256: %w", err)
	}
	parts := strings.Fields(string(body))
	if len(parts) != 2 || !valid(parts[0]) || strings.TrimPrefix(parts[1], "*") != ruOpenRayAssetName() {
		return "", fmt.Errorf("Некорректный SHA-256 файл для этой архитектуры")
	}
	return strings.ToLower(parts[0]), nil
}

func downloadAppChecksum(address string, limit int64) ([]byte, error) {
	return boundedDownloadWithTimeout(address, limit, 20*time.Second)
}
