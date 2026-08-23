const EXPORTUNITY_PUBLIC_HOSTS = new Set([
  "exportunity.com",
  "www.exportunity.com",
  "exportunity.net",
  "www.exportunity.net",
  "com.exportunity.net",
  "www.com.exportunity.net",
]);

const EXPORTUNITY_PLATFORM_HOSTS = EXPORTUNITY_PUBLIC_HOSTS;

const INDUSTRIAL_DESTINATION = "/industrial";
const MARKETPLACE_DESTINATION = "/marketplace";
const FACTORY_DESTINATION = "/factories";
const EXPORT_PRODUCTS_DESTINATION = "/export-products";
const PRODUCER_EXCHANGE_DESTINATION = "/producer-exchange";
const TRADE_DESTINATION = "/trade";
const AI_TEAM_DESTINATION = "/ai-team";

const RETIRED_ROOT_PATHS = new Set([
  "/about",
  "/archive",
  "/booking-calendar",
  "/company",
  "/contact",
  "/contact-8",
  "/copy-of-fintech",
  "/copy-of-home",
  "/demo",
  "/how-it-works",
  "/initiative",
  "/journey",
  "/our-journey",
  "/people",
  "/plans",
  "/plans-pricing",
  "/platforms",
  "/pricing",
  "/rayonhome",
  "/solutions",
  "/story",
  "/story/founder",
  "/talk",
  "/use-cases",
  "/what-we-do",
  "/work-with-us",
  "/operating-stack",
]);

const RETIRED_TRADE_ROOTS = [
  "/academy",
  "/blog",
  "/challenge-page",
  "/clubs",
  "/group",
  "/library",
  "/media",
  "/post",
  "/press",
  "/proof",
];

function normalizeHostname(hostname: string | null | undefined) {
  return String(hostname || "")
    .split(":")[0]
    .trim()
    .toLowerCase();
}

function normalizePathname(pathname: string | null | undefined) {
  const withoutQuery = String(pathname || "/").split(/[?#]/)[0] || "/";
  const withLeadingSlash = withoutQuery.startsWith("/") ? withoutQuery : `/${withoutQuery}`;
  return withLeadingSlash.replace(/\/+$/, "") || "/";
}

function isPathAtOrBelow(pathname: string, root: string) {
  return pathname === root || pathname.startsWith(`${root}/`);
}

export function isExportunityPublicHostname(hostname: string | null | undefined) {
  return EXPORTUNITY_PUBLIC_HOSTS.has(normalizeHostname(hostname));
}

export function isExportunityPlatformHostname(hostname: string | null | undefined) {
  return EXPORTUNITY_PLATFORM_HOSTS.has(normalizeHostname(hostname));
}

/**
 * Maps retired Exportunity public displays before the SPA is served. Current
 * operational, authenticated, API, and administration routes deliberately
 * return null unless an obsolete public alias has an explicit destination.
 */
export function getExportunityLegacyCommerceDestination(pathname: string | null | undefined): string | null {
  const path = normalizePathname(pathname);

  if (path === "/gateway") return "/";

  if (
    isPathAtOrBelow(path, "/mindbase") ||
    path === "/discover" ||
    path === "/explore" ||
    isPathAtOrBelow(path, "/build") ||
    isPathAtOrBelow(path, "/studio") ||
    isPathAtOrBelow(path, "/workspaces") ||
    isPathAtOrBelow(path, "/docs/api") ||
    isPathAtOrBelow(path, "/i") ||
    isPathAtOrBelow(path, "/c")
  ) {
    return "/";
  }

  if (RETIRED_ROOT_PATHS.has(path)) {
    return "/";
  }

  if (RETIRED_TRADE_ROOTS.some((root) => isPathAtOrBelow(path, root))) {
    return TRADE_DESTINATION;
  }

  if (path === "/gold" || path === "/gold-mining") {
    return PRODUCER_EXCHANGE_DESTINATION;
  }

  if (path === "/government" || path === "/government-institutions") {
    return INDUSTRIAL_DESTINATION;
  }

  if (isPathAtOrBelow(path, "/platform")) {
    if (isPathAtOrBelow(path, "/platform/gold")) return PRODUCER_EXCHANGE_DESTINATION;
    if (isPathAtOrBelow(path, "/platform/marketplace")) return MARKETPLACE_DESTINATION;
    if (isPathAtOrBelow(path, "/platform/wallet")) return "/auth?next=/app/wallet";
    if (isPathAtOrBelow(path, "/platform/contracts")) return "/auth?next=/app/contracts";
    if (isPathAtOrBelow(path, "/platform/invest")) return "/auth?next=/app/invest/opportunities";
    if (isPathAtOrBelow(path, "/platform/messaging")) return "/auth?next=/app/messaging";
    if (
      isPathAtOrBelow(path, "/platform/compliance") ||
      isPathAtOrBelow(path, "/platform/governance") ||
      isPathAtOrBelow(path, "/platform/security")
    ) {
      return "/auth?next=/app/governance/logs";
    }
    return AI_TEAM_DESTINATION;
  }

  if (path === "/wallet") return "/auth?next=/app/wallet";
  if (path === "/contracts" || isPathAtOrBelow(path, "/invest/contracts")) {
    return "/auth?next=/app/contracts";
  }
  if (path === "/invest" || isPathAtOrBelow(path, "/invest/opportunities")) {
    return "/auth?next=/app/invest/opportunities";
  }
  if (path === "/compliance") return "/auth?next=/app/governance/logs";
  if (path === "/communications") return "/auth?next=/app/messaging";
  if (path === "/business" || path === "/ops") return "/auth?next=/app";
  if (path === "/ai-operations") return AI_TEAM_DESTINATION;

  if (
    isPathAtOrBelow(path, "/or") ||
    isPathAtOrBelow(path, "/achat-or") ||
    path === "/stamped-gold" ||
    path === "/pieces"
  ) {
    return PRODUCER_EXCHANGE_DESTINATION;
  }

  if (path === "/map") return MARKETPLACE_DESTINATION;

  if (isPathAtOrBelow(path, "/pme-exchange")) {
    return FACTORY_DESTINATION;
  }

  if (isPathAtOrBelow(path, "/ready-for-export")) {
    return EXPORT_PRODUCTS_DESTINATION;
  }

  if (isPathAtOrBelow(path, "/zone")) return MARKETPLACE_DESTINATION;

  if (
    path === "/store" ||
    isPathAtOrBelow(path, "/collections") ||
    path === "/cart" ||
    path === "/checkout" ||
    path === "/marketplace-old" ||
    isPathAtOrBelow(path, "/retail") ||
    path === "/shop" ||
    isPathAtOrBelow(path, "/wholesale") ||
    isPathAtOrBelow(path, "/product")
  ) {
    return MARKETPLACE_DESTINATION;
  }

  return null;
}
