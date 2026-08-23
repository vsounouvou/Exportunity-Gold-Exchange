# Exportunity Implementation Gap Map

## Audited baseline

Recorded on 2026-08-12 before Company Brain deployment:

| Item | Baseline |
| --- | --- |
| Repository | `Exportunity-Gold-Exchange/exportunity-industrial-release-20260801` |
| Branch | `codex/exportunity-industrial-20260801` |
| Baseline commit | `ba526ca0289997bd5b97413ce85e7a029df8bcff` |
| Live host | `https://exportunity.net` |
| Live release | `20260812-005134-ba526ca02899` |
| Live build ID | `1786495893554` |
| Tenant | `exportunity`, tenant ID 2 |
| Separate tenant retained | `zone`, tenant ID 970 |
| Root behavior | Exportunity tenant redirects to `/industrial` in the client |
| Search indexing | `.net` is currently included in the server non-canonical/noindex set |
| Public vertical | `/industrial` and its factory, product, supply, quote, and map views |
| Active specialist organization | 11 industrial agents across 11 departments |

## What already works and must be reused

| Capability | Existing implementation | Direction |
| --- | --- | --- |
| Tenant isolation | tenant registry, domains, tenant context, tenant-scoped APIs | Preserve and test every new query by tenant |
| Contacts | contact identities, sources, tags, attachments, imports, consent, DNC | Extend; never create a second CRM |
| Business-card capture | admin contact route plus vision extraction | Surface in mobile CEO workflow |
| Agent policy | registry, permissions, models, memory scopes, playbooks, handoffs | Add Company Brain context and 126 role seats |
| Conversations | unified conversations, meeting context, Ops Center chat | Reuse visible conversations only |
| Execution | tasks, actions, approvals, results, receipts, evidence | Route agent actions through existing approval/audit layer |
| Knowledge | knowledge spaces, documents, external source records | Retain documents; add source versions and canonical claims |
| Industrial experience | agentic intake, map, factories, products, quotations | Keep as a vertical, not the corporate root |
| Deployment | immutable release artifacts, current symlink, remote release retention | Preserve and add pre-switch gates |

## Confirmed gaps

Status note (2026-08-13): this section preserves the audited baseline. Items completed since that audit are recorded in **Implemented after the baseline audit** below.

### P0 - release and identity

1. The live `.net` root is intentionally configured to `/industrial`; this is not a stale service-worker symptom.
2. `.net` receives `X-Robots-Tag: noindex` because it is in `EXPORTUNITY_NON_CANONICAL_HOSTS`.
3. The broader marketing route is host-gated to other domains and is not yet the approved global corporate root.
4. The legacy initializer still contains generic and gold-exchange-era seed context. It must not overwrite Exportunity's tenant-specific organization.

Release gate: build and test a global root before removing the redirect or noindex behavior.

### P0 - evidence and authority

1. Existing evidence APIs expose action receipts, not canonical source-backed company claims.
2. Existing knowledge sources store credentials in a generic JSON field. Company Brain connectors must store token references through the secret layer, not plaintext tokens.
3. Existing company context is a static string rather than a source-backed, task-specific context pack.
4. There was no canonical conflict and publication-approval model. The additive foundation now provides it.
5. Retrieved files and emails lacked an explicit prompt-injection boundary. The security helper now quarantines common override/tool/secret-exfiltration patterns.

### P1 - Google Workspace

1. There is no Exportunity Company Brain Workspace connector.
2. An unrelated Mindbase OAuth path requests broad scopes such as Gmail modify and Drive file write. It must not be reused without a separate least-privilege scope set.
3. Exact connected-account identity, per-connector grants, allowlisted Drive roots, sync cursors, and revoke controls are missing.
4. Gmail business-relevance filtering and Contacts merge review are missing.

### P1 - organization

1. Exportunity currently has 11 useful active specialist agents.
2. The target organization is approximately 126 role seats, not 126 continuously running model processes.
3. Role-seat catalog, authority matrix, activation state, territory assignment, budget, escalation, and coverage reporting are missing.
4. The current organization is industrial-heavy and must expand to global trade, supply management, market entry, relationship intelligence, compliance, finance, product, platform, and territory roles.

### P1 - product surface

1. The public root does not yet communicate `Trade. Source. Expand. Operate.`
2. The required primary paths are not unified: tell us what you need, source, sell and export, manage supply, enter a new market, industries, countries, and platform.
3. Industrial currently acts as the platform identity rather than one vertical.
4. Mobile executive Company Brain review and connector controls were not yet present at the audited baseline.

### P2 - execution and communication

1. External communication workers exist in the wider codebase, but Company Brain external communications must remain separately gated.
2. Draft review, recipient provenance, relationship context, claim citations, DNC checks, and message-level approval need one activation path.
3. Existing production schedulers are enabled by deployment configuration. No new Company Brain background worker may start without explicit operator activation and visible controls.

## Implemented in the foundation change

- additive source/version/claim/evidence/conflict/approval/context/audit schema;
- idempotent boot assurance;
- disabled-by-default flags;
- message-level external communication authorization invariant;
- untrusted evidence normalization and quarantine;
- context pack assembly contract;
- compatibility with the existing static company context helper;
- focused safety and contract tests;
- this implementation and recovery documentation.

## Implemented after the baseline audit

- authenticated, tenant-admin-only Company Brain source, version, claim, conflict, and approval APIs;
- a light-mode Company Brain admin console with source security dispositions and audit visibility;
- an idempotent, founder-authorized charter source with six internal-only claims;
- strict tenant/source/version integrity checks before evidence reaches agent context;
- task-scoped context-pack injection through the existing shared LLM gateway;
- separate least-privilege Google Drive, Gmail, and Contacts read-only connector contracts, with send and modify scopes rejected;
- sensitive/personal source quarantine and business-relevance classification;
- a 126-seat role catalog reconciled with the existing active agent organization;
- a quick-session-authenticated mobile executive truth panel showing source security, claim/conflict/approval counts, the latest cited context pack, department-level role-seat coverage, and workforce demand without approval or lifecycle controls;
- serialized external approval requests and immutable governance audit events;
- external communication feature gates retained in the disabled state.

## No-data-loss rules

- No destructive migration is permitted.
- No existing knowledge, contact, conversation, agent, task, action, or evidence row is rewritten during foundation deployment.
- Connector ingestion creates source versions instead of overwriting source content.
- Contact sync must pass through the existing dedupe and merge review path.
- Corporate root routing changes require a release artifact and reversible traffic switch.
- External send remains off until a separate approval release.

## Remaining release gates

1. Connect the exact Exportunity Google Workspace account, verify identity, then enable only the approved read-only services.
2. Review and import approved Drive, Gmail, and Contacts evidence through the visible connector workflow.
3. Run the remaining tenant, security, accessibility, tablet, and cross-role UX tests; the mobile executive projection has focused contract, TypeScript, production-schema, and release-build evidence.
4. Remove `.net` from noindex only when the global public root passes those gates.
5. Propose external communication activation as a separate founder-approved release.
