# Exportunity Industrial OS: Production Source Reconciliation

**Status:** reconciled on 2026-08-03 before the P0 containment release.

## Evidence

| Check | Result |
| --- | --- |
| Local source branch | `codex/exportunity-industrial-20260801` |
| Local source commit before this P0 patch | `789b0bc31f6dbe3a6b87e06b8fb94b92682b11e8` |
| `https://exportunity.net/api/health` | Reported `gitSha: 789b0bc31f6d` and build `20260803-112454` |
| `https://exportunity.net/api/whoami` | Resolved `tenantKey: exportunity`, `displayName: Exportunity`, and host `exportunity.net` |
| `https://exportunity.net/` | HTTP 200 |
| `https://exportunity.net/industrial` | HTTP 200 |

The live industrial experience is therefore sourced from this release branch, not an unrelated Zone or legacy marketplace deployment.

## Release Controls

`scripts/ops/deploy-release.sh exportunity` derives the Exportunity tenant configuration, checks the release artifact tenant, passes the canonical public and app URLs into the compose deployment, waits for the health check, and records the deployed Git SHA in `release-status.json`.

Every future Exportunity release must confirm all of the following before traffic is switched:

1. `APP_BASE_URL` and `PUBLIC_BASE_URL` resolve to `https://exportunity.net`.
2. The artifact manifest tenant is `exportunity`.
3. The post-deploy health response matches the expected Git SHA.
4. `/api/whoami` resolves the `exportunity` tenant on a fresh request.

## Deliberate Limits of This Reconciliation

- It does not certify Google Maps, Twilio, SMTP, or OpenAI credentials. Credentials and live sender status remain separately gated.
- It does not certify a database migration level. That requires an authenticated database health/migration run.
- Browser-based visual automation is currently unavailable in this environment, so the visual route pass remains a manual/repaired-browser follow-up.
- The GDIZ fast-start CSV/JSON/ZIP referenced in the attached package was not present in this workspace. No factory records were imported from prose alone.
