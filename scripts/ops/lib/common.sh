#!/usr/bin/env bash
set -euo pipefail

OPS_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OPS_SCRIPT_DIR="$(cd "${OPS_LIB_DIR}/.." && pwd)"
ROOT_DIR="$(cd "${OPS_SCRIPT_DIR}/../.." && pwd)"
TENANT_CONFIG_SCRIPT="${OPS_SCRIPT_DIR}/tenant-config.mjs"

log() {
  printf '[ops] %s\n' "$*" >&2
}

warn() {
  printf '[ops][warn] %s\n' "$*" >&2
}

fail() {
  printf '[ops][error] %s\n' "$*" >&2
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "required command not found: $1"
}

expand_home_path() {
  local raw="${1:-}"
  case "$raw" in
    "~") printf '%s\n' "$HOME" ;;
    "~/"*) printf '%s/%s\n' "$HOME" "${raw:2}" ;;
    *) printf '%s\n' "$raw" ;;
  esac
}

canonical_dir() {
  local target_dir="$1"
  mkdir -p "$target_dir"
  (
    cd "$target_dir"
    pwd -P
  )
}

path_is_within() {
  local candidate="$1"
  local expected_root="$2"
  case "$candidate" in
    "$expected_root"|"$expected_root"/*) return 0 ;;
    *) return 1 ;;
  esac
}

ensure_dir() {
  mkdir -p "$1"
}

timestamp_utc() {
  date -u +%Y%m%d-%H%M%S
}

iso_utc() {
  date -u +%Y-%m-%dT%H:%M:%SZ
}

short_git_sha() {
  git -C "$ROOT_DIR" rev-parse --short=12 HEAD
}

git_dirty() {
  local status_output
  status_output="$(
    git -C "$ROOT_DIR" status --porcelain --untracked-files=all -- \
      . \
      ':(exclude)ops/local-releases' \
      ':(exclude)ops/local-backups' \
      ':(exclude)ops/tmp' \
      ':(exclude)artifacts' \
      ':(exclude)client/src/navigation/routes.generated.ts'
  )"
  if [[ -n "$status_output" ]]; then
    printf 'true\n'
  else
    printf 'false\n'
  fi
}

source_version() {
  local sha dirty
  sha="$(short_git_sha)"
  dirty="$(git_dirty)"
  if [[ "$dirty" == "true" ]]; then
    printf '%s-dirty\n' "$sha"
  else
    printf '%s\n' "$sha"
  fi
}

git_branch() {
  git -C "$ROOT_DIR" rev-parse --abbrev-ref HEAD
}

sha256_file() {
  local file_path="$1"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$file_path" | awk '{print $1}'
    return 0
  fi
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$file_path" | awk '{print $1}'
    return 0
  fi
  fail "sha256sum or shasum is required"
}

load_tenant_config() {
  local tenant="$1"
  eval "$(node "$TENANT_CONFIG_SCRIPT" shell "$tenant")"
  SSH_KEY_PATH="$(expand_home_path "${DEPLOY_SSH_KEY:-${SSH_KEY_DEFAULT:-}}")"
  LOCAL_RELEASE_DIR_ABS="${ROOT_DIR}/${LOCAL_RELEASE_DIR}"
  LOCAL_BACKUP_DIR_ABS="${ROOT_DIR}/${LOCAL_BACKUP_DIR}"
  LOCAL_RELEASE_ROOT_ABS="$(canonical_dir "${ROOT_DIR}/ops/local-releases")"
  LOCAL_BACKUP_ROOT_ABS="$(canonical_dir "${ROOT_DIR}/ops/local-backups")"
  LOCAL_TMP_ROOT_ABS="$(canonical_dir "${ROOT_DIR}/ops/tmp")"
  ensure_dir "$LOCAL_RELEASE_DIR_ABS"
  ensure_dir "$LOCAL_BACKUP_DIR_ABS"
  path_is_within "$(canonical_dir "$LOCAL_RELEASE_DIR_ABS")" "$LOCAL_RELEASE_ROOT_ABS" || fail "invalid local release dir"
  path_is_within "$(canonical_dir "$LOCAL_BACKUP_DIR_ABS")" "$LOCAL_BACKUP_ROOT_ABS" || fail "invalid local backup dir"
}

ssh_base_args() {
  local args=(-o StrictHostKeyChecking=no -o ServerAliveInterval=30 -o ServerAliveCountMax=120)
  if [[ -n "${SSH_KEY_PATH:-}" ]]; then
    args=(-i "$SSH_KEY_PATH" "${args[@]}")
  fi
  printf '%s\0' "${args[@]}"
}

run_ssh() {
  local command_text="$1"
  local -a args=()
  while IFS= read -r -d '' item; do
    args+=("$item")
  done < <(ssh_base_args)
  ssh "${args[@]}" "$REMOTE_SSH_TARGET" "$command_text"
}

run_ssh_script() {
  local script_text="$1"
  local tmp_script
  tmp_script="$(mktemp "${LOCAL_TMP_ROOT_ABS}/ssh-script.XXXXXX.sh")"
  trap 'rm -f "$tmp_script"' RETURN
  printf '%s\n' "$script_text" > "$tmp_script"
  local -a args=()
  while IFS= read -r -d '' item; do
    args+=("$item")
  done < <(ssh_base_args)
  ssh "${args[@]}" "$REMOTE_SSH_TARGET" "bash -s" < "$tmp_script"
  trap - RETURN
  rm -f "$tmp_script"
}

run_scp() {
  local source_path="$1"
  local destination_path="$2"
  local -a args=()
  while IFS= read -r -d '' item; do
    args+=("$item")
  done < <(ssh_base_args)
  scp "${args[@]}" "$source_path" "$destination_path"
}

list_canonical_tenants() {
  node "$TENANT_CONFIG_SCRIPT" list
}

latest_release_artifact() {
  local target_dir="$1"
  find "$target_dir" -maxdepth 1 -type f -name '*.tar.gz' | sort | tail -n 1
}

artifact_sidecars_for() {
  local artifact_path="$1"
  local base_path="${artifact_path%.tar.gz}"
  printf '%s\n' "${base_path}.json" "${base_path}.sha256"
}

manifest_value() {
  local manifest_path="$1"
  local field_name="$2"
  node -e "const fs=require('fs'); const data=JSON.parse(fs.readFileSync(process.argv[1],'utf8')); const value=data[process.argv[2]]; if (value !== undefined && value !== null) process.stdout.write(String(value));" "$manifest_path" "$field_name"
}

verify_artifact_checksum() {
  local artifact_path="$1"
  local checksum_path="${artifact_path%.tar.gz}.sha256"
  [[ -f "$checksum_path" ]] || fail "checksum not found: $checksum_path"
  local expected actual
  expected="$(awk '{print $1}' "$checksum_path")"
  [[ -n "$expected" ]] || fail "checksum file is empty: $checksum_path"
  actual="$(sha256_file "$artifact_path")"
  [[ "$actual" == "$expected" ]] || fail "checksum mismatch for $artifact_path"
}

assert_artifact_matches_tenant() {
  local artifact_path="$1"
  local expected_tenant="$2"
  local manifest_path="${artifact_path%.tar.gz}.json"
  [[ -f "$manifest_path" ]] || fail "manifest not found: $manifest_path"

  local manifest_tenant manifest_artifact manifest_remote_root artifact_name
  manifest_tenant="$(manifest_value "$manifest_path" tenant)"
  manifest_artifact="$(manifest_value "$manifest_path" artifact)"
  manifest_remote_root="$(manifest_value "$manifest_path" remoteDeployRoot)"
  artifact_name="$(basename "$artifact_path")"

  [[ "$manifest_tenant" == "$expected_tenant" ]] ||
    fail "artifact tenant mismatch: manifest=${manifest_tenant:-missing}, target=${expected_tenant}"

  if [[ -n "$manifest_artifact" && "$manifest_artifact" != "$artifact_name" ]]; then
    fail "artifact filename mismatch: manifest=${manifest_artifact}, file=${artifact_name}"
  fi

  if [[ -n "${REMOTE_DEPLOY_ROOT:-}" && -n "$manifest_remote_root" && "$manifest_remote_root" != "$REMOTE_DEPLOY_ROOT" ]]; then
    fail "artifact remote root mismatch: manifest=${manifest_remote_root}, target=${REMOTE_DEPLOY_ROOT}"
  fi

  verify_artifact_checksum "$artifact_path"
}

print_usage_header() {
  local usage_text="$1"
  printf 'Usage: %s\n' "$usage_text" >&2
}
