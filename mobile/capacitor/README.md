# Capacitor wrapper (scaffold)

This folder is a starting point to ship **Bourse de l’Or** as iOS/Android apps using a native shell around the existing web app.

## Option 1: Point to production URL (fastest)

- Keep `server.url` in `capacitor.config.ts` set to `https://boursedelor.com`
- Build Android/iOS shells and ship updates instantly via the web

## Option 2: Bundle the web build (store-friendly)

1. Build the web app from repo root:
   - `npm --prefix Exportunity-Gold-Exchange run build`
2. Copy built static assets into this folder:
   - copy `Exportunity-Gold-Exchange/dist/public/*` → `Exportunity-Gold-Exchange/mobile/capacitor/www/`
3. Then:
   - `npm install`
   - `npx cap add android`
   - `npx cap add ios`
   - `npx cap sync`

## Notes

- Deep links, push, QR scanning, biometrics are added as Capacitor plugins later.

