# Mobile UX Issues — Current Observations

## High priority

- **Chip bars**: horizontal lists are scrollable, but should use snap + 44px min touch targets consistently.
- **Bottom interactions**: multiple “bottom overlays” (chat, cart drawer, panels) can compete for thumb space and safe-area padding.
- **Map gesture conflicts**: Leaflet pan/zoom can fight with scroll/swipe gestures when overlays are present.
- **First-time experience**: location + onboarding is functional but can feel “hidden” (user might not understand why results are far away).

## Medium priority

- **Header density**: on small screens, header + top overlays can consume a lot of vertical space.
- **Keyboard behavior**: search/chat inputs inside bottom overlays can cause viewport jumps (iOS Safari).
- **Performance**: `BuyerHomePage.tsx` is large; initial JS and map setup can feel heavy on low-end phones.

## Low priority

- **Micro-animations**: gesture affordances (drag handle, snap states) can be more “native”.
- **Offline UX**: needs a friendly message (now handled via `offline.html` + SW fallback).

