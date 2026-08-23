# Territory Media-to-Commerce: Repository Truth and First Vertical Slice

Date of source audit: 2026-08-17
Repository: `Exportunity-Gold-Exchange/exportunity-industrial-release-20260801`
Active branch: `codex/exportunity-industrial-20260801`

This report integrates the Territory Media-to-Commerce mandate into the industrial restoration already underway. It does not reset, replace, or claim completion of the wider trading-company objective.

## Confirmed repository and deployment truth

- The local worktree contains the ongoing industrial, trade-intelligence, communications, payment, fulfillment, newsroom, attachment-review, carrier, and group-buying implementation. It is intentionally dirty because those uncommitted changes are part of the current restoration.
- Local route verification and TypeScript compilation pass after this package.
- No production migration, deployment, provider authorization, credential creation, advertising spend, social publication, external message, live payment, factory instruction, carrier booking, refund, or settlement was performed.
- The production database contents, deployed commit/SHA, migration state, provider accounts, callback registrations, sender ownership, social permissions, ad-account health, payment capabilities, factory capacity, carrier contracts, refund capabilities, and settlement capabilities remain `UNKNOWN_REQUIRES_PRODUCTION_ACCESS` until verified in the intended environments.
- Edge is connected through the visible browser-control session. Google Cloud is authenticated to the intended `exportunity-ai` project; Meta for Developers is authenticated and a dedicated Exportunity app is staged at the final creation/terms boundary; Twilio remains at its private login boundary. No OAuth client, provider app, API key, callback, permission grant, sender, message, campaign, post, or secret was created or changed. The dated private-console evidence and remaining confirmation gates are recorded in `03-provider-authorization-readiness.md`.

## Existing components preserved

| Area | Actual implementation found | Classification | Extension decision |
| --- | --- | --- | --- |
| Geography | `geo_territories` supports tenant scope, parent hierarchy, country/region/city/district/neighborhood types, OSM source references, GeoJSON, bounding boxes, centers, radii, language, currency, and active/suspended state. | `WORKING_BUT_UNCONNECTED` operationally | Keep it canonical. `territory_operational_profiles` references it; no Battuta/geography replacement and no copied coordinates. |
| Territory budgets | `territory_budgets` provides monthly funded/spent/cap and low-power/funded mode. | `PARTIAL` | Reuse as the TerritoryBudget foundation. Envelope categories, authorization evidence, and direct tenant column remain later work. |
| Territory scorecards | `territory_kpis` provides monthly GMV, fees, orders, buyers, sellers, delivery time, and dispute rate. | `PARTIAL` | Reuse as the TerritoryScorecard foundation. Media-to-commerce north-star fields remain later work. |
| Territory UI/API | Territory management/detail pages, OSM import, hierarchy, map, budgets, KPIs, chat, audit activity, and assignment endpoints exist. Some chat “actions” only logged next-step text. | `PARTIAL` | Add the operating layer inside the existing Territory Hub. Do not create a second territory product. |
| CMS/media | `marketing_media_items`, posts, press, library, assets, discovery runs/sources, public media pages, and an admin review queue exist. | `WORKING_BUT_UNCONNECTED` to rights | Keep the CMS record canonical. Add a one-to-one source-reference extension and a rights ledger. |
| Creator profiles | Mindbase `creator_profiles` supports tenant user/creator identity and public profile data. | `WORKING_BUT_UNCONNECTED` | Preserve it. Rights grants accept an optional creator profile reference; external discovered creators are not forced into fake user accounts. |
| Agent OS | Runtime agents, role seats, tasks, budgets, governance, visibility, evidence, and organization synchronization exist. | `PARTIAL` | Reuse `agent_tasks`; territory preparation creates zero-budget paused tasks and does not start 48/126 continuously running agents. |
| Central Actions | Generic `action_definitions`, `action_runs`, and `action_evidence` plus the external-channel Action Router exist. | `PARTIAL` | Territory preparation/activation, rights grant/revoke, CMS publish, and manual social-publication preparation use the generic central Action service with evidence. External channels retain their stricter Action Router policy. |
| Commercial chain | Requirements, opportunities, supplier candidates, RFQs, quotes, offers, negotiation, orders, procurement, payment, inspection, freight/customs, last mile, delivery, group campaigns, production batches, settlement preparation, and immutable ledger work are present in the industrial slice. | `WORKING` in source; provider release-gated | Reuse all of it. Group campaigns can bind territory and rights-cleared media while canonical orders, payments, fulfillment, carrier authority, and delivery stay authoritative. |
| Payment | Server-authoritative industrial payment and Flutterwave integration plus protected fulfillment state exist in source. | `PARTIAL` / provider release-gated | Do not call it escrow and do not assert reservation/release capabilities without provider evidence. |
| Logistics | Fulfillment state machine, delivery evidence, tenant carrier registry, exact coverage evidence, structured carrier quotes, and internal booking authority exist in source. | `PARTIAL` / provider release-gated | Reuse the canonical fulfillment ledger. Official carrier adapters, live account verification, provider submissions/receipts, and real country-by-country coverage remain open. |
| Trade intelligence | Provenance-backed graph, source monitoring, demand/zero-result signals, research queue, newsroom, public trade pages, and command center exist in source. | `PARTIAL` / real source corpus open | Reuse. Territory coverage should consume this evidence rather than run a parallel research graph. |

## Evidence-backed gap matrix

The mandate's required status vocabulary is used literally.

| Capability | Status before this package | Evidence or gap after this package |
| --- | --- | --- |
| Canonical neighborhood geography | `WORKING` | Preserved in `geo_territories`; activation blocks non-neighborhood records and geography without an OSM/source reference or explicitly confirmed manual evidence. |
| Operational territory profile | `MISSING` | Implemented in source by `territory_operational_profiles`. Deployment migration remains open. |
| Territory activation with approval | `PARTIAL` | Implemented in source as prepare → blocked/approval-required → active, with separate central Actions, evidence, audit, idempotency, and one-active constraint. |
| Territory team | `PARTIAL` | `territory_agent_teams` plans roles while existing `agent_tasks` holds work. Agent binding and runtime authorization remain open. |
| Territory budget | `WORKING_BUT_UNCONNECTED` | The existing monthly `territory_budgets` row remains canonical, while the existing governed `ad_budget_envelopes` hierarchy is now exposed credential-free in the Territory Hub. Envelope preparation/approval and spend authorization remain separate central Actions; provider spend remains absent and release-gated. |
| Territory coverage snapshot | `MISSING` | Seven required dimensions now persist with evidence and gaps. Real coverage is not fabricated or seeded. |
| Territory scorecard | `PARTIAL` | Migration `20270422` extends the canonical `territory_kpis` row with nullable, field-evidenced media-to-commerce metrics. Migration `20270423` now binds a completed industrial order, its exact succeeded payment, delivered fulfillment plan, and one provider-confirmed, rights-cleared ad/publication touchpoint into the existing conversion/attribution ledgers. The Territory Hub can preview a checksum-bound projection from verified attribution, reconciled media spend, group buying, social leads, rights, and publications, then record it through the existing `TERRITORY_SCORECARD_RECORD` Action. Producer income, margin, sessions, acquired customers, full attempt denominators, disputes, refunds, and repeat buyers remain explicitly unknown until canonical ledgers exist. Production migrations and real evidence remain open. |
| Activation-generated work queues | `MISSING` | Eleven bounded tasks are created `paused`, zero-budget, provenance-required, and external-action-forbidden. No worker is started. |
| Growth, Media & Territory department | `PARTIAL` | Role plans exist in the activation team and the industrial organization has media/compliance capabilities. Full 48-role runtime/tool catalog remains later work. |
| Source content reference | `MISSING` | Implemented as a provenance extension of `marketing_media_items`; it stores the source link/creator evidence and not a copied asset. |
| Creator/producer/subject/music rights gate | `BROKEN` | Fixed for all new CMS publish transitions. A valid, current, in-scope grant plus evidence and cleared/not-required consents is mandatory. |
| Rights revocation/timeline | `MISSING` | Immutable rights events and revocation state now block future publication attempts. Takedown intake UI remains `PARTIAL`. |
| Accurate publication states | `PARTIAL` | The exact official-platform state vocabulary now exists with an immutable attempt/event ledger. A manual handoff is always `MANUAL_REQUIRED`; database constraints prevent a manual package from becoming `PUBLISHED`, and every `PUBLISHED` state requires provider-confirmed and published timestamps. Live provider transitions remain release-gated. |
| Legacy published-media rights | `UNKNOWN_REQUIRES_PRODUCTION_ACCESS` | Existing published rows are flagged for remediation and are not silently removed. A production read-only audit is required. |
| Social platform adapters | `PARTIAL` | The provider-neutral contract, non-secret target/health model, Mindbase credential reuse, OAuth scope evidence, readiness API, and manual fallback remain canonical. A disabled-by-default official Meta slice now performs one confirmed Facebook Page image/link publication or Instagram single-JPEG container/publication flow, resolves the Page credential transiently, precommits an attempt before provider mutation, records credential-free receipts, requires provider read-back before `PUBLISHED`, and leaves unfinished Instagram containers in `PROCESSING` for explicit foreground continuation. YouTube/TikTok/LinkedIn/X outbound adapters, Meta video/carousel/scheduling, live app review, business-target verification, controlled provider receipts, and production release remain open. |
| Social inbox → CRM | `PARTIAL` | Verified provider-neutral social events now project idempotently into the canonical Team Inbox, work orders, tenant CRM leads where eligible, paused Agent OS review tasks, evidence, and audit. The exact 13-class intent/moderation vocabulary is deterministic and visible. Social replies are disabled until an official adapter plus approved facts, prices where applicable, policy, tone, and human approval exist. Live platform permissions, callbacks/pollers, and controlled receipts remain release-gated. |
| Advertising accounts/budgets/spend | `PARTIAL` | The 11 required tenant-scoped entities model non-secret account evidence, hierarchical envelopes, media plans, campaigns/ad sets/creatives, internal spend authority, immutable charge reconciliation, conversions, attribution, and incidents. `20270423` extends—not replaces—the conversion/attribution ledgers with one-order/one-touchpoint canonical binding, database tenant/order/payment/delivery/source/provenance guards, idempotency, central Action evidence, and an accountable admin reconciliation surface. Provider campaign submission and spend remain absent; live account/app review, billing, adapter, and provider evidence remain release-gated. |
| Studio/rendering | `PARTIAL` | CMS/assets and image generation exist. Timeline editing, render jobs, versions, rights-aware asset provenance, and provider-neutral rendering remain open. |
| Group order/production batch | `PARTIAL` | `REAL` in source and provider release-gated. Migration `20270418`, runtime parity, nine central Actions, public Producer Exchange, admin workspace, exact campaign/commitment/batch/settlement states, verified tier math, territory/media-rights linkage, canonical paid-order binding, production allocation, carrier handoff, delivery, updates, events, and balanced settlement preparation now exist. Interest remains non-binding, investment language is blocked, and no second checkout, inventory reservation, production start, provider settlement, or refund execution is claimed. |
| Carrier registry/adapter | `PARTIAL` | Migration `20270417`, runtime parity, central Actions, provider-neutral adapter contract, admin workspace, exact route/cargo/capability matching, structured quote comparison, incident restrictions, and paid-order booking gates now exist in source. Candidate, verified-provider, contracted-partner, internally-approved, provider-submitted, and provider-confirmed states remain distinct. No adapter is registered and no carrier was contacted or booked; the 54-country coverage program remains evidence-gated. |
| Regulated capital rail | `OBSOLETE` for this commerce slice | Disabled by doctrine. Ordinary product purchases and group orders must not be represented as investments. |

## First vertical slice

The proposed real pilot is one evidence-backed neighborhood in one currently active Exportunity country, one producer category, central/country social accounts with territory attribution, one verified payment path, one verified delivery path, one rights-cleared show format, and one approved monthly media envelope.

The exact neighborhood is deliberately not hardcoded. Select it only after the intended database confirms:

1. a canonical neighborhood record and source evidence;
2. a real producer/product that can be ordered;
3. a provider-supported protected-payment path;
4. a verified carrier/serviceability path;
5. creator/producer/subject/music rights evidence;
6. a bounded budget and accountable approver.

The end-to-end acceptance path is:

`source reference → producer discovery → rights/consent → interview/media project → reviewed content → attributed lead/order → protected payment → verified carrier → handoff/delivery evidence → approved settlement → territory scorecard/playbook evaluation`

The workflow is not accepted if it stops at publication.

## Migration and rollback sequence

1. Apply and verify existing industrial/trade migrations `20270406` through `20270412` in order.
2. Apply `20270413_exportunity_territory_media_commerce_foundation.sql`.
3. Apply `20270414_exportunity_social_publication_foundation.sql` only after `20270413` and Mindbase connection tables are present.
4. Apply `20270415_exportunity_social_inbox_foundation.sql` after the canonical communications, contacts/CRM, Agent OS task, and `20270414` target tables exist.
5. Apply `20270416_exportunity_advertising_governance.sql` after `20270414`; it references targets, Mindbase connections, geography, media rights, and the canonical CMS.
6. Apply `20270417_exportunity_carrier_network_foundation.sql` after `20270410` and after Mindbase integration connections exist. It extends the canonical fulfillment service; it does not create a competing order or delivery ledger.
7. Apply `20270418_exportunity_group_buying_foundation.sql` after the canonical industrial/catalog/order/payment/fulfillment tables, `20270417`, territory/media rights, CRM, and Mindbase dependencies exist. It extends commerce with campaigns and production evidence; it does not create a competing payment, carrier, fulfillment, or refund ledger.
8. Apply `20270419` through `20270421` in order for the interview/media studio, canonical social target selection, and signed Meta receipt ledger.
9. Apply `20270422_exportunity_territory_media_commerce_scorecards.sql`. It alters the existing `territory_kpis` table and does not create a parallel scorecard or budget table.
10. Apply `20270423_exportunity_canonical_commerce_attribution.sql` after the industrial order/payment/fulfillment, social publication, advertising, and scorecard migrations. It alters the existing `conversion_events` and `attribution_records` ledgers and does not create a parallel commerce ledger.
11. Verify tenant/territory/media foreign keys, one profile per territory, one active activation, activation idempotency, coverage indexes, rights-grant indexes, publication idempotency, exact state constraints, manual-not-published enforcement, provider-confirmation enforcement, social-event idempotency/verification evidence, ad-account tenant uniqueness, every hierarchical cap, approval-state constraints, ACTIVE provider confirmation, spend-ledger idempotency, attribution weight bounds, one verified attribution per industrial order, exact order/payment/delivery/source/provenance database triggers, carrier partnership truth, exact coverage evidence, credential exclusion, quote validity, booking approval, signature verification, fulfillment carrier foreign keys, commerce-only group-campaign truth, price-tier ranges, paid thresholds, batch allocations/quantities, provider-confirmed handoff, complete delivery, balanced settlement/refund exposure, settlement submission/confirmation truth, scorecard unknown-versus-zero semantics, projection checksum freshness, metric count bounds, source-window/currency binding, credential-free field evidence, and scorecard idempotency.
12. Run a read-only legacy-published-media rights inventory before deciding remediation.
13. Rollback, if required, by removing `20270423` triggers/functions/indexes/constraints/columns first and then the `20270422` indexes/constraints/columns without dropping the canonical ledgers; disable the new UI/routes and drop later feature tables in reverse dependency order. Existing geography, budgets, KPI rows, conversion/attribution rows, communications, CRM, Agent OS, CMS, credentials, Actions, catalog, orders, payments, fulfillment plans, and delivery jobs remain canonical.

## Test plan

- Unit-test neighborhood/geography/mode readiness and seven-dimension gap detection.
- Unit-test missing, expired, revoked, out-of-scope, paid-ad, consent, attribution, and takedown rights blockers.
- Static contract-test schema/migration/runtime parity, central Action definitions, governed routes, and Operations Center UI.
- Unit-test the exact 15-state publication vocabulary, rights-blocker mapping, account/scope/target readiness, the nine-field manual package, attribution, manual no-publication-claim invariant, fixed-host Meta requests, transient Page credential resolution, provider read-back, Instagram processing/continuation, ambiguous failure handling, and no-automatic-retry invariant.
- Unit-test the exact social-inbox classification vocabulary, provider/platform/channel compatibility, verified-evidence allowlist, lead eligibility, idempotency bindings, and governed reply blockers.
- Unit-test business/billing ownership, restriction fail-closed behavior, global/brand/tenant/geography/channel/campaign/test/production/rights envelopes, daily/weekly/monthly/total caps, orderability, stock, delivery, paid rights, landing/tracking, margin/CAC, stop conditions, reallocation limits, and the no-provider-campaign/no-spend invariants.
- Unit-test carrier candidate/partner truth, exact route/cargo/capability coverage, current credential-free verification, quote validity, paid-order/fulfillment/contract/connection/incident/human booking gates, and the no-provider-request/no-booking/no-confirmation invariants.
- Unit-test commerce-only language, campaign readiness, verified non-overlapping tiers, non-binding interest, exact canonical order/payment reconciliation, paid threshold derivation, batch allocation/production/inspection quantities, provider-confirmed carrier handoff, full delivery, settlement balance/refund exposure, and no-provider-execution invariants.
- Unit-test territory scorecard unknown-versus-zero behavior, nullable metrics, impossible numerator/denominator bounds, signed contribution margin, credential-free field provenance, derived rates/unit costs, idempotency, canonical-table reuse, and no-external/no-background invariants.
- Unit-test canonical fulfilled-order attribution across exact tenant/order/payment/amount/currency/delivery/touchpoint/provenance/current-rights bindings, one-order uniqueness, idempotency/checksum conflicts, credential-like evidence rejection, organic/ad paths, and no-provider/no-background invariants.
- Type-check and route-verify the full repository.
- Build the web/server bundles.
- In a non-production tenant, test activation idempotency, one-active enforcement, cross-tenant denial, zero-budget paused work items, Action evidence, and emergency pause.
- In a non-production tenant, attempt every publication bypass: create-as-published, patch-to-published, bulk publish without source, expired grant, revoked grant, missing consent, and valid grant.
- Browser-test the Territory Hub and Media Review Queue after an interactive browser connection is restored.
- Provider tests must be controlled sandbox/permission checks. Do not publish, message, charge, advertise, or book a carrier merely to prove connectivity.

## Bounded package implemented now

- Migration and runtime schema parity for operational profiles, activations, planned teams, coverage snapshots, source references, rights grants, and immutable rights events.
- Policy functions for territory readiness and publication eligibility.
- Central Action definitions and evidence-backed runs for activation preparation/approval, rights grant/revoke, and CMS publication.
- Admin territory APIs and an Activation tab in the existing Territory Hub.
- Rights controls in the existing Media Review Queue.
- Provider-neutral social connector contract, accurate attempt/event ledger, non-secret account-target health model, Mindbase OAuth reuse, Meta publishing scopes, and an optional YouTube OAuth connection.
- Complete manual packages contain the final asset, caption, title, hashtags, alt text, thumbnail, publishing instructions, destination link, and tracking code; they remain `MANUAL_REQUIRED`.
- The release-gated official Meta adapter supports one confirmed Facebook Page image/link post or Instagram single-JPEG post, obtains a Page credential only in transient server memory, records `PROCESSING` when a container is not ready, requires a separate foreground continuation, and records `PUBLISHED` only after provider object read-back. It cannot advertise, spend, reply, message, schedule, run in the background, or automatically retry.
- Admin social readiness and attempt-ledger surfaces expose no token values and perform no external action.
- Verified social comments/DMs can enter the existing Team Inbox, CRM, and paused task queue through the disabled-by-default signed Meta adapter without raw webhook credentials. Unsupported, unmatched, ambiguous, or failed events remain in the durable receipt ledger for explicit foreground reconciliation; social replies remain blocked behind an outbound adapter and approved fact/policy/tone evidence.
- The Advertising Governance admin surface prepares and approves internal evidence/cap records only; it has no launch-or-spend control and exposes no provider credential fields.
- The Carrier Network admin surface manages evidence-backed candidates, coverage, non-secret connection references, quote preparation/receipt, selection, internal booking authority, and incidents. It deliberately has no carrier-booking execution control and writes selected evidence back to the canonical fulfillment service.
- The public Producer Exchange records non-binding interest, while the Group Buying admin surface prepares campaigns, binds only exact provider-reconciled paid industrial orders, records production evidence, publishes local updates, and prepares balanced settlement authority. Neither surface exposes a second checkout, factory-start, carrier-booking, settlement-submission, or refund-execution control.
- New publication transitions fail closed; generic create/edit endpoints cannot bypass the Publish action.
- Generated activation tasks stay paused, zero-budget, and external-action-forbidden.
- The Territory Hub now shows existing territory-bound advertising envelopes and records evidence-backed media-to-commerce metrics in the canonical `territory_kpis` row through `TERRITORY_SCORECARD_RECORD`; it neither approves spend nor starts background work.
- The existing conversion and attribution ledgers now accept a single accountable canonical binding from one fulfilled industrial order to one verified media touchpoint through `COMMERCE_ATTRIBUTION_RECONCILE`. The Territory Hub previews and records checksum-bound canonical ledger projections while retaining unknown metrics as unknown.

This package is a source implementation, not a production-completion claim.
