#Requires -Version 5.1
<#
.SYNOPSIS
  Enable PostgreSQL for CampusSynz in backend/.env and test the connection.

.USAGE
  cd backend
  .\scripts\enable_postgres.ps1
#>
$ErrorActionPreference = "Stop"
$BackendRoot = Split-Path $PSScriptRoot -Parent
$EnvFile = Join-Path $BackendRoot ".env"
$PgUrl = "postgresql://postgres:campussynz_dev@localhost:5432/campussynz"

Write-Host "CampusSynz - PostgreSQL setup" -ForegroundColor Cyan

if (-not (Test-Path $EnvFile)) {
    Copy-Item (Join-Path $BackendRoot ".env.example") $EnvFile
    Write-Host "Created .env from .env.example"
}

$lines = Get-Content $EnvFile
$updated = @()
$hasDbUrl = $false
foreach ($line in $lines) {
    if ($line -match '^\s*#\s*DATABASE_URL=postgresql://') {
        $updated += "DATABASE_URL=$PgUrl"
        $hasDbUrl = $true
    }
    elseif ($line -match '^\s*DATABASE_URL=postgresql://') {
        $updated += "DATABASE_URL=$PgUrl"
        $hasDbUrl = $true
    }
    else {
        $updated += $line
    }
}
if (-not $hasDbUrl) {
    $updated = @("DATABASE_URL=$PgUrl", "") + $updated
}
Set-Content -Path $EnvFile -Value $updated -Encoding utf8
Write-Host "Updated .env with PostgreSQL URL" -ForegroundColor Green

$python = Join-Path $BackendRoot "venv\Scripts\python.exe"
if (-not (Test-Path $python)) {
    $python = "python"
}

Write-Host ""
Write-Host "Testing connection..."
Push-Location $BackendRoot
& $python database/test_db_connection.py
$code = $LASTEXITCODE
Pop-Location

if ($code -ne 0) {
    Write-Host ""
    Write-Host "PostgreSQL is not reachable yet. Check:" -ForegroundColor Yellow
    Write-Host '  - PostgreSQL service is running in Windows Services'
    Write-Host '  - Database campussynz exists in pgAdmin'
    Write-Host '  - Password in .env matches your postgres password'
    Write-Host ""
    Write-Host "Then run:"
    Write-Host "  python database/init_db.py"
    Write-Host "  python app.py"
    exit 1
}

Write-Host ""
Write-Host "Running init_db.py..."
Push-Location $BackendRoot
& $python database/init_db.py
Pop-Location
Write-Host ""
Write-Host "Done! Start the API with: python app.py" -ForegroundColor Green
