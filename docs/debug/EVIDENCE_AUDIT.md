# Evidence Audit (2026-02-21)

## Scope
Audit target: action execution truth layer, task creation flows, agent/contact entity usage, workstation provisioning/visibility, chat/event traces, and RBAC + tenant enforcement.

## 1) Current Code Paths

### Action execution + tool/action runner
- Request intake: `server/routes/actions.ts` (`POST /api/actions/request`)
- Action enqueue/policy: `server/lib/actions/ActionRouter.ts` (`createActionRequest`)
- Worker dequeue/execute/finalize: `server/lib/actions/worker.ts` (`runActionWorkerOnce`, `finalize`)
- Worker lifecycle/health: `server/lib/actions/scheduler.ts`, `server/routes/actions.ts` (`GET /api/actions/status`, `GET /api/actions/health`)
- Persistence tables: `action_requests`, `action_results`, `action_receipts` in `db/schema/actions.ts`

### Task creation
- Action worker path: `server/lib/actions/worker.ts` (`CREATE_TASK` handler)
- Additional task systems exist in legacy/feature modules (`server/routes/ece.ts`, `server/routes/task-lifecycle.ts`, etc.)

### Agent vs Contact entities
- Canonical agent entity: `agents` table (`db/schema.ts`)
- Contact entity: `contacts` and tenant link `tenant_contacts`
- Action intent guard: `server/lib/actions/ActionRouter.ts` blocks misrouted agent-like payloads sent to `CREATE_CONTACT` and returns `WRONG_ENTITY_TYPE`
- Agent action types: `CREATE_AGENT`, `BULK_CREATE_AGENTS`, `UPDATE_AGENT_MODEL`, `ASSIGN_AGENT_TO_CONVERSATION`

### Workstations
- Routes: `server/routes/workstations.ts` (mounted from `server/routes.ts`)
- Provider: `server/lib/workstations/provider.ts`
- Table bootstrap: `server/lib/workstations/ensureTables.ts`
- UI list page: `client/src/pages/AdminWorkstationsPage.tsx`

### Chat + meeting model
- Operations center + chat messages: `server/routes.ts` (conversation/message APIs), `db/schema.ts` (`messages`, `chat_rooms`, etc.)
- Action status feedback to chat: `server/lib/actions/worker.ts` (`postActionOutcomeMessage`, message metadata kind=`action_outcome`)

### RBAC / tenant enforcement
- Tenant staff/admin middleware: `server/routes/utils/auth.ts`
- Action/workstation/admin evidence routes enforce `ensureTenantStaff`, then admin-only checks where needed
- Queries in audited routes use `tenant_id` filters

## 2) Why actions could appear "done" without side effects

### Root causes identified
1. `DONE` status was possible without mandatory receipt evidence.
2. `SIMULATED` actions could still be perceived as normal completions in UI text flows.
3. API responses did not consistently surface run evidence contract (`action_run_id`, `outcome`, receipt summary).

### Implemented truth-layer controls
- `finalize(...)` in `server/lib/actions/worker.ts` now computes outcome from evidence:
  - REAL + no receipts => `NO_EFFECT`
  - SIMULATED => `NO_EFFECT`
  - REAL + receipts => `SUCCESS`
- Each persisted result includes:
  - `action_run_id`, `outcome`, `receipt_count`, `receipts[]`
- API now exposes evidence contract in:
  - `POST /api/actions/request`
  - `GET /api/actions/queue`
  - `GET /api/actions/:id`
- New evidence admin API:
  - `GET /api/admin/evidence`
  - `GET /api/admin/evidence/:id`

## 3) Why workstations page showed empty

### Root causes identified
1. UI default filter was `RUNNING` only (`client/src/pages/AdminWorkstationsPage.tsx`), hiding `CREATING`/`FAILED` workstations.
2. Failed provisions were not always persisted as failed workstation rows/events.
3. No dedicated health endpoint for provider/proxy/image diagnostics.

### Implemented fixes
- Default filter changed to `ALL`.
- Admin list API now returns `statusCounts` and failed reason metadata.
- Provisioning now writes a row in `CREATING` first, then updates to `RUNNING` or `FAILED` with `WORKSTATION_FAILED` event.
- Added `GET /api/workstations/health`.

## 4) Remaining risk / follow-up
- Chat-level "Receipt chip" + "UNVERIFIED CLAIM" labeling is not fully platform-wide yet; evidence is now available by API and admin page.
- Some legacy modules still use parallel task/action abstractions; long-term unification would reduce ambiguity.

## 5) Files changed during this audit/fix pass
- `server/routes/actions.ts`
- `server/routes/admin-evidence.ts`
- `server/routes/workstations.ts`
- `server/routes.ts`
- `client/src/pages/AdminWorkstationsPage.tsx`
- `client/src/pages/AdminEvidencePage.tsx`
- `client/src/App.tsx`
- `client/src/lib/adminNavRegistry.ts`
- `client/src/lib/adminNavRegistry.json`
