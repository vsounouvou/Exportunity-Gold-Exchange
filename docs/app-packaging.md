# App Packaging — PWA + Capacitor + Desktop

## PWA (done in repo)

- Manifest: `client/public/manifest.webmanifest`
- Service Worker: `client/public/sw.js`
- Offline fallback: `client/public/offline.html`
- Icons: `client/public/pwa/*`
- Install help page: `/install` (`client/src/pages/InstallAppPage.tsx`)

### QA

- Android Chrome: menu → “Install app”
- iOS Safari: Share → “Add to Home Screen”
- Confirm offline fallback: disable network → reload → offline page or cached shell

## Capacitor (recommended next)

Goal: ship the same web app as native iOS/Android shells (push/QR/biometrics later).

### Strategy

1. **Build web app** as usual.
2. Capacitor shell points to either:
   - bundled static `dist/public`, OR
   - production URL `https://boursedelor.com`

### Suggested repo layout

- `mobile/capacitor/` (scaffold)

### Next steps (when you’re ready)

1. Install dependencies in `mobile/capacitor/`
2. `npx cap init` (or use the scaffold)
3. `npx cap add android` / `npx cap add ios`
4. Configure deep links + push

## Windows desktop (later)

- **Tauri** is preferred for size/perf if you only need a webview shell.
- **Electron** if you need heavy OS integrations.

