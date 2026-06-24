# AGOOJYÉ DNS and Live Deployment Configuration

This document is the live handoff for the distinct AGOOJYÉ tenant on the existing Exportunity platform VPS.

## Current Deployment

```txt
Tenant key: agoojye
Tenant display name: AGOOJYÉ Electric Mobility
Primary public domain: agoojye.com
Default language: French
Secondary language: English
Country: Benin
VPS IPv4: 51.254.143.30
Docker Compose project: exportunity
App container: exportunity-bdo-app-1
App host binding: 127.0.0.1:5002 -> 5000/tcp
Nginx Proxy Manager container: npm-npm-1
NPM upstream host: exportunity-app
NPM upstream port: 5000
Latest deployed release: 20260624-100126-416760517eda
Latest deployed commit: 416760517eda
```

Nginx Proxy Manager already has an enabled HTTP proxy host for:

```txt
agoojye.com
www.agoojye.com
app.agoojye.com
admin.agoojye.com
```

It currently has no SSL certificate attached because the public DNS records do not resolve yet. After DNS is created, attach a Let's Encrypt certificate and force SSL.

## Required OVH DNS Records

In OVH Manager, open:

```txt
Web Cloud -> Domain names -> agoojye.com -> DNS zone
```

Create these A records:

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
$names = @("agoojye.com", "www.agoojye.com", "app.agoojye.com", "admin.agoojye.com")
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
curl.exe -I http://agoojye.com
curl.exe http://agoojye.com/api/tenant
curl.exe http://agoojye.com/api/agoojye/public/bootstrap
```

Expected tenant response includes:

```json
{
  "key": "agoojye",
  "brandName": "AGOOJYÉ Electric Mobility"
}
```

## Nginx Proxy Manager SSL

After all four A records resolve to `51.254.143.30`:

1. Open Nginx Proxy Manager at the existing admin endpoint.
2. Open the proxy host for `agoojye.com`, `www.agoojye.com`, `app.agoojye.com`, `admin.agoojye.com`.
3. Confirm these fields:
   - Scheme: `http`
   - Forward hostname / IP: `exportunity-app`
   - Forward port: `5000`
   - Websockets support: enabled
   - Block common exploits: enabled
4. In the SSL tab, choose "Request a new SSL Certificate".
5. Include all four domains:
   - `agoojye.com`
   - `www.agoojye.com`
   - `app.agoojye.com`
   - `admin.agoojye.com`
6. Enable:
   - Force SSL
   - HTTP/2 support
   - HSTS only after confirming HTTPS works
7. Save.

HTTPS checks:

```powershell
curl.exe -I https://agoojye.com
curl.exe https://agoojye.com/api/tenant
curl.exe https://app.agoojye.com/api/tenant
curl.exe https://admin.agoojye.com/api/tenant
```

## Existing Server-Side Verification

The host-header path is already working before DNS:

```bash
curl -H 'Host: agoojye.com' http://127.0.0.1/api/tenant
curl -H 'Host: app.agoojye.com' http://127.0.0.1/api/tenant
curl -H 'Host: admin.agoojye.com' http://127.0.0.1/api/tenant
```

The public-IP path is also ready when the Host header is supplied:

```powershell
curl.exe -H "Host: agoojye.com" http://51.254.143.30/api/tenant
```

## Production Environment Notes

The shared production `.env` should keep the multi-tenant deployment defaults:

```bash
TENANT_DEFAULT=exportunity
DEPLOY_TENANT=exportunity
MAIL_DOMAIN_AGOOJYE=agoojye.com
```

Do not switch `TENANT_DEFAULT` to `agoojye` on the shared VPS, because the same stack serves other tenants. Host-based tenant resolution maps the AGOOJYÉ domains to the `agoojye` tenant.

## Optional Mail DNS

If AGOOJYÉ email is provisioned with Google Workspace, Zoho, Proton, or another provider, use that provider's exact MX, SPF, DKIM, DMARC, and ownership-verification records.

If self-hosting mail on the same VPS later:

| Type | Name | Target / Value |
| --- | --- | --- |
| A | mail | 51.254.143.30 |
| MX | @ | 10 mail.agoojye.com. |
| TXT | @ | v=spf1 mx a ip4:51.254.143.30 ~all |
| TXT | _dmarc | v=DMARC1; p=quarantine; rua=mailto:admin@agoojye.com; adkim=s; aspf=s |
| TXT | mail._domainkey | v=DKIM1; k=rsa; p=<PUBLIC_KEY_FROM_MAIL_SERVER> |

Request OVH reverse DNS/PTR only if mail is self-hosted:

```txt
IP: 51.254.143.30
PTR: mail.agoojye.com
```

## Final Launch Checklist

- DNS A records resolve for all four hostnames.
- NPM certificate is attached and Force SSL is enabled.
- `https://agoojye.com` opens the French-first public website.
- `/vision`, `/history`, `/challenge`, `/teams`, `/partners`, `/sponsors`, `/media`, and `/contact` return HTTP 200.
- `https://agoojye.com/api/agoojye/public/bootstrap` returns seeded teams, partners, milestones, documents, and email aliases.
- `/admin/agoojye` is reachable after admin login.
