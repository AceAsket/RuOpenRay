//go:build !linux

package main

// Service mutations are supported on Linux; previews use the process mutex.
func lockMutationFile(string) (func(), error) { return func() {}, nil }
