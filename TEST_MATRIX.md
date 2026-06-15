# Test Matrix

## Buyer Experience

- First-time user opens `/marketplace` and sees products, Tassi, and contextual map.
- User searches `Find breakfast near me` and sees nearby products/shops.
- User taps a marker and sees a quick peek.
- User enters a shop and sees products immediately.
- User selects quantities and places an order.
- Shop Front Desk agent responds instead of Tassi taking over.

## Map Experience

- `/map` opens map-dominant mode.
- User location marker says `You are here`.
- Markers show nearby businesses.
- Selecting a shop focuses the map and shows a route line.

## Wholesale

- `/wholesale` opens supplier-first context.
- Supplier cards show MOQ, lead time, distance, and ETA where available.
- Quote request language stays approval-gated.

## Bourse de PME

- `/pme-exchange` and `/ready-for-export` open PME profile context.
- Profiles show trust/commercial readiness language.
- No public investment offer is exposed.

## Agent and Attachments

- One composer only.
- Voice button is visible.
- Photo upload adds the image to the conversation and changes discovery context.
- Business mode shows group-agent operating room.

## Admin/Integrations

- Google integration status is visible once admin pages are implemented.
- Twilio/WhatsApp settings remain readable and approval-gated.
- Outreach logs and opt-outs are preserved.

## Commands

- `npm run check`
- `npm run build`
- Route smoke checks for `/marketplace`, `/map`, `/wholesale`, `/pme-exchange`, and `/ready-for-export`.
