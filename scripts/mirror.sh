#!/usr/bin/env bash
set -euo pipefail

# Linux-friendly mirror using wget (recommended if available).
# Produces a static copy that can be opened offline.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
URL="${MIRROR_URL:-https://www.exportunity.com/}"
OUT_DIR="${MIRROR_OUT_DIR:-${ROOT_DIR}/mirror}"

# Asset hosts for Wix sites commonly include static.wixstatic.com (and possibly others).
DOMAINS="${MIRROR_DOMAINS:-exportunity.com,static.wixstatic.com}"

mkdir -p "${OUT_DIR}"

echo "[mirror] url=${URL}"
echo "[mirror] out=${OUT_DIR}"
echo "[mirror] domains=${DOMAINS}"

wget --mirror \
  --page-requisites \
  --convert-links \
  --adjust-extension \
  --span-hosts \
  --domains="${DOMAINS}" \
  --no-parent \
  "${URL}" \
  -P "${OUT_DIR}"

echo "[mirror] done"

