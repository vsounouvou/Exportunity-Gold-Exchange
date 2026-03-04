# Exportunity / Bourse de l'Or Human UX Spec (v1)

## Navigation map (mobile-first)

- `Chats` -> `/app/chats`
- `Actions` -> `/app/actions`
- `Wallet` -> `/app/wallet`

Default entry route:

- `/app` -> `/app/chats/general-operations`

Chat detail routes:

- `/app/chats/general-operations` (maps to room key `ops`)
- `/app/chats/:roomKey`

Wallet action routes:

- `/app/wallet/receive`
- `/app/wallet/send`

Legacy compatibility redirects:

- `/app/threads` -> `/app/chats`
- `/app/inbox` -> `/app/chats`
- `/app/room/:roomKey` -> `/app/chats/:roomKey`
- `/app/money` -> `/app/wallet`
- `/mobile/threads` -> `/app/chats`
- `/mobile/operations` -> `/app/actions`
- `/mobile/money` -> `/app/wallet`

## Default agent roster (starter pack)

- Elena Novak - Compliance Agent
  - Scope: `KYC`, `KYB`, `AML`
- Amadou Kone - Support Agent
  - Scope: support issues, escalations, follow-up
- Kofi Mensah - Payments Agent
  - Scope: receive, send, payment status, reconciliation
- Marie Diop - Accounting Agent
  - Scope: ledger checks, invoice status, daily summary
- Fatou Traore - Operations Agent
  - Scope: orders, procurement, fulfillment follow-up
- Sara Bello - Sales Assistant
  - Scope: client replies, offers, pipeline updates

Primary conversation:

- `General Operations` (always pinned and first)

## Agent personality + tone rules

- Every agent speaks as a named employee, never as a system label.
- Keep responses short and direct: decision first, next step second.
- Never expose raw metadata, IDs, stack traces, or tool internals in user chat.
- If action is blocked, state the blocker and one concrete recovery step.
- If money, compliance, or order changes are requested, confirm intent before execution.
- If unresolved after two exchanges, hand off explicitly to the correct named agent.

## UX guardrails

- No clickable element without a destination or action.
- No duplicate primary navigation.
- One primary action per screen.
- Dashboards summarize; conversations execute.
