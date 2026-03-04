# UX Acceptance Gate (Release)

This is the **release gate** for Bourse de l’Or mobile UX (iOS + Android + PWA).
Goal: ship only when the experience feels like a **real mobile app** (thumb-first), not a responsive website.

## Gate Rules (Pass/Fail)

Release is **PASS** only if all are true:

1. **No dead ends**: every screen can exit in one gesture/tap (Back / Close / Swipe-down / Bottom nav).
2. **Thumb-first**: critical actions are reachable with one thumb (bottom zones).
3. **No overlaps**: floating UI never blocks CTAs or taps.
4. **Scorecard average ≥ 4.5/5** (see below) with no critical category below 4.
5. **Auth is optional-feeling**: login/signup never traps the user.

## How To Run The Gate (Fast)

Use the built-in QA screen:

- Open: `/qa-mobile`
- Fill the **Pages matrix** + **Scorecard**
- Gate status shows **PASS / NEEDS WORK**
- Results persist in localStorage (per device)

## Required Pages To Check

- Browse (feed)
- Product detail
- Map
- Wallet
- Vault
- Orders
- Contracts
- Login
- Signup
- Admin (if applicable)

## Scorecard (1–5)

Target average ≥ 4.5/5.

### Navigation & Orientation
- User always knows where they are
- Exit always obvious
- No dead-end pages
- Navigation consistency

### Thumb Ergonomics
- Primary actions reachable
- Secondary actions reachable
- Floating buttons never obstruct

### Information Hierarchy
- Quantity/availability shown before price
- Proximity is clear and useful
- Mode clarity (Retail / Wholesale / Invest)

### Visual Quality
- Images feel unique (no repetition)
- Premium + calm (exchange-grade)

### Trust & Finance
- Wallet clarity (balances + movements)
- Vault clarity (ownership + units)
- Contracts readability

### Auth
- Login feels optional
- Auth screens always escapable

## Ship Checklist (Binary)

- [ ] Every page is escapable
- [ ] No CTA is blocked by floating UI
- [ ] Bottom navigation is consistent where relevant
- [ ] Guest flows are calm and non-coercive
- [ ] Image repetition is not noticeable in the feed

