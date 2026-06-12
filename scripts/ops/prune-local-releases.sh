#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib/common.sh"

DRY_RUN=0
TENANT="${1:-}"
KEEP_OVERRIDE="${2:-}"

if [[ "${TENANT:-}" == "" || "$TENANT" == "--help" || "$TENANT" == "-h" ]]; then
  print_usage_header "scripts/ops/prune-local-releases.sh <tenant> [keep-count] [--dry-run]"
  exit 1
fi

if [[ "${KEEP_OVERRIDE:-}" == "--dry-run" ]]; then
  DRY_RUN=1
  KEEP_OVERRIDE=""
fi

if [[ "${3:-}" == "--dry-run" ]]; then
  DRY_RUN=1
fi

load_tenant_config "$TENANT"
KEEP_COUNT="${KEEP_OVERRIDE:-$KEEP_LOCAL_RELEASES}"
TARGET_DIR="$(canonical_dir "$LOCAL_RELEASE_DIR_ABS")"
ARCHIVE_DIR="$(canonical_dir "${LOCAL_BACKUP_DIR_ABS}/archived-releases")"

path_is_within "$TARGET_DIR" "$LOCAL_RELEASE_ROOT_ABS" || fail "refusing to prune outside ${LOCAL_RELEASE_ROOT_ABS}"
path_is_within "$ARCHIVE_DIR" "$LOCAL_BACKUP_ROOT_ABS" || fail "refusing to archive outside ${LOCAL_BACKUP_ROOT_ABS}"

archive_release_file() {
  local source_path="$1"
  local destination_path="${ARCHIVE_DIR}/$(basename "$source_path")"

  path_is_within "$source_path" "$TARGET_DIR" || fail "refusing to archive outside ${TARGET_DIR}: ${source_path}"
  if [[ -e "$destination_path" ]]; then
    fail "archive destination already exists: ${destination_path}"
  fi
  mv "$source_path" "$destination_path"
}

mapfile -t artifacts < <(find "$TARGET_DIR" -maxdepth 1 -type f -name '*.tar.gz' | sort -r)

if (( ${#artifacts[@]} <= KEEP_COUNT )); then
  log "local releases for ${CANONICAL_TENANT}: nothing to prune"
  exit 0
fi

for artifact in "${artifacts[@]:KEEP_COUNT}"; do
  log "archive local release artifact ${artifact}"
  if (( DRY_RUN == 0 )); then
    archive_release_file "$artifact"
    while IFS= read -r sidecar; do
      if [[ -f "$sidecar" ]]; then
        archive_release_file "$sidecar"
      else
        warn "release sidecar missing while archiving: ${sidecar}"
      fi
    done < <(artifact_sidecars_for "$artifact")
  fi
done
