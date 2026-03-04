# Launch Checklist (Strict Pass/Fail)

Date: 2026-02-28

## A) Tenant Isolation

- [PASS] Client tenant resolution precedence is host-first and cannot be overridden by localStorage.
- [PASS] App root has TenantGuard and tenant switch cache reset behavior.
- [PASS] Sidebar visibility is tenant-filtered through route policy.
- [PASS] Protected routes are tenant-filtered through route policy.
- [PASS] Channel APIs now enforce company ownership under `req.tenant.id`.
- [PASS] Channel room metadata now carries/repairs `tenantId`.
- [PASS] Background room fetches are tenant-filtered.
- [PASS] Mindbase backoffice leakage closed for non-explicit backoffice paths.
- [PENDING-MANUAL] Cross-domain platform switch deep-link test on real domains (`mindbase.cloud`, `boursedelor.com`, `exportunity.com/.zone`).

## B) Context Scoping (Tassi-only Global)

- [PASS] Memory policy helper implemented (`server/lib/memory/scoping.ts`).
- [PASS] `/api/memories` retrieval now enforces tenant scope for non-Tassi agents.
- [PASS] Only Tassi identity can include GLOBAL scope.
- [PASS] Non-Tassi retrieval blocks cross-tenant access.
- [PASS] Tassi retrieval supports GLOBAL store + current conversation scope.
- [PASS] UI scope indicator added:
  - Chairman dock: `Tassi (Global)` / `Tenant-scoped`
  - Ops active-agent chips: `Tassi (Global)` / `Tenant-scoped`
- [PENDING-MANUAL] Tenant switch chat-tab UX verification to ensure no cross-tenant conversation merge in all tabs.

## C) Actions Reliability

- [PASS] Public action ID flow fixed in assistant queue path (`publicActionId/state` propagated).
- [PASS] Removed `#id` fallback text from assistant feedback in favor of canonical labels.
- [PASS] Conversation action badges now show public action IDs and state.
- [PASS] Action queue cards now show public action ID, state, last error, and admin debug link.
- [PASS] Action evidence gating adjusted to per-action explicit requirement (`requiresEvidence`) with override support.
- [PASS] `OBJECTIVE_CREATE` no longer fails by default for missing evidence.
- [PASS] Added action evidence attach endpoint to unblock pending evidence-required requests:
  - `POST /api/actions/:id/evidence`
  - transitions `PENDING/CREATED -> QUEUED` when satisfied.
- [PASS] Preserved and confirmed existing action runner health endpoint:
  - `GET /api/health/actions-runner`
- [PASS] Preserved and confirmed existing action event log endpoint:
  - `GET /api/admin/actions/:action_id/events`
- [PASS] Existing startup validation behavior retained for Twilio/SMTP configs.

## Automated Verification Executed

Command:
- `node --import ./scripts/spawn-debug.mjs --loader ./scripts/ts-loader.mjs --test tests/tenant-resolution-policy.test.ts tests/memory-scoping.test.ts tests/action-reliability.test.ts tests/messaging-config.test.ts`

Result:
- [PASS] 18 tests passed / 0 failed.

## Manual Go/No-Go

- [ ] Verify mindbase domain shows only mindbase nav groups.
- [ ] Verify bdo domain shows only bdo nav groups.
- [ ] Verify platform switch resets tenant UI state without auth loss.
- [ ] Verify objective creation path with and without evidence requirement flag.
- [ ] Verify SMS/WhatsApp action failure is immediate `MISSING_CONFIG` when env missing.
- [ ] Verify admin debug links open action events timeline.
- [ ] Verify no regressions for existing tenant workflows.
