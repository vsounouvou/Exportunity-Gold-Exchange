# Unified Email + Omni-Notifications — Audit Report

Date: 2026-02-03  
Repo scope: `Exportunity-Gold-Exchange/` (Vite/React client + Express server + Drizzle/Postgres)

This document is the **mandatory discovery/audit** for the “Unified Mail + Omni-Notifications” spec. It inventories what already exists, then maps gaps vs the target spec. **No implementation decisions are finalized here** beyond “reuse what exists; do not duplicate.”

---

## 1) What exists today (high level)

### Email (agent-centric internal mail engine)

The repo already contains a substantial “mail engine” designed around **per-tenant + per-agent mailboxes**:

- **Mail server (production runbook)**: documented as `docker-mailserver` (Postfix + Dovecot) on `mail.exportunity.net`, storing Maildir on disk. Source of truth described as `postfix-accounts.cf` on the VPS (file-backed), *not* Postgres-backed virtual users.  
  - Docs: `docs/mail/README.md`, `docs/email-independence-plan.md`
- **App DB mail engine tables** exist for mailbox/thread/message indexing and reply-enforcement (work orders):
  - Schema: `db/schema/mail-engine.ts`
  - Migration: `db/migrations/20260201_mail_engine.sql`
- **Maildir indexing** into the app DB exists:
  - Indexer: `server/lib/mail/indexer.ts`
  - Scheduler: `server/lib/mail/scheduler.ts`
  - CLI: `npm run mail:index` (script: `scripts/mail-indexer.ts`)
- **Outbound email send** exists (SMTP or sendmail), with per-mailbox daily limit + approval gating:
  - Sender: `server/lib/mail/sender.ts`
  - API route: `POST /api/email/send` (queues an Action): `server/routes/email.ts`
  - Action worker sends email: `server/lib/actions/worker.ts` -> `server/lib/mail/sender.ts`
- **Admin Email UI** exists:
  - UI: `/admin/email` -> `client/src/pages/AdminEmailControlCenterPage.tsx`
  - Admin “email inbox” UI: `/admin/inbox` -> `client/src/pages/AdminInboxPage.tsx`
  - Admin APIs: `server/routes/admin-email.ts` (mounted under `/api/admin`)

What it is **not** today:
- There is **no user-facing `/mail` “Inbox/Sent/Drafts/Trash/Compose”** UI.
- There is **no general “email address / domain / alias” platform model** for humans; the existing model is “agent mailbox per tenant.”

### Twilio (SMS + WhatsApp + Voice) communications layer

The repo already contains a Twilio-first communications layer with:

- **DB schema for comms threads/messages/work-orders/events**:
  - `db/schema/communications.ts`
- **Outbound send** (SMS/WhatsApp text + WhatsApp templates), agent/tenant rate limits, and audit logging:
  - `POST /api/comms/send` in `server/routes/ops-comms.ts`
  - Uses `server/lib/communications/router.ts` + `server/lib/communications/twilio.ts`
- **Inbound + status webhooks** with signature validation, storing events + updating message status:
  - `server/routes/twilio-webhooks.ts` (mounted under `/api/webhooks/twilio`)
- **Admin Twilio pages**:
  - Inbox/control: `/admin/communications/twilio` -> `client/src/pages/AdminCommunicationsInboxPage.tsx`
  - Settings/control center: `/admin/settings/communications/twilio` -> `client/src/pages/AdminTwilioControlCenterPage.tsx`
  - Logs: `/admin/communications/twilio/logs` -> `client/src/pages/AdminTwilioLogsPage.tsx`
- **Env visibility endpoint** (names only, no secrets):
  - `GET /api/system/env-check` in `server/routes/system.ts`

### Notifications (in-app)

There is **no real omni-notification system** yet:
- `server/lib/notifications.ts` explicitly states notifications are not DB-backed and currently returns no-ops.
- Legacy “performance notification” endpoints remain documented for backend review, but their unreferenced diagnostics renderer was retired.
- The current tenant-scoped notification workspace is `/admin/notifications` in `client/src/pages/AdminNotificationsPage.tsx`.

---

## 2) Inventory (routes/endpoints)

### 2.1 Email routes

**UI**
- `/admin/email` -> `client/src/pages/AdminEmailControlCenterPage.tsx`
- `/admin/inbox` -> `client/src/pages/AdminInboxPage.tsx`

**API**
- `/api/email/send` (POST) -> `server/routes/email.ts` (creates Action `SEND_EMAIL`)
- `/api/admin/email/status` (GET) -> `server/routes/admin-email.ts`
- `/api/admin/email/agents` (GET) -> `server/routes/admin-email.ts`
- `/api/admin/email/index` (POST) -> `server/routes/admin-email.ts` (runs Maildir indexer)
- `/api/admin/email/work-orders` (GET) -> `server/routes/admin-email.ts`
- `/api/admin/email/threads` (GET) -> `server/routes/admin-email.ts`
- `/api/admin/tenants/:tenantId/mailboxes` (GET) -> `server/routes/admin-email.ts`
- `/api/admin/tenants/:tenantId/agents/:agentId/mailbox` (GET/POST) -> `server/routes/admin-email.ts`
- `/api/admin/tenants/:tenantId/mailboxes/bulk-provision` (POST) -> `server/routes/admin-email.ts`
- `/api/admin/mailboxes/:mailboxId/disable` (POST) -> `server/routes/admin-email.ts`
- `/api/admin/mailboxes/:mailboxId/threads` (GET) -> `server/routes/admin-email.ts`
- `/api/admin/mailboxes/:mailboxId/work-orders` (GET) -> `server/routes/admin-email.ts`
- `/api/admin/threads/:threadId/messages` (GET) -> `server/routes/admin-email.ts`

### 2.2 Twilio communications routes

**UI**
- `/admin/communications/twilio` -> `client/src/pages/AdminCommunicationsInboxPage.tsx`
- `/admin/communications/twilio/logs` -> `client/src/pages/AdminTwilioLogsPage.tsx`
- `/admin/settings/communications/twilio` -> `client/src/pages/AdminTwilioControlCenterPage.tsx`

**API (staff)**
- `/api/comms/send` (POST) -> `server/routes/ops-comms.ts`
- `/api/comms/threads` (GET/POST) -> `server/routes/ops-comms.ts`
- `/api/comms/threads/:threadId/messages` (GET/POST) -> `server/routes/ops-comms.ts`
- `/api/comms/supervisor-feed` (GET) -> `server/routes/ops-comms.ts`

**API (admin)**
- `/api/admin/twilio/status` (GET) -> `server/routes/admin-twilio.ts`
- `/api/admin/twilio/events` (GET) -> `server/routes/admin-twilio.ts`
- `/api/admin/twilio/messages` (GET) -> `server/routes/admin-twilio.ts`
- `/api/admin/twilio/routing` (GET/POST) -> `server/routes/admin-twilio.ts`
- `/api/admin/twilio/agent-controls` (GET/POST) -> `server/routes/admin-twilio.ts`
- `/api/admin/twilio/send-test` (POST) -> `server/routes/admin-twilio.ts`
- `/api/admin/twilio/work-orders` (GET) -> `server/routes/admin-twilio.ts`

**Webhooks**
- `/api/webhooks/twilio/sms/inbound` (POST) -> `server/routes/twilio-webhooks.ts`
- `/api/webhooks/twilio/whatsapp/inbound` (POST) -> `server/routes/twilio-webhooks.ts`
- `/api/webhooks/twilio/message/status` (POST) -> `server/routes/twilio-webhooks.ts`
- `/api/webhooks/twilio/status` (POST) -> `server/routes/twilio-webhooks.ts` (alias)
- `/api/webhooks/twilio/inbound` (POST) -> `server/routes/twilio-webhooks.ts` (alias)
- `/api/webhooks/twilio/voice/*` (POST) -> `server/routes/twilio-webhooks.ts`

### 2.3 System endpoints relevant to rollout/proof

- `/api/system/version` (GET) -> `server/routes/system.ts` (returns `commit`, `build_time`, `env`, etc.)
- `/api/system/env-check` (GET, admin) -> `server/routes/system.ts` (Twilio presence flags)

---

## 3) Inventory (DB schema)

### 3.1 App DB — Email engine tables

Defined in `db/schema/mail-engine.ts`:
- `agent_mailboxes`
- `email_threads`
- `email_messages`
- `email_work_orders`
- `email_attachments_meta`
- `email_events`

### 3.2 App DB — Twilio communications tables

Defined in `db/schema/communications.ts`:
- `communications_routing_map`
- `communications_agent_controls`
- `communications_threads`
- `communications_messages`
- `communications_work_orders`
- `communications_events`

### 3.3 App DB — Audit log table (generic)

Defined in `db/schema/ece.ts`:
- `ece_audit_logs`

### 3.4 Mail DB (optional / planned) — Postfix virtual user tables

Defined/managed by `server/lib/mail/mailDb.ts` (separate DB via `MAIL_DATABASE_URL`):
- `virtual_domains`
- `virtual_users`
- `virtual_aliases`

Important: `docs/mail/README.md` states production mail is currently **file-backed** via `docker-mailserver` config (`postfix-accounts.cf`), not Postgres-backed. That implies `MAIL_DATABASE_URL` provisioning is likely **not active in current production**, and provisioning may be partially “UI-only” unless infra is switched.

---

## 4) Provisioning & flows (what happens today)

### 4.1 Email mailbox provisioning (agents)

- Mailboxes are provisioned **manually** via admin endpoints:
  - `POST /api/admin/tenants/:tenantId/agents/:agentId/mailbox`
  - `POST /api/admin/tenants/:tenantId/mailboxes/bulk-provision`
- The platform DB stores the mailbox in `agent_mailboxes`.
- If `MAIL_DATABASE_URL` is set, provisioning also creates a corresponding `virtual_user` record (Postgres-backed virtual mail).
- There is no evidence of an automated integration that edits `docker-mailserver`’s `postfix-accounts.cf` (file-backed accounts) from the app.

### 4.2 Automatic provisioning on user/agent creation

- **No automatic provisioning** was found for:
  - “user created -> email created”
  - “agent created -> mailbox provisioned”
- Existing behavior: if an agent tries to run certain tasks that require email, APIs may return “Mailbox missing; provision it in Agents → Email” (see `server/routes/admin-agent-tasks.ts`).

### 4.3 Work order enforcement (“inbound requires reply”)

Already implemented for:
- Email: `email_work_orders` (created/updated by the Maildir indexer) + sender marks work order as `replied` on successful outbound send.
- Twilio comms: `communications_work_orders` updated by inbound webhook + outbound send logic.

---

## 5) Twilio status (what exists vs configuration)

Implementation exists end-to-end in code (send + inbound + status callbacks + admin UI).

Configuration is environment-driven:
- Documented env vars: `.env.example`, `docs/twilio.md`
- Visibility (names only): `GET /api/system/env-check`

If env vars are missing, Twilio features may show “not configured” in admin UI; this is expected and is not a code gap.

---

## 6) Gap matrix vs target spec (Section B)

Legend:
- **Exists**: implemented and usable today.
- **Partial**: implemented in an admin/agent-only form or missing key requirements.
- **Missing**: not implemented.

| Feature (Spec) | Exists? | Where (code/UI/API) | Missing pieces | Action (no duplication) |
|---|---:|---|---|---|
| B1 Unified Mail UI (`/mail`) | ❌ Missing | (none) | No user-facing Inbox/Sent/Drafts/Trash/Compose/Search UI; no Mail API wrapper for non-admin users | Build `/mail` UI + `/api/mail/*` wrapper reusing mail-engine tables and sender; enforce tenant isolation server-side |
| B1 Multi-address “From” selector | ❌ Missing | — | No model for multiple internal addresses per user/agent; mailboxes are “agent mailbox per tenant” only | Extend mailbox/address model (prefer augmenting existing mail engine over parallel tables) |
| B1 SSO only (no email passwords shown) | ⚠️ Partial | Admin provisioning returns generated password (admin email UI); user mail UI does not exist | Need platform-native access to mailboxes without exposing mailbox password | Implement platform mailbox access via app UI; restrict password exposure to admin-only + one-time view (or remove entirely) |
| B2 Admin Mail Management (`/admin/mail`) | ⚠️ Partial | `/admin/email` + `server/routes/admin-email.ts` | Only agent mailboxes; no shared inboxes, aliases/forward rules, domain mgmt, delivery status tracking per mailbox, robust outbound logs | Extend admin area; reuse `ece_audit_logs`, `email_events`, and existing mail engine tables |
| B3 Automatic email provisioning | ❌ Missing | — | No automatic provisioning on user/agent creation; no collision handling | Add idempotent provisioner; wire into agent/user creation flows |
| B4 Omni-notifications orchestrator (WhatsApp→SMS→Email fallback) | ❌ Missing | Twilio send exists; email send exists | No orchestrator, no per-user preferences, no retry/fallback chain, no unified delivery log entity | Implement `NotificationService` + minimal `notifications` + `notification_deliveries` tables; reuse Twilio + email send modules |
| B4 Provider status logging (message id + status) | ⚠️ Partial | Twilio: `communications_messages` + webhooks; Email: `email_messages` | Missing “unified view” per notification/event; missing retry attempt model | Add notification delivery records linked to provider message ids; reuse existing status updates |
| B5 Tenant isolation everywhere | ⚠️ Partial | Many routes use `req.tenant` + ensureTenant* | Need strict isolation in new `/mail` + notifications APIs; also need “do not trust tenant_id from client” everywhere | Implement new APIs tenant-bound, never trust client tenant_id; add tests |
| B5 Rate limiting per user/company/tenant | ⚠️ Partial | Twilio send has in-memory + per-day limits; Email send has per-mailbox daily limit | Missing unified limits per user/company/tenant across channels + admin override | Add shared limiter layer for notifications service; keep existing per-channel limits |
| B5 Full audit logs (who/what/when, content hash) | ⚠️ Partial | `ece_audit_logs` used in `ops-comms.ts` | Missing for email sends and notification attempts; no content hash in logs | Extend audit logging in mail send and notifications orchestrator; store content hash (no plaintext duplication) |
| F Mail API wrapper (no IMAP from client) | ⚠️ Partial | Admin email endpoints exist | Missing `/api/mail/*` for end users | Add `/api/mail/*` endpoints using mail-engine DB |
| H Notification Center UI (`/notifications`, `/admin/notifications`) | ❌ Missing | — | No UI for notification history/status | Implement minimal pages reusing delivery logs |
| I Agent integration (actions send email/sms/whatsapp via one service) | ⚠️ Partial | Email send via Action; comms send via `/api/comms/send` | Not unified behind a single orchestrator; no consistent action logging | Add orchestrator as the canonical “send” entry point and have Actions call it |
| J Deliverability docs (SPF/DKIM/DMARC readiness) | ⚠️ Partial | `docs/mail/README.md`, `docs/email-independence-plan.md` | Need dedicated `docs/email_deliverability.md` with templates, selectors, and custom domain verification flow | Add new deliverability doc; reference existing runbooks |
| K Tests (unit/integration/E2E) | ❌ Missing (for this scope) | `tests/` exists | No targeted tests for provisioning, tenant isolation, fallback logic, and `/mail` APIs | Add tests focused on new/extended code paths |

---

## 7) Key risks / constraints discovered

1) **Mail provisioning mismatch (prod)**  
   Code supports Postgres-backed virtual mail provisioning via `MAIL_DATABASE_URL`, but `docs/mail/README.md` says production uses `docker-mailserver` with file-backed accounts (`postfix-accounts.cf`). Without an integration layer, app-side “provision mailbox” may not create a real mailbox on the mail server.

2) **No `/mail` UI**  
   The mail engine exists but is only exposed via admin pages and agent-oriented flows.

3) **Notifications are currently stubbed**  
   There is no durable “notification” entity or delivery attempts model beyond comms/email messages.

---

## 8) Next steps (per required workflow)

1) Produce `docs/email_unified_implementation_plan.md` (ordered tasks) based on the gap matrix above.
2) Implement only missing pieces, reusing existing mail engine + Twilio comms.
3) Add automated tests and provide proof outputs.

