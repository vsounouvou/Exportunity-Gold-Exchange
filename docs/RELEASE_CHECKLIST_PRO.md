# Exportunity Pro — Release Checklist (P0)

## Navigation and Routing
- [ ] Sidebar contains only `Operations`, `Money`, `Orders`, `Agents`, `Account`.
- [ ] Mobile bottom nav uses same structure (Orders conditional by role/capability).
- [ ] `/pro/agents/*` tab routes work: `store`, `team`, `inbox`, `tasks`, `billing`.
- [ ] `/pro/money/*` section routes work: `wallet`, `transactions`, `reports`.
- [ ] Account page includes a working back action.

## Operations
- [ ] Default home route lands in `General Operations` chat.
- [ ] General Operations shows active team agents.
- [ ] `Add agent` in Operations inserts agent mention into composer.
- [ ] `Marketplace` entry from Operations opens Agents Store.

## Money
- [ ] `Receive` button opens receive modal and can be dismissed.
- [ ] `Send` button opens send modal and can be dismissed.
- [ ] Transactions tab renders transaction list or empty state.
- [ ] Reports tab renders report cards and export action state.

## Space Switch
- [ ] Space switch control is visible in top header.
- [ ] Missing token on `/switch` triggers token refresh fallback once.
- [ ] Switch flow no longer blocks on `Missing space switch token`.

## QA Gate
- [ ] `tests/e2e/pro-p0-tabs.spec.ts` passes in Chromium.
- [ ] No dead CTA in Operations/Agents/Money/Account P0 paths.
- [ ] No blank tab content for Agents or Money.
