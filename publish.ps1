<#
.SYNOPSIS
    Pre-publish quality gate script for the Nodalite monorepo.
    Runs install, lint, typecheck, build, and test, aborting on any failure.

.PARAMETER WhatIf
    Dry-run mode. Prints commands without executing them.

.PARAMETER SkipInstall
    Skip the npm ci step.

.PARAMETER SkipTests
    Skip the npm run test step.

.PARAMETER Version
    Run changeset version to consume pending changesets and bump versions.

.EXAMPLE
    .\publish.ps1
    .\publish.ps1 -WhatIf
    .\publish.ps1 -SkipInstall -Version
#>

[CmdletBinding()]
param(
    [switch]$WhatIf,
    [switch]$SkipInstall,
    [switch]$SkipTests,
    [switch]$Version
)

$ErrorActionPreference = "Stop"

function Write-Step {
    param([int]$Current, [int]$Total, [string]$Message)
    Write-Host ""
    Write-Host "[$Current/$Total] $Message" -ForegroundColor Cyan
}

function Invoke-Step {
    param([string]$Description, [scriptblock]$Command)

    if ($WhatIf) {
        Write-Host "  [DRY-RUN] $Description" -ForegroundColor Yellow
        return
    }

    try {
        & $Command
        if ($LASTEXITCODE -ne 0) {
            throw "$Description failed with exit code $LASTEXITCODE"
        }
    }
    catch {
        Write-Host ""
        Write-Host "FAILED: $Description" -ForegroundColor Red
        Write-Host "  $_" -ForegroundColor Red
        exit 1
    }
}

# -- Determine total steps -----------------------------------------
$totalSteps = 5  # node check, lint, typecheck, build, test (minimum)
if (-not $SkipInstall) { $totalSteps++ }
if ($Version) { $totalSteps++ }

$step = 0

# -- Banner --------------------------------------------------------
Write-Host ""
Write-Host "Nodalite Pre-Publish Checks" -ForegroundColor Green
if ($WhatIf) {
    Write-Host "  (dry-run mode - no commands will be executed)" -ForegroundColor Yellow
}
Write-Host ""

# -- Step: Node version check --------------------------------------
$step++
Write-Step -Current $step -Total $totalSteps -Message "Checking Node.js version"

$nodeVersion = & node --version 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "  Node.js is not installed or not in PATH." -ForegroundColor Red
    exit 1
}

$versionMatch = [regex]::Match($nodeVersion, 'v(\d+)')
if (-not $versionMatch.Success) {
    Write-Host "  Could not parse Node.js version: $nodeVersion" -ForegroundColor Red
    exit 1
}

$majorVersion = [int]$versionMatch.Groups[1].Value
if ($majorVersion -lt 18) {
    Write-Host "  Node.js >= 18 is required (found $nodeVersion)" -ForegroundColor Red
    exit 1
}

Write-Host "  Node.js $nodeVersion - OK" -ForegroundColor Green

# -- Step: Install -------------------------------------------------
if (-not $SkipInstall) {
    $step++
    Write-Step -Current $step -Total $totalSteps -Message "Installing dependencies"
    Invoke-Step -Description "npm i" -Command { npm i }
    Write-Host "  Dependencies installed." -ForegroundColor Green
}

# -- Step: Build ---------------------------------------------------
$step++
Write-Step -Current $step -Total $totalSteps -Message "Building"
Invoke-Step -Description "npm run build" -Command { npm run build }
Write-Host "  Build succeeded." -ForegroundColor Green

# -- Step: Test ----------------------------------------------------
if (-not $SkipTests) {
    $step++
    Write-Step -Current $step -Total $totalSteps -Message "Running tests"
    Invoke-Step -Description "npm run test" -Command { npm run test }
    Write-Host "  All tests passed." -ForegroundColor Green
}

# -- Step: Lint ----------------------------------------------------
$step++
Write-Step -Current $step -Total $totalSteps -Message "Linting"
Invoke-Step -Description "npm run lint" -Command { npm run lint }
Write-Host "  Lint passed." -ForegroundColor Green

# -- Step: Typecheck -----------------------------------------------
$step++
Write-Step -Current $step -Total $totalSteps -Message "Typechecking"
Invoke-Step -Description "npm run typecheck" -Command { npm run typecheck }
Write-Host "  Typecheck passed." -ForegroundColor Green


# -- Step: Changeset version ---------------------------------------
if ($Version) {
    $step++
    Write-Step -Current $step -Total $totalSteps -Message "Consuming changesets (changeset version)"
    Invoke-Step -Description "changeset version" -Command { npx changeset version }
    Write-Host "  Versions bumped." -ForegroundColor Green
}

# -- Done ----------------------------------------------------------
Write-Host ""
Write-Host "All checks passed. Ready to publish." -ForegroundColor Green
Write-Host ""
