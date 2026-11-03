//go:build !windows

package main

import "os"

func protectPrivate(path string, dir bool) error {
	if dir {
		return os.Chmod(path, 0700)
	}
	return os.Chmod(path, 0600)
}
