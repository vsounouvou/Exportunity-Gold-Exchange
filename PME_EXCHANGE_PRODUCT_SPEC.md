# PME Exchange Product Spec

## Positioning

The PME Exchange is a real-economy SME discovery, onboarding, verification, and opportunity pipeline for Exportunity. It is not a crypto exchange and it does not expose public investment offers by default.

Approved public language:

- Bourse de PME
- opportunites commerciales verifiees
- revenus futurs structures
- royalties contractuelles
- financement base sur les revenus
- PME africaines verifiees

Avoid public UI language until legal review:

- actions
- titres financiers
- rendement garanti
- crypto
- smart contract
- investment exchange

## Current Vertical Slice

- Schema: `pme_leads`, `pme_outreach_campaigns`, `pme_outreach_messages`, `pme_agent_conversations`, `pme_exchange_profiles`.
- Data source: Google Places when configured; curated Abidjan/Cotonou data otherwise.
- Admin routes: `/admin/pme-exchange`, `/map`, `/leads`, `/import`, `/campaigns`, `/conversations`, `/profiles`, `/audit`.
- Outreach: test campaigns draft WhatsApp messages only. Admin approval is required before any send path.
- Public marketplace: `/api/places/nearby` now returns provider status and normalized place data.

## Workflow

1. Discover PME leads through Google Places, curated data, manual import, referrals, or merchant claim.
2. Normalize and deduplicate by Google place id, name/address, phone, and website.
3. Score qualification, investment potential, and revenue visibility.
4. Review leads in the admin map/table.
5. Select a controlled test set of leads.
6. Draft WhatsApp outreach using an approved template.
7. Require admin approval before any Twilio send.
8. Log every drafted/sent/replied message.
9. Promote qualified/onboarded businesses into internal PME Exchange profiles.
10. Keep investment readiness internal until compliance approves a public listing flow.

## Agent Roles

- PME Acquisition Agent: reviews imported leads, scores relevance, creates next actions.
- Sourcing Agent: finds suppliers/businesses by category and geography.
- Outreach Agent: drafts compliant first-contact messages.
- WhatsApp Agent: sends only approved messages through Twilio.
- Verification Agent: checks trust signals and public listing data.
- Account Manager Agent: follows up after opt-in.

System context: agents work for Exportunity.net, an AI-managed African SME trade and investment platform. Agents must be respectful, non-spammy, and compliant.

## Acceptance State

The current implementation supports discovery, import preview, saved leads, map visualization, test campaign drafting, audit logs, and provider status. Full autonomous response handling, production Twilio send approval UI, and public investment listing remain intentionally gated.
