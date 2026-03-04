# Mobile Audit — Bourse de l’Or

## Stack (inferred from code)

- **Frontend framework**: React 18 (`client/src/main.tsx`)
- **Build tool**: Vite 5 (`vite.config.ts`)
- **Router**: Wouter (`client/src/App.tsx`)
- **State/data**: TanStack Query (`client/src/lib/queryClient.ts`)
- **Realtime**: Socket.IO client (`client/src/lib/socket.ts`)
- **Maps**: Leaflet via `react-leaflet` (`client/src/pages/BuyerHomePage.tsx`)
- **UI system**: TailwindCSS + shadcn/ui components (`client/src/index.css`, `client/src/components/ui/*`)

## API + environment

- **Primary API base URL**: relative `/api` by default.
- **Override points**:
  - `client/public/config.js` (`window.__EXPORTUNITY_CONFIG__.apiBaseUrl`)
  - `VITE_API_BASE_URL` (build-time)
- **Where it’s applied**: `client/src/lib/runtimeConfig.ts` → `resolveApiUrl()`.

## Main user routes + components

- **Primary consumer experience (Map + products + concierge)**: `client/src/pages/BuyerHomePage.tsx` mounted at `/` and `/shop`.
- **Orders**: `client/src/pages/MyOrdersPage.tsx` mounted at `/orders`.
- **Admin / internal dashboards**: `client/src/components/AdminLayout` + routes under `client/src/App.tsx`.

## Location logic (where to implement “first screen” rules)

- Implemented in `client/src/pages/BuyerHomePage.tsx`:
  - Persists last chosen location to `localStorage` key: `marketplace_location_v1`
  - Supports device GPS + manual selection (Dialog: `locationPickerOpen`)
  - Tracks status via `gpsStatus` and refresh/watch logic

## Responsive + mobile primitives already present

- Safe-area helpers in `client/src/index.css` (`.safe-area-top`, `.pb-safe`, etc.)
- Mobile detection hook: `client/src/hooks/use-mobile.tsx` (used in `BuyerHomePage`)
- Bottom sheets in places via shadcn Sheet + vaul Drawer (e.g. cart drawer, details sheets)

