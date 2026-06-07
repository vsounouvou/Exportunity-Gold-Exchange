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

path_is_within "$TARGET_DIR" "$LOCAL_RELEASE_ROOT_ABS" || fail "refusing to prune outside ${LOCAL_RELEASE_ROOT_ABS}"

mapfile -t artifacts < <(find "$TARGET_DIR" -maxdepth 1 -type f -name '*.tar.gz' | sort -r)

if (( ${#artifacts[@]} <= KEEP_COUNT )); then
  log "local releases for ${CANONICAL_TENANT}: nothing to prune"
  exit 0
fi

for artifact in "${artifacts[@]:KEEP_COUNT}"; do
  log "prune local release artifact ${artifact}"
  if (( DRY_RUN == 0 )); then
    rm -f "$artifact"
    while IFS= read -r sidecar; do
      [[ -f "$sidecar" ]] && rm -f "$sidecar"
    done < <(artifact_sidecars_for "$artifact")
  fi
done
