package main

import (
	"errors"
	"os"
	"path/filepath"
	"sync"
)

var mutationLocks sync.Map
var errMutationBusy = errors.New("Выполняется другая операция изменения настроек. Дождитесь её завершения и повторите запрос.")

func apiMutatesState(path string) bool {
	switch path {
	case "/firewall/preview", "/diagnostics/http-probe", "/diagnostics/domain-probe", "/diagnostics/tls-stability", "/diagnostics/dpi-probe", "/subscriptions/export", "/sni/scan", "/amnezia/preflight":
		return false
	case "/config/test", "/config/analyze", "/import/preview", "/subscriptions/check-candidate", "/subscriptions/check", "/subscriptions/check-all", "/routing/preset-sources/check", "/server-mode/preview", "/server-mode/client/export", "/server-mode/firewall/preview", "/dns/check", "/dns/benchmark", "/tls-stability/check", "/diagnostics/domain", "/diagnostics/dpi", "/diagnostics/tls":
		return false
	}
	return true
}

// Entrypoints acquire once, before reading state. Internal helpers never acquire
// this lock recursively. Linux flock also excludes cron and CLI processes.
func (s *serverState) beginMutation() (func(), error) {
	key, err := filepath.Abs(s.cfg.DataDir)
	if err != nil {
		return nil, err
	}
	value, _ := mutationLocks.LoadOrStore(key, &sync.Mutex{})
	mu := value.(*sync.Mutex)
	if !mu.TryLock() {
		return nil, errMutationBusy
	}
	// Firewall, service and UCI resources are router-wide even when two panel
	// instances use different DataDir values.
	name := filepath.Join(os.TempDir(), "ruopenray-operation.lock")
	unlockFile, err := lockMutationFile(name)
	if err != nil {
		mu.Unlock()
		return nil, err
	}
	return func() { unlockFile(); mu.Unlock() }, nil
}
