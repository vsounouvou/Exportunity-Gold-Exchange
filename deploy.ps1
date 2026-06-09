param(
  [string]$Tenant = $env:DEPLOY_TENANT
)

$ErrorActionPreference = "Stop"
$rootDir = (Resolve-Path $PSScriptRoot).Path
if ([string]::IsNullOrWhiteSpace($Tenant)) {
  throw "Tenant is required. Example: .\deploy.ps1 mindbase --build-artifact"
}
$bashCandidates = @(
  "C:\Program Files\Git\bin\bash.exe",
  "C:\Program Files\Git\usr\bin\bash.exe"
)
$bash = $bashCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $bash) {
  throw "bash is required to run scripts/ops/deploy-release.sh"
}

Write-Host "[deploy] delegating to scripts/ops/deploy-release.sh"
& $bash (Join-Path $rootDir "scripts/ops/deploy-release.sh") $Tenant @args
if ($LASTEXITCODE -ne 0) {
  throw "deploy-release.sh failed with exit code $LASTEXITCODE"
}
