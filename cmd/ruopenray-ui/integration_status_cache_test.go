package main

import (
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func awaitIntegrationProbe(t *testing.T, started <-chan struct{}) {
	t.Helper()
	select {
	case <-started:
	case <-time.After(5 * time.Second):
		t.Fatal("integration probe did not start")
	}
}

func awaitIntegrationResult(t *testing.T, results <-chan map[string]any) map[string]any {
	t.Helper()
	select {
	case result := <-results:
		return result
	case <-time.After(5 * time.Second):
		t.Fatal("integration status request did not finish")
		return nil
	}
}

func TestIntegrationStatusCacheCoalescesConcurrentMisses(t *testing.T) {
	for _, name := range []string{"b4", "amnezia"} {
		t.Run(name, func(t *testing.T) {
			state := &serverState{}
			cache := &state.b4StatusCache
			if name == "amnezia" {
				cache = &state.amneziaStatusCache
			}
			var calls atomic.Int32
			started, release := make(chan struct{}), make(chan struct{})
			var once sync.Once
			unblock := func() { once.Do(func() { close(release) }) }
			defer unblock()
			probe := func() map[string]any {
				if calls.Add(1) == 1 {
					close(started)
				}
				<-release
				return map[string]any{"component": name, "running": true}
			}
			const clients = 16
			results := make(chan map[string]any, clients)
			for i := 0; i < clients; i++ {
				go func() { results <- cache.get(time.Minute, probe) }()
			}
			awaitIntegrationProbe(t, started)
			unblock()
			for i := 0; i < clients; i++ {
				if result := awaitIntegrationResult(t, results); result["component"] != name || result["running"] != true {
					t.Fatalf("unexpected shared result: %#v", result)
				}
			}
			if calls.Load() != 1 {
				t.Fatalf("concurrent requests ran %d probes, want 1", calls.Load())
			}
			cache.mu.Lock()
			cache.storedAt = time.Now().Add(-2 * time.Minute)
			cache.mu.Unlock()
			cache.get(time.Minute, probe)
			if calls.Load() != 2 {
				t.Fatalf("expired status did not refresh: %d probes", calls.Load())
			}
		})
	}
}

func TestIntegrationStatusCacheStartsTTLAfterProbeFinishes(t *testing.T) {
	cache := &integrationStatusCache{}
	var probeFinished time.Time
	cache.get(time.Minute, func() map[string]any {
		probeFinished = time.Now()
		return map[string]any{"ok": true}
	})
	cache.mu.Lock()
	storedAt := cache.storedAt
	cache.mu.Unlock()
	if storedAt.Before(probeFinished) {
		t.Fatalf("cache timestamp %v precedes probe completion %v", storedAt, probeFinished)
	}
}

func TestIntegrationStatusCacheDoesNotPublishInvalidatedProbe(t *testing.T) {
	for _, name := range []string{"b4", "amnezia"} {
		t.Run(name, func(t *testing.T) {
			state := &serverState{}
			cache, invalidate := &state.b4StatusCache, state.clearB4Cache
			if name == "amnezia" {
				cache, invalidate = &state.amneziaStatusCache, state.clearAmneziaCache
			}
			var calls atomic.Int32
			started, release := make(chan struct{}), make(chan struct{})
			var once sync.Once
			unblock := func() { once.Do(func() { close(release) }) }
			defer unblock()
			probe := func() map[string]any {
				version := calls.Add(1)
				if version == 1 {
					close(started)
					<-release
				}
				return map[string]any{"version": version}
			}
			first, second := make(chan map[string]any, 1), make(chan map[string]any, 1)
			go func() { first <- cache.get(time.Minute, probe) }()
			awaitIntegrationProbe(t, started)
			// Invalidation must finish without waiting for a slow external command.
			invalidated := make(chan struct{})
			go func() { invalidate(); close(invalidated) }()
			awaitIntegrationProbe(t, invalidated)
			go func() { second <- cache.get(time.Minute, probe) }()
			unblock()
			if result := awaitIntegrationResult(t, first); result["version"] != int32(1) {
				t.Fatalf("unexpected initial result: %#v", result)
			}
			if result := awaitIntegrationResult(t, second); result["version"] != int32(2) {
				t.Fatalf("invalidated result was reused: %#v", result)
			}
			if result := cache.get(time.Minute, probe); result["version"] != int32(2) || calls.Load() != 2 {
				t.Fatalf("fresh result was not retained: %#v, calls=%d", result, calls.Load())
			}
		})
	}
}

func TestIntegrationStatusCacheDoesNotBlockOtherComponent(t *testing.T) {
	state := &serverState{}
	started, release := make(chan struct{}), make(chan struct{})
	var once sync.Once
	unblock := func() { once.Do(func() { close(release) }) }
	defer unblock()
	first := make(chan map[string]any, 1)
	go func() {
		first <- state.b4StatusCache.get(time.Minute, func() map[string]any {
			close(started)
			<-release
			return map[string]any{"component": "b4"}
		})
	}()
	awaitIntegrationProbe(t, started)
	second := make(chan map[string]any, 1)
	go func() {
		second <- state.amneziaStatusCache.get(time.Minute, func() map[string]any {
			return map[string]any{"component": "amnezia"}
		})
	}()
	if result := awaitIntegrationResult(t, second); result["component"] != "amnezia" {
		t.Fatalf("unexpected independent result: %#v", result)
	}
	unblock()
	awaitIntegrationResult(t, first)
}
