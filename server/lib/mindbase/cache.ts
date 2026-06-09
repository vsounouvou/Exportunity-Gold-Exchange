type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

const memoryCache = new Map<string, CacheEntry<unknown>>();

export function getMindbaseCache<T>(key: string): T | null {
  const entry = memoryCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    memoryCache.delete(key);
    return null;
  }
  return entry.value as T;
}

export function setMindbaseCache<T>(key: string, value: T, ttlMs: number) {
  memoryCache.set(key, {
    value,
    expiresAt: Date.now() + Math.max(250, ttlMs),
  });
  return value;
}

export async function withMindbaseCache<T>(key: string, ttlMs: number, factory: () => Promise<T>) {
  const cached = getMindbaseCache<T>(key);
  if (cached !== null) return cached;
  const created = await factory();
  return setMindbaseCache(key, created, ttlMs);
}

export function clearMindbaseCache(prefix?: string) {
  if (!prefix) {
    memoryCache.clear();
    return;
  }
  for (const key of memoryCache.keys()) {
    if (key.startsWith(prefix)) memoryCache.delete(key);
  }
}
