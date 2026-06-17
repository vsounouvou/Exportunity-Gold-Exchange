#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TENANT="${DEPLOY_TENANT_NAME:-boursedelor}"

args=("${TENANT}" "--build-artifact")

case "${DEPLOY_SKIP_VERIFICATION:-${SKIP_DEPLOY_E2E:-0}}" in
  1|true|TRUE|yes|YES|on|ON)
    args+=("--skip-verify")
    ;;
esac

exec "${ROOT_DIR}/scripts/ops/deploy-release.sh" "${args[@]}" "$@"
