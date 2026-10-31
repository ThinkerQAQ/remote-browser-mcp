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
        Write-Host 'Installing pinned Remote Browser MCP v0.3.0'
        $temp = Join-Path ([IO.Path]::GetTempPath()) ([Guid]::NewGuid().ToString('N'))
        New-Item -ItemType Directory -Force $temp | Out-Null
        try {
            $asset = 'remote-browser-mcp-v0.3.0-windows.zip'
            $url = 'https://github.com/ThinkerQAQ/remote-browser-mcp/releases/download/v0.3.0'
            $archive = Join-Path $temp $asset
            $checksums = Join-Path $temp 'SHA256SUMS'
            Invoke-WebRequest -UseBasicParsing -Headers $headers -TimeoutSec 180 -Uri "$url/$asset" -OutFile $archive
            Invoke-WebRequest -UseBasicParsing -Headers $headers -TimeoutSec 60 -Uri "$url/SHA256SUMS" -OutFile $checksums
            $expected = $null
            foreach ($line in (Get-Content -LiteralPath $checksums)) {
                $parts = $line.Trim() -split '\s+', 2
                if ($parts.Count -eq 2 -and $parts[1].TrimStart('*') -eq $asset) { $expected = $parts[0]; break }
            }
            if (!$expected -or $expected -notmatch '^[a-fA-F0-9]{64}$') { throw 'Invalid release checksum.' }
            $actual = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash
            if ($actual -ine $expected) { throw 'Release archive checksum mismatch.' }
            Expand-Archive -LiteralPath $archive -DestinationPath (Join-Path $temp 'source')
            $source = Join-Path (Join-Path $temp 'source') 'remote-browser-mcp-v0.3.0'
            if (!(Test-Path (Join-Path $source 'scripts\setup.ps1'))) { throw 'Invalid project archive.' }
            New-Item -ItemType Directory -Force $InstallRoot | Out-Null
            Copy-Item (Join-Path $source '*') $InstallRoot -Recurse -Force
        } finally { Remove-Item $temp -Recurse -Force -ErrorAction SilentlyContinue }
    }
    & (Join-Path $InstallRoot 'scripts\setup.ps1') -InstallRoot $InstallRoot
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} catch {
    Write-Host 'Installation paused. Check network access to GitHub and the installation directory, then run again.' -ForegroundColor Red
    exit 2
}
