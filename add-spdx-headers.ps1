# add-spdx-headers.ps1
# Adds SPDX-License-Identifier: MIT header to .ts, .tsx, .cjs files

$header = "// SPDX-License-Identifier: MIT"

$directories = @(
    "configurator/dashboard/src",
    "configurator/dashboard/server/src",
    "configurator/dashboard/electron",
    "mcp-servers/*/src"
)

$root = $PSScriptRoot
if (-not $root) { $root = Get-Location }

$totalFiles = 0
$skipped = 0
$updated = 0

foreach ($dir in $directories) {
    $pattern = Join-Path $root $dir
    $files = Get-ChildItem -Path $pattern -Include "*.ts","*.tsx","*.cjs" -Recurse -ErrorAction SilentlyContinue

    foreach ($file in $files) {
        $totalFiles++
        $firstLine = Get-Content $file.FullName -TotalCount 1 -ErrorAction SilentlyContinue

        if ($firstLine -eq $header) {
            $skipped++
            continue
        }

        $content = Get-Content $file.FullName -Raw -ErrorAction SilentlyContinue
        $newContent = "$header`r`n$content"
        Set-Content -Path $file.FullName -Value $newContent -NoNewline
        $updated++
    }
}

Write-Host "SPDX Headers Summary:"
Write-Host "  Total files scanned: $totalFiles"
Write-Host "  Already had header (skipped): $skipped"
Write-Host "  Updated: $updated"
