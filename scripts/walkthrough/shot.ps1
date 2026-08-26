# 本地走查截图：无头 Edge 打开 dev-login 跳转页，等首屏画完再截。
# 用法见同目录 README.md。截图产物统一落 .shot/（已 gitignore）。
param(
  # 目标路由，如 "/" 或 "/collection/volumes/woodland_edge"
  [Parameter(Mandatory = $true)][string]$To,
  [Parameter(Mandatory = $true)][string]$Out,
  # 别往 500 以下调：Windows 无头窗口有最小宽度，更窄会按 500 渲染再裁掉（见 README）
  [int]$Width = 500,
  [int]$Height = 932,
  # 皮肤 id；留空用本地已存的偏好
  [string]$Theme = "",
  # 追加给 dev-login 的参数，如 "book=<tripId>" 预置开书交接
  [string]$Extra = "",
  # 虚拟时钟预算（ms）。页面里有轮询时给足，太小会一直等网络、卡住不出图
  [int]$Wait = 9000,
  [int]$Port = 5190
)

$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)

$edge = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
if (-not (Test-Path $edge)) { $edge = "C:\Program Files\Microsoft\Edge\Application\msedge.exe" }
if (-not (Test-Path $edge)) { throw "没找到 Edge，改 `$edge 指到本机浏览器" }

# 跳转页得和应用同源才能带上会话，所以放 public/。那份是 gitignore 的，
# 不入库也不会进构建产物（发版从 git 干净检出）
$helper = Join-Path $repo "apps\web\public\dev-login.html"
# 每次都覆盖：只在缺失时拷会让改过的跳转页永远生效不了
Copy-Item (Join-Path $PSScriptRoot "dev-login.html") $helper -Force

$url = "http://127.0.0.1:$Port/dev-login.html?to=" + [uri]::EscapeDataString($To)
if ($Theme) { $url += "&theme=$Theme" }
if ($Extra) { $url += "&$Extra" }

# 无头 Edge 解析相对路径的基准目录和当前工作目录不是一回事，必须给绝对路径
if (-not [System.IO.Path]::IsPathRooted($Out)) { $Out = Join-Path (Get-Location).Path $Out }
$outDir = Split-Path -Parent $Out
if ($outDir -and -not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir -Force | Out-Null }
if (Test-Path $Out) { Remove-Item $Out -Force }

# Edge 会往 stderr 吐无关警告（比如找不到 QQ 浏览器的导入目录）。
# ErrorActionPreference=Stop 下这些会被当成终止错误，把截图流程掐断，所以这段放开
$ErrorActionPreference = "Continue"

foreach ($attempt in 1..3) {
  # 每次换 profile 目录：同一个目录连开两次会互相抢锁，第二次静默不出图
  $prof = Join-Path $env:TEMP ("bt-shot-" + [guid]::NewGuid().ToString("N").Substring(0, 8))
  & $edge --headless=new --disable-gpu --hide-scrollbars --no-first-run --no-default-browser-check `
    --user-data-dir="$prof" --window-size="$Width,$Height" `
    --virtual-time-budget=$Wait --screenshot="$Out" "$url" 2>&1 | Out-Null
  Start-Sleep -Milliseconds 400
  Remove-Item $prof -Recurse -Force -ErrorAction SilentlyContinue
  if (Test-Path $Out) { break }
}

if (Test-Path $Out) { "OK  $Out  $((Get-Item $Out).Length) bytes" } else { "FAIL $Out（dev server 在 $Port 上吗？）" }
