package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestFirstRunGeneratesAndPreservesPrivatePassword(t *testing.T) {
	s := &serverState{cfg: appConfig{DataDir: t.TempDir()}}
	if err := s.ensureInitialPassword(); err != nil {
		t.Fatal(err)
	}
	first := s.cfg.Password
	if len(first) < 32 || first == "admin" {
		t.Fatal("weak initial password")
	}
	s.cfg.Password = ""
	if err := s.ensureInitialPassword(); err != nil || s.cfg.Password != first {
		t.Fatal("restart changed credentials", err)
	}
	s.cfg.Password = "operator supplied"
	if err := s.ensureInitialPassword(); err != nil || s.cfg.Password != "operator supplied" {
		t.Fatal("overwrote explicit credentials")
	}
	s.cfg.Password = ""
	os.WriteFile(filepath.Join(s.cfg.DataDir, "initial-password"), []byte("broken"), 0600)
	if s.ensureInitialPassword() == nil {
		t.Fatal("silently accepted broken first-run secret")
	}
}
