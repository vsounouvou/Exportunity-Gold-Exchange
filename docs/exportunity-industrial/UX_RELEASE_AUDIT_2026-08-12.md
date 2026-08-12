# Exportunity Global Trade Release UX Audit

Date: 2026-08-12

## Release decision

The public Exportunity experience is ready for controlled promotion as a global trade and industrial sourcing platform. The corporate root is global by default; `/industrial` remains a focused vertical. Awa owns one real commercial conversation per context, public map references are clearly separated from verified availability, and every external contact remains approval-gated.

This decision does not authorize outbound email, WhatsApp, social posting, supplier contact, or public investment offers. Those capabilities remain draft-only or disabled until their separate approval and compliance gates are completed.

## User perspectives tested

| User | Journey exercised | Outcome |
| --- | --- | --- |
| First-time company buyer | Open `/`, understand the proposition, choose a mission, inspect the global map | Global purpose is visible immediately; no country lock; Awa and five commercial paths are available without a second composer. |
| Factory maintenance lead | Choose `Order a spare part`, attach evidence, specify quantity | A browser test found that the exact English prompt was misclassified as bulk input. The classifier now keeps it in the unit-based spare-parts workflow. |
| Procurement manager | Explore machinery, industrial supply, and quote paths | Products lead; Awa collects specification, capacity, quantity, destination, and timing progressively instead of exposing a long form. |
| Export-ready manufacturer | Browse documented output and open a product with Awa | Product cards show origin and evidence wording; no unverified stock or price is claimed; the selected product enters the same commercial case. |
| Logistics operator | Explore port and industrial-corridor references | Ports, zones, and routes are visible as public context, with source links and no claim that a route is a live shipment. |
| International buyer | Switch among Global, Cote d'Ivoire, Benin, UAE, and another market | Market selection refines context without limiting the network; Abidjan, GDIZ/Cotonou, and Dubai corridors remain shareable. |
| Mobile field technician | Use the 390 x 844 experience, map, composer, voice, and file controls | One editable composer remains usable; the map stays full width; no horizontal overflow was found. |
| Factory owner | Enter the authenticated business and agent workspace | The operating plan, departments, governed roles, editable agent identity/face, and real meeting workspace are accessible. |
| Operations administrator | Create a meeting, attach evidence, create a task/action/decision, reload | Meeting history, evidence, scoped tasks, actions, decisions, and agent context persist through reload. |
| Chairman / executive | Use Fenou while working across Operations pages | Fenou can move, resize, snap, collapse, minimize, and close; open/minimized state now persists between page navigations without covering the meeting workspace. |

## Responsive review

- Desktop: 1440 x 900 global home and 1280 x 720 industrial vertical.
- Tablet: 820 x 1180 global home.
- Mobile: 390 x 844 global home and industrial vertical.
- Checks: one composer, editable input, real Leaflet map, map dimensions, broken rendered images, horizontal overflow, route rendering, and browser console errors.

## Product and design corrections verified

- The approved compact Exportunity AI mark is used instead of the Machinery sub-brand on the platform shell.
- The corporate root communicates `Trade. Source. Expand. Operate.` and does not redirect to a single vertical.
- Awa occupies a dedicated right supporting pane on desktop and a single in-flow conversation on compact screens.
- Products and documented industrial output remain visible; the map is not empty or decorative.
- GDIZ selection exposes sourced context and documented output instead of a bare camera move.
- Product and quote journeys are conversational and quantity-first.
- Public cards distinguish documented output, sourcing programmes, public references, and verified availability.
- Light mode is the default for a fresh browser; dark mode remains available.
- Operations Center uses readable light surfaces and real persisted meetings rather than decorative chats.
- Agent editing exposes identity, role, department, model policy, memory, permissions, skills, and avatar controls.

## Functional evidence

- Type and lazy-route validation: `npm run check`.
- Focused regression suite: 54 tests passed before the final spare-part regression; the added classifier test also passes.
- Browser UX: global desktop and tablet passed; mobile rendered correctly, with the image check corrected to ignore intentionally unloaded lazy images.
- Authenticated live checks: meeting creation, six-agent context, attachment evidence, explicit task creation, action execution, decision capture, and reload persistence.
- Tenant checks: `exportunity.net` resolves to the Exportunity tenant and the corporate global root.

## Controlled limitations

- Google Maps is used only when valid restricted credentials and a Map ID are configured. The production-safe Leaflet/OpenStreetMap renderer remains the live fallback.
- Public catalogue records do not imply stock, price, MOQ, capacity, or lead time before review.
- Google Workspace remains read-only and exact-account verification is required before any archive import.
- External communication remains disabled by default. Drafts, approvals, audit, suppression, and sender-identity controls must pass their separate activation gate before sending.
- Historical claims are not promoted as current facts unless they are source-backed and approved for external use.

## Promotion posture

The experience can now be shown publicly for discovery, product qualification, sourcing intake, factory registration, and controlled case creation. Promotion copy must not promise instant inventory, confirmed factory capacity, automatic supplier contact, or investment access.
