package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestSaveRejectsInvalidCredentialsBeforeStartingRuntime(t *testing.T) {
	dir := t.TempDir()
	for _, tc := range []struct{ id, key string }{
		{"invalid", "secret"}, {"tunnel_valid", "line1\nline2"}, {"tunnel_valid", ""},
	} {
		err := save(dir, tc.id, tc.key)
		if err == nil {
			t.Errorf("expected rejection for id=%q", tc.id)
		}
	}
	if _, e := os.Stat(filepath.Join(dir, "runtime")); !os.IsNotExist(e) {
		t.Fatalf("unexpected runtime data created: %v", e)
	}
}
func TestMissingRuntimeStatusDoesNotExposeCredentials(t *testing.T) {
	dir := t.TempDir()
	s := readState(dir)
	if s.HasKey || s.Managed || s.Ready {
		t.Fatalf("unexpected ready status: %#v", s)
	}
	if strings.Contains(strings.ToLower(s.Error), "key") {
		t.Fatalf("error should not reveal key details: %s", s.Error)
	}
}
func TestSessionToken(t *testing.T) {
	a, b := sessionToken(), sessionToken()
	if a == b || len(a) != 64 || !equalToken(a, a) || equalToken(a, b) {
		t.Fatalf("invalid session token")
	}
}
func TestRejectUnknownServiceAction(t *testing.T) {
	if err := service(t.TempDir(), "restart"); err == nil {
		t.Fatal("unsupported action accepted")
	}
}
