# AGOOJIYE WorkOS

AGOOJIYE WorkOS is the private, French-first operating environment for the
AGOOJIYE team. It shares the existing Express, React, PostgreSQL, Drizzle and
tenant-aware runtime with the public electric mobility platform, while keeping
all private queries behind AGOOJIYE membership and server-side authorization.

The public mobility experience, ticketing, bus catalog, controller tools,
commercial forms and the AGOOJIYE-owned webmail remain separate, working
surfaces.

## Private Environments

- `/workspace`: daily three-panel workspace for AI conversations, channels,
  direct messages, tasks, projects, files, meetings and decisions.
- `/admin/command-center`: administrative command room for people,
  organization, projects, imports, HOWJI, security and audits.
- `/workspace/connexion`: dedicated WorkOS login with required MFA for
  privileged users.
- `/workspace/rejoindre/:token`: guarded team activation.
- `https://mail.agoojiye.com/`: branded AGOOJIYE webmail.
- `/mail/password`: authenticated first-use and mailbox password change.

Legacy `/os` routes remain available during the transition, but new
notifications, PWA shortcuts and operational links target `/workspace`.

## Initial Identities

The existing human team is preserved:

| Person | Mailbox | Initial area |
| --- | --- | --- |
| Vital | `vital@agoojiye.com` | Direction |
| Regis | `regis@agoojiye.com` | Operations |
| Soriane | `soriane@agoojiye.com` | Partnerships |
| Maryse | `maryse@agoojiye.com` | Communication |
| Christian | `christian@agoojiye.com` | Engineering |

The principal WorkOS identity is separate:

- Application and mailbox email: `vs@agoojiye.com`
- Application role: `AGOOJIYE_SUPER_ADMIN`
- Tenant role: `SUPER_ADMIN`
- Password: created only through a one-use setup link
- MFA: mandatory before the first privileged session

No application or mailbox password is committed, printed by the provisioner,
or returned in normal API responses. Private setup material is written to
`ops/private/`, which is excluded from Git.

Olivier appears as the candidate for
`Responsable / Coordinateur de gestion`. His exact `@agoojiye.com` address
must be entered by the super-administrator before invitation. Legal,
financial, technical and management-confidential access is denied by default.

## Authentication and Security

WorkOS privileged authentication uses:

1. Email and bcrypt password verification.
2. Tenant membership and active AGOOJIYE profile verification.
3. A ten-minute, one-use MFA challenge.
4. TOTP secrets encrypted at rest with AES-256-GCM.
5. Ten one-use recovery codes stored only as SHA-256 hashes.
6. A dedicated WorkOS session record tied to the bearer session.
7. Eight-hour privileged sessions by default.

An ordinary global platform session cannot open AGOOJIYE administration.
Privileged WorkOS middleware requires the tenant membership, profile,
privileged role, a non-revoked WorkOS session and an MFA verification
timestamp.

Users can inspect active WorkOS sessions, revoke one session, or revoke every
other session. Login, MFA, recovery, session revocation, administrative
changes, offboarding, imports and HOWJI actions write security events.

Only the principal super-administrator can create a global AGOOJIYE
administrator, invite Olivier, perform offboarding, approve sensitive HOWJI
actions or grant emergency compliance access to a private conversation.

Emergency private-message access also requires the already verified MFA
session, a detailed reason, a target, a duration of 5 to 60 minutes and an
immutable security event. It does not create permanent visibility.

## Data Classification

Private operational records use these classifications:

1. `PUBLIC`
2. `INTERNAL`
3. `DEPARTMENT_ONLY`
4. `PROJECT_RESTRICTED`
5. `MANAGEMENT_CONFIDENTIAL`
6. `LEGAL_FINANCIAL_RESTRICTED`
7. `SUPER_ADMIN_RESTRICTED`

Unknown labels fail closed. Department records require the same department;
project-restricted records require project membership; restricted classes
require the corresponding access level. The checks are applied to server
queries and the governed assistant, not only to hidden UI controls.

## Offboarding

The Binta offboarding operation is idempotent and preserves attribution:

- profile becomes `Ancien membre`;
- application account, tenant roles, sessions, channel memberships, project
  memberships and push subscriptions are revoked;
- historical messages, documents and audit records remain unchanged;
- active tasks become unassigned with state `À réattribuer`;
- a vacancy is created;
- the mailbox is retained rather than deleted, and its login password is
  rotated when docker-mailserver is available.

The same guarded behavior is exposed for future departures from the
administrative People module.

## Worker Import

`/admin/people/import` accepts CSV, XLS and XLSX files up to 5 MB and 1,000
rows. The flow is intentionally two-phase:

1. Upload and infer or supply column mapping.
2. Validate required fields and `@agoojiye.com` email addresses.
3. Detect database and in-file duplicates.
4. Preview every row without writing accounts.
5. Confirm the stored preview before its 24-hour expiry.
6. Create the application identity, tenant role, profile, department,
   manager relation and one-use setup link.
7. Optionally provision the physical mailbox when docker-mailserver is
   available.
8. Download the result CSV.

Imports cannot create global administrators. That operation has its own
super-admin-only endpoint.

## HOWJI

HOWJI is configured as:

`HOWJI — Agent IA de coordination et de relance`

It uses `Africa/Porto-Novo`, creates internal overdue/blocker/staleness
summaries, notifies management, and keeps an action journal. Re-running the
daily report is idempotent unless an administrator explicitly forces it.

Internal, low-risk coordination may be approved automatically. External,
financial, legal, public, destructive or permission-changing actions stay
blocked in `awaiting_approval` until the principal super-administrator
approves them. The current implementation records approval; a separate
audited executor must be connected before any external side effect is
enabled.

## PWA and Limited Connectivity

The dedicated manifest starts at `/workspace`. The service worker caches the
application shell and static assets, handles install/update lifecycle and
opens push notifications in WorkOS.

Offline private writes are deliberately not claimed. A future implementation
must use encrypted local storage, signed idempotent mutations, explicit
conflict resolution and a visible synchronization state.

## Environment

Required production values:

```dotenv
AGOOJIYE_APP_URL=https://agoojiye.com
AGOOJIYE_WORKOS_URL=https://agoojiye.com/workspace
AGOOJIYE_SUPER_ADMIN_EMAIL=vs@agoojiye.com
AGOOJIYE_MFA_ENCRYPTION_KEY=<at-least-32-random-bytes>
AGOOJIYE_PRIVILEGED_SESSION_HOURS=8
AGOOJIYE_WORKOS_SESSION_HOURS=168
AGOOJIYE_WORKER_IMPORT_MAX_MB=5
AGOOJIYE_HOWJI_TIMEZONE=Africa/Porto-Novo
AGOOJIYE_WEBMAIL_URL=https://mail.agoojiye.com/
AGOOJIYE_MAILBOX_VS_PASSWORD=<deployment-secret-only>
```

Keep the existing VAPID, mobility, ticket-signing, database, SMTP and provider
variables from `.env.example`.

## Database and Provisioning

Back up PostgreSQL first, then apply the additive WorkOS migration. The
existing AGOOJIYE OS tables must already be present from the platform release:

```powershell
psql "$env:DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/20260725_agoojiye_workos.sql
npm run seed:agoojye:os
npm run provision:agoojye:workos
```

The provisioner is idempotent for the super-admin, profile, tenant role,
Olivier vacancy, HOWJI configuration and channel. It creates a fresh one-use
password setup link and stores it privately. It provisions `vs@agoojiye.com`
only when docker-mailserver is available and does not reset an existing
mailbox unless `--reset-existing-mailbox` is explicitly passed.

## Verification

Run:

```powershell
node --max-old-space-size=6144 ./node_modules/typescript/bin/tsc --noEmit
node --import ./scripts/spawn-debug.mjs --loader ./scripts/ts-loader.mjs --test tests/agoojye-os.test.ts tests/agoojye-workos.test.ts
npm run build
```

Production smoke checks:

1. Public home, trip booking, tickets and commercial forms still answer.
2. Webmail and `/mail/password` still answer.
3. `/workspace/connexion` answers in French.
4. An unauthenticated member bootstrap returns `401`.
5. A privileged non-MFA session returns `MFA_REQUIRED`.
6. The principal setup link sets the password but does not create a bypass
   session.
7. MFA enrollment displays recovery codes once.
8. `/admin/command-center` opens only after MFA.
9. Worker import preview writes no account.
10. Duplicate worker emails are rejected.
11. HOWJI external actions remain blocked pending approval.
12. PWA manifest starts at `/workspace`.

## Deployment and Rollback

Use the existing tenant release scripts. They back up the database and current
files before switching the release symlink:

```bash
bash scripts/ops/create-release-artifact.sh agoojye --build
bash scripts/ops/deploy-release.sh agoojye --skip-create
```

Rollback the application with:

```bash
bash scripts/ops/rollback-release.sh agoojye
```

The WorkOS migration is additive. If an application rollback is required,
leave its tables and columns in place; the previous application ignores them.
Only remove WorkOS data through a separately reviewed retention migration.

No new DNS record is required because WorkOS is served below
`https://agoojiye.com`. Keep the existing web and mail records documented in
`docs/AGOOJIYE_DNS_DEPLOYMENT.md` and
`docs/AGOOJIYE_EMAIL_DNS_AND_MAILBOXES.md`.
