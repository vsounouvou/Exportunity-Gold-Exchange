#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib/common.sh"

DRY_RUN=0
TENANT="${1:-}"
KEEP_OVERRIDE="${2:-}"

if [[ "${TENANT:-}" == "" || "$TENANT" == "--help" || "$TENANT" == "-h" ]]; then
  print_usage_header "scripts/ops/prune-local-backups.sh <tenant> [keep-count] [--dry-run]"
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
KEEP_COUNT="${KEEP_OVERRIDE:-$KEEP_LOCAL_BACKUPS}"
TARGET_DIR="$(canonical_dir "$LOCAL_BACKUP_DIR_ABS")"

path_is_within "$TARGET_DIR" "$LOCAL_BACKUP_ROOT_ABS" || fail "refusing to prune outside ${LOCAL_BACKUP_ROOT_ABS}"

mapfile -t backups < <(find "$TARGET_DIR" -maxdepth 1 -type f \( -name '*.tar.gz' -o -name '*.tgz' -o -name '*.zip' -o -name '*.sql.gz' -o -name '*.dump' -o -name '*.bak' -o -name '*.backup' \) | sort -r)

if (( ${#backups[@]} <= KEEP_COUNT )); then
  log "local backups for ${CANONICAL_TENANT}: nothing to prune"
  exit 0
fi

for backup in "${backups[@]:KEEP_COUNT}"; do
  log "prune local backup artifact ${backup}"
  if (( DRY_RUN == 0 )); then
    rm -f "$backup"
    case "$backup" in
      *.tar.gz) local_base="${backup%.tar.gz}" ;;
      *.sql.gz) local_base="${backup%.sql.gz}" ;;
      *) local_base="${backup%.*}" ;;
    esac
    [[ -f "${local_base}.json" ]] && rm -f "${local_base}.json"
    [[ -f "${local_base}.sha256" ]] && rm -f "${local_base}.sha256"
  fi
done
