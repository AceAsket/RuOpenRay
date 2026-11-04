package system

import (
	"testing"
	"time"
)

func TestCPURequestsShareAnIntervalInsteadOfSamplingTheirOwnBurst(t *testing.T) {
	s := NewSampler()
	start := time.Unix(100, 0)
	if got := s.sampleCPU(1000, 900, start); got != nil {
		t.Fatalf("first sample = %v, want unknown", got)
	}
	// A single busy tick immediately after opening another page is not a
	// useful interval. It must not replace the shared measurement baseline.
	if got := s.sampleCPU(1001, 900, start.Add(10*time.Millisecond)); got != nil {
		t.Fatalf("short initial sample = %v, want unknown", got)
	}
	if got := s.sampleCPU(1200, 1090, start.Add(2*time.Second)); got != 5 {
		t.Fatalf("two-second average = %v, want 5", got)
	}
	if got := s.sampleCPU(1201, 1090, start.Add(2010*time.Millisecond)); got != 5 {
		t.Fatalf("second client = %v, want shared 5", got)
	}
	// A real sustained CPU increase must still be visible.
	if got := s.sampleCPU(1400, 1190, start.Add(4*time.Second)); got != 50 {
		t.Fatalf("sustained load = %v, want 50", got)
	}
}

func TestCPUCounterResetAndInconsistentDeltasDoNotUnderflow(t *testing.T) {
	s := NewSampler()
	start := time.Unix(100, 0)
	s.sampleCPU(1000, 900, start)
	if got := s.sampleCPU(10, 8, start.Add(2*time.Second)); got != nil {
		t.Fatalf("counter reset = %v, want unknown", got)
	}
	if got := s.sampleCPU(11, 10, start.Add(4*time.Second)); got != nil {
		t.Fatalf("idle delta exceeds total = %v, want unknown", got)
	}
	if got := s.sampleCPU(111, 100, start.Add(6*time.Second)); got != 10 {
		t.Fatalf("recovered interval = %v, want 10", got)
	}
}
