# Rollback and Recovery

## Baseline

The pre-Company-Brain production baseline is:

- commit `ba526ca0289997bd5b97413ce85e7a029df8bcff`;
- release `20260812-005134-ba526ca02899`;
- build `1786495893554`;
- live tenant `exportunity`, ID 2;
- root client redirect `/industrial`;
- immutable release deployment using `scripts/ops/deploy-release.sh`.

Record the new release ID, build ID, git SHA, database backup ID, and migration verification in the deployment log before switching traffic.

## Safety properties

The Company Brain foundation migration is additive. It creates new tables and indexes and does not modify existing contact, knowledge, agent, conversation, action, or industrial tables.

Capabilities are disabled by default. A code rollback can therefore leave the new empty/additive tables in place without affecting prior application behavior.

## Pre-deployment

1. Confirm worktree, branch, commit, tenant, domain, and deployment root.
2. Run focused Company Brain tests.
3. Run `npm run check` and production build.
4. Create a production database backup or snapshot and record its identifier.
5. Verify free disk space and remote release retention.
6. Verify all new feature flags are false.
7. Verify `FEATURE_EXTERNAL_COMMUNICATIONS=false`.
8. Build an immutable release artifact.
9. Verify manifest tenant, git SHA, build ID, base URL, and public URL.

## Deployment

Use the existing release script only after preflight passes:

```bash
bash scripts/ops/deploy-release.sh exportunity --build-artifact
```

The release must ensure tables before registering the normal application routes. Do not manually run destructive SQL.

## Post-deployment checks

- `/api/version` reports the expected release and SHA;
- `/api/tenant` resolves `exportunity`, ID 2;
- `/industrial`, `/factories`, `/export-products`, `/industrial-supply`, `/map`, and `/request-quote` load;
- login and Operations Center remain available;
- server logs show Company Brain tables ensured with no SQL error;
- all Company Brain and Workspace flags remain disabled;
- no outbound email, WhatsApp, SMS, or call is generated;
- existing contacts, agents, meetings, messages, tasks, actions, and industrial records retain counts;
- mobile and desktop smoke tests pass.

## Application rollback

If startup, routing, authentication, or existing behavior regresses:

1. Set new feature flags false.
2. Point the current release symlink to the recorded prior release.
3. restart the application container/service using the established deployment procedure.
4. verify `/api/version`, `/api/tenant`, and industrial route smoke tests.
5. retain failed release files and logs for diagnosis.

The additive Company Brain tables do not need to be dropped during an application rollback.

## Data rollback

If Company Brain ingestion later writes invalid records:

1. disable Company Brain and connector flags;
2. stop the visible connector run through its operator control;
3. preserve the audit event and affected source/version IDs;
4. tombstone or quarantine affected Company Brain records by sync run or correlation ID;
5. do not delete existing CRM, knowledge, or operational data;
6. restore from backup only when additive record quarantine cannot recover correctness.

Dropping Company Brain tables is a last resort and requires a separate reviewed migration and verified database backup.

## Connector incident

1. disable the affected service flag;
2. revoke the Google grant if credentials or scope are suspect;
3. invalidate stored secret reference;
4. quarantine records from the affected sync run;
5. inspect access logs, scopes, source allowlist, and audit events;
6. reconnect only after a documented incident decision.

## External communication incident

Follow `EMAIL_ACTIVATION_RUNBOOK.md`. The immediate control is `FEATURE_EXTERNAL_COMMUNICATIONS=false`, followed by action queue quarantine and provider credential revocation where necessary.

## Recovery evidence

Every deployment and rollback record should include:

- operator and timestamp;
- prior and target release IDs;
- database backup ID;
- environment/flag diff excluding secret values;
- migration and startup result;
- smoke-test result;
- reason and incident/correlation ID;
- final production version.
