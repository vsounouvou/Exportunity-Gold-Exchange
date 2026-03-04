# Agent Workstations - Status Audit

## Scope checked
- Backend workstation provisioning and lifecycle routes
- Monitoring routes (list/details/events/sessions/artifacts)
- View-token live access flow
- Network policy storage and updates
- Frontend monitoring page wiring

## What exists
- Tables ensured at boot in `server/lib/workstations/ensureTables.ts`:
  - `agent_workstations`
  - `workstation_artifacts`
  - `workstation_sessions`
  - `workstation_events`
  - `workstation_view_tokens`
  - `workstation_network_policies`
- Docker provider in `server/lib/workstations/provider.ts` with:
  - `create/start/stop/destroy/status`
  - URL generation for IDE/Desktop/Terminal
  - tenant/agent labels and resource limits
- Workstation routes mounted in `server/routes.ts` via `workstationsRouter`.
- Workstation table bootstrapping in `server/index.ts` via `ensureWorkstationTables()`.

## Gaps fixed in this cycle
- Chairman assistant persistence hardened on canonical thread `chairman-main`.
- Monitoring feature flags default to enabled when env vars are unset.
- Workstation provider now defaults to desktop-capable image:
  - primary: `exportunity/workstation:latest`
  - fallback: `codercom/code-server:latest`
- Operations agenda copy now falls back to broader meeting room matching if room type values vary.

## Endpoints available
- `POST /api/agents/:agentId/workstation`
- `GET /api/agents/:agentId/workstation`
- `GET /api/admin/workstations`
- `GET /api/workstations/:id`
- `GET /api/workstations/:id/events`
- `GET /api/workstations/:id/sessions`
- `GET /api/workstations/:id/artifacts`
- `POST /api/workstations/:id/artifacts/docx`
- `POST /api/workstations/:id/start`
- `POST /api/workstations/:id/stop`
- `DELETE /api/workstations/:id`
- `GET /api/workstations/:id/status`
- `POST /api/workstations/:id/view-token`
- `GET /w/:workstationId/:scope`
- `POST /api/workstations/:id/network-policy`

## Runtime notes
- Desktop live view (`DESKTOP`) requires a workstation image that exposes noVNC on port `6080`.
- If desktop service is unavailable, IDE view still works using the fallback image.
- Internet allowlist enforcement depends on proxy/network policy wiring in infra (`WORKSTATION_PROXY_URL`).

## Local reproduction
1. Enable flags:
   - `FEATURE_AGENT_WORKSTATIONS=true`
   - `FEATURE_WORKSTATION_MONITORING=true`
   - `FEATURE_WORKSTATION_INTERNET=true`
2. Set workstation image defaults:
   - `WORKSTATION_IMAGE=exportunity/workstation:latest`
   - `WORKSTATION_IMAGE_FALLBACK=codercom/code-server:latest`
3. Ensure Docker daemon is reachable from API host.
4. Start app and create workstation:
   - `POST /api/agents/:agentId/workstation`
5. Open monitoring page:
   - `/admin/workstations`
