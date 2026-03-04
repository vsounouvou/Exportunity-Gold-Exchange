# Agent Workstations — Security Notes

## Isolation
- All workstation records are tenant-scoped (`tenant_id` required in reads/writes).
- Endpoint access is constrained by `ensureTenantStaff` and role/permission checks.

## Access control
- Monitoring and live access require elevated permissions (`WORKSTATION_MONITOR_VIEW`, `WORKSTATION_MONITOR_LIVE`).
- Ownership fallback supports own-workstation access only when authorized.
- View access uses expiring signed tokens (`workstation_view_tokens`).

## Auditability
- Lifecycle, access, policy, and artifact actions emit `workstation_events`.
- Active/ended viewer sessions tracked in `workstation_sessions`.

## Network controls
- Per-workstation internet policy:
  - `DEFAULT_DENY`
  - `ALLOWLIST`
  - `FULL_EGRESS`
- Proxy-based enforcement supported via `WORKSTATION_PROXY_URL`.

## Secrets
- Do not mount production DB credentials into workstation runtimes.
- Keep privileged actions behind admin-only permissions and approval flow.
