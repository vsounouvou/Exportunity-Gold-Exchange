# Agent Workstations

Agent Workstations provide isolated, tenant-scoped runtime environments for agents with monitored lifecycle control.

## Main capabilities
- Provision/start/stop/destroy workstation runtimes
- Admin monitoring view (`/admin/workstations`)
- Tokenized IDE/Desktop access
- Session/event/artifact auditing
- Policy-driven internet mode per workstation

## Core APIs
- `POST /api/agents/:agentId/workstation`
- `GET /api/admin/workstations`
- `POST /api/workstations/:id/view-token`
- `POST /api/workstations/:id/network-policy`

See `STATUS_AUDIT.md` and `DEMO.md` for verification flow.
