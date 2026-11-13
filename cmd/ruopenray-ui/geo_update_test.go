package main

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func TestSeparateGeoTargets(t *testing.T) {
	geoip, geosite := separateGeoTargets("runet")
	if geoip != "runet-geoip.dat" || geosite != "runet-geosite.dat" {
		t.Fatalf("unexpected targets: %s %s", geoip, geosite)
	}
}

func TestNormalizeGeoPresetOverridesKeepsMode(t *testing.T) {
	overrides := normalizeGeoPresetOverrides(map[string]map[string]any{
		"runetfreedom": {"mode": "separate", "target": "runet"},
	})
	if overrides["runetfreedom"]["mode"] != "separate" {
		t.Fatalf("expected separate mode, got %#v", overrides["runetfreedom"])
	}
}

func TestExtraGeoPresetUsesSavedDownloadURL(t *testing.T) {
	for _, legacy := range []bool{false, true} {
		name := "current editor"
		if legacy {
			name = "legacy editor"
		}
		t.Run(name, func(t *testing.T) {
			s := reliabilityState(t)
			s.cfg.GeoDir = t.TempDir()
			s.geoStaging = true
			want := validGeoFixture(t, "override")
			remote := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path != "/new.dat" {
					w.WriteHeader(http.StatusNotFound)
					return
				}
				_, _ = w.Write(want)
			}))
			defer remote.Close()
			override := map[string]any{"geositeUrl": remote.URL + "/new.dat"}
			if legacy {
				override["url"] = override["geositeUrl"]
				override["geositeUrl"] = remote.URL + "/old.dat"
			}
			saved := s.saveGeoPresetOverrides(map[string]any{
				"overrides": map[string]any{"antifilter-community": override},
			})
			if saved["ok"] != true {
				t.Fatal(saved)
			}
			result := s.updateGeoStaged(map[string]any{"preset": "antifilter-community"})
			if result["ok"] != true {
				t.Fatal(result["stderr"])
			}
			actual, err := os.ReadFile(filepath.Join(s.cfg.GeoDir, "LoyalsoldierSite.dat"))
			if err != nil || !bytes.Equal(actual, want) {
				t.Fatalf("extra DAT was not downloaded from the saved URL: %v", err)
			}
		})
	}
}
