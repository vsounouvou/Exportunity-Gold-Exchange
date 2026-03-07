# Bourse de l'Or VPS Validation Checklist

## Storefront

1. Open `https://boursedelor.com/store` in a fresh incognito window.
2. Confirm the hero appears first with:
   - `Or africain certifié, des mines jusqu'à votre coffre`
   - `Acheter de l'or`
   - `Voir le marché`
3. Confirm the live gold chart loads above the main catalog.
4. Confirm the page no longer starts with a giant raw product wall.
5. Confirm category-led entry exists:
   - `Lingots`
   - `Pièces`
   - `Collection`
6. Confirm `Pièces` and `Collection` do not show zero when the live tenant catalog contains jewelry or gold art items.
7. Confirm weight chips appear for the Lingots view.
8. Confirm the default catalog grid is denser than the previous oversized card layout.
9. Confirm the `Votre coffre` block appears before the long product browse experience.
10. Confirm `Actualités & réglementation` appears before the bottom of the page.
11. Confirm `Espace Pro` is visible with a CTA to `/espace-pro`.

## Product logic

1. Click an ingot card and verify:
   - weight is visible
   - carat/purity is visible
   - price renders cleanly
   - `Frappé à la demande` appears
2. Click a collector or coin item and verify it appears under `Pièces` or `Collection`, not mixed into every view.
3. Confirm no obvious cross-tenant products appear.

## Vault and wallet

1. Sign in with the admin demo account.
2. Open the `Votre coffre` CTA.
3. Confirm demo vault inventory exists.
4. Confirm wallet balance renders.
5. Confirm eligible items can surface `Transformer en bijou`.

## Admin

1. Open `https://boursedelor.com/admin/stamped-gold`.
2. Confirm the master page shows `Atelier de frappe`.
3. Open `https://boursedelor.com/admin/stamped-gold/minting-studio`.
4. Confirm the page loads blank ingot/coin template previews.
5. Change:
   - owner name
   - serial
   - edition
   - QR toggle
6. Confirm the preview updates immediately.
7. Confirm the workshop sheet summary matches the edited fields.

## Routing

1. Confirm these routes return 200:
   - `/store`
   - `/stamped-gold`
   - `/pieces`
   - `/collections`
   - `/actualites`
   - `/reglementation`
   - `/industrie-miniere`
   - `/espace-pro`

## Regression checks

1. No console errors on first load.
2. No hydration mismatch warnings.
3. No NaN price values.
4. No dead top ghost strip.
5. No broken navigation loops between `/store`, `/stamped-gold`, and `/pieces`.
