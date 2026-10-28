package main

import (
	"bytes"
	"fmt"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func validGeoFixture(t *testing.T, code string) []byte {
	t.Helper()
	items := []string{}
	for i := 0; i < 80; i++ {
		items = append(items, fmt.Sprintf("domain:s%d.example.test", i))
	}
	entry, _, err := buildGeoSiteCategory(code, items)
	if err != nil {
		t.Fatal(err)
	}
	return geoProtoMessage(1, entry)
}

func TestGeoTransactionPreservesBothFilesWhenSecondDownloadIsInvalid(t *testing.T) {
	s := reliabilityState(t)
	s.cfg.GeoDir = t.TempDir()
	old := validGeoFixture(t, "old")
	for _, name := range []string{"first.dat", "second.dat"} {
		os.WriteFile(filepath.Join(s.cfg.GeoDir, name), old, 0600)
	}
	valid := validGeoFixture(t, "new")
	remote := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/valid" {
			w.Write(valid)
		} else {
			w.Write([]byte(strings.Repeat("<html>error</html>", 100)))
		}
	}))
	defer remote.Close()
	result := s.runGeoTransaction(false, false, func(stage *serverState) map[string]any {
		first := stage.downloadGeoFile("first.dat", remote.URL+"/valid", false)
		second := stage.downloadGeoFile("second.dat", remote.URL+"/invalid", false)
		return map[string]any{"ok": first["ok"] == true && second["ok"] == true}
	})
	if result["ok"] != false {
		t.Fatal(result)
	}
	for _, name := range []string{"first.dat", "second.dat"} {
		after, _ := os.ReadFile(filepath.Join(s.cfg.GeoDir, name))
		if !bytes.Equal(old, after) {
			t.Fatalf("%s modified after failed download", name)
		}
	}
}

func TestGeoUploadRejectsPlaintextAndStreamsValidDatabase(t *testing.T) {
	s := reliabilityState(t)
	s.cfg.GeoDir = t.TempDir()
	old := validGeoFixture(t, "old")
	os.WriteFile(filepath.Join(s.cfg.GeoDir, "geosite.dat"), old, 0600)
	for _, valid := range []bool{false, true} {
		var requestBody bytes.Buffer
		form := multipart.NewWriter(&requestBody)
		part, _ := form.CreateFormFile("file", "upload.dat")
		body := []byte("not a database")
		if valid {
			body = validGeoFixture(t, "new")
		}
		part.Write(body)
		form.WriteField("restart", "false")
		form.Close()
		req := httptest.NewRequest(http.MethodPost, "/api/geo/upload", &requestBody)
		req.Header.Set("Content-Type", form.FormDataContentType())
		result := s.uploadGeoFile(req)
		after, _ := os.ReadFile(filepath.Join(s.cfg.GeoDir, "geosite.dat"))
		if valid {
			if result["ok"] != true || !bytes.Equal(body, after) {
				t.Fatal(result)
			}
		} else {
			if result["ok"] != false || !bytes.Equal(old, after) {
				t.Fatal("invalid upload replaced working database")
			}
		}
	}
	leftovers, _ := filepath.Glob(filepath.Join(s.cfg.GeoDir, ".ruopenray-geo-*"))
	if len(leftovers) != 0 {
		t.Fatalf("staging files leaked: %v", leftovers)
	}
}

func TestGeoDataValidationRejectsTruncatedFraming(t *testing.T) {
	body := validGeoFixture(t, "fixture")
	if err := validateGeoData(body); err != nil {
		t.Fatal(err)
	}
	for _, invalid := range [][]byte{nil, []byte("<html>"), body[:len(body)-1], {10, 255, 255}} {
		if validateGeoData(invalid) == nil {
			t.Fatalf("accepted invalid DAT: %x", invalid)
		}
	}
}
