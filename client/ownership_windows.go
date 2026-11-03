//go:build windows

package main

import "os"

func preserveExistingOwner(temp string, existing os.FileInfo) error { return nil }
func assignServiceOwner(file, account string) error                 { return nil }
func verifyServiceDataOwner(root, account string) error             { return nil }
