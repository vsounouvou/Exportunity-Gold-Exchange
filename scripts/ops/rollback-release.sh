#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib/common.sh"

TENANT=""
TARGET_RELEASE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --release-id)
      TARGET_RELEASE="${2:-}"
      shift 2
      ;;
    --help|-h)
      print_usage_header "scripts/ops/rollback-release.sh <tenant> [--release-id <release-id>]"
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
require_cmd curl

load_tenant_config "$TENANT"

SERVICE_STRING=""
for service_name in "${SERVICE_NAMES[@]}"; do
  SERVICE_STRING+=" '${service_name}'"
done

REMOTE_SCRIPT="$(cat <<EOF
set -euo pipefail

REMOTE_DEPLOY_ROOT='${REMOTE_DEPLOY_ROOT}'
TARGET_RELEASE='${TARGET_RELEASE}'
COMPOSE_PROJECT='${COMPOSE_PROJECT}'
HEALTHCHECK_URL='${HEALTHCHECK_URL}'
DEPLOY_MODE='${DEPLOY_MODE}'

current_link="\${REMOTE_DEPLOY_ROOT}/current"
previous_link="\${REMOTE_DEPLOY_ROOT}/previous"

if [ -z "\${TARGET_RELEASE}" ]; then
  if [ -L "\${previous_link}" ]; then
    target_dir="\$(readlink -f "\${previous_link}")"
  else
    target_dir="\$(find "\${REMOTE_DEPLOY_ROOT}/releases" -mindepth 1 -maxdepth 1 -type d | sort | tail -n 2 | head -n 1)"
  fi
else
  target_dir="\${REMOTE_DEPLOY_ROOT}/releases/\${TARGET_RELEASE}"
fi

[ -n "\${target_dir}" ] || { echo "no rollback target found" >&2; exit 1; }
[ -d "\${target_dir}" ] || { echo "rollback target missing: \${target_dir}" >&2; exit 1; }

old_current=""
if [ -L "\${current_link}" ] || [ -d "\${current_link}" ]; then
  old_current="\$(readlink -f "\${current_link}" || true)"
fi

if [ -n "\${old_current}" ]; then
  ln -sfn "\${old_current}" "\${previous_link}"
fi
ln -sfn "\${target_dir}" "\${current_link}"
cd "\${current_link}"

if [ "\${DEPLOY_MODE}" = "docker-compose" ]; then
  COMPOSE_PROJECT_NAME="\${COMPOSE_PROJECT}" docker compose up -d --build${SERVICE_STRING}
fi

if [ -n "\${HEALTHCHECK_URL}" ]; then
  curl --fail --silent --show-error --location --max-time 20 "\${HEALTHCHECK_URL}" >/dev/null
fi
EOF
)"

run_ssh_script "$REMOTE_SCRIPT"
log "rollback complete for ${CANONICAL_TENANT}"
