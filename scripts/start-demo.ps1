# Starts the full demo stack on this machine:
#   1. PostgreSQL  (port 5432)
#   2. API         (port 4000)
#   3. Web preview (port 5173, serves apps/web/dist and proxies the API)
#
# Safe to re-run: anything already listening is left alone.
#
#   powershell -ExecutionPolicy Bypass -File scripts\start-demo.ps1

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$nodeDir = 'D:\opencode\tools\node'
$pgDir = 'D:\opencode\tools\pgsql\bin'
$pgData = 'D:\opencode\tools\pgdata'
$logDir = Join-Path $root '.run'

if (Test-Path $nodeDir) {
  $env:Path = "$nodeDir;" + $env:Path
}
if (-not (Test-Path $logDir)) {
  New-Item -ItemType Directory -Path $logDir | Out-Null
}

function Test-Port([int]$port) {
  $client = New-Object System.Net.Sockets.TcpClient
  try {
    $client.Connect('127.0.0.1', $port)
    return $true
  } catch {
    return $false
  } finally {
    $client.Dispose()
  }
}

function Wait-Port([int]$port, [int]$seconds) {
  for ($i = 0; $i -lt $seconds; $i++) {
    if (Test-Port $port) { return $true }
    Start-Sleep -Seconds 1
  }
  return $false
}

function Wait-Url([string]$url, [int]$seconds) {
  for ($i = 0; $i -lt $seconds; $i++) {
    try {
      $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 3
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) { return $true }
    } catch {
      # keep waiting
    }
    Start-Sleep -Seconds 1
  }
  return $false
}

# --- PostgreSQL --------------------------------------------------------------
if (Test-Port 5432) {
  Write-Host 'PostgreSQL    already running on 5432'
} else {
  Write-Host 'PostgreSQL    starting...'
  $pgExe = Join-Path $pgDir 'postgres.exe'
  if (-not (Test-Path $pgExe)) {
    Write-Error "PostgreSQL executable not found at $pgExe"
    exit 1
  }
  Start-Process -FilePath $pgExe `
    -ArgumentList @('-D', $pgData, '-p', '5432') `
    -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $logDir 'postgres.out.log') `
    -RedirectStandardError (Join-Path $logDir 'postgres.err.log')
  if (-not (Wait-Port 5432 30)) {
    Write-Error 'PostgreSQL did not start. See .run\postgres.err.log'
    exit 1
  }
  Write-Host 'PostgreSQL    ready on 5432'
}

# --- API ---------------------------------------------------------------------
$apiHealth = 'http://localhost:4000/api/v1/health'
if (Wait-Url $apiHealth 1) {
  Write-Host 'API           already running on 4000'
} else {
  Write-Host 'API           starting...'
  $apiDir = Join-Path $root 'apps\api'
  $serverJs = Join-Path $apiDir 'dist\server.js'
  if (-not (Test-Path $serverJs)) {
    Write-Host 'API           dist not found, building...'
    Push-Location $root
    try {
      & npm.cmd run build --workspace @ps/api
    } finally {
      Pop-Location
    }
  }
  Start-Process -FilePath 'node' `
    -ArgumentList 'dist/server.js' `
    -WorkingDirectory $apiDir `
    -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $logDir 'api.out.log') `
    -RedirectStandardError (Join-Path $logDir 'api.err.log')
  if (-not (Wait-Url $apiHealth 40)) {
    Write-Error 'API did not become healthy. See .run\api.err.log'
    exit 1
  }
  Write-Host 'API           ready on 4000'
}

# --- Web ---------------------------------------------------------------------
if (Wait-Url 'http://localhost:5173' 1) {
  Write-Host 'Web app       already running on 5173'
} else {
  Write-Host 'Web app       starting...'
  $distIndex = Join-Path $root 'apps\web\dist\index.html'
  if (-not (Test-Path $distIndex)) {
    Write-Host 'Web app       dist not found, building...'
    Push-Location $root
    try {
      & npm.cmd run build --workspace @ps/web
    } finally {
      Pop-Location
    }
  }
  Start-Process -FilePath 'node' `
    -ArgumentList 'scripts/serve-web.mjs' `
    -WorkingDirectory $root `
    -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $logDir 'web.out.log') `
    -RedirectStandardError (Join-Path $logDir 'web.err.log')
  if (-not (Wait-Url 'http://localhost:5173' 30)) {
    Write-Error 'Web app did not start. See .run\web.err.log'
    exit 1
  }
  Write-Host 'Web app       ready on 5173'
}

Write-Host ''
Write-Host 'Demo stack is running.'
Write-Host "  Open:  http://localhost:5173"
Write-Host '  Login: admin@provisionstore.local / the password in SEED_ADMIN_PASSWORD'
Write-Host "  Logs:  $logDir"
