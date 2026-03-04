# Runbook

## MindBase MVP

### Required environment
- `OPENAI_API_KEY=<openai-key>`
- `MODEL_NAME=gpt-4o-mini` (or your approved model)
- `EMBEDDING_MODEL=text-embedding-3-small`
- `MINDBASE_JWT_SECRET=<strong-random-secret>`
- `MINDBASE_JWT_REFRESH_SECRET=<strong-random-secret>`
- `MINDBASE_AGENT_EMAIL_DOMAIN=mindbase.cloud`
- `EMAIL_WEBHOOK_SECRET=<strong-random-secret>`
- `MINDBASE_RATE_LIMIT_PER_MINUTE=90`
- `MINDBASE_UPLOAD_MAX_BYTES=20971520`
- `APP_BASE_URL=https://mindbase.cloud`
- `PASSWORD_SETUP_BASE_URL=https://mindbase.cloud`
- `PASSWORD_HASH_ROUNDS=10`
- `FX_PROVIDER_URL=https://open.er-api.com/v6/latest/USD`
- `FX_CACHE_DURATION_MS=1800000`
- `FX_STALE_AFTER_MS=7200000`
- `FX_OVERRIDE_MAX_DRIFT_PERCENT=50`
- Optional demo user password: `MINDBASE_DEMO_USER_PASSWORD=<strong-password>`

### Migration and seed
Run from repo root:

```bash
npm run db:push
psql "$DATABASE_URL" -f db/migrations/20260311_mindbase_mvp_upgrade.sql
psql "$DATABASE_URL" -f db/migrations/20260313_mindbase_password_setup.sql
npm run seed:mindbase
```

If your DB migration flow does not execute `.sql` directly, apply with your standard migration runner and ensure the following objects exist:
- `mindbase_mindbases`
- `mindbase_credits_ledger`
- `mindbase_workspaces`
- `mindbase_workspace_members`
- `mindbase_workspace_agents`
- `mindbase_api_keys`
- `mindbase_email_threads`
- `mindbase_email_messages`
- `intellect_knowledge_chunks.embedding_vector`
- `password_setup_tokens`

### Local run
```bash
npm install
npm run dev
```

MindBase routes:
- Host mode: `https://mindbase.cloud`
- Local fallback: `http://localhost:5000/mindbase`

### Smoke checks
```bash
curl -i http://localhost:5000/api/mindbase/discover
curl -i -X POST http://localhost:5000/api/mindbase/auth/register -H "content-type: application/json" -d "{\"email\":\"demo@example.com\",\"password\":\"StrongPass123!\",\"display_name\":\"Demo\"}"
```

After login/JWT:
- `GET /api/mindbase/studio/profile`
- `POST /api/mindbase/workspaces`
- `POST /api/mindbase/workspaces/:id/agents/attach`
- `POST /api/mindbase/workspaces/:id/chat`
- `POST /api/mindbase/email/inbound` (with signature)

MindBase launch checks:
- `GET /robots.txt` includes `Disallow: /admin`, `Disallow: /dashboard`, `Disallow: /api` on `mindbase.cloud`
- `GET /sitemap.xml` includes `/`, `/explore`, published `/i/:slug` and `/c/:slug`
- `GET /api/admin/settings/fx` and `PUT /api/admin/settings/fx` work for admin token
- Buyer feed + gold endpoints return FX metadata (`providerTimestamp`, `isStale`, `overrideApplied`)

First-login password setup:
- `npm run seed:mindbase` logs setup links only for newly created admins:
  - `vitalsounouvou2025@gmail.com`
  - `vs@exportunity.net`
- Open link: `https://mindbase.cloud/setup-password?token=...`
- Submit new password via `POST /api/auth/setup-password`
- Auto-login returns `token` and redirects to `/dashboard`

Regenerate setup link (admin only):
```bash
curl -X POST "$BASE_URL/api/admin/users/<USER_ID>/regenerate-setup-link" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "content-type: application/json"
```

### Rollback
1. Revert app image/deployment to previous tag.
2. Keep additive DB migration; do not drop MindBase tables in rollback.
3. Remove MindBase host routing at reverse proxy if required (`mindbase.cloud` only).

## Exportunity Meet (mediasoup SFU)

### Required environment
- `MEET_PUBLIC_BASE_URL=https://meet.exportunity.net`
- `MEET_INVITE_SECRET=<strong-random-secret>`
- `MEET_INVITE_TTL_MS=7200000`
- `MEET_ANNOUNCED_IP=<public-ip-or-dns>`
- `MEET_RTC_MIN_PORT=40000`
- `MEET_RTC_MAX_PORT=49999`
- `TURN_URLS=turn:meet.exportunity.net:3478,turns:meet.exportunity.net:5349`
- `TURN_STATIC_USERNAME=<turn-user>`
- `TURN_STATIC_PASSWORD=<turn-password>`
- Optional summary override: `MEET_SUMMARY_MODEL=gpt-4o-mini`

### Health checks
- API health: `GET /api/meet/healthz`
- TURN config check: `GET /api/meet/turn` (staff auth or invite token)
- Socket namespace: `wss://<host>/meet` (`join` event required)

### Join flow
1. Host creates meeting in `/meetings`
2. System issues host invite token (`/api/meet/meetings/:id/join-token`)
3. Participant opens `/m/:id?t=<token>`
4. Client joins socket namespace and sends `join`

### Recording + recap
1. Upload recording: `POST /api/meet/meetings/:id/recordings/upload` (staff)
2. Generate recap: `POST /api/meet/meetings/:id/summary`
3. Artifacts list: `GET /api/meet/meetings/:id/artifacts`
4. Auto recap on end: `POST /api/meet/meetings/:id/end`

### Common failures
- `missing_meet_secret`: set `MEET_INVITE_SECRET` (or `JWT_SECRET` fallback)
- `mediasoup_unavailable`: install/run mediasoup worker runtime; chat/control still works
- `invite_expired`: re-issue token with `/join-token`
- `forbidden` on host actions: caller is not `host`/`cohost`

## Admin access
- `https://boursedelor.com/admin`
- `https://exportunity.net/admin`
- Password change (if prompted): `/admin/password`

## Admin CLI commands
Run from repo root `Exportunity-Gold-Exchange/`:

```bash
# List admin users
npm run admin:list

# Create or update admin (forces password change on next login)
ADMIN_EMAIL="admin@example.com" ADMIN_PASSWORD="TempPass123!" npm run admin:bootstrap

# Reset admin password (forces password change on next login)
ADMIN_EMAIL="admin@example.com" ADMIN_PASSWORD="TempPass123!" npm run admin:reset-password
```

Notes:
- Passwords are never printed in logs. Store them securely when you set them.
- First login after a bootstrap/reset requires a password update.

## Landing images batch (Bourse gateway)
- Requires `REPLICATE_API_TOKEN` set on the VPS `.env`
- Generates/imports all Bourse gateway assets and sets them active

Run from repo root:
```bash
npm run gen:landing:bourse
```

Admin API trigger (admin auth required):
```
POST /api/admin/assets/bulk-generate
{ "namespace": "bourse", "tag": "landing", "missingOnly": false, "setActive": true }
```

## If admin login fails
- Confirm the email exists: `npm run admin:list`
- Reset password: `npm run admin:reset-password`
- Check server logs for auth errors (`/api/ece/auth/login`).

## Gold Stamping + Chairman Cutover

### Required environment
- `TENANT_KEY=bdo` (or target tenant key for smoke)
- `PUBLIC_BASE_URL=https://<your-domain>`
- `CHAT_ATTACHMENT_MAX_BYTES=20971520` (optional override)
- Twilio optional for live call:
  - `TWILIO_ACCOUNT_SID`
  - `TWILIO_AUTH_TOKEN`
  - `TWILIO_VOICE_FROM`
  - `TWILIO_VOICE_FORWARD_TO` or agent control `voiceDialToE164`

### DB migrations
Run additive SQL migrations before app restart:

```bash
psql "$DATABASE_URL" -f db/migrations/20260227_chairman_console_cutover.sql
psql "$DATABASE_URL" -f db/migrations/20260301_tasks_objective_enforcement.sql
psql "$DATABASE_URL" -f db/migrations/20260312_gold_chairman_cutover_patch.sql
```

Partner cleanup (BDO hard delete non-authorized shops):

```bash
psql "$DATABASE_URL" -f scripts/sql/bdo_partner_jewellers_cleanup.sql
```

### Feature defaults (BDO launch)
Verify and enforce:
- `feature.gold_stamping=true`
- `feature.jewelry=false`
- `feature.custom_jewelry=false`
- `feature.3d_memory=false`

API:

```bash
curl -X GET "$BASE_URL/api/admin/features" -H "Authorization: Bearer $AUTH_TOKEN" -H "x-tenant-key:bdo"
curl -X POST "$BASE_URL/api/admin/features" -H "Authorization: Bearer $AUTH_TOKEN" -H "x-tenant-key:bdo" -H "content-type: application/json" -d '{"key":"feature.gold_stamping","enabled":true}'
```

### Authenticated smoke scripts
Chairman runtime smoke (terminal-agent, assistant message, NAVIGATE evidence, quick-token one-time redeem):

```bash
BASE_URL="https://boursedelor.com" TENANT_KEY="bdo" TENANT_ID="1" AUTH_TOKEN="$AUTH_TOKEN" node scripts/qa/chairman-smoke-auth.mjs
```

Gold stamping audit (SKU/items/verify/partner lock plus optional mutation checks):

```bash
BASE_URL="https://boursedelor.com" TENANT_KEY="bdo" AUTH_TOKEN="$AUTH_TOKEN" node scripts/qa/gold-stamping-audit.mjs
# mutation checks:
BASE_URL="https://boursedelor.com" TENANT_KEY="bdo" AUTH_TOKEN="$AUTH_TOKEN" ALLOW_MUTATION=1 node scripts/qa/gold-stamping-audit.mjs
```

Both scripts print machine JSON + markdown checklist, and can persist artifacts with:
- `OUTPUT_DIR=/path/to/output`
- `AUDIT_TAG` / `SMOKE_TAG`

### Deploy commands
PM2:

```bash
git pull origin main
npm install
npm run build
pm2 restart all
pm2 logs --lines 200
```

Docker:

```bash
git pull origin main
docker compose down
docker compose build --no-cache
docker compose up -d
docker compose logs -f --tail=200
```

### Post-deploy checks
- `GET /api/tenants/:tenantId/terminal-agent` returns tenant-bound chairman assistant.
- `POST /api/assistant/message` roundtrip works in dock and quick page.
- NAVIGATE run reaches `SUCCEEDED` only after evidence.
- Quick token is one-time redeem (second redeem blocked).
- `POST /api/pickup/confirm` requires `READY_PICKUP` + certificate + `idVerified=true`.
- Verify endpoints resolve both serial and qr token fallback.

### VPS ownership hygiene
After successful smoke, fix backup directory ownership:

```bash
sudo chown -R <deploy_user>:<deploy_group> /var/backups/exportunity
```
