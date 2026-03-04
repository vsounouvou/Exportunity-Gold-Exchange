# Exportunity Platform - VPS Deployment Script (PowerShell)
# Deploy to: boursedelor.com (51.254.143.30)
# Build ID: 1770951104189
# Date: 2026-02-13

$ErrorActionPreference = "Stop"

Write-Host "=== EXPORTUNITY VPS DEPLOYMENT ===" -ForegroundColor Cyan
Write-Host ""

# Configuration
$VPS_HOST = "51.254.143.30"
$VPS_USER = "root"
$APP_NAME = "exportunity"
$DEPLOY_DIR = "/app"
$BUILD_ID = "1770951104189"
$TIMESTAMP = Get-Date -Format "yyyyMMdd-HHmmss"

Write-Host "VPS: $VPS_HOST"
Write-Host "Deploy Dir: $DEPLOY_DIR"
Write-Host "Build ID: $BUILD_ID"
Write-Host ""

# Check if we have SSH access
Write-Host "Checking SSH connectivity..." -ForegroundColor Yellow
try {
    ssh -o ConnectTimeout=5 "${VPS_USER}@${VPS_HOST}" "echo 'SSH connection OK'"
} catch {
    Write-Host "❌ Cannot connect to VPS. Please check:" -ForegroundColor Red
    Write-Host "  1. VPS is online"
    Write-Host "  2. SSH keys are configured"
    Write-Host "  3. Network connectivity"
    exit 1
}
Write-Host "✅ SSH connection verified" -ForegroundColor Green
Write-Host ""

# Step 1: Create deployment package
Write-Host "1. Creating deployment package..." -ForegroundColor Yellow
$DEPLOY_PACKAGE = "deploy-dist-${TIMESTAMP}.zip"

# Create zip excluding unnecessary files
Compress-Archive -Path @(
    "dist",
    "package.json",
    "package-lock.json",
    ".env",
    "db"
) -DestinationPath $DEPLOY_PACKAGE -Force

Write-Host "   ✅ Package created: $DEPLOY_PACKAGE" -ForegroundColor Green
Write-Host ""

# Step 2: Transfer to VPS
Write-Host "2. Transferring to VPS..." -ForegroundColor Yellow
scp $DEPLOY_PACKAGE "${VPS_USER}@${VPS_HOST}:/tmp/"
Write-Host "   ✅ Package transferred" -ForegroundColor Green
Write-Host ""

# Step 3: Deploy on VPS
Write-Host "3. Deploying on VPS..." -ForegroundColor Yellow

$deployScript = @"
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
unzip -q "/tmp/${DEPLOY_PACKAGE}"

echo "   → Installing production dependencies..."
npm ci --production --omit=dev

echo "   → Starting server with PM2..."
NODE_ENV=production pm2 start dist/index.js \
  --name "${APP_NAME}" \
  --node-args="--max-old-space-size=2048" \
  -i 1

pm2 save

echo "   ✅ Server started"

echo ""
echo "   → Checking server status..."
sleep 5
pm2 status ${APP_NAME}

echo ""
echo "   → Server logs (last 20 lines):"
pm2 logs ${APP_NAME} --lines 20 --nostream
"@

ssh "${VPS_USER}@${VPS_HOST}" $deployScript

Write-Host ""
Write-Host "=== DEPLOYMENT COMPLETE ===" -ForegroundColor Green
Write-Host ""
Write-Host "Server URLs:"
Write-Host "  - https://boursedelor.com" -ForegroundColor Cyan
Write-Host "  - https://exportunity.net" -ForegroundColor Cyan
Write-Host ""
Write-Host "Verify deployment:"
Write-Host "  curl https://boursedelor.com/api/health/build" -ForegroundColor Yellow
Write-Host ""
Write-Host "Management Commands:"
Write-Host "  ssh ${VPS_USER}@${VPS_HOST}" -ForegroundColor Yellow
Write-Host "  pm2 status" -ForegroundColor Yellow
Write-Host "  pm2 logs ${APP_NAME}" -ForegroundColor Yellow
Write-Host "  pm2 restart ${APP_NAME}" -ForegroundColor Yellow
Write-Host ""
