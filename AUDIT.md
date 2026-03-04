# MindBase Launch Audit (Section A, Read-Only)

Date: 2026-02-27  
Repo: `Exportunity-Gold-Exchange`  
Scope: MindBase app + shared Zone/Exportunity components that affect MindBase launch readiness.

## A1) Repo + Runtime Audit

### Stack identification
- Frontend framework:
  - React 18 + Vite 5 SPA (`client/`, `vite.config.ts`)
  - Routing via `wouter` (`client/src/App.tsx`)
  - Data/query via TanStack Query (`client/src/lib/queryClient.ts`)
- Backend framework:
  - Node + Express (`server/index.ts`, `server/routes.ts`)
- Database + migrations:
  - PostgreSQL + Drizzle ORM (`db/index.ts`, `db/schema.ts`)
  - SQL migration files under `db/migrations/*.sql`
  - Drizzle config in `drizzle.config.ts`
- Auth flow:
  - ECE session-token auth (opaque token in `ece_sessions`) for most app APIs
  - MindBase JWT access/refresh auth for `/api/mindbase/auth/*` (`server/lib/mindbase/jwt.ts`)
  - Frontend stores token in `localStorage` (`client/src/lib/session.tsx`)
- Multi-tenant logic:
  - Tenant resolved by host or header in middleware (`server/index.ts`)
  - Tenant defaults + feature flags (`server/lib/tenants.ts`)
  - MindBase host mode: `mindbase.cloud`, plus local `/mindbase/*` path fallback (`client/src/App.tsx`, `server/index.ts`)
- Settings storage:
  - Tenant-scoped key/value via settings helpers (`server/lib/settings.ts`, used by `server/routes/settings.ts`)
  - FX overrides stored under `fx.overrides` per tenant scope (`server/lib/fx.ts`)
- i18n helpers:
  - Primary buyer-facing translations in `LocaleContext` (`client/src/contexts/LocaleContext.tsx`)
  - Marketplace product localization fallback in backend (`server/routes/marketplace.ts`, `localizeSellerProduct`)
- FX provider logic:
  - Shared FX snapshot service (`server/lib/fx.ts`)
  - Used in marketplace/gold/payment conversion paths (partially unified)
- Admin dashboard + RBAC:
  - Frontend route guard: `ProtectedRoute` only checks authenticated session (`client/src/App.tsx`)
  - Backend role enforcement on admin APIs via `ensureTenantAdmin` (`server/routes/utils/auth.ts`)

### Architecture diagram (text)
1. Browser (MindBase/Zone/Exportunity host)
2. Vite-built SPA shell (`client/index.html`) + runtime branding switch by hostname
3. Express app (`server/index.ts`)
4. Tenant resolution middleware (host/header -> tenant)
5. Route layer:
   - MindBase: `server/routes/mindbase.ts`
   - Marketplace/FX/settings/public/etc
6. Data/services:
   - Drizzle ORM -> Postgres
   - FX service (`server/lib/fx.ts`)
   - Wallet, email, AI providers
7. Static + SEO:
   - `serveStatic` injects runtime SEO head (`server/lib/seo/runtimeSeo.ts`)
   - `robots.txt` + `sitemap.xml` served by `server/routes/public.ts`

### Key routes by tenant

MindBase tenant (`mindbase.cloud` or `/mindbase/*` fallback):
- Public:
  - `/mindbase` (landing)
  - `/mindbase/discover` (agent listing)
  - `/mindbase/i/:slug` (agent detail)
  - `/mindbase/c/:slug` (creator profile)
  - `/mindbase/pricing`
  - `/mindbase/docs/api`
- Host aliases on MindBase domain:
  - `/discover`, `/studio`, `/workspaces`, `/i/:slug`, `/c/:slug`
- API:
  - `/api/mindbase/auth/*`
  - `/api/mindbase/discover`
  - `/api/mindbase/intellects/:slug`
  - `/api/mindbase/studio/*`
  - `/api/mindbase/workspaces/*`

Zone/Exportunity shared routes that affect MindBase behavior:
- `/api/admin/settings/fx`, `/api/admin/settings/fx/refresh`
- `/api/marketplace/fx-rates`
- `/robots.txt`, `/sitemap.xml`
- Runtime SEO head injection for all SPA routes

### Critical shared modules (high regression impact)
- `server/index.ts`: tenant resolution, host behavior, static serving pipeline
- `client/index.html`: host-based branding, manifest/favicon switching
- `server/lib/seo/runtimeSeo.ts`: canonical/robots/meta defaults
- `client/src/contexts/LocaleContext.tsx`: global language/currency behavior
- `server/lib/fx.ts`: conversion truth source
- `client/src/lib/queryClient.ts`: auth headers + forced tenant behavior
- `server/routes/utils/auth.ts`: auth/RBAC primitives

### Broken/fragile spots found (with evidence)
1. Locale precedence does not exactly match launch policy
   - Evidence: `client/src/contexts/LocaleContext.tsx` `resolveInitialLocaleState()`
   - Current flow is `browser -> geo -> legacy storage -> manual -> url`
   - Required flow is `url -> manual -> geo -> browser` (without storage overriding intent)

2. Country map is incomplete for required launch countries
   - Evidence: `client/src/contexts/LocaleContext.tsx` `COUNTRY_LOCALE_MAP`
   - `KE => en/KES` is missing.

3. FX unification is partial; legacy hardcoded fallback usage remains
   - Evidence: `server/routes/gold-exchange.ts` uses saved `fxRate*` and literal fallbacks (`615`, `0.92`, `3.67`) in conversions.
   - Shared `effectiveRates` exists but not consistently used in all conversion paths.

4. Seeded admin identity requirements for MindBase are not implemented
   - Evidence:
     - Default seeding still targets `admin@exportunity.local` in `server/lib/seed-demo-data.ts`
     - No explicit seeding for `vitalsounouvou2025@gmail.com`, `vs@exportunity.net`, `demo@mindbase.ai`.

5. Password setup token flow is missing
   - Evidence:
     - No `password_setup_tokens` table in schema/migrations
     - No `/setup-password` route or `/api/auth/setup-password` endpoint
     - No `/api/admin/users/:id/regenerate-setup-link` endpoint

6. MindBase SEO coverage is incomplete
   - Evidence:
     - `server/lib/seo/runtimeSeo.ts` route maps do not include MindBase routes.
     - `server/routes/public.ts` sitemap currently lists Zone/marketing paths, not MindBase published agents/mindbases.

7. Branding inconsistency for MindBase shell
   - Evidence:
     - Base title defaults to `Zone - Exportunity` in `client/index.html`.
     - `manifest.webmanifest` is Zone-branded by default.
     - Required favicon variants (`favicon-16x16.png`, `favicon-32x32.png`, `android-chrome-*`) are not present at root.

8. UI guard for admin pages is auth-only, not role-aware
   - Evidence: `ProtectedRoute` in `client/src/App.tsx` checks only session presence.
   - Backend still enforces admin on APIs, but frontend navigation surface is overly broad.

9. Public discover payload leaks internal user id field
   - Evidence: `/api/mindbase/discover` returns `creator.user_id` in `server/routes/mindbase.ts`.
   - This is not needed for public cards and can expose internal IDs.

10. Encoding corruption in user-visible text exists in multiple files
   - Evidence:
     - `client/src/pages/AdminFxSettingsPage.tsx` contains mojibake (`â€”`, `â€¦`)
     - `server/lib/seo/runtimeSeo.ts` has corrupted accented strings (`Exportunity â€” ...`, `conformitÃ©`)

## A2) User Journey Audit (Code + endpoint behavior review)

### Public flows

1. Home / landing
- Expected: MindBase host should show MindBase landing.
- Actual: Works via host gate (`client/src/App.tsx` `RootPublicRoute`), fallback root defaults to Zone when not on MindBase host.

2. Explore agents listing
- Expected: `/explore`-style entry for agent discovery.
- Actual: MindBase listing exists at `/mindbase/discover` and host alias `/discover`.
- Gap: canonical `/explore` route not present.

3. Agent detail
- Expected: public detail page with hire action.
- Actual: Available at `/mindbase/i/:slug` and `/i/:slug` on MindBase host.

4. Pricing
- Expected: public pricing page.
- Actual: Available at `/mindbase/pricing`; also host-aware `/pricing`.

5. Docs/API
- Expected: public docs route.
- Actual: Available at `/mindbase/docs/api` and host-aware `/docs/api`.

### Auth flows

1. Sign in
- Expected: reliable login route.
- Actual: `/login` uses `ECELoginPage` and posts to `/api/ece/auth/login`.

2. Sign up
- Expected: registration available.
- Actual: `/register` maps to same page and application wizard supports account creation path.

3. Forgot password / first-time password setup
- Expected: one-time setup/reset flow.
- Actual: Missing for MindBase launch requirements; only change-password endpoint exists for signed-in users.

### Onboarding wizard flow (email/phone -> name -> role -> completion)
- Expected: structured multistep onboarding wizard.
- Actual: Implemented in `client/src/pages/ECELoginPage.tsx` via `ChatFormWizard` with `contact`, `fullName`, `role`, then role-dependent steps.

### Dashboard flows

1. Creator dashboard
- Expected: creator can build profile, mindbase, and first agent.
- Actual: Implemented in `client/src/pages/mindbase/MindbaseStudioPage.tsx` with profile + agent creation + publish links.

2. Admin dashboard
- Expected: role-gated admin tools.
- Actual: Dashboard exists; backend API role gates exist; frontend route protection is session-only (fragile UX access surface).

3. Navigation integrity
- Expected: no dead links in MindBase paths.
- Actual:
  - MindBase core paths are wired.
  - Some naming inconsistency remains (`discover` vs requested `explore`).

### Core MVP flows

1. Create mindbase
- Actual: via profile save in studio (`/api/mindbase/studio/profile`).

2. Create agent
- Actual: `/api/mindbase/studio/intellects` from studio UI.

3. Upload knowledge
- Actual: multipart upload endpoint exists with file-type/size constraints (`/api/mindbase/studio/intellects/:id/knowledge`).

4. Chat with agent
- Actual: `/api/mindbase/intellects/:id/chat` from detail page.

5. Hire flow
- Actual: “Hire / Send” is chat invocation; no separate contract/checkout hire transaction in MindBase scope.

### Admin settings and role-gated actions
- FX admin endpoints and UI page are present.
- MindBase moderation and credits endpoints are present; most high-impact actions enforce tenant admin/mindbase roles.

### Largest performance bottlenecks (observed hotspots)
1. `client/src/pages/BuyerHomePage.tsx` is very large (5k+ lines), many responsibilities in one component.
2. `client/src/contexts/LocaleContext.tsx` is very large (1.8k+ lines), mixes translations, locale logic, and FX formatting.
3. `client/src/App.tsx` is very large route registry with many protected pages in one file.
4. Broad `queryClient.invalidateQueries()` usage on locale updates can trigger expensive global refetches.

## A3) Tech Health Audit

### Environment variables used/missing
- Used in code:
  - MindBase JWT secrets, upload limits, rate limits (`server/routes/mindbase.ts`)
  - FX provider/cache/drift vars (`server/lib/fx.ts`)
- Gap:
  - `.env.example` currently does not document MindBase auth vars or FX provider vars.

### Build pipeline
- Commands executed:
  - `npm run check` -> pass
  - `npm run test:unit` -> pass
  - `node --import ./scripts/spawn-debug.mjs --loader ./scripts/ts-loader.mjs --test tests/mindbase-prompting.test.ts` -> pass

### Database migrations health
- Migration set is extensive and additive.
- No single migration orchestration verification was run in this audit because local DB bootstrap was not executed in this pass.
- Existing runbook references direct `psql` for specific migrations, indicating mixed migration operational model.

### Production config health
- Docker:
  - `docker-compose.yml` defines `bdo-app` only; postgres is external.
  - No explicit app healthcheck in compose.
  - App startup depends on DB availability at runtime.
- Nginx:
  - Main reverse proxy config is not fully represented in repo (limited deploy snippets only).

### Logging and secret handling
- Positive:
  - Login failure logs mask emails.
  - Seed logging avoids printing raw passwords.
- Risk:
  - Session/access tokens are stored in browser `localStorage` (XSS-sensitive).

### Security basics
- Auth protection:
  - Most admin write endpoints use `ensureTenantAdmin`.
  - MindBase uses auth checks + role checks on protected routes.
- Admin-only enforcement:
  - Backend largely enforced.
  - Frontend `ProtectedRoute` does not enforce admin role (UX-level exposure).
- Rate limiting:
  - MindBase auth/chat endpoints have in-memory rate limiting.
  - ECE login endpoint lacks comparable rate limiting guard.
- Upload sanitization:
  - MindBase knowledge upload enforces size + allowed MIME/extensions + filename sanitization.
  - No malware scanning pipeline observed in current flow.

---

## Audit conclusion (Section A)
- MindBase foundation is present and functional for MVP paths.
- High-priority launch gaps remain in:
  1. Locale precedence correctness + KE mapping
  2. Full FX unification
  3. Seeded admin + password setup-token flow
  4. MindBase SEO and sitemap/robots coverage
  5. MindBase branding/favicon consistency
- No code changes beyond this audit document were applied in Section A.
