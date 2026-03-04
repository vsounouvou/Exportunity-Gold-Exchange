#!/bin/bash
# Exportunity Platform - VPS Deployment Script
# Deploy to: boursedelor.com (51.254.143.30)
# Build ID: 1770951104189
# Date: 2026-02-13

set -e

echo "=== EXPORTUNITY VPS DEPLOYMENT ==="
echo ""

# Configuration
VPS_HOST="51.254.143.30"
VPS_USER="root"
APP_NAME="exportunity"
DEPLOY_DIR="/app"
BUILD_ID="1770951104189"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)

echo "VPS: $VPS_HOST"
echo "Deploy Dir: $DEPLOY_DIR"
echo "Build ID: $BUILD_ID"
echo ""

# Step 1: Create deployment package
echo "1. Creating deployment package..."
DEPLOY_PACKAGE="deploy-dist-${TIMESTAMP}.tar.gz"

tar -czf "$DEPLOY_PACKAGE" \
  --exclude='node_modules' \
  --exclude='.git' \
  --exclude='client' \
  --exclude='server' \
  --exclude='*.log' \
  --exclude='deploy-*.tar.gz' \
  --exclude='deploy-*.zip' \
  dist/ \
  package.json \
  package-lock.json \
  .env \
  db/

echo "   ✅ Package created: $DEPLOY_PACKAGE"
echo ""

# Step 2: Transfer to VPS
echo "2. Transferring to VPS..."
scp "$DEPLOY_PACKAGE" "${VPS_USER}@${VPS_HOST}:/tmp/"
echo "   ✅ Package transferred"
echo ""

# Step 3: Deploy on VPS
echo "3. Deploying on VPS..."
ssh "${VPS_USER}@${VPS_HOST}" << EOF
set -e

echo "   → Stopping old server..."
pm2 stop ${APP_NAME} || echo "   (no running instance)"

echo "   → Backing up current deployment..."
if [ -d "${DEPLOY_DIR}" ]; then
  mv "${DEPLOY_DIR}" "${DEPLOY_DIR}.backup-${TIMESTAMP}"
fi

echo "   → Creating app directory..."
mkdir -p "${DEPLOY_DIR}"
cd "${DEPLOY_DIR}"

echo "   → Extracting package..."
tar -xzf "/tmp/${DEPLOY_PACKAGE}"

echo "   → Installing production dependencies..."
npm ci --production --omit=dev

echo "   → Starting server with PM2..."
pm2 start dist/index.js \
  --name "${APP_NAME}" \
  --node-args="--max-old-space-size=2048" \
  -i 1 \
  --env production

pm2 save

echo "   ✅ Server started"

echo ""
echo "   → Checking server status..."
sleep 5
pm2 status ${APP_NAME}

echo ""
echo "   → Server logs (last 20 lines):"
pm2 logs ${APP_NAME} --lines 20 --nostream

EOF

echo ""
echo "=== DEPLOYMENT COMPLETE ==="
echo ""
echo "Server URLs:"
echo "  - https://boursedelor.com"
echo "  - https://exportunity.net"
echo ""
echo "Management Commands:"
echo "  ssh ${VPS_USER}@${VPS_HOST}"
echo "  pm2 status"
echo "  pm2 logs ${APP_NAME}"
echo "  pm2 restart ${APP_NAME}"
echo ""
