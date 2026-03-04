# Tenant Leak Audit (A2)

Date: 2026-02-28

## Tenant Resolution Surfaces

### Client
- Tenant resolution source of truth: `client/src/lib/tenantResolution.ts`
  - Precedence now enforced as: `host/subdomain -> signed session token -> API tenant key -> bdo fallback`.
  - Host is authoritative; local storage is not allowed to override host tenant.
- Tenant provider: `client/src/lib/tenant.tsx`
  - Uses resolved tenant key from host/session/API merge.
- Tenant guard: `client/src/components/TenantGuard.tsx`
  - Blocks rendering while tenant resolves.
  - Clears tenant-scoped query cache and tenant-scoped browser state on tenant switch.

### Server
- Tenant resolution middleware: `server/index.ts`
  - Resolves tenant from forwarded host/host.
  - Sets `req.tenant` and `req.tenant_id`.

## Nav and Route Registration Surfaces

- Route guard in app shell: `client/src/App.tsx`
  - Protected routes are blocked with `isTenantRouteAllowed(path, tenant.key)`.
- Sidebar/menu filtering: `client/src/components/AdminLayout.tsx`
  - Sidebar items are filtered by `isTenantRouteAllowed(item.path, tenant.key)`.
- Tenant route policy registry: `client/src/lib/tenantPolicy.ts`
  - Central policy map for route prefixes and tenant allowlists.

## Leakage Entrypoints Found

1. `client/src/lib/tenantPolicy.ts`
- Root cause: permissive default path fallback allowed cross-tenant backoffice paths to pass policy checks.
- Impact: Mindbase could render unrelated admin modules when route prefixes were not explicitly mapped.

2. `server/routes.ts` channel endpoints
- Root cause: company/channel routes accepted `companyId` without verifying ownership against `req.tenant.id`.
- Impact: cross-tenant reads/writes were possible when a valid foreign `companyId` was supplied.

3. `server/routes.ts` room bootstrap (`ensureChannelChatRoom`)
- Root cause: channel room metadata did not enforce/repair `tenantId` in metadata.
- Impact: tenant scoping for conversation lookups and message isolation could drift.

4. `server/routes.ts` background conversation room queries
- Root cause: room list queries filtered by `companyId` only, not by tenant metadata.
- Impact: background tabs could merge records across tenants.

5. `server/routes.ts` memories APIs
- Root cause: `/api/memories*` endpoints were mock and not tenant-scoped.
- Impact: no enforceable tenant/Tassi memory boundaries.

## Fixes Applied

1. Tightened client route policy (`client/src/lib/tenantPolicy.ts`)
- Expanded backoffice-safe deny-by-default prefixes for non-Mindbase tenants.
- Mindbase is now excluded from non-explicit backoffice path families.

2. Added tenant/company guard for channel APIs (`server/routes.ts`)
- Added `requireTenantScopedCompany()` and wired it into:
  - `GET /api/companies/:companyId/channels`
  - `GET /api/companies/:companyId/channels/:channelId/messages`
  - `POST /api/companies/:companyId/channels/:channelId/attachments`
  - `POST /api/companies/:companyId/channels/:channelId/voice-notes`
  - `POST /api/companies/:companyId/channels/:channelId/messages/:messageId/voice-transcribe`
  - `POST /api/companies/:companyId/channels/:channelId/messages`
  - `GET /api/companies/:companyId/channels/:channelId/conversation`

3. Tenant-bound channel room metadata (`server/routes.ts`)
- `ensureChannelChatRoom` now requires `tenantId` and stores `metadata.tenantId`.
- Added best-effort metadata repair for legacy rooms missing/mismatching tenant metadata.

4. Background room tenant filtering (`server/routes.ts`)
- Added `metadata.tenantId = req.tenant.id` constraints to background room fetches for channel message/conversation APIs.

5. Replaced mock memories with scoped retrieval (`server/routes.ts`)
- Implemented scoped logic for `/api/memories`, `/api/memories/search`, `/api/memories/upload`, `/api/memories/:agentId/export`, `/api/memories/backup`, `/api/memories/:agentId/compress`.
- Enforced policy:
  - non-Tassi: tenant-scoped conversation + optional tenant memory only.
  - Tassi: conversation memory for current tenant context + GLOBAL memory store.
- Introduced shared memory policy helpers: `server/lib/memory/scoping.ts`.

6. Dev runtime tenant assert (`server/routes.ts`)
- Added dev-only stack-trace assert for tenant-scoped company resolution path to flag missing tenant context during scoped query entry.

