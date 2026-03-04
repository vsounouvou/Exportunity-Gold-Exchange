# Email Admin (Human Mailboxes) — Audit Report (No Duplication)

Date: 2026-02-05  
Repo: `Exportunity-Gold-Exchange/` (Vite/React client + Express server + Drizzle/Postgres)

This document is the **mandatory audit/discovery** for the request:
> “Build an Admin UI inside the Exportunity platform to create/manage human email addresses, provision them in the existing mail stack, and enforce tenant isolation — without duplicating existing features.”

No feature implementation should happen until this file exists.

---

## 1) Current mail stack (production) — source of truth

### 1.1 Mail server + webmail

From the production runbook:

- Mail server: **docker-mailserver** (Postfix + Dovecot) on `mail.exportunity.net` (`51.254.143.30`)
- Webmail: **Roundcube** behind **nginx-proxy-manager**
- URL: `https://mail.exportunity.net/`

Docs:
- `docs/mail/README.md`
- `docs/email-independence-plan.md`

Quick external check (from this workstation):
- `curl -I https://mail.exportunity.net` returned `HTTP/1.1 200 OK` (Roundcube served by `openresty`).

### 1.2 Mailbox authentication store (authoritative)

**Authoritative mailbox store is file-backed** (not Postgres):

- Accounts file: `/home/vital/infra/mailserver/config/postfix-accounts.cf`
- Managed via container exec:
  - `docker exec mailserver setup email add|update|del|list`
- Maildir storage (host): `/home/vital/infra/mailserver/maildata`
  - Mounted in container at `/var/mail`

Implication:
- Creating rows in the platform DB alone **does not** create a real mailbox that Roundcube/Dovecot can authenticate.

---

## 2) What the platform already has (reuse)

### 2.1 Existing “internal mail engine” (agent-centric)

The repo already implements an internal mail engine built around **per-tenant agent mailboxes**:

- Admin UI:
  - `/admin/email` → `client/src/pages/AdminEmailControlCenterPage.tsx`
- Admin APIs:
  - `/api/admin/email/status` → `server/routes/admin-email.ts`
  - `/api/admin/email/agents` → `server/routes/admin-email.ts`
  - Mailbox/threads/work-orders endpoints under `/api/admin/*` in `server/routes/admin-email.ts`
- Platform-native mailbox UI (SSO wrapper over the indexed DB, not IMAP-from-client):
  - `/mail` → `client/src/pages/MailPage.tsx`
  - `/api/mail/*` → `server/routes/mail.ts`

DB tables (mail indexing + work orders):
- `db/schema/mail-engine.ts`
  - `agent_mailboxes`
  - `email_threads`
  - `email_messages`
  - `email_work_orders`
  - `email_attachments_meta`
  - `email_events`

### 2.2 Existing provisioning function (important limitation)

Provisioning currently exists only for agent mailboxes:
- `server/lib/mail/provisioner.ts` (`provisionAgentMailbox`)

Behavior:
- Always upserts a row into `agent_mailboxes`.
- Optionally (only if `MAIL_DATABASE_URL` is configured) creates a **virtual user** in the mail DB via `server/lib/mail/mailDb.ts`.
- If `MAIL_DATABASE_URL` is **not** set (current production runbook), provisioning returns `mailDbConfigured: false` and **does not** create a real mailbox on docker-mailserver.

This means:
- Current “Provision mailbox” flows are **platform DB provisioning**, not docker-mailserver provisioning.
- For Roundcube login to work, the mailbox must also exist in `postfix-accounts.cf` on the VPS.

### 2.3 Audit logging that can be reused

There is an existing audit log table:
- `ece_audit_logs` (`db/schema/ece.ts` → `export const auditLogs`)

We should reuse this instead of creating a new audit table (unless a dedicated table becomes necessary later).

---

## 3) Deployment reality (why provisioning is currently mismatched)

Current app deployment composes a single app service (`bdo-app`) and mounts Maildir read-only:
- `docker-compose.yml`
  - `/home/vital/infra/mailserver/maildata:/var/mail:ro`

Notably missing (today):
- No mount for `/home/vital/infra/mailserver/config` into the app container.
- No mount for `/var/run/docker.sock` into the app container.
- App image does not ship with the Docker CLI (`node:bookworm-slim` runner).

Implication:
- The app container cannot currently run `docker exec mailserver setup ...` directly.

---

## 4) What is missing for “Human Email Addresses” (gap list)

The target request requires **human mailbox provisioning + management**. Currently missing:

1. **Human email account model** (DB tables)
   - No `email_domains`, `email_accounts/email_addresses`, `email_aliases`, `email_forwarding` equivalents exist today.

2. **Admin endpoints** (tenant-isolated)
   - No `/api/admin/email/domains`
   - No `/api/admin/email/accounts` CRUD
   - No `/api/admin/email/accounts/:id/reset-password`
   - No alias/forward endpoints

3. **Provisioning adapter for docker-mailserver**
   - Must create/update/delete mailboxes in `postfix-accounts.cf` (via supported `setup` command).
   - Must be **idempotent** and safe under concurrency.
   - Must verify mailbox authentication (IMAP login check).

4. **Admin UI**
   - A simple list + create flow for human mailboxes (linked to a platform user or unassigned).

5. **Company scoping (partial gap)**
   - The spec mentions “company admin” scoping, but current auth checks (`ensureTenantAdmin`) are role/perms-based and not company-scoped.
   - Company selection exists in UI (`client/src/hooks/use-company.tsx`), but server-side access rules for “company admins” are not clearly implemented.

---

## 5) Recommended integration approach (minimal + matches current stack)

### 5.1 DB model (minimal additions)

Add minimal tables (or extend if discovered later):
- `email_domains`: tenant_id, domain, type, is_verified
- `email_accounts` (or `email_addresses`): tenant_id, company_id (nullable), owner_user_id (nullable), address, status, quota
- `email_aliases`: tenant_id, source_address, destination
- `email_credentials`: password_hash only (optional; only if needed for admin reset history)

Reuse:
- `ece_audit_logs` for auditing create/reset/disable/alias actions.

### 5.2 Provisioning (docker-mailserver)

Implement a **provisioning provider** that can execute:
- `docker exec mailserver setup email add <address> <password>`
- `docker exec mailserver setup email update <address> <password>`
- `docker exec mailserver setup email del <address>`
- `docker exec mailserver setup alias add <source> <destination>` (if supported by current mailserver image)

To allow the platform app to run this safely, choose one of:
1) **Recommended**: mount `/var/run/docker.sock` into the app container and use a narrow Docker exec implementation (Node library like `dockerode`) to call `setup` inside `mailserver`.
2) Alternative: run a small privileged “mail-provisioner” sidecar on the VPS with docker access; app calls it over HTTP (internal network).

### 5.3 Verification

After provisioning, run an IMAP auth check (server-side) and record success/failure in audit logs.

---

## 6) Reuse map (what we extend vs keep)

| Capability | Exists today? | Where | Reuse/extend plan |
|---|---:|---|---|
| Admin Email UI | ✅ (agent-focused) | `client/src/pages/AdminEmailControlCenterPage.tsx` | Extend with a “Human mailboxes” section/tab (avoid new unrelated UI) |
| Admin email APIs | ✅ (agent-focused) | `server/routes/admin-email.ts` | Extend router with human mailbox endpoints under `/api/admin/email/*` |
| Maildir indexing | ✅ | `server/lib/mail/indexer.ts` | Keep; later optionally index human mailboxes too if needed |
| Agent mailbox provisioning | ✅ (DB only) | `server/lib/mail/provisioner.ts` | Keep; add a new provider for docker-mailserver provisioning (do not change existing behavior unexpectedly) |
| Audit logging | ✅ | `ece_audit_logs` | Reuse for all email admin actions |

---

## 7) Immediate risks to manage

1) **“UI-only mailbox” risk**  
   If we add DB rows without provisioning docker-mailserver, Roundcube will not allow login.

2) **High-privilege provisioning path**  
   Allowing the app container to run docker exec requires careful gating:
   - admin-only endpoints
   - tenant isolation
   - rate limiting (esp. reset password)
   - strong audit logs

3) **Domain correctness**  
   The mail server may host multiple domains (`exportunity.net`, `exportunity.com`, `boursedelor.com`). Domain selection must be controlled and validated.

---

## 8) Conclusion

The platform already has a solid **agent-centric mail engine** and admin inbox tooling. What’s missing for this request is a **human mailbox model + admin workflows** and—most importantly—an **actual provisioning integration** with the existing file-backed docker-mailserver stack.

Next step after this audit:
- Implement only the missing parts, reusing existing mail engine/admin patterns, and ensuring provisioning is real (Roundcube login works).

