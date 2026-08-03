# Exportunity Industrial OS: Production Blockers

## P0: Contain Before Any Industrial Outreach

| Blocker | Status after this change | Required evidence before activation |
| --- | --- | --- |
| Gold-oriented legacy response path could answer an Exportunity inbound message | Contained in code; pending deployment verification | An Exportunity inbound test must create a work order without emitting an automatic reply. |
| Legacy Meta WhatsApp workflow could run retail/gold commands for Exportunity | Contained in code; pending deployment verification | An Exportunity inbound event must remain visible in the inbox without an automated outbound send. |
| Legacy Exportunity agent-economy seed could create predictable credentials, wildcard permissions, and synthetic activity | Retired in code; pending production data audit | Identify and disable or rotate any records previously created with `exportunity_agent_economy_seed_v1`. Never alter a real user password through a seed. |
| Unknown production data contamination from legacy synthetic agent activity | Open | Run a read-only database audit by seed key and export a reviewed remediation list before deleting or changing records. |
| Unified communication decision is incomplete | Open | One policy service must return `ALLOW_AUTO_SEND`, `REQUIRE_APPROVAL`, or `BLOCK` for email, WhatsApp, SMS, and voice using consent, opt-out, business hours, quotas, commitment risk, and tenant scope. |

No WhatsApp, SMS, email, or voice outreach campaign may be enabled for Exportunity while any P0 item remains open.

## P1: Evidence-Backed Industrial Operating Loop

1. Attach and review the actual GDIZ fast-start CSV/JSON/ZIP. Do not derive factory records from the pasted narrative.
2. Build the canonical industrial data model for company, site, decision-maker, capability, equipment, material need, source evidence, opportunity, RFQ, quote, proposal, contract, and revenue event.
3. Extend the PME Exchange foundation instead of creating a competing lead system.
4. Add a controlled source import with deduplication, evidence provenance, verification states, and strict location precision.
5. Connect confirmed public requirements to real CRM opportunities, controlled supplier matching, RFQ drafts, and approved communication actions.
6. Keep public map claims conservative: public reference, submitted, under verification, verified, or approved for publication.

## P2: Governed Industrial Run

The future Go control must create a durable industrial operating run with explicit states:

`STOPPED -> PREFLIGHT -> DISCOVERY -> ENRICHMENT -> QUALIFICATION -> OUTREACH READY -> ACTIVE -> DRAINING -> STOPPED`

It must be able to pause, fail safely, and emergency-stop. It is not a background agent conversation. Each stage must create visible audit evidence, with no external outreach, pricing commitment, payment, or contract action outside the policy gate.

## Verification Required for the P0 Release

- The focused safety suite and direct compilation of the touched server modules pass.
- The full repository typecheck is rerun successfully in a healthy local or CI environment. It exceeded five minutes in this local environment and was stopped without a result.
- The targeted tenant, industrial intake, and inbound-messaging policy tests pass.
- The live health SHA equals the deployed commit.
- No outbound Twilio or WhatsApp action is sent as part of verification.
