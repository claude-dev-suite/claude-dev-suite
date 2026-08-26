# ================================================================
# dev-suite Project Initializer (Windows PowerShell)
# ================================================================
# Launches the web dashboard for project configuration
# All configuration is done through the UI
# ================================================================

param(
    [Parameter(Position=0)]
    [string]$TargetPath = "."
)

$ErrorActionPreference = "Stop"

# Get script directory (dev-suite root)
$DevSuiteDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# Convert target to absolute path
if ([System.IO.Path]::IsPathRooted($TargetPath)) {
    $TargetDir = $TargetPath
} else {
    $TargetDir = Join-Path (Get-Location) $TargetPath
}
$TargetDir = [System.IO.Path]::GetFullPath($TargetDir)

# ================================================================
# HEADER
# ================================================================
Write-Host ""
Write-Host "================================================================" -ForegroundColor Blue
Write-Host "         dev-suite Project Initializer" -ForegroundColor White
Write-Host "                Web Dashboard" -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor Blue
Write-Host ""

# ================================================================
# CHECK REQUIREMENTS
# ================================================================
Write-Host "[1/3] Checking requirements..." -ForegroundColor Blue

# Check Node.js
try {
    $nodeVersion = (node -v) -replace 'v', ''
    $nodeMajor = [int]($nodeVersion -split '\.')[0]
    if ($nodeMajor -lt 20) {
        Write-Host "X Node.js 20+ required (found v$nodeVersion)" -ForegroundColor Red
        exit 1
    }
    Write-Host "OK Node.js v$nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "X Node.js is not installed" -ForegroundColor Red
    Write-Host "Please install Node.js 20+ from https://nodejs.org" -ForegroundColor Yellow
    exit 1
}

# Check npm
try {
    $npmVersion = npm -v
    Write-Host "OK npm v$npmVersion" -ForegroundColor Green
} catch {
    Write-Host "X npm is not installed" -ForegroundColor Red
    exit 1
}

# ================================================================
# BUILD MCP SERVERS (if needed)
# ================================================================
Write-Host ""
Write-Host "[2/3] Preparing MCP servers..." -ForegroundColor Blue

$setupScript = Join-Path $DevSuiteDir "scripts\setup-mcp-servers.ps1"
if (Test-Path $setupScript) {
    & $setupScript
} else {
    # Try bash script via WSL or Git Bash
    $bashScript = Join-Path $DevSuiteDir "scripts/setup-mcp-servers.sh"
    if (Test-Path $bashScript) {
        if (Get-Command bash -ErrorAction SilentlyContinue) {
            bash $bashScript
        } else {
            Write-Host "! setup script not available, skipping build" -ForegroundColor Yellow
        }
    }
}

# ================================================================
# LAUNCH DASHBOARD
# ================================================================
Write-Host ""
Write-Host "[3/3] Launching dashboard..." -ForegroundColor Blue

$dashboardDir = Join-Path $DevSuiteDir "configurator\dashboard"
$serverDir    = Join-Path $dashboardDir "server"
$serverScript = Join-Path $serverDir "dist\index.js"
$uiEntry      = Join-Path $dashboardDir "dist\index.html"

if (-not (Test-Path $dashboardDir)) {
    Write-Host "X Dashboard not found at $dashboardDir" -ForegroundColor Red
    exit 1
}

# Build the backend if it has never been compiled (fresh clone)
if (-not (Test-Path $serverScript)) {
    Write-Host "  -> Building dashboard server (first run, this takes a minute)..." -ForegroundColor Yellow
    Push-Location $serverDir
    if (-not (Test-Path (Join-Path $serverDir "node_modules"))) { npm install --silent }
    npm run build --silent
    $buildOk = $?
    Pop-Location
    if (-not $buildOk -or -not (Test-Path $serverScript)) {
        Write-Host "X Failed to build the dashboard server" -ForegroundColor Red
        Write-Host "    Run manually: cd `"$serverDir`"; npm install; npm run build"
        exit 1
    }
}

# Build the frontend if it has never been compiled. Without it the server still
# starts, but serves the API only and http://localhost:PORT returns a 503.
if (-not (Test-Path $uiEntry)) {
    Write-Host "  -> Building dashboard UI (first run, this takes a minute)..." -ForegroundColor Yellow
    Push-Location $dashboardDir
    if (-not (Test-Path (Join-Path $dashboardDir "node_modules"))) { npm install --silent }
    npm run build --silent
    $buildOk = $?
    Pop-Location
    if (-not $buildOk -or -not (Test-Path $uiEntry)) {
        Write-Host "X Failed to build the dashboard UI" -ForegroundColor Red
        Write-Host "    Run manually: cd `"$dashboardDir`"; npm install; npm run build"
        exit 1
    }
}

# Find available port
$port = 3456
while ($true) {
    $listener = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
    if (-not $listener) { break }
    $port++
}

# Set environment variables
$env:DEV_SUITE_DIR = $DevSuiteDir
$env:DEV_SUITE_PROJECT_PATH = $TargetDir
$env:PORT = $port

Write-Host ""
Write-Host "================================================================" -ForegroundColor Green
Write-Host "  Dashboard starting on port $port" -ForegroundColor Green
Write-Host "================================================================" -ForegroundColor Green
Write-Host ""
Write-Host "  URL:     http://localhost:$port" -ForegroundColor Cyan
Write-Host "  Project: $TargetDir"
Write-Host ""
Write-Host "Press Ctrl+C to stop the dashboard" -ForegroundColor Yellow
Write-Host ""

# Open browser
Start-Process "http://localhost:$port"

# Start the dashboard server. cwd must be the server package so Node resolves
# its dependencies and package.json.
Set-Location $serverDir
node dist\index.js
