param(
  [string]$Tenant = $env:DEPLOY_TENANT_NAME,
  [switch]$SkipVerification,
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$ExtraArgs = @()
)

$ErrorActionPreference = "Stop"

if (-not $Tenant) {
  $Tenant = "boursedelor"
}

$rootDir = (Resolve-Path $PSScriptRoot).Path
$deployScript = Join-Path $rootDir "scripts\ops\deploy-release.sh"

if (-not (Test-Path $deployScript)) {
  throw "Missing tenant-aware deploy script: $deployScript"
}

$bash = Get-Command "bash" -ErrorAction SilentlyContinue
if (-not $bash) {
  throw "Bash is required for tenant-aware deployments. Run scripts/ops/deploy-release.sh from a Bash-capable shell."
}

$args = @($deployScript, $Tenant, "--build-artifact")

$skipFromEnv = @("1", "true", "yes", "y", "on") -contains ("" + $env:DEPLOY_SKIP_VERIFICATION).Trim().ToLower()
if ($SkipVerification.IsPresent -or $skipFromEnv) {
  $args += "--skip-verify"
}

if ($ExtraArgs.Count -gt 0) {
  $args += $ExtraArgs
}

Write-Host "[deploy] tenant-aware deploy: $Tenant"
Write-Host "[deploy] script: $deployScript"

& $bash.Source @args
if ($LASTEXITCODE -ne 0) {
  throw "Tenant-aware deploy failed with exit code $LASTEXITCODE"
}
