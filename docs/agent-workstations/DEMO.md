# Agent Workstations — Demo Script

## Prerequisites
- Feature flags enabled:
  - `FEATURE_AGENT_WORKSTATIONS=true`
  - `FEATURE_WORKSTATION_MONITORING=true`
  - `FEATURE_WORKSTATION_INTERNET=true`
- API server has Docker access.
- Admin user logged in.

## 1) Create workstation for an agent
```bash
curl -X POST "https://boursedelor.com/api/agents/17/workstation" \
  -H "Content-Type: application/json" \
  -H "Cookie: <admin-session-cookie>" \
  --data '{"workspaceType":"PERSISTENT","repoUrl":"https://github.com/example/repo.git","repoBranch":"main"}'
```

## 2) Open IDE URL from app
- Go to `/admin/workstations`.
- Select the workstation row.
- Click `Open IDE`.

## 3) Open desktop live view
- In `/admin/workstations`, click `Open Desktop`.
- A tokenized URL opens via `/w/:workstationId/DESKTOP?token=...`.

## 4) Confirm sessions update
- On the same page, `Sessions` panel should show new `IDE`/`DESKTOP` session entries.

## 5) Confirm events timeline updates
- `Events` panel should include:
  - `WORKSTATION_CREATED`
  - `IDE_OPENED`
  - `DESKTOP_OPENED` (if opened)

## 6) Switch internet policy to ALLOWLIST
- In `Internet Policy` panel:
  - Mode: `ALLOWLIST`
  - Allowed domains: `github.com`
  - Click `Apply policy`.
- Confirm `INTERNET_POLICY_CHANGED` appears in events.

## 7) Non-allowlisted access blocked
- From workstation browser/tools, attempt a domain outside allowlist.
- Verify block behavior through workstation proxy policy (infra dependent).

## 8) Generate artifact and verify listing
```bash
curl -X POST "https://boursedelor.com/api/workstations/<id>/artifacts/docx" \
  -H "Content-Type: application/json" \
  -H "Cookie: <admin-session-cookie>" \
  --data '{"title":"Workstation Report","content":"Audit test content."}'
```
- Confirm artifact appears in `Artifacts` panel with downloadable URL.
