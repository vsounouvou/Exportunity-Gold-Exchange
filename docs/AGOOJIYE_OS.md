# AGOOJIYE OS

AGOOJIYE OS is the private French-first operating system for the AGOOJIYE team.
It lives in the same Express, React, PostgreSQL, Drizzle, and tenant-aware
application as the public mobility platform. Operational information is shared
through server-side queries; the public site never receives private OS data.

## Initial Team

The production seed creates five pre-authorized profiles:

| Member | Official email | Initial area |
| --- | --- | --- |
| Vital | `vital@agoojiye.com` | Direction |
| Regis | `regis@agoojiye.com` | Operations |
| Soriane | `soriane@agoojiye.com` | Partnerships |
| Maryse | `maryse@agoojiye.com` | Communication |
| Christian | `christian@agoojiye.com` | Engineering |

One invitation can serve the five profiles, but only these exact email
addresses can activate accounts. Activation takes a PostgreSQL row lock,
creates or updates the authenticated user, assigns tenant membership, links the
profile, opens a seven-day server session, increments the invitation use count,
and writes an audit event.

## Main Surfaces

- `/os`: personalized command center.
- `/os/canaux`: public, department, project, and direct channels.
- `/os/equipe`: directory and department hierarchy.
- `/os/projets`: projects and actionable tasks.
- `/os/documents`: shared internal knowledge.
- `/os/crm`: partners, sponsors, prospects, and commercial activity.
- `/os/mobilite`: shared live mobility indicators.
- `/os/reunions`: meetings and follow-up.
- `/os/decisions`: decision register.
- `/os/agents`: governed read-only Falove search and agent directory.
- `/os/connexion`: private login.
- `/os/rejoindre/:token`: guarded account activation.

Messages support reactions, pinning, search, and conversion into tasks or
decisions. Each write is tenant-scoped, authorized server-side, and audited
where it affects governance or access.

## Access Policy

Access levels run from 1 to 6. Explicit permissions grant a business surface;
level 6 grants leadership administration. Channel visibility also checks the
member's access level, department, project/direct membership, and channel
confidentiality. UI visibility is never treated as authorization.

Authentication uses the existing `ece_sessions` cookie/bearer session model.
Invitations store only token hashes. Private content and AI search require both
an authenticated user and a linked active AGOOJIYE team profile.

## Falove Governance

Falove is a read-only internal search assistant. It searches only records the
current member may read across tasks, projects, documents, decisions, and CRM.
It cannot send email, change a record, publish content, pay, or approve a
decision. Every search writes `ai_read_only_search` to the audit log.

## PWA, Push, and Connectivity

The OS has a dedicated installable manifest and service-worker shell cache.
Web Push subscriptions are tenant- and user-scoped. Configure:

```dotenv
AGOOJIYE_VAPID_PUBLIC_KEY=
AGOOJIYE_VAPID_PRIVATE_KEY=
AGOOJIYE_VAPID_SUBJECT=mailto:support@agoojiye.com
```

Generate one production key pair with:

```powershell
npx web-push generate-vapid-keys --json
```

Channel and dashboard data use periodic refresh while connected. The service
worker caches only the application shell and public static assets. It does not
claim safe offline writes. A future offline implementation must use an
encrypted device queue, signed mutations, idempotency keys, conflict handling,
and explicit synchronization status.

## Database and Seed

Apply the migration after a verified PostgreSQL backup:

```powershell
psql "$env:DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/20260725_agoojiye_os.sql
npm run seed:agoojye:os
```

The seed is idempotent for teams, profiles, projects, channels, memberships,
tasks, documents, partners, meetings, decisions, and notifications. It creates
a new invitation each time it is run; retain only the intended production link
and revoke older active invitations from the database or admin API.

Optional seed controls:

```dotenv
AGOOJIYE_OS_URL=https://agoojiye.com
AGOOJIYE_OS_INVITE_DAYS=30
AGOOJIYE_OS_INVITE_MAX_USES=5
```

## Production Checklist

1. Back up PostgreSQL and apply the OS migration with `ON_ERROR_STOP=1`.
2. Set `AGOOJIYE_OS_URL` and optional VAPID keys in the VPS environment.
3. Build and deploy the same release as the public AGOOJIYE platform.
4. Run the OS seed once in the application container.
5. Open the invitation without consuming it and verify organization, expiry,
   remaining places, and the five pre-authorized profiles.
6. Verify unauthenticated `/api/agoojye/os/member/bootstrap` returns `401`.
7. Verify `/os/connexion`, PWA manifest, service worker, and Web Push key.
8. Keep the invitation link private and distribute it only to the five members.
9. Rotate or revoke the invitation immediately after all five activations.
10. Monitor audit events, failed logins, push failures, and invitation attempts.

No DNS change is required when AGOOJIYE OS is served below
`https://agoojiye.com/os`. The existing TLS certificate and tenant resolution
cover the private application. Human email remains on the AGOOJIYE webmail at
`https://mail.agoojiye.com/`.
