$ErrorActionPreference = "Stop"
Add-Type -Namespace RB -Name Win -MemberDefinition '[DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();'
$before = [RB.Win]::GetForegroundWindow().ToInt64()
& npm.cmd run proxy-smoke
$code = $LASTEXITCODE
$after = [RB.Win]::GetForegroundWindow().ToInt64()
Write-Output ("FOREGROUND_UNCHANGED=" + ($before -eq $after))
Write-Output ("SMOKE_EXIT=" + $code)
exit $code
