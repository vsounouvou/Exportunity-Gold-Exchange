# Exportunity Industrial Launch UX Audit

Date: 2026-08-05

## Launch decision

The industrial intake is technically real and the core request-classification flow works, but the public experience is not ready for paid promotion until verified factory and catalog content is published. Production currently returns zero public factories and zero public catalog items.

## Evidence checked

- Public route: `/industrial`
- Core routes: `/factories`, `/map`, `/export-products`, `/industrial-supply`, `/machinery`, `/request-quote`
- Public data APIs: taxonomy, factories, catalog, and Tassi intake preview
- Desktop viewport: 1280 x 720
- Mobile viewport: 390 x 844
- Existing Operations Center viewport: 1280 x 720

## Findings by severity

### P0 - promotion blockers

1. The verified factory directory is empty in production.
2. The export-ready catalog is empty in production.
3. The home map therefore shows public industrial context only, not a commercial network a buyer can act on.

### P1 - comprehension and conversion

1. The home route visually marked `Factories` as active even though the visitor had not entered the factory directory.
2. The hero repeated the same industrial intents in the chat suggestions and in four additional text links, making the first screen feel heavier than necessary.
3. The industrial team image was obscured by a dense overlay, weakening confidence and making the page read as text-first.
4. The mobile composer used valuable width for a decorative message icon and an overlong placeholder.
5. The mobile navigation had no icon cues and did not communicate that it was horizontally scrollable.
6. The map explainer covered too much map area on narrow screens.

### P2 - trust and accessibility

1. The first screen did not summarize the controlled B2B process in a scannable form.
2. Active navigation lacked `aria-current`, reducing orientation for assistive technology.
3. There was no repeatable launch test for broken images, page overflow, chat intake, map sizing, or key-route rendering.

## User perspective review

| User | Primary need | Current friction | Required outcome |
| --- | --- | --- | --- |
| Factory maintenance lead | Restore production quickly | No published supplier/factory result after intake | Clear case, evidence upload, review status, matched capability |
| Procurement manager | Source a machine or input | Empty directory/catalog | Verified organizations, capabilities, and controlled quote path |
| Export-ready manufacturer | Find buyers and manage profile | Public network appears empty | Claim/register path, owner workspace, visible verification state |
| Logistics operator | Offer corridor and freight capacity | Role is not visible in public discovery | Logistics category, corridor coverage, service capability |
| International buyer | Validate Benin supply | Context markers are not commercial proof | Verified profiles, export markets, certifications, contact process |
| Mobile field technician | Photograph a failed part | Composer is cramped | Obvious photo/file action and short readable prompt |
| First-time visitor | Understand Exportunity in seconds | Repeated copy and misleading active nav | One sentence, one conversation, one map, one next step |
| Returning buyer | Reopen or track a case | No public case continuation cue | Authenticated case history and status link |
| Administrator | Operate the network | Large menu and uneven visual hierarchy | Priority-led Operations Center with functional meetings and agents |
| Agent/operator | Review and route demand | Public intake works, but content/matches are thin | Structured handoff, evidence, assigned agent, task and decision trail |

## Implemented in this pass

- Removed the false active state from the factory-directory navigation on the home route.
- Replaced duplicate intent links with three compact trust signals.
- Increased visibility of the industrial team imagery.
- Shortened the Tassi composer prompt and removed a decorative icon.
- Made suggestion chips wrap on larger screens and snap cleanly on mobile.
- Added mobile navigation icons and snap behavior.
- Reduced the mobile map overlay footprint.
- Added a repeatable desktop/mobile Playwright launch test.

## Remaining launch gates

1. Publish a sourced, reviewed first cohort of Benin factories, exporters, suppliers, and logistics operators.
2. Publish real capability and export-product records only after source and visibility review.
3. Verify route, map, image, chat, and admin workflows against the deployed build.
4. Complete the Operations Center meeting, hierarchy, and agent-action audit.
5. Approve outreach identity, account access, message templates, suppression rules, and test recipients before any email or social outreach.

## Product catalogue follow-up - 2026-08-06

The public industrial experience now starts with products buyers can request, while preserving the controlled B2B review process.

### Published product groups

- Industrial spare parts: sprockets, bearings and housings, pulleys and belts, couplings, pump and conveyor parts, bushings, flanges, brackets, and bases.
- Factory tools and equipment: motors, reducers, pumps, measurement tools, sensors, controls, and reverse-engineering services.
- Documented Made-in-Benin output: cashew kernels, soybean oil and meal, corrugated boxes, metal cans, T-shirts, polos, knitted garments, cotton yarn, towels, bed linen, and woven cotton fabrics.

### Evidence and transaction rules

- GDIZ output is labelled as documented factory output and links to the relevant official GDIZ source.
- Spare parts and factory tools are labelled as Exportunity sourcing or technical-review programmes, not as inventory already held.
- Public cards do not claim stock, price, minimum order, capacity, or lead time before supplier confirmation.
- A buyer action creates a real industrial requirement and preserves the selected catalogue item as evidence for review.
- No supplier is contacted and no order is represented as completed automatically from the public catalogue.

### Official product sources

- GDIZ 2025 production review: `https://gdiz-benin.com/fr/2025-a-ete-une-annee-de-realisations-majeures-pour-la-gdiz/`
- GDIZ industrial unit launch and outputs: `https://gdiz-benin.com/launch-event/`
- GDIZ weaving plant: `https://gdiz-benin.com/fr/usine-de-tissage-de-gdiz/`
- GDIZ knitting plant: `https://gdiz-benin.com/knitting-textile-plant/`
