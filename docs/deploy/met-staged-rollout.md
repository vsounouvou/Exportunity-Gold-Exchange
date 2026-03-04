# Maison en Terre (`met`) Staged Rollout

## 1) Scope
Deploy only Maison en Terre tenant/module updates plus required shared tenant mapping changes.

## 2) Required server env
Set these in server `.env` (or secrets manager):

- `UPLOAD_DIR=/data/uploads`
- `ADMIN_EMAIL=admin@maisonenterre.com`
- `ADMIN_SEED_PASSWORD=<rotate-after-first-seed>`
- `MET_WHATSAPP_NUMBER=22901010101`
- `MET_DEFAULT_COUNTRY=BJ`
- `MET_PRICING_DEFAULT_DELIVERY_FEE_CFA=25000`
- `MET_PRICING_INCLUDED_RADIUS_KM=15`
- `MET_PRICING_EXTRA_FEE_PER_KM_CFA=1200`
- `MET_PRICING_BRICKS_PER_M2=50`

## 3) Stage MET-only commit set
From repo root:

```bash
git checkout -b feature/met-tenant-rollout

git add db/schema/met.ts \
  db/schema.ts \
  db/migrations/20260228_met_tenant_module.sql \
  server/lib/met/seed.ts \
  server/lib/met/storage.ts \
  server/lib/tenants.ts \
  server/seed.ts \
  server/routes/met.ts \
  server/routes.ts \
  server/index.ts \
  client/src/lib/tenant.tsx \
  client/src/lib/tenantPolicy.ts \
  client/src/lib/tenantResolution.ts \
  client/src/lib/hostMode.ts \
  client/src/lib/brand.ts \
  client/src/types/tenant.ts \
  client/src/components/SpacesSwitcher.tsx \
  client/src/pages/met/MetPublicPages.tsx \
  client/src/pages/met/MetAdminPages.tsx \
  client/src/App.tsx \
  client/src/navigation/routes.generated.ts \
  client/src/navigation/routeRegistry.ts \
  .env.example \
  docker-compose.yml \
  docs/deploy/met-staged-rollout.md

git status --short
```

Confirm staged diff contains only MET-targeted changes.

## 4) Build/migrate/seed

```bash
npm run db:push
npm run seed
npm run check
```

Seed is idempotent and only inserts missing MET baseline records.

## 5) Deploy

```bash
docker compose build bdo-app
docker compose up -d bdo-app
```

## 6) DNS and TLS
Set at registrar or Cloudflare:

- `A @ -> <VPS_IP>`
- `CNAME www -> maisonenterre.com`

If you also want the plural domain variant, add:

- `A maisonsenterre.com -> <VPS_IP>`
- `CNAME www.maisonsenterre.com -> maisonsenterre.com`

Issue TLS cert for:

- `maisonenterre.com`
- `www.maisonenterre.com`

Example with certbot (nginx host):

```bash
sudo certbot --nginx -d maisonenterre.com -d www.maisonenterre.com
```

### Nginx Proxy Manager setup (if using NPM on :80/:443)

Create a proxy host with:

- Domain Names: `maisonenterre.com`, `www.maisonenterre.com`
- Scheme: `http`
- Forward Hostname/IP: `bdo-app`
- Forward Port: `5000`
- Websockets: enabled
- Block common exploits: enabled
- Force SSL: enabled
- Certificate: Let’s Encrypt for both domains

Advanced headers (recommended):

```nginx
proxy_set_header Host $host;
proxy_set_header X-Forwarded-Host $host;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_set_header X-Real-IP $remote_addr;
```

## 7) Smoke tests

- `https://maisonenterre.com/` loads MET homepage
- `https://maisonenterre.com/briques` submits order
- `https://maisonenterre.com/devis` uploads plan and creates estimate
- `https://maisonenterre.com/admin/met` loads dashboard after login
- Existing tenants still load:
  - `boursedelor.com`
  - `exportunity.com`
  - `exportunity.zone`
  - `mindbase.cloud`

## 8) Rollback
Use existing release rollback procedure:

- switch symlink/release dir to previous build
- restart `bdo-app`
- keep DB migration (forward-only), disable MET host routing at DNS if needed

