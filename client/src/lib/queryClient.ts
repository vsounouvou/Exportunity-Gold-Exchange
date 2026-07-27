import { QueryClient } from "@tanstack/react-query";
import { resolveApiUrl } from "./runtimeConfig";
import { getDemoModeHeaders } from "./demoMode";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function readApiError(res: Response) {
  const text = await res.text().catch(() => "");
  const contentType = String(res.headers.get("content-type") || "").toLowerCase();
  let message = text;

  if (text && (contentType.includes("application/json") || text.trim().startsWith("{") || text.trim().startsWith("["))) {
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === "object") {
        const extracted =
          (parsed as any).message ||
          (parsed as any).error ||
          (parsed as any).details ||
          (parsed as any).reason;
        if (typeof extracted === "string" && extracted.trim()) message = extracted.trim();
      }
    } catch {
      // Keep the response text when it is not valid JSON.
    }
  }

  return new ApiError(res.status, message || `${res.status}: ${res.statusText}`);
}

function getClientLanguage(): string | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("ece_language");
  const lang = String(raw || "")
    .trim()
    .toLowerCase();
  if (lang === "en" || lang === "fr" || lang === "ar") return lang;
  return null;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: async ({ queryKey }) => {
        const token = typeof window !== "undefined" ? localStorage.getItem("ece_session") : null;
        const headers = new Headers();
        if (token) headers.set("Authorization", `Bearer ${token}`);
        const lang = getClientLanguage();
        if (lang) headers.set("x-ece-lang", lang);
        const demoHeaders = getDemoModeHeaders();
        for (const [key, value] of Object.entries(demoHeaders)) {
          headers.set(key, value);
        }
        const res = await fetch(resolveApiUrl(queryKey[0] as string), {
          cache: "no-store",
          credentials: "include",
          headers,
        });

        if (!res.ok) {
          throw await readApiError(res);
        }

        return res.json();
      },
      refetchInterval: false,
      refetchOnWindowFocus: true,
      staleTime: 30_000,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});

export async function apiRequest(url: string, options?: RequestInit): Promise<any>;
export async function apiRequest(url: string, method: string, body?: unknown): Promise<any>;
export async function apiRequest(
  url: string,
  optionsOrMethod?: RequestInit | string,
  body?: unknown
) {
  // Backward compatible call signature:
  //   apiRequest(method, url, body)
  // Some older pages/tools used this order; detect and swap to avoid fetch() "invalid HTTP method" errors.
  if (
    typeof optionsOrMethod === "string" &&
    /^[A-Z]+$/.test(url) &&
    /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/i.test(url) &&
    /^(\/|https?:\/\/)/i.test(optionsOrMethod)
  ) {
    const method = url;
    const realUrl = optionsOrMethod;
    url = realUrl;
    optionsOrMethod = method;
  }

  const options: RequestInit =
    typeof optionsOrMethod === "string"
      ? {
          method: optionsOrMethod,
          ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        }
      : (optionsOrMethod ?? {});

  const headers = new Headers(options?.headers);
  const isFormDataBody = typeof FormData !== "undefined" && options?.body instanceof FormData;
  const token = typeof window !== "undefined" ? localStorage.getItem("ece_session") : null;
  const demoHeaders = getDemoModeHeaders();
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  const lang = getClientLanguage();
  if (lang && !headers.has("x-ece-lang")) headers.set("x-ece-lang", lang);
  for (const [key, value] of Object.entries(demoHeaders)) {
    if (!headers.has(key)) headers.set(key, value);
  }
  if (!headers.has("Content-Type") && !isFormDataBody) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(resolveApiUrl(url), {
    cache: "no-store",
    credentials: "include",
    ...options,
    headers,
  });

  if (!res.ok) {
    throw await readApiError(res);
  }

  return res.json();
}
