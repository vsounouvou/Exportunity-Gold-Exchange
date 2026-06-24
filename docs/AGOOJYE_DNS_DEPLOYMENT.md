# AGOOJYÉ DNS and Deployment Configuration

This document prepares `agoojye.com` for the distinct AGOOJYÉ tenant on the existing Exportunity platform server.

## Tenant

The application tenant is:

```txt
Tenant key: agoojye
Public brand: AGOOJYÉ
Technical brand: agoojye
Primary domain: agoojye.com
Default language: French
Secondary language: English
Country: Benin
```

At startup, the server seeds the tenant from `tenants/agoojye/config.ts`. The AGOOJYÉ operating data is stored in tenant-scoped `agoojye_*` tables.

## OVH DNS Records

Use the same VPS currently used by this repository unless the server changes:

```txt
SERVER_IPV4=51.254.143.30
```

### Website Records

Add these in the OVH DNS zone for `agoojye.com`:

| Type | Name | Target | TTL |
| --- | --- | --- | --- |
| A | `@` | `51.254.143.30` | Auto |
| A | `www` | `51.254.143.30` | Auto |
| A | `app` | `51.254.143.30` | Auto |
| A | `admin` | `51.254.143.30` | Auto |

Optional if the VPS has IPv6:

| Type | Name | Target |
| --- | --- | --- |
| AAAA | `@` | `<SERVER_IPV6>` |
| AAAA | `www` | `<SERVER_IPV6>` |
| AAAA | `app` | `<SERVER_IPV6>` |
| AAAA | `admin` | `<SERVER_IPV6>` |

Do not use accented domains or emails for technical routing.

## Environment Variables

Add or merge these into the production `.env`:

```bash
TENANT_HOST_MAP=agoojye.com=agoojye,www.agoojye.com=agoojye,app.agoojye.com=agoojye,admin.agoojye.com=agoojye
PUBLIC_SITE_URL=https://agoojye.com
APP_URL=https://agoojye.com
PUBLIC_BASE_URL=https://agoojye.com
APP_BASE_URL=https://agoojye.com
PASSWORD_SETUP_BASE_URL=https://agoojye.com

MAIL_DOMAIN=agoojye.com
SMTP_FROM_EMAIL=contact@agoojye.com
SMTP_FROM_NAME=AGOOJYÉ
```

Keep `TENANT_DEFAULT=exportunity` if this server hosts multiple brands. Use `TENANT_DEFAULT=agoojye` only for a dedicated AGOOJYÉ deployment.

## Reverse Proxy

### Nginx Example

```nginx
server {
    server_name agoojye.com www.agoojye.com app.agoojye.com admin.agoojye.com;

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

Then issue SSL:

```bash
certbot --nginx -d agoojye.com -d www.agoojye.com -d app.agoojye.com -d admin.agoojye.com
nginx -t && systemctl reload nginx
```

### Caddy Example

```caddyfile
agoojye.com, www.agoojye.com, app.agoojye.com, admin.agoojye.com {
  reverse_proxy 127.0.0.1:5000
}
```

## Deploy Steps

From the repo root on the deploy machine:

```bash
npm ci
npm run build
npm run db:push
pm2 restart exportunity
```

For the current VPS packaging script:

```powershell
npm run build
.\deploy-to-vps.ps1
```

After deployment:

```bash
curl -I https://agoojye.com
curl https://agoojye.com/api/tenant
curl https://agoojye.com/api/agoojye/public/bootstrap
```

Expected tenant response includes:

```json
{
  "key": "agoojye",
  "brandName": "AGOOJYÉ Electric Mobility",
  "homeMode": "marketing"
}
```

## Optional Mail DNS

If email is provisioned with Google Workspace or Zoho, use their exact MX, SPF, DKIM, and verification records instead of the self-hosted records below.

If self-hosting mail on the same VPS:

| Type | Name | Target / Value |
| --- | --- | --- |
| A | `mail` | `51.254.143.30` |
| MX | `@` | `10 mail.agoojye.com.` |
| TXT | `@` | `v=spf1 mx a ip4:51.254.143.30 ~all` |
| TXT | `_dmarc` | `v=DMARC1; p=quarantine; rua=mailto:admin@agoojye.com; adkim=s; aspf=s` |
| TXT | `mail._domainkey` | `v=DKIM1; k=rsa; p=<PUBLIC_KEY_FROM_MAIL_SERVER>` |

Reverse DNS / PTR should be requested from OVH:

```txt
IP: 51.254.143.30
PTR: mail.agoojye.com
```

## Production Checks

Before switching traffic:

```bash
npm run check
npm run test:unit
curl https://agoojye.com/api/agoojye/public/bootstrap
```

Then verify:

- `/` shows AGOOJYÉ in French first.
- `/vision`, `/history`, `/challenge`, `/teams`, `/partners`, `/sponsors`, `/media`, `/contact` are reachable.
- Public sponsor/contact forms create `agoojye_sponsor_leads`.
- `/admin/agoojye` is reachable after admin login.
- Seeded teams, aliases, partners, milestones, and documents appear in the admin platform.
