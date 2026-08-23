# Exportunity Trade Intelligence: Phase-One Foundation

**Implementation status:** source-complete and locally verified on 2026-08-17; database migration and deployed smoke verification remain release actions.

## What This Slice Adds

The trade-intelligence layer extends the Industrial OS. It does not create a parallel CRM, supplier system, payment system, or agent runtime.

| Capability | Canonical implementation |
| --- | --- |
| Source registry | `trade_intelligence_sources`, including access/robots state, trust, health, country, language, and provenance URL |
| Knowledge graph | Typed entities, typed relationships, and field-level cited facts |
| Publication governance | Verified multi-source evidence, freshness/conflict scoring, explicit fact and entity publication states, and an administrator action |
| Demand radar | Privacy-hashed public searches, assistant intents, requirements, issued quotes, and confirmed orders |
| Zero-result intelligence | Persistent demand event that staff may promote into a research mission |
| Coverage matrix | Empty-first country/dimension and country/sector cells for the five Phase-one markets |
| Agent work queue | `trade_research_missions` linked one-to-one to the existing `tasks` table through `canonical_task_id`; unclassified demand can assign a visible data-intelligence employee to prepare a validated sector draft |
| Research evidence | Source-backed mission evidence with precise URLs and verification state; completion counts are derived, not self-reported |
| Source versioning | Immutable registered-source snapshots grouped by a stable document key, with content hashes, precise URLs, issuer, jurisdiction, version, scope, and distinct publication/effective dates |
| Regulatory monitoring | Deterministic version comparisons, material-change candidates, canonical approval-pending review tasks, requirement impact matches, and alerts withheld from delivery until accountable review |
| Public acquisition routes | `/trade`, `/trade/countries/:countryCode`, and `/trade/sectors/:sectorCode` |
| Staff command center | `/admin/trade-intelligence` |

## Phase-One Scope

Priority countries:

- Benin (`BJ`)
- Côte d’Ivoire (`CI`)
- Ghana (`GH`)
- Nigeria (`NG`)
- Senegal (`SN`)

Initial sectors:

- Industrial machinery
- Construction equipment
- Transport equipment
- Agricultural commodities
- Food and agro-processing
- Energy and solar
- Logistics

The migration seeds coverage targets at zero. These rows are a research backlog, not content and not evidence. No country, company, product, rule, supplier, or opportunity is fabricated.

## Non-Negotiable Controls

1. A public entity must be verified and explicitly published.
2. A public fact must be verified, have a public value and precise citation, and be explicitly published with its entity.
3. Publication eligibility needs at least two verified facts and two independent sources, recent evidence, no unresolved conflict, and a score of at least 75.
4. Public demand clusters need at least three events. Individual searches and commercial values are not returned by the public API.
5. A research mission creates a visible `tasks` record with `approval_status = pending` and `is_automated = false`.
6. A research mission cannot enter execution without approval or complete without two persisted verified evidence records, a substantive result, and a confidence score.
7. Source registration, snapshot capture, mission creation, or regulatory-change capture does not start a crawler, agent conversation, publication, alert delivery, or external outreach action.
8. A baseline source snapshot asserts no change. An identical normalized version creates no comparison. A changed regulatory version creates only an evidence-pending candidate until staff confirms or dismisses it with written review notes.
9. Requirement-impact matches are deterministic review aids across product, industry, HS code, country, and route. They neither make a legal conclusion nor notify a customer automatically.
10. A staff-triggered sector-taxonomy assignment creates a visible tenant/company-scoped task and a governed action request. The employee output must satisfy the JSON and Industrial OS mapping contract before it can create a draft; only a human administrator can advance or activate that draft.

## Release Checklist

1. Apply migrations `20270406` through `20270412` in order to the intended Exportunity database. The later migrations add source monitoring, fulfillment, newsroom governance, and attachment-review governance without weakening the Phase-one publication controls.
2. Confirm the runtime ensure step completes and all Phase-one coverage rows are present only for the Exportunity tenant.
3. Register real sources through the command center; do not seed facts from narrative requirements.
4. Capture a baseline and changed non-production regulatory source version, confirm the deterministic comparison remains review-pending, then dismiss or confirm it with written evidence.
5. Confirm any matched requirement impacts and draft alert remain withheld; no notification or public fact should be released by the review action.
6. Verify two-source publication with a non-production entity, then withdraw it.
7. Submit the palm-oil acceptance message and confirm it creates an agricultural-commodities demand event for Côte d’Ivoire.
8. Confirm a zero-result search remains private until aggregation, then promote it to an approval-pending mission.
9. Verify no external communication is sent during any of these checks.

## Verified Locally

- `npm run check`
- `npm run check:routes`
- Targeted action-intent, outbound/inbound communication, contact-readiness, payment, attachment-extraction, source-monitoring, and trade-intelligence tests (77 passing in the final local verification)
- Production client build (`npx vite build`)
- `git diff --check`

## Deliberately Not Claimed

- No live crawler or scheduled monitor was started.
- No source content was imported.
- No regulatory change was asserted.
- No production database migration was applied from this workspace.
- No payment-provider callback or live card charge was executed.
- No deployment or browser smoke test was performed.
