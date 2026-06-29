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
Country: Benin
VPS IPv4: 51.254.143.30
Docker Compose project: agoojye-bdo
App container: agoojye-bdo-app-1
App host binding: 127.0.0.1:5005 -> 5000/tcp
Nginx Proxy Manager container: npm-npm-1
NPM proxy host ID: 23
NPM upstream host: agoojye-app
NPM upstream port: 5000
Current verified runtime commit: see `/api/system/version` after each deploy
NPM certificate: Let's Encrypt attached in Nginx Proxy Manager
```

Latest verified runtime on 2026-06-29:

```txt
Commit: 443474c8730c
Build ID: 1782745798794
Homepage title: AGOOJIYE - Mobilite electrique nee au Benin
Password page title: Mot de passe email - AGOOJIYE
Mailbox auth: five initial AGOOJIYE accounts verified over IMAPS and SMTP submission
Mail DNS: not yet cut over; OVH MX/SPF still active
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

The AGOOJIYE deployment is a distinct app container behind the existing Nginx Proxy Manager. The shared platform defaults should not be changed for other tenants:

```bash
TENANT_DEFAULT=exportunity
DEPLOY_TENANT=exportunity
MAIL_DOMAIN_AGOOJIYE=agoojiye.com
```

Do not switch `TENANT_DEFAULT` on the shared stack to `agoojye`, because the same VPS serves other tenants. Host-based tenant resolution maps the AGOOJIYE domains to the `agoojye` tenant, and NPM routes those domains to the distinct `agoojye-app` upstream.

## Required Mail DNS For Provisioned Mailboxes

AGOOJIYE docker-mailserver mailboxes already exist. To cut public mail over from OVH mail to the self-hosted stack, remove the existing OVH MX/SPF records and add:

| Type | Name | Target / Value |
| --- | --- | --- |
| A | mail | 51.254.143.30 |
| MX | @ | 10 mail.agoojiye.com. |
| TXT | @ | v=spf1 mx ip4:51.254.143.30 -all |
| TXT | _dmarc | v=DMARC1; p=none; rua=mailto:dmarc@agoojiye.com; adkim=s; aspf=s |
| TXT | mail._domainkey | Use the DKIM value in `docs/AGOOJIYE_EMAIL_DNS_AND_MAILBOXES.md` |

Current public DNS verification still shows the legacy OVH mail records:

```txt
MX: 1 mx1.mail.ovh.net.
MX: 5 mx2.mail.ovh.net.
MX: 100 mx3.mail.ovh.net.
TXT @: v=spf1 include:mx.ovh.com -all
mail.agoojiye.com A: missing
_dmarc.agoojiye.com TXT: missing
mail._domainkey.agoojiye.com TXT: missing
```

After applying the OVH edits, run the repository verifier:

```powershell
npm run verify:agoojye:mail-dns
```

It checks MX, `mail.agoojiye.com` A, SPF, DMARC, and DKIM against the expected self-hosted mail records.

Request OVH reverse DNS/PTR for the VPS:

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
