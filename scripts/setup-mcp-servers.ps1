# ================================================================
# dev-suite MCP Servers Setup Script (PowerShell)
# ================================================================
# This script builds all MCP servers so they're ready to be copied
# to target projects during /init-project
#
# Uses npm workspaces for shared dependencies, exactly like
# setup-mcp-servers.sh. Installing per-server instead does not work:
# esbuild and typescript are devDependencies of mcp-servers/package.json
# (the workspace root) only, so scripts/bundle.mjs can never resolve
# `import { build } from 'esbuild'` from inside a server directory.
#
# Usage: .\scripts\setup-mcp-servers.ps1
# ================================================================

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$DevSuiteRoot = Split-Path -Parent $ScriptDir
$McpServersDir = Join-Path $DevSuiteRoot "mcp-servers"

Write-Host "================================================================" -ForegroundColor Blue
Write-Host "  dev-suite MCP Servers Setup (Workspaces)" -ForegroundColor Blue
Write-Host "================================================================" -ForegroundColor Blue
Write-Host ""

# Check if npm is available
try {
    $null = Get-Command npm -ErrorAction Stop
} catch {
    Write-Host "Error: npm is not installed or not in PATH" -ForegroundColor Red
    exit 1
}

# npm 7+ is required for workspaces
$NpmMajor = [int]((npm --version).Split('.')[0])
if ($NpmMajor -lt 7) {
    Write-Host "Error: npm 7+ required for workspaces (found npm $NpmMajor)" -ForegroundColor Red
    exit 1
}

# List of MCP servers to build - derived from the npm workspaces so a new server
# is picked up automatically, exactly like setup-mcp-servers.sh does.
if (-not (Test-Path (Join-Path $McpServersDir "package.json"))) {
    Write-Host "Error: mcp-servers/package.json not found" -ForegroundColor Red
    exit 1
}

Push-Location $McpServersDir
try {
    $Servers = @(& node -e "require('./package.json').workspaces.forEach(w => console.log(w))")

    if ($Servers.Count -eq 0) {
        Write-Host "Error: Could not read workspaces from mcp-servers/package.json" -ForegroundColor Red
        exit 1
    }

    Write-Host "Found $($Servers.Count) MCP servers: $($Servers -join ', ')" -ForegroundColor Blue
    Write-Host ""

    # ------------------------------------------------------------
    # Decide whether anything needs building
    # ------------------------------------------------------------
    $NeedsBuild = $false
    $MissingDist = @()

    foreach ($server in $Servers) {
        # shared is a source-only workspace: it has a package.json but no build
        # script and never emits a bundle. Counting it as "missing dist" makes
        # every run a full rebuild.
        if ($server -eq "shared") { continue }
        $ServerPath = Join-Path $McpServersDir $server
        if ((Test-Path $ServerPath) -and (Test-Path (Join-Path $ServerPath "package.json"))) {
            if (-not (Test-Path (Join-Path $ServerPath "dist\index.js"))) {
                $NeedsBuild = $true
                $MissingDist += $server
            }
        }
    }

    # Source newer than its bundle?
    if (-not $NeedsBuild) {
        foreach ($server in $Servers) {
            $ServerPath = Join-Path $McpServersDir $server
            $SrcPath = Join-Path $ServerPath "src"
            $DistIndex = Join-Path $ServerPath "dist\index.js"
            if ((Test-Path $SrcPath) -and (Test-Path $DistIndex)) {
                $DistTime = (Get-Item $DistIndex).LastWriteTime
                $Newer = Get-ChildItem -Path $SrcPath -Filter "*.ts" -Recurse -ErrorAction SilentlyContinue |
                         Where-Object { $_.LastWriteTime -gt $DistTime } |
                         Select-Object -First 1
                if ($Newer) { $NeedsBuild = $true; break }
            }
        }
    }

    if (-not (Test-Path (Join-Path $McpServersDir "node_modules"))) {
        $NeedsBuild = $true
    }

    if (-not $NeedsBuild) {
        Write-Host "All MCP servers already built and up to date" -ForegroundColor Green
        Write-Host ""
        Write-Host "================================================================" -ForegroundColor Blue
        Write-Host "  Setup Complete" -ForegroundColor Green
        Write-Host "================================================================" -ForegroundColor Blue
        exit 0
    }

    if ($MissingDist.Count -gt 0) {
        Write-Host "Missing dist/: $($MissingDist -join ' ')" -ForegroundColor Yellow
        Write-Host ""
    }

    # ------------------------------------------------------------
    # Install once at the workspace root, then build every workspace
    # ------------------------------------------------------------
    Write-Host "[1/2] Installing dependencies (workspaces)..." -ForegroundColor Blue
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "X Failed to install dependencies" -ForegroundColor Red
        exit 1
    }
    Write-Host "OK Dependencies installed" -ForegroundColor Green

    # The root build script is `npm run build --workspaces --if-present`, so a
    # workspace without a build script (shared) is skipped rather than failing.
    Write-Host "[2/2] Building all MCP servers..." -ForegroundColor Blue
    npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Host "! Some servers may have failed to build (check output above)" -ForegroundColor Yellow
    }
    Write-Host "OK Build completed" -ForegroundColor Green

    # ------------------------------------------------------------
    # Verify: a bundle on disk is the only thing that counts
    # ------------------------------------------------------------
    Write-Host ""
    Write-Host "Build Status:" -ForegroundColor Blue
    $BuiltCount = 0
    $FailedCount = 0
    foreach ($server in $Servers) {
        $DistIndex = Join-Path (Join-Path $McpServersDir $server) "dist\index.js"
        $HasBuildScript = Test-Path (Join-Path (Join-Path $McpServersDir $server) "package.json")
        if (Test-Path $DistIndex) {
            Write-Host "  OK   $server" -ForegroundColor Green
            $BuiltCount++
        } elseif ($HasBuildScript -and $server -eq "shared") {
            # shared is a source-only workspace consumed by the other servers
            Write-Host "  --   $server (source-only, no bundle expected)" -ForegroundColor DarkGray
        } else {
            Write-Host "  FAIL $server (missing dist/index.js)" -ForegroundColor Red
            $FailedCount++
        }
    }
}
finally {
    Pop-Location
}

Write-Host ""
Write-Host "================================================================" -ForegroundColor Blue
Write-Host "  Setup Complete" -ForegroundColor Green
Write-Host "================================================================" -ForegroundColor Blue
Write-Host "  Servers: $BuiltCount built, $FailedCount failed"
Write-Host "  Mode:    npm workspaces (shared dependencies)"
Write-Host ""

if ($FailedCount -gt 0) {
    Write-Host "Some servers failed to build. Check their src/index.ts for errors." -ForegroundColor Red
    exit 1
}

Write-Host "All MCP servers are ready for /init-project" -ForegroundColor Green
