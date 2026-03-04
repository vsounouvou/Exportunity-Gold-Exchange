# Workstation List Root Cause (2026-02-21)

## Symptom
Admin Workstations page showed `No workstations found` even when workstation provisioning attempts had happened.

## Root causes
1. Default status filter in UI was `RUNNING`.
- File: `client/src/pages/AdminWorkstationsPage.tsx`
- Effect: any `CREATING`, `FAILED`, or `STOPPED` workstation was hidden.

2. Provisioning failure path did not always persist failed records.
- File: `server/routes/workstations.ts` (create endpoint)
- Effect: when provider creation failed early, there could be no persistent failed row/event to display.

3. Missing diagnostics endpoint.
- No `GET /api/workstations/health` route existed.
- Effect: operators could not quickly verify provider health/image/proxy readiness.

## Fixes implemented
1. UI filter default changed to `ALL`.
2. Workstation create flow now:
- inserts `CREATING` row first,
- updates row to running values on success,
- updates row to `FAILED` with provisioning error payload on failure,
- emits `WORKSTATION_CREATED`/`WORKSTATION_FAILED` events.
3. Admin list endpoint now returns status counts and failure reason field.
4. Added `GET /api/workstations/health` with provider/image/proxy/sample create diagnostics.
5. Feature flag alias support added:
- `FEATURE_WORKSTATIONS` (alias to existing workstation enable behavior)
- `FEATURE_WORKSTATION_MONITORING`

## Validation checklist
- Create workstation with valid provider: row appears in list immediately (`CREATING` -> `RUNNING`).
- Force provider failure: row remains visible as `FAILED` with error text.
- Switch status filters: counts match list.
- `/api/workstations/health` returns provider + feature + image/proxy status.
