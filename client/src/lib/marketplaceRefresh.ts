export const MARKETPLACE_REFRESH_STORAGE_KEY = "ece_marketplace_refresh";
export const MARKETPLACE_REFRESH_EVENT = "ece_marketplace_refresh_event";

export function broadcastMarketplaceRefresh() {
  const ts = Date.now();
  try {
    localStorage.setItem(MARKETPLACE_REFRESH_STORAGE_KEY, String(ts));
  } catch {
    // ignore (private mode / blocked storage)
  }

  try {
    window.dispatchEvent(new CustomEvent(MARKETPLACE_REFRESH_EVENT, { detail: { ts } }));
  } catch {
    // ignore
  }
}
