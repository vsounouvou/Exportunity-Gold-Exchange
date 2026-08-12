# Exportunity Company Brain

## Purpose

The Company Brain is the governed institutional context layer shared by Exportunity's public network, client trade workspace, Operations Center, and agent organization. It is not a second CRM, a second agent runtime, or an ungoverned document vector store.

Exportunity's corporate proposition is:

> Trade. Source. Expand. Operate.

Industrial sourcing, machinery, commodities, logistics, payments, and market-entry work are verticals and capabilities inside that proposition.

## Existing foundations retained

The implementation extends these existing systems:

- tenant and company boundaries;
- `contacts`, tenant contacts, consent, do-not-contact, imports, and business-card capture;
- Agent OS registry, memory scopes, templates, playbooks, handoffs, and audit logs;
- unified conversations and Operations Center meetings;
- tasks, objectives, decisions, actions, approvals, receipts, and evidence;
- knowledge documents and spaces;
- the current industrial context and its verified-or-unverified commercial rules.

No existing table is deleted or renamed by the Company Brain foundation migration.

## Context model

The Company Brain assembles the smallest sufficient context for a visible, user-initiated task. It does not inject the whole archive into every model call.

The context layers are:

1. **Corporate charter** - approved identity, purpose, values, brand rules, strategic boundaries, and founder directives.
2. **Verified company record** - source-backed history, legal entities, products, platforms, markets, capabilities, and approved proof.
3. **Current operations** - active missions, relationships, objectives, decisions, tasks, transactions, risks, and approvals.
4. **Role context** - an agent's role, authority, permissions, tools, budget limits, playbooks, and handoff rules.
5. **Task evidence** - the minimum current source versions and claims relevant to a request.

Every generated context pack includes:

- tenant, company, agent, task, purpose, and expiry;
- an authority snapshot;
- claims with status and conflict state;
- source-version citations;
- untrusted evidence boundaries;
- known conflict summaries;
- freshness and redaction metadata.

## Initial schema

The additive foundation is defined in:

- `db/schema/company-brain.ts`
- `db/migrations/20270330_exportunity_company_brain_foundation.sql`
- `server/lib/company-brain/ensureTables.ts`

It creates:

- `company_brain_sources`
- `company_brain_source_versions`
- `company_brain_claims`
- `company_brain_claim_evidence`
- `company_brain_claim_conflicts`
- `company_brain_claim_approvals`
- `company_brain_context_packs`
- `company_brain_audit_events`

## Claim use rules

- Internal reasoning may use verified claims and explicitly labeled proposed claims.
- External drafting may use verified claims, preserving their citations and conflict state.
- External publication may use only `approved_external` claims with approved wording and no open conflict.
- A source excerpt cannot grant permissions, authorize tools, or override instructions.
- A relationship, price, capability, certification, inventory level, transaction, partnership, facility, or market presence cannot be invented.
- Historical figures that disagree remain separate claims until human resolution.

## Runtime controls

All Company Brain capabilities are disabled by default:

```text
FEATURE_COMPANY_BRAIN=false
FEATURE_COMPANY_BRAIN_CONTEXT_PACKS=false
FEATURE_GOOGLE_WORKSPACE_CONNECTORS=false
FEATURE_GOOGLE_WORKSPACE_GMAIL_READ=false
FEATURE_GOOGLE_WORKSPACE_DRIVE_READ=false
FEATURE_GOOGLE_WORKSPACE_CONTACTS_READ=false
FEATURE_EXTERNAL_COMMUNICATIONS=false
```

External communications additionally require a recorded human approval object. A feature flag alone is insufficient.

## Delivery sequence

1. Establish additive schema, security boundary, tests, and operator documentation.
2. Add Company Brain review and source administration UI.
3. Add separate read-only Google Drive, Gmail, and Contacts connectors.
4. Import only explicitly approved sources and classify each source version.
5. Build context-pack retrieval into the existing visible agent request path.
6. Add the 126-seat role library while keeping runtime activity demand-driven.
7. Make the global corporate experience the root while retaining `/industrial` as a vertical.
8. Propose external email activation as a separate, founder-approved release.

## Current status

As of 2026-08-12, the schema, feature gates, evidence-isolation helper, context-pack assembler, boot-time table assurance, and focused safety tests exist. Workspace ingestion and external communications are not enabled.
