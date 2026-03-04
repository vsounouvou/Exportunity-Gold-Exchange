# Email Deliverability (SPF / DKIM / DMARC) — Runbook

This document focuses on **deliverability readiness** (DNS + alignment + operational checks).  
For the full “own our mail stack” plan, see: `docs/email-independence-plan.md`.  
For current production mail stack notes, see: `docs/mail/README.md`.

---

## 1) Domains in scope

Typical domains used by the platform:
- Corporate/marketing: `exportunity.com`
- Platform: `exportunity.net`
- Bourse de l’Or: `boursedelor.com`

Recommended sender hostname per domain:
- `mail.<domain>` (A/AAAA + TLS cert)

---

## 2) DNS templates (copy/paste)

### 2.1 MX

At root (`@`):
- `MX 10 mail.<domain>`

### 2.2 SPF (TXT at root)

If the domain sends **only** through its own MX:
- `v=spf1 mx -all`

If the domain sends through a 3rd-party relay (example placeholder):
- `v=spf1 mx include:<relay-domain> -all`

### 2.3 DKIM

DKIM requires publishing one or more TXT records under:
- `<selector>._domainkey.<domain>`

Selector naming convention:
- Prefer a stable selector like `mail` (or `s1`) to avoid frequent DNS edits.

Record format:
- TXT name: `mail._domainkey`
- TXT value: `v=DKIM1; k=rsa; p=<PUBLIC_KEY_BASE64>`

Key storage guidance:
- Keep the private DKIM key on the mail server host (or in the mailserver container volume), not in the app repo.
- Rotate keys only with a planned window and monitoring.

### 2.4 DMARC (TXT at `_dmarc`)

Start in monitoring mode:
- `v=DMARC1; p=none; rua=mailto:dmarc@<domain>; adkim=s; aspf=s`

Move to enforcement after validation:
- `v=DMARC1; p=quarantine; rua=mailto:dmarc@<domain>; adkim=s; aspf=s`
- eventually:
  - `p=reject`

---

## 3) rDNS / PTR (provider panel)

Deliverability often fails without reverse DNS:
- PTR should map the server IP → `mail.<domain>`

Example:
- `51.x.x.x` PTR → `mail.boursedelor.com`

---

## 4) TLS and ports

Required:
- 25 (SMTP) inbound
- 587 (submission) outbound from apps/clients
- 993 (IMAPS) if IMAP is offered (optional if the platform UI is the only mailbox UI)

Certificates:
- Issue TLS certs for `mail.<domain>` (Let’s Encrypt recommended).

---

## 5) Custom tenant domains (readiness)

If tenants can bring custom domains in the future:
- Require domain ownership verification (DNS TXT challenge).
- Provide a DNS wizard with:
  - MX
  - SPF
  - DKIM selector records
  - DMARC
- Enforce a “verified” flag before allowing sending from the custom domain.

---

## 6) Operational checklist

Before going live on a domain:
- [ ] `mail.<domain>` A record points to the correct server IP
- [ ] MX points to `mail.<domain>`
- [ ] SPF exists and matches actual sending sources
- [ ] DKIM key published and mail server is signing outbound
- [ ] DMARC exists (start with `p=none`)
- [ ] PTR/rDNS set to `mail.<domain>`
- [ ] Test inbox placement (Gmail + Outlook + Yahoo)
- [ ] Monitor bounces and rejections during warm-up

Troubleshooting tip:
- If Postfix shows “mail loops back to myself”, ensure the server is configured to **own** the domain and has at least one mailbox (see `docs/mail/README.md`).

