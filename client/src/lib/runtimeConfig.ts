function normalizeBaseUrl(value: string | undefined): string | null {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return null;
  return trimmed.replace(/\/+$/, "");
}

type RuntimeConfig = {
  apiBaseUrl?: string;
  socketBaseUrl?: string;
  buildId?: string;
  builtAt?: string;
  gitSha?: string;
};

declare global {
  interface Window {
    __EXPORTUNITY_CONFIG__?: RuntimeConfig;
  }
}

export function getApiBaseUrl(): string | null {
  return (
    normalizeBaseUrl(window.__EXPORTUNITY_CONFIG__?.apiBaseUrl) ??
    normalizeBaseUrl(import.meta.env.VITE_API_BASE_URL)
  );
}

export function getSocketBaseUrl(): string | null {
  return (
    normalizeBaseUrl(window.__EXPORTUNITY_CONFIG__?.socketBaseUrl) ??
    normalizeBaseUrl(import.meta.env.VITE_SOCKET_URL) ??
    getApiBaseUrl()
  );
}

export function resolveApiUrl(pathOrUrl: string): string {
  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl) return pathOrUrl;
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  if (!pathOrUrl.startsWith("/api")) return pathOrUrl;
  return `${apiBaseUrl}${pathOrUrl}`;
}
