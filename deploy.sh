#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

DEPLOY_SSH_HOST="${DEPLOY_SSH_HOST:-vital@51.254.143.30}"
DEPLOY_SSH_KEY="${DEPLOY_SSH_KEY:-$HOME/.ssh/bdo_ovh_vps_ed25519}"
DEPLOY_REMOTE_BASE="${DEPLOY_REMOTE_BASE:-/home/vital/apps/bdo-app}"
DEPLOY_REMOTE_TARBALL_DIR="${DEPLOY_REMOTE_TARBALL_DIR:-$DEPLOY_REMOTE_BASE}"

E2E_BASE_URL="${E2E_BASE_URL:-https://boursedelor.com}"
E2E_SPEC="${E2E_SPEC:-tests/e2e/versioning.spec.ts}"
E2E_ADMIN_EMAIL="${E2E_ADMIN_EMAIL:-}"
E2E_ADMIN_PASSWORD="${E2E_ADMIN_PASSWORD:-}"
SKIP_DEPLOY_E2E="${SKIP_DEPLOY_E2E:-0}"
DEPLOY_PROFILE="${DEPLOY_PROFILE:-}"
DEPLOY_DOMAIN="${DEPLOY_DOMAIN:-}"

BUILD_ID="${BUILD_ID:-$(date +%s%3N)}"
GIT_SHA="${GIT_SHA:-$(git -C "$ROOT_DIR" rev-parse --short=12 HEAD)}"

if [[ -n "${DEPLOY_PROFILE}" || -n "${DEPLOY_DOMAIN}" ]]; then
  echo "[deploy] domain guard profile=${DEPLOY_PROFILE} domain=${DEPLOY_DOMAIN}"
  node "${ROOT_DIR}/scripts/deploy-domain-guard.mjs" --profile "${DEPLOY_PROFILE}" --domain "${DEPLOY_DOMAIN}"
fi

TARBALL_NAME="deploy-src-${BUILD_ID}.tgz"
TARBALL_PATH="${ROOT_DIR}/${TARBALL_NAME}"
REPORT_DIR="${REPORT_DIR:-${ROOT_DIR}/reports/${BUILD_ID}}"
REPORT_PATH="${REPORT_PATH:-${ROOT_DIR}/deploy-report-${BUILD_ID}.md}"

echo "[deploy] buildId=${BUILD_ID} gitSha=${GIT_SHA}"

cat > "${ROOT_DIR}/.build-meta.json" <<EOF
{"buildId":"${BUILD_ID}","gitSha":"${GIT_SHA}"}
EOF

echo "[deploy] packing ${TARBALL_NAME}"
set +e
tar --warning=no-file-changed -czf "${TARBALL_PATH}" \
  --exclude='./deploy-src-*.tgz' \
  --exclude='./deploy-src-full-*.tgz' \
  --exclude='./deploy-dist-*.zip' \
  --exclude='./*.tgz' \
  --exclude='./*.zip' \
  --exclude='./dist' \
  --exclude='./node_modules' \
  --exclude='./.git' \
  --exclude='./.env' \
  --exclude='./.env.*' \
  --exclude='./crawl' \
  --exclude='./mirror' \
  --exclude='./imports' \
  --exclude='./logs' \
  --exclude='./tmp' \
  --exclude='./mobile' \
  --exclude='./data' \
  --exclude='./attached_assets' \
  --exclude='./test-results' \
  --exclude='./reports' \
  -C "${ROOT_DIR}" .
TAR_EXIT=$?
set -e
if [[ "${TAR_EXIT}" -gt 1 ]]; then
  echo "[deploy] tar failed with exit code ${TAR_EXIT}"
  exit "${TAR_EXIT}"
fi
if [[ "${TAR_EXIT}" -eq 1 ]]; then
  echo "[deploy] tar emitted non-fatal warnings (exit=1); continuing"
fi
if [[ ! -s "${TARBALL_PATH}" ]]; then
  echo "[deploy] tarball missing or empty: ${TARBALL_PATH}"
  exit 1
fi

echo "[deploy] upload to ${DEPLOY_SSH_HOST}:${DEPLOY_REMOTE_TARBALL_DIR}/${TARBALL_NAME}"
scp -i "${DEPLOY_SSH_KEY}" -o StrictHostKeyChecking=no -o ServerAliveInterval=30 -o ServerAliveCountMax=120 "${TARBALL_PATH}" "${DEPLOY_SSH_HOST}:${DEPLOY_REMOTE_TARBALL_DIR}/${TARBALL_NAME}"

rollback() {
  echo "[deploy] verification failed - attempting rollback"
  ssh -i "${DEPLOY_SSH_KEY}" -o StrictHostKeyChecking=no -o ServerAliveInterval=30 -o ServerAliveCountMax=120 "${DEPLOY_SSH_HOST}" bash -s <<EOF || true
set -euo pipefail
BASE="${DEPLOY_REMOTE_BASE}"
NEW_ID="${BUILD_ID}"
PREV="\${BASE}/src_prev_\${NEW_ID}"
if [ ! -d "\${PREV}" ]; then
  echo "[rollback] no prev dir found: \${PREV}"
  exit 0
fi
FAILED="\${BASE}/src_failed_\${NEW_ID}"
rm -rf "\${FAILED}"
mv "\${BASE}/src" "\${FAILED}"
mv "\${PREV}" "\${BASE}/src"
cd "\${BASE}/src"
COMPOSE_PROJECT_NAME=src docker compose up -d --build bdo-app
echo "[rollback] restored previous release"
EOF
}

trap rollback ERR

echo "[deploy] remote deploy (atomic dir swap + docker rebuild)"
ssh -i "${DEPLOY_SSH_KEY}" -o StrictHostKeyChecking=no -o ServerAliveInterval=30 -o ServerAliveCountMax=120 "${DEPLOY_SSH_HOST}" bash -s <<EOF
set -euo pipefail
BASE="${DEPLOY_REMOTE_BASE}"
NEW_ID="${BUILD_ID}"
GIT_SHA="${GIT_SHA}"
TARBALL="${DEPLOY_REMOTE_TARBALL_DIR}/${TARBALL_NAME}"
NEW="\${BASE}/src_new_\${NEW_ID}"
PREV="\${BASE}/src_prev_\${NEW_ID}"

rm -rf "\${NEW}"
mkdir -p "\${NEW}"
tar -xzf "\${TARBALL}" -C "\${NEW}"

# Preserve the production env file (never deploy local .env).
if [ -f "\${BASE}/src/.env" ]; then
  cp "\${BASE}/src/.env" "\${NEW}/.env"
fi

if [ -d "\${BASE}/src" ]; then
  mv "\${BASE}/src" "\${PREV}"
fi
mv "\${NEW}" "\${BASE}/src"

cd "\${BASE}/src"
BUILD_ID="\${NEW_ID}" GIT_SHA="\${GIT_SHA}" COMPOSE_PROJECT_NAME=src docker compose up -d --build bdo-app

# Keep the last 5 backups (best-effort; some old dirs may contain root-owned files).
PG_DATA_MOUNT="$(docker inspect bdo-postgres --format '{{range .Mounts}}{{if eq .Destination "/var/lib/postgresql/data"}}{{.Source}}{{end}}{{end}}' 2>/dev/null || true)"
for d in \$(ls -1dt "\${BASE}"/src_prev_* 2>/dev/null | tail -n +6); do
  if [[ -n "\${PG_DATA_MOUNT}" && "\${PG_DATA_MOUNT}" == "\${d}"* ]]; then
    echo "[deploy] skip cleanup for active postgres mount: \${d}"
    continue
  fi
  rm -rf "\${d}" || true
done
EOF

if [[ -n "${E2E_ADMIN_EMAIL}" && -n "${E2E_ADMIN_PASSWORD}" ]]; then
  echo "[deploy] ensure E2E admin exists"
  ssh -i "${DEPLOY_SSH_KEY}" -o StrictHostKeyChecking=no -o ServerAliveInterval=30 -o ServerAliveCountMax=120 "${DEPLOY_SSH_HOST}" \
    "cd ${DEPLOY_REMOTE_BASE}/src && COMPOSE_PROJECT_NAME=src docker compose exec -T bdo-app env ADMIN_EMAIL='${E2E_ADMIN_EMAIL}' ADMIN_PASSWORD='${E2E_ADMIN_PASSWORD}' ADMIN_MUST_CHANGE_PASSWORD=false npm run admin:bootstrap" \
    || true
fi

if [[ "${SKIP_DEPLOY_E2E}" == "1" ]]; then
  echo "[deploy] skipping Playwright verification (SKIP_DEPLOY_E2E=1)"
  echo "[deploy] ok - deploy completed without E2E gate"
else
  echo "[deploy] verification suite (Playwright)"
  mkdir -p "${REPORT_DIR}"
  E2E_BASE_URL="${E2E_BASE_URL}" E2E_OUTPUT_DIR="${REPORT_DIR}" E2E_ADMIN_EMAIL="${E2E_ADMIN_EMAIL}" E2E_ADMIN_PASSWORD="${E2E_ADMIN_PASSWORD}" npx playwright test "${E2E_SPEC}"

  echo "[deploy] report"
  npx tsx "${ROOT_DIR}/scripts/deploy-report.ts" --baseUrl "${E2E_BASE_URL}" --resultsDir "${REPORT_DIR}" --out "${REPORT_PATH}"

  echo "[deploy] ok - ${REPORT_PATH}"
fi
