#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib/common.sh"

DRY_RUN=0
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=1
fi

ROOT_REAL="$(canonical_dir "$ROOT_DIR")"
declare -a direct_targets=(
  "${ROOT_REAL}/.build-meta.json"
  "${ROOT_REAL}/reports"
  "${ROOT_REAL}/artifacts/smoke"
  "${ROOT_REAL}/test-results"
  "${ROOT_REAL}/tmp"
  "${ROOT_REAL}/temp"
  "${ROOT_REAL}/dist"
  "${ROOT_REAL}/build"
  "${ROOT_REAL}/coverage"
  "${ROOT_REAL}/.cache"
  "${ROOT_REAL}/.next"
  "${ROOT_REAL}/.tmp_uploads"
)

remove_target() {
  local target="$1"
  if [[ ! -e "$target" ]]; then
    return 0
  fi
  path_is_within "$target" "$ROOT_REAL" || fail "refusing to delete outside repo: $target"
  log "remove build artifact ${target}"
  if (( DRY_RUN == 0 )); then
    rm -rf "$target"
  fi
}

for target in "${direct_targets[@]}"; do
  remove_target "$target"
done

while IFS= read -r candidate; do
  remove_target "$candidate"
done < <(
  find "$ROOT_REAL" \
    \( -path "$ROOT_REAL/.git" -o -path "$ROOT_REAL/node_modules" -o -path "$ROOT_REAL/ops/local-releases" -o -path "$ROOT_REAL/ops/local-backups" \) -prune \
    -o \
    -type d \( -name '.next' -o -name 'dist' -o -name 'build' -o -name '.cache' -o -name 'coverage' \) -print
)

while IFS= read -r artifact; do
  remove_target "$artifact"
done < <(
  find "$ROOT_REAL" -maxdepth 1 -type f \
    \( -name 'deploy-src-*.tgz' -o -name 'deploy-src-full-*.tgz' -o -name 'deploy-dist-*.zip' -o -name 'deploy-report-*.md' -o -name 'dist-public-*.tgz' -o -name 'bdo-app-src*.tgz' -o -name '.tmp*' -o -name '*.tmp' \)
)
