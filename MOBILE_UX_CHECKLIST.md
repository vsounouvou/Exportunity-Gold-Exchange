# Mobile UX Checklist (Remaining)

## Concierge usability
- Confirm the floating button and input positioning on iOS Safari after recent changes.
- Persist open/close state across soft reloads without UI flicker.

## Location defaults
- Expand manual city picker beyond Abidjan if needed.

## Stability
- Remove any full-page reload on state changes (watch for service worker update loops).
- Keep Leaflet map instance stable (no remounts on minor UI updates).
- Debounce polling/fetch loops and cleanup timers on unmount.
