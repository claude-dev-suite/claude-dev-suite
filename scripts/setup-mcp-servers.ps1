# ================================================================
# dev-suite MCP Servers Setup Script (PowerShell)
# ================================================================
# This script builds all MCP servers so they're ready to be copied
# to target projects during /init-project
#
# Usage: .\scripts\setup-mcp-servers.ps1
# ================================================================

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$DevSuiteRoot = Split-Path -Parent $ScriptDir
$McpServersDir = Join-Path $DevSuiteRoot "mcp-servers"

Write-Host "================================================================" -ForegroundColor Blue
Write-Host "  dev-suite MCP Servers Setup" -ForegroundColor Blue
Write-Host "================================================================" -ForegroundColor Blue
Write-Host ""

# Check if npm is available
try {
    $null = Get-Command npm -ErrorAction Stop
} catch {
    Write-Host "Error: npm is not installed or not in PATH" -ForegroundColor Red
    exit 1
}

# List of MCP servers to build - derived from the npm workspaces so a new server
# is picked up automatically, exactly like setup-mcp-servers.sh does.
if (-not (Test-Path (Join-Path $McpServersDir "package.json"))) {
    Write-Host "Error: mcp-servers/package.json not found" -ForegroundColor Red
    exit 1
}

Push-Location $McpServersDir
$Servers = @(& node -e "require('./package.json').workspaces.forEach(w => console.log(w))")
Pop-Location

if ($Servers.Count -eq 0) {
    Write-Host "Error: Could not read workspaces from mcp-servers/package.json" -ForegroundColor Red
    exit 1
}

Write-Host "Found $($Servers.Count) MCP servers: $($Servers -join ', ')" -ForegroundColor Blue
Write-Host ""

# Track results
$Built = 0
$Skipped = 0
$Failed = 0

foreach ($server in $Servers) {
    $ServerPath = Join-Path $McpServersDir $server

    if (-not (Test-Path $ServerPath)) {
        Write-Host "[SKIP] $server - directory not found" -ForegroundColor Yellow
        $Skipped++
        continue
    }

    Write-Host "[BUILD] $server" -ForegroundColor Blue

    Push-Location $ServerPath

    try {
        $DistPath = Join-Path $ServerPath "dist"
        $NodeModulesPath = Join-Path $ServerPath "node_modules"
        $DistIndexPath = Join-Path $DistPath "index.js"

        # Check if already built and up to date
        if ((Test-Path $DistPath) -and (Test-Path $NodeModulesPath) -and (Test-Path $DistIndexPath)) {
            $DistTime = (Get-Item $DistIndexPath).LastWriteTime
            $SrcPath = Join-Path $ServerPath "src"
            $NewerFiles = Get-ChildItem -Path $SrcPath -Filter "*.ts" -Recurse |
                          Where-Object { $_.LastWriteTime -gt $DistTime }

            if ($NewerFiles.Count -eq 0) {
                Write-Host "  [OK] Already built and up to date" -ForegroundColor Green
                $Built++
                Pop-Location
                continue
            }
        }

        # Install dependencies
        Write-Host "  Installing dependencies..."
        $null = npm install 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Host "  [FAIL] Failed to install dependencies" -ForegroundColor Red
            $Failed++
            Pop-Location
            continue
        }

        # Build
        Write-Host "  Building..."
        $null = npm run build 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Host "  [FAIL] Failed to build" -ForegroundColor Red
            $Failed++
            Pop-Location
            continue
        }

        Write-Host "  [OK] Built successfully" -ForegroundColor Green
        $Built++
    }
    catch {
        Write-Host "  [FAIL] Error: $_" -ForegroundColor Red
        $Failed++
    }
    finally {
        Pop-Location
    }
}

Write-Host ""
Write-Host "================================================================" -ForegroundColor Blue
Write-Host "  Setup Complete" -ForegroundColor Green
Write-Host "================================================================" -ForegroundColor Blue
Write-Host "  Built:   $Built" -ForegroundColor Green
Write-Host "  Skipped: $Skipped" -ForegroundColor Yellow
Write-Host "  Failed:  $Failed" -ForegroundColor Red
Write-Host ""

if ($Failed -gt 0) {
    Write-Host "Some servers failed to build. Check the errors above." -ForegroundColor Red
    exit 1
}

Write-Host "All MCP servers are ready for /init-project" -ForegroundColor Green
