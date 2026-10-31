# Offline integration: real PowerShell, Node, TOML and Windows DPAPI; fake tunnel
# executable instead of account/network access. No browser or clipboard changes.
$ErrorActionPreference = 'Stop'
function Assert($Condition, [string]$Message) { if (!$Condition) { throw $Message } }
$root = Split-Path $PSScriptRoot -Parent
$parseFiles = @((Join-Path $root 'install.ps1')) + @(Get-ChildItem (Join-Path $root 'scripts') -Filter '*.ps1' | ForEach-Object { $_.FullName })
foreach ($file in $parseFiles) {
    $tokens = $null; $errors = $null
    [void][Management.Automation.Language.Parser]::ParseFile($file, [ref]$tokens, [ref]$errors)
    Assert ($errors.Count -eq 0) "PowerShell parse failure in $file : $errors"
}
$temp = Join-Path ([IO.Path]::GetTempPath()) ([Guid]::NewGuid().ToString('N'))
$oldLocal = $env:LOCALAPPDATA; $oldPath = $env:Path
try {
    $fixture = Join-Path $temp 'app space 中文'
    New-Item -ItemType Directory -Force $fixture | Out-Null
    Copy-Item (Join-Path $root 'scripts') $fixture -Recurse
    Copy-Item (Join-Path $root 'package.json'), (Join-Path $root 'package-lock.json'), (Join-Path $root 'config.example.toml') $fixture
    New-Item -ItemType Directory -Force (Join-Path $fixture 'node_modules\@modelcontextprotocol\sdk') | Out-Null
    Copy-Item (Join-Path $root 'node_modules\smol-toml') (Join-Path $fixture 'node_modules') -Recurse
    Set-Content (Join-Path $fixture 'node_modules\@modelcontextprotocol\sdk\package.json') '{}'
    New-Item -ItemType Directory -Force (Join-Path $fixture 'node_modules\chrome-devtools-mcp') | Out-Null
    Set-Content (Join-Path $fixture 'node_modules\chrome-devtools-mcp\package.json') '{}'
    $env:LOCALAPPDATA = Join-Path $temp 'local'
    $state = Join-Path $env:LOCALAPPDATA 'RemoteBrowserMCP\state'
    New-Item -ItemType Directory -Force $state | Out-Null
    (Get-FileHash (Join-Path $fixture 'package-lock.json') -Algorithm SHA256).Hash | Set-Content (Join-Path $state 'dependencies.sha256')
    $env:FAKE_TUNNEL_STATE = Join-Path $temp 'ready'
    $env:FAKE_TUNNEL_LOG = Join-Path $temp 'args.txt'
    $fakeDir = Join-Path $temp 'fake-bin'
    New-Item -ItemType Directory -Force $fakeDir | Out-Null
    $source = @'
using System;
using System.IO;
class FakeTunnel {
  static int Main(string[] args) {
    if (Array.IndexOf(args,"--help") >= 0) { Console.WriteLine("--tunnel-id --runtime-api-key"); return 0; }
    if (Array.IndexOf(args,"status") >= 0) {
      var ready=File.Exists(Environment.GetEnvironmentVariable("FAKE_TUNNEL_STATE"));
      Console.WriteLine("{\"process_running\":"+ready.ToString().ToLower()+",\"healthy\":"+ready.ToString().ToLower()+",\"ready\":"+ready.ToString().ToLower()+",\"tunnel_id\":\"tunnel_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\"}");
      return 0;
    }
    if (Array.IndexOf(args,"connect") >= 0) {
      if (Environment.GetEnvironmentVariable("REMOTE_BROWSER_RUNTIME_KEY") != "fixture-not-a-real-key") return 5;
      File.AppendAllText(Environment.GetEnvironmentVariable("FAKE_TUNNEL_LOG"),string.Join("|",args)+"\n");
      File.WriteAllText(Environment.GetEnvironmentVariable("REMOTE_BROWSER_SETUP_HEALTH_FILE"),"{\"phase\":\"finished\",\"cdp_ready\":true}");
      File.WriteAllText(Environment.GetEnvironmentVariable("FAKE_TUNNEL_STATE"),"ready");
      return 0;
    }
    return 0;
  }
}
'@
    Add-Type -TypeDefinition $source -OutputAssembly (Join-Path $fakeDir 'tunnel-client.exe') -OutputType ConsoleApplication
    $env:Path = $fakeDir + ';' + $env:Path
    # Edge executable discovery only; no actual browser is launched in this test.
    $edge = Join-Path $env:LOCALAPPDATA 'Microsoft\Edge\Application\msedge.exe'
    New-Item -ItemType Directory -Force (Split-Path $edge -Parent) | Out-Null
    New-Item -ItemType File $edge | Out-Null
    function global:Start-Process { param($FilePath, $ArgumentList) }
    function global:Set-Clipboard { param($Value) }
    function global:Read-Host {
        param($Prompt, [switch]$AsSecureString)
        if ($AsSecureString) { return (ConvertTo-SecureString 'fixture-not-a-real-key' -AsPlainText -Force) }
        if ($Prompt -like 'Tunnel ID*') { return 'tunnel_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }
        if ($Prompt -like 'Start automatically*' -or $Prompt -like 'Did ChatGPT*' -or $Prompt -like 'Replace saved*') { return 'N' }
        return ''
    }
    & (Join-Path $fixture 'scripts\setup.ps1') -InstallRoot $fixture -Language en
    Assert ($LASTEXITCODE -eq 0) 'First setup failed'
    $report = Get-Content (Join-Path $state 'setup-report.json') -Raw | ConvertFrom-Json
    Assert ($report.phase -eq 'chatgpt_pending' -and !$report.chatgpt_user_confirmed) 'Must not claim unverified ChatGPT acceptance'
    $configText = Get-Content (Join-Path $fixture 'config.toml') -Raw
    Assert (!$configText.Contains('fixture-not-a-real-key')) 'Key leaked into TOML'
    $cipher = Get-Content (Join-Path $state 'runtime-key.dpapi') -Raw
    Assert (!$cipher.Contains('fixture-not-a-real-key')) 'Key saved in plaintext'
    $argsText = Get-Content $env:FAKE_TUNNEL_LOG -Raw
    Assert (!$argsText.Contains('fixture-not-a-real-key')) 'Key leaked into command arguments'
    Assert ($argsText.Contains('env:REMOTE_BROWSER_RUNTIME_KEY')) 'Runtime did not use a key reference'
    & (Join-Path $fixture 'scripts\setup.ps1') -InstallRoot $fixture -Language en
    Assert ($LASTEXITCODE -eq 0) 'Resume failed'
    Assert ((Get-Content $env:FAKE_TUNNEL_LOG).Count -eq 1) 'Resume duplicated the runtime connection'
    & (Join-Path $fixture 'scripts\setup.ps1') -InstallRoot $fixture -CheckOnly
    Assert ($LASTEXITCODE -eq 0) 'Read-only check failed'
    . (Join-Path $root 'scripts\setup-common.ps1')
    $script:StateDir = $state
    $payload = Join-Path $temp 'payload.txt'
    Set-Content $payload 'verified fixture'
    $script:FixtureArchive = Join-Path $temp 'download.zip'
    Compress-Archive $payload $script:FixtureArchive
    function global:Invoke-WebRequest { param($Uri, $OutFile, [switch]$UseBasicParsing, $TimeoutSec) Copy-Item $script:FixtureArchive $OutFile }
    $digest = (Get-FileHash $script:FixtureArchive -Algorithm SHA256).Hash
    $destination = Join-Path $temp 'verified'
    Get-VerifiedArchive 'https://example.invalid/fixture.zip' $digest $destination
    Assert (Test-Path (Join-Path $destination 'payload.txt')) 'Valid archive was not extracted'
    $rejected = $false
    try { Get-VerifiedArchive 'https://example.invalid/fixture.zip' ('0' * 64) (Join-Path $temp 'unverified') } catch { $rejected = $true }
    Assert $rejected 'Corrupt download was accepted'
    Assert (!(Test-Path (Join-Path $temp 'unverified'))) 'Unverified archive was extracted'
    Write-Host 'PASS: native setup, encrypted credential launch, paths with spaces, resume and truthful checkpoints'
} finally {
    $env:LOCALAPPDATA = $oldLocal; $env:Path = $oldPath
    Remove-Item Env:FAKE_TUNNEL_STATE, Env:FAKE_TUNNEL_LOG -ErrorAction SilentlyContinue
    Remove-Item Function:\Start-Process, Function:\Set-Clipboard, Function:\Read-Host, Function:\Invoke-WebRequest -ErrorAction SilentlyContinue
    Set-Location $root
    Remove-Item $temp -Recurse -Force -ErrorAction SilentlyContinue
}
