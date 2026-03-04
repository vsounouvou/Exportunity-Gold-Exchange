# First Screen Rules — Mobile Model

## Deterministic rules

### First-time user (no stored location)

1. Show **map canvas** immediately.
2. Show a **non-blocking location banner** (allow GPS / continue without).
3. If location allowed:
   - center map on user
   - load nearby categories and sellers
4. If location denied/unavailable:
   - default region view
   - keep search available and highlight “Set location”

### Returning user

- Restore from `localStorage`:
  - buyer mode (retail/wholesale)
  - last geo selection (`marketplace_location_v1`)
  - last filters where applicable

### Wholesale gating

- Wholesale stays visible but must show a clean gate:
  - request access / upload documents / invite code (no dead ends)

## Where implemented today

- `client/src/pages/BuyerHomePage.tsx` already persists:
  - `marketplace_location_v1`
  - `buyer_mode`
  - `market_mode`

## Next implementation step

- Add a small “location banner” that appears only when:
  - no stored location exists AND GPS isn’t active yet
  - dismissed state persisted so it doesn’t spam users

