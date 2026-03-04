# Exportunity.com Clone Readiness

Generated: 2026-02-03

## Golden button

Run the full pipeline (crawling → mirror → assets → sync → checks) and save logs to `tmp/clone-logs/`:

```bash
npm run clone:exportunity:all
```

## Latest pipeline results (from logs)

Log directory: `tmp/clone-logs/`

- `crawl.log`: `[crawl] ok pages=63 assets=1228 outDir=crawl`
- `mirror.log`: `[mirror] ok pages=63 assets=670 outDir=mirror`
- `fetch-assets.log`: `[fetch-assets] ok assets=672 out=crawl/asset-map.json`
- `sync-legal.log`: wrote `client/public/exportunity/legal/privacypolicy.html` + `termsofservice.html`
- `sync-library.log`: wrote `client/src/content/exportunity/library.json items=7`
- `sync-posts.log`: wrote 7 `client/public/exportunity/posts/*.html` files
- `link-check.log`: `[link-check] ok html=63 refs=2442`
- `assets-verify.log`: `[assets:verify] ok remote_assets_found=0 missing_local_assets=0`
- `seo-verify.log`: `[seo:verify] ok`
- `check.log`: `tsc` succeeded (no output means no errors)
- `test-unit.log`: `[test:unit] ok`

## Route parity (from `crawl/routes.json`)

Total routes discovered: **63**

### Implemented marketing routes (SPA)

These are explicitly routed in `client/src/App.tsx` and render Exportunity marketing pages on `exportunity.com` / `www.exportunity.com`:

- `/`
- `/about`
- `/copy-of-home`
- `/contact-8`
- `/privacypolicy`
- `/termsofservice`
- `/library`
- `/post/:slug`
- `/invest`
- `/pricing`

### Redirected for parity (SPA)

These crawled routes now redirect to their nearest canonical marketing page (to avoid 404s on domain switch):

- `/plans-pricing` → `/pricing`
- `/library/categories/:slug` → `/library`
- `/library/tags/:slug` → `/library`
- `/academy` → `/library`
- `/initiative` → `/copy-of-home`
- `/booking-calendar` → `/contact-8`
- `/people` → `/about`
- `/clubs` → `/library`
- `/rayonhome` → `/`
- `/rayon-seller` → `/invest`
- `/copy-of-fintech` → `/copy-of-home`
- `/challenge-page/:id` → `/academy` (then `/library`)
- `/group/:rest*` → `/library`
- `/profile/:rest*` → `/library`

## Asset storage + resync

- Crawler outputs: `crawl/routes.json`, `crawl/assets.json`, `crawl/meta.json`, `crawl/report.md`
- Mirror snapshot: `mirror/www.exportunity.com/**` + `mirror/assets/**`
- Local downloaded assets for the actual app: `client/public/assets/original/exportunity/**`
- Synced content consumed by the marketing UI:
  - `client/src/content/exportunity/library.json`
  - `client/public/exportunity/legal/*.html`
  - `client/public/exportunity/posts/*.html`

To re-run only parts:

```bash
npm run crawl:exportunity
npm run mirror
npm run fetch-assets
npm run sync:exportunity:legal
npm run sync:exportunity:library
npm run sync:exportunity:posts
```

## SEO verification

`npm run seo:verify` boots a local ephemeral server and asserts:

- canonical tags are correct for:
  - `Host: exportunity.com`
  - `Host: www.exportunity.com`
  - `Host: boursedelor.com` (non-marketing tenant control)
- `robots.txt` and `sitemap.xml` change correctly per host

## Deploy + rollback

Primary deploy scripts:

- Windows: `deploy.ps1` (PowerShell)
- Linux/macOS: `deploy.sh`

Both deploy scripts:

- package and upload a source tarball
- do an atomic swap on the server
- rebuild via Docker Compose
- run a Playwright verification spec
- attempt rollback automatically on failure

## Notes / remaining decisions before domain switch

- Community-style routes (groups/profile/challenges) are redirected to `/library` for safety; if you want to preserve that content, we should implement dedicated pages or keep the old Wix site accessible under another host.
- Post HTML extraction currently mirrors Wix “richTextElement” blocks; validate a few `/post/*` pages visually before switching DNS.

