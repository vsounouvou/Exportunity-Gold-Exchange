# MANUAL VPS DEPLOYMENT GUIDE
**Platform:** Exportunity / Bourse de l'Or
**Build ID:** 1770951104189
**Date:** 2026-02-13

---

## 🚀 QUICK DEPLOYMENT STEPS

### Step 1: Upload Deployment Package

The deployment package is ready: **`deploy-dist-final.zip`** or **`deploy-dist-20260213-030058.zip`**

**Upload to VPS:**
```bash
# Using SCP (from your local machine):
scp deploy-dist-final.zip root@51.254.143.30:/tmp/

# Or using FTP/SFTP client like FileZilla:
# Host: 51.254.143.30
# Username: root
# Port: 22
# Upload to: /tmp/
```

### Step 2: SSH into VPS

```bash
ssh root@51.254.143.30
```

If you need the SSH password, use the VPS credentials from your hosting provider.

### Step 3: Deploy on VPS

Once logged into the VPS, run these commands:

```bash
# Stop old server
pm2 stop exportunity || echo "No running instance"

# Backup current deployment (optional)
mv /app /app.backup-$(date +%Y%m%d) || echo "No backup needed"

# Create app directory
mkdir -p /app
cd /app

# Extract deployment package
unzip -o /tmp/deploy-dist-final.zip

# Install production dependencies
npm ci --production --omit=dev

# Start server with PM2
NODE_ENV=production pm2 start dist/index.js \
  --name exportunity \
  --node-args="--max-old-space-size=2048" \
  -i 1

# Save PM2 configuration
pm2 save

# Set PM2 to start on system boot
pm2 startup

# Check status
pm2 status
pm2 logs exportunity --lines 50
```

### Step 4: Verify Deployment

```bash
# Check if server is running
curl http://localhost:5000/api/health/build

# Or from your local machine:
curl https://boursedelor.com/api/health/build
curl https://exportunity.net/api/health/build
```

---

## 📦 WHAT'S INCLUDED IN THE PACKAGE

```
deploy-dist-final.zip/
├── dist/
│   ├── index.js          (3.4 MB server bundle)
│   └── public/
│       └── assets/       (client bundles - JS, CSS)
├── package.json
├── package-lock.json
├── .env                  (environment variables)
└── db/
    └── schema/           (database schema files)
```

---

## ⚙️ ENVIRONMENT CONFIGURATION

The `.env` file is included in the package with production settings:

```bash
# Database
DATABASE_URL=postgresql://...

# Email
MAIL_SMTP_HOST=mail.exportunity.net
MAIL_SMTP_PORT=587
MAIL_SMTP_USER=app@mail.exportunity.net

# AI
AI_ENABLED=true
ANTHROPIC_API_KEY=...
OPENAI_API_KEY=...

# Server
NODE_ENV=production
PORT=5000
```

**If you need to update environment variables:**
```bash
cd /app
nano .env
# Make changes, then save (Ctrl+X, Y, Enter)
pm2 restart exportunity
```

---

## 🔧 PM2 MANAGEMENT COMMANDS

### Check Status:
```bash
pm2 status
pm2 logs exportunity
pm2 monit
```

### Restart Server:
```bash
pm2 restart exportunity
pm2 reload exportunity  # Zero-downtime restart
```

### Stop Server:
```bash
pm2 stop exportunity
pm2 delete exportunity  # Remove from PM2
```

### View Logs:
```bash
pm2 logs exportunity          # Live logs
pm2 logs exportunity --lines 100  # Last 100 lines
pm2 flush exportunity         # Clear logs
```

---

## 🌐 NGINX CONFIGURATION

If you're using nginx as a reverse proxy, here's the configuration:

**File:** `/etc/nginx/sites-available/exportunity`

```nginx
# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name boursedelor.com www.boursedelor.com exportunity.net www.exportunity.net;
    return 301 https://$server_name$request_uri;
}

# HTTPS server
server {
    listen 443 ssl http2;
    server_name boursedelor.com www.boursedelor.com;

    # SSL certificates (Let's Encrypt)
    ssl_certificate /etc/letsencrypt/live/boursedelor.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/boursedelor.com/privkey.pem;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;

    # Proxy to Node.js app
    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # WebSocket support (for Socket.IO)
    location /socket.io/ {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
    }
}

# Exportunity.net (same configuration)
server {
    listen 443 ssl http2;
    server_name exportunity.net www.exportunity.net;

    ssl_certificate /etc/letsencrypt/live/exportunity.net/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/exportunity.net/privkey.pem;

    # Same proxy configuration as above
    location / {
        proxy_pass http://localhost:5000;
        # ... (same proxy settings)
    }

    location /socket.io/ {
        proxy_pass http://localhost:5000;
        # ... (same WebSocket settings)
    }
}
```

**Enable the configuration:**
```bash
ln -s /etc/nginx/sites-available/exportunity /etc/nginx/sites-enabled/
nginx -t  # Test configuration
systemctl reload nginx
```

---

## 🔒 SSL CERTIFICATES (Let's Encrypt)

If SSL is not set up yet:

```bash
# Install Certbot
apt-get update
apt-get install certbot python3-certbot-nginx

# Get certificates for both domains
certbot --nginx -d boursedelor.com -d www.boursedelor.com
certbot --nginx -d exportunity.net -d www.exportunity.net

# Auto-renewal is enabled by default
certbot renew --dry-run  # Test renewal
```

---

## 🐛 TROUBLESHOOTING

### Server won't start:
```bash
# Check logs
pm2 logs exportunity --lines 100

# Common issues:
# 1. Port already in use
lsof -i :5000
kill -9 <PID>

# 2. Database connection failed
# Check DATABASE_URL in .env

# 3. Missing dependencies
cd /app
npm install --production

# 4. Permission issues
chown -R root:root /app
```

### Can't access from browser:
```bash
# Check if server is running
pm2 status
curl http://localhost:5000/api/health/build

# Check nginx
systemctl status nginx
nginx -t

# Check firewall
ufw status
ufw allow 80/tcp
ufw allow 443/tcp
```

### Database errors:
```bash
# Test database connection
cd /app
npx tsx -e "import { db } from './db/index.js'; console.log('Testing...'); db.execute('SELECT 1').then(() => console.log('✅ DB OK')).catch(e => console.error('❌ DB Error:', e));"

# Run migrations (if needed)
npm run db:push
```

---

## 📊 HEALTH CHECKS

### API Endpoints to Test:
```bash
# Health check
curl https://boursedelor.com/api/health/build

# System version
curl https://boursedelor.com/api/system/version

# Tenant info
curl https://boursedelor.com/api/tenant
```

### Expected Response:
```json
{
  "ok": true,
  "serverTime": "2026-02-13T...",
  "nodeEnv": "production",
  "buildId": "1770951104189",
  "gitSha": "c206cabddbc1"
}
```

---

## 🎯 POST-DEPLOYMENT CHECKLIST

After deployment, verify:

- [ ] Server is running (`pm2 status`)
- [ ] Health endpoint responds (`curl https://boursedelor.com/api/health/build`)
- [ ] Homepage loads (`https://boursedelor.com`)
- [ ] Admin panel accessible (`https://boursedelor.com/admin`)
- [ ] Marketplace works (`https://boursedelor.com/admin/marketplace/products`)
- [ ] Edit/History/Images buttons work
- [ ] Actions worker is running (check logs for `[actions-worker]`)
- [ ] Background meetings initialized (check logs for `[BGConv]`)
- [ ] Email system operational
- [ ] No errors in logs (`pm2 logs exportunity`)

---

## 📞 QUICK SUPPORT COMMANDS

```bash
# SSH to VPS
ssh root@51.254.143.30

# Check everything
pm2 status && pm2 logs exportunity --lines 20

# Restart if needed
pm2 restart exportunity

# Check system resources
top
df -h
free -h

# Check database
psql $DATABASE_URL -c "SELECT COUNT(*) FROM agents;"
```

---

## ✅ SUCCESS CRITERIA

Deployment is successful when:

1. ✅ PM2 shows "exportunity" status as "online"
2. ✅ Health endpoint returns `{ "ok": true, "buildId": "1770951104189" }`
3. ✅ Websites are accessible:
   - https://boursedelor.com
   - https://exportunity.net
4. ✅ Admin panel works
5. ✅ Marketplace products page loads
6. ✅ Edit/History/Images buttons functional
7. ✅ No errors in PM2 logs

---

**Deployment Guide Created:** 2026-02-13
**Build ID:** 1770951104189
**Status:** Ready for manual deployment
