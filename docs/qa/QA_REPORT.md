# QA Report

Date: 2026-01-14 00:11:13 +00:00  
Commit: 2fc69f34fa5cf8b153567d512d03ae8fd5fd78a5

## Inventory
- Page inventory: 53 routes (`docs/qa/page-inventory.json`)
- Menu inventory: 32 items (`docs/qa/menu-inventory.json`)
- Coverage: `npm run qa:coverage` passes (hidden routes annotated in `client/src/lib/routeMeta.ts`)

## Menu Coverage Fixes
Missing pages added to menus:
- `/admin/assets/images` (Image Studio)
- `/admin/companies`
- `/admin/hierarchy`
- `/admin/tasks`
- `/admin/goals`
- `/admin/knowledge`
- `/admin/clones`
- `/admin/whatsapp`
- `/admin/bureaus`
- `/admin/contracts`
- `/admin/profile`

Hidden routes (intentionally excluded from menus):
- `/` - Primary entry route with automatic redirects.
- `/admin` - Authentication entry screen.
- `/admin/password` - Password change flow.
- `/meetings` - Legacy redirect to `/ai-team`.
- `/seller` - Alias route for `/seller-dashboard`.
- `/orders/:orderNumber` - Detail page linked from orders list.
- `/delivery/agent/:id` - Detail page linked from delivery admin list.
- `/territories/:id` - Detail page linked from territory list.
- `/marketplace-old` - Legacy route kept for backwards compatibility.
- `/debug/location` - Debug utility, not for production users.
- `/qa-mobile` - QA utility, not for production users.
- `/install` - Install flow entry (PWA).
- `/switch` - Deep link used by space switcher.
- `/apply/shop` - Application flow entry from CTA.
- `/apply/delivery` - Application flow entry from CTA.
- `/application-status` - Status deep link from email.
- `/cadre-conformite` - Legal/compliance footer link.
- `/terms` - Legal footer link.
- `/privacy` - Legal footer link.
- `/login` - Authentication entry screen.
- `/register` - Authentication entry screen.
- `/gateway` - Primary role gateway entry.
- `/shop` - Marketplace entry handled by CTA/role routing.
- `/orders` - Orders view accessed from account/CTA.
- `/delivery` - Delivery hub entry accessed from CTA.
- `/account` - Account entry accessed from user menu.

## Image Studio Status
- Admin menu entry "Image Studio" visible and routes to `/admin/assets/images`.
- Homepage (Bourse) panel exposes 6 fixed slots with generate/upload/history and active thumb.
- Public resolver `/api/assets/image` returns `{ url, updatedAt }` or `url: null` (no 404s).
- Chairman assistant now generates images via server endpoint and sets active assets.

Screenshots:
- `docs/qa/screenshots/admin-image-studio-nav.png`
- `docs/qa/screenshots/homepage-images-panel.png`
- `docs/qa/screenshots/assistant-image-generation.png`
- `docs/qa/screenshots/chat-jump-to-latest.png`

## Chat Panel UX
- Message list container is `overflow-y: auto` with full-height scroll.
- Auto-scrolls to bottom on new messages unless the user scrolls up.
- Jump-to-latest button appears when not at bottom.
- Load older messages button paginates long history.

## E2E
Command: `npm run test:e2e:3x`  
Result: 3/3 passes (all specs green).

## Known Limitations
- Flutterwave provider warning in dev logs when API keys are absent.
- Replicate model resolution now uses latest model version per slug; ensure the model slug is valid.
