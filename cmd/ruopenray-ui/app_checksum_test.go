package main

import (
	"fmt"
	"strings"
	"testing"
)

func TestAppChecksumUsesOfficialDigestAndChecksArchitecture(t *testing.T) {
	sum := strings.Repeat("a", 64)
	got, err := appExpectedSHA256(map[string]any{"assetDigest": "sha256:" + sum}, func(string, int64) ([]byte, error) { t.Fatal("digest should avoid another download"); return nil, nil })
	if err != nil || got != sum {
		t.Fatalf("digest: %s %v", got, err)
	}
	address := "https://github.com/" + appRepoFullName + "/releases/download/v0.5.1-rc4/" + ruOpenRayAssetName()
	for _, name := range []string{ruOpenRayAssetName(), "wrong-architecture"} {
		got, err := appExpectedSHA256(map[string]any{"assetUrl": address}, func(url string, limit int64) ([]byte, error) {
			if url != address+".sha256" {
				t.Fatal(url)
			}
			return []byte(fmt.Sprintf("%s  %s\n", sum, name)), nil
		})
		if name == ruOpenRayAssetName() {
			if err != nil || got != sum {
				t.Fatal(err)
			}
		} else if err == nil {
			t.Fatal("accepted checksum for another asset")
		}
	}
	if _, err := appExpectedSHA256(map[string]any{"assetUrl": "https://example.test/mirror"}, nil); err == nil {
		t.Fatal("trusted checksum from arbitrary mirror")
	}
}
