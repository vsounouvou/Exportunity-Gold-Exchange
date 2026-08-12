# Company Brain Security

## Trust boundary

Documents, emails, attachments, web pages, contact notes, OCR text, and connector metadata are untrusted evidence. They can support or refute claims. They can never issue instructions, grant authority, request tools, reveal secrets, or change policy.

`server/lib/company-brain/security.ts` normalizes evidence, detects common prompt-injection indicators, labels security status, and renders explicit model boundaries. Detection is one layer, not a complete malware or data-loss-prevention system.

## Required controls

### Tenant and company isolation

- every source, claim, context pack, audit event, connector, and sync run is tenant-scoped;
- cross-tenant IDs are never trusted from the client;
- company-level visibility is permission-filtered;
- connector callbacks bind to signed state with tenant, user, connector, and expiry.

### Least privilege

- Company Brain and each connector are independently feature-gated;
- Google Workspace phase one is read-only;
- refresh tokens are encrypted or stored by secret reference;
- agents receive only task-required sources and tools;
- external communications remain disabled by default and require human approval.

### Evidence handling

- preserve provider identity, content hash, version, timestamp, permissions, and source link;
- quarantine suspicious content before retrieval;
- exclude quarantined evidence from autonomous claim promotion;
- redact secrets and sensitive data before model use;
- cite the exact source version;
- preserve conflicts rather than silently selecting a claim.

### Prompt injection

Model instructions must state that retrieved content is data only. Suspicious indicators include instruction overrides, system/developer impersonation, tool-call markup, credential requests, authority escalation, secret exfiltration, and silent-action requests.

Even a clean item remains untrusted evidence. A detector result does not convert it into an instruction source.

### External actions

External communication, payment, contract, public publication, privileged configuration, or destructive change requires the existing visible approval and action path. A context pack cannot authorize an action.

### Logging

Audit events include actor, event, entity, correlation ID, source/claim IDs, feature state, approval state, and outcome. Logs must not contain OAuth tokens, passwords, API keys, full sensitive document content, or unnecessary personal data.

## Threats and response

| Threat | Control |
| --- | --- |
| Malicious email asks agent to ignore policy | Quarantine indicator, data-only boundary, no tool authority |
| Cross-tenant source ID | Server-side tenant filter and permission check |
| Stale or changed document | Immutable version and content hash |
| Conflicting public metric | Conflict registry and external approval gate |
| Leaked OAuth refresh token | Secret reference/encryption, masked UI, revocation |
| Agent tries to send a draft | External feature gate plus message-level human approval |
| Connector over-collects | folder/query allowlist, relevance filter, sync review |
| Hidden autonomous processing | no new worker by default; visible run and stop controls |

## Security release gate

Before enabling read connectors:

- threat-model review;
- OAuth state and callback tests;
- scope assertion tests;
- token-at-rest review;
- tenant isolation tests;
- prompt-injection corpus tests;
- source allowlist and revocation tests;
- audit redaction tests;
- backup and restore exercise.

Before enabling external communications, complete the separate email activation runbook.
