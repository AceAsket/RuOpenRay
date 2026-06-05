package main

import "testing"

func TestParseAppReleaseIgnoresTinyAssetSize(t *testing.T) {
	raw := map[string]any{
		"tag_name": "v0.3.8",
		"assets": []any{
			map[string]any{
				"name":                 ruOpenRayAssetName(),
				"browser_download_url": "https://example.test/ruopenray-ui",
				"size":                 float64(8),
			},
		},
	}
	release := parseAppRelease(raw)
	if got := release["assetSize"]; got != 0 {
		t.Fatalf("assetSize = %v, want 0 for suspicious tiny asset", got)
	}
}

func TestParseAppReleaseKeepsBinaryAssetSize(t *testing.T) {
	raw := map[string]any{
		"tag_name": "v0.3.8",
		"assets": []any{
			map[string]any{
				"name":                 ruOpenRayAssetName(),
				"browser_download_url": "https://example.test/ruopenray-ui",
				"size":                 float64(8 * 1024 * 1024),
			},
		},
	}
	release := parseAppRelease(raw)
	if got := release["assetSize"]; got != 8*1024*1024 {
		t.Fatalf("assetSize = %v, want %d", got, 8*1024*1024)
	}
}
