#!/usr/bin/env bash
set -euo pipefail

WORK_DIR="${HOME}/workspace"
CODE_SERVER_PORT="${WORKSTATION_IDE_PORT:-3000}"
DESKTOP_PORT="${WORKSTATION_DESKTOP_PORT:-6080}"
DISPLAY_ID="${WORKSTATION_DISPLAY:-:1}"
VNC_PORT="${WORKSTATION_VNC_PORT:-5901}"
PASSWORD="${PASSWORD:-changeme}"

mkdir -p "${WORK_DIR}"

if [[ -n "${WORKSTATION_REPO_URL:-}" ]]; then
  if [[ ! -d "${WORK_DIR}/repo/.git" ]]; then
    git clone "${WORKSTATION_REPO_URL}" "${WORK_DIR}/repo" || true
  fi
  if [[ -n "${WORKSTATION_REPO_BRANCH:-}" && -d "${WORK_DIR}/repo/.git" ]]; then
    git -C "${WORK_DIR}/repo" checkout "${WORKSTATION_REPO_BRANCH}" || true
  fi
fi

Xvfb "${DISPLAY_ID}" -screen 0 1280x800x24 &
export DISPLAY="${DISPLAY_ID}"

startxfce4 >/tmp/xfce.log 2>&1 &

x11vnc -display "${DISPLAY_ID}" -nopw -listen 0.0.0.0 -forever -shared -rfbport "${VNC_PORT}" >/tmp/x11vnc.log 2>&1 &

websockify --web=/usr/share/novnc/ "${DESKTOP_PORT}" "127.0.0.1:${VNC_PORT}" >/tmp/novnc.log 2>&1 &

exec code-server --bind-addr "0.0.0.0:${CODE_SERVER_PORT}" --auth password --disable-telemetry "${WORK_DIR}"
