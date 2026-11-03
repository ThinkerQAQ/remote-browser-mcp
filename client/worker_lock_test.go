package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestWorkerLockPreventsCompetingLoginAndManualStarts(t *testing.T) {
	name := filepath.Join(t.TempDir(), "worker.lock")
	a, err := os.OpenFile(name, os.O_CREATE|os.O_RDWR, 0600)
	if err != nil {
		t.Fatal(err)
	}
	b, err := os.OpenFile(name, os.O_RDWR, 0600)
	if err != nil {
		t.Fatal(err)
	}
	defer b.Close()
	if err = lockWorker(a); err != nil {
		t.Fatal(err)
	}
	if lockWorker(b) == nil {
		t.Fatal("second worker acquired installation lock")
	}
	a.Close()
	if err = lockWorker(b); err != nil {
		t.Fatal("lock not released after worker exit", err)
	}
}
