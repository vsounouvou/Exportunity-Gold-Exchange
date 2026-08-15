import { db } from "@db";
import { seoPatches, tenantSites } from "@db/schema";

export type SeoHead = {
  title: string;
  description: string;
  canonicalUrl: string;
  robots: string;
  openGraph: Record<string, string>;
  twitter: Record<string, string>;
  jsonLd: Record<string, unknown> | null;
};

const siteCache = new Map<string, { canonicalHost: string; defaultLocale: string | null; defaultCountry: string | null }>();
const patchesCache = new Map<string, { ts: number; patches: Array<{ targetPath: string; featureFlag: string; patch: any }> }>();
const PATCH_CACHE_TTL_MS = 30_000;

function normalizeHost(host: unknown): string {
  if (typeof host !== "string") return "";
  return host.split(",")[0]?.split(":")[0]?.trim().toLowerCase() || "";
}

function defaultCanonicalHost(domain: string) {
  const d = domain.trim().toLowerCase();
  if (d.startsWith("www.")) return d.slice("www.".length);
  return d;
}

function isExportunityMarketingHost(host: unknown, search: unknown) {
  const normalized = normalizeHost(host);
  if (normalized === "exportunity.com" || normalized === "www.exportunity.com") return true;
  if (normalized === "localhost" || normalized === "127.0.0.1") {
    const query = String(search ?? "");
    if (!query) return false;
    try {
      const params = new URLSearchParams(query.startsWith("?") ? query.slice(1) : query);
      return params.get("marketing") === "1";
    } catch {
      return false;
    }
  }
  return false;
}

function isExportunityPlatformHost(host: unknown) {
  const normalized = normalizeHost(host);
  return normalized === "exportunity.net" || normalized === "www.exportunity.net";
}

function isMindbaseHost(host: unknown) {
  const normalized = normalizeHost(host);
  return (
    normalized === "mindbase.cloud" ||
    normalized === "www.mindbase.cloud" ||
    normalized.endsWith(".mindbase.cloud")
  );
}

function isVsHost(host: unknown) {
  const normalized = normalizeHost(host);
  return (
    normalized === "vitalsounouvou.com" ||
    normalized === "www.vitalsounouvou.com" ||
    normalized.endsWith(".vitalsounouvou.com")
  );
}

function isHozHost(host: unknown) {
  const normalized = normalizeHost(host);
  return (
    normalized === "houseofzogue.com" ||
    normalized === "www.houseofzogue.com" ||
    normalized.endsWith(".houseofzogue.com")
  );
}

function isBdoHost(host: unknown) {
  const normalized = normalizeHost(host);
  return (
    normalized === "boursedelor.com" ||
    normalized === "www.boursedelor.com" ||
    normalized.endsWith(".boursedelor.com")
  );
}

export function canonicalizePath(pathname: string, ctx?: { host?: string; search?: string }) {
  const nextPath = pathname || "/";
  const marketingHost = isExportunityMarketingHost(ctx?.host, ctx?.search);
  const exportunityPlatformHost = isExportunityPlatformHost(ctx?.host);
  const mindbaseHost = isMindbaseHost(ctx?.host);
  const vsHost = isVsHost(ctx?.host);
  const hozHost = isHozHost(ctx?.host);
  const bdoHost = isBdoHost(ctx?.host);

  if (mindbaseHost) {
    if (nextPath === "/" || nextPath === "/mindbase") return "/";
    if (nextPath === "/discover" || nextPath === "/mindbase/discover") return "/explore";
    if (nextPath === "/mindbase/pricing") return "/pricing";
    if (nextPath === "/mindbase/docs/api") return "/docs/api";
    if (nextPath === "/mindbase/docs") return "/docs";
    if (nextPath === "/mindbase/studio") return "/build/advanced";
    if (nextPath === "/mindbase/build") return "/build/chat";
    if (nextPath === "/mindbase/build/chat") return "/build/chat";
    if (nextPath === "/mindbase/build/advanced") return "/build/advanced";
    if (nextPath === "/mindbase/workspaces") return "/workspaces";
    if (nextPath === "/studio") return "/build/advanced";
    if (nextPath === "/build") return "/build/chat";
    if (nextPath.startsWith("/mindbase/i/")) return `/i/${nextPath.slice("/mindbase/i/".length)}`;
    if (nextPath.startsWith("/mindbase/c/")) return `/c/${nextPath.slice("/mindbase/c/".length)}`;
  }

  if (vsHost) {
    if (nextPath === "/") return "/";
    if (
      nextPath === "/about" ||
      nextPath === "/press" ||
      nextPath === "/portfolio" ||
      nextPath === "/contact" ||
      nextPath === "/insights" ||
      nextPath.startsWith("/admin/vs")
    ) {
      return nextPath;
    }
  }

  if (hozHost) {
    if (
      nextPath === "/" ||
      nextPath === "/books" ||
      nextPath === "/jewelry" ||
      nextPath === "/media" ||
      nextPath === "/about" ||
      nextPath === "/contact" ||
      nextPath.startsWith("/admin/hoz")
    ) {
      return nextPath;
    }
  }

  if (bdoHost) {
    return nextPath;
  }

  if (nextPath === "/") return marketingHost || exportunityPlatformHost ? "/" : "/zone";
  if (nextPath === "/retail") return "/zone";
  if (nextPath.startsWith("/retail/")) return `/zone${nextPath.slice("/retail".length)}`;
  if (nextPath === "/about") return marketingHost ? "/our-journey" : "/about";
  if (nextPath === "/contact") return marketingHost ? "/talk" : "/zone";
  if (nextPath === "/marketplace" || nextPath === "/shop") return "/zone";
  if (nextPath === "/plans-pricing") return marketingHost ? "/pricing" : "/zone";
  if (nextPath === "/rayonhome") return marketingHost ? "/" : "/zone";
  if (nextPath === "/booking-calendar") return marketingHost ? "/talk" : "/zone";
  if (nextPath === "/people") return marketingHost ? "/our-journey" : "/about";
  if (nextPath === "/academy" || nextPath === "/clubs") return marketingHost ? "/media/library" : "/zone";
  if (nextPath === "/initiative") return marketingHost ? "/solutions" : "/zone";
  if (nextPath === "/copy-of-home") return marketingHost ? "/solutions" : "/zone";
  if (nextPath === "/copy-of-fintech") return marketingHost ? "/solutions" : "/zone";
  if (nextPath === "/contact-8") return marketingHost ? "/talk" : "/zone";
  if (nextPath === "/privacypolicy") return marketingHost ? "/privacy" : "/zone";
  if (nextPath === "/termsofservice") return marketingHost ? "/terms" : "/zone";
  if (nextPath === "/library") return marketingHost ? "/media/library" : "/zone";
  if (nextPath === "/rayon-seller") return marketingHost ? "/invest" : "/zone";
  if (nextPath.startsWith("/library/categories/") || nextPath.startsWith("/library/tags/")) {
    return marketingHost ? "/media/library" : "/zone";
  }
  if (nextPath.startsWith("/group/") || nextPath.startsWith("/profile/") || nextPath.startsWith("/challenge-page/")) {
    return marketingHost ? "/media/library" : "/zone";
  }

  const marketingOnlyRoutes = new Set([
    "/our-journey",
    "/solutions",
    "/platform",
    "/platform/gold",
    "/platform/agents",
    "/platform/marketplace",
    "/media",
    "/media/press",
    "/media/library",
    "/talk",
    "/privacy",
    "/terms",
    "/invest",
    "/pricing",
  ]);
  if (!marketingHost && marketingOnlyRoutes.has(nextPath)) return "/zone";

  return nextPath;
}

function tenantFullTitle(tenantKey: string) {
  if (tenantKey === "mindbase") return "MindBase";
  if (tenantKey === "vs") return "Vital Sounouvou";
  if (tenantKey === "hoz") return "House of Zogue";
  return tenantKey === "exportunity" ? "Exportunity" : "BOURSE DE L'OR";
}

function tenantDescription(tenantKey: string) {
  if (tenantKey === "mindbase") {
    return "MindBase helps creators and operators package expertise into deployable AI intellects.";
  }
  if (tenantKey === "vs") {
    return "Vital Sounouvou: reputation intelligence, PR outreach, and governed social studio.";
  }
  if (tenantKey === "hoz") {
    return "House of Zogue: books, jewelry, and cultural media with editorial command workflows.";
  }
  if (tenantKey === "bdo") {
    return "BOURSE DE L'OR - certified physical gold, verified jewelry, certificate verification, secure delivery, and resale requests.";
  }
  if (tenantKey === "exportunity") {
    return "Exportunity connects industrial demand to technical intake, verified sourcing, local manufacturing, quality control, logistics, and export readiness across Africa.";
  }
  return "BOURSE DE L'OR - certified physical gold, verified jewelry, certificate verification, secure delivery, and resale requests.";
}

async function resolveCanonicalHost(input: { tenantId: number; env: string; host: string }) {
  const host = normalizeHost(input.host);
  if (!host) return defaultCanonicalHost(String(input.host || ""));
  if (!Number.isFinite(input.tenantId) || input.tenantId <= 0) return defaultCanonicalHost(host);
  const key = `${input.tenantId}:${input.env}:${host}`;
  const cached = siteCache.get(key);
  if (cached) return cached.canonicalHost;

  const row = await db.query.tenantSites.findFirst({
    where: (t, { and, eq }) => and(eq(t.tenantId, input.tenantId), eq(t.env, input.env), eq(t.domain, host)),
    columns: { canonicalHost: true, defaultLocale: true, defaultCountry: true },
  });

  const canonicalHost = String(row?.canonicalHost || defaultCanonicalHost(host));
  siteCache.set(key, {
    canonicalHost,
    defaultLocale: row?.defaultLocale ? String(row.defaultLocale) : null,
    defaultCountry: row?.defaultCountry ? String(row.defaultCountry) : null,
  });
  return canonicalHost;
}

export async function resolveSeoHead(input: {
  tenant: { id: number; key: string; name: string; featureFlags?: Record<string, boolean> | null } | null;
  env: string;
  host: string;
  pathname: string;
  search: string;
}) {
  const inferredTenantKey = isMindbaseHost(input.host)
    ? "mindbase"
    : isVsHost(input.host)
      ? "vs"
      : isHozHost(input.host)
        ? "hoz"
        : "bdo";
  const tenantKey = String(input.tenant?.key || inferredTenantKey);
  const baseTitle = tenantFullTitle(tenantKey);
  const defaultDesc = tenantDescription(tenantKey);
  const pathname = input.pathname || "/";
  const canonicalPath = canonicalizePath(pathname, { host: input.host, search: input.search });
  const isAlias = pathname !== canonicalPath;

  const canonicalHost = await resolveCanonicalHost({
    tenantId: input.tenant?.id ?? 0,
    env: input.env,
    host: input.host,
  });

  let canonicalUrl = `https://${canonicalHost}${canonicalPath}`;
  if (tenantKey === "exportunity" && canonicalPath.startsWith("/zone")) {
    canonicalUrl = `https://exportunity.net${canonicalPath}`;
  }

  const isAdmin =
    canonicalPath.startsWith("/admin") ||
    canonicalPath.startsWith("/dashboard") ||
    canonicalPath.startsWith("/ai-team") ||
    canonicalPath.startsWith("/tasks") ||
    canonicalPath.startsWith("/goals") ||
    canonicalPath.startsWith("/hierarchy") ||
    canonicalPath.startsWith("/machinery") ||
    canonicalPath.startsWith("/manufacturing");

  const hasQuery = Boolean(input.search && input.search !== "?");
  const robots = isAdmin ? "noindex, nofollow" : isAlias || hasQuery ? "noindex, follow" : "index, follow";
  const isMarketing = isExportunityMarketingHost(input.host, input.search);
  const isMindbase = tenantKey === "mindbase" || isMindbaseHost(input.host);
  const isHoz = tenantKey === "hoz" || isHozHost(input.host);
  const isBdo = tenantKey === "bdo" || isBdoHost(input.host);

  const routeTitleMap: Record<string, string> = {
    "/zone": "Zone",
    "/gateway": "Gateway",
    "/about": "About",
    "/how-it-works": "How it works",
    "/sellers": "Sellers",
    "/terms": "Terms of use",
    "/privacy": "Privacy",
    "/cadre-conformite": "Cadre & compliance",
  };

  const hozTitleMap: Record<string, string> = {
    "/": "House of Zogue",
    "/books": "Books - House of Zogue",
    "/jewelry": "Jewelry - House of Zogue",
    "/media": "Media - House of Zogue",
    "/about": "About - House of Zogue",
    "/contact": "Contact - House of Zogue",
  };

  const mindbaseTitleMap: Record<string, string> = {
    "/": "MindBase — Own your intelligence. Deploy your Mind.",
    "/explore": "Explore Agents — MindBase",
    "/pricing": "Pricing - MindBase",
    "/docs/api": "API Docs - MindBase",
    "/docs": "Docs - MindBase",
    "/build/chat": "Build - MindBase",
    "/build/advanced": "Advanced Build - MindBase",
    "/workspaces": "Workspaces - MindBase",
  };


  const marketingTitleMap: Record<string, string> = {
    "/": "Exportunity",
    "/our-journey": "Our Journey",
    "/solutions": "Solutions",
    "/platform": "Exportunity OS",
    "/platform/gold": "Gold & Commodities",
    "/platform/agents": "AI Agents",
    "/platform/marketplace": "Marketplace",
    "/media": "Media Hub",
    "/media/press": "Media Press",
    "/media/library": "Media Library",
    "/talk": "Talk to us",
    "/privacy": "Privacy Policy",
    "/terms": "Terms of Service",
    "/invest": "Invest",
    "/pricing": "Plans",
  };

  const routeDescriptionMap: Record<string, string> = {
    "/zone": "Explore Zone and discover curated listings by territory.",
    "/gateway": "Choose your role to access the right tools for trade, operations, or compliance.",
    "/about": "Learn about the platform, its mission, and how it supports multi-tenant operations.",
    "/how-it-works": "See how the platform works end-to-end, from discovery to secure workflows.",
    "/sellers": "Browse the seller directory and discover trusted profiles across territories.",
    "/terms": "Read the platform terms of use and user responsibilities.",
    "/privacy": "Read how the platform handles data and privacy safeguards.",
    "/cadre-conformite": "Compliance framework and safe-use guidance for regulated contexts.",
  };

  const hozDescriptionMap: Record<string, string> = {
    "/": "House of Zogue curates books, jewelry, and cultural media rooted in modern African luxury.",
    "/books": "Editorial catalog and cultural publishing from House of Zogue.",
    "/jewelry": "Curated jewelry collections and atelier narratives from House of Zogue.",
    "/media": "Media stories, press references, and publication assets from House of Zogue.",
    "/about": "Brand doctrine, founder vision, and mission of House of Zogue.",
    "/contact": "Contact House of Zogue for editorial, partnership, and client requests.",
  };

  const mindbaseDescriptionMap: Record<string, string> = {
    "/": "Own your intelligence. Deploy your Mind.",
    "/explore": "Discover published AI agents and hire expertise on MindBase.",
    "/pricing": "Simple pricing for creators, teams, and clients on MindBase.",
    "/docs/api": "MindBase API reference for authentication, agents, and integrations.",
    "/docs": "MindBase product and API documentation.",
    "/build/chat": "Chat-first onboarding to create your MindBase and baseline agents.",
    "/build/advanced": "Advanced MindBase setup for detailed profile and agent controls.",
    "/workspaces": "Collaborate with your team in shared MindBase workspaces.",
  };


  const marketingDescriptionMap: Record<string, string> = {
    "/": "Exportunity is an operations-first trade platform for cross-border execution with compliance and AI-managed workflows.",
    "/our-journey": "Exportunity timeline, mission, and field milestones across trade execution.",
    "/solutions": "Trade execution, compliance, and AI-managed operations for cross-border workflows.",
    "/platform": "Exportunity OS: multi-tenant operations with AI agents, communications, and compliance controls.",
    "/platform/gold": "Traceable gold and commodity execution workflows from sourcing to export.",
    "/platform/agents": "AI agents with action execution, approvals, and auditable results.",
    "/platform/marketplace": "B2B supplier discovery and marketplace execution workflows.",
    "/media": "Press, library, and article coverage about Exportunity and its platform.",
    "/media/press": "Press and public media coverage related to Exportunity.",
    "/media/library": "Interviews, resources, and media library entries managed in Exportunity CMS.",
    "/talk": "Contact Exportunity for platform demos, partnerships, and trade execution support.",
    "/privacy": "Privacy policy for Exportunity marketing properties.",
    "/terms": "Terms of service for Exportunity marketing properties.",
    "/invest": "Invest landing page with login and plans paths.",
    "/pricing": "Plans and membership overview.",
  };

  const bdoTitleMap: Record<string, string> = {
    "/": "BOURSE DE L'OR - Or physique certifié et bijoux vérifiés",
    "/store": "Produits en or physique - BOURSE DE L'OR",
    "/certification": "Certification et traçabilité - BOURSE DE L'OR",
    "/verifier": "Vérifier une pièce - BOURSE DE L'OR",
    "/wholesale": "Marché de gros vérifié - BOURSE DE L'OR",
    "/cadre-conformite": "Cadre de conformité - BOURSE DE L'OR",
    "/terms": "Conditions - BOURSE DE L'OR",
    "/privacy": "Confidentialité - BOURSE DE L'OR",
  };

  const bdoDescriptionMap: Record<string, string> = {
    "/":
      "La Bourse de l'Or est une plateforme structurée pour acheter, documenter et vérifier des produits en or physique certifié, bijoux vérifiés, pièces de collection et produits fournis par des partenaires approuvés.",
    "/store":
      "Catalogue de produits en or physique, lingots liés à des raffineries, pièces documentées, bijoux vérifiés et créations sur commande, sous réserve de disponibilité, conformité, paiement et confirmation finale.",
    "/certification":
      "Processus de certification, documentation, traçabilité, vérification de poids, titre, photos, origine déclarée et contrôle numérique des pièces en or.",
    "/verifier":
      "Consultez les informations associées à un certificat ou à une pièce en or lorsque les données de vérification sont disponibles.",
    "/wholesale":
      "Espace de gros contrôlé pour demandes professionnelles, sourcing responsable, partenaires approuvés, revue KYC/KYB et confirmation humaine.",
    "/cadre-conformite":
      "Cadre de conformité BOURSE DE L'OR pour KYC/KYB, source des fonds, source des biens, traçabilité, paiement, livraison et stockage.",
    "/terms":
      "Conditions applicables aux commandes, prix indicatifs, conformité, paiement, propriété, livraison, stockage, annulation et rôle des partenaires approuvés.",
    "/privacy":
      "Informations sur l'utilisation confidentielle des données client, documents d'identité, informations de paiement et communications liées aux commandes.",
  };

const pageLabel =
  (isMarketing ? marketingTitleMap[canonicalPath] : undefined) ??
  (isHoz ? hozTitleMap[canonicalPath] : undefined) ??
  routeTitleMap[canonicalPath] ??
  null;
  let title = pageLabel ? `${pageLabel} | ${baseTitle}` : baseTitle;
  let description =
    (isMarketing ? marketingDescriptionMap[canonicalPath] : undefined) ??
    (isHoz ? hozDescriptionMap[canonicalPath] : undefined) ??
    routeDescriptionMap[canonicalPath] ??
    defaultDesc;
  if (isMindbase) {
    const mappedTitle = mindbaseTitleMap[canonicalPath];
    const mappedDescription = mindbaseDescriptionMap[canonicalPath];
    if (mappedTitle) title = mappedTitle;
    if (mappedDescription) description = mappedDescription;

    if (canonicalPath.startsWith("/i/")) {
      const slug = decodeURIComponent(canonicalPath.slice("/i/".length))
        .replace(/[-_]+/g, " ")
        .trim();
      const prettyName = slug
        ? slug
            .split(" ")
            .filter(Boolean)
            .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
            .join(" ")
        : "Agent";
      title = `${prettyName} — Hire on MindBase`;
      description = `Hire ${prettyName} on MindBase and deploy expertise on-demand.`;
    }
  }
  if (tenantKey === "exportunity" && canonicalPath === "/zone") {
    title = "Zone — Exportunity";
    description = "Zone is Exportunity's proximity retail marketplace with fast local delivery and shared wallet checkout.";
  }
  if (isBdo) {
    title = bdoTitleMap[canonicalPath] ?? title;
    description = bdoDescriptionMap[canonicalPath] ?? description;
  }
  if (tenantKey !== "exportunity") {
    if (canonicalPath === "/zone") {
      description = "Explore the platform experience and discover territory hubs, compliance guidance, and wallet tools.";
    }
    if (canonicalPath === "/sellers") {
      description = "Browse trusted profiles and discover verified operators by territory.";
    }
  }

  const openGraph: Record<string, string> = {
    "og:title": title,
    "og:description": description,
    "og:type": "website",
    "og:url": canonicalUrl,
    "og:site_name": baseTitle,
  };

  const twitter: Record<string, string> = {
    "twitter:card": "summary",
    "twitter:title": title,
    "twitter:description": description,
  };

  const jsonLd: Record<string, unknown> = canonicalPath.startsWith("/i/") && isMindbase
    ? {
        "@context": "https://schema.org",
        "@type": "Service",
        name: title.replace(" — Hire on MindBase", ""),
        description,
        provider: {
          "@type": "Organization",
          name: "MindBase",
          url: `https://${canonicalHost}/`,
        },
      }
    : {
        "@context": "https://schema.org",
        "@graph": [
          {
            "@type": "Organization",
            name: baseTitle,
            url: `https://${canonicalHost}/`,
            logo: `https://${canonicalHost}/pwa/icon-512.png`,
          },
          {
            "@type": "WebSite",
            name: baseTitle,
            url: `https://${canonicalHost}/`,
          },
        ],
      };

  const head: SeoHead = {
    title,
    description,
    canonicalUrl,
    robots,
    openGraph,
    twitter,
    jsonLd,
  };

  // Apply active, feature-flagged patches (versioned + rollbackable).
  const tenantId = input.tenant?.id ?? 0;
  const enabledFlags =
    input.tenant?.featureFlags && typeof input.tenant.featureFlags === "object"
      ? input.tenant.featureFlags
      : {};
  if (tenantId > 0) {
    const cacheKey = `${tenantId}:${input.env}`;
    const cached = patchesCache.get(cacheKey);
    const now = Date.now();
    let patches = cached?.patches ?? [];
    if (!cached || now - cached.ts > PATCH_CACHE_TTL_MS) {
      const rows = await db.query.seoPatches.findMany({
        where: (t, { and, eq, inArray }) =>
          and(eq(t.tenantId, tenantId), eq(t.env, input.env), inArray(t.status, ["applied", "auto_applied"])),
        orderBy: (t, { desc }) => [desc(t.updatedAt)],
        limit: 500,
        columns: { targetPath: true, featureFlag: true, patch: true },
      });
      patches = rows.map((r) => ({
        targetPath: String(r.targetPath || ""),
        featureFlag: String(r.featureFlag || ""),
        patch: (r.patch as any) ?? {},
      }));
      patchesCache.set(cacheKey, { ts: now, patches });
    }

    const active = patches.filter((p) => p.targetPath === canonicalPath && enabledFlags[p.featureFlag] === true);
    for (const p of active) {
      const patch = p.patch && typeof p.patch === "object" ? p.patch : {};
      if (typeof patch.title === "string" && patch.title.trim()) {
        head.title = patch.title.trim();
      }
      if (typeof patch.description === "string" && patch.description.trim()) {
        head.description = patch.description.trim();
      }
      if (typeof patch.robots === "string" && patch.robots.trim()) {
        head.robots = patch.robots.trim();
      }
    }

    head.openGraph["og:title"] = head.title;
    head.openGraph["og:description"] = head.description;
    head.openGraph["og:url"] = head.canonicalUrl;
    head.twitter["twitter:title"] = head.title;
    head.twitter["twitter:description"] = head.description;
  }

  return head;
}

function escapeHtml(input: string) {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function injectSeoHead(html: string, head: SeoHead) {
  let next = html;

  // Remove existing SEO tags that we own to avoid duplicates.
  next = next.replace(/<meta[^>]+name=[\"']description[\"'][^>]*>\s*/gi, "");
  next = next.replace(/<meta[^>]+name=[\"']robots[\"'][^>]*>\s*/gi, "");
  next = next.replace(/<link[^>]+rel=[\"']canonical[\"'][^>]*>\s*/gi, "");
  next = next.replace(/<meta[^>]+property=[\"']og:[^\"']+[\"'][^>]*>\s*/gi, "");
  next = next.replace(/<meta[^>]+name=[\"']twitter:[^\"']+[\"'][^>]*>\s*/gi, "");
  next = next.replace(/<script[^>]+type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>\s*/gi, "");

  // Title
  const titleTag = `<title>${escapeHtml(head.title)}</title>`;
  if (/<title>[\s\S]*?<\/title>/i.test(next)) {
    next = next.replace(/<title>[\s\S]*?<\/title>/i, titleTag);
  } else {
    next = next.replace(/<head([^>]*)>/i, `<head$1>\n    ${titleTag}`);
  }

  const metaTags: string[] = [];
  metaTags.push(`<meta name="description" content="${escapeHtml(head.description)}" />`);
  metaTags.push(`<link rel="canonical" href="${escapeHtml(head.canonicalUrl)}" />`);
  metaTags.push(`<meta name="robots" content="${escapeHtml(head.robots)}" />`);

  for (const [k, v] of Object.entries(head.openGraph)) {
    metaTags.push(`<meta property="${escapeHtml(k)}" content="${escapeHtml(v)}" />`);
  }
  for (const [k, v] of Object.entries(head.twitter)) {
    metaTags.push(`<meta name="${escapeHtml(k)}" content="${escapeHtml(v)}" />`);
  }

  if (head.jsonLd) {
    const json = JSON.stringify(head.jsonLd).replace(/</g, "\\u003c");
    metaTags.push(`<script type="application/ld+json">${json}</script>`);
  }

  const injection = `\n    <!-- seo-autopilot -->\n    ${metaTags.join("\n    ")}\n  `;
  next = next.replace(/<\/head>/i, `${injection}\n</head>`);
  return next;
}

