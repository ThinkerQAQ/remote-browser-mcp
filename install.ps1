# Standalone bootstrap. Downloads source; no Git, Node or WSL required.
[CmdletBinding()]
param([string]$InstallRoot = (Join-Path $env:LOCALAPPDATA 'RemoteBrowserMCP\app'))
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
try {
    if (!(Test-Path (Join-Path $InstallRoot 'scripts\setup.ps1'))) {
        if ((Test-Path $InstallRoot) -and (Get-ChildItem $InstallRoot -Force | Select-Object -First 1)) {
            throw 'InstallRoot is not empty. Choose an empty installation directory.'
        }
        $headers = @{'User-Agent'='RemoteBrowserMCP-Setup'}
        $commit = Invoke-RestMethod -TimeoutSec 30 -Headers $headers 'https://api.github.com/repos/ThinkerQAQ/remote-browser-mcp/commits/main'
        if ($commit.sha -notmatch '^[a-f0-9]{40}$') { throw 'Invalid source commit' }
        Write-Host "Installing source commit $($commit.sha)"
        $temp = Join-Path ([IO.Path]::GetTempPath()) ([Guid]::NewGuid().ToString('N'))
        New-Item -ItemType Directory -Force $temp | Out-Null
        try {
            $archive = Join-Path $temp 'source.zip'
            Invoke-WebRequest -UseBasicParsing -Headers $headers -TimeoutSec 120 -Uri "https://github.com/ThinkerQAQ/remote-browser-mcp/archive/$($commit.sha).zip" -OutFile $archive
            Expand-Archive $archive (Join-Path $temp 'source')
            $source = Get-ChildItem (Join-Path $temp 'source') -Directory | Select-Object -First 1
            New-Item -ItemType Directory -Force $InstallRoot | Out-Null
            Copy-Item (Join-Path $source.FullName '*') $InstallRoot -Recurse -Force
        } finally { Remove-Item $temp -Recurse -Force -ErrorAction SilentlyContinue }
    }
    & (Join-Path $InstallRoot 'scripts\setup.ps1') -InstallRoot $InstallRoot
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} catch {
    Write-Host 'Installation paused. Check network access to GitHub and the installation directory, then run again.' -ForegroundColor Red
    exit 2
}
