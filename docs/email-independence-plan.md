# Email Independence Plan (Self‑Hosted)

Goal: move inbound/outbound email off hosted providers so Exportunity/Bourse de l’Or can run mail on its own infrastructure with predictable cost + full control, while keeping deliverability and minimizing downtime.

This plan complements the platform’s internal mail indexer documented in `docs/mail/README.md`.

## 1) Recommended stack (production)

**Option A (recommended): docker‑mailserver**

- Postfix (SMTP + submission)
- Dovecot (IMAP)
- Rspamd (spam filtering)
- Let’s Encrypt (TLS certs)
- Maildir storage on a persistent volume
- Admin via container exec (`setup email add|update|del|list`)

**Option B (advanced): Postfix + Dovecot + Rspamd (native)**

- Same components as above, installed directly on the VPS
- More flexible, more ops work

## 2) Domains + mailbox model

Decide which domains will be handled by the mail server:

- Marketing + corporate: `exportunity.com`
- Platform + corporate: `exportunity.net`
- Bourse de l’Or: `boursedelor.com`

Mailbox patterns:

- Human mailboxes: `first.last@<domain>` (executives, support, finance)
- Role mailboxes: `support@`, `compliance@`, `billing@`, `chairman@`
- Agent mailboxes (platform-managed): `{agentSlug}.{tenantSlug}@boursedelor.com` (see `docs/mail/README.md`)

## 3) DNS checklist (per domain)

Set TTL low (e.g., 300) at least 24h before cutover.

**A / AAAA**

- `mail.<domain>` → `<SERVER_IP>` (A record)
- (Optional) AAAA if you operate IPv6 and have rDNS set

**MX**

- `<domain>` → `mail.<domain>` (priority 10)

**SPF (TXT at root)**

- Start strict once stable:
  - `v=spf1 mx -all`
- If you also send via a third-party relay, include it:
  - `v=spf1 mx include:<provider> -all`

**DKIM**

- Enable DKIM signing on the mail server
- Publish the DKIM selector TXT records the server generates (often `mail._domainkey`)

**DMARC (TXT at _dmarc)**

- Start in monitor:
  - `v=DMARC1; p=none; rua=mailto:dmarc@<domain>; adkim=s; aspf=s`
- Move to enforce after validation:
  - `p=quarantine` → `p=reject`

**PTR / rDNS (provider control panel)**

- `<SERVER_IP>` → `mail.<domain>`
- This is critical for deliverability.

## 4) Migration steps (zero/low downtime)

1. **Inventory current email**
   - Mailboxes, aliases, forwarders, catch-all rules, groups.
2. **Provision new server**
   - Harden VPS, firewall, open ports: 25/587/465 (optional)/993.
   - Configure docker‑mailserver (or native stack).
   - Issue TLS certs for `mail.<domain>`.
3. **Create mailboxes + aliases**
   - Create all human + role mailboxes first.
   - Create required aliases/forwarders.
4. **Warm up outbound**
   - Start sending low-volume real traffic.
   - Verify inbox placement (Gmail/Outlook/Yahoo test addresses).
5. **Sync historical mail (optional but recommended)**
   - Use `imapsync` per mailbox from old provider → new server.
6. **Cut over MX**
   - Update MX to `mail.<domain>`.
   - Keep old provider active for at least 7–14 days.
7. **Monitor and stabilize**
   - Check logs for rejects, bounces, auth failures.
   - Validate SPF/DKIM/DMARC alignment (aggregate reports).
8. **Decommission old provider**
   - After stable delivery + no missing mail, shut down.

## 5) Platform integration (app → SMTP)

Configure the platform to send via your server submission endpoint:

- `MAIL_DOMAIN`
- `MAIL_SMTP_HOST` (e.g., `mail.boursedelor.com`)
- `MAIL_SMTP_PORT` (usually `587`)
- `MAIL_SMTP_USER`, `MAIL_SMTP_PASS`
- `MAIL_PLATFORM_SIGNATURE_SECRET`

For the marketing contact form notifications:

- `CONTACT_NOTIFY_TO` (CSV list)
- `CONTACT_NOTIFY_FROM` (e.g., `info@exportunity.com`)
- `CONTACT_NOTIFY_SUBJECT_PREFIX` (optional)

## 6) Operational safeguards

- Backups: daily snapshot of Maildir volume + configs.
- Anti-abuse: rate limits, fail2ban, Rspamd tuning.
- Deliverability: keep rDNS + SPF/DKIM/DMARC healthy, avoid sudden volume spikes.
- Observability: log shipping + alert on queue growth and high bounce rates.

## 7) Acceptance checklist

- Inbound mail arrives for every domain (MX working).
- Outbound mail passes SPF + DKIM and aligns with DMARC.
- Gmail/Outlook inbox placement is acceptable (not spam).
- Platform can send notifications and agents can index mail via `npm run mail:index`.

