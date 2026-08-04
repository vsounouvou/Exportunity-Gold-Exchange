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
ARCHIVED_RELEASES_DIR="${TARGET_DIR}/archived-releases"

path_is_within "$TARGET_DIR" "$LOCAL_BACKUP_ROOT_ABS" || fail "refusing to prune outside ${LOCAL_BACKUP_ROOT_ABS}"
if [[ -d "$ARCHIVED_RELEASES_DIR" ]]; then
  path_is_within "$(canonical_dir "$ARCHIVED_RELEASES_DIR")" "$TARGET_DIR" || fail "refusing to prune archived releases outside ${TARGET_DIR}"
fi

prune_backup_directory() {
  local directory="$1"
  local label="$2"
  local -a backups=()

  mapfile -t backups < <(find "$directory" -maxdepth 1 -type f \( -name '*.tar.gz' -o -name '*.tgz' -o -name '*.zip' -o -name '*.sql.gz' -o -name '*.dump' -o -name '*.bak' -o -name '*.backup' \) | sort -r)

  if (( ${#backups[@]} <= KEEP_COUNT )); then
    log "${label} for ${CANONICAL_TENANT}: nothing to prune"
    return
  fi

  for backup in "${backups[@]:KEEP_COUNT}"; do
    log "prune ${label%?} artifact ${backup}"
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
}

prune_backup_directory "$TARGET_DIR" "local backups"
if [[ -d "$ARCHIVED_RELEASES_DIR" ]]; then
  prune_backup_directory "$ARCHIVED_RELEASES_DIR" "archived releases"
fi
