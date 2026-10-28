package main

import (
	"os/exec"
	"syscall"
)

func detachAppWatchdog(cmd *exec.Cmd) { cmd.SysProcAttr = &syscall.SysProcAttr{Setsid: true} }
