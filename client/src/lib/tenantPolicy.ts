import type { TenantKey } from "@/types/tenant";
import {
  getTenantAdminHomeRoute as getTenantAdminHomeRouteFromRegistry,
  getTenantDefaultRoute as getTenantDefaultRouteFromRegistry,
  hasTenantModule,
  type PlatformModuleKey,
} from "../../../tenants/index";
import { tenantFromHost } from "@/lib/tenantResolution";

const CORE_BACKOFFICE_TENANTS: TenantKey[] = ["agoojye", "bdo", "exportunity", "zone", "zogueland", "madd", "rayon1km", "xportcard"];
const TENANTS_EXPORTUNITY_ZONE: TenantKey[] = ["exportunity", "zone", "rayon1km"];
const SHARED_MARKETPLACE_CATALOG_TENANTS: TenantKey[] = ["exportunity", "zone"];
const EXPORTUNITY_ADMIN_NAV_ROUTES = new Set([
  "/dashboard",
  "/companies",
  "/agents",
  "/agents-os",
  "/operations/agents",
  "/ai-team",
  "/agenda",
  "/meetings",
  "/tasks",
  "/goals",
  "/actions",
  "/knowledge",
  "/admin/inbox",
  "/admin/evidence",
  "/admin/company-brain",
  "/admin/industrial-network",
  "/admin/carrier-network",
  "/admin/group-buying",
  "/admin/trade-intelligence",
  "/admin/advertising-governance",
  "/contracts",
  "/delivery/admin",
  "/admin/equipment-ops",
  "/admin/equipment-ops/listings",
  "/admin/equipment-ops/fleet-map",
  "/admin/equipment-ops/maintenance",
  "/marketplace/sellers",
  "/admin/marketplace/products",
  "/admin/marketplace/payments",
  "/sales",
  "/client-hunter",
  "/machinery",
  "/admin/media",
  "/admin/media/studio",
  "/territories",
  "/finance",
  "/admin/wallet",
  "/admin/contacts",
  "/admin-users",
  "/admin/email",
  "/admin/settings/communications/twilio",
  "/admin/settings/integrations/google-maps",
  "/admin/communications/whatsapp",
  "/admin/system/update",
  "/admin/seo",
  "/admin/brand",
]);
const ALL_TENANTS: TenantKey[] = [
  "agoojye",
  "bdo",
  "exportunity",
  "zone",
  "mindbase",
  "met",
  "vs",
  "hoz",
  "zogueland",
  "madd",
  "rayon1km",
  "xportcard",
];

function normalizePath(value: string) {
  const raw = String(value || "").trim();
  if (!raw.startsWith("/")) return "";
  const noQuery = raw.split(/[?#]/)[0] || raw;
  if (noQuery.length > 1 && noQuery.endsWith("/")) return noQuery.slice(0, -1);
  return noQuery || "/";
}

function matchesPrefix(path: string, prefix: string) {
  return path === prefix || path.startsWith(`${prefix}/`);
}

const RULES: Array<{ prefix: string; tenants: TenantKey[] }> = [
  // Canonical admin IA aliases available platform-wide.
  { prefix: "/admin/dashboard", tenants: [...ALL_TENANTS] },
  { prefix: "/admin/orders", tenants: [...ALL_TENANTS] },
  { prefix: "/admin/products", tenants: [...ALL_TENANTS] },
  { prefix: "/admin/collections", tenants: [...ALL_TENANTS] },
  { prefix: "/admin/users", tenants: [...ALL_TENANTS] },
  { prefix: "/admin/agents", tenants: [...ALL_TENANTS] },
  { prefix: "/admin/wallets", tenants: [...ALL_TENANTS] },
  { prefix: "/admin/analytics", tenants: [...ALL_TENANTS] },
  { prefix: "/admin/map", tenants: [...ALL_TENANTS] },
  { prefix: "/admin/settings", tenants: [...ALL_TENANTS] },
  { prefix: "/admin/brand", tenants: [...ALL_TENANTS] },
  { prefix: "/admin/modules", tenants: [...ALL_TENANTS] },

  // Canonical commerce routes (platform-wide, gated by module access).
  { prefix: "/store", tenants: [...ALL_TENANTS] },
  { prefix: "/collections", tenants: [...ALL_TENANTS] },
  { prefix: "/product", tenants: [...ALL_TENANTS] },
  { prefix: "/cart", tenants: [...ALL_TENANTS] },
  { prefix: "/checkout", tenants: [...ALL_TENANTS] },

  // Mindbase is isolated from operations shell.
  { prefix: "/mindbase", tenants: ["mindbase"] },
  { prefix: "/organizations", tenants: ["mindbase"] },
  { prefix: "/discover", tenants: ["mindbase"] },
  { prefix: "/explore", tenants: ["mindbase"] },
  { prefix: "/studio", tenants: ["mindbase"] },
  { prefix: "/build", tenants: ["mindbase"] },
  { prefix: "/workspaces", tenants: ["mindbase"] },
  { prefix: "/docs/api", tenants: ["mindbase"] },
  { prefix: "/i", tenants: ["mindbase"] },
  { prefix: "/c", tenants: ["mindbase"] },
  { prefix: "/admin/mindbase", tenants: ["mindbase"] },

  // BDO specific.
  { prefix: "/espace-pro", tenants: ["bdo"] },
  { prefix: "/pro/creations", tenants: ["bdo"] },
  { prefix: "/pro/collections", tenants: ["bdo"] },
  { prefix: "/pro/pieces", tenants: ["bdo"] },
  { prefix: "/pro/bijoux", tenants: ["bdo"] },
  { prefix: "/pro/art", tenants: ["bdo"] },
  { prefix: "/pro/revue", tenants: ["bdo"] },
  { prefix: "/pro/fabrication", tenants: ["bdo"] },
  { prefix: "/pro/certification", tenants: ["bdo"] },
  { prefix: "/pro/preuves", tenants: ["bdo"] },
  { prefix: "/pro/livraison", tenants: ["bdo"] },
  { prefix: "/pro/partenaires", tenants: ["bdo"] },
  { prefix: "/pro/parametres", tenants: ["bdo"] },
  { prefix: "/wholesale", tenants: ["bdo", "exportunity"] },
  { prefix: "/bureaus", tenants: ["bdo"] },
  { prefix: "/admin/stamped-gold", tenants: ["bdo"] },
  { prefix: "/machinery", tenants: ["bdo", "exportunity"] },
  { prefix: "/finance", tenants: ["bdo"] },
  { prefix: "/territories", tenants: ["bdo", "exportunity", "xportcard"] },
  { prefix: "/territory", tenants: ["bdo", "exportunity", "xportcard"] },
  { prefix: "/admin/territories", tenants: ["bdo", "exportunity", "xportcard"] },
  { prefix: "/admin/territory", tenants: ["bdo", "exportunity", "xportcard"] },

  // Exportunity + zone.
  { prefix: "/source", tenants: ["exportunity"] },
  { prefix: "/sell-export", tenants: ["exportunity"] },
  { prefix: "/manage-supply", tenants: ["exportunity"] },
  { prefix: "/expand", tenants: ["exportunity"] },
  { prefix: "/zone", tenants: [...ALL_TENANTS] },
  { prefix: "/map", tenants: [...ALL_TENANTS] },
  { prefix: "/industrial", tenants: ["exportunity"] },
  { prefix: "/producer-exchange", tenants: ["exportunity"] },
  { prefix: "/industrial-map", tenants: ["exportunity"] },
  { prefix: "/factories", tenants: ["exportunity"] },
  { prefix: "/export-products", tenants: ["exportunity"] },
  { prefix: "/industrial-supply", tenants: ["exportunity"] },
  { prefix: "/request-quote", tenants: ["exportunity"] },
  { prefix: "/retail", tenants: [...ALL_TENANTS] },
  { prefix: "/marketplace", tenants: [...ALL_TENANTS] },
  { prefix: "/marketplace/map", tenants: [...ALL_TENANTS] },
  { prefix: "/shop", tenants: [...ALL_TENANTS] },
  { prefix: "/rayon", tenants: ["exportunity"] },
  { prefix: "/xportcard", tenants: ["exportunity"] },
  { prefix: "/mining", tenants: ["exportunity"] },
  { prefix: "/gold", tenants: ["exportunity"] },
  { prefix: "/image-bank", tenants: ["exportunity"] },
  { prefix: "/media-bank", tenants: ["exportunity"] },
  { prefix: "/platform", tenants: ["exportunity"] },
  { prefix: "/pro", tenants: ["exportunity"] },
  { prefix: "/my-business", tenants: ["exportunity"] },
  { prefix: "/business-os", tenants: ["exportunity"] },
  { prefix: "/ai-business-center", tenants: ["exportunity"] },
  { prefix: "/distributor/territory", tenants: ["exportunity"] },
  { prefix: "/admin/exportunity", tenants: ["exportunity"] },
  { prefix: "/admin/industrial-network", tenants: ["exportunity"] },
  { prefix: "/admin/carrier-network", tenants: ["exportunity"] },
  { prefix: "/admin/group-buying", tenants: ["exportunity"] },
  { prefix: "/admin/trade-intelligence", tenants: ["exportunity"] },
  { prefix: "/admin/advertising-governance", tenants: ["exportunity"] },
  { prefix: "/admin/marketplace", tenants: [...TENANTS_EXPORTUNITY_ZONE, "bdo"] },
  { prefix: "/admin/pme-exchange", tenants: ["zone", "rayon1km"] },
  { prefix: "/seller-dashboard", tenants: TENANTS_EXPORTUNITY_ZONE },
  { prefix: "/seller", tenants: TENANTS_EXPORTUNITY_ZONE },
  { prefix: "/sellers", tenants: TENANTS_EXPORTUNITY_ZONE },
  { prefix: "/admin/equipment-ops", tenants: TENANTS_EXPORTUNITY_ZONE },

  // MET.
  { prefix: "/chat", tenants: ["met"] },
  { prefix: "/devis-btc", tenants: ["met"] },
  { prefix: "/assistant-maison-en-terre", tenants: ["met"] },
  { prefix: "/maison-modele", tenants: ["met"] },
  { prefix: "/briques", tenants: ["met"] },
  { prefix: "/plans", tenants: ["met"] },
  { prefix: "/devis", tenants: ["met"] },
  { prefix: "/realisations", tenants: ["met"] },
  { prefix: "/blog", tenants: ["met"] },
  { prefix: "/contact", tenants: ["bdo", "met", "vs", "hoz", "zogueland", "rayon1km"] },
  { prefix: "/mentions-legales", tenants: ["met"] },
  { prefix: "/politique-confidentialite", tenants: ["met"] },
  { prefix: "/admin/met", tenants: ["met"] },

  // VS.
  { prefix: "/press", tenants: ["vs"] },
  { prefix: "/portfolio", tenants: ["vs"] },
  { prefix: "/insights", tenants: ["vs"] },
  { prefix: "/admin/vs", tenants: ["vs"] },

  // HOZ.
  { prefix: "/books", tenants: ["hoz", "exportunity", "zogueland"] },
  { prefix: "/library", tenants: ["hoz", "exportunity", "zogueland"] },
  { prefix: "/jewelry", tenants: ["hoz"] },
  { prefix: "/admin/hoz", tenants: ["hoz"] },

  // Zogueland.
  { prefix: "/vision", tenants: ["agoojye"] },
  { prefix: "/history", tenants: ["agoojye"] },
  { prefix: "/challenge", tenants: ["agoojye"] },
  { prefix: "/teams", tenants: ["agoojye"] },
  { prefix: "/partners", tenants: ["agoojye"] },
  { prefix: "/sponsors", tenants: ["agoojye"] },
  { prefix: "/admin/agoojye", tenants: ["agoojye"] },

  // Zogueland.
  { prefix: "/create", tenants: ["zogueland"] },
  { prefix: "/family", tenants: ["zogueland"] },
  { prefix: "/child", tenants: ["zogueland"] },
  { prefix: "/story-bank", tenants: ["zogueland"] },
  { prefix: "/stories", tenants: ["zogueland"] },
  { prefix: "/zogueland", tenants: ["zogueland"] },
  { prefix: "/listen", tenants: ["zogueland"] },
  { prefix: "/worlds", tenants: ["zogueland"] },
  { prefix: "/parents", tenants: ["zogueland"] },
  { prefix: "/schools", tenants: ["zogueland"] },
  { prefix: "/community", tenants: ["zogueland"] },
  { prefix: "/classroom", tenants: ["zogueland"] },
  { prefix: "/safety", tenants: ["zogueland"] },
  { prefix: "/trust", tenants: ["zogueland"] },
  { prefix: "/admin/zogueland", tenants: ["zogueland"] },
  // MADD Academy runs under Zogueland now and can become its own tenant later.
  { prefix: "/madd-world", tenants: [...ALL_TENANTS] },
  { prefix: "/admin/madd", tenants: ["zogueland", "madd", "exportunity"] },
  // Rayon 1km.
  { prefix: "/admin/rayon1km", tenants: ["rayon1km"] },
  // XportCARD.
  { prefix: "/admin/xportcard", tenants: ["xportcard"] },
];

const SHARED_SAFE_PREFIXES = [
  "/switch",
  "/auth",
  "/login",
  "/register",
  "/forgot-password",
  "/setup-password",
  "/application-status",
  "/install",
  "/pay",
  "/wallet/topup/return",
  "/wallet/topup/flutterwave/return",
];

function isBdoHostMode() {
  if (typeof window === "undefined") return false;
  return tenantFromHost(window.location.hostname) === "bdo";
}

const SHARED_BACKOFFICE_PREFIXES = [
  "/dashboard",
  "/companies",
  "/agents",
  "/agents-os",
  "/operations/agents",
  "/commerce/ai-marketplace/agents",
  "/ai-team",
  "/agenda",
  "/meetings",
  "/tasks",
  "/goals",
  "/actions",
  "/knowledge",
  "/expert-clones",
  "/mail",
  "/webmail",
  "/notifications",
  "/admin/workstations",
  "/admin/evidence",
  "/admin/action-forge",
  "/admin/inbox",
  "/admin/notifications",
  "/admin/communications",
  "/admin/pme-exchange",
  "/admin/settings",
  "/admin/system",
  "/admin/wallet",
  "/admin/email",
  "/admin/posts",
  "/admin/press",
  "/admin/library",
  "/admin/media",
  "/admin/screenshots",
  "/admin/contacts",
  "/contracts",
  "/delivery/admin",
];

const ROUTE_MODULE_RULES: Array<{ prefix: string; module: PlatformModuleKey }> = [
  { prefix: "/store", module: "products" },
  { prefix: "/collections", module: "collections" },
  { prefix: "/product", module: "products" },
  { prefix: "/cart", module: "cart" },
  { prefix: "/checkout", module: "checkout" },
  { prefix: "/admin/orders", module: "checkout" },
  { prefix: "/admin/products", module: "products" },
  { prefix: "/admin/collections", module: "collections" },
  { prefix: "/admin/agents", module: "agents" },
  { prefix: "/admin/wallets", module: "wallet" },
  { prefix: "/admin/analytics", module: "analytics" },
  { prefix: "/admin/map", module: "map" },
  { prefix: "/dashboard", module: "analytics" },
  { prefix: "/agents", module: "agents" },
  { prefix: "/admin/wallet", module: "wallet" },
  { prefix: "/wallet", module: "wallet" },
  { prefix: "/admin/map", module: "map" },
  { prefix: "/territories", module: "map" },
  { prefix: "/territory", module: "map" },
  { prefix: "/admin/territories", module: "map" },
  { prefix: "/admin/territory", module: "map" },
  { prefix: "/admin/stamped-gold", module: "products" },
  { prefix: "/wholesale", module: "wholesale" },
  { prefix: "/devis", module: "bulk_quotes" },
  { prefix: "/admin/met/estimates", module: "bulk_quotes" },
  { prefix: "/books", module: "collections" },
  { prefix: "/jewelry", module: "collections" },
];

function resolveRouteModule(path: string): PlatformModuleKey | null {
  for (const rule of ROUTE_MODULE_RULES) {
    if (matchesPrefix(path, rule.prefix)) return rule.module;
  }
  return null;
}

export function getAllowedTenantsForPath(path: string): TenantKey[] {
  const normalized = normalizePath(path);
  if (!normalized) return [];
  const bdoHostMode = isBdoHostMode();

  const applyHostIsolation = (tenants: TenantKey[]) => {
    if (!bdoHostMode) return [...tenants];
    return tenants.includes("bdo") ? (["bdo"] as TenantKey[]) : [];
  };

  if (normalized === "/") {
    return applyHostIsolation(ALL_TENANTS);
  }

  if (normalized === "/admin" || matchesPrefix(normalized, "/admin/password")) {
    return applyHostIsolation(ALL_TENANTS);
  }

  for (const rule of RULES) {
    if (matchesPrefix(normalized, rule.prefix)) return applyHostIsolation(rule.tenants);
  }

  if (SHARED_BACKOFFICE_PREFIXES.some((prefix) => matchesPrefix(normalized, prefix))) {
    return applyHostIsolation(CORE_BACKOFFICE_TENANTS);
  }

  if (SHARED_SAFE_PREFIXES.some((prefix) => matchesPrefix(normalized, prefix))) {
    return applyHostIsolation(ALL_TENANTS);
  }

  if (
    normalized.startsWith("/admin") ||
    normalized.startsWith("/dashboard") ||
    normalized.startsWith("/operations") ||
    normalized.startsWith("/trade") ||
    normalized.startsWith("/assets") ||
    normalized.startsWith("/gold") ||
    normalized.startsWith("/media") ||
    normalized.startsWith("/inbox") ||
    normalized.startsWith("/internal") ||
    normalized.startsWith("/actions") ||
    normalized.startsWith("/goals") ||
    normalized.startsWith("/tasks") ||
    normalized.startsWith("/agenda") ||
    normalized.startsWith("/meetings") ||
    normalized.startsWith("/ai-team") ||
    normalized.startsWith("/companies") ||
    normalized.startsWith("/agents") ||
    normalized.startsWith("/knowledge") ||
    normalized.startsWith("/expert-clones") ||
    normalized.startsWith("/mail") ||
    normalized.startsWith("/notifications")
  ) {
    return applyHostIsolation(CORE_BACKOFFICE_TENANTS);
  }

  return applyHostIsolation(ALL_TENANTS);
}

export function getSharedMarketplaceCatalogTenants(tenantKey: TenantKey): TenantKey[] {
  if (SHARED_MARKETPLACE_CATALOG_TENANTS.includes(tenantKey)) {
    return [...SHARED_MARKETPLACE_CATALOG_TENANTS];
  }
  return [tenantKey];
}

export function isTenantRouteAllowed(path: string, tenantKey: TenantKey) {
  const normalized = normalizePath(path);
  if (!normalized) return false;

  if (!getAllowedTenantsForPath(normalized).includes(tenantKey)) return false;

  const routeModule = resolveRouteModule(normalized);
  if (!routeModule) return true;

  return hasTenantModule(tenantKey, routeModule);
}

export function getTenantDefaultRoute(tenantKey: TenantKey) {
  return getTenantDefaultRouteFromRegistry(tenantKey);
}

/**
 * Keeps the Exportunity sidebar focused on industrial operations without
 * removing deep routes that another tenant or an explicit link may still use.
 */
export function isTenantAdminNavVisible(path: string, tenantKey: TenantKey) {
  const normalized = normalizePath(path);
  if (!normalized) return false;
  if (tenantKey !== "exportunity") return isTenantRouteAllowed(normalized, tenantKey);
  return (
    isTenantRouteAllowed(normalized, tenantKey) &&
    EXPORTUNITY_ADMIN_NAV_ROUTES.has(normalized)
  );
}

export function getTenantAdminHomeRoute(tenantKey: TenantKey) {
  return getTenantAdminHomeRouteFromRegistry(tenantKey);
}
