import { appendQueryParamsToUrl } from "@/lib/url";

export type DeepLinkKey =
  | "os.home"
  | "os.contracts"
  | "os.wallet"
  | "os.approvals"
  | "os.invest.opportunities"
  | "os.invest.onboarding"
  | "os.raise-capital.apply"
  | "os.marketplace"
  | "os.pro.seller.home"
  | "os.gold.home"
  | "os.messaging"
  | "os.governance.logs"
  | "os.machinery.catalog"
  | "os.machinery.orders"
  | "os.machinery.financing"
  | "os.assets.directory";

type DeepLinkSurface = "os" | "pro" | "gold";

export type DeepLinkPrefs = {
  language?: string | null;
  currency?: string | null;
  country?: string | null;
  query?: Record<string, string | number | boolean | null | undefined>;
};

export type DeepLinkContext = {
  isAuthenticated?: boolean;
  requireAuthOverride?: boolean;
};

type DeepLinkTarget = {
  surface: DeepLinkSurface;
  modulePath: string;
  requiresAuth: boolean;
};

const TARGETS: Record<DeepLinkKey, DeepLinkTarget> = {
  "os.home": { surface: "os", modulePath: "/app", requiresAuth: true },
  "os.contracts": { surface: "os", modulePath: "/app/contracts", requiresAuth: true },
  "os.wallet": { surface: "os", modulePath: "/app/wallet", requiresAuth: true },
  "os.approvals": { surface: "os", modulePath: "/app/approvals", requiresAuth: true },
  "os.invest.opportunities": { surface: "os", modulePath: "/app/invest/opportunities", requiresAuth: true },
  "os.invest.onboarding": { surface: "os", modulePath: "/app/invest/onboarding", requiresAuth: true },
  "os.raise-capital.apply": { surface: "os", modulePath: "/app/raise-capital/apply", requiresAuth: true },
  "os.marketplace": { surface: "os", modulePath: "/marketplace", requiresAuth: false },
  "os.pro.seller.home": { surface: "pro", modulePath: "/seller-dashboard", requiresAuth: true },
  "os.gold.home": { surface: "gold", modulePath: "/marketplace?market=dore&buyer=wholesale", requiresAuth: false },
  "os.messaging": { surface: "os", modulePath: "/app/messaging", requiresAuth: true },
  "os.governance.logs": { surface: "os", modulePath: "/app/governance/logs", requiresAuth: true },
  "os.machinery.catalog": { surface: "os", modulePath: "/app/machinery/catalog", requiresAuth: true },
  "os.machinery.orders": { surface: "os", modulePath: "/app/machinery/orders", requiresAuth: true },
  "os.machinery.financing": { surface: "os", modulePath: "/app/machinery/financing", requiresAuth: true },
  "os.assets.directory": { surface: "os", modulePath: "/app/assets", requiresAuth: true },
};

function normalizeBaseUrl(value: string | undefined) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return null;
  return trimmed.replace(/\/+$/, "");
}

function baseUrlForSurface(surface: DeepLinkSurface): string {
  const cfg = (typeof window !== "undefined" ? (window as any).__EXPORTUNITY_CONFIG__ : null) || {};
  const env = import.meta.env as any;

  const override =
    surface === "os"
      ? normalizeBaseUrl(cfg.osBaseUrl) ?? normalizeBaseUrl(env.VITE_OS_BASE_URL)
      : surface === "pro"
        ? normalizeBaseUrl(cfg.proBaseUrl) ?? normalizeBaseUrl(env.VITE_PRO_BASE_URL)
        : normalizeBaseUrl(cfg.goldBaseUrl) ?? normalizeBaseUrl(env.VITE_GOLD_BASE_URL);

  if (override) return override;
  if (typeof window !== "undefined" && window.location?.origin) return window.location.origin;
  return "http://localhost:5000";
}

export function resolveDeepLinkUrl(key: DeepLinkKey, prefs: DeepLinkPrefs = {}, ctx: DeepLinkContext = {}): string {
  const target = TARGETS[key];
  const base = baseUrlForSurface(target.surface);

  const normalizedModuleUrl = appendQueryParamsToUrl(`${base}${target.modulePath}`, {
    lang: prefs.language || undefined,
    currency: prefs.currency || undefined,
    country: prefs.country || undefined,
    ...(prefs.query || {}),
  });

  const requiresAuth = ctx.requireAuthOverride ?? target.requiresAuth;
  const isAuthenticated = Boolean(ctx.isAuthenticated);

  if (!requiresAuth || isAuthenticated) return normalizedModuleUrl;

  const authUrl = appendQueryParamsToUrl(`${base}/auth`, {
    next: normalizedModuleUrl.replace(base, "") || "/",
  });
  return authUrl;
}

export function resolveDeepLinkPath(key: DeepLinkKey, prefs: DeepLinkPrefs = {}, ctx: DeepLinkContext = {}): string {
  const url = resolveDeepLinkUrl(key, prefs, ctx);
  try {
    const parsed = new URL(url, baseUrlForSurface(TARGETS[key].surface));
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return url;
  }
}

export function resolveInvestOpportunityDetailPath(
  slug: string,
  prefs: DeepLinkPrefs = {},
  ctx: DeepLinkContext = {},
): string {
  const safeSlug = encodeURIComponent(String(slug || "").trim());
  const modulePath = appendQueryParamsToUrl(`/app/invest/opportunities/${safeSlug}`, {
    lang: prefs.language || undefined,
    currency: prefs.currency || undefined,
    country: prefs.country || undefined,
    ...(prefs.query || {}),
  });

  const requiresAuth = ctx.requireAuthOverride ?? TARGETS["os.invest.opportunities"].requiresAuth;
  const isAuthenticated = Boolean(ctx.isAuthenticated);
  if (!requiresAuth || isAuthenticated) return modulePath;

  return appendQueryParamsToUrl("/auth", { next: modulePath });
}
