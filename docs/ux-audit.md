# UX Audit Report (Mobile-first)

Date: 2026-01-02
Scope: Bourse de l'Or buyer experience

## Home / Feed
- Issues found: AI entry scattered, feed/list remounts on state changes, mobile list flicker during fetch.
- Fixes applied: single floating Concierge button + bottom-sheet chat; React Query placeholder data to keep lists stable; feed intent updates without remount.

## Map View
- Issues found: location request could stall; map/list refresh reorders on fetch.
- Fixes applied: tighter GPS timeout (8s) and IP fallback retained; list fetch uses cached placeholder data to avoid flashes.

## Product List
- Issues found: content flicker on filter/search; duplicate action entry points on mobile drawer.
- Fixes applied: stable query caching for nearby + feed; removed duplicate account/cart/locale controls from mobile drawer.

## Product Detail
- Issues found: modal-style overlay with floating close button conflicted with navigation model; CTA buried in scroll.
- Fixes applied: full-screen detail page layout with back arrow; clean hierarchy (title → price → seller → trust → accordions); sticky bottom CTA with price + add-to-order.

## Cart
- Issues found: potential remounting when switching overlays; inconsistent access on mobile.
- Fixes applied: cart retained as sheet; preserved state across chat overlay and feed transitions.

## Checkout
- Issues found: mixed interaction models; long scroll without fixed summary.
- Fixes applied: retained assistant flow; top summary visible; no interference with concierge overlay.

## Vault / Storage
- Issues found: mobile space competition with other overlays.
- Fixes applied: kept in sheet with consistent padding and safe-area spacing.

## Account / Profile / Admin
- Issues found: mobile entry point was unclear when drawer duplicated controls.
- Fixes applied: account access remains in header avatar dropdown; admin entry remains role-gated.

## KYC / Compliance
- Issues found: compliance prompt could block chat on mobile in older flow.
- Fixes applied: concierge no longer uses compliance gate; chat opens immediately.

## AI Concierge
- Issues found: full-screen chat experience and extra controls caused overload.
- Fixes applied: floating button + bottom-sheet chat (40–60% height), single input, no chips or search.

## Modals / Overlays / Drawers
- Issues found: multiple navigation controls on mobile; inconsistent close targets.
- Fixes applied: unified mobile controls; concierge uses swipe-down or tap-outside to close (no duplicate close buttons).

## Notes
- Screenshots not captured in CLI. Visual verification recommended on iOS Safari + Android Chrome.

## Acceptance Checks
- Concierge never full-screen; input always visible above safe area.
- Feed/list does not flicker on data refresh.
- Product detail navigation uses back arrow (no floating X).
- Location fallback active when GPS fails.
