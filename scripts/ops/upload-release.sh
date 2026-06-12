#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib/common.sh"

TENANT=""
ARTIFACT_PATH=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --artifact)
      ARTIFACT_PATH="${2:-}"
      shift 2
      ;;
    --help|-h)
      print_usage_header "scripts/ops/upload-release.sh <tenant> [--artifact <path>]"
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

require_cmd ssh
require_cmd scp
require_cmd node

load_tenant_config "$TENANT"

if [[ -z "$ARTIFACT_PATH" ]]; then
  ARTIFACT_PATH="$(latest_release_artifact "$LOCAL_RELEASE_DIR_ABS")"
fi

[[ -n "${ARTIFACT_PATH:-}" ]] || fail "no local release artifact found for ${CANONICAL_TENANT}"
[[ -f "$ARTIFACT_PATH" ]] || fail "artifact not found: $ARTIFACT_PATH"

ARTIFACT_BASE="${ARTIFACT_PATH%.tar.gz}"
MANIFEST_PATH="${ARTIFACT_BASE}.json"
CHECKSUM_PATH="${ARTIFACT_BASE}.sha256"
[[ -f "$MANIFEST_PATH" ]] || fail "manifest not found: $MANIFEST_PATH"
[[ -f "$CHECKSUM_PATH" ]] || fail "checksum not found: $CHECKSUM_PATH"
assert_artifact_matches_tenant "$ARTIFACT_PATH" "$CANONICAL_TENANT"

run_ssh "mkdir -p '${REMOTE_RELEASE_ARCHIVE_DIR}' '${REMOTE_DB_BACKUP_DIR}' '${REMOTE_FILE_BACKUP_DIR}' '${REMOTE_DEPLOY_ROOT}/releases' '${REMOTE_DEPLOY_ROOT}/shared'"

log "uploading ${ARTIFACT_PATH} to ${REMOTE_SSH_TARGET}:${REMOTE_RELEASE_ARCHIVE_DIR}"
run_scp "$ARTIFACT_PATH" "${REMOTE_SSH_TARGET}:${REMOTE_RELEASE_ARCHIVE_DIR}/"
run_scp "$MANIFEST_PATH" "${REMOTE_SSH_TARGET}:${REMOTE_RELEASE_ARCHIVE_DIR}/"
run_scp "$CHECKSUM_PATH" "${REMOTE_SSH_TARGET}:${REMOTE_RELEASE_ARCHIVE_DIR}/"

"${SCRIPT_DIR}/prune-local-releases.sh" "$CANONICAL_TENANT"
"${SCRIPT_DIR}/prune-local-backups.sh" "$CANONICAL_TENANT"

printf '%s\n' "${REMOTE_RELEASE_ARCHIVE_DIR}/$(basename "$ARTIFACT_PATH")"
