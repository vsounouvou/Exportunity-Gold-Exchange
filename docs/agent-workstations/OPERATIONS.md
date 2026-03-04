# Agent Workstations — Operations

## Runtime prerequisites
- Docker daemon reachable by API host
- Feature flags enabled:
  - `FEATURE_AGENT_WORKSTATIONS=true`
  - `FEATURE_WORKSTATION_MONITORING=true`
  - `FEATURE_WORKSTATION_INTERNET=true`

## Common operations
- Create:
  - `POST /api/agents/:agentId/workstation`
- Start:
  - `POST /api/workstations/:id/start`
- Stop:
  - `POST /api/workstations/:id/stop`
- Destroy:
  - `DELETE /api/workstations/:id`

## Monitoring
- Route: `/admin/workstations`
- Panels:
  - Workstation list
  - Sessions
  - Events
  - Artifacts
  - Internet policy controls

## Cleanup guidance
- Destroy unused workstations to avoid orphaned containers.
- Periodically prune expired `workstation_view_tokens`.
- Archive or prune old events/sessions per `AUDIT_RETENTION_DAYS`.
