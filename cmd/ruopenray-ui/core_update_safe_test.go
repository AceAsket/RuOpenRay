package main

import (
	"crypto/sha256"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestCoreDigest(t *testing.T) {
	body := []byte("official archive")
	digest := []byte(fmt.Sprintf("SHA2-256= %x\n", sha256.Sum256(body)))
	if err := verifyCoreDigest(body, digest); err != nil {
		t.Fatal(err)
	}
	if verifyCoreDigest([]byte("corrupted"), digest) == nil {
		t.Fatal("corruption accepted")
	}
	if verifyCoreDigest(body, []byte("SHA1= 123")) == nil {
		t.Fatal("missing checksum accepted")
	}
}

func TestCoreReplacementTransaction(t *testing.T) {
	for _, scenario := range []string{"success", "no-retention", "prepare-fails", "activation-fails", "rollback-fails", "rename-fails"} {
		t.Run(scenario, func(t *testing.T) {
			dir := t.TempDir()
			target := filepath.Join(dir, "xray")
			if err := os.WriteFile(target, []byte("old"), 0755); err != nil {
				t.Fatal(err)
			}
			staged, err := stageExecutable(target, []byte("new"))
			if err != nil {
				t.Fatal(err)
			}
			defer os.Remove(staged)
			calls := 0
			backup, err := replaceCoreTransaction(target, staged, scenario != "no-retention", func() error {
				body, _ := os.ReadFile(target)
				if string(body) != "old" {
					t.Fatal("preparation changed live binary")
				}
				if scenario == "prepare-fails" {
					return fmt.Errorf("invalid config")
				}
				if scenario == "rename-fails" {
					_ = os.Remove(staged)
				}
				return nil
			}, func() error {
				calls++
				body, _ := os.ReadFile(target)
				if calls == 1 && string(body) != "new" {
					t.Fatal("activation must see complete new binary")
				}
				if calls == 2 && string(body) != "old" {
					t.Fatal("rollback must restore binary before restart")
				}
				if scenario == "rollback-fails" || (scenario == "activation-fails" && calls == 1) {
					return fmt.Errorf("health failed")
				}
				return nil
			})
			body, _ := os.ReadFile(target)
			if scenario == "success" || scenario == "no-retention" {
				if err != nil || string(body) != "new" || calls != 1 {
					t.Fatalf("success: %q %d %v", body, calls, err)
				}
			} else if err == nil || string(body) != "old" {
				t.Fatalf("failure did not preserve old core: %q %v", body, err)
			}
			if strings.HasSuffix(scenario, "fails") && (scenario == "prepare-fails" || scenario == "rename-fails") && calls != 0 {
				t.Fatal("restart during failed preparation")
			}
			if scenario == "success" {
				copy, readErr := os.ReadFile(backup)
				if readErr != nil || string(copy) != "old" {
					t.Fatal("rollback backup missing")
				}
			}
			if scenario == "no-retention" && backup != "" {
				t.Fatal("backup not cleaned after success")
			}
		})
	}
}
