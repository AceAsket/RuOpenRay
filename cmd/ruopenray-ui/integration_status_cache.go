package main

import (
	"sync"
	"time"
)

// Integration probes run several commands. Coalesce concurrent misses without
// holding metricsMu or allowing an invalidated probe to repopulate the cache.
type integrationStatusCache struct {
	mu         sync.Mutex
	probeMu    sync.Mutex
	value      map[string]any
	storedAt   time.Time
	generation uint64
}

func (c *integrationStatusCache) get(ttl time.Duration, probe func() map[string]any) map[string]any {
	c.mu.Lock()
	if c.value != nil && time.Since(c.storedAt) < ttl {
		value := c.value
		c.mu.Unlock()
		return value
	}
	c.mu.Unlock()

	c.probeMu.Lock()
	defer c.probeMu.Unlock()
	// Another request may have refreshed the cache while this one waited.
	c.mu.Lock()
	if c.value != nil && time.Since(c.storedAt) < ttl {
		value := c.value
		c.mu.Unlock()
		return value
	}
	generation := c.generation
	c.mu.Unlock()

	value := probe()
	c.mu.Lock()
	if c.generation == generation {
		c.value = value
		c.storedAt = time.Now()
	}
	c.mu.Unlock()
	return value
}

func (c *integrationStatusCache) invalidate() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.generation++
	c.value = nil
	c.storedAt = time.Time{}
}
