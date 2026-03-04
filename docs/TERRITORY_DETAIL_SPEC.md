# Territory Detail — Operational Spec

## 1) Wireframe (sections and order)
1. Header: back to list, name, type, city/country, status badges, Refresh.
2. Overview: center coords, radius, created date, status/type badges.
3. KPIs: GMV, platform fees, active buyers, active sellers, orders, dispute rate.
4. Budget: month, funded amount, cap, mode.
5. AI Team: assigned manager/agents (placeholder until data is wired).
6. Human Roles: operator/managers/referrers list with status and last activity.
7. Activity Feed: planned feed of AI/human actions, ads, onboarding, budget changes (placeholder).
8. Controls & Commands: planned quick actions (ad burst, onboarding push, strategy review, competitor analysis, freeze).
9. Hierarchy: parent/child territories, drill-down (placeholder).

## 2) KPI formulas (per territory, per period)
- GMV: sum(order_total) for orders within territory and period.
- Platform fees: sum(platform_fee) for those orders.
- Orders count: number of orders in period.
- Active buyers: distinct buyers with ≥1 order in period.
- Active sellers: distinct sellers with ≥1 fulfilled listing in period.
- Delivery success rate: delivered orders / total orders in period.
- Dispute rate: disputed orders / total orders in period.

## 3) AI agent roles per territory (baseline)
- Country AI Manager: oversight, budget guardrails, performance reviews.
- Growth AI: local ad bursts, campaign rotation, A/B suggestions.
- Onboarding AI: seller/shop onboarding nudges, checklist tracking.
- Media AI: creative variants, localized copy, asset requests.
- Ops AI: delivery SLA monitoring, dispute alerts, risk flags.
- Intelligence AI (optional): competitor scans, pricing deltas, opportunity alerts.

## 4) Territory lifecycle
- Create: define geo (center/radius), tenant, status=inactive by default, set budget mode.
- Activate: status=active, assign AI manager + human operator (optional), start budget.
- Grow: normal operation with periodic KPI rollups, budget burns, campaigns.
- Pause/Low-power: status=paused or mode=low_power, limit spend/ops.
- Resume: restore active + funded mode.
- Archive: status=inactive/archived, preserve history, no new ops; requires explicit reactivation to use again.

## Notes
- Territory detail page is page-based (no modals) and loads fast from `/api/territories/:id`.
- All admin menu territory actions live under “Territories”.
