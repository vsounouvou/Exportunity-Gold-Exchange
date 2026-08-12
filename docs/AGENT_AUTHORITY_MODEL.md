# Agent Authority Model

## Organization principle

Exportunity needs approximately 126 organizational role seats, not 126 model processes running continuously. A role seat defines accountability and coverage. It becomes active only for visible user work, an approved scheduled run, or an explicitly authorized operation.

The existing 11 industrial specialists remain useful active agents. The role library expands coverage without replacing them or creating hidden conversations.

## Role-seat contract

Each seat must define:

- stable role key, title, department, level, and reporting line;
- mission and responsibilities;
- markets, industries, languages, and territory scope;
- required context layers and memory scopes;
- allowed models and token/time budget;
- tools and data permissions;
- allowed decisions and financial threshold;
- mandatory approvals and prohibited actions;
- default playbooks, templates, and handoffs;
- active, standby, disabled, or vacant state;
- assigned AI agent or human owner;
- current tasks, service level, and audit status.

## Authority levels

| Level | May do | Must not do without approval |
| --- | --- | --- |
| Observe | Read permitted context, classify, summarize, identify gaps | Write records or contact anyone |
| Draft | Create internal drafts, proposed claims, tasks, and recommendations | Publish, send, spend, or commit |
| Operate | Execute reversible internal actions within scoped playbooks | External communication, payments, contracts, privileged changes |
| Approve | Approve defined low/medium-risk internal work within threshold | Founder-reserved or regulated commitments |
| Executive | Set priorities and approve designated high-impact actions | Bypass compliance, evidence, tenant, or audit controls |

AI role level does not grant human identity. The UI must label AI agents as AI unless the participant record explicitly represents a human account.

## Always human-approved

- first-time or bulk external outreach;
- public company claims and public communications;
- contracts, pricing commitments, orders, payments, refunds, and spending;
- legal, regulatory, investment, precious-metals, and sanctions-sensitive decisions;
- credentials, connector scopes, user/role changes, and secret access;
- destructive data changes;
- autonomous recurring or background work activation.

## Proposed 126-seat distribution

The exact catalog will be seeded additively. The target coverage is:

| Function | Seats |
| --- | ---: |
| Executive office and company coordination | 7 |
| Strategy, research, intelligence, and Company Brain | 13 |
| Commercial, client success, and deal management | 15 |
| Sourcing, procurement, and supplier development | 17 |
| Trade operations, logistics, and supply management | 15 |
| Countries, territories, and market expansion | 18 |
| Industries and technical verticals | 13 |
| Finance, payments, treasury, and controls | 9 |
| Legal, compliance, trust, quality, and risk | 9 |
| Product, platform, data, engineering, and security | 10 |
| **Total** | **126** |

These are seats in one organization. An active task may involve a small team selected by routing policy.

## Routing

The router selects agents from:

1. user intent and entity resolution;
2. territory and industry;
3. relationship owner;
4. required expertise;
5. data permissions;
6. decision authority;
7. workload and availability;
8. conflict-of-interest and compliance constraints.

When the active agent lacks authority or expertise, it preserves the thread context and proposes a handoff. It does not impersonate another role.

## Runtime visibility

Every active run must appear in the existing Operations Center with:

- initiating user or approved schedule;
- responsible agent and supporting agents;
- task and expected output;
- tools and sources being used;
- elapsed time, budget, and stop control;
- approval state;
- events, results, evidence, and failure reason.

No consent means no AI execution. No visibility means no execution.

## External communication invariant

`FEATURE_EXTERNAL_COMMUNICATIONS` defaults to false. Even when enabled in a later release, a send requires a recorded approval ID, approving human user, approval time, recipient provenance, channel policy checks, consent/DNC checks, and an auditable action request.
