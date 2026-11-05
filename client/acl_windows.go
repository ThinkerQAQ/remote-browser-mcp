//go:build windows

package main

import (
	"fmt"
	"golang.org/x/sys/windows"
)

func protectPrivate(path string, directory bool) error {
	user, e := windows.GetCurrentProcessToken().GetTokenUser()
	if e != nil {
		return e
	}
	descriptor := "D:P(A;;FA;;;" + user.User.Sid.String() + ")"
	if directory {
		// Inherit the owner ACE to files and subdirectories. Without OICI,
		// protecting a directory can strip inherited rights from children.
		descriptor = "D:P(A;OICI;FA;;;" + user.User.Sid.String() + ")"
	}
	sd, e := windows.SecurityDescriptorFromString(descriptor)
	if e != nil {
		return e
	}
	acl, _, e := sd.DACL()
	if e != nil {
		return e
	}
	flags := windows.SECURITY_INFORMATION(windows.DACL_SECURITY_INFORMATION | windows.PROTECTED_DACL_SECURITY_INFORMATION)
	if e := windows.SetNamedSecurityInfo(path, windows.SE_FILE_OBJECT, flags, nil, nil, acl, nil); e != nil {
		return fmt.Errorf("could not restrict local private-data permissions: %w", e)
	}
	return nil
}
