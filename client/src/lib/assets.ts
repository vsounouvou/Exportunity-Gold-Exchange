import { getApiBaseUrl } from "./runtimeConfig";

export function absolutizePublicUrl(url: string): string {
  const raw = String(url || "");
  const apiBaseUrl = typeof window !== "undefined" ? getApiBaseUrl() : null;

  if (!raw) return raw;

  if (apiBaseUrl && raw.startsWith("/")) {
    return `${apiBaseUrl}${raw}`;
  }

  if (typeof window !== "undefined" && raw.startsWith("http://")) {
    try {
      const parsed = new URL(raw);

      // Prefer upgrading to the current page protocol when the hostname matches.
      if (window.location.protocol === "https:" && parsed.hostname === window.location.hostname) {
        parsed.protocol = "https:";
        return parsed.toString();
      }

      // Or align protocol with the configured API base URL (common behind proxies).
      if (apiBaseUrl) {
        try {
          const api = new URL(apiBaseUrl);
          if (parsed.hostname === api.hostname) {
            parsed.protocol = api.protocol;
            return parsed.toString();
          }
        } catch {
          // ignore invalid API base URL
        }
      }
    } catch {
      // ignore invalid URL
    }
  }

  return raw;
}

export function withCacheBust(url: string, updatedAt?: number | string | null): string {
  const stamp = updatedAt === undefined || updatedAt === null ? "" : String(updatedAt);
  if (!stamp) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}v=${encodeURIComponent(stamp)}`;
}

export function buildResolverAssetUrl(res: { url: string | null; updatedAt: number | string | null }): string | null {
  if (!res?.url) return null;
  return withCacheBust(absolutizePublicUrl(res.url), res.updatedAt);
}

