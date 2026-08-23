import raw from "./adminNavRegistry.json";

export type AdminNavIconKey =
  | "Calendar"
  | "LayoutDashboard"
  | "BarChart3"
  | "Building2"
  | "MapPin"
  | "Brain"
  | "Users"
  | "Network"
  | "ClipboardList"
  | "Zap"
  | "Wallet"
  | "Coins"
  | "BookOpen"
  | "Store"
  | "ShoppingBag"
  | "FileSignature"
  | "ShieldCheck"
  | "Truck"
  | "ImageDown"
  | "Image"
  | "Megaphone"
  | "DollarSign"
  | "Search"
  | "RefreshCw"
  | "User"
  | "Target"
  | "MessageSquare"
  | "Mail"
  | "Cloud";

export type AdminNavRegistryItem = {
  route: string;
  pageTitle: string;
  module: string;
  capabilityTag: string;
  apiEndpointsCalled: string[];
  navEntryName: string | null;
  icon: AdminNavIconKey;
  visibleInNav: boolean;
  redirectTo?: string;
};

export type AdminNavRegistry = {
  version: number;
  generatedAt: string;
  items: AdminNavRegistryItem[];
};

export const ADMIN_NAV_REGISTRY = raw as unknown as AdminNavRegistry;

// UX & GOVERNANCE LAW: Admin navigation must be agent-centric and legible.
// Admin navigation categories are intentionally few and task-oriented.
type AdminNavCategory =
  | "Agents OS"
  | "Operations"
  | "Trade"
  | "Territories"
  | "Finance"
  | "Settings";

const MODULE_ALIASES: Record<string, AdminNavCategory> = {
  Overview: "Operations",
  Territories: "Territories",
  Marketplace: "Trade",
  "Stamped Gold": "Trade",
  "Equipment Ops": "Trade",
  Website: "Trade",
  Media: "Trade",
  "Go-To-Market": "Trade",
  Communications: "Operations",
  Finance: "Finance",
  "Wallet OS": "Finance",
  Admin: "Settings",
  Operations: "Operations",
};

const AGENTS_OS_ROUTE = "/agents-os";
const RETIRED_ADMIN_NAV_ROUTES = new Set<string>([
  "/agents",
  "/hierarchy",
  "/admin/agents",
  "/admin/agents/governance",
  "/admin/action-forge",
  "/admin/website/visits",
  "/admin/website/seo",
  "/admin/website/seo-autopilot",
  "/admin/ux-audit",
]);

const AGENTS_OS_NAV_ITEM: AdminNavRegistryItem = {
  route: AGENTS_OS_ROUTE,
  pageTitle: "Agents OS",
  module: "Agents OS",
  capabilityTag: "admin_agents_os",
  apiEndpointsCalled: [
    "/api/admin/agents-os/summary",
    "/api/admin/agents",
    "/api/admin/marketplace/agents",
    "/api/admin/agents/:id/marketplace",
    "/api/admin/agents/:id/clone",
    "/api/admin/agents/:id/version",
  ],
  navEntryName: "Agents OS",
  icon: "Brain",
  visibleInNav: true,
};

const OPERATIONS_INTERNAL_AGENTS_NAV_ITEM: AdminNavRegistryItem = {
  route: "/operations/agents",
  pageTitle: "Internal Agents",
  module: "Agents OS",
  capabilityTag: "agent_mgmt_v2_internal",
  apiEndpointsCalled: ["/api/v2/agents?domain=INTERNAL", "/api/v2/agents/internal/create"],
  navEntryName: "Internal Agents",
  icon: "Users",
  visibleInNav: true,
};

const COMMERCE_MARKETPLACE_AGENTS_NAV_ITEM: AdminNavRegistryItem = {
  route: "/commerce/ai-marketplace/agents",
  pageTitle: "AI Marketplace Agents",
  module: "Agents OS",
  capabilityTag: "agent_mgmt_v2_marketplace",
  apiEndpointsCalled: ["/api/v2/agents?domain=MARKETPLACE"],
  navEntryName: "AI Marketplace Agents",
  icon: "Store",
  visibleInNav: true,
};

const PME_EXCHANGE_NAV_ITEMS: AdminNavRegistryItem[] = [
  {
    route: "/admin/pme-exchange",
    pageTitle: "PME Exchange",
    module: "PME Exchange",
    capabilityTag: "admin_pme_exchange",
    apiEndpointsCalled: ["/api/admin/pme-exchange/status", "/api/admin/pme-exchange/summary", "/api/admin/pme-exchange/leads"],
    navEntryName: "PME Exchange",
    icon: "Store",
    visibleInNav: true,
  },
  {
    route: "/admin/pme-exchange/map",
    pageTitle: "PME Map",
    module: "PME Exchange",
    capabilityTag: "admin_pme_exchange_map",
    apiEndpointsCalled: ["/api/admin/pme-exchange/map"],
    navEntryName: "PME Map",
    icon: "MapPin",
    visibleInNav: true,
  },
  {
    route: "/admin/pme-exchange/import",
    pageTitle: "Google Import",
    module: "PME Exchange",
    capabilityTag: "admin_pme_exchange_import",
    apiEndpointsCalled: ["/api/admin/pme-exchange/import/preview", "/api/admin/pme-exchange/google/test-search"],
    navEntryName: "Google Import",
    icon: "Search",
    visibleInNav: true,
  },
  {
    route: "/admin/pme-exchange/campaigns",
    pageTitle: "Outreach Campaigns",
    module: "PME Exchange",
    capabilityTag: "admin_pme_exchange_campaigns",
    apiEndpointsCalled: ["/api/admin/pme-exchange/campaigns", "/api/admin/pme-exchange/campaigns/test"],
    navEntryName: "Outreach Campaigns",
    icon: "MessageSquare",
    visibleInNav: true,
  },
];

const GOOGLE_MAPS_NAV_ITEM: AdminNavRegistryItem = {
  route: "/admin/settings/integrations/google-maps",
  pageTitle: "Google Maps / Places",
  module: "Settings",
  capabilityTag: "admin_google_maps_places",
  apiEndpointsCalled: ["/api/maps/public-config", "/api/admin/pme-exchange/google/settings", "/api/admin/pme-exchange/google/test-search"],
  navEntryName: "Google Maps / Places",
  icon: "MapPin",
  visibleInNav: true,
};

const GOOGLE_WORKSPACE_NAV_ITEM: AdminNavRegistryItem = {
  route: "/admin/settings/integrations/google-workspace",
  pageTitle: "Google Workspace Evidence",
  module: "Company Brain",
  capabilityTag: "admin_google_workspace_evidence",
  apiEndpointsCalled: [
    "/api/admin/company-brain/workspace/status",
    "/api/admin/company-brain/workspace/connect/:service",
    "/api/admin/company-brain/workspace/connectors/:service/sync",
  ],
  navEntryName: "Google Workspace Evidence",
  icon: "Cloud",
  visibleInNav: true,
};

const COMPANY_BRAIN_NAV_ITEM: AdminNavRegistryItem = {
  route: "/admin/company-brain",
  pageTitle: "Company Brain",
  module: "Operations",
  capabilityTag: "admin_company_brain_governance",
  apiEndpointsCalled: [
    "/api/admin/company-brain/summary",
    "/api/admin/company-brain/sources",
    "/api/admin/company-brain/claims",
  ],
  navEntryName: "Company Brain",
  icon: "Brain",
  visibleInNav: true,
};

const INDUSTRIAL_NETWORK_NAV_ITEM: AdminNavRegistryItem = {
  route: "/admin/industrial-network",
  pageTitle: "Industrial Network",
  module: "Trade",
  capabilityTag: "admin_industrial_network",
  apiEndpointsCalled: [
    "/api/industrial/admin/factory-leads/benin-official-preview",
    "/api/industrial/admin/factory-leads/benin-official-import",
    "/api/industrial/admin/factory-leads",
  ],
  navEntryName: "Industrial Network",
  icon: "Building2",
  visibleInNav: true,
};

const CARRIER_NETWORK_NAV_ITEM: AdminNavRegistryItem = {
  route: "/admin/carrier-network",
  pageTitle: "Carrier Network & Delivery Authority",
  module: "Trade",
  capabilityTag: "admin_carrier_network_governance",
  apiEndpointsCalled: [
    "/api/admin/carrier-network",
    "/api/admin/carrier-network/profiles",
    "/api/admin/carrier-network/profiles/:carrierProfileId/verify",
    "/api/admin/carrier-network/coverages",
    "/api/admin/carrier-network/connections/record-verification",
    "/api/admin/carrier-network/quote-requests/prepare",
    "/api/admin/carrier-network/quotes/record",
    "/api/admin/carrier-network/quotes/:deliveryQuoteId/select",
    "/api/admin/carrier-network/bookings/:bookingAuthorizationId/approve",
    "/api/admin/carrier-network/incidents",
  ],
  navEntryName: "Carrier Network",
  icon: "Truck",
  visibleInNav: true,
};

const GROUP_BUYING_NAV_ITEM: AdminNavRegistryItem = {
  route: "/admin/group-buying",
  pageTitle: "Producer Exchange Group Commerce",
  module: "Trade",
  capabilityTag: "admin_group_buying_governance",
  apiEndpointsCalled: [
    "/api/group-buying/admin",
    "/api/group-buying/admin/campaigns/prepare",
    "/api/group-buying/admin/campaigns/:campaignId/authorize",
    "/api/group-buying/admin/commitments/:commitmentId/bind-paid-order",
    "/api/group-buying/admin/campaigns/:campaignId/updates/publish",
    "/api/group-buying/admin/production-batches/prepare",
    "/api/group-buying/admin/production-batches/:productionBatchId/transition",
    "/api/group-buying/admin/settlements/prepare",
    "/api/group-buying/admin/settlements/:settlementPlanId/approve",
  ],
  navEntryName: "Producer Exchange",
  icon: "ShoppingBag",
  visibleInNav: true,
};

const TRADE_INTELLIGENCE_NAV_ITEM: AdminNavRegistryItem = {
  route: "/admin/trade-intelligence",
  pageTitle: "Trade Intelligence",
  module: "Trade",
  capabilityTag: "admin_trade_intelligence",
  apiEndpointsCalled: [
    "/api/trade/admin/dashboard",
    "/api/trade/admin/sources",
    "/api/trade/admin/missions",
  ],
  navEntryName: "Trade Intelligence",
  icon: "BarChart3",
  visibleInNav: true,
};

const ADVERTISING_GOVERNANCE_NAV_ITEM: AdminNavRegistryItem = {
  route: "/admin/advertising-governance",
  pageTitle: "Advertising Governance",
  module: "Trade",
  capabilityTag: "admin_advertising_governance",
  apiEndpointsCalled: [
    "/api/admin/marketing/ads/governance",
    "/api/admin/marketing/ads/accounts/record-verification",
    "/api/admin/marketing/ads/budget-envelopes",
    "/api/admin/marketing/ads/media-plans/prepare",
    "/api/admin/marketing/ads/spend-authorizations/prepare",
  ],
  navEntryName: "Advertising Governance",
  icon: "Target",
  visibleInNav: true,
};

const MEDIA_STUDIO_NAV_ITEM: AdminNavRegistryItem = {
  route: "/admin/media/studio",
  pageTitle: "Interview & Media Studio",
  module: "Trade",
  capabilityTag: "admin_media_interview_studio",
  apiEndpointsCalled: [
    "/api/admin/marketing/studio/workspace",
    "/api/admin/marketing/studio/interviews",
    "/api/admin/marketing/studio/projects",
    "/api/admin/marketing/studio/renders/prepare",
  ],
  navEntryName: "Interview & Media Studio",
  icon: "Image",
  visibleInNav: true,
};

const ROUTE_CATEGORY_OVERRIDES: Record<string, AdminNavCategory> = {
  // Agents OS is the canonical home for all agent functions.
  "/agents": "Agents OS",
  "/hierarchy": "Agents OS",
  [AGENTS_OS_ROUTE]: "Agents OS",
  "/admin/agents-os": "Agents OS",
  "/admin/agents-os/agents/:id": "Agents OS",
  "/operations/agents": "Agents OS",
  "/operations/agents/:agentId": "Agents OS",
  "/commerce/ai-marketplace/agents": "Agents OS",
  "/commerce/ai-marketplace/agents/:agentId": "Agents OS",
  "/admin/agents/governance": "Agents OS",
  "/admin/agents": "Agents OS",

  // Email setup belongs to Settings (daily email lives in Inbox + Agent pages).
  "/admin/email": "Settings",

  // Operational center & execution layer.
  "/ai-team": "Operations",
  "/agenda": "Operations",
  "/tasks": "Operations",
  "/actions": "Operations",
  "/admin/inbox": "Operations",
  "/mail": "Operations",
  "/app/email": "Operations",
  "/admin/communications/whatsapp": "Operations",
  "/admin/communications/twilio": "Operations",

  // Trade and marketplace execution.
  "/admin/marketplace/products": "Trade",
  "/admin/industrial-network": "Trade",
  "/admin/carrier-network": "Trade",
  "/admin/group-buying": "Trade",
  "/admin/trade-intelligence": "Trade",
  "/marketplace/sellers": "Trade",
  "/seller-dashboard": "Trade",
  "/bureaus": "Trade",
  "/contracts": "Trade",
  "/delivery/admin": "Trade",
  "/admin/stamped-gold/skus": "Trade",
  "/admin/stamped-gold/minting-studio": "Trade",
  "/admin/stamped-gold/items": "Trade",
  "/admin/stamped-gold/jewellers": "Trade",
  "/admin/stamped-gold/scans": "Trade",
  "/admin/stamped-gold/pickup": "Trade",
  "/admin/equipment-ops/listings": "Trade",
  "/admin/equipment-ops/fleet-map": "Trade",
  "/admin/equipment-ops/contracts": "Trade",
  "/admin/equipment-ops/maintenance": "Trade",
  "/admin/pme-exchange": "Trade",
  "/admin/pme-exchange/map": "Trade",
  "/admin/pme-exchange/import": "Trade",
  "/admin/pme-exchange/campaigns": "Trade",
  "/admin/seo": "Settings",
  "/admin/media/assets": "Trade",
  "/admin/media/studio": "Trade",
  "/admin/advertising-governance": "Trade",
  "/marketing": "Trade",
  "/client-hunter": "Trade",

  // Territory management is a first-class menu.
  "/territories": "Territories",
  "/territories/:id": "Territories",
  "/admin/territories": "Territories",
  "/admin/territories/:id": "Territories",

  // Settings & system tools
  "/admin/system/update": "Settings",
  "/admin/settings/map": "Settings",
  "/admin/map-icons": "Settings",
  "/admin/settings/onboarding": "Settings",
  "/admin/settings/integrations/google-maps": "Settings",
  "/admin/settings/integrations/google-workspace": "Settings",
};

const MODULE_ORDER: AdminNavCategory[] = ["Agents OS", "Operations", "Trade", "Territories", "Finance", "Settings"];

const CATEGORY_ITEM_ORDER: Record<AdminNavCategory, Record<string, number>> = {
  "Agents OS": {
    [AGENTS_OS_ROUTE]: 0,
    "/operations/agents": 5,
    "/commerce/ai-marketplace/agents": 10,
    "/admin/agents/governance": 20,
    "/agents": 100,
    "/hierarchy": 101,
  },
  Operations: {
    "/ai-team": 0,
    "/admin/inbox": 3,
    "/mail": 4,
    "/admin/communications/whatsapp": 5,
    "/admin/communications/twilio": 6,
    "/agenda": 5,
    "/tasks": 10,
    "/admin/workstations": 15,
    "/admin/evidence": 16,
    "/actions": 30,
    "/goals": 40,
    "/knowledge": 50,
    "/admin/company-brain": 55,
    "/expert-clones": 60,
  },
  Trade: {
    "/admin/industrial-network": 0,
    "/admin/carrier-network": 1,
    "/admin/group-buying": 2,
    "/admin/trade-intelligence": 3,
    "/admin/advertising-governance": 4,
    "/admin/marketplace/products": 0,
    "/marketplace/sellers": 10,
    "/seller-dashboard": 20,
    "/bureaus": 30,
    "/contracts": 40,
    "/delivery/admin": 50,
    "/admin/stamped-gold/skus": 100,
    "/admin/stamped-gold/minting-studio": 105,
    "/admin/stamped-gold/items": 110,
    "/admin/stamped-gold/jewellers": 120,
    "/admin/stamped-gold/scans": 130,
    "/admin/stamped-gold/pickup": 140,
    "/admin/equipment-ops/listings": 200,
    "/admin/equipment-ops/fleet-map": 210,
    "/admin/equipment-ops/contracts": 220,
    "/admin/equipment-ops/maintenance": 230,
    "/admin/pme-exchange": 240,
    "/admin/pme-exchange/map": 241,
    "/admin/pme-exchange/import": 242,
    "/admin/pme-exchange/campaigns": 243,
    "/admin/media/assets": 30,
    "/admin/media/studio": 31,
    "/marketing": 40,
    "/client-hunter": 50,
  },
  Territories: {
    "/territories": 0,
    "/territories/:id": 1,
    "/admin/territories": 2,
    "/admin/territories/:id": 3,
  },
  Finance: {
    "/finance": 0,
    "/admin/wallet/accounts": 10,
  },
  Settings: {
    "/admin/system/update": 0,
    "/admin/seo": 1,
    "/admin/contacts": 5,
    "/admin/agents/governance": 6,
    "/admin/map-icons": 8,
    "/admin/email": 10,
    "/admin/settings/communications/twilio": 20,
    "/admin/settings/integrations/google-maps": 25,
    "/admin/settings/integrations/google-workspace": 26,
  },
};

export function getAdminNavItems() {
  const visible = ADMIN_NAV_REGISTRY.items.filter((item) => item.visibleInNav && !RETIRED_ADMIN_NAV_ROUTES.has(item.route));
  const hasAgentsOs = visible.some((item) => item.route === AGENTS_OS_ROUTE);
  const hasInternalAgents = visible.some((item) => item.route === OPERATIONS_INTERNAL_AGENTS_NAV_ITEM.route);
  const hasMarketplaceAgents = visible.some((item) => item.route === COMMERCE_MARKETPLACE_AGENTS_NAV_ITEM.route);

  const next = [...visible];
  if (!hasAgentsOs) next.push(AGENTS_OS_NAV_ITEM);
  if (!hasInternalAgents) next.push(OPERATIONS_INTERNAL_AGENTS_NAV_ITEM);
  if (!hasMarketplaceAgents) next.push(COMMERCE_MARKETPLACE_AGENTS_NAV_ITEM);
  if (!next.some((entry) => entry.route === INDUSTRIAL_NETWORK_NAV_ITEM.route)) {
    next.push(INDUSTRIAL_NETWORK_NAV_ITEM);
  }
  if (!next.some((entry) => entry.route === CARRIER_NETWORK_NAV_ITEM.route)) {
    next.push(CARRIER_NETWORK_NAV_ITEM);
  }
  if (!next.some((entry) => entry.route === GROUP_BUYING_NAV_ITEM.route)) {
    next.push(GROUP_BUYING_NAV_ITEM);
  }
  if (!next.some((entry) => entry.route === TRADE_INTELLIGENCE_NAV_ITEM.route)) {
    next.push(TRADE_INTELLIGENCE_NAV_ITEM);
  }
  if (!next.some((entry) => entry.route === ADVERTISING_GOVERNANCE_NAV_ITEM.route)) {
    next.push(ADVERTISING_GOVERNANCE_NAV_ITEM);
  }
  if (!next.some((entry) => entry.route === MEDIA_STUDIO_NAV_ITEM.route)) {
    next.push(MEDIA_STUDIO_NAV_ITEM);
  }
  for (const item of PME_EXCHANGE_NAV_ITEMS) {
    if (!next.some((entry) => entry.route === item.route)) next.push(item);
  }
  if (!next.some((entry) => entry.route === GOOGLE_MAPS_NAV_ITEM.route)) next.push(GOOGLE_MAPS_NAV_ITEM);
  if (!next.some((entry) => entry.route === GOOGLE_WORKSPACE_NAV_ITEM.route)) next.push(GOOGLE_WORKSPACE_NAV_ITEM);
  if (!next.some((entry) => entry.route === COMPANY_BRAIN_NAV_ITEM.route)) next.push(COMPANY_BRAIN_NAV_ITEM);
  return next;
}

export function getAdminNavModules() {
  const items = getAdminNavItems();
  const byModule = new Map<string, AdminNavRegistryItem[]>();
  for (const item of items) {
    const override = ROUTE_CATEGORY_OVERRIDES[item.route];
    const rawModule = item.module || "Other";
    const module = (override ?? MODULE_ALIASES[rawModule] ?? (rawModule as any)) as string;
    if (!byModule.has(module)) byModule.set(module, []);
    byModule.get(module)!.push(item);
  }

  const rank = (module: string) => {
    const index = MODULE_ORDER.indexOf(module as any);
    return index === -1 ? Number.POSITIVE_INFINITY : index;
  };

  return Array.from(byModule.entries())
    .map(([module, items]) => ({
    module,
    items: items.slice().sort((a, b) => {
      const category = module as AdminNavCategory;
      const orderMap = (CATEGORY_ITEM_ORDER[category] ?? {}) as Record<string, number>;
      const oa = orderMap[a.route] ?? Number.POSITIVE_INFINITY;
      const ob = orderMap[b.route] ?? Number.POSITIVE_INFINITY;
      if (oa !== ob) return oa - ob;

      return String(a.navEntryName || a.pageTitle).localeCompare(String(b.navEntryName || b.pageTitle));
    }),
    }))
    .sort((a, b) => {
      const ra = rank(a.module);
      const rb = rank(b.module);
      if (ra !== rb) return ra - rb;
      return a.module.localeCompare(b.module);
    });
}
