#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib/common.sh"

RUN_DOCKER=0
WITH_VOLUMES=0
DRY_RUN=0
TENANTS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --docker)
      RUN_DOCKER=1
      shift
      ;;
    --with-volumes)
      WITH_VOLUMES=1
      shift
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --tenant)
      TENANTS+=("${2:-}")
      shift 2
      ;;
    --help|-h)
      print_usage_header "scripts/ops/run-local-cleanup.sh [--tenant <tenant>]... [--dry-run] [--docker] [--with-volumes]"
      exit 0
      ;;
    *)
      fail "unknown argument: $1"
      ;;
  esac
done

cleanup_args=()
[[ $DRY_RUN -eq 1 ]] && cleanup_args+=(--dry-run)
"${SCRIPT_DIR}/cleanup-build-artifacts.sh" "${cleanup_args[@]}"

if (( ${#TENANTS[@]} == 0 )); then
  mapfile -t TENANTS < <(list_canonical_tenants)
fi

for tenant in "${TENANTS[@]}"; do
  [[ -n "$tenant" ]] || continue
  "${SCRIPT_DIR}/prune-local-releases.sh" "$tenant" "${cleanup_args[@]}"
  "${SCRIPT_DIR}/prune-local-backups.sh" "$tenant" "${cleanup_args[@]}"
done

if (( RUN_DOCKER == 1 )); then
  docker_args=()
  [[ $WITH_VOLUMES -eq 1 ]] && docker_args+=(--with-volumes)
  [[ $DRY_RUN -eq 0 ]] && docker_args+=(--yes)
  "${SCRIPT_DIR}/prune-docker-local.sh" "${docker_args[@]}"
fi
