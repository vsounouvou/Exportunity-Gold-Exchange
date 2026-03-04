param(
  [string]$DeploySshHost = $env:DEPLOY_SSH_HOST,
  [string]$DeploySshKey = $env:DEPLOY_SSH_KEY,
  [string]$DeployRemoteBase = $env:DEPLOY_REMOTE_BASE,
  [string]$DeployRemoteTarballDir = $env:DEPLOY_REMOTE_TARBALL_DIR,
  [string]$E2EBaseUrl = $env:E2E_BASE_URL,
  [string]$E2ESpec = $env:E2E_SPEC,
  [string]$E2EAdminEmail = $env:E2E_ADMIN_EMAIL,
  [string]$E2EAdminPassword = $env:E2E_ADMIN_PASSWORD,
  [string]$BuildId = $env:BUILD_ID,
  [string]$GitSha = $env:GIT_SHA,
  [string]$DeployProfile = $env:DEPLOY_PROFILE,
  [string]$DeployDomain = $env:DEPLOY_DOMAIN,
  [switch]$SkipVerification
)

$ErrorActionPreference = "Stop"

$rootDir = (Resolve-Path $PSScriptRoot).Path

if (-not $DeploySshHost) { $DeploySshHost = "vital@51.254.143.30" }
if (-not $DeploySshKey) { $DeploySshKey = Join-Path $HOME ".ssh\bdo_ovh_vps_ed25519" }
if (-not $DeployRemoteBase) { $DeployRemoteBase = "/home/vital/apps/bdo-app" }
if (-not $DeployRemoteTarballDir) { $DeployRemoteTarballDir = $DeployRemoteBase }
if (-not $E2EBaseUrl) { $E2EBaseUrl = "https://boursedelor.com" }
if (-not $E2ESpec) { $E2ESpec = "tests/e2e/versioning.spec.ts" }

$skipVerificationEnv = @("1", "true", "yes", "y", "on") -contains ("" + $env:DEPLOY_SKIP_VERIFICATION).Trim().ToLower()
$skipVerification = $SkipVerification.IsPresent -or $skipVerificationEnv

function New-BuildId {
  return [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds().ToString()
}

function Get-GitSha12([string]$repoDir) {
  $sha = (& git -C $repoDir rev-parse --short=12 HEAD) 2>$null
  if (-not $sha) { throw "Unable to read git SHA (is git installed and is this a git repo?)" }
  return $sha.Trim()
}

function Invoke-SshScript {
  param(
    [Parameter(Mandatory = $true)][string]$ScriptText
  )
  $normalized = $ScriptText.Replace("`r`n", "`n").Replace("`r", "")
  $tmpScript = Join-Path ([System.IO.Path]::GetTempPath()) ("ssh-script-" + [guid]::NewGuid().ToString("n") + ".sh")
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($tmpScript, ($normalized + "`n"), $utf8NoBom)
  try {
    $cmd = "ssh.exe -i `"$DeploySshKey`" -o StrictHostKeyChecking=no $DeploySshHost `"bash -s`" < `"$tmpScript`""
    cmd /c $cmd | Write-Host
    if ($LASTEXITCODE -ne 0) { throw "ssh remote script failed (exit $LASTEXITCODE)" }
  } finally {
    try { [System.IO.File]::Delete($tmpScript) } catch {}
  }
}

function Invoke-SshCommand {
  param(
    [Parameter(Mandatory = $true)][string]$Command
  )
  & ssh.exe -i $DeploySshKey -o StrictHostKeyChecking=no $DeploySshHost $Command
  if ($LASTEXITCODE -ne 0) { throw "ssh failed (exit $LASTEXITCODE): $Command" }
}

function Invoke-LocalCommand {
  param(
    [Parameter(Mandatory = $true)][string]$FilePath,
    [Parameter(Mandatory = $false)][string[]]$Arguments = @()
  )
  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) { throw "$FilePath failed (exit $LASTEXITCODE)" }
}

if (-not $BuildId) { $BuildId = New-BuildId }
if (-not $GitSha) { $GitSha = Get-GitSha12 -repoDir $rootDir }

if ($DeployProfile -or $DeployDomain) {
  Write-Host "[deploy] domain guard profile=$DeployProfile domain=$DeployDomain"
  Invoke-LocalCommand -FilePath "node" -Arguments @(
    (Join-Path $rootDir "scripts/deploy-domain-guard.mjs"),
    "--profile=$DeployProfile",
    "--domain=$DeployDomain"
  )
}

$tarballName = "deploy-src-$BuildId.tgz"
$tarballPath = Join-Path ([System.IO.Path]::GetTempPath()) $tarballName
$reportDir = Join-Path $rootDir ("reports\" + $BuildId)
$reportPath = Join-Path $rootDir ("deploy-report-$BuildId.md")

Write-Host "[deploy] buildId=$BuildId gitSha=$GitSha"

$meta = @{ buildId = $BuildId; gitSha = $GitSha } | ConvertTo-Json -Compress
$metaPath = Join-Path $rootDir ".build-meta.json"
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($metaPath, ($meta + "`n"), $utf8NoBom)

Write-Host "[deploy] packing $tarballName"
Push-Location $rootDir
try {
  Invoke-LocalCommand -FilePath "tar" -Arguments @(
    "-czf", $tarballPath,
    "--exclude=./dist",
    "--exclude=./node_modules",
    "--exclude=./.git",
    "--exclude=./.env",
    "--exclude=./.env.*",
    "--exclude=./.config",
    "--exclude=./.local",
    "--exclude=./.logs",
    "--exclude=./.tmp_uploads",
    "--exclude=./crawl",
    "--exclude=./mirror",
    "--exclude=./imports",
    "--exclude=./logs",
    "--exclude=./tmp",
    "--exclude=./mobile",
    "--exclude=./attached_assets",
    "--exclude=./test-results",
    "--exclude=./reports",
    "--exclude=./deploy-src-*.tgz",
    "--exclude=./deploy-dist-*.zip",
    "--exclude=./deploy-report-*.md",
    "--exclude=./dist-public-*.tgz",
    "--exclude=./bdo-app-src*.tgz",
    "--exclude=./server.log",
    "--exclude=./server-prod.log",
    "-C", $rootDir,
    "."
  )
} finally {
  Pop-Location
}

Write-Host "[deploy] upload to ${DeploySshHost}:${DeployRemoteTarballDir}/${tarballName}"
Invoke-LocalCommand -FilePath "scp.exe" -Arguments @(
  "-i", $DeploySshKey,
  "-o", "StrictHostKeyChecking=no",
  $tarballPath,
  ("${DeploySshHost}:${DeployRemoteTarballDir}/${tarballName}")
)

function Invoke-Rollback {
  Write-Host "[deploy] verification failed - attempting rollback"
  $rollbackScript = @"
set -euo pipefail
BASE="$DeployRemoteBase"
NEW_ID="$BuildId"
PREV="`$BASE/src_prev_`$NEW_ID"
if [ ! -d "`$PREV" ]; then
  echo "[rollback] no prev dir found: `$PREV"
  exit 0
fi
FAILED="`$BASE/src_failed_`$NEW_ID"
rm -rf "`$FAILED"
if [ -d "`$BASE/src" ]; then
  mv "`$BASE/src" "`$FAILED"
fi
mv "`$PREV" "`$BASE/src"
cd "`$BASE/src"
COMPOSE_PROJECT_NAME=src docker compose up -d --build bdo-app
echo "[rollback] restored previous release"
"@
  try {
    Invoke-SshScript -ScriptText $rollbackScript
  } catch {
    Write-Warning ("[rollback] failed: " + $_.Exception.Message)
  }
}

try {
  Write-Host "[deploy] remote deploy (atomic dir swap + docker rebuild)"
  $remoteScript = @"
set -euo pipefail
BASE="$DeployRemoteBase"
NEW_ID="$BuildId"
GIT_SHA="$GitSha"
TARBALL="$DeployRemoteTarballDir/$tarballName"
NEW="`$BASE/src_new_`$NEW_ID"
PREV="`$BASE/src_prev_`$NEW_ID"

rm -rf "`$NEW"
mkdir -p "`$NEW"
tar -xzf "`$TARBALL" -C "`$NEW"

# Preserve the production env file (never deploy local .env).
if [ -f "`$BASE/src/.env" ]; then
  cp "`$BASE/src/.env" "`$NEW/.env"
fi

if [ -d "`$BASE/src" ]; then
  mv "`$BASE/src" "`$PREV"
fi
mv "`$NEW" "`$BASE/src"

cd "`$BASE/src"

BUILD_ID="`$NEW_ID" GIT_SHA="`$GIT_SHA" COMPOSE_PROJECT_NAME=src docker compose up -d --build bdo-app

# Keep the last 5 backups (best-effort; some old dirs may contain root-owned files).
PG_DATA_MOUNT="`$(docker inspect bdo-postgres --format '{{range .Mounts}}{{if eq .Destination "/var/lib/postgresql/data"}}{{.Source}}{{end}}{{end}}' 2>/dev/null || true)"
for d in `$(ls -1dt "`$BASE"/src_prev_* 2>/dev/null | tail -n +6); do
  if [ -n "`$PG_DATA_MOUNT" ] && [[ "`$PG_DATA_MOUNT" == "`$d"* ]]; then
    echo "[deploy] skip cleanup for active postgres mount: `$d"
    continue
  fi
  rm -rf "`$d" || true
done
"@
  Invoke-SshScript -ScriptText $remoteScript

  if ($E2EAdminEmail -and $E2EAdminPassword) {
    Write-Host "[deploy] ensure E2E admin exists"
    $bootstrap = @"
set -euo pipefail
cd "$DeployRemoteBase/src"
COMPOSE_PROJECT_NAME=src docker compose exec -T bdo-app env \
  ADMIN_EMAIL="$E2EAdminEmail" \
  ADMIN_PASSWORD="$E2EAdminPassword" \
  ADMIN_MUST_CHANGE_PASSWORD=false \
  npm run admin:bootstrap
"@
    try {
      Invoke-SshScript -ScriptText $bootstrap
    } catch {
      Write-Warning ("[deploy] admin bootstrap failed: " + $_.Exception.Message)
    }
  }

  if ($skipVerification) {
    Write-Host "[deploy] skip verification suite (DEPLOY_SKIP_VERIFICATION or -SkipVerification)"
    Write-Host "[deploy] ok"
  } else {
    Write-Host "[deploy] verification suite (Playwright)"
    New-Item -ItemType Directory -Force -Path $reportDir | Out-Null
    Push-Location $rootDir
    try {
      $env:E2E_BASE_URL = $E2EBaseUrl
      $env:E2E_OUTPUT_DIR = $reportDir
      if ($E2EAdminEmail) { $env:E2E_ADMIN_EMAIL = $E2EAdminEmail }
      if ($E2EAdminPassword) { $env:E2E_ADMIN_PASSWORD = $E2EAdminPassword }
      Invoke-LocalCommand -FilePath "npx" -Arguments @("playwright", "test", $E2ESpec)
    } finally {
      Pop-Location
    }

    Write-Host "[deploy] report"
    Push-Location $rootDir
    try {
      Invoke-LocalCommand -FilePath "npx" -Arguments @(
        "tsx",
        (Join-Path $rootDir "scripts\deploy-report.ts"),
        "--baseUrl",
        $E2EBaseUrl,
        "--resultsDir",
        $reportDir,
        "--out",
        $reportPath
      )
    } finally {
      Pop-Location
    }

    Write-Host "[deploy] ok - $reportPath"
  }
} catch {
  Invoke-Rollback
  throw
} finally {
  if (Test-Path $tarballPath) {
    try { Remove-Item -Force $tarballPath } catch {}
  }
}
