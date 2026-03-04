# Unified Email + Omni-Notifications — Implementation Plan

Date: 2026-02-03  
Prerequisite audit: `docs/email_unified_audit.md`

This plan is **ordered** and follows the “no duplication” rule: reuse existing mail engine + Twilio comms; implement only missing pieces.

---

## Guiding decisions (canonical paths)

1) **Email sending** remains an **Action** (`SEND_EMAIL`) and continues to use:
   - API: `POST /api/email/send` (`server/routes/email.ts`)
   - Worker: `server/lib/actions/worker.ts`
   - SMTP: `server/lib/mail/sender.ts`

2) **Twilio SMS/WhatsApp/Voice** remains the canonical external comms stack:
   - Send: `POST /api/comms/send` (`server/routes/ops-comms.ts`)
   - Webhooks: `server/routes/twilio-webhooks.ts`
   - Storage: `db/schema/communications.ts`

3) New “omni-notifications” will be implemented as a **thin orchestrator** on top of (1) and (2), with its own DB entity for retries/fallback + a unified UI/history.

4) New `/mail` UI will be **platform-native** (SSO) and backed by the existing Maildir index tables, **not** IMAP from the client.

---

## Phase 1 — Omni-notifications foundation (DB + service)

### 1.1 Add minimal notification tables (app DB)

Create a migration + Drizzle schema for:
- `notifications` (tenant-scoped, event_key, recipient identity, requested channels, status, metadata)
- `notification_deliveries` (notification_id, channel, provider, to, status, provider_message_id, error)

Indexes (minimum):
- `notifications(tenant_id, created_at)`
- `notification_deliveries(notification_id, channel)`
- Unique/lookup for `(tenant_id, provider, provider_message_id)` if needed for webhook correlation

### 1.2 Implement `NotificationService` (no provider duplication)

Server module (new): `server/lib/notifications/orchestrator.ts`

Responsibilities:
- Determine channel order (default: WhatsApp → SMS → Email), with rules:
  - Business-critical events **must** attempt Email at minimum.
- Execute fallback chain and retries (3 attempts, exponential backoff).
- Persist `notifications` + `notification_deliveries`.
- Provide “delivery proof” surface: provider ids, status transitions, errors.

Preference storage:
- Reuse `ece_users.metadata.preferences` (do not add a new prefs table unless needed).

---

## Phase 2 — Extend Actions worker for SMS/WhatsApp + retry scheduling

### 2.1 Support action types already declared in schema

Extend `server/lib/actions/worker.ts` to handle:
- `SEND_WHATSAPP` (calls existing Twilio send router)
- `SEND_SMS` (calls existing Twilio send router)

### 2.2 Add “not-before” scheduling without new columns

Modify the dequeue SQL in `server/lib/actions/worker.ts` to skip queued actions that are not ready yet, using `action_requests.metadata` (jsonb), e.g.:
- `metadata.runAt` ISO timestamp
- Only dequeue when `runAt` is null or `runAt <= now()`

This enables exponential backoff retries while reusing the existing `startActionsWorkerScheduler()` loop.

### 2.3 Wire notifications to Actions (single execution path)

For notification delivery attempts:
- Create `action_requests` rows with:
  - `action_type`: `SEND_WHATSAPP` / `SEND_SMS` / `SEND_EMAIL`
  - `payload`: includes `notificationId`, `eventKey`, `to`, `body`/template vars, and a delivery attempt id
  - `metadata.runAt`: for retry delays

Worker will:
- Send via existing modules
- Update the corresponding `notification_deliveries` row
- Schedule the next retry/fallback action as needed

---

## Phase 3 — Notification Center UI + APIs

### 3.1 Backend endpoints

Add new routes (names can vary; capabilities must match):
- `GET /api/notifications` (current user; tenant-bound)
- `GET /api/admin/notifications` (admin filter by tenant/channel/status)
- `GET /api/admin/notifications/:id` (drill-down: deliveries timeline)

### 3.2 Frontend pages

Add:
- `/notifications` (user view: list + delivery statuses)
- `/admin/notifications` (admin view: filters + drill-down)

---

## Phase 4 — Platform-native Mail UI (`/mail`) + Mail API wrapper

### 4.1 Backend Mail API wrapper (SSO; no IMAP from client)

Add `server/routes/mail.ts` with endpoints matching the spec capabilities:
- `GET  /api/mail/inbox?cursor=...`
- `GET  /api/mail/sent?cursor=...`
- `GET  /api/mail/message/:id`
- `POST /api/mail/send`
- `POST /api/mail/message/:id/reply`
- `POST /api/mail/message/:id/forward`
- `DELETE /api/mail/message/:id` (move to trash)
- Attachments: reuse existing attachment meta where possible

Implementation notes:
- Reuse `email_threads`, `email_messages`, `email_attachments_meta`.
- Enforce tenant isolation via `req.tenant` and server-side mailbox resolution.
- Do not trust client-provided `tenant_id`.

Mailbox resolution (initial):
- Use current tenant + an internal mapping to an `agent_mailboxes` row (derived from staff user context / configured default agent key).
- This is the smallest change that reuses existing storage.

### 4.2 Frontend Mail UI

Add `/mail` page using a thread list + message view pattern, reusing components/UX patterns from:
- `client/src/pages/AdminInboxPage.tsx` (threads/work-orders/messages UI primitives)

Requirements:
- Inbox/Sent basic views
- Compose/Reply/Forward
- Attachment download support (where stored/indexed)
- Search (at least by subject; body search can be staged)

---

## Phase 5 — Automatic provisioning (idempotent)

### 5.1 Implement provisioner

New module: `server/lib/mail/provisioner.ts`
- `ensureAgentMailbox({ tenantId, agentKey })`:
  - If `agent_mailboxes` exists: no-op
  - Else create mailbox row and mark metadata with provisioning state

### 5.2 Wire into creation flows

Identify where agents/users are created and call the provisioner:
- Agent creation (admin UI / API)
- Any tenant onboarding flow that depends on agent comms

Important constraint from audit:
- Current production mail server is documented as **file-backed** (`docker-mailserver`), so app-side provisioning must not assume Postgres-backed virtual users are active.
- Provisioner will support:
  - “App DB only” provisioning (for platform-native `/mail`)
  - Optional `MAIL_DATABASE_URL` provisioning (when infra is switched)

---

## Phase 6 — Security, compliance, and documentation

### 6.1 Audit logs + content hash

- Extend audit logging for:
  - email sends (currently Action has audit; add message content hash in metadata)
  - notification deliveries (one log per attempt)

### 6.2 Rate limiting consolidation

- Keep existing per-channel/per-agent limits.
- Add shared “notification orchestrator” caps:
  - per user/day
  - per tenant/day
  - admin override

### 6.3 Deliverability doc

Add: `docs/email_deliverability.md`
- SPF/DKIM/DMARC templates
- DKIM selector conventions + key storage location
- rDNS/PTR guidance
- Custom tenant domain verification flow
- Link to: `docs/mail/README.md` and `docs/email-independence-plan.md`

---

## Phase 7 — Tests + proof (must be produced)

### 7.1 Automated tests (minimum)

- Unit: email address generation + collision handling (if/when implemented)
- Integration: provisioning idempotency
- Integration: tenant isolation for `/api/mail/*`
- Integration: notifications routing + fallback logic (mock providers)

### 7.2 Proof outputs

Provide CLI outputs for:
- test run(s)
- example API calls (local) showing:
  - notification created + delivery attempt rows
  - Twilio webhook updates reflected in delivery status (when configured)
  - `/api/system/version` returning current build metadata

