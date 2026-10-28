package main

import (
	"encoding/xml"
	"io"
	"path/filepath"
	"strings"
	"testing"
)

func FuzzBackupDestination(f *testing.F) {
	for _, seed := range []string{"data/settings.json", "data/backups/archive.tar.gz", "data/../outside", "/etc/passwd", "data/..\\outside", "data/C:/outside", "data//outside"} {
		f.Add(seed)
	}
	root := f.TempDir()
	state := &serverState{cfg: appConfig{DataDir: filepath.Join(root, "data"), BackupDir: filepath.Join(root, "data", "backups")}, backupPaths: map[string]string{}}
	f.Fuzz(func(t *testing.T, name string) {
		if len(name) > 4096 {
			t.Skip()
		}
		target, err := state.backupDestination(name)
		if err != nil {
			return
		}
		if !strings.HasPrefix(name, "data/") {
			t.Fatal("accepted archive file outside supported namespaces")
		}
		if _, inside := backupRelative(state.cfg.DataDir, target); !inside {
			t.Fatal("archive path escapes data directory")
		}
		if _, inside := backupRelative(state.cfg.BackupDir, target); inside {
			t.Fatal("archive can replace backup directory")
		}
	})
}

func FuzzCatalogSVG(f *testing.F) {
	for _, seed := range []string{`<svg><path d="M0 0h1"/></svg>`, `<svg xmlns="http://www.w3.org/2000/svg"><circle r="1"/></svg>`, `<svg><a href="jav&#x61;script:alert(1)"/></svg>`, `<!DOCTYPE svg><svg/>`, `<svg onload="alert(1)"/>`} {
		f.Add(seed)
	}
	f.Fuzz(func(t *testing.T, input string) {
		if len(input) > 20_000 {
			t.Skip()
		}
		if !safePresetSVG(input) {
			return
		}
		decoder := xml.NewDecoder(strings.NewReader(input))
		for {
			token, err := decoder.Token()
			if err == io.EOF {
				return
			}
			if err != nil {
				t.Fatal("accepted invalid XML")
			}
			switch el := token.(type) {
			case xml.StartElement:
				switch strings.ToLower(el.Name.Local) {
				case "script", "style", "a", "image", "use", "foreignobject", "animate", "set", "iframe":
					t.Fatal("accepted active SVG element")
				}
				for _, attr := range el.Attr {
					name, value := strings.ToLower(attr.Name.Local), strings.ToLower(attr.Value)
					if strings.HasPrefix(name, "on") || name == "href" || name == "style" || strings.Contains(value, "javascript:") || strings.Contains(value, "data:") {
						t.Fatal("accepted active SVG attribute")
					}
				}
			case xml.Directive, xml.ProcInst:
				t.Fatal("accepted XML directive")
			}
		}
	})
}
