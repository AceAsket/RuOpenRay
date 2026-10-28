//go:build !linux

package main

import "os/exec"

func detachAppWatchdog(cmd *exec.Cmd) {}
