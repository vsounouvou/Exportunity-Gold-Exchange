#!/usr/bin/env bash
set -euo pipefail

required_vars=(
  REMOTE_DEPLOY_ROOT
  COMPOSE_PROJECT
  HOST_BIND
  HOST_PORT
  BLUE_GREEN_ALTERNATE_PORT
  PROXY_ALIAS
  BLUE_GREEN_PROXY_CONTAINER
  BLUE_GREEN_PROXY_CONFIG_PATH
  BLUE_GREEN_HOST_PATTERN
  PUBLIC_HEALTHCHECK_URL
)

for required_var in "${required_vars[@]}"; do
  if [[ -z "${!required_var:-}" ]]; then
    echo "[blue-green] missing required variable: ${required_var}" >&2
    exit 78
  fi
done

active_slot_path="${REMOTE_DEPLOY_ROOT}/shared/blue-green-active-slot"
previous_slot_path="${active_slot_path}.previous"

[[ -s "${active_slot_path}" ]] || {
  echo "[blue-green] active slot marker is missing" >&2
  exit 1
}
[[ -s "${previous_slot_path}" ]] || {
  echo "[blue-green] previous slot marker is missing" >&2
  exit 1
}

active_slot="$(tr -d '\r\n[:space:]' < "${active_slot_path}")"
target_slot="$(tr -d '\r\n[:space:]' < "${previous_slot_path}")"

case "${target_slot}" in
  blue)
    target_alias="${PROXY_ALIAS}-blue"
    target_port="${HOST_PORT}"
    target_project="${COMPOSE_PROJECT}-blue"
    ;;
  green)
    target_alias="${PROXY_ALIAS}-green"
    target_port="${BLUE_GREEN_ALTERNATE_PORT}"
    target_project="${COMPOSE_PROJECT}-green"
    ;;
  legacy)
    target_alias="${PROXY_ALIAS}"
    target_port="${HOST_PORT}"
    target_project="${COMPOSE_PROJECT}"
    target_uses_legacy_health="1"
    ;;
  *)
    echo "[blue-green] unsupported previous slot: ${target_slot}" >&2
    exit 1
    ;;
esac

target_uses_legacy_health="${target_uses_legacy_health:-0}"
target_ids="$(
  docker ps -aq --filter "label=com.docker.compose.project=${target_project}"
)"
[[ -n "${target_ids}" ]] || {
  echo "[blue-green] previous slot container is unavailable: ${target_project}" >&2
  exit 1
}
docker start ${target_ids} >/dev/null

if [[ "${target_uses_legacy_health}" == "1" ]]; then
  target_health_url="http://${HOST_BIND}:${target_port}/api/system/version"
  target_public_health_url="${PUBLIC_HEALTHCHECK_URL%/api/health/ready}/api/system/version"
else
  target_health_url="http://${HOST_BIND}:${target_port}/api/health/ready"
  target_public_health_url="${PUBLIC_HEALTHCHECK_URL}"
fi
target_payload=""
for attempt in $(seq 1 36); do
  target_payload="$(
    curl --silent --show-error --max-time 10 "${target_health_url}" 2>/dev/null || true
  )"
  if grep -Fq '"ok":true' <<<"${target_payload}"; then
    break
  fi
  sleep 5
done
grep -Fq '"ok":true' <<<"${target_payload}" || {
  echo "[blue-green] previous slot did not become healthy" >&2
  exit 22
}

target_build_id="$(
  sed -n 's/.*"buildId":"\([^"]*\)".*/\1/p' <<<"${target_payload}" | head -n 1
)"
target_git_sha="$(
  sed -n 's/.*"gitSha":"\([^"]*\)".*/\1/p' <<<"${target_payload}" | head -n 1
)"
[[ -n "${target_build_id}" && -n "${target_git_sha}" ]] || {
  echo "[blue-green] previous slot did not report a valid build identity" >&2
  exit 22
}

proxy_backup="${BLUE_GREEN_PROXY_CONFIG_PATH}.rollback-command"
docker exec "${BLUE_GREEN_PROXY_CONTAINER}" rm -f "${proxy_backup}"
if docker exec "${BLUE_GREEN_PROXY_CONTAINER}" test -f "${BLUE_GREEN_PROXY_CONFIG_PATH}"; then
  docker exec "${BLUE_GREEN_PROXY_CONTAINER}" \
    cp "${BLUE_GREEN_PROXY_CONFIG_PATH}" "${proxy_backup}"
fi
existing_proxy_config="$(
  docker exec "${BLUE_GREEN_PROXY_CONTAINER}" \
    sh -c "cat '${BLUE_GREEN_PROXY_CONFIG_PATH}' 2>/dev/null || true"
)"
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
  printf '  set $server %s;\n' "${target_alias}"
  printf '%s\n' "}"
  printf '%s\n' "# END AGOOJIYE BLUE-GREEN ROUTE"
} | docker exec -i "${BLUE_GREEN_PROXY_CONTAINER}" \
  sh -c "cat > '${BLUE_GREEN_PROXY_CONFIG_PATH}.next'"

docker exec "${BLUE_GREEN_PROXY_CONTAINER}" \
  mv "${BLUE_GREEN_PROXY_CONFIG_PATH}.next" "${BLUE_GREEN_PROXY_CONFIG_PATH}"

restore_active_proxy() {
  if docker exec "${BLUE_GREEN_PROXY_CONTAINER}" test -f "${proxy_backup}"; then
    docker exec "${BLUE_GREEN_PROXY_CONTAINER}" \
      cp "${proxy_backup}" "${BLUE_GREEN_PROXY_CONFIG_PATH}"
    docker exec "${BLUE_GREEN_PROXY_CONTAINER}" nginx -t >/dev/null
    docker exec "${BLUE_GREEN_PROXY_CONTAINER}" nginx -s reload
  fi
}

if ! docker exec "${BLUE_GREEN_PROXY_CONTAINER}" nginx -t >/dev/null; then
  restore_active_proxy
  echo "[blue-green] rollback proxy validation failed" >&2
  exit 22
fi
docker exec "${BLUE_GREEN_PROXY_CONTAINER}" nginx -s reload

public_ready=0
for attempt in $(seq 1 20); do
  payload="$(
    curl --silent --show-error --location --max-time 10 \
      "${target_public_health_url}?rollback_probe=${target_build_id}" 2>/dev/null || true
  )"
  if grep -Fq "\"gitSha\":\"${target_git_sha}\"" <<<"${payload}" &&
    grep -Fq "\"buildId\":\"${target_build_id}\"" <<<"${payload}"; then
    public_ready=1
    break
  fi
  sleep 2
done
[[ "${public_ready}" == "1" ]] || {
  restore_active_proxy
  echo "[blue-green] rollback route verification failed" >&2
  exit 22
}

printf '%s\n' "${active_slot}" > "${previous_slot_path}.next"
printf '%s\n' "${target_slot}" > "${active_slot_path}.next"
mv "${previous_slot_path}.next" "${previous_slot_path}"
mv "${active_slot_path}.next" "${active_slot_path}"

echo "[blue-green] rollback switched from ${active_slot} to ${target_slot}"
