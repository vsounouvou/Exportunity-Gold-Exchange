# Compliance Guardrails

## WhatsApp and Outreach

- No uncontrolled bulk outreach.
- Default campaigns start in draft/test mode.
- First test campaigns are limited to 5-10 leads.
- Admin approval is required before business-initiated WhatsApp/SMS/call outreach.
- Respect opt-out keywords: `STOP`, `NON`, `ARRET`, `DESINSCRIPTION`.
- Do not contact a suppressed lead again.
- Do not contact the same business repeatedly within the configured cooldown.
- Log all outbound attempts, failures, approvals, and replies.
- Use approved WhatsApp templates outside the service window.

## Agent Conduct

- Agents must identify Exportunity context correctly.
- Agents must not pretend to send messages, place calls, or create public investment offers without the required backend action and audit record.
- If a capability is missing, create a setup/action item instead of pretending success.

## Bourse de PME and Investment

- Public UI may say `Bourse de PME`, `verified commercial opportunities`, `revenue-based financing`, and `contractual royalties`.
- Public UI must not imply guaranteed returns, securities issuance, crypto, smart contracts, or public investment availability before legal review.
- Investment panels are internal-review/admin-only until compliance approval.

## Data Protection

- Store only needed business lead fields.
- Mask API keys and secrets.
- Never log full API keys.
- Track source and last sync time for imported business data.
