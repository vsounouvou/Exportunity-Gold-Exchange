### Gateway Image Manager (Admin)

- URL: `/admin/gateway-images` (admin login required)
- Purpose: Upload or generate the Bourse landing images and set them active immediately.

Slots (namespace `bourse`):
- `landing/hero_desktop` (16:9)
- `landing/hero_mobile` (9:16)
- `landing/preview_ui` (16:10)
- `landing/role_miner` (3:2)
- `landing/role_wholesaler` (3:2)
- `landing/role_buyer` (3:2)
- `landing/role_investor` (3:2)

Actions per slot:
- View active thumbnail
- Upload & Set Active
- Generate & Set Active (preset prompt + negative prompt applied, model=quality, correct aspect)
- History (last generations)
- Copy/verify via resolver: `/api/assets/image?namespace=bourse&assetKey=<slot>`

If generation fails with 502:
- Ensure Replicate token is set on server
- Ensure DB migrations applied (`npm run db:push`)
- Ensure service name when exec’ing inside Docker: `docker compose exec -T <app> npm run gen:landing:bourse`
