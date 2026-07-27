# AGOOJIYE Mobility Platform

AGOOJIYE is a French-first electric mobility platform from Benin. It combines the public electric-bus brand, passenger ticketing, group mobility requests, fleet inquiries, an interactive 3D experience, boarding control, and a protected operations dashboard.

The passenger journey is intentionally short:

1. Choose a trip.
2. Choose seats.
3. Pay.
4. Receive QR tickets.

The commercial journey is: choose a need, submit the request, and receive a response from AGOOJIYE.

## Architecture

- Frontend: React 18, Vite, Wouter, TanStack Query, Tailwind CSS.
- Backend: Express, Zod validation, Drizzle ORM.
- Database: PostgreSQL, tenant-isolated with `tenant_id` on every mobility table.
- Authentication: existing ECE bearer sessions and server-side admin/staff guards.
- Tickets: opaque signed tokens and server-generated QR images.
- 3D: lazy-loaded Three.js procedural placeholder with a static image fallback.
- Payments: provider abstraction with an explicit demo provider by default.
- Tests: Node test runner for domain logic and Playwright for browser journeys.

Important modules:

- `db/schema/agoojye-mobility.ts`: mobility tables and constraints.
- `server/routes/agoojye-mobility.ts`: public, staff, and admin mobility APIs.
- `server/lib/agoojye/mobility-domain.ts`: tested business rules.
- `client/src/pages/agoojye/AgoojiyeMobilityPages.tsx`: homepage, trips, and bus catalog.
- `client/src/pages/agoojye/AgoojiyeBookingPages.tsx`: checkout, ticket, and lookup.
- `client/src/pages/agoojye/AgoojiyeControllerPage.tsx`: protected phone/tablet boarding control.
- `server/lib/agoojye/assistant.ts`: scoped search, provider timeout/fallback, and read-only AI formulation.
- `client/src/pages/agoojye/AgoojiyeCommercialPages.tsx`: group, demonstration, order, waitlist, and contact flows.
- `client/src/pages/agoojye/AgoojiyeThreeExperience.tsx`: interactive 3D viewer.
- `client/src/pages/agoojye/AgoojiyeMobilityAdmin.tsx`: operations dashboard.
- `server/lib/agoojye/pipelineImport.ts`: validated CSV/XLSX parsing, mapping, preview, and duplicate rules.
- `server/lib/agoojye/mailBridge.ts`: five-mailbox indexing and unified CRM inbox synchronization.
- `server/lib/agoojye/emailSettingsPolicy.ts`: rejects stored SMTP secrets and redacts the legacy database field.

## Local Installation

Requirements:

- Node.js 20 or newer.
- PostgreSQL 15 or newer.
- npm.

Install dependencies:

```powershell
npm install
Copy-Item .env.example .env
```

Set at minimum `DATABASE_URL`, the existing session/authentication secrets, and the AGOOJIYE variables described below.

## Environment Variables

The complete template is in `.env.example`. Mobility-specific settings are:

```dotenv
AGOOJIYE_APP_URL=https://agoojiye.com
AGOOJIYE_DEFAULT_CURRENCY=XOF
AGOOJIYE_BOOKING_HOLD_MINUTES=15
AGOOJIYE_TICKET_SIGNING_SECRET=replace_with_a_long_random_secret
AGOOJIYE_PAYMENT_PROVIDER=demo
AGOOJIYE_DEMO_PAYMENT_MODE=true
AI_ENABLED=true
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
AGOOJIYE_ASSISTANT_MODE=hybrid
AGOOJIYE_ASSISTANT_PROVIDER=auto
AGOOJIYE_ASSISTANT_TIMEOUT_MS=8000
AGOOJIYE_OPENAI_MODEL=gpt-4o-mini
AGOOJIYE_ANTHROPIC_MODEL=claude-sonnet-4-5
AGOOJIYE_EMAIL_PROVIDER=roundcube
AGOOJIYE_SMTP_HOST=mail.agoojiye.com
AGOOJIYE_MAILBOX_REGIS_PASSWORD=
AGOOJIYE_MAILBOX_SORIANE_PASSWORD=
AGOOJIYE_MAILBOX_MARYSE_PASSWORD=
AGOOJIYE_MAILBOX_CHRISTIAN_PASSWORD=
AGOOJIYE_MAILBOX_VITAL_PASSWORD=
AGOOJIYE_SMS_PROVIDER=disabled
AGOOJIYE_WHATSAPP_PROVIDER=disabled
AGOOJIYE_SUPPORT_PHONE=+2290100000000
AGOOJIYE_SUPPORT_EMAIL=support@agoojiye.com
AGOOJIYE_3D_MODEL_URL=
```

Never reuse the example signing secret in production. The QR token contains no passenger data; it is an opaque bearer token.

## Database Setup

For a local development database, synchronize the Drizzle schema:

```powershell
npm run db:push
```

For a controlled deployment, apply the versioned migration:

```powershell
psql $env:DATABASE_URL -v ON_ERROR_STOP=1 -f db/migrations/20260712_agoojiye_mobility_platform.sql
psql $env:DATABASE_URL -v ON_ERROR_STOP=1 -f db/migrations/20260718_agoojiye_email_secret_guard.sql
psql $env:DATABASE_URL -v ON_ERROR_STOP=1 -f db/migrations/20260718_agoojiye_research_sources.sql
psql $env:DATABASE_URL -v ON_ERROR_STOP=1 -f db/migrations/20260718_agoojiye_sequence_enrollments.sql
```

The seat inventory has a database-level unique constraint on `(tenant_id, trip_id, seat_number)`. Seat holds also use conditional updates inside a transaction, so two customers cannot acquire the same available seat.

## Seed Data

Seed the AGOOJIYE tenant after the migration:

```powershell
npm run seed:agoojye:mobility
```

The idempotent seed creates:

- 3 clearly identified demo bus models.
- 4 Beninese routes.
- At least 12 upcoming trips.
- Per-trip seat inventories.
- Confirmed, pending, and failed demo bookings.
- Sample QR tickets and demo payments.
- Sample full-bus, demonstration, fleet-order, and waitlist records.

The public bootstrap endpoint also runs this idempotent seed, which keeps demo environments usable. Official names and validated technical data are not overwritten.

## Development

```powershell
npm run dev
```

The Express server serves the Vite application. Use an AGOOJIYE-recognized host or local tenant routing so `req.tenant.key` resolves to `agoojye`.

## Build

```powershell
npm run build
```

The build verifies route registration, lazy page imports, the Vite client bundle, and the bundled Express server. Three.js is emitted as a separate lazy chunk and is not loaded on the homepage.

## Tests

Run the mobility domain tests:

```powershell
node --import ./scripts/spawn-debug.mjs --loader ./scripts/ts-loader.mjs --test tests/agoojye-mobility.test.ts
node --import ./scripts/spawn-debug.mjs --loader ./scripts/ts-loader.mjs --test tests/agoojye-pipeline-import.test.ts
```

Run all integration tests:

```powershell
npm run test:integration
```

Run Playwright:

```powershell
npm run test:e2e
```

To audit the deployed AGOOJIYE tenant with the locally installed Google Chrome instead of Playwright's bundled Chromium:

```powershell
$env:E2E_BASE_URL = "https://agoojiye.com"
$env:E2E_CHROME_CHANNEL = "chrome"
npx playwright test --project=chromium tests/e2e/agoojye-mobility.spec.ts
```

Critical coverage includes trip search, seat capacity, payment transitions, opaque QR payloads, duplicate boarding prevention, and database/transaction guards against double booking.

The team assistant is tested separately in `tests/agoojye-os.test.ts`: natural French search terms, relevance ordering, provider fallback, and the deterministic local response. It never sends messages or changes records.

## Public Routes

- `/` mobility homepage and quick search.
- `/reserver` and `/trajets` trip search.
- `/trajets/:id` trip details.
- `/reservation/sieges`, `/reservation/passagers`, `/reservation/paiement` checkout.
- `/reservation/confirmation/:reference` confirmation.
- `/billet/:token` mobile/print ticket.
- `/retrouver-ma-reservation` secure lookup.
- `/bus` and `/bus/:slug` catalog.
- `/experience-3d` interactive viewer.
- `/reserver-un-bus`, `/demonstration`, `/commander` commercial requests.
- `/liste-prioritaire`, `/a-propos`, `/contact`, `/faq` supporting pages.

## AGOOJIYE OS

The private company operating system is available under `/os`. It shares the
AGOOJIYE tenant, users, mobility operations, CRM, documents, meetings, tasks,
audit log, and governed AI-agent directory with the public platform.

Initial team access is restricted to:

- `vital@agoojiye.com`
- `regis@agoojiye.com`
- `soriane@agoojiye.com`
- `maryse@agoojiye.com`
- `christian@agoojiye.com`

Apply `20260725_agoojiye_os.sql`, then create the team records and one guarded
invitation link:

```powershell
npm run seed:agoojye:os
```

The command prints the join URL once. The invitation token is stored only as a
SHA-256 hash, accepts only the listed official addresses, has a configurable
expiry and use limit, and activates one password-based account per team member.
The French-first PWA manifest is `/manifest-agoojiye-os.webmanifest`; Web Push
is enabled only when the three `AGOOJIYE_VAPID_*` variables are configured.
See `docs/AGOOJIYE_OS.md` for architecture, roles, access policy, operations,
and the deliberately limited offline behavior.

## Admin Access

Sign in at `/admin`. An authenticated AGOOJIYE administrator is redirected to `/admin/mobilite`.

Operational routes include `/admin/bus`, `/admin/trajets`, `/admin/horaires`, `/admin/voyages`, `/admin/reservations`, `/admin/billets`, `/admin/paiements`, `/admin/reservations-bus`, `/admin/demonstrations`, `/admin/commandes-bus`, and `/admin/liste-prioritaire`.

The backend independently applies `ensureTenantAdmin`; hiding controls in the browser is not treated as authorization. The controller page `/controle` uses the staff guard and is designed for phones and tablets.

`CONTROLLER`/`contrôleur` accounts are accepted by the staff guard but do not receive admin access. The controller downloads a short-lived authenticated JSON manifest through the application rather than a public link.

## Demo Payment Flow

The default payment provider is visibly labeled as a demonstration. It can simulate:

- `success`: confirms the booking, sells held seats, and creates one ticket per passenger.
- `pending`: extends the temporary hold and creates no ticket yet.
- `failed`: marks the payment failed and releases held seats.

No real debit is claimed or performed in demo mode.

## Ticket QR Validation

Each ticket receives a random token plus an HMAC signature. The QR points to `/billet/:token`; names, phone numbers, email addresses, and trip details are not embedded in the QR.

At boarding, authorized staff can scan with the browser `BarcodeDetector` API or enter the code manually. Validation checks ticket status, confirmed payment, and selected trip. A successful validation atomically changes the ticket from `active` to `used`; later scans return `already_used`.

The trip manifest endpoint returns a short-lived cacheable snapshot for limited-connectivity consultation. Ticket validation still requires the server. A future offline queue must reconcile signed validation events and conflicts before claiming full offline support.

## Replacing the 3D Placeholder

No validated AGOOJIYE GLB/GLTF model was found in the repository. The current Three.js bus is a procedural visual placeholder, not an engineering model.

1. Add an optimized `.glb` under `client/public/brand/agoojiye/3d/`.
2. Set `AGOOJIYE_3D_MODEL_URL=/brand/agoojiye/3d/model.glb`.
3. Replace the procedural group loader in `AgoojiyeThreeExperience.tsx` with `GLTFLoader`, preserving the existing camera presets, controls, loading/error states, and static fallback.
4. Compress meshes and textures before deployment and test on a common Android device.

## Configuring Routes and Trips

Use `/admin/trajets` for route definitions, `/admin/horaires` for recurring schedules, and `/admin/voyages` for dated trips. A trip references a bus, route, departure, arrival, fare, booking state, and operational status.

When adding a trip through the admin API, create its seat inventory from the assigned bus layout before opening sales. The seeded trips do this automatically.

## Connecting a Real Payment Provider

Keep the public checkout contract and replace the demo handler with a provider adapter that:

1. Creates an external transaction with an idempotency key.
2. Stores only provider references, never raw card or Mobile Money secrets.
3. Verifies signed webhooks server-side.
4. Confirms the booking only after a verified success event.
5. Releases seats on permanent failure or hold expiry.
6. Supports refunds through explicit authorized admin actions.

Set `AGOOJIYE_PAYMENT_PROVIDER` and disable `AGOOJIYE_DEMO_PAYMENT_MODE` only after sandbox and webhook tests pass.

## Email, SMS, and WhatsApp

Delivery adapters are configured independently with `AGOOJIYE_EMAIL_PROVIDER`, `AGOOJIYE_SMS_PROVIDER`, and `AGOOJIYE_WHATSAPP_PROVIDER`. RoundCube is the human webmail interface; application delivery should use authenticated SMTP or the existing mail service, not browser automation.

The AGOOJIYE mail bridge registers the approved human mailboxes (`regis`, `soriane`, `maryse`, `christian`, `vital`, and the separate principal identity `vs`) in the shared mail engine, indexes their Maildir folders, mirrors conversations into the AGOOJIYE CRM inbox, creates external contacts from replies, and records explicit opt-outs or hard bounces in both suppression registries. Administrators can trigger the same operation from `/admin/agoojye/inbox`. Mailbox password variables contain deployment secrets only; leave them blank in source control and inject them through the production environment. Human webmail is available at `https://mail.agoojiye.com/`.

SMTP passwords are never accepted by the AGOOJIYE settings API. The legacy `smtp_password_encrypted` column is cleared and protected by a database constraint; authenticated sends resolve only the five `AGOOJIYE_MAILBOX_*_PASSWORD` environment references on the server.

The sponsor CRM import at `/admin/agoojye/imports` accepts CSV and XLSX files up to 5 MB and 2,000 rows. The administrator selects organizations, contacts, opportunities, or Sponsor Toolbox, reviews inferred column mapping, invalid rows, and database duplicates, then confirms by resubmitting the same file. The server reparses the file, inserts in a transaction, never overwrites an existing dedupe key, stores batch statistics, and writes an audit event.

New outreach approvals always start in `awaiting_approval`. Approval and rejection timestamps are set by the server. An approved item is sent only through `POST /api/admin/agoojye/approvals/:id/send`; the endpoint atomically claims the item, verifies the contact, suppression status, and one of the five human sender identities, invokes authenticated SMTP, and marks it `sent` only after mail-server acceptance. Editing approved content returns it to the approval queue. Public DNS preflight intentionally blocks external sending until SPF and DKIM are correct.

The AGOOJIYE operational queue uses `agoojye_background_jobs` as a tenant-scoped PostgreSQL queue. Due jobs are claimed with `FOR UPDATE SKIP LOCKED`, processed sequentially, retried with bounded exponential backoff, and moved to `dead_letter` after permanent failure or the configured attempt limit. The production scheduler starts only for the `agoojye` tenant when `AGOOJIYE_JOB_WORKER_ENABLED=true`; interval and batch size are controlled by `AGOOJIYE_JOB_WORKER_INTERVAL_MS` and `AGOOJIYE_JOB_WORKER_MAX_BATCH`. Administrators can inspect, cancel, retry, or run due jobs from `/admin/agoojye/jobs`.

Implemented processors cover Maildir synchronization, mailbox health, scheduled approved sends, guarded follow-ups, bounce and complaint suppression, inbound reply classification, pipeline summaries, overdue-task reports, and normalized webhook records. Follow-ups stop before sending when the recipient replied, opted out, bounced, is suppressed, or the opportunity is paused, won, lost, or cancelled. Attachment jobs fail visibly into dead-letter until an external antivirus scanner is configured; no attachment is falsely marked clean.

Outreach sequences are managed at `/admin/agoojye/sequences`. A sequence must move from `draft` to `under_review`, then `approved`, before a separate activation action can enable enrollment. Activation accepts at most five approved templates, a minimum delay of 24 hours, and a daily limit of 20 messages. Enrolling a verified contact creates only the first `awaiting_approval` message. After that message is human-approved and accepted by the mail server, the service transactionally creates the next authorized follow-up and its PostgreSQL job. Enrollment stops and queued messages are cancelled on reply, bounce, complaint, opt-out, suppression, pause, closed opportunity, rejected approval, or manual stop. Reaching a daily limit defers the job without consuming a retry.

The sponsor research workflow at `/admin/agoojye/agent-research` accepts one CRM organization and up to five official public HTTPS sources. Requests use DNS and IP allow-listing, pinned public address resolution, redirect revalidation, a 10-second timeout, and a 1 MB response limit. The server stores each source result, computes a keyword-based category score with its full formula, recommends approved materials, and creates a French draft without claiming sponsor interest. A draft enters `awaiting_approval` only when at least one source was fetched; the research action never sends email.

Adapters should receive a booking/ticket ID, load approved data server-side, record delivery status, retry temporary failures with limits, and never log access tokens or message-provider secrets.

## Deployment

1. Back up PostgreSQL.
2. Set production environment variables, especially the ticket signing secret.
3. Apply `20260712_agoojiye_mobility_platform.sql`, `20260718_agoojiye_email_secret_guard.sql`, `20260718_agoojiye_research_sources.sql`, and `20260718_agoojiye_sequence_enrollments.sql` with `ON_ERROR_STOP=1`.
4. Run `npm run seed:agoojye:mobility`.
5. Run the mobility tests and `npm run build`.
6. Deploy the generated client/server release with the existing VPS procedure.
7. Verify `/api/agoojye/mobility/bootstrap`, the complete demo booking journey, ticket QR rendering, duplicate validation, commercial form persistence, admin authorization, `robots.txt`, and `sitemap.xml`.
8. Keep demo payments enabled until a real provider and signed webhooks are verified.
9. Complete the forward and reverse mail-DNS cutover in `docs/AGOOJIYE_EMAIL_DNS_AND_MAILBOXES.md`, then run `npm run verify:agoojye:mail-dns`.
10. Apply `20260725_agoojiye_os.sql`, configure the optional VAPID keys, and run `npm run seed:agoojye:os` once to create the private team invitation.
11. Apply `20260725_agoojiye_workos.sql` and `20260726_agoojye_single_assistant_identity.sql`, configure `AGOOJIYE_MFA_ENCRYPTION_KEY`, then run `npm run provision:agoojye:workos`.
12. Retrieve the one-use super-admin setup handoff only from the private untracked file, enroll MFA, store recovery codes offline, and verify `/admin/command-center`.

## AGOOJIYE WorkOS

The private team workspace starts at `/workspace`; the MFA-protected
administrative room starts at `/admin/command-center`. WorkOS adds encrypted
TOTP enrollment, one-use recovery codes, tenant-bound privileged sessions,
security events, worker CSV/XLSX import, controlled offboarding, data
classification and the governed `AGOOJIYE — Assistant IA`, whose context adapts
to each worker's role and permissions.

Direct assistant questions are user-triggered and visible. The server retrieves
only records already authorized for that member, sends only the minimal result
titles/statuses to the configured provider, and remains read-only. Prompts and
answers are represented in the audit log by SHA-256 hashes and lengths rather
than raw text. Provider/model/token totals and fallback state are recorded.
`AGOOJIYE_ASSISTANT_MODE=deterministic` disables external formulation without
disabling the local scoped assistant. In `hybrid` mode, an eight-second bounded
provider call falls back to the local answer on timeout or provider failure.

The principal application identity is `vs@agoojiye.com` with
`AGOOJIYE_SUPER_ADMIN`. Its password is never seeded. The provisioner creates a
24-hour one-use setup link under the ignored `ops/private/` directory and
requires MFA before any privileged session is issued.

Complete architecture, environment, import, security, deployment and rollback
instructions are in `docs/AGOOJIYE_OS.md`.

The role-by-role experience review, observed friction and visual acceptance
matrix are maintained in `docs/AGOOJIYE_UX_AUDIT.md`.

## Known Production Requirements

- Replace indicative bus specifications with engineering-approved values.
- Supply and optimize the final GLB model.
- Connect a licensed payment provider and verified webhooks.
- Configure transactional email/SMS/WhatsApp adapters and delivery monitoring.
- Add a scheduled job that releases expired holds even when no API request occurs.
- Connect a production antivirus service before enabling email-attachment processing.
- Complete legal approval for fares, cancellation policy, privacy retention, accessibility, and ticket conditions.
- Monitor database indexes, payment failures, QR validation conflicts, and abandoned bookings.
