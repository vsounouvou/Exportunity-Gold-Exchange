const LOCAL_STORAGE_PREFIXES = [
  "admin-nav-collapse:",
  "chairman-dock:",
  "ops:",
  "ai-team:",
  "actions-debug:",
];

const SESSION_STORAGE_PREFIXES = [
  "admin-nav-collapse:",
  "chairman-dock:",
  "ops:",
  "ai-team:",
  "actions-debug:",
];

function clearMatching(storage: Storage, prefixes: string[]) {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i);
    if (!key) continue;
    if (prefixes.some((prefix) => key.startsWith(prefix))) keys.push(key);
  }
  for (const key of keys) {
    try {
      storage.removeItem(key);
    } catch {
      // ignore write failures
    }
  }
}

export function clearTenantScopedBrowserState() {
  if (typeof window === "undefined") return;
  try {
    clearMatching(window.localStorage, LOCAL_STORAGE_PREFIXES);
  } catch {
    // ignore storage access failures
  }
  try {
    clearMatching(window.sessionStorage, SESSION_STORAGE_PREFIXES);
  } catch {
    // ignore storage access failures
  }
}
