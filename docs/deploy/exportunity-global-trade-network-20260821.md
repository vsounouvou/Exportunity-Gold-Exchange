# Exportunity Global Trade Network release — 2026-08-21

## Scope

- Keep `exportunity.net` on the Global Trade Network platform home.
- Preserve the existing database, integrations, industrial workflows, Trade Intelligence, and Producer Exchange.
- Prevent retired neighborhood-store, marketplace-map, and corporate-marketing interfaces from becoming the `.net` root.
- Keep provider release flags and approval gates unchanged.

## Pre-deployment evidence

- Source branch: `codex/exportunity-global-trade-release-20260821`
- Unified platform checkpoint: `51f9008`
- Public-route lock checkpoint: `c8c9e47`
- Previously deployed source: `296b5776f682`
- Production backup: `/var/backups/db/exportunity-pre-global-trade-c8c9e47-20260821T133458Z.dump`
- Backup SHA-256: `932a6ee89c6ce10490bb4b7acde438d05aa70272623e63ba313bb3cce9ed0157`
- Backup size: `29,310,043` bytes

The migration candidate is the additive set under `db/migrations` added after
`296b5776f682`, in filename order. The disposable PostgreSQL check restored the
production backup, applied all 40 files, and then reapplied all 40 files to
verify idempotency. It finished with 739 public tables and verified the Social
Inbox foreign key to the canonical `agent_tasks` table.

The first disposable pass exposed a missing `agent_tasks` foundation before any
production change. `20270414_exportunity_agent_task_foundation.sql` is the
additive forward-fix and contains no task seed, provider call, or external
action.

## Rollout

1. Apply the reviewed migration files to production in filename order with
   `ON_ERROR_STOP` enabled.
2. Build and deploy the clean tenant-stamped artifact.
3. Verify build identity, health, `.net` root content, current operating routes,
   retired-route behavior, and public APIs.
4. Keep provider, payment, publication, and outreach release flags unchanged.

## Production result

- Production migrations applied: all 40 reviewed additive files, in filename
  order with `ON_ERROR_STOP` enabled.
- Release ID: `20260821-134440-5c9379c2e32d`
- Source version: `5c9379c2e32d`
- Build ID: `1787319773237`
- Artifact SHA-256:
  `1045089228d01facfd1d6d88f8577a13bdf38ea117d511b6aa6df37257da5e4d`
- Active release:
  `/var/www/exportunity/releases/20260821-134440-5c9379c2e32d`
- Previous application release retained for rollback:
  `/var/www/exportunity/releases/20260821-115515-296b5776f682`

The deployment verifier confirmed parity between `/api/system/version` and
`/build.json` for app `exportunity`, source `5c9379c2e32d`, and build
`1787319773237`. The running application returned HTTP 200 for tenant
resolution, Trade Intelligence, Producer Exchange campaigns, and the industrial
catalog.

Production browser verification confirmed that the `.net` root renders the
Global Trade Network home with the commercial entry paths, corridor map, Awa,
and documented industrial offers. `/zone` and `/marketplace` resolve to
`/industrial`; `/map`, `/trade`, and `/producer-exchange` render their current
operating surfaces. None of these routes rendered the retired neighborhood-store
interface or the corporate-marketing hero.

## Permanent public-surface retirement follow-up

- Retirement checkpoint: `54ca61d`
- Release ID: `20260821-143113-54ca61d3ccc9`
- Source version: `54ca61d3ccc9`
- Build ID: `1787322652275`
- Artifact SHA-256:
  `181b191d85c231db0bbe0d237a0551aa060ddd063b02fbe7b219d3499222069c`
- Active release:
  `/var/www/exportunity/releases/20260821-143113-54ca61d3ccc9`
- Previous release retained for application rollback:
  `/var/www/exportunity/releases/20260821-134440-5c9379c2e32d`

This follow-up removed `MarketingHomePage.tsx` and eliminated the public-host
branch that could select it. All Exportunity public hosts now resolve their root
to `GlobalTradeHomePage`. The remaining retired store, map, exchange, and gold
aliases are enforced as server-side HTTP 308 redirects to their current platform
surfaces, so an old browser bundle cannot restore a legacy interface.

The source guard, build stamp, release-artifact guard, deployment guard, and live
deployment verifier now all require the canonical marker
`global-trade-network`, `GlobalTradeHomePage`, and
`legacyHomepageRetired: true`. A corporate-profile deployment to any Exportunity
public hostname is rejected before publication.

The deployment verifier confirmed source/build parity for `54ca61d3ccc9` and
`1787322652275`. Live verification returned HTTP 200 for `/`, `/industrial`,
`/trade`, and `/producer-exchange`. Browser verification confirmed the Global
Trade Network headline, Awa Kouadio, GDIZ content, and absence of the retired
corporate-marketing headline. This follow-up changed no database schema or data.

## Exportunity-native provider verification follow-up

- Native-provider checkpoint: `c615bd9e219e`
- Release ID: `20260821-151904-c615bd9e219e`
- Source version: `c615bd9e219e`
- Build ID: `1787325480383`
- Artifact SHA-256:
  `d5153970227aa3149b2fc8cfe4c432892a671a5aeefd4cc3ff9d94e6e6a6f4f0`
- Active release:
  `/var/www/exportunity/releases/20260821-151904-c615bd9e219e`
- Previous release retained for application rollback:
  `/var/www/exportunity/releases/20260821-143113-54ca61d3ccc9`

This package added an Exportunity-native encrypted token vault and read-only
Google and Meta provider verification. The runtime accepts only the dedicated
`EXPORTUNITY_*` credential namespace, stores only redacted provider evidence,
and records that verification performed no provider mutation or external
action. It does not reuse Mindbase credentials, tokens, workspaces, or connection
records.

The production deployment verifier confirmed source/build parity for
`c615bd9e219e` and `1787325480383`. A post-deployment browser check confirmed
that `/` still renders the Global Trade Network home with Awa, the corridor
explorer, and the GDIZ catalogue. The canonical public-surface guard remains
`global-trade-network`, `GlobalTradeHomePage`, and
`legacyHomepageRetired: true`.

The first production Google read-only check refreshed the expired access token
from the existing Exportunity refresh token. Gmail profile and Drive account
reads returned HTTP 200 without sending or changing email or files. Calendar
returned HTTP 403 for insufficient scope, and the stored authorization did not
contain the complete `email` and `profile` scope evidence. A replacement consent
flow was therefore started against `vs@exportunity.com` with the exact
Exportunity scope contract; Google required an account-owner device
verification before consent could complete.

The production Meta read-only check verified identity and all currently
requested permissions, returned two Facebook Page targets, and performed no
post, comment, advertising, account, or permission mutation. No Instagram
Business account is linked to either authorized Page, so Instagram operations
remain unavailable until that provider-side link exists.

Twilio evidence remains read-only: the dedicated account is active and the SMS
sender is SMS-capable; no Messaging Service is configured and the registered
WhatsApp sender reports `OFFLINE`. No SMS, WhatsApp message, call, or
verification code was sent by this release.

Focused provider tests passed 10/10. Full TypeScript and route checks,
`npm run test:unit`, and `npm run check:exportunity-surface` passed under the
pinned Node 24.19.0 runtime. This package changed no database schema or data. It
establishes the native access boundary; migrating the remaining operational
consumers away from older integration tables requires separate additive
packages.

## Native Meta/social consumer migration

- Source checkpoint: `e42fe19`
- Migration:
  `db/migrations/20270522_exportunity_native_social_connections.sql`
- Pre-migration production backup:
  `/var/backups/db/exportunity-pre-native-social-e42fe19-20260821T154934Z.dump`
- Backup SHA-256:
  `0209f6bef8aed2cf8fdb22ed881f363d671754ba54ba57b433f17107ecd63924`
- Backup size: `29,871,687` bytes

The migration adds dedicated Exportunity connection references to social
publication targets, publication attempts, and advertising-account records.
It leaves historical Mindbase references nullable for evidence preservation,
but the Meta/social runtime no longer reads them and no new operation writes
them. Legacy account labels are not accepted as identity proof, so the migration
automatically rebound zero existing records. Existing provider targets must be
rediscovered and selected through the Exportunity-native read-only flow.

The checksum-verified production backup was restored to a uniquely named
disposable PostgreSQL database. The prior 40 reviewed additive migrations plus
the exact native-social migration applied twice in filename order with
`ON_ERROR_STOP`. Verification returned three native columns, three foreign keys,
three indexes, and zero automatic rebinds. The disposable database and uploaded
SQL copy were removed afterward.

Production then applied only the reviewed native-social migration in a single
transaction with `ON_ERROR_STOP`. The same column, foreign-key, index, and
zero-rebind assertions passed. The runtime package keeps official publication,
webhook ingestion, advertising execution, background execution, and automatic
retry release flags unchanged and off unless separately approved. Company Brain,
carrier adapters, and a future native YouTube authorization remain separate
follow-up packages; they do not fall back through this Meta/social path.

## Phase G disposable PostgreSQL proof

- Source checkpoint: `c922c13`
- Migration:
  `db/migrations/20270523_exportunity_offer_acceptance_orders.sql`
- Migration SHA-256:
  `7f7c6847cbde59b1f18c33d0c4f01a36054e281449b52489fa0be393ef2b506b`
- Required predecessor migration SHA-256:
  `79ebab58f299c41bcf9ed29300bba48b7706ffa7f10f73a478587be98510e6ff`
- Verification date: `2026-08-22` UTC

The checksum-verified pre-native-social production backup was restored into the
uniquely named disposable database
`exportunity_phase_g_20260822072833_81f73895`. The native-social predecessor and
Phase G migration then applied twice in filename order with `ON_ERROR_STOP`.
Both passes succeeded; the second pass reported only the expected
already-present notices from guarded additive statements.

Verification returned five governed customer-response columns, five exact order
confirmation columns, three Phase G constraints, and three Phase G indexes.
`industrial_orders.total_amount` is `numeric(30,3)` and
`industrial_orders.total_amount_minor` is `numeric(30,0)`. Quote and order row
counts remained `0|0`, the native-social predecessor returned three columns,
three foreign keys, three indexes, and zero automatic provider-account rebinds.
The restored database occupied 840 MB during the check. It was dropped
immediately afterward, both uploaded SQL copies were removed, and the host
returned to 15 GB available. This proof made no schema or data change to the
live `bdo` database.

## Native Meta/social production release

- Final runtime checkpoint: `5924f036ebb3`
- Release ID: `20260821-160526-5924f036ebb3`
- Build ID: `1787328311945`
- Artifact SHA-256:
  `b6ffef43d1dce99d872c06469a059bf66e6049f04d2efc726f6b2bb70b0f6544`
- Active release:
  `/var/www/exportunity/releases/20260821-160526-5924f036ebb3`
- Previous release retained for application rollback:
  `/var/www/exportunity/releases/20260821-155607-cf74057bc470`

This release deploys the Exportunity-native social connection consumers and
removes the last stale Media-screen statement that described the provider vault
as belonging to another product. A regression test now requires the Media
screen to describe Exportunity's native integration vault and rejects the old
credential-storage wording.

The production verifier confirmed app `exportunity`, source `5924f036ebb3`, and
build `1787328311945` with no server/client mismatch. `/`, `/industrial`,
`/trade`, and `/producer-exchange` returned HTTP 200. Browser verification found
one Global Trade Network headline, Awa Kouadio, and the GDIZ catalogue; it found
zero instances of the retired corporate-marketing headline. The Media screen
rendered the Exportunity-native vault notice once and the stale credential notice
zero times.

The post-deployment Meta verification remained read-only and returned HTTP 200
for identity, permissions, and two Facebook Page targets. No Instagram Business
account is linked to those Pages. Google still requires a fresh owner-authorized
consent flow: Gmail and Drive were previously verified read-only, while Calendar
remains unavailable under the existing insufficient scope and the stored
authorization lacks complete `email` and `profile` evidence. Twilio remains
unchanged: account active, SMS-capable sender, no Messaging Service, and the
registered WhatsApp sender `OFFLINE`. No post, ad, email, calendar event, Drive
write, SMS, WhatsApp message, call, or verification code was created by these
checks.

The two native-boundary regression tests passed under pinned Node 24.19.0, and
the route verifier and full TypeScript check passed. The release-mode production
bundle completed with the repository's documented
`SKIP_PUBLIC_SURFACE_QUALITY_GATE=1` setting. A separate optional localhost public-surface
audit could not resolve a production tenant or local PostgreSQL service; it was
recorded as an environment-only failure and did not replace the successful
container build, deployment parity check, live-route checks, or browser checks.

## Exact commercial-offer boundary pre-release evidence

The commercial deal room now renders only the canonical source-linked exact
offer workbench. The manual supplier-price form, the floating-point internal
offer form, the separate legacy approval table, and direct customer-quote
creation have been removed. Their five server write routes return HTTP 410, all
legacy quote status mutations are read-only, and a legacy quote cannot be
converted into an order. Existing tables and rows are preserved as historical
evidence; no destructive migration is included in this package.

The canonical issue action is administrator-gated and hash-bound. It rechecks
the qualified supplier quote and its current evidence hash, approval evidence,
customer context, price and terms, and the unexpired validity window. A successful
issue records an exact customer offer and audit evidence only. External delivery
remains a separate disabled boundary: no email, SMS, WhatsApp, order, payment,
supplier contact, provider call, or background job is performed.

A production database audit ran inside an explicit read-only transaction for
tenant `exportunity` (`id=2`). It found zero `industrial_commercial_offers`, zero
legacy or exact `industrial_quotes`, and zero `industrial_orders`, so retiring
the obsolete display and write paths cannot strand an active production record.

Pinned Node 24.19.0 verification passed the 10 exact-offer tests, the full unit
suite, 37 focused intake/fulfillment/payment tests, route generation and route
parity, TypeScript, and the production bundle. The public-surface gate recorded
`global-trade-network`, `GlobalTradeHomePage`, and
`legacyHomepageRetired: true`; no homepage component or public-root routing was
changed by this package.

## Exact commercial-offer production release

- Source checkpoint: `48009dd95db8`
- Release ID: `20260821-165657-48009dd95db8`
- Build ID: `1787331408381`
- Artifact SHA-256:
  `e244dd02d12e75decd03e6d4bd9a3b82f0d4fa47e257d73f3a633c4f486714a4`
- Active release:
  `/var/www/exportunity/releases/20260821-165657-48009dd95db8`
- Previous release retained for application rollback:
  `/var/www/exportunity/releases/20260821-160526-5924f036ebb3`

The atomic deployment completed without a database migration. Production
reported Node 24.19.0, matching client/server commit `48009dd95db8`, matching
build `1787331408381`, no build mismatch, and zero severe startup-log events.
`/`, `/industrial`, `/trade`, and `/producer-exchange` returned HTTP 200. Both
the canonical commercial-offer list and a retired legacy write rejected an
unauthenticated request with HTTP 401 before business logic.

Browser verification refreshed the service worker to the deployed build and
confirmed the visible `Trade. Source. Expand. Operate.` headline, Awa Kouadio,
the corridor map, and GDIZ content. The retired corporate headline and old
marketplace-map prompt were absent, and the update banner cleared. The browser
was left open on the verified Global Trade Network homepage for handoff.

No email, calendar event, Drive write, Meta post, advertisement, SMS, WhatsApp
message, phone call, supplier contact, order, payment, provider charge, or
background task was created by this release or its verification. Provider
mutation flags and external offer delivery remain disabled.

## Mobile Company Brain executive-truth production release

- Source checkpoint: `846197199308`
- Release ID: `20260821-172802-846197199308`
- Build ID: `1787333281305`
- Artifact SHA-256:
  `8fdacbe27c5064eed291bfdbcc230af94c6fe4ea6210bffb724c5c97a80877ed`
- Active release:
  `/var/www/exportunity/releases/20260821-172802-846197199308`
- Previous release retained for application rollback:
  `/var/www/exportunity/releases/20260821-165657-48009dd95db8`

The atomic deployment completed without a database migration. Production
reported Node 24.19.0, matching client/server source `846197199308`, matching
build `1787333281305`, a clean source stamp, and no build mismatch. The release
status is `successful`, and `/`, `/industrial`, `/trade`, and
`/producer-exchange` all returned HTTP 200.

This package adds the quick-session-authenticated, read-only
`GET /api/chairman/executive-truth` projection and its mobile Company truth
panel. It exposes only tenant-scoped Company Brain, source-security, cited
context-pack, 126-seat organization, and workforce-demand summaries. The
response explicitly disables approvals, agent-lifecycle mutation, and external
actions. An unauthenticated production request returned HTTP 401.

The public-surface release lock remained intact across source verification,
the production bundle, the release artifact, the deployment pre-switch check,
and the live build stamp. Production identifies `global-trade-network`,
`GlobalTradeHomePage`, and `legacyHomepageRetired: true`. Browser verification
confirmed the visible `Trade. Source. Expand. Operate.` headline, Awa Kouadio,
GDIZ content, and the corridor map. The retired corporate-marketing headline
was absent. A separate 390 x 844 cold-load test reached the same Global Trade
Network experience after the opening splash and rendered the mobile hero and
Awa conversation card correctly.

Before deployment, the focused executive-truth tests, the broader 47-test
Company Brain and role-seat suite, the full unit suite, route generation and
parity, TypeScript, and the release build passed under pinned Node 24.19.0. A
production query executed inside an explicit read-only transaction reported
three Company Brain sources, zero open conflicts, fifteen context packs, the
126-seat organization baseline with 114 currently available seats, and two
workforce requests in monitoring status.

No approval, role activation, external communication, provider action,
background task, order, payment, or production-record mutation was performed by
this package or its verification.

## Exact Google read-only grant production release

- Source checkpoint: `cd2f7df99d88`
- Release ID: `20260821-175902-cd2f7df99d88`
- Build ID: `1787335142037`
- Artifact SHA-256:
  `ac0514d99512f61f2a3cbd2dcb1d4fd660e48acbd709a33b4df75eda5780ffb3`
- Artifact size: `137559083` bytes (`131.19 MiB`)
- Active release:
  `/var/www/exportunity/releases/20260821-175902-cd2f7df99d88`
- Previous application release retained for rollback:
  `/var/www/exportunity/releases/20260821-172802-846197199308`

The atomic deployment completed without a database migration. Production
reported Node 24.19.0, matching client/server source `cd2f7df99d88`, matching
build `1787335142037`, a clean source stamp, and no build mismatch. `/`,
`/industrial`, `/trade`, and `/producer-exchange` returned HTTP 200. The
provider-status endpoint rejected an unauthenticated request with HTTP 401.

This package replaces the former broad Google permission contract with two
separate, exact, non-cumulative read-only grants. Google Workspace requests
only identity, Gmail read-only, Calendar read-only, and Drive read-only. YouTube
requests identity and `youtube.readonly` in its own connection record. The
authorization flow does not set `include_granted_scopes`; a callback containing
a missing, write-capable, upload, or otherwise unexpected scope fails before
token storage. Provider checks remain GET-only and external communications
remain disabled.

The signed-in production control plane classified the existing Workspace grant
as `Reconnect required`. It displayed `gmail.modify`, `calendar.events`, and
`drive.file` outside the new contract; listed the three replacement read-only
scopes as missing; disabled verification of the old token; and presented a
separate unconnected YouTube card. This is the intended fail-closed state before
owner-confirmed Google-project revocation and replacement consent.

The final scope regression package passed 11 focused provider tests, route
verification, TypeScript, and both local and remote release builds under pinned
Node 24.19.0. The full unit suite had passed at the immediately preceding
package checkpoint, before the final presentation-only warning correction and
pure scope-contract regression helper. The public-surface gate remained
`global-trade-network`, `GlobalTradeHomePage`, and
`legacyHomepageRetired: true` through artifact creation and production.

Post-deploy browser verification confirmed the visible `Trade. Source. Expand.
Operate.` headline, Awa Kouadio, GDIZ product evidence, corridor exploration,
and the industrial/trade/producer links. The retired corporate-marketing
homepage was absent. No Google grant was revoked or created, no provider token
was changed, and no email, calendar event, Drive file, YouTube video, Meta post,
advertisement, SMS, or WhatsApp message was sent by this release or its
verification. C: retained 16.1 GB free after the release artifact was created.

## Native GTN consolidation and governed offer-acceptance release

- Source checkpoint: `7c61b3581fa3`
- Release ID: `20260822-084707-7c61b3581fa3`
- Build ID: `1787388082010`
- Artifact SHA-256:
  `9c30d244ff766204bdf602e087589ca28c9bb9f8b216f3ec13a181496f741cd4`
- Artifact size: `98731817` bytes (`94.16 MiB`)
- Active release:
  `/var/www/exportunity/releases/20260822-084707-7c61b3581fa3`
- Pre-consolidation application release deliberately removed after verification:
  `/var/www/exportunity/releases/20260821-214223-c275a44044b4`
- Pre-migration production backup:
  `/var/backups/db/exportunity-pre-phase-g-7c61b35-20260822T084419Z.dump`
- Backup SHA-256:
  `c497966b2c701644b960aef29f40fce77e66a4cc97203a6825bf6d7cfd70cc9d`
- Backup size and validation: `29901927` bytes, PostgreSQL custom dump,
  `PGDMP` header, `6919` readable catalog entries
- Applied migration:
  `20270523_exportunity_offer_acceptance_orders.sql`
- Migration SHA-256:
  `7f7c6847cbde59b1f18c33d0c4f01a36054e281449b52489fa0be393ef2b506b`

The migration had already been applied twice on a disposable PostgreSQL clone
with matching assertions. Immediately before the production transaction, the
ten new Phase G columns, three constraints, and three indexes were absent and
both `industrial_quotes` and `industrial_orders` contained zero rows. The
additive production transaction completed with `ON_ERROR_STOP`; it produced all
ten columns, all three constraints, and all three indexes. The accepted order
amount uses `numeric(30,3)` and the ISO-currency minor-unit amount uses
`numeric(30,0)`. Both table row counts remained zero after the migration.

The release replaces remaining reachable legacy Agenda, People, Organization,
dashboard, and operations interfaces with the Exportunity-native visual and
workflow system, removes retired route/page assets and the legacy CSS bridge,
and preserves useful APIs, database models, and commercial evidence. The build
removed `13196529` bytes of non-Exportunity tenant assets. The exact public
surface lock remained `global-trade-network`, `GlobalTradeHomePage`, homepage
SHA-256
`0f4e73496ffa9cd34d017026efe9aed5efbfcb8925d3f5eaa99576dfb57b68b2`,
and `legacyHomepageRetired: true` through source verification, artifact
verification, the server image build, and the live production health response.

Pinned Node 24.19.0 checks, route generation and parity, TypeScript, the full
unit suite, the production build, artifact verification, server health, and
client/server build parity passed. Live desktop and 390 x 844 mobile browser
checks rendered `Trade. Source. Expand. Operate.`, Awa Kouadio, the GDIZ-backed
catalog, the industrial vertical, trade intelligence, and producer exchange
with zero console errors. The retired `Platforms for trade, gold, machinery,
and execution.` marketing headline was absent on every checked route.

After successful health and browser verification, the inactive
pre-consolidation release, its `previous` symlink, and its archive sidecars were
removed so that those legacy interfaces cannot be selected on the server. The
server retains the active native release, its checksum-verified archive, and
the shared persistent data directory. Live health remained green after cleanup,
and free server space increased to 16 GB; C: retained 12.8 GB free. Git history
remains the audit and recovery record and was not destructively rewritten. No
Google or Meta grant, provider token, message, email, calendar event, Drive
file, advertisement, WhatsApp, SMS, order, payment, or supplier contact was
created by this release or its verification.

## Exact industrial-payment production release

- Source checkpoint: `700501f25312`
- Release ID: `20260822-091622-700501f25312`
- Build ID: `1787390127862`
- Artifact SHA-256:
  `774a6c3a097613dcf8df38fdc8c0873b0da3ebf176670de003e54aa2f44b50b1`
- Artifact size: `98735169` bytes (`94.16 MiB`)
- Active release:
  `/var/www/exportunity/releases/20260822-091622-700501f25312`
- Previous native application release retained for rollback:
  `/var/www/exportunity/releases/20260822-084707-7c61b3581fa3`

This release corrects the industrial-order payment boundary without changing
the approved interface. An industrial payment is now bound to the canonical
`total_amount_minor` integer and checked against the stored formatted total,
currency exponent, provider amount, and provider currency using exact decimal
parsing. Missing or mismatched provider values fail closed. Fractional-currency
orders require the Flutterwave v4 rail; the v3 path cannot round such an order
into a different amount. The v4 charge serializer preserves the exact decimal
in the request body without converting it through JavaScript floating-point
arithmetic.

All 33 focused commercial-offer, commercial-transaction, industrial-payment,
Flutterwave, and fulfilment tests passed, followed by the full unit suite,
route generation and parity, TypeScript, the local production build, artifact
surface verification, the remote Node 24.19.0 image build, health checks, and
client/server build parity. No dependency or schema change was required. The
production read-only audit found zero `industrial_orders` and zero payments
with purpose `INDUSTRIAL_ORDER_PAYMENT` before any live payment use.

The live build reports a clean `700501f25312` source stamp and preserves the
exact `global-trade-network` surface, `GlobalTradeHomePage`, homepage SHA-256
`0f4e73496ffa9cd34d017026efe9aed5efbfcb8925d3f5eaa99576dfb57b68b2`,
and `legacyHomepageRetired: true`. A browser check rendered the white-and-gold
GTN homepage with Awa Kouadio, GDIZ-backed products, corridor exploration, and
the native trade navigation; the browser error log was empty. Because the
homepage source hash is unchanged from the preceding desktop and 390 x 844
mobile verification, the tested mobile interface is preserved byte for byte.

Unauthenticated customer-order access and the correct Flutterwave payment-init
route both returned HTTP 401. A redacted environment-name audit confirmed that
the three Flutterwave v4 credential categories and webhook hash are present;
no credential value was read or printed. No payment row, provider charge,
order, message, email, calendar event, Drive file, Meta action, WhatsApp, SMS,
or supplier contact was created by deployment or verification. The server
retains two checksum-verified Exportunity release archives and approximately
15 GB free.

## Exact internal-procurement authorization release

- Source checkpoint: `f0d9bf9e04ec`
- Release ID: `20260822-101245-f0d9bf9e04ec`
- Build ID: `1787393517136`
- Artifact SHA-256:
  `a148555020b244573ff3a7335ff3920c6ded3be249c43236c8288de6ba9625e7`
- Artifact size: `98753055` bytes (`94.18 MiB`)
- Active release:
  `/var/www/exportunity/releases/20260822-101245-f0d9bf9e04ec`
- Previous native application release retained for rollback:
  `/var/www/exportunity/releases/20260822-091622-700501f25312`
- Pre-migration production backup:
  `/var/backups/db/exportunity-pre-procurement-f0d9bf9e04ec-20260822T101001Z.dump`
- Backup SHA-256:
  `9708d42de65548b9b8389462cccdcbb7c0f2621b488a3e21f283fab8c71585e4`
- Backup size and validation: `29909925` bytes, PostgreSQL custom dump,
  `PGDMP` header, `6928` readable catalog entries
- Applied migration:
  `20270524_exportunity_procurement_authorizations.sql`
- Migration SHA-256:
  `12c76613a22e6ac63940c2dde6228b2880699151265553f44e8480aa05abe4c7`

This release adds a tenant-scoped, exact-money, internal-only procurement
authorization ledger for paid industrial orders. Preparation binds the accepted
customer quote, successful canonical payment, qualified supplier quote, active
and verified Exportunity-internal supplier profile, fulfillment plan, and
accountable procurement service into a deterministic release hash. Every amount
is stored as `numeric(30,0)` minor units and the database enforces the cost-stack
and margin algebra. Administrator approval re-evaluates the live evidence before
moving the internal order and fulfillment state to procurement.

The ledger is deliberately unable to represent supplier contact, purchase-order
submission, or any other external commitment. Database checks require
`external_action_executed`, `supplier_contacted`, and
`supplier_commitment_created` to remain false and require the external reference
to remain null. The prior generic fulfillment transition can no longer bypass
the exact authorization evidence. The native commercial deal room exposes the
preparation and approval controls to governed staff while keeping supplier costs
out of customer responses.

The migration was applied twice with `ON_ERROR_STOP` to disposable PostgreSQL
clone `exportunity_procurement_proof_20260822_0935` before production; the first
proof exposed PostgreSQL identifier truncation, the names were shortened, and a
fresh repeated proof passed without truncation. The proof database was dropped.
Production was then backed up and audited before the additive migration. The
new table started with zero rows and contains four database checks, six indexes,
five exact `numeric(30,0)` amount columns, and the expected
`approval_required`, `approved`, and `cancelled` states. Production remained at
zero industrial orders and zero industrial-order payments before and after the
release.

All 20 focused procurement, fulfillment, payment, and commercial-transaction
tests passed after the final supplier-profile boundary correction, followed by
the full unit suite, route verification, TypeScript, the local production build,
artifact verification, the remote Node 24.19.0 image build, health checks, and
client/server build parity. The repository's documented
`test:bdo:postgres:contract` command was not available in `package.json`; no
equivalent script was found, so it is not represented as a passing gate.

The live build preserves `global-trade-network`, `GlobalTradeHomePage`, homepage
SHA-256
`0f4e73496ffa9cd34d017026efe9aed5efbfcb8925d3f5eaa99576dfb57b68b2`,
and `legacyHomepageRetired: true`. Browser verification rendered the native
white-and-gold homepage with `Trade. Source. Expand. Operate.`, Awa Kouadio,
GDIZ-backed products, corridors, and the current navigation with an empty
browser log. The retired corporate-marketing headline remained absent. Both new
procurement write routes returned HTTP 401 without authentication. No fake
production order was inserted and no payment, supplier contact, purchase
commitment, provider action, message, email, calendar event, Drive file, Meta
action, WhatsApp, or SMS was created. The server retains two release directories
and two checksum-verified archives with approximately 15.8 GB free; C: retains
approximately 12.0 GB free.

## Exact internal supplier purchase-order package release

- Source checkpoint: `73aba6553564`
- Release ID: `20260822-111127-73aba6553564`
- Build ID: `1787397045010`
- Artifact SHA-256:
  `8dd5d53b3601af130c23f34fda2854ad1b888491dec9f7ba1475fd29ec2a437e`
- Artifact size: `98768792` bytes
- Active release:
  `/var/www/exportunity/releases/20260822-111127-73aba6553564`
- Previous native application release retained for rollback:
  `/var/www/exportunity/releases/20260822-101245-f0d9bf9e04ec`
- Pre-migration production backup:
  `/var/backups/db/exportunity-pre-supplier-po-73aba6553564-20260822T111300Z.dump`
- Backup SHA-256:
  `3d685b8f8bb8dcb955bbbf5de6b016b7ac6bac976dabd0435b822430c41b5bb7`
- Backup size and validation: `29948386` bytes, PostgreSQL custom dump,
  `PGDMP` header, `6963` readable catalog entries
- Applied migration:
  `20270525_exportunity_supplier_purchase_order_packages.sql`
- Migration SHA-256:
  `f46657261847297aa35c2a10f0f42f50cd36c111aa85f7dfe829cc2260b7ec1b`

This release extends the native commercial deal room with an exact internal
supplier purchase-order package after approved procurement authorization. It
binds the paid order, accepted customer quote, qualified supplier quote,
verified Exportunity-internal supplier, exact supplier total, product,
quantity, specification, destination, incoterm, payment terms, lead time, and
current supplier-quote validity into a deterministic package hash. The amount
is stored as `numeric(30,0)` minor units and is reconciled again from canonical
supplier evidence before both preparation and approval.

The package is intentionally not a supplier-facing purchase order. Its database
contract requires `external_action_executed`, `transmitted_to_supplier`, and
`supplier_accepted` to remain false and requires the external purchase-order
reference to remain null. Administrator approval produces only the internal
`approved_for_submission` state. Supplier transmission, acceptance, payment,
and commitment remain separate action-time-approved workflows with their own
future receipts.

Migration `20270525` was applied twice with `ON_ERROR_STOP` to disposable
production clone `exportunity_supplier_po_proof_20260822_1115`. Both passes
completed without identifier-truncation warnings. The new table had zero rows,
five check constraints, six indexes, one exact `numeric(30,0)` column, and the
expected `approval_required`, `approved_for_submission`, and `cancelled` enum
states. The disposable database and its temporary dump were removed before the
production backup and additive migration.

All 21 focused payment, procurement, supplier-package, and fulfillment tests
passed, followed by the full unit suite, route verification, TypeScript, the
local production build and surface-quality gate, artifact verification, the
remote Node 24.19.0 image build, health checks, and client/server build parity.
Both new write routes return HTTP 401 without authentication. Production had
and retained zero industrial orders, industrial-order payments, procurement
authorizations, and supplier purchase-order packages; deployment created no
commercial record or external action.

The live browser rendered the native white-and-gold Global Trade Network with
`Trade. Source. Expand. Operate.`, Awa Kouadio, GDIZ content, and no browser
warnings or errors. The retired corporate-marketing headline and Mindbase were
absent. The exact homepage source SHA-256 remained
`0f4e73496ffa9cd34d017026efe9aed5efbfcb8925d3f5eaa99576dfb57b68b2`,
and `legacyHomepageRetired` remained true. Two native release directories and
two checksum-verified release archives are retained; the small `releases/data`
runtime directory is 8 KB and is not an application release. The server has
approximately 15 GB available and C: has approximately 14.31 GB available.

## Physical legacy-interface cleanup release

- Source checkpoint: `922140ce65d0`
- Release ID: `20260822-112934-922140ce65d0`
- Build ID: `1787398127134`
- Artifact SHA-256:
  `96ba4cb797fd3e20cc324ac7c41273d562d10f3c817be403f72d015740999c65`
- Artifact size: `98767460` bytes
- Active release:
  `/var/www/exportunity/releases/20260822-112934-922140ce65d0`
- Previous native application release retained for rollback:
  `/var/www/exportunity/releases/20260822-111127-73aba6553564`

This release physically deletes the unreferenced legacy
`client/src/pages/HomePage.tsx` company dashboard. That dead renderer queried
the historical companies, meetings, agents, and message APIs but had no import
and no route. Useful APIs and their data remain intact. The Exportunity surface
gate and regression suite now fail if this legacy file is recreated.

The retired black corporate-marketing renderer was already absent from source,
and its historical URLs remain explicit redirects into the current GTN and
governed application surfaces. The old map storefront remains source-owned by a
different shared tenant and is compile-time excluded from the Exportunity
runtime. Both the local and deployed `dist` trees contain zero occurrences of
the legacy corporate headline, Cocody-location copy, Google Maps rejection
banner, old marketplace account text, or Mindbase branding.

The 35 focused public-surface and interface-consolidation tests passed,
including current GTN workspaces for orders, contacts, meetings,
notifications, operations, governance, communications, and agent records.
Route verification, TypeScript, the full unit suite, local production build,
surface-quality gate, remote image build, deploy health checks, and
client/server parity also passed. A fresh live browser page rendered the
canonical hero, Awa Kouadio, and GDIZ content with no browser warnings or
errors. The canonical homepage SHA-256 and `legacyHomepageRetired: true` lock
were unchanged.

No database migration was required for this source-only cleanup. Production
retained zero industrial orders, industrial-order payments, and supplier
purchase-order packages. The server retains exactly two native application
releases and two release archives, with approximately 15 GB available.

## Delivery-bound actual-cost and margin-recognition release

- Source checkpoint: `40608aad20f1`
- Release ID: `20260822-121036-40608aad20f1`
- Build ID: `1787400636051`
- Artifact SHA-256:
  `719c68d190418f6d7384b084c11da04124aa4698c6a5bfb85a1111137348aa50`
- Artifact size: `98795759` bytes
- Active release:
  `/var/www/exportunity/releases/20260822-121036-40608aad20f1`
- Previous native application release retained for rollback:
  `/var/www/exportunity/releases/20260822-112934-922140ce65d0`
- Pre-migration production backup:
  `/var/backups/db/exportunity-pre-delivery-accounting-40608aa-20260822T120800Z.dump`
- Backup SHA-256:
  `9162650e61ea81e30abc1db898f12d9125fd0adb1bb37a25167766058ea4b302`
- Backup size and validation: `29965808` bytes, PostgreSQL custom dump,
  `PGDMP` header, `6984` readable catalog entries
- Applied migration:
  `20270605_exportunity_delivery_accounting.sql`
- Migration SHA-256:
  `8a7c784fbc976ba0dc6bd50cc417c01639ca52d7cb89ad554f205ab5c70ae049`

This release adds a private, immutable actual-cost ledger and delivery-bound
revenue and gross-margin recognition to the native industrial commercial deal
room. Supplier, inspection, freight, customs, last-mile, duties and taxes,
banking/provider fees, and other costs are recorded in exact integer minor units
with attributable evidence. Corrections are additive reversal entries rather
than edits or deletes. Supplier costs bind the approved internal supplier
purchase-order package, while service costs bind the corresponding fulfillment
service.

A recognition proposal revalidates the accepted exact customer quote,
successful exact payment, approved procurement authorization, approved internal
supplier package, delivered fulfillment plan, immutable delivery-proof event,
and complete actual-cost ledger. It then calculates exact revenue, actual cost,
actual gross margin, planned cost and margin, and their variances without binary
floating-point arithmetic. Staff may prepare the record; a tenant administrator
must approve it. The tables cannot represent an external accounting journal,
and the customer-facing summaries do not expose private costs or margin.

Migration `20270605` was applied twice with `ON_ERROR_STOP` to disposable
production clone `exportunity_delivery_accounting_proof_20260822_1207`. Both
passes completed without identifier-truncation warnings. The proof contained
eight `numeric(30,0)` columns, 12 check constraints, ten indexes, four triggers,
the expected cost categories, and the `approval_required` and `recognized`
states. The proof database, dump, and temporary migration copy were removed
before production backup and the additive production migration.

The 16 focused payment, procurement, supplier-package, fulfillment, and
delivery-accounting tests passed, followed by the full unit suite, route
verification, TypeScript, the local production build and surface-quality gate,
artifact verification, the remote Node 24.19.0 image build, health checks, and
client/server parity. The documented `test:bdo:postgres:contract` command is not
present in this checkout's `package.json`; it was attempted, returned the npm
missing-script error, and is not represented as a passing gate.

Production retained zero industrial orders, industrial-order payments,
procurement authorizations, supplier packages, actual-cost rows, and recognition
rows. Each of the three new write routes returns HTTP 401 without
authentication. No commercial or financial record, external journal, provider
action, supplier contact, payment, message, WhatsApp, SMS, or email was created.

The deployed browser rendered the canonical white-and-gold Global Trade Network
with `Trade. Source. Expand. Operate.`, Awa Kouadio, and GDIZ content. It reached
`complete` ready state with no broken images or visible runtime-error surface.
The retired black corporate-marketing headline, old map error and storefront
copy, and Mindbase remained absent. The homepage source SHA-256 remains
`0f4e73496ffa9cd34d017026efe9aed5efbfcb8925d3f5eaa99576dfb57b68b2`,
with `legacyHomepageRetired: true`. The server retains exactly two native
application releases and two checksum-verified archives with approximately
15 GB free; C: retains approximately 12.76 GB free.

## Delivered-relationship continuity and isolated-interface release

- Relationship-continuity source checkpoint: `7afba60`
- Interface-isolation source checkpoint: `fbcd2740c947`
- Release ID: `20260822-130017-fbcd2740c947`
- Build ID: `1787403506454`
- Artifact SHA-256:
  `772825a4ea6c9bb3ddf47ebb1ab7e59dbc56966286a9c4260d85c407c6d4b3d3`
- Artifact size: `98811523` bytes
- Active release:
  `/var/www/exportunity/releases/20260822-130017-fbcd2740c947`
- Previous native application release retained for rollback:
  `/var/www/exportunity/releases/20260822-121036-40608aad20f1`
- Pre-migration production backup:
  `/var/backups/db/exportunity-pre-relationship-continuity-fbcd2740c947-20260822T130419Z.dump`
- Backup SHA-256:
  `68d562c27b8c109e1fc41e186baca3bef27d4ab8b8f829a92d0ea78bea162db6`
- Backup size and validation: `30003357` bytes, PostgreSQL custom dump,
  `PGDMP` header, `7028` readable catalog entries
- Applied migration:
  `20270606_exportunity_relationship_continuity.sql`
- Migration SHA-256:
  `94b61695ee290a30082810f2b44284a231d90494faecb6ee5b621b0b0d8cfd57`

This Phase H release turns a recognized, delivered industrial trade into
immutable internal customer-and-supplier memory. The record binds the exact
recognized revenue, cost and gross margin, delivered fulfillment evidence,
customer contact, requirement, approved internal supplier package, supplier,
product, specification, quantity, origin and destination. All money remains in
exact `numeric(30,0)` minor units. The memory stores its source snapshot,
evidence hash and deterministic memory hash and cannot be updated or deleted.

Each memory receives one governed continuity review. Staff can review a
deterministic cadence or select a future internal review date; a tenant
administrator must approve the complete evidence checklist and reason. Consent,
opt-out and do-not-contact state remain visible internal memory. The database
and service contract permanently keep external authorization and execution
false and the external message reference null. Recognition and review create no
new order, opportunity, email, SMS, WhatsApp message, supplier contact or other
external action. Approved and due continuity items can be reconstructed in
Company Brain without giving that read model any send mutation.

Migration `20270606` was applied twice with `ON_ERROR_STOP` to disposable
production clone `exportunity_relationship_continuity_proof_20260822_1325`.
Both passes completed without identifier-truncation warnings; the disposable
database, dump and temporary migration copy were removed. Production was then
backed up before the additive migration. The two new tables started and remain
at zero rows. Their schema contains three exact `numeric(30,0)` fields, five
check constraints, ten indexes, six database triggers, and only the
`review_required` and `approved_internal` states. Production retained zero
Exportunity industrial orders, industrial payments, procurement
authorizations, supplier packages, actual-cost rows and revenue-recognition
rows before and after the release.

The same release closes the remaining presentation-artifact leak. The dedicated
Exportunity build now emits an Exportunity-only document shell and manifest,
uses a native cream, white, navy and gold install screen, and physically prunes
cross-project tenant directories, manifests, favicons and gateway artwork from
the browser artifact. The surface gate now fails if those files, the generic
legacy document metadata, the retired corporate-marketing interface, or a
cross-project install renderer returns. The protected homepage source itself
was not edited: its SHA-256 remains
`0f4e73496ffa9cd34d017026efe9aed5efbfcb8925d3f5eaa99576dfb57b68b2`,
with `global-trade-network`, `GlobalTradeHomePage`, and
`legacyHomepageRetired: true` unchanged.

The final 15 focused relationship-reconstruction, delivery-accounting and
relationship-continuity tests passed under Node 24.19.0, followed by TypeScript,
route verification, the full unit suite, the production build, the strengthened
surface gate and the public-surface quality gate. The remote Node 24.19.0 image
build, health check and deploy verifier passed with client/server build parity.
The host and live-container main bundle SHA-256 both equal
`087cd1674737551d81197ae7c8b032e11ca036605b88182c401e347519c83ef7`.
The continuity-approval and Company Brain relationship-reconstruction endpoints
both return HTTP 401 without authentication.

Live browser verification reached complete ready state on the current
white-and-gold GTN homepage. It rendered `Trade. Source. Expand. Operate.`, Awa
Kouadio, GDIZ-backed products and the current trade navigation with no broken
images or visible runtime-error surface. The retired marketing headline, old
Cocody/map-error storefront and Mindbase identity were absent from the rendered
page. `/install` rendered the new Exportunity-native screen with no broken
images, visible error or cross-project identity. Temporary QA tabs were closed.

No commercial record, payment, provider mutation, external journal, supplier
contact, message, email, calendar event, Drive file, Meta action, WhatsApp or SMS
was created by migration, deployment or verification. The server retains two
native application releases and two checksum-verified archives with
approximately 15.7 GB available. Seven obsolete local release archives and
their metadata were deleted after a dry run, reclaiming `729734746` bytes; the
current local release remains and C: has approximately 13.54 GiB free.

## Proximity-first Marketplace homepage release — 2026-08-23

- Source commit: `44ad51df10f6`
- Active release: `/var/www/exportunity/releases/20260823-135246-44ad51df10f6`
- Build ID: `1787493165668`
- Runtime: Node `24.19.0`
- Public-surface revision: `5`
- Homepage component: `MarketplacePage`
- Homepage source SHA-256:
  `0c40d6a498340288889fc3d9e112df085442cbc0f7018ce41b131deb014c2816`

The public root now renders the unified Exportunity Marketplace directly. It
starts at a 10 km radius around the visitor, exposes deliberate 50 km, 250 km,
1000 km, and global widening, and keeps commerce/products and Industrial as
separate filters in the same marketplace. The current map, Awa commercial
assistant, evidence labels, and Global Trade Network design remain native to
Exportunity. The former Global Trade overview remains available on the
specialized source, sell/export, supply-management, and expansion routes; it no
longer displaces the marketplace at `/`.

The numeric proximity filter excludes distance-unknown and out-of-radius
listings after location becomes active. Live browser verification confirmed
`Position active`, `10 km autour de vous`, the unified category controls, and
an honest empty-nearby state when no verified shop or factory exists inside the
current circle. No retired corporate homepage, old Zone renderer, or Mindbase
identity rendered, and the browser warning/error log was empty.

The surface lock, route checks, focused homepage/legacy contracts (54 tests),
full TypeScript check, unit suite, production build, artifact guard, remote
container build, and live build-parity verification passed. Live metadata
returned Git `44ad51df10f6`, build `1787493165668`, surface revision `5`,
`MarketplacePage`, `legacyHomepageRetired: true`, and no build mismatch.

The same release includes the reviewed legacy-seed audit. It ran in production
inside a repeatable-read, read-only transaction across all 10 expected tables.
It found zero directly marked rows, zero staff/territory/agent candidates, zero
marked wallet/task/token/cron/audit records, selected
`no_direct_seed_marker_found`, and returned `databaseChanged: false`. No cleanup
migration or record mutation was needed or performed.

No provider setting, database migration, external message, payment, supplier
contact, or background process was created by this release or its verification.
Rebuildable local bundle and cache artifacts were removed after deployment; C:
retained approximately 10.51 GiB free.

## Exportunity-native Meta target evidence — 2026-08-23

A credential-free, repeatable-read production audit confirmed one active native
`meta_business` connection under account label `Vital Sounouvou`, Graph `v25.0`,
all five required discovery/engagement scopes, and an expiry of 2026-10-20. The
native OAuth/vault runtime is configured. The official publication adapter and
social-webhook ingestion flags remain false, and webhook verification is not
fully configured.

Governed read-only Meta discovery recorded Action runs `1` for Facebook and `2`
for Instagram. Facebook returned `On by Exportunity` plus the published,
zero-follower restart Page `Exportunity`; Instagram returned no linked
professional account. Public Page metadata showed that the inaccessible hacked
legacy Page was not among the account's manageable Pages.

Selection Action run `3` bound only `Exportunity` as native Facebook target `1`
with `authorized`/`healthy` status and an
`exportunity_integration_connections` relationship. A subsequent read-only
audit confirmed exactly one Meta target and no missing connection scope. The
selection changed only governed Exportunity records. It did not change Meta
administrators, Page content, provider settings, webhook subscriptions, posts,
messages, ads, or Instagram state, and it exposed no credential.

The intended Edge session could be listed but could not be captured by the
Windows-control runtime; the initial attempt and one refreshed-handle recovery
both failed with Windows error `0x80004002`. No Edge input was issued after the
required recovery stop. Company-email administration and remaining private Meta
console evidence therefore remain external handoffs.

## Rollback and recovery

- Application rollback uses the previous release symlink and does not reverse
  the additive schema.
- Do not drop the new tables or columns as a routine rollback; preserve financial,
  supplier, communication, quote, and audit evidence.
- Correct schema defects with a new additive forward-fix migration.
- Restore the checksum-verified backup only for a separately reviewed disaster
  recovery event, not for an ordinary application rollback.
