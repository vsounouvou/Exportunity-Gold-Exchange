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
- `client/src/pages/agoojye/AgoojiyeBookingPages.tsx`: checkout, ticket, lookup, and controller.
- `client/src/pages/agoojye/AgoojiyeCommercialPages.tsx`: group, demonstration, order, waitlist, and contact flows.
- `client/src/pages/agoojye/AgoojiyeThreeExperience.tsx`: interactive 3D viewer.
- `client/src/pages/agoojye/AgoojiyeMobilityAdmin.tsx`: operations dashboard.

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
AGOOJIYE_EMAIL_PROVIDER=roundcube
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
```

Run all integration tests:

```powershell
npm run test:integration
```

Run Playwright:

```powershell
npm run test:e2e
```

Critical coverage includes trip search, seat capacity, payment transitions, opaque QR payloads, duplicate boarding prevention, and database/transaction guards against double booking.

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

## Admin Access

Sign in at `/admin`. An authenticated AGOOJIYE administrator is redirected to `/admin/mobilite`.

Operational routes include `/admin/bus`, `/admin/trajets`, `/admin/horaires`, `/admin/voyages`, `/admin/reservations`, `/admin/billets`, `/admin/paiements`, `/admin/reservations-bus`, `/admin/demonstrations`, `/admin/commandes-bus`, and `/admin/liste-prioritaire`.

The backend independently applies `ensureTenantAdmin`; hiding controls in the browser is not treated as authorization. The controller page `/controle` uses the staff guard and is designed for phones and tablets.

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

Adapters should receive a booking/ticket ID, load approved data server-side, record delivery status, retry temporary failures with limits, and never log access tokens or message-provider secrets.

## Deployment

1. Back up PostgreSQL.
2. Set production environment variables, especially the ticket signing secret.
3. Apply `20260712_agoojiye_mobility_platform.sql` with `ON_ERROR_STOP=1`.
4. Run `npm run seed:agoojye:mobility`.
5. Run the mobility tests and `npm run build`.
6. Deploy the generated client/server release with the existing VPS procedure.
7. Verify `/api/agoojye/mobility/bootstrap`, the complete demo booking journey, ticket QR rendering, duplicate validation, commercial form persistence, admin authorization, `robots.txt`, and `sitemap.xml`.
8. Keep demo payments enabled until a real provider and signed webhooks are verified.

## Known Production Requirements

- Replace indicative bus specifications with engineering-approved values.
- Supply and optimize the final GLB model.
- Connect a licensed payment provider and verified webhooks.
- Configure transactional email/SMS/WhatsApp adapters and delivery monitoring.
- Add a scheduled job that releases expired holds even when no API request occurs.
- Complete legal approval for fares, cancellation policy, privacy retention, accessibility, and ticket conditions.
- Monitor database indexes, payment failures, QR validation conflicts, and abandoned bookings.
