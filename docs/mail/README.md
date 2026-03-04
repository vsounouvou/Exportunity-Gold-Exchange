# Internal Mail Engine (boursedelor.com) — Runbook

See also: `docs/email-independence-plan.md` for the self-hosting + DNS + migration plan.

## Production note (current infra)

Production mail is currently handled by a `docker-mailserver` container on `mail.exportunity.net` (51.254.143.30).

## Webmail (Roundcube)

- URL: `https://mail.exportunity.net/`
- Reverse proxy: `nginx-proxy-manager` container `npm-npm-1` on the VPS (ports `80/443`)
- Upstream: `roundcube` container (HTTP `80`) on docker network `bdo-proxy`
- NPM nginx vhost file:
  - Host: `/home/vital/infra/npm/data/nginx/proxy_host/3.conf`
  - Container: `/data/nginx/proxy_host/3.conf`
- TLS certificate (Let's Encrypt):
  - Container: `/etc/letsencrypt/live/npm-4/`
  - Renewal config: `/etc/letsencrypt/renewal/npm-4.conf`
  - ACME webroot: `/data/letsencrypt-acme-challenge` (must match renewal config)

That means:

- Domains + mailboxes are **file-backed**, not PostgreSQL-backed.
- Source of truth for mail accounts (on the VPS):
  - `/home/vital/infra/mailserver/config/postfix-accounts.cf`
  - managed via: `docker exec mailserver setup email add|update|del|list`
- Maildir storage (on the VPS):
  - `/home/vital/infra/mailserver/maildata` (mounted to `/var/mail` in the container)

### Avoid the classic MX loop

If Postfix is not configured to **own** a domain (no vhost/mailbox), it treats it as remote and will do an MX lookup.
If that MX points back to the same server, Postfix rejects with:

> `mail for <domain> loops back to myself`

Fix: ensure the domain has at least one mailbox (`setup email add user@domain`).

---

This folder documents the **internal email system** used by the platform:

- Mail server stack: Postfix + Dovecot (containerized)
- Domain: `boursedelor.com`
- **Per-tenant agent mailboxes**: `{agentSlug}.{tenantSlug}@boursedelor.com`
- The platform app **indexes Maildir** into the app DB for Admin UI (threads/messages).

## What lives where

### Mail server (VPS)

- Container: `mailserver` (docker-mailserver)
- Postfix (SMTP + submission 587)
- Dovecot (IMAP 993 + LMTP delivery)
- Maildir storage: `/var/mail/<domain>/<localpart>/` (host: `/home/vital/infra/mailserver/maildata`)
- Config: `/tmp/docker-mailserver/` (host: `/home/vital/infra/mailserver/config`)

### Platform app

- App DB tables: created by `db/migrations/20260201_mail_engine.sql`
- Admin APIs:
  - `POST /api/admin/tenants/:tenantId/agents/:agentId/mailbox`
  - `POST /api/admin/tenants/:tenantId/mailboxes/bulk-provision`
  - `POST /api/admin/mailboxes/:mailboxId/disable`
  - `GET /api/admin/mailboxes/:mailboxId/threads`
  - `GET /api/admin/threads/:threadId/messages`
- Outbound send API:
  - `POST /api/email/send`
- Indexer script (run on the mail server):
  - `npm run mail:index`

## Required env vars (platform app)

Set these on the app server:

- `MAIL_DOMAIN` — default `boursedelor.com`
- `MAIL_SMTP_HOST` — default `mail.boursedelor.com`
- `MAIL_SMTP_PORT` — default `587`
- `MAIL_SMTP_USER`, `MAIL_SMTP_PASS` — submission credentials used by the platform
- `MAIL_PLATFORM_SIGNATURE_SECRET` — HMAC secret for `X-Platform-Signature` headers

Planned (Postgres-backed virtual users; not used by current production mailserver container):

- `MAIL_DATABASE_URL` — Postgres URL for the mail DB (virtual users/domains/aliases)
- `MAILDIR_BASE` — default `/var/vmail`

## DNS checklist (boursedelor.com)

- `A` record: `mail.boursedelor.com` → `<SERVER_STATIC_IP>`
- `MX` record: `boursedelor.com` → `mail.boursedelor.com` (priority 10)
- `TXT` SPF: `v=spf1 mx -all`
- `TXT` DMARC (start monitor): `v=DMARC1; p=none; rua=mailto:dmarc@boursedelor.com; adkim=s; aspf=s`
- **PTR / rDNS** at provider: `<SERVER_STATIC_IP>` → `mail.boursedelor.com`
- TLS cert: `mail.boursedelor.com`

## Indexer

The platform **does not** store raw emails in the app DB.

- Maildir is the source of truth.
- The platform indexes Maildir into `email_threads` / `email_messages` for admin UX.

Run the indexer on the mail server:

```powershell
cd Exportunity-Gold-Exchange
npm run mail:index -- --tenant bdo --limit 500
```

## Notes

- If mailboxes are missing on the mail server, inbound mail will bounce or loop; fix by provisioning the mailbox in the mailserver container.
- If/when Postgres-backed virtual mail is enabled, keep mailserver + app provisioning in sync (no “UI-only” mailboxes).
