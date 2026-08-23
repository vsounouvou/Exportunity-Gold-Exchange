#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib/common.sh"

TENANT=""
VERSION_LABEL=""
BUILD_DIST=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --version)
      VERSION_LABEL="${2:-}"
      shift 2
      ;;
    --build)
      BUILD_DIST=1
      shift
      ;;
    --help|-h)
      print_usage_header "scripts/ops/create-release-artifact.sh <tenant> [--version <label>] [--build]"
      exit 0
      ;;
    -*)
      fail "unknown argument: $1"
      ;;
    *)
      if [[ -z "$TENANT" ]]; then
        TENANT="$1"
      else
        fail "unexpected argument: $1"
      fi
      shift
      ;;
  esac
done

[[ -n "$TENANT" ]] || fail "tenant is required"

require_cmd git
require_cmd tar
require_cmd node

load_tenant_config "$TENANT"

LOCK_DIR="${LOCAL_TMP_ROOT_ABS}/create-release-artifact.lock"
TMP_DIR=""

if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  fail "release artifact lock already held: ${LOCK_DIR}"
fi

cleanup_artifact_work() {
  if [[ -n "${TMP_DIR:-}" ]]; then
    rm -rf "$TMP_DIR"
  fi
  rmdir "$LOCK_DIR" 2>/dev/null || true
}
trap cleanup_artifact_work EXIT

APP_NAME_VALUE="${APP_NAME_OVERRIDE:-$CANONICAL_TENANT}"
TENANT_DEFAULT_VALUE="${TENANT_DEFAULT_OVERRIDE:-$APP_NAME_VALUE}"
DEPLOY_TENANT_VALUE="${DEPLOY_TENANT_OVERRIDE:-$APP_NAME_VALUE}"
PUBLIC_BASE_URL_VALUE="${PUBLIC_BASE_URL_OVERRIDE:-$DOMAIN}"
APP_BASE_URL_VALUE="${APP_BASE_URL_OVERRIDE:-$PUBLIC_BASE_URL_VALUE}"
PASSWORD_SETUP_BASE_URL_VALUE="${PASSWORD_SETUP_BASE_URL_OVERRIDE:-$APP_BASE_URL_VALUE}"

assert_dist_matches_tenant() {
  local build_file="${ROOT_DIR}/dist/public/build.json"
  [[ -f "$build_file" ]] || fail "built dist metadata not found: ${build_file}"
  node -e '
    const fs = require("fs");
    const [file, expectedApp, tenant] = process.argv.slice(1);
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    const app = String(data.app || "").trim();
    const buildId = String(data.buildId || data.build || "").trim();
    const allowed = new Set([String(expectedApp || "").trim(), String(tenant || "").trim()].filter(Boolean));
    if (!allowed.has(app)) {
      console.error(`[ops][error] refusing to package dist for app "${app || "missing"}"; expected ${Array.from(allowed).join(" or ")}`);
      process.exit(1);
    }
    if (!buildId) {
      console.error(`[ops][error] refusing to package dist without buildId in ${file}`);
      process.exit(1);
    }
  ' "$build_file" "$APP_NAME_VALUE" "$CANONICAL_TENANT"
}

if (( BUILD_DIST == 1 )); then
  log "building production bundle before packaging"
  (
    cd "$ROOT_DIR"
    APP_NAME="$APP_NAME_VALUE" DEPLOY_TENANT="$DEPLOY_TENANT_VALUE" TENANT_DEFAULT="$TENANT_DEFAULT_VALUE" PUBLIC_BASE_URL="$PUBLIC_BASE_URL_VALUE" APP_BASE_URL="$APP_BASE_URL_VALUE" PASSWORD_SETUP_BASE_URL="$PASSWORD_SETUP_BASE_URL_VALUE" SKIP_PUBLIC_SURFACE_QUALITY_GATE=1 npm run build >&2
  )
fi

STAMP="$(timestamp_utc)"
ISO_STAMP="$(iso_utc)"
GIT_SHA="$(short_git_sha)"
GIT_DIRTY="$(git_dirty)"
SOURCE_VERSION="$(source_version)"
BRANCH="$(git_branch)"
BUILD_ID="$(node -e "const fs=require('fs'); const [distFile, metaFile, git, expectedApp, tenant]=process.argv.slice(1); for (const file of [distFile, metaFile]) { try { const data=JSON.parse(fs.readFileSync(file,'utf8')); const app=String(data.app||'').trim(); const buildId=String(data.buildId||data.build||'').trim(); const gitSha=String(data.gitSha||'').trim(); const appMatches=!app || app === expectedApp || app === tenant; if (buildId && appMatches && (!gitSha || gitSha === git)) { process.stdout.write(buildId); break; } } catch {} }" "${ROOT_DIR}/dist/public/build.json" "${ROOT_DIR}/.build-meta.json" "$GIT_SHA" "$APP_NAME_VALUE" "$CANONICAL_TENANT")"
BUILD_ID="${BUILD_ID:-$STAMP}"
ARTIFACT_BASE="${CANONICAL_TENANT}_release_${STAMP}_${SOURCE_VERSION}"
ARTIFACT_NAME="${ARTIFACT_BASE}.tar.gz"
ARTIFACT_PATH="${LOCAL_RELEASE_DIR_ABS}/${ARTIFACT_NAME}"
MANIFEST_PATH="${LOCAL_RELEASE_DIR_ABS}/${ARTIFACT_BASE}.json"
CHECKSUM_PATH="${LOCAL_RELEASE_DIR_ABS}/${ARTIFACT_BASE}.sha256"
RELEASE_ID="${STAMP}-${GIT_SHA}"
TMP_DIR="$(mktemp -d "${LOCAL_TMP_ROOT_ABS}/${CANONICAL_TENANT}.release.XXXXXX")"

INCLUDE_DIST=false
if [[ -d "${ROOT_DIR}/dist" ]]; then
  INCLUDE_DIST=true
  assert_dist_matches_tenant
fi

if [[ "$CANONICAL_TENANT" == "exportunity" ]]; then
  surface_args=()
  if [[ "$INCLUDE_DIST" == "true" ]]; then
    surface_args+=("--dist")
  fi
  (
    cd "$ROOT_DIR"
    node scripts/verify-exportunity-public-surface.mjs "${surface_args[@]}"
  )
fi

if [[ -n "$VERSION_LABEL" ]]; then
  VERSION_JSON="$(node -e "process.stdout.write(JSON.stringify(process.argv[1]))" "$VERSION_LABEL")"
else
  VERSION_JSON="null"
fi

MANIFEST_INSIDE="${TMP_DIR}/release-manifest.json"
cat > "$MANIFEST_INSIDE" <<EOF
{
  "tenant": "${CANONICAL_TENANT}",
  "versionLabel": ${VERSION_JSON},
  "timestamp": "${ISO_STAMP}",
  "stamp": "${STAMP}",
  "gitSha": "${GIT_SHA}",
  "gitDirty": ${GIT_DIRTY},
  "sourceVersion": "${SOURCE_VERSION}",
  "branch": "${BRANCH}",
  "buildId": "${BUILD_ID}",
  "releaseId": "${RELEASE_ID}",
  "artifact": "${ARTIFACT_NAME}",
  "includesBuiltDist": ${INCLUDE_DIST}
}
EOF

mapfile -t INCLUDE_PATHS < <(
  while IFS= read -r entry || [[ -n "$entry" ]]; do
    entry="${entry%%#*}"
    entry="$(printf '%s' "$entry" | sed 's/[[:space:]]*$//')"
    [[ -z "$entry" ]] && continue
    [[ -e "${ROOT_DIR}/${entry}" ]] && printf '%s\n' "$entry"
  done < "${ROOT_DIR}/ops/release.include"
)

if [[ "$INCLUDE_DIST" == "true" ]]; then
  INCLUDE_PATHS+=("dist")
fi

[[ ${#INCLUDE_PATHS[@]} -gt 0 ]] || fail "no paths selected for release artifact"

log "creating release artifact ${ARTIFACT_PATH}"
tar -czf "$ARTIFACT_PATH" \
  --exclude-from "${ROOT_DIR}/ops/release.exclude" \
  -C "$ROOT_DIR" "${INCLUDE_PATHS[@]}" \
  -C "$TMP_DIR" release-manifest.json

CHECKSUM="$(sha256_file "$ARTIFACT_PATH")"
printf '%s  %s\n' "$CHECKSUM" "$ARTIFACT_NAME" > "$CHECKSUM_PATH"

cat > "$MANIFEST_PATH" <<EOF
{
  "tenant": "${CANONICAL_TENANT}",
  "versionLabel": ${VERSION_JSON},
  "timestamp": "${ISO_STAMP}",
  "stamp": "${STAMP}",
  "gitSha": "${GIT_SHA}",
  "gitDirty": ${GIT_DIRTY},
  "sourceVersion": "${SOURCE_VERSION}",
  "branch": "${BRANCH}",
  "buildId": "${BUILD_ID}",
  "releaseId": "${RELEASE_ID}",
  "artifact": "${ARTIFACT_NAME}",
  "artifactPath": "${LOCAL_RELEASE_DIR}/${ARTIFACT_NAME}",
  "checksum": "sha256:${CHECKSUM}",
  "includeDist": ${INCLUDE_DIST},
  "deployMode": "${DEPLOY_MODE}",
  "healthCheckUrl": "${HEALTHCHECK_URL}",
  "remoteDeployRoot": "${REMOTE_DEPLOY_ROOT}"
}
EOF

log "release artifact created for ${CANONICAL_TENANT}"
"${SCRIPT_DIR}/prune-local-releases.sh" "$CANONICAL_TENANT"
printf '%s\n' "$ARTIFACT_PATH"
