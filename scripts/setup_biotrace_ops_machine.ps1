#requires -Version 5.1
<#
.SYNOPSIS
    Onboard a development machine to BioTrace SSH operations.

.DESCRIPTION
    Creates an agent-neutral SSH key and optional SSH MCP configuration. The
    shared artifacts stay outside the repository:
      ~/.ssh/biotrace_deploy
      ~/.ssh-mcp/server/
      ~/.ssh-mcp/config.json

    The script never uploads the public key and never reads cloud credentials.
    It prints the one server-side command required to authorize this machine.
    This file intentionally contains ASCII only for Windows PowerShell 5.1.
#>
[CmdletBinding()]
param(
    [string]$SshHost = '106.53.188.20',
    [string]$SshUser = 'root',
    [string]$ConnectionName = 'biotrace',
    [string]$RemoteProjectDir = '/opt/biotrace',
    [string]$KeyPath,
    [string]$BaseDir,
    [ValidateSet('none', 'cursor', 'codex')]
    [string[]]$Target = @('none'),
    [switch]$Verify
)

$ErrorActionPreference = 'Stop'

function Info([string]$Message) { Write-Host "[setup] $Message" }
function Warn([string]$Message) { Write-Host "[warn ] $Message" -ForegroundColor Yellow }
function Fail([string]$Message) { Write-Host "[fail ] $Message" -ForegroundColor Red; exit 1 }

function Write-Utf8NoBom([string]$Path, [string]$Text) {
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($Path, $Text, $utf8NoBom)
}

function Read-JsonFile([string]$Path) {
    return (Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json)
}

function Merge-JsonServer([string]$Path, [string]$Name, $Entry) {
    $servers = [ordered]@{}
    if (Test-Path -LiteralPath $Path) {
        Copy-Item -LiteralPath $Path -Destination "$Path.bak" -Force
        $existing = Read-JsonFile $Path
        $root = $existing.PSObject.Properties | Where-Object { $_.Name -eq 'mcpServers' }
        if ($root) {
            foreach ($property in $root.Value.PSObject.Properties) {
                $servers[$property.Name] = $property.Value
            }
        }
    } else {
        $directory = Split-Path -Parent $Path
        New-Item -ItemType Directory -Force -Path $directory | Out-Null
    }

    $servers[$Name] = $Entry
    Write-Utf8NoBom $Path (([ordered]@{ mcpServers = $servers } | ConvertTo-Json -Depth 14))
}

$profile = $env:USERPROFILE
if (-not $KeyPath) { $KeyPath = Join-Path $profile '.ssh\biotrace_deploy' }
if (-not $BaseDir) { $BaseDir = Join-Path $profile '.ssh-mcp' }

$serverDir = Join-Path $BaseDir 'server'
$configPath = Join-Path $BaseDir 'config.json'
$serverEntry = Join-Path $serverDir 'node_modules\@fangjunjie\ssh-mcp-server\build\index.js'

if ($Target -contains 'none' -and $Target.Count -gt 1) {
    Fail 'Target "none" cannot be combined with another target.'
}

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) { Fail 'node not found. Install Node.js 18 or newer first.' }
$nodeVersion = (& node -v).Trim().TrimStart('v')
if ([int]$nodeVersion.Split('.')[0] -lt 18) { Fail "Node.js 18 or newer required; found v$nodeVersion." }
Info "node v$nodeVersion -> $($node.Source)"

if (-not (Test-Path -LiteralPath $KeyPath)) {
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $KeyPath) | Out-Null
    $temporaryCmd = Join-Path $env:TEMP "biotrace_genkey_$PID.cmd"
    $comment = "$([System.Net.Dns]::GetHostName())-biotrace-ops"
    @"
@echo off
ssh-keygen -t ed25519 -f "$KeyPath" -C "$comment" -N "" < nul
"@ | Set-Content -LiteralPath $temporaryCmd -Encoding ASCII
    try {
        & cmd.exe /c $temporaryCmd | Out-Host
    } finally {
        Remove-Item -LiteralPath $temporaryCmd -Force -ErrorAction SilentlyContinue
    }
    if (-not (Test-Path -LiteralPath $KeyPath)) { Fail "ssh-keygen did not create $KeyPath." }
    Info "generated SSH key: $KeyPath"
} else {
    Info "SSH key already exists: $KeyPath"
}

if (-not (Test-Path -LiteralPath "$KeyPath.pub")) {
    & ssh-keygen -y -f $KeyPath | Set-Content -LiteralPath "$KeyPath.pub" -Encoding ASCII
}
$publicKey = (Get-Content -LiteralPath "$KeyPath.pub" -Raw).Trim()
$fingerprint = (& ssh-keygen -l -f "$KeyPath.pub" 2>&1) -join ' '
Info "public key fingerprint: $fingerprint"

if (-not (Test-Path -LiteralPath $serverEntry)) {
    New-Item -ItemType Directory -Force -Path $serverDir | Out-Null
    Info 'installing ssh-mcp-server'
    & npm install --prefix $serverDir '@fangjunjie/ssh-mcp-server' --save-exact --no-fund --no-audit --loglevel=error | Out-Host
    if (-not (Test-Path -LiteralPath $serverEntry)) { Fail "ssh-mcp-server entry not found: $serverEntry" }
} else {
    Info 'ssh-mcp-server is already installed'
}

# BioTrace never deploys with reset/clean and the data directory is irreplaceable.
$blacklist = @(
    '\brm\s+(-[a-zA-Z]*\s+)*-?[rf]{1,2}[a-zA-Z]*\s+/(?:\s|$|\*)',
    '\brm\s+-[a-zA-Z]*r[a-zA-Z]*f?[a-zA-Z]*\s+/(etc|var|usr|bin|boot|lib|opt|home|root|data)\b',
    '\brm\s+(-[a-zA-Z]*\s+)*-?[rf]{1,2}[a-zA-Z]*\s+/opt/biotrace/data\b',
    '\bmkfs(\.\w+)?\b',
    '\bdd\b[^\n]*\bof=/dev/',
    '\b(shutdown|reboot|halt|poweroff)\b',
    '\biptables\s+-F\b',
    '\bufw\s+(disable|reset)\b',
    '\bdocker\s+system\s+prune\b[^\n]*(-a|--all)',
    '\bdocker\s+volume\s+rm\b',
    '\bdocker\s+compose\s+down\b',
    '\bgit\s+reset\s+--hard\b',
    '\bgit\s+checkout\s+--\s+\.?\b',
    '\bgit\s+clean\s+-[a-zA-Z]*[dfx]',
    '\bgit\s+push\b[^\n]*--force\b',
    ':\s*\(\s*\)\s*\{.*\}\s*;\s*:'
)

$connection = [ordered]@{
    host = $SshHost
    port = 22
    username = $SshUser
    privateKey = ($KeyPath -replace '\\', '/')
    transportMode = 'exec'
    commandTimeoutMs = 900000
    connectionTimeoutMs = 30000
    keepaliveIntervalMs = 30000
    keepaliveCountMax = 5
    allowedRemotePaths = @($RemoteProjectDir)
    commandBlacklist = $blacklist
}

New-Item -ItemType Directory -Force -Path $BaseDir | Out-Null
$connections = [ordered]@{}
if (Test-Path -LiteralPath $configPath) {
    Copy-Item -LiteralPath $configPath -Destination "$configPath.bak" -Force
    $existing = Read-JsonFile $configPath
    foreach ($property in $existing.PSObject.Properties) { $connections[$property.Name] = $property.Value }
}
$connections[$ConnectionName] = $connection
Write-Utf8NoBom $configPath ($connections | ConvertTo-Json -Depth 14)
Info "wrote SSH MCP connection configuration: $configPath"

$mcpName = "$ConnectionName-ssh"
$mcpEntry = [ordered]@{
    type = 'stdio'
    command = ($node.Source -replace '\\', '/')
    args = @(($serverEntry -replace '\\', '/'), '--config-file', ($configPath -replace '\\', '/'))
}

if ($Target -contains 'cursor') {
    $cursorConfig = Join-Path $profile '.cursor\mcp.json'
    Merge-JsonServer $cursorConfig $mcpName $mcpEntry
    Info "registered $mcpName in $cursorConfig"
}

if ($Target -contains 'codex') {
    $tomlArgs = ($mcpEntry.args | ForEach-Object { '"' + $_ + '"' }) -join ', '
    Write-Host ''
    Write-Host 'Add this entry to ~/.codex/config.toml, then start a new Codex session:' -ForegroundColor Yellow
    Write-Host "[mcp_servers.$mcpName]"
    Write-Host "command = `"$($mcpEntry.command)`""
    Write-Host "args = [$tomlArgs]"
}

$installCommand = "install -d -m 700 /root/.ssh; touch /root/.ssh/authorized_keys; chmod 600 /root/.ssh/authorized_keys; grep -qxF '$publicKey' /root/.ssh/authorized_keys || echo '$publicKey' >> /root/.ssh/authorized_keys"
Write-Host ''
Write-Host 'One server-side action remains. Use Tencent Cloud OrcaTerm or the existing TAT MCP and run:' -ForegroundColor Yellow
Write-Host $installCommand -ForegroundColor Gray

if ($Verify) {
    Info 'verifying SSH connection'
    & ssh -i $KeyPath -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15 "$SshUser@$SshHost" 'hostname; whoami; test -d /opt/biotrace'
    if ($LASTEXITCODE -ne 0) { Fail 'SSH verification failed. Install the printed public key and try again.' }
    Info 'SSH verification passed'
}
