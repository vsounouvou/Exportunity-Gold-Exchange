# AGOOJIYE DNS and Live Deployment Configuration

This document is the live handoff for the distinct AGOOJIYE tenant on the existing Exportunity platform VPS.

## Brand spelling rule

The final public brand spelling is `AGOOJIYE`.

- Use `AGOOJIYE` in public UI, admin copy, metadata, manifests, docs, and handoff material.
- Keep `agoojye` only where it is already a technical tenant key, route namespace, database prefix, or legacy deployment identifier.
- Use `agoojiye.com` for public DNS, websites, and email addresses.

## Current Deployment

```txt
Tenant key: agoojye
Tenant display name: AGOOJIYE Electric Mobility
Primary public domain: agoojiye.com
Default language: French
Secondary language: English
Country: Bénin
VPS IPv4: 51.254.143.30
Docker Compose project: agoojye
App container: agoojye-bdo-app-1
App host binding: 127.0.0.1:5005 -> 5000/tcp
Nginx Proxy Manager container: npm-npm-1
NPM proxy host ID: 23
NPM upstream host: agoojye-app
NPM upstream port: 5000
Current verified runtime commit: see `/api/system/version` after each deploy
NPM certificate: Let's Encrypt attached in Nginx Proxy Manager
```

Latest verified runtime and mail configuration on 2026-07-24:

```txt
Source branch: codex/agoojye-launch-platform
Live version endpoint: https://agoojiye.com/api/system/version
Live commit: f7d766ea0abe
Build ID: 1784585722185
Client/server build mismatch: false
Compose release: /var/www/agoojye/releases/20260720-221408-f7d766ea0abe
Rollback release: /var/www/agoojye/releases/20260720-214724-b27600d57c1f
Public mobility routes: HTTP 200
Passenger E2E: trip search, seat selection, passenger details, demo payment, persisted booking, confirmation, and QR ticket passed
3D E2E: nonblank canvas, framing, camera interaction, interior view, and tenant-asset isolation passed on mobile, tablet, and desktop
Password page title: Mot de passe email - AGOOJIYE
Mailbox auth: regis, soriane, maryse, christian, and vital verified against Dovecot
Webmail: https://mail.agoojiye.com/ serves French Roundcube with AGOOJIYE branding and valid TLS
Unified inbox: five approved Maildir profiles are indexed and alias fan-out deduplicates by RFC Message-ID
Shared aliases: all 15 resolve to the five approved human mailboxes; marise and surian redirect to corrected spellings
Mail DNS: cut over to mail.agoojiye.com; MX, mail A, SPF, DMARC, DKIM, and PTR are publicly verified
Mail service: all five approved accounts authenticate; ports 25, 465, 587, and 993 are publicly reachable
```

Nginx Proxy Manager already has an enabled HTTP proxy host for:

```txt
agoojiye.com
www.agoojiye.com
app.agoojiye.com
admin.agoojiye.com
```

It has a Let's Encrypt certificate attached, Force SSL enabled, and HTTP/2 enabled.

## Required OVH DNS Records

In OVH Manager, open:

```txt
Web Cloud -> Domain names -> agoojiye.com -> DNS zone
```

These OVH A records are live as of 25 June 2026:

| Type | Subdomain | Target | TTL |
| --- | --- | --- | --- |
| A | empty / @ | 51.254.143.30 | 300 or automatic |
| A | www | 51.254.143.30 | 300 or automatic |
| A | app | 51.254.143.30 | 300 or automatic |
| A | admin | 51.254.143.30 | 300 or automatic |

Before saving, remove conflicting `A`, `AAAA`, or `CNAME` records for the same four names. Do not add accented technical domains or email addresses.

## DNS Records as Zone Fragment

```zone
@     300 IN A 51.254.143.30
www   300 IN A 51.254.143.30
app   300 IN A 51.254.143.30
admin 300 IN A 51.254.143.30
```

## DNS Verification

From PowerShell:

```powershell
$names = @("agoojiye.com", "www.agoojiye.com", "app.agoojiye.com", "admin.agoojiye.com")
foreach ($name in $names) {
  Resolve-DnsName $name -Type A
}
```

Expected result for each hostname:

```txt
51.254.143.30
```

Public HTTP checks after DNS resolves:

```powershell
curl.exe -I http://agoojiye.com
curl.exe http://agoojiye.com/api/tenant
curl.exe http://agoojiye.com/api/agoojye/public/bootstrap
```

Expected tenant response includes:

```json
{
  "key": "agoojye",
  "brandName": "AGOOJIYE Electric Mobility"
}
```

## Nginx Proxy Manager SSL

SSL was attached in Nginx Proxy Manager after all four A records resolved to `51.254.143.30`:

1. Proxy host domains:
   - `agoojiye.com`
   - `www.agoojiye.com`
   - `app.agoojiye.com`
   - `admin.agoojiye.com`
2. Proxy fields:
   - Scheme: `http`
   - Forward hostname / IP: `agoojye-app`
   - Forward port: `5000`
   - Websockets support: enabled
   - Block common exploits: enabled
3. SSL:
   - Certificate: Let's Encrypt attached in NPM
   - Force SSL
   - HTTP/2 support
   - HSTS disabled for initial launch

HTTPS checks:

```powershell
curl.exe -I https://agoojiye.com
curl.exe https://agoojiye.com/api/tenant
curl.exe https://app.agoojiye.com/api/tenant
curl.exe https://admin.agoojiye.com/api/tenant
```

## Existing Server-Side Verification

The host-header path is already working before DNS:

```bash
curl -H 'Host: agoojiye.com' http://127.0.0.1/api/tenant
curl -H 'Host: app.agoojiye.com' http://127.0.0.1/api/tenant
curl -H 'Host: admin.agoojiye.com' http://127.0.0.1/api/tenant
```

The public-IP path is also ready when the Host header is supplied:

```powershell
curl.exe -H "Host: agoojiye.com" http://51.254.143.30/api/tenant
```

## Production Environment Notes

The AGOOJIYE deployment is a distinct app container behind the existing Nginx Proxy Manager. The shared stack used by other tenants keeps its own defaults. The distinct AGOOJIYE service is launched with these non-secret overrides:

```bash
APP_NAME=agoojye
TENANT_DEFAULT=agoojye
DEPLOY_TENANT=agoojye
PUBLIC_BASE_URL=https://agoojiye.com
APP_BASE_URL=https://agoojiye.com
PASSWORD_SETUP_BASE_URL=https://agoojiye.com
MAIL_DOMAIN_AGOOJIYE=agoojiye.com
```

Do not switch `TENANT_DEFAULT` on any other shared service to `agoojye`, because the same VPS serves other tenants. Host-based tenant resolution maps the AGOOJIYE domains to the `agoojye` tenant, and NPM routes those domains to the distinct `agoojye-app` upstream.

## Live Mail DNS For Provisioned Mailboxes

AGOOJIYE docker-mailserver mailboxes exist and public mail was cut over from OVH mail to the self-hosted stack on 2026-07-21. The live records are:

| Type | Name | Target / Value |
| --- | --- | --- |
| A | mail | 51.254.143.30 |
| MX | @ | 10 mail.agoojiye.com. |
| TXT | @ | v=spf1 mx ip4:51.254.143.30 -all |
| TXT | _dmarc | v=DMARC1; p=none; rua=mailto:dmarc@agoojiye.com; adkim=s; aspf=s |
| TXT | mail._domainkey | Use the DKIM value in `docs/AGOOJIYE_EMAIL_DNS_AND_MAILBOXES.md` |

Public DNS verification on 2026-07-21 shows the completed mail cutover:

```txt
MX: 10 mail.agoojiye.com.
TXT @: v=spf1 mx ip4:51.254.143.30 -all
mail.agoojiye.com A: 51.254.143.30
_dmarc.agoojiye.com TXT: configured and verified
mail._domainkey.agoojiye.com TXT: configured and verified
PTR 51.254.143.30: mail.agoojiye.com.
```

After any future OVH DNS edit, run the repository verifier:

```powershell
npm run verify:agoojye:mail-dns
```

It checks MX, `mail.agoojiye.com` A, SPF, DMARC, and DKIM against the expected self-hosted mail records.

If direct queries to `1.1.1.1` time out, verify the same records through another public resolver before concluding that a record is absent. The 2026-07-21 cutover used Google DNS-over-HTTPS as the independent resolver.

The OVH reverse DNS/PTR for the VPS is configured as:

```txt
IP: 51.254.143.30
PTR: mail.agoojiye.com
```

## Final Launch Checklist

- DNS A records resolve for all four hostnames.
- NPM certificate is attached and Force SSL is enabled.
- `https://agoojiye.com` opens the French-first public website.
- `/vision`, `/history`, `/challenge`, `/teams`, `/partners`, `/sponsors`, `/media`, and `/contact` return HTTP 200.
- `https://agoojiye.com/api/agoojye/public/bootstrap` returns seeded teams, partners, milestones, documents, and email aliases.
- `/admin/agoojye` is reachable after admin login.
