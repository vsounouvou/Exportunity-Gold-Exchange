# Deploy - Workstation Monitoring (OVH)

## 1) Environment flags
Set on server:
```env
FEATURE_AGENT_WORKSTATIONS=true
FEATURE_WORKSTATION_MONITORING=true
FEATURE_WORKSTATION_INTERNET=true
```

Recommended workstation runtime env:
```env
WORKSTATION_IMAGE=exportunity/workstation:latest
WORKSTATION_IMAGE_FALLBACK=codercom/code-server:latest
WORKSTATION_PUBLIC_PROTOCOL=https
WORKSTATION_PUBLIC_HOST=boursedelor.com
WORKSTATION_HOST_BIND=127.0.0.1
WORKSTATION_IDE_PORT=3000
WORKSTATION_DESKTOP_PORT=6080
WORKSTATION_TERMINAL_PORT=3001
WORKSTATION_PROXY_URL=http://<internal-proxy>:<port>
```

## 2) Build workstation image on VPS
From project root on VPS:
```bash
docker build -t exportunity/workstation:latest -f docker/workstation/Dockerfile docker/workstation
```

## 3) Deploy app
```bash
git pull origin main
npm ci
SKIP_PUBLIC_SURFACE_QUALITY_GATE=1 npm run build
```

Restart app (`pm2`, `systemd`, or compose).

Example (`pm2`):
```bash
pm2 restart boursedelor-api
```

## 4) Post-deploy smoke checks
1. Create workstation:
```bash
curl -X POST "https://boursedelor.com/api/agents/<agentId>/workstation" \
  -H "Cookie: <session-cookie>"
```

2. List monitoring rows:
```bash
curl "https://boursedelor.com/api/admin/workstations?status=RUNNING" \
  -H "Cookie: <session-cookie>"
```

3. Request live token:
```bash
curl -X POST "https://boursedelor.com/api/workstations/<id>/view-token" \
  -H "Content-Type: application/json" \
  -H "Cookie: <session-cookie>" \
  --data "{\"scope\":\"DESKTOP\"}"
```

## 5) UI checks
- Open `/admin/workstations`.
- Verify list, sessions, events, artifacts, policy controls.
- Open `IDE` and `Desktop` from the row actions.
