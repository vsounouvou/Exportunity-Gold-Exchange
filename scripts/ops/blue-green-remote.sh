#!/usr/bin/env bash
set -euo pipefail

required_vars=(
  REMOTE_DEPLOY_ROOT
  RELEASE_DIR
  COMPOSE_PROJECT
  HOST_BIND
  HOST_PORT
  BLUE_GREEN_ALTERNATE_PORT
  PROXY_ALIAS
  BLUE_GREEN_PROXY_CONTAINER
  BLUE_GREEN_PROXY_CONFIG_PATH
  BLUE_GREEN_HOST_PATTERN
  BUILD_ID
  GIT_SHA
  PUBLIC_HEALTHCHECK_URL
)

for required_var in "${required_vars[@]}"; do
  if [[ -z "${!required_var:-}" ]]; then
    echo "[blue-green] missing required variable: ${required_var}" >&2
    exit 78
  fi
done

command -v curl >/dev/null 2>&1 || {
  echo "[blue-green] curl is required" >&2
  exit 78
}
command -v docker >/dev/null 2>&1 || {
  echo "[blue-green] docker is required" >&2
  exit 78
}

compose_files=(
  -f "${RELEASE_DIR}/docker-compose.yml"
  -f "${RELEASE_DIR}/docker-compose.blue-green.yml"
)
active_slot_path="${REMOTE_DEPLOY_ROOT}/shared/blue-green-active-slot"
state_path="${REMOTE_DEPLOY_ROOT}/shared/blue-green-state.json"
active_slot=""

if [[ -s "${active_slot_path}" ]]; then
  active_slot="$(tr -d '\r\n[:space:]' < "${active_slot_path}")"
fi

if [[ "${active_slot}" != "blue" && "${active_slot}" != "green" ]]; then
  proxy_config="$(
    docker exec "${BLUE_GREEN_PROXY_CONTAINER}" \
      sh -c "cat '${BLUE_GREEN_PROXY_CONFIG_PATH}' 2>/dev/null || true"
  )"
  if grep -Fq "set \$server ${PROXY_ALIAS}-blue;" <<<"${proxy_config}"; then
    active_slot="blue"
  elif grep -Fq "set \$server ${PROXY_ALIAS}-green;" <<<"${proxy_config}"; then
    active_slot="green"
  else
    active_slot="legacy"
  fi
fi

case "${active_slot}" in
  blue)
    candidate_slot="green"
    candidate_port="${BLUE_GREEN_ALTERNATE_PORT}"
    ;;
  green)
    candidate_slot="blue"
    candidate_port="${HOST_PORT}"
    ;;
  *)
    candidate_slot="green"
    candidate_port="${BLUE_GREEN_ALTERNATE_PORT}"
    ;;
esac

candidate_project="${COMPOSE_PROJECT}-${candidate_slot}"
candidate_alias="${PROXY_ALIAS}-${candidate_slot}"
candidate_health_url="http://${HOST_BIND}:${candidate_port}/api/health/ready"
shared_asset_volume="${COMPOSE_PROJECT}_bdo_assets"
shared_upload_volume="${COMPOSE_PROJECT}_bdo_uploads"

echo "[blue-green] active=${active_slot} candidate=${candidate_slot} project=${candidate_project}"

docker volume inspect "${shared_asset_volume}" >/dev/null
docker volume inspect "${shared_upload_volume}" >/dev/null

# Only an inactive slot is removed. The active application remains online.
COMPOSE_PROJECT_NAME="${candidate_project}" \
  SHARED_ASSET_VOLUME="${shared_asset_volume}" \
  SHARED_UPLOAD_VOLUME="${shared_upload_volume}" \
  docker compose -p "${candidate_project}" "${compose_files[@]}" down --remove-orphans >/dev/null 2>&1 || true

# The first migration from the legacy project leaves port 5005 occupied.
# It is safe to stop legacy only after green has become the recorded active slot.
if [[ "${candidate_slot}" == "blue" && "${active_slot}" == "green" ]]; then
  legacy_ids="$(
    docker ps -aq --filter "label=com.docker.compose.project=${COMPOSE_PROJECT}"
  )"
  if [[ -n "${legacy_ids}" ]]; then
    docker stop ${legacy_ids} >/dev/null
  fi
fi

APP_NAME="${APP_NAME_VALUE}" \
TENANT_DEFAULT="${TENANT_DEFAULT_VALUE}" \
DEPLOY_TENANT="${DEPLOY_TENANT_VALUE}" \
PUBLIC_BASE_URL="${PUBLIC_BASE_URL_VALUE}" \
APP_BASE_URL="${APP_BASE_URL_VALUE}" \
PASSWORD_SETUP_BASE_URL="${PASSWORD_SETUP_BASE_URL_VALUE}" \
HOST_BIND="${HOST_BIND}" \
HOST_PORT="${candidate_port}" \
PROXY_ALIAS="${candidate_alias}" \
BUILD_ID="${BUILD_ID}" \
GIT_SHA="${GIT_SHA}" \
GIT_DIRTY="${GIT_DIRTY}" \
SOURCE_VERSION="${SOURCE_VERSION}" \
ATTACHED_ASSETS_PATH="${REMOTE_DEPLOY_ROOT}/data/attached_assets" \
SHARED_ASSET_VOLUME="${shared_asset_volume}" \
SHARED_UPLOAD_VOLUME="${shared_upload_volume}" \
COMPOSE_PROJECT_NAME="${candidate_project}" \
  docker compose -p "${candidate_project}" "${compose_files[@]}" up -d --build bdo-app

candidate_ready=0
for attempt in $(seq 1 48); do
  payload="$(curl --silent --show-error --max-time 10 "${candidate_health_url}" 2>/dev/null || true)"
  if grep -Fq "\"gitSha\":\"${GIT_SHA}\"" <<<"${payload}" &&
    grep -Fq "\"buildId\":\"${BUILD_ID}\"" <<<"${payload}"; then
    candidate_ready=1
    break
  fi
  sleep 5
done

if [[ "${candidate_ready}" != "1" ]]; then
  echo "[blue-green] candidate did not become healthy: ${candidate_health_url}" >&2
  docker compose -p "${candidate_project}" "${compose_files[@]}" ps >&2 || true
  docker compose -p "${candidate_project}" "${compose_files[@]}" logs --tail=80 bdo-app >&2 || true
  exit 22
fi

candidate_container="$(
  docker compose -p "${candidate_project}" "${compose_files[@]}" ps -q bdo-app
)"
candidate_health="$(
  docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}missing{{end}}' \
    "${candidate_container}"
)"
if [[ "${candidate_health}" != "healthy" ]]; then
  echo "[blue-green] candidate Docker health is ${candidate_health}" >&2
  exit 22
fi

proxy_dir="$(dirname "${BLUE_GREEN_PROXY_CONFIG_PATH}")"
proxy_backup="${BLUE_GREEN_PROXY_CONFIG_PATH}.rollback"
docker exec "${BLUE_GREEN_PROXY_CONTAINER}" mkdir -p "${proxy_dir}"
docker exec "${BLUE_GREEN_PROXY_CONTAINER}" rm -f "${proxy_backup}"
if docker exec "${BLUE_GREEN_PROXY_CONTAINER}" test -f "${BLUE_GREEN_PROXY_CONFIG_PATH}"; then
  docker exec "${BLUE_GREEN_PROXY_CONTAINER}" \
    cp "${BLUE_GREEN_PROXY_CONFIG_PATH}" "${proxy_backup}"
  existing_proxy_config="$(
    docker exec "${BLUE_GREEN_PROXY_CONTAINER}" cat "${BLUE_GREEN_PROXY_CONFIG_PATH}"
  )"
else
  existing_proxy_config=""
fi

base_proxy_config="$(
  awk '
    /^# BEGIN AGOOJIYE BLUE-GREEN ROUTE$/ { managed = 1; next }
    /^# END AGOOJIYE BLUE-GREEN ROUTE$/ { managed = 0; next }
    managed != 1 { print }
  ' <<<"${existing_proxy_config}"
)"

{
  if [[ -n "${base_proxy_config//[[:space:]]/}" ]]; then
    printf '%s\n' "${base_proxy_config}"
  fi
  printf '%s\n' "# BEGIN AGOOJIYE BLUE-GREEN ROUTE"
  printf 'if ($host ~* %s) {\n' "${BLUE_GREEN_HOST_PATTERN}"
  printf '  set $server %s;\n' "${candidate_alias}"
  printf '%s\n' "}"
  printf '%s\n' "# END AGOOJIYE BLUE-GREEN ROUTE"
} | docker exec -i "${BLUE_GREEN_PROXY_CONTAINER}" \
  sh -c "cat > '${BLUE_GREEN_PROXY_CONFIG_PATH}.next'"

docker exec "${BLUE_GREEN_PROXY_CONTAINER}" \
  mv "${BLUE_GREEN_PROXY_CONFIG_PATH}.next" "${BLUE_GREEN_PROXY_CONFIG_PATH}"

restore_proxy() {
  if docker exec "${BLUE_GREEN_PROXY_CONTAINER}" test -f "${proxy_backup}"; then
    docker exec "${BLUE_GREEN_PROXY_CONTAINER}" \
      cp "${proxy_backup}" "${BLUE_GREEN_PROXY_CONFIG_PATH}"
  else
    docker exec "${BLUE_GREEN_PROXY_CONTAINER}" rm -f "${BLUE_GREEN_PROXY_CONFIG_PATH}"
  fi
  docker exec "${BLUE_GREEN_PROXY_CONTAINER}" nginx -t >/dev/null
  docker exec "${BLUE_GREEN_PROXY_CONTAINER}" nginx -s reload
}

if ! docker exec "${BLUE_GREEN_PROXY_CONTAINER}" nginx -t >/dev/null; then
  echo "[blue-green] proxy validation failed; keeping the active slot" >&2
  restore_proxy
  exit 22
fi
docker exec "${BLUE_GREEN_PROXY_CONTAINER}" nginx -s reload

public_ready=0
for attempt in $(seq 1 20); do
  payload="$(
    curl --silent --show-error --location --max-time 10 \
      "${PUBLIC_HEALTHCHECK_URL}?deployment_probe=${BUILD_ID}" 2>/dev/null || true
  )"
  if grep -Fq "\"gitSha\":\"${GIT_SHA}\"" <<<"${payload}" &&
    grep -Fq "\"buildId\":\"${BUILD_ID}\"" <<<"${payload}"; then
    public_ready=1
    break
  fi
  sleep 2
done

if [[ "${public_ready}" != "1" ]]; then
  echo "[blue-green] public verification failed; rolling proxy back" >&2
  restore_proxy
  exit 22
fi

printf '%s\n' "${active_slot}" > "${active_slot_path}.previous"
printf '%s\n' "${candidate_slot}" > "${active_slot_path}.next"
mv "${active_slot_path}.next" "${active_slot_path}"

cat > "${state_path}.next" <<EOF
{
  "activeSlot": "${candidate_slot}",
  "previousSlot": "${active_slot}",
  "project": "${candidate_project}",
  "proxyAlias": "${candidate_alias}",
  "hostPort": "${candidate_port}",
  "releaseId": "${RELEASE_ID}",
  "gitSha": "${GIT_SHA}",
  "buildId": "${BUILD_ID}",
  "switchedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
mv "${state_path}.next" "${state_path}"

echo "[blue-green] switched to ${candidate_slot}; previous slot remains available"
