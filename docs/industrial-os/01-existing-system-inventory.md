# Exportunity Industrial OS: Existing System Inventory

This inventory distinguishes code that is usable today from code that is merely a starting point. A label is not a claim of production readiness.

| Capability | Classification | Evidence | Current boundary |
| --- | --- | --- | --- |
| Tenant resolution and Exportunity industrial routing | REAL | `tenants/registry`, `client/src/App.tsx`, `/api/whoami` | `exportunity.net` resolves to `/industrial`; legacy marketplace aliases point to the industrial experience. |
| Public industrial intake | REAL | `IndustrialHubPage`, `IndustrialAssistantChat`, `server/routes/industrial.ts` | A user-triggered assistant preview can lead to a confirmed requirement. It does not contact suppliers or simulate a completed transaction. |
| Private requirement attachments | REAL | `server/lib/industrial/requirementAttachments.ts` | Files are stored as internal evidence. OCR, document reasoning, supplier matching, and outreach are not implied by upload alone. |
| Named Exportunity industrial agent organization | PARTIAL | `server/lib/industrial/agentOrganization.ts` | Agent roles and visible company context exist. Durable industrial operating runs and tool-specific workers are still missing. |
| Operations Center meetings, tasks, decisions, and action surfaces | PARTIAL | Existing Operations Center routes and UI | The surfaces and some persistence exist; each industrial action still needs a traceable worker, policy, and receipt before it is presented as autonomous execution. |
| Factory directory and industrial map | PARTIAL | `server/routes/industrial.ts`, `IndustrialHubPage` | The map is real and public industrial references are source-labelled. The live verified factory directory currently returned zero published factories, so no capacities, products, prices, or exact factory GPS are fabricated. |
| GDIZ seed import | UNKNOWN | Attached fast-start package references CSV/JSON files not present locally | Import is blocked until the actual evidence-backed data files are attached and reviewed. The zone reference point must not become every factory's GPS coordinate. |
| PME Exchange schema, map, campaigns, and lead repository | PARTIAL | `db/schema/pme-exchange.ts`, `server/lib/pme-exchange/repository.ts`, admin routes | It is reusable infrastructure, but it is not yet the canonical industrial CRM or an approved public investment system. |
| Google Places integration | PARTIAL | PME Exchange repository and configuration routes | It needs a separate server-side key, field masks, cache, quota controls, and a verified configuration before being treated as live discovery data. |
| Twilio inbound logging and work orders | PARTIAL | `server/routes/twilio-webhooks.ts` | Inbound messages can be persisted and queued. Sender health, consent, approval policy, and live configuration need verification. |
| Legacy Twilio/WhatsApp auto-replies | DEAD for Exportunity after the P0 patch | `inbound-auto-reply-policy.ts` | Exportunity records inbound messages for review; it cannot run the legacy retail/gold reply path. Other tenants require explicit opt-in. |
| Legacy Exportunity agent-economy seed | DEAD after the P0 patch | `scripts/seed-exportunity-agent-economy.ts` | The old seed is retired because it could create synthetic activity, broad admin accounts, and predictable credentials. |
| Client Hunter synthetic leads | DEMO | `server/agents/client_hunter/*` | It must never supply production Exportunity factories, prospects, performance statistics, or outreach. |
| Action Forge generated actions | SCAFFOLD | `server/routes/action-forge.ts` | It returns `UNIMPLEMENTED_FORGED_ACTION`; it must not advertise a working capability. |
| Persistent industrial GO run | SCAFFOLD | No canonical industrial run table/state machine found in the audited path | The existing background conversation feature is not the company operating switch. |

## Source Data Rule

An industrial company, site, decision-maker, capability, machine, material need, certification, location, or commercial status is publishable only when it has source evidence, observation date, confidence, and verification state. A public GDIZ or port reference is not evidence that an individual company is operating there.
