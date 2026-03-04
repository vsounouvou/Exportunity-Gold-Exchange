# Engineering Kernel UI — Live Check Report

Date: 2026-02-04

## URL

- Private UI: `https://exportunity.net/machinery`
- Fallback route: `https://exportunity.net/manufacturing` (redirects to `/machinery`)

## Build / Version Observed (production)

- `GET https://exportunity.net/api/system/version`
  - `buildId`: `1770228083010`
  - `gitSha`: `2fc69f34fa5c`
  - `serverStartedAt`: `2026-02-04T18:07:10.672Z`

## Privacy / Discoverability

Verified via `node scripts/verify-machinery-live.mjs`:

- `/machinery` is noindex (defense-in-depth):
  - `X-Robots-Tag: noindex, nofollow, noarchive`
  - `<meta name="robots" content="noindex, nofollow" />`
- `robots.txt` disallows:
  - `/machinery`
  - `/manufacturing`
- `sitemap.xml` does **not** include:
  - `/machinery`
  - `/manufacturing`

## Auth / Gating

- Proxies are session-gated:
  - `GET https://exportunity.net/api/internal/engineering/ui-access` (no auth) → `401`
- Internal kernel endpoints remain key-gated:
  - `POST https://exportunity.net/engineering/intent` (no key) → `403`

## How to Test (as tenant admin / chairman assistant)

1. Login to `exportunity.net`.
2. Open `https://exportunity.net/machinery`.
3. Use:
   - **Create Intent**
   - **Compile**
   - **Execute**
4. Confirm status JSON + artifacts list updates in the panel.

