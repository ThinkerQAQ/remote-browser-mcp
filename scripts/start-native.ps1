[CmdletBinding()]
param([string]$InstallRoot = (Split-Path $PSScriptRoot -Parent), [switch]$Stop, [switch]$Restart)
$ErrorActionPreference = 'Stop'
$OutputEncoding = New-Object Text.UTF8Encoding($false)
[Console]::OutputEncoding = $OutputEncoding
$script:StateDir = Join-Path $env:LOCALAPPDATA 'RemoteBrowserMCP\state'
. (Join-Path $PSScriptRoot 'setup-common.ps1')
try {
    $node = Get-SetupNode
    if (!$node) { throw 'Run setup.cmd to install Node.js.' }
    $config = Read-SetupConfig $node $InstallRoot
    if (!$config.PSObject.Properties['setup']) { throw 'Run setup.cmd first.' }
    $setup = $config.setup
    $script:StateDir = $setup.state_dir
    Protect-SetupDirectory $script:StateDir
    $client = $setup.tunnel_client_path
    if ($Stop) { & $client runtimes stop remote-browser-native | Out-Null; exit $LASTEXITCODE }
    $status = Get-RuntimeSummary $client
    if ($status.process_running) {
        if (!$Restart -and $status.tunnel_id -eq $setup.tunnel_id -and $status.healthy -and $status.ready) {
            Write-Output '{"process_running":true,"tunnel_healthy":true,"mcp_ready":true,"reused":true}'
            exit 0
        }
        & $client runtimes stop remote-browser-native *> (Join-Path $script:StateDir 'stop.log')
        if ($LASTEXITCODE -ne 0) { throw 'Could not stop the previous native runtime.' }
    }
    $secretFile = Join-Path $script:StateDir 'runtime-key.dpapi'
    $secure = (Get-Content $secretFile -Raw).Trim() | ConvertTo-SecureString
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { $env:REMOTE_BROWSER_RUNTIME_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
    $env:REMOTE_BROWSER_CONFIG = Join-Path $InstallRoot 'config.toml'
    $env:REMOTE_BROWSER_SETUP_HEALTH_FILE = Join-Path $script:StateDir 'browser-health.json'
    Remove-Item $env:REMOTE_BROWSER_SETUP_HEALTH_FILE -Force -ErrorAction SilentlyContinue
    # Forward slashes keep Windows paths intact in the upstream command parser.
    $command = '"' + $setup.node_path.Replace('\','/') + '" "' + (Join-Path $InstallRoot 'scripts\launch.mjs').Replace('\','/') + '"'
    Set-Location $InstallRoot
    & $client runtimes connect --alias remote-browser-native --profile remote-browser-native --tunnel-id $setup.tunnel_id --runtime-api-key env:REMOTE_BROWSER_RUNTIME_KEY --mcp-command $command *> (Join-Path $script:StateDir 'connect.log')
    if ($LASTEXITCODE -ne 0) { throw 'Runtime connection failed. Check the private connect.log.' }
    $status = Get-RuntimeSummary $client
    $summary = @{process_running=($status.process_running -eq $true);tunnel_healthy=($status.healthy -eq $true);mcp_ready=($status.ready -eq $true)}
    $summary | ConvertTo-Json -Compress | Write-Output
    if (!$summary.process_running -or !$summary.tunnel_healthy -or !$summary.mcp_ready) { throw 'Runtime has not become ready.' }
} catch {
    Write-Host 'Native runtime is not ready. Run setup.cmd to resume; diagnostics remain in your private state directory.' -ForegroundColor Red
    exit 2
} finally {
    Remove-Item Env:REMOTE_BROWSER_RUNTIME_KEY -ErrorAction SilentlyContinue
    Remove-Item Env:REMOTE_BROWSER_SETUP_HEALTH_FILE -ErrorAction SilentlyContinue
}
