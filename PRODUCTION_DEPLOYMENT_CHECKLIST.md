# Exportunity Production Deployment Checklist

## Preflight

- Confirm the release branch is `codex/exportunity-industrial-20260801`.
- Confirm `APP_BASE_URL=https://exportunity.net` and `PUBLIC_BASE_URL=https://exportunity.net` in the target release environment.
- Confirm `FEATURE_EXTERNAL_COMMUNICATIONS=false`.
- Review `git status` and preserve all unrelated user work.
- Run focused industrial, Operations Center, Company Brain, workforce, payment, SEO, and security-boundary tests.
- Run `npm run check`.
- Run `npm run build`.

## Release

Use the guarded Exportunity deployment path:

```bash
scripts/ops/deploy-release.sh exportunity --build-artifact
```

The deploy must stop before traffic switching if tenant identity, base URL, build metadata, or health verification fails.

## Live Verification

- `GET /build.json` identifies the new build and commit.
- `GET /api/system/version` agrees with the public build.
- `GET /` has Exportunity title/canonical metadata and does not identify Zone.
- `HEAD /` does not include a noindex `X-Robots-Tag`.
- `GET /robots.txt` allows public crawling while disallowing private application routes.
- `GET /api/.env` returns HTTP 404 JSON and never returns the application shell or secret content.
- `/industrial`, `/factories`, `/map`, `/export-products`, `/industrial-supply`, `/machinery`, and `/request-quote` return successfully.
- Public industrial intake opens the persistent Awa conversation and can create a governed requirement.
- Factory/map selection exposes documented factories and products without hiding the assistant.
- Production has 126 governed role seats and the expected active agent roster.
- All retained meetings still have conversation IDs and persisted messages.
- `FEATURE_EXTERNAL_COMMUNICATIONS=false` is loaded by the recreated container.
- Startup logs contain no recurring missing-audio-directory error.

## Integration Status To Record

- OpenAI Responses models: available.
- Flutterwave v4: configured; no real charge in smoke.
- KKiaPay for Exportunity: not configured.
- Twilio WhatsApp: configured but outbound use remains approval-gated and globally disabled.
- Google Maps: browser key present, Map ID absent.
- Google Places: server key absent, import disabled.
- Google Workspace: OAuth credentials absent, no active connector.

## Local Disk Hygiene

After a successful deploy, preview and remove only ignored release output:

- `.build-meta.json`
- `dist/`
- `ops/local-releases/`

Do not remove source, credentials, dependencies, dirty worktrees, or another tenant's release files. The committed branch on GitHub is the source backup.

## Rollback

- Keep the previous server artifact until live checks pass.
- Switch traffic back to the immediately previous verified Exportunity release if root identity, API boundary, startup, or tenant checks fail.
- Do not roll back shared database state across tenants. Use forward-compatible application rollback and exact migrations only.
