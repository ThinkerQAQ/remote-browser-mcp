[CmdletBinding()]
param([string]$InstallRoot = (Split-Path $PSScriptRoot -Parent), [ValidateSet('en','zh-CN')][string]$Language,
      [switch]$CheckOnly)
$ErrorActionPreference = 'Stop'
$OutputEncoding = New-Object Text.UTF8Encoding($false)
[Console]::OutputEncoding = $OutputEncoding
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$script:StateDir = Join-Path $env:LOCALAPPDATA 'RemoteBrowserMCP\state'
. (Join-Path $PSScriptRoot 'setup-common.ps1')
function Say([string]$English, [string]$Chinese) {
    if ($script:Locale -eq 'zh-CN') { Write-Host $Chinese } else { Write-Host $English }
}
function Ask([string]$English, [string]$Chinese, [string]$Default = '') {
    $label = if ($script:Locale -eq 'zh-CN') { $Chinese } else { $English }
    $value = Read-Host "$label [$Default]"
    if ([string]::IsNullOrWhiteSpace($value)) { return $Default }
    return $value.Trim()
}
function Write-SetupReport([string]$Phase, [bool]$RuntimeReady, [bool]$BrowserReady, [bool]$UserConfirmed) {
    $report = @{phase=$Phase;runtime_ready=$RuntimeReady;browser_ready=$BrowserReady;chatgpt_user_confirmed=$UserConfirmed;time=[DateTime]::UtcNow.ToString('o')}
    $report | ConvertTo-Json | Set-Content (Join-Path $script:StateDir 'setup-report.json') -Encoding UTF8
}
try {
    $script:Locale = if ($Language) { $Language } elseif ((Get-Culture).Name -like 'zh*') { 'zh-CN' } else { 'en' }
    if ($CheckOnly) {
        $node = Get-SetupNode
        $portFile = Join-Path $env:LOCALAPPDATA 'Microsoft\Edge\User Data\DevToolsActivePort'
        $report = @{windows=$true;node_available=([bool]$node);project_present=(Test-Path (Join-Path $InstallRoot 'package.json'));edge_port_file_present=(Test-Path $portFile);dependencies_present=(Test-Path (Join-Path $InstallRoot 'node_modules\smol-toml'));check_only=$true}
        $report | ConvertTo-Json -Compress | Write-Output
        exit 0
    }
    Protect-SetupDirectory $script:StateDir
    Say 'Remote Browser MCP - one-entry setup (Windows, no WSL required)' 'Remote Browser MCP - 一键配置（Windows，无需 WSL）'
    Say 'You can close this window and run setup.cmd again to resume.' '可随时关闭窗口，再运行 setup.cmd 继续配置。'
    Write-SetupReport 'dependencies' $false $false $false
    $node = Get-SetupNode
    if (!$node) {
        Say 'Installing a private Node.js 24 LTS copy from nodejs.org...' '正在从 nodejs.org 安装用户目录专用 Node.js 24 LTS...'
        $node = Install-SetupNode
    }
    $env:Path = (Split-Path $node -Parent) + ';' + $env:Path
    $npm = Join-Path (Split-Path $node -Parent) 'npm.cmd'
    if (!(Test-Path $npm)) { throw 'npm.cmd is missing beside node.exe.' }
    $dependencyHash = (Get-FileHash (Join-Path $InstallRoot 'package-lock.json') -Algorithm SHA256).Hash
    $marker = Join-Path $script:StateDir 'dependencies.sha256'
    $installedHash = if (Test-Path $marker) { (Get-Content $marker -Raw).Trim() } else { '' }
    Set-Location $InstallRoot
    if ($installedHash -ne $dependencyHash -or !(Test-Path 'node_modules\@modelcontextprotocol\sdk\package.json') -or !(Test-Path 'node_modules\chrome-devtools-mcp\package.json') -or !(Test-Path 'node_modules\smol-toml\package.json')) {
        Say 'Installing locked dependencies...' '正在安装锁定版本的依赖...'
        & $npm ci --ignore-scripts --no-audit --no-fund
        if ($LASTEXITCODE -ne 0) { throw 'npm ci failed.' }
        Set-Content $marker $dependencyHash -Encoding ASCII
    }
    $client = Install-SetupTunnel
    $existing = Read-SetupConfig $node $InstallRoot
    $previous = if ($existing.PSObject.Properties['setup']) { $existing.setup } else { $null }
    $tunnel = if ($previous) { $previous.tunnel_id } else { '' }
    Write-SetupReport 'account' $false $false $false
    Say 'Use your OWN tunnel and runtime key. Never share another person''s tunnel.' '请使用你自己的隧道和运行密钥，不要共用其他人的隧道。'
    if (!$tunnel) {
        Say 'Create a dedicated tunnel in Platform and associate it with your ChatGPT workspace.' '请在 Platform 创建专属隧道，并关联你的 ChatGPT 工作区。'
        Start-Process 'https://platform.openai.com/settings/organization/tunnels'
    }
    do {
        $tunnel = Ask 'Tunnel ID' '隧道 ID' $tunnel
        $valid = $tunnel -match '^tunnel_(?:[a-z0-9]{4}_)?[a-z0-9]{32}$'
        if (!$valid) { Say 'Paste the complete tunnel_... ID.' '请粘贴完整的 tunnel_... ID。' }
    } while (!$valid)
    $keyFile = Join-Path $script:StateDir 'runtime-key.dpapi'
    $changeKey = !(Test-Path $keyFile)
    if (!$changeKey) { $changeKey = (Ask 'Replace saved runtime key? y/N' '是否替换已保存的运行密钥？y/N' 'N') -match '^[yY]' }
    if ($changeKey) {
        Say 'Enter the runtime API key below. Input is hidden and saved with Windows user-bound encryption.' '请输入运行 API Key。输入不会回显，保存时使用 Windows 用户绑定加密。'
        $secure = Read-Host 'Runtime API Key' -AsSecureString
        Save-SetupSecret $secure
        $secure.Dispose()
    }
    $setup = @{tunnel_id=$tunnel;node_path=$node;tunnel_client_path=$client;state_dir=$script:StateDir;language=$script:Locale}
    $setup | ConvertTo-Json | & $node (Join-Path $InstallRoot 'scripts\setup-config.mjs') save (Join-Path $InstallRoot 'config.toml')
    if ($LASTEXITCODE -ne 0) { throw 'Could not save configuration.' }
    Write-SetupReport 'edge' $false $false $false
    $edge = @((Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe'), (Join-Path $env:ProgramFiles 'Microsoft\Edge\Application\msedge.exe'), (Join-Path $env:LOCALAPPDATA 'Microsoft\Edge\Application\msedge.exe')) | Where-Object { Test-Path $_ } | Select-Object -First 1
    if (!$edge) {
        Start-Process 'https://www.microsoft.com/edge/download'
        Say 'Install Microsoft Edge, then rerun setup.cmd. Your progress is saved.' '请完成 Microsoft Edge 安装，然后重新运行 setup.cmd；配置已保存。'
        exit 2
    }
    $portFile = Join-Path $env:LOCALAPPDATA 'Microsoft\Edge\User Data\DevToolsActivePort'
    $oldHealthFile = Join-Path $script:StateDir 'browser-health.json'
    $oldHealth = if (Test-Path $oldHealthFile) { try { Get-Content $oldHealthFile -Raw | ConvertFrom-Json } catch { $null } } else { $null }
    $restartNeeded = $changeKey -or ($oldHealth -and !$oldHealth.cdp_ready)
    if (!(Test-Path $portFile) -or $restartNeeded) {
        Start-Process $edge 'edge://inspect/#remote-debugging'
        Say 'Enable remote debugging in edge://inspect, keeping port 9222. Your browser will not be restarted.' '请在 edge://inspect 开启远程调试，使用 9222 端口。向导不会重启浏览器。'
        [void](Ask 'Press Enter after enabling debugging' '开启调试后按回车' '')
    }
    Say 'Stop any OTHER client using this same tunnel first (for example an older WSL deployment).' '请先停止使用同一隧道的其他客户端（例如旧版 WSL 部署）。'
    [void](Ask 'Press Enter to start/reuse this tool''s native runtime' '按回车启动或复用本工具的 Windows 服务' '')
    Write-SetupReport 'runtime' $false $false $false
    # A child PowerShell contains the plaintext key only for the runtime launch.
    $startArgs = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $InstallRoot 'scripts\start-native.ps1'), '-InstallRoot', $InstallRoot)
    if ($restartNeeded) { $startArgs += '-Restart' }
    & powershell.exe @startArgs
    if ($LASTEXITCODE -ne 0) { throw 'Runtime start failed.' }
    Say 'In Edge, allow this connection''s remote-debugging request. Waiting up to 65 seconds...' '请在 Edge 中允许本次远程调试连接。最多等待 65 秒...'
    $healthFile = Join-Path $script:StateDir 'browser-health.json'
    $browserReady = $false
    $deadline = (Get-Date).AddSeconds(65)
    while ((Get-Date) -lt $deadline) {
        if (Test-Path $healthFile) {
            try {
                $health = Get-Content $healthFile -Raw | ConvertFrom-Json
                if ($health.phase -eq 'finished') { $browserReady = ($health.cdp_ready -eq $true); break }
            } catch { }
        }
        Start-Sleep -Milliseconds 500
    }
    if (!$browserReady) {
        Write-SetupReport 'browser_pending' $true $false $false
        Say 'Browser verification is pending. Check Edge debugging/consent, then rerun setup.cmd and restart this tool when asked.' '浏览器尚未验收通过。请检查 Edge 调试与授权，重新运行 setup.cmd，并按提示重启本工具。'
        exit 2
    }
    $startup = (Ask 'Start automatically when you sign in to Windows? Y/n' '是否在登录 Windows 时自动启动？Y/n' 'Y') -notmatch '^[nN]'
    Set-SetupStartup $InstallRoot $startup
    Write-SetupReport 'chatgpt_pending' $true $true $false
    Say 'Local setup passed. Finish the account-side connection once:' '本地配置已通过。最后完成一次账号侧连接：'
    Say 'Plugins > Add custom MCP server > Tunnel > your tunnel > No authentication > Create as a plugin > Connect.' '插件 → 添加自定义 MCP 服务器 → 隧道 → 你的隧道 → 无需身份验证 → 创建为插件 → 连接。'
    Say 'Do not choose Create plugin / Plugin Creator for this registration step.' '本步骤不要选择“创建插件 / Plugin Creator”。'
    Set-Clipboard -Value $tunnel
    Say 'Your tunnel ID was copied to the clipboard. The runtime key was NOT copied.' '隧道 ID 已复制到剪贴板，运行密钥不会复制。'
    Start-Process 'https://chatgpt.com/plugins'
    Say 'In a new ChatGPT chat select the app and ask: Call browser_status and report cdp_ready.' '在新对话中选中该工具，输入：调用 browser_status，报告 cdp_ready。'
    $confirmed = (Ask 'Did ChatGPT actually return cdp_ready=true? y/N (N saves a pending checkpoint)' 'ChatGPT 是否已实际返回 cdp_ready=true？y/N（N 保存为待完成）' 'N') -match '^[yY]'
    if ($confirmed) { Write-SetupReport 'complete_user_confirmed' $true $true $true }
    Say 'Done. Run setup.cmd to resume or reconfigure. Use start-native.ps1 -Stop to stop only this runtime.' '配置已保存。再次运行 setup.cmd 可继续或修改；start-native.ps1 -Stop 仅停止本工具服务。'
    if (!$confirmed) { Say 'ChatGPT end-to-end test remains pending; local installation is ready.' 'ChatGPT 端到端测试仍待完成，本地安装已就绪。' }
} catch {
    @{exception_type=$_.Exception.GetType().Name;line=$_.InvocationInfo.ScriptLineNumber} | ConvertTo-Json | Set-Content (Join-Path $script:StateDir 'setup-error.json') -Encoding UTF8 -ErrorAction SilentlyContinue
    Write-Host 'Setup paused. Rerun setup.cmd to resume. Check the private logs under %LOCALAPPDATA%\RemoteBrowserMCP\state.' -ForegroundColor Red
    # Never echo exception bodies from credential-bearing child processes.
    exit 2
}
