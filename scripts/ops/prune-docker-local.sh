#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib/common.sh"

WITH_VOLUMES=0
YES=0

for arg in "$@"; do
  case "$arg" in
    --with-volumes) WITH_VOLUMES=1 ;;
    --yes|-y) YES=1 ;;
    --help|-h)
      print_usage_header "scripts/ops/prune-docker-local.sh [--yes] [--with-volumes]"
      exit 0
      ;;
    *)
      fail "unknown argument: $arg"
      ;;
  esac
done

require_cmd docker

log "docker disk usage before prune"
docker system df

if (( YES == 0 )); then
  printf 'Prune unused local Docker resources%s? [y/N] ' "$([[ $WITH_VOLUMES -eq 1 ]] && printf ' including volumes')" >&2
  read -r answer
  case "${answer,,}" in
    y|yes) ;;
    *) log "docker prune cancelled"; exit 0 ;;
  esac
fi

docker image prune -f
docker builder prune -f
docker container prune -f

if (( WITH_VOLUMES == 1 )); then
  docker volume prune -f
fi

log "docker disk usage after prune"
docker system df
