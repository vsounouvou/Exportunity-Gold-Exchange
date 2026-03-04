# Agentic Platform — Production Readiness Master Spec (AOS)

This document is the **final pre-production operating spec** for the Bourse de l’Or / Exportunity multi-tenant platform.

The platform is an **Agentic Operating System (AOS)**:

- Scripts/rules/actions do **most work**
- Intelligence (LLM) is **scarce** and used only when needed
- Communication is **structured** and **monitorable**
- Execution happens through **audited, retryable actions**

---

## 1) Company Structure (3 layers)

### BOARD
- Defines strategy, approves budgets, handles escalations.

### EXECUTION (CEO + Coordinators)
- Translates board direction into executable plans.
- Allocates work and monitors performance.

### OPERATIONS (Workers)
- Executes tasks/actions; reports status; escalates blockers.

---

## 2) Internal Coordination Bus (ICB)

This is **not a chat app**. It is a structured coordination bus.

### Message types (no free-form by default)
- `STATUS_UPDATE`
- `REQUEST`
- `DECISION`
- `HANDOFF`
- `ALERT`
- `ACTION_TRIGGER`
- `ESCALATION`
- `FYI`

### Thread types (only these)
1. **BOARD THREAD**
2. **EXECUTION THREAD**
3. **DEPARTMENT THREADS**
4. **CASE THREADS** (entity-bound)

---

## 3) Action System (the heart)

Agents do not “do things”. They **trigger actions**.

An action must be:
- deterministic / scriptable
- logged and auditable
- retryable
- idempotent (where possible)
- approval-gated when required

### Action categories (minimum)
1. COMMUNICATION (email/whatsapp/sms)
2. DATA (query/enrich/validate/compare)
3. WORKFLOW (tasks/escalations/approvals)
4. MARKET (prospecting/benchmarking)
5. SYSTEM (product/content/config)

---

## 4) Budget & Intelligence Governance

Default escalation ladder:
1) script
2) rule engine
3) template
4) heuristic
5) LLM (cheap)
6) LLM (strong)
7) board escalation

Agents must be budget-aware:
- per-tenant LLM budget (daily/monthly)
- per-agent quota

---

## 5) Day‑1 Autonomous Cycle (GO LIVE)

### Boot
- Activate background schedulers
- Start budgets meters
- Agents post `STATUS_UPDATE` to their dept threads

### Always-on loops
- Client capture (auto-engage, create CASE, assign agent)
- Market scan (scripts)
- Product/content optimization (metrics → action proposals)
- Ops loop (event-driven CASE threads + tasks + actions)

### Daily synthesis
- CEO posts daily summary to BOARD thread

---

## 6) Repo Implementation Mapping (current)

### Internal Coordination Bus (threads/messages)
- Tables: `db/schema/ops-comms.ts`
- API: `server/routes/ops-comms.ts`
- Table ensure: `server/lib/ops-comms/ensureTables.ts`

### Action system (requests/results + worker)
- Tables: `db/schema/actions.ts`
- API: `server/routes/actions.ts`
- Router: `server/lib/actions/ActionRouter.ts`
- Worker: `server/lib/actions/worker.ts`
- Worker script: `server/scripts/action-worker.ts`
- NPM script: `actions:worker`

### Email as an action (send helper)
- `server/lib/mail/sender.ts` (`sendEmailAsAgent`)
- Existing endpoint uses helper: `server/routes/email.ts`

### Ops Center UI
- `client/src/pages/AITeamHubPage.tsx` (tabs: Chat / Background / Actions / Decisions)

---

## 7) Production Readiness Checklist (minimum)

- Every agent can trigger ≥1 real action.
- All core threads exist (board/execution/depts/ops-general).
- Action approvals and retries are tested.
- Workers are opt‑in, visible, stoppable (no hidden background processes).
- Budget signals are visible and enforced.
- Failure mode: pause + alert + escalation.

