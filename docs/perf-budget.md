# Performance Budget — Mobile Targets

## Targets (practical)

- **First screen usable**: < 2s on 4G (mid-range Android)
- **Main JS**: keep initial payload under ~300–500KB gzip if possible (route-split where needed)
- **Map**: defer heavy marker rendering until after UI is interactive

## Work items

- Lazy-load map-heavy modules (Leaflet/react-leaflet and marker clusters).
- Route-split large pages (e.g. separate `/orders`, `/delivery`, admin-only areas).
- Use responsive images (already largely via Vite asset pipeline).
- Cache static assets aggressively; avoid caching HTML shell.

## Implemented now

- Static caching headers for production in `server/vite.ts` (immutable caching for `/assets/*`, no-cache for `index.html`, `sw.js`, `manifest.webmanifest`).
- PWA service worker runtime cache for same-origin static assets (`client/public/sw.js`).

