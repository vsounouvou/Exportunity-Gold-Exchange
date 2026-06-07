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

APP_NAME_VALUE="${APP_NAME_OVERRIDE:-$CANONICAL_TENANT}"
TENANT_DEFAULT_VALUE="${TENANT_DEFAULT_OVERRIDE:-$APP_NAME_VALUE}"
DEPLOY_TENANT_VALUE="${DEPLOY_TENANT_OVERRIDE:-$APP_NAME_VALUE}"

if (( BUILD_DIST == 1 )); then
  log "building production bundle before packaging"
  (
    cd "$ROOT_DIR"
    APP_NAME="$APP_NAME_VALUE" DEPLOY_TENANT="$DEPLOY_TENANT_VALUE" TENANT_DEFAULT="$TENANT_DEFAULT_VALUE" SKIP_MARKETING_QUALITY_GATE=1 npm run build >&2
  )
fi

STAMP="$(timestamp_utc)"
ISO_STAMP="$(iso_utc)"
GIT_SHA="$(short_git_sha)"
BRANCH="$(git_branch)"
BUILD_ID="${STAMP}"
ARTIFACT_BASE="${CANONICAL_TENANT}_release_${STAMP}_${GIT_SHA}"
ARTIFACT_NAME="${ARTIFACT_BASE}.tar.gz"
ARTIFACT_PATH="${LOCAL_RELEASE_DIR_ABS}/${ARTIFACT_NAME}"
MANIFEST_PATH="${LOCAL_RELEASE_DIR_ABS}/${ARTIFACT_BASE}.json"
CHECKSUM_PATH="${LOCAL_RELEASE_DIR_ABS}/${ARTIFACT_BASE}.sha256"
RELEASE_ID="${STAMP}-${GIT_SHA}"
TMP_DIR="$(mktemp -d "${LOCAL_TMP_ROOT_ABS}/${CANONICAL_TENANT}.release.XXXXXX")"

cleanup_tmp() {
  rm -rf "$TMP_DIR"
}
trap cleanup_tmp EXIT

INCLUDE_DIST=false
if [[ -d "${ROOT_DIR}/dist" ]]; then
  INCLUDE_DIST=true
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
printf '%s\n' "$ARTIFACT_PATH"
