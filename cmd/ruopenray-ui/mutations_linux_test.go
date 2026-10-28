//go:build linux

package main

import (
	"os"
	"os/exec"
	"testing"
)

func TestMutationLockExcludesSeparateProcess(t *testing.T) {
	if directory := os.Getenv("RUOPENRAY_LOCK_TEST_DIRECTORY"); directory != "" {
		s := &serverState{cfg: appConfig{DataDir: directory}}
		unlock, err := s.beginMutation()
		if err == errMutationBusy {
			os.Exit(0)
		}
		if err == nil {
			unlock()
		}
		os.Exit(21)
	}
	dir := t.TempDir()
	s := &serverState{cfg: appConfig{DataDir: dir}}
	unlock, err := s.beginMutation()
	if err != nil {
		t.Fatal(err)
	}
	defer unlock()
	for _, directory := range []string{dir, t.TempDir()} {
		cmd := exec.Command(os.Args[0], "-test.run=^TestMutationLockExcludesSeparateProcess$")
		cmd.Env = append(os.Environ(), "RUOPENRAY_LOCK_TEST_DIRECTORY="+directory)
		if output, err := cmd.CombinedOutput(); err != nil {
			t.Fatalf("cross-process lock: %s %v", output, err)
		}
	}
}
