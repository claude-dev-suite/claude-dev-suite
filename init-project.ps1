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
$setupRan = $false
if (Test-Path $setupScript) {
    & $setupScript
    if ($LASTEXITCODE -ne 0) {
        Write-Host "! MCP server setup reported errors (exit $LASTEXITCODE)" -ForegroundColor Yellow
    }
    $setupRan = $true
} else {
    # Try bash script via WSL or Git Bash
    $bashScript = Join-Path $DevSuiteDir "scripts/setup-mcp-servers.sh"
    if (Test-Path $bashScript) {
        if (Get-Command bash -ErrorAction SilentlyContinue) {
            bash $bashScript
            if ($LASTEXITCODE -ne 0) {
                Write-Host "! MCP server setup reported errors (exit $LASTEXITCODE)" -ForegroundColor Yellow
            }
            $setupRan = $true
        } else {
            Write-Host "! setup script not available, skipping build" -ForegroundColor Yellow
        }
    }
}

# Verify every workspace produced a bundle, and retry the ones that did not.
# Mirrors the MISSING_DIST fallback in init-project.sh: the wizard will happily
# configure servers whose dist/index.js does not exist, and the failure only
# surfaces later, inside the assistant, as servers that refuse to start.
if ($setupRan) {
    $mcpDir = Join-Path $DevSuiteDir "mcp-servers"
    $mcpPkg = Join-Path $mcpDir "package.json"
    if (Test-Path $mcpPkg) {
        Push-Location $mcpDir
        try {
            $workspaces = @(& node -e "require('./package.json').workspaces.forEach(w => console.log(w))")
        } finally {
            Pop-Location
        }

        $missing = @()
        foreach ($ws in $workspaces) {
            if (-not $ws) { continue }
            # shared is a source-only workspace with no build script
            if ($ws -eq "shared") { continue }
            if (-not (Test-Path (Join-Path $mcpDir "$ws\dist\index.js"))) {
                $missing += $ws
            }
        }

        if ($missing.Count -gt 0) {
            Write-Host "! Some servers missing dist/: $($missing -join ' ')" -ForegroundColor Yellow
            Write-Host "  Attempting individual builds..." -ForegroundColor Yellow
            foreach ($ws in $missing) {
                Write-Host "  Building $ws... " -NoNewline
                Push-Location $mcpDir
                try {
                    # No `2>&1` on a native command: in Windows PowerShell 5.1
                    # that wraps each stderr line in a NativeCommandError, which
                    # throws under $ErrorActionPreference = "Stop" even when npm
                    # exits 0. The bundle check below is the real verdict.
                    npm run build -w $ws | Out-Null
                } catch {
                    # fall through to the dist check
                } finally {
                    Pop-Location
                }
                if (Test-Path (Join-Path $mcpDir "$ws\dist\index.js")) {
                    Write-Host "OK" -ForegroundColor Green
                } else {
                    Write-Host "FAILED" -ForegroundColor Red
                }
            }
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

# Open browser. Best-effort, exactly like the xdg-open/open/wslview chain in
# init-project.sh: with no default browser association (Windows Server, an SSH
# session) Start-Process throws, and under $ErrorActionPreference = "Stop" that
# killed the launcher before the server below was ever started.
try {
    Start-Process "http://localhost:$port" -ErrorAction Stop
} catch {
    Write-Host "  (could not open a browser automatically - open the URL above manually)" -ForegroundColor Yellow
}

# Start the dashboard server. cwd must be the server package so Node resolves
# its dependencies and package.json.
Set-Location $serverDir
node dist\index.js
