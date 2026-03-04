# Actions Reliability Audit (C2)

Date: 2026-02-28

## Root Causes Confirmed

1. UI used numeric/internal IDs in visible labels
- `client/src/pages/AITeamHubPage.tsx` showed `Action #<id>` badges and queue rows.
- Result: user-visible IDs diverged from canonical public action IDs.

2. Assistant queue adapter dropped canonical action identity
- `server/routes/assistant.ts` `queueAssistantAction()` returned only numeric `id/status` for action requests.
- `publicActionId/state/correlationId` were not propagated back to dispatch feedback.

3. Generic assistant fallback text forced `#id`
- `server/routes/assistant.ts` emitted `Additional action runs queued: #57, #59`.
- Result: mixed identity formats in chat transcript.

4. Legacy auto-action note still emitted `Action #<id>`
- `server/routes.ts` (conversation auto-email notes) emitted numeric IDs.
- Result: some user-visible paths could still show non-canonical IDs.

5. Evidence enforcement was over-broad
- `server/lib/actions/executeAction.ts` required evidence for all non-navigation actions.
- `OBJECTIVE_CREATE` could fail with `Missing action evidence` despite no explicit evidence requirement.

6. Evidence-required action requests had no explicit unblock path
- Action requests with `evidence_required` needed a deterministic transition path from pending to queued.

## Fixes Applied

1. Canonical identity propagated end-to-end
- Updated `server/routes/assistant.ts`:
  - `queueAssistantAction()` now returns `publicActionId`, `state`, `correlationId`, and canonical label.
  - Dispatch callbacks now pass `publicActionId/state` back to action intent dispatcher.
  - Generic fallback text now uses canonical labels (`ACT-xxxxxx` / `RUN-xx`) instead of `#id`.

2. UI switched to canonical action labels and lifecycle state
- Updated `client/src/pages/AITeamHubPage.tsx`:
  - Message action chips now render `publicActionId + state`.
  - Queue/automation cards now render `publicActionId`, lifecycle `state`, and last error.
  - Added admin-only `View debug` links to action event timeline endpoint.

3. Removed remaining numeric `Action #id` fallback in auto-action note path
- Updated `server/routes.ts`:
  - Queue note now emits canonical action label (`publicActionId`, fallback `ACT-xxxxxx`) instead of `Action #<id>`.

4. Evidence gating moved to explicit/per-action requirement
- Updated `server/lib/actions/actionRegistry.ts` and `server/lib/actions/executeAction.ts`:
  - Added `requiresEvidence` support in action registry entries.
  - Execution enforces evidence only when explicitly required (or explicit metadata flag).
  - `OBJECTIVE_CREATE` no longer fails by default due missing evidence.

5. Deterministic evidence-unblock endpoint added
- Updated `server/routes/actions.ts`:
  - Added `POST /api/actions/:id/evidence`.
  - Marks evidence as satisfied and transitions `PENDING/CREATED` requests to `QUEUED`.
  - Writes `EVIDENCE_SATISFIED` and `QUEUED` action events.

6. Error code preservation fix
- Updated `server/lib/actions/executeAction.ts` catch path to preserve original `ActionExecutionError.code` (e.g., `MISSING_EVIDENCE`) instead of collapsing to `ACTION_FAILED`.

## Existing Capabilities Confirmed (No Redesign Needed)

- Action event timeline endpoint already present:
  - `GET /api/admin/actions/:action_id/events`
- Actions runner health endpoint already present:
  - `GET /api/health/actions-runner`
- Queue lease/reclaim mechanism already present in worker:
  - `claimed_until`, `claimed_by`, `next_retry_at`, batched dequeue with lock.
