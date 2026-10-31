Set-StrictMode -Version Latest
$ProgressPreference = 'SilentlyContinue'
function Protect-SetupDirectory([string]$Directory) {
    New-Item -ItemType Directory -Force $Directory | Out-Null
    $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    & icacls.exe $Directory /inheritance:r /grant:r ("*" + $sid + ":(OI)(CI)F") /Q | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Cannot protect the private setup directory.' }
}
function Get-SetupNode {
    $candidates = @()
    $found = Get-Command node.exe -ErrorAction SilentlyContinue
    if ($found) { $candidates += $found.Source }
    $candidates += @((Join-Path $env:ProgramFiles 'nodejs\node.exe'), (Join-Path $env:USERPROFILE '.version-fox\cache\nodejs\current\node.exe'))
    $candidates += @(Get-ChildItem (Join-Path $script:StateDir 'tools') -Filter node.exe -Recurse -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName })
    foreach ($candidate in $candidates) {
        if (Test-Path $candidate -PathType Leaf) {
            $version = & $candidate -p 'process.versions.node' 2>$null
            if ($LASTEXITCODE -eq 0 -and ([int]($version -split '\.')[0]) -ge 22) { return $candidate }
        }
    }
    return $null
}
function Get-SetupArchitecture {
    $architecture = if ($env:PROCESSOR_ARCHITEW6432) { $env:PROCESSOR_ARCHITEW6432 } else { $env:PROCESSOR_ARCHITECTURE }
    if ($architecture -eq 'ARM64') { return 'arm64' }
    if ($architecture -eq 'AMD64') { return 'x64' }
    throw '64-bit Windows is required.'
}
function Get-VerifiedArchive([string]$Url, [string]$Sha256, [string]$Destination) {
    if ($Sha256 -notmatch '^[a-fA-F0-9]{64}$') { throw 'A SHA-256 checksum is required.' }
    $archive = Join-Path $script:StateDir ([Guid]::NewGuid().ToString('N') + '.zip')
    try {
        Invoke-WebRequest -UseBasicParsing -TimeoutSec 180 -Uri $Url -OutFile $archive
        if ((Get-FileHash $archive -Algorithm SHA256).Hash -ne $Sha256) { throw 'Download checksum mismatch.' }
        New-Item -ItemType Directory -Force $Destination | Out-Null
        Expand-Archive -Path $archive -DestinationPath $Destination -Force
    } finally { Remove-Item $archive -Force -ErrorAction SilentlyContinue }
}
function Install-SetupNode {
    $arch = Get-SetupArchitecture
    $releases = Invoke-RestMethod -TimeoutSec 30 'https://nodejs.org/dist/index.json'
    $release = $releases | Where-Object { $_.version -match '^v24\.' -and $_.lts -ne $false -and $_.files -contains "win-$arch-zip" } | Select-Object -First 1
    if (!$release) { throw 'No supported Node.js 24 LTS build found.' }
    $name = "node-$($release.version)-win-$arch.zip"
    $base = "https://nodejs.org/dist/$($release.version)"
    $sums = (Invoke-WebRequest -UseBasicParsing -TimeoutSec 30 "$base/SHASUMS256.txt").Content
    $match = [regex]::Match($sums, "(?m)^([a-f0-9]{64})\s+" + [regex]::Escape($name) + '\r?$')
    if (!$match.Success) { throw 'Node.js checksum not found.' }
    $destination = Join-Path $script:StateDir 'tools\node'
    Get-VerifiedArchive "$base/$name" $match.Groups[1].Value $destination
    return (Get-ChildItem $destination -Recurse -Filter node.exe | Select-Object -First 1).FullName
}
function Test-SetupTunnel([string]$Binary) {
    try {
        $help = (& $Binary runtimes connect --help 2>$null) -join "`n"
        return ($LASTEXITCODE -eq 0 -and $help.Contains('--tunnel-id') -and $help.Contains('--runtime-api-key'))
    } catch { return $false }
}
function Install-SetupTunnel {
    $found = Get-Command tunnel-client.exe -ErrorAction SilentlyContinue
    if ($found -and (Test-SetupTunnel $found.Source)) { return $found.Source }
    $tools = Join-Path $script:StateDir 'tools\tunnel'
    $existing = Get-ChildItem $tools -Recurse -Filter tunnel-client.exe -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($existing -and (Test-SetupTunnel $existing.FullName)) { return $existing.FullName }
    $arch = if ((Get-SetupArchitecture) -eq 'arm64') { 'arm64' } else { 'amd64' }
    $release = Invoke-RestMethod -TimeoutSec 30 -Headers @{'User-Agent'='RemoteBrowserMCP-Setup'} 'https://api.github.com/repos/openai/tunnel-client/releases/latest'
    $asset = $release.assets | Where-Object { $_.name -match "^tunnel-client-v[0-9.]+-windows-$arch\.zip$" } | Select-Object -First 1
    if (!$asset -or $asset.digest -notmatch '^sha256:([a-f0-9]{64})$') { throw 'Official tunnel-client checksum not found.' }
    $checksum = $Matches[1]
    if ($asset.browser_download_url -notlike 'https://github.com/openai/tunnel-client/releases/download/*') { throw 'Unexpected tunnel-client download origin.' }
    Get-VerifiedArchive $asset.browser_download_url $checksum $tools
    $binary = Get-ChildItem $tools -Recurse -Filter tunnel-client.exe | Select-Object -First 1
    if (!$binary -or !(Test-SetupTunnel $binary.FullName)) { throw 'A supported tunnel-client.exe is missing from the verified archive.' }
    return $binary.FullName
}
function Read-SetupConfig([string]$Node, [string]$Root) {
    $json = & $Node (Join-Path $Root 'scripts\setup-config.mjs') read (Join-Path $Root 'config.toml')
    if ($LASTEXITCODE -ne 0) { throw 'Cannot read config.toml.' }
    return $json | ConvertFrom-Json
}
function Get-RuntimeSummary([string]$Client) {
    # Full status contains private logs. Only the caller's summary is displayed.
    $raw = & $Client runtimes status remote-browser-native --json 2> (Join-Path $script:StateDir 'status-error.log')
    if ($LASTEXITCODE -ne 0) { return @{process_running=$false;healthy=$false;ready=$false} }
    return (($raw -join "`n") | ConvertFrom-Json)
}
function Save-SetupSecret([Security.SecureString]$Secret) {
    if ($Secret.Length -eq 0) { throw 'Runtime key cannot be empty.' }
    $Secret | ConvertFrom-SecureString | Set-Content (Join-Path $script:StateDir 'runtime-key.dpapi') -Encoding ASCII
}
function Set-SetupStartup([string]$Root, [bool]$Enable) {
    $sha = [Security.Cryptography.SHA256]::Create()
    try { $suffix = ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($Root.ToLowerInvariant())))).Replace('-', '').Substring(0,12) } finally { $sha.Dispose() }
    $shortcut = Join-Path ([Environment]::GetFolderPath('Startup')) ('Remote Browser MCP-' + $suffix + '.lnk')
    if (!$Enable) { if (Test-Path $shortcut) { Remove-Item $shortcut -Force }; return }
    $shell = New-Object -ComObject WScript.Shell
    $link = $shell.CreateShortcut($shortcut)
    $link.TargetPath = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $link.Arguments = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + (Join-Path $Root 'scripts\start-native.ps1') + '" -InstallRoot "' + $Root + '"'
    $link.WorkingDirectory = $Root
    $link.Save()
}
