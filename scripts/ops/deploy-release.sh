#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib/common.sh"

TENANT=""
ARTIFACT_PATH=""
SKIP_CREATE=0
SKIP_UPLOAD=0
SKIP_VERIFY=0
BUILD_ARTIFACT=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --artifact)
      ARTIFACT_PATH="${2:-}"
      shift 2
      ;;
    --skip-create)
      SKIP_CREATE=1
      shift
      ;;
    --skip-upload)
      SKIP_UPLOAD=1
      shift
      ;;
    --skip-verify)
      SKIP_VERIFY=1
      shift
      ;;
    --build-artifact)
      BUILD_ARTIFACT=1
      shift
      ;;
    --help|-h)
      print_usage_header "scripts/ops/deploy-release.sh <tenant> [--artifact <path>] [--build-artifact] [--skip-create] [--skip-upload] [--skip-verify]"
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
require_cmd curl

load_tenant_config "$TENANT"

if [[ "${DEPLOY_MODE}" == "docker-compose" && "${COMPOSE_PROJECT}" == "src" ]]; then
  fail "compose project 'src' is not allowed for tenant deployments; set a unique composeProject for ${CANONICAL_TENANT}"
fi

APP_NAME_VALUE="${APP_NAME_OVERRIDE:-$CANONICAL_TENANT}"
TENANT_DEFAULT_VALUE="${TENANT_DEFAULT_OVERRIDE:-$APP_NAME_VALUE}"
DEPLOY_TENANT_VALUE="${DEPLOY_TENANT_OVERRIDE:-$APP_NAME_VALUE}"
PUBLIC_BASE_URL_VALUE="${PUBLIC_BASE_URL_OVERRIDE:-$DOMAIN}"
APP_BASE_URL_VALUE="${APP_BASE_URL_OVERRIDE:-$PUBLIC_BASE_URL_VALUE}"
PASSWORD_SETUP_BASE_URL_VALUE="${PASSWORD_SETUP_BASE_URL_OVERRIDE:-$APP_BASE_URL_VALUE}"

if [[ -z "$ARTIFACT_PATH" ]] && (( SKIP_CREATE == 0 )); then
  create_args=("$CANONICAL_TENANT")
  if (( BUILD_ARTIFACT == 1 )); then
    create_args+=("--build")
  fi
  create_output="$("${SCRIPT_DIR}/create-release-artifact.sh" "${create_args[@]}")"
  ARTIFACT_PATH="$(printf '%s\n' "$create_output" | tail -n 1)"
fi

if [[ -z "$ARTIFACT_PATH" ]]; then
  ARTIFACT_PATH="$(latest_release_artifact "$LOCAL_RELEASE_DIR_ABS")"
fi

[[ -n "${ARTIFACT_PATH:-}" ]] || fail "no artifact available for deploy"
[[ -f "$ARTIFACT_PATH" ]] || fail "artifact not found: $ARTIFACT_PATH"

ARTIFACT_BASE="${ARTIFACT_PATH%.tar.gz}"
MANIFEST_PATH="${ARTIFACT_BASE}.json"
[[ -f "$MANIFEST_PATH" ]] || fail "manifest not found: $MANIFEST_PATH"
assert_artifact_matches_tenant "$ARTIFACT_PATH" "$CANONICAL_TENANT"

RELEASE_ID="$(node -e "const fs=require('fs'); const data=JSON.parse(fs.readFileSync(process.argv[1],'utf8')); process.stdout.write(data.releaseId);" "$MANIFEST_PATH")"
GIT_SHA="$(node -e "const fs=require('fs'); const data=JSON.parse(fs.readFileSync(process.argv[1],'utf8')); process.stdout.write(data.gitSha);" "$MANIFEST_PATH")"
GIT_DIRTY="$(node -e "const fs=require('fs'); const data=JSON.parse(fs.readFileSync(process.argv[1],'utf8')); process.stdout.write(String(data.gitDirty === true));" "$MANIFEST_PATH")"
SOURCE_VERSION="$(node -e "const fs=require('fs'); const data=JSON.parse(fs.readFileSync(process.argv[1],'utf8')); process.stdout.write(String(data.sourceVersion || data.gitSha || data.releaseId || ''));" "$MANIFEST_PATH")"
BUILD_ID="$(node -e "const fs=require('fs'); const data=JSON.parse(fs.readFileSync(process.argv[1],'utf8')); process.stdout.write(String(data.buildId || data.releaseId || ''));" "$MANIFEST_PATH")"
ARTIFACT_NAME="$(basename "$ARTIFACT_PATH")"

if (( SKIP_UPLOAD == 0 )); then
  "${SCRIPT_DIR}/upload-release.sh" "$CANONICAL_TENANT" --artifact "$ARTIFACT_PATH" >/dev/null
fi

REMOTE_ARTIFACT_PATH="${REMOTE_RELEASE_ARCHIVE_DIR}/${ARTIFACT_NAME}"

SERVICE_STRING=""
for service_name in "${SERVICE_NAMES[@]}"; do
  SERVICE_STRING+=" '${service_name}'"
done

REMOTE_SCRIPT="$(cat <<EOF
set -euo pipefail

REMOTE_DEPLOY_ROOT='${REMOTE_DEPLOY_ROOT}'
REMOTE_ARTIFACT_PATH='${REMOTE_ARTIFACT_PATH}'
RELEASE_ID='${RELEASE_ID}'
GIT_SHA='${GIT_SHA}'
GIT_DIRTY='${GIT_DIRTY}'
SOURCE_VERSION='${SOURCE_VERSION}'
BUILD_ID='${BUILD_ID}'
COMPOSE_PROJECT='${COMPOSE_PROJECT}'
HEALTHCHECK_URL='${HEALTHCHECK_URL}'
DEPLOY_MODE='${DEPLOY_MODE}'
DEPLOYMENT_STRATEGY='${DEPLOYMENT_STRATEGY}'
KEEP_REMOTE_RELEASES='${KEEP_REMOTE_RELEASES}'
HOST_BIND='${HOST_BIND}'
HOST_PORT='${HOST_PORT}'
BLUE_GREEN_ALTERNATE_PORT='${BLUE_GREEN_ALTERNATE_PORT}'
PROXY_ALIAS='${PROXY_ALIAS}'
BLUE_GREEN_PROXY_CONTAINER='${BLUE_GREEN_PROXY_CONTAINER}'
BLUE_GREEN_PROXY_CONFIG_PATH='${BLUE_GREEN_PROXY_CONFIG_PATH}'
BLUE_GREEN_HOST_PATTERN='${BLUE_GREEN_HOST_PATTERN}'
PUBLIC_HEALTHCHECK_URL='${PUBLIC_HEALTHCHECK_URL}'
APP_NAME_VALUE='${APP_NAME_VALUE}'
TENANT_DEFAULT_VALUE='${TENANT_DEFAULT_VALUE}'
DEPLOY_TENANT_VALUE='${DEPLOY_TENANT_VALUE}'
PUBLIC_BASE_URL_VALUE='${PUBLIC_BASE_URL_VALUE}'
APP_BASE_URL_VALUE='${APP_BASE_URL_VALUE}'
PASSWORD_SETUP_BASE_URL_VALUE='${PASSWORD_SETUP_BASE_URL_VALUE}'

mkdir -p "\${REMOTE_DEPLOY_ROOT}/releases" "\${REMOTE_DEPLOY_ROOT}/shared"
lock_dir="\${REMOTE_DEPLOY_ROOT}/.deploy.lock"
if ! mkdir "\${lock_dir}" 2>/dev/null; then
  echo "another deploy is already running for \${REMOTE_DEPLOY_ROOT}" >&2
  exit 75
fi
trap 'rmdir "\${lock_dir}" 2>/dev/null || true' EXIT
EOF
)"

for path_item in "${PERSISTENT_PATHS[@]}"; do
  REMOTE_SCRIPT+=$'\n'"mkdir -p '${REMOTE_DEPLOY_ROOT}/${path_item}'"
done

REMOTE_SCRIPT+=$'\n'"release_dir=\"\${REMOTE_DEPLOY_ROOT}/releases/\${RELEASE_ID}\""
REMOTE_SCRIPT+=$'\n'"current_link=\"\${REMOTE_DEPLOY_ROOT}/current\""
REMOTE_SCRIPT+=$'\n'"previous_link=\"\${REMOTE_DEPLOY_ROOT}/previous\""
REMOTE_SCRIPT+=$'\n'"current_target=\"\""
REMOTE_SCRIPT+=$'\n'"if [ -L \"\${current_link}\" ] || [ -d \"\${current_link}\" ]; then current_target=\"\$(readlink -f \"\${current_link}\" || true)\"; fi"
REMOTE_SCRIPT+=$'\n'"rm -rf \"\${release_dir}\""
REMOTE_SCRIPT+=$'\n'"mkdir -p \"\${release_dir}\""
REMOTE_SCRIPT+=$'\n'"tar -xzf \"\${REMOTE_ARTIFACT_PATH}\" -C \"\${release_dir}\""

for shared_path in "${LINKED_SHARED_PATHS[@]}"; do
  REMOTE_SCRIPT+=$'\n'"mkdir -p \"\$(dirname \"\${REMOTE_DEPLOY_ROOT}/shared/${shared_path}\")\""
  REMOTE_SCRIPT+=$'\n'"mkdir -p \"\$(dirname \"\${release_dir}/${shared_path}\")\""
  if [[ "$shared_path" == ".env" ]]; then
    REMOTE_SCRIPT+=$'\n'"if [ ! -s \"\${REMOTE_DEPLOY_ROOT}/shared/${shared_path}\" ]; then echo \"missing required shared ${shared_path} at \${REMOTE_DEPLOY_ROOT}/shared/${shared_path}\" >&2; exit 78; fi"
  else
    REMOTE_SCRIPT+=$'\n'"if [ ! -e \"\${REMOTE_DEPLOY_ROOT}/shared/${shared_path}\" ]; then touch \"\${REMOTE_DEPLOY_ROOT}/shared/${shared_path}\"; fi"
  fi
  REMOTE_SCRIPT+=$'\n'"rm -rf \"\${release_dir}/${shared_path}\""
  REMOTE_SCRIPT+=$'\n'"ln -sfn \"\${REMOTE_DEPLOY_ROOT}/shared/${shared_path}\" \"\${release_dir}/${shared_path}\""
done

REMOTE_SCRIPT+=$'\n'"cd \"\${release_dir}\""
REMOTE_SCRIPT+=$'\n'"if [ \"\${DEPLOY_MODE}\" = \"docker-compose\" ]; then"
REMOTE_SCRIPT+=$'\n'"  if [ \"\${DEPLOYMENT_STRATEGY}\" = \"blue-green\" ]; then"
REMOTE_SCRIPT+=$'\n'"    REMOTE_DEPLOY_ROOT=\"\${REMOTE_DEPLOY_ROOT}\" RELEASE_DIR=\"\${release_dir}\" COMPOSE_PROJECT=\"\${COMPOSE_PROJECT}\" HOST_BIND=\"\${HOST_BIND}\" HOST_PORT=\"\${HOST_PORT}\" BLUE_GREEN_ALTERNATE_PORT=\"\${BLUE_GREEN_ALTERNATE_PORT}\" PROXY_ALIAS=\"\${PROXY_ALIAS}\" BLUE_GREEN_PROXY_CONTAINER=\"\${BLUE_GREEN_PROXY_CONTAINER}\" BLUE_GREEN_PROXY_CONFIG_PATH=\"\${BLUE_GREEN_PROXY_CONFIG_PATH}\" BLUE_GREEN_HOST_PATTERN=\"\${BLUE_GREEN_HOST_PATTERN}\" PUBLIC_HEALTHCHECK_URL=\"\${PUBLIC_HEALTHCHECK_URL}\" APP_NAME_VALUE=\"\${APP_NAME_VALUE}\" TENANT_DEFAULT_VALUE=\"\${TENANT_DEFAULT_VALUE}\" DEPLOY_TENANT_VALUE=\"\${DEPLOY_TENANT_VALUE}\" PUBLIC_BASE_URL_VALUE=\"\${PUBLIC_BASE_URL_VALUE}\" APP_BASE_URL_VALUE=\"\${APP_BASE_URL_VALUE}\" PASSWORD_SETUP_BASE_URL_VALUE=\"\${PASSWORD_SETUP_BASE_URL_VALUE}\" BUILD_ID=\"\${BUILD_ID}\" GIT_SHA=\"\${GIT_SHA}\" GIT_DIRTY=\"\${GIT_DIRTY}\" SOURCE_VERSION=\"\${SOURCE_VERSION}\" RELEASE_ID=\"\${RELEASE_ID}\" bash scripts/ops/blue-green-remote.sh"
REMOTE_SCRIPT+=$'\n'"  else"
REMOTE_SCRIPT+=$'\n'"    APP_NAME='${APP_NAME_VALUE}' TENANT_DEFAULT='${TENANT_DEFAULT_VALUE}' DEPLOY_TENANT='${DEPLOY_TENANT_VALUE}' PUBLIC_BASE_URL='${PUBLIC_BASE_URL_VALUE}' APP_BASE_URL='${APP_BASE_URL_VALUE}' PASSWORD_SETUP_BASE_URL='${PASSWORD_SETUP_BASE_URL_VALUE}' HOST_BIND='${HOST_BIND}' HOST_PORT='${HOST_PORT}' PROXY_ALIAS='${PROXY_ALIAS}' BUILD_ID=\"\${BUILD_ID}\" GIT_SHA=\"\${GIT_SHA}\" GIT_DIRTY=\"\${GIT_DIRTY}\" SOURCE_VERSION=\"\${SOURCE_VERSION}\" COMPOSE_PROJECT_NAME=\"\${COMPOSE_PROJECT}\" docker compose up -d --build${SERVICE_STRING}"
REMOTE_SCRIPT+=$'\n'"  fi"
REMOTE_SCRIPT+=$'\n'"fi"
REMOTE_SCRIPT+=$'\n'"if [ \"\${DEPLOYMENT_STRATEGY}\" != \"blue-green\" ] && [ -n \"\${HEALTHCHECK_URL}\" ]; then"
REMOTE_SCRIPT+=$'\n'"  healthcheck_attempt=1"
REMOTE_SCRIPT+=$'\n'"  until curl --fail --silent --show-error --location --max-time 20 \"\${HEALTHCHECK_URL}\" >/dev/null; do"
REMOTE_SCRIPT+=$'\n'"    if [ \"\${healthcheck_attempt}\" -ge 24 ]; then"
REMOTE_SCRIPT+=$'\n'"      echo \"healthcheck failed for \${HEALTHCHECK_URL} after \${healthcheck_attempt} attempts\" >&2"
REMOTE_SCRIPT+=$'\n'"      exit 22"
REMOTE_SCRIPT+=$'\n'"    fi"
REMOTE_SCRIPT+=$'\n'"    healthcheck_attempt=\$((healthcheck_attempt + 1))"
REMOTE_SCRIPT+=$'\n'"    sleep 5"
REMOTE_SCRIPT+=$'\n'"  done"
REMOTE_SCRIPT+=$'\n'"fi"
REMOTE_SCRIPT+=$'\n'"if [ -n \"\${current_target}\" ]; then ln -sfn \"\${current_target}\" \"\${previous_link}\"; fi"
REMOTE_SCRIPT+=$'\n'"ln -sfn \"\${release_dir}\" \"\${current_link}\""
REMOTE_SCRIPT+=$'\n'"cat > \"\${release_dir}/release-status.json\" <<STATUS"
REMOTE_SCRIPT+=$'\n'"{"
REMOTE_SCRIPT+=$'\n'"  \"releaseId\": \"\${RELEASE_ID}\","
REMOTE_SCRIPT+=$'\n'"  \"buildId\": \"\${BUILD_ID}\","
REMOTE_SCRIPT+=$'\n'"  \"gitSha\": \"\${GIT_SHA}\","
REMOTE_SCRIPT+=$'\n'"  \"gitDirty\": \${GIT_DIRTY},"
REMOTE_SCRIPT+=$'\n'"  \"sourceVersion\": \"\${SOURCE_VERSION}\","
REMOTE_SCRIPT+=$'\n'"  \"deployedAt\": \"\$(date -u +%Y-%m-%dT%H:%M:%SZ)\","
REMOTE_SCRIPT+=$'\n'"  \"healthcheckUrl\": \"\${HEALTHCHECK_URL}\","
REMOTE_SCRIPT+=$'\n'"  \"status\": \"successful\""
REMOTE_SCRIPT+=$'\n'"}"
REMOTE_SCRIPT+=$'\n'"STATUS"
REMOTE_SCRIPT+=$'\n'"if [ \"\${KEEP_REMOTE_RELEASES:-0}\" -gt 0 ] 2>/dev/null; then"
REMOTE_SCRIPT+=$'\n'"  keep_file=\"\$(mktemp)\""
REMOTE_SCRIPT+=$'\n'"  trap 'rm -f \"\${keep_file}\"; rmdir \"\${lock_dir}\" 2>/dev/null || true' EXIT"
REMOTE_SCRIPT+=$'\n'"  [ -L \"\${current_link}\" ] && readlink -f \"\${current_link}\" >> \"\${keep_file}\" || true"
REMOTE_SCRIPT+=$'\n'"  [ -L \"\${previous_link}\" ] && readlink -f \"\${previous_link}\" >> \"\${keep_file}\" || true"
REMOTE_SCRIPT+=$'\n'"  find \"\${REMOTE_DEPLOY_ROOT}/releases\" -mindepth 1 -maxdepth 1 -type d | sort -r | head -n \"\${KEEP_REMOTE_RELEASES}\" >> \"\${keep_file}\""
REMOTE_SCRIPT+=$'\n'"  find \"\${REMOTE_DEPLOY_ROOT}/releases\" -mindepth 1 -maxdepth 1 -type d | while IFS= read -r old_release; do"
REMOTE_SCRIPT+=$'\n'"    old_real=\"\$(readlink -f \"\${old_release}\" || true)\""
REMOTE_SCRIPT+=$'\n'"    if [ -n \"\${old_real}\" ] && grep -Fxq \"\${old_real}\" \"\${keep_file}\"; then continue; fi"
REMOTE_SCRIPT+=$'\n'"    rm -rf \"\${old_release}\""
REMOTE_SCRIPT+=$'\n'"  done"
REMOTE_SCRIPT+=$'\n'"fi"

log "deploying ${CANONICAL_TENANT} release ${RELEASE_ID}"
run_ssh_script "$REMOTE_SCRIPT"

if (( SKIP_VERIFY == 0 )) && [[ -n "${DOMAIN:-}" ]] && [[ -f "${ROOT_DIR}/verify-deploy.mjs" ]]; then
  log "running deploy verification against ${DOMAIN}"
  (
    cd "$ROOT_DIR"
    BASE_URL="$DOMAIN" EXPECTED_APP="$APP_NAME_VALUE" node verify-deploy.mjs
  )
fi

log "deploy complete for ${CANONICAL_TENANT} (${RELEASE_ID})"
