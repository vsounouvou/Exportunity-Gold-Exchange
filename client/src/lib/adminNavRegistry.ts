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
  | "Mail";

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
const LEGACY_AGENT_NAV_ROUTES = new Set<string>([
  "/agents",
  "/hierarchy",
  "/admin/agents",
  "/admin/agents/governance",
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

const ACTION_FORGE_NAV_ITEM: AdminNavRegistryItem = {
  route: "/admin/action-forge",
  pageTitle: "Action Forge",
  module: "Agents OS",
  capabilityTag: "action_forge",
  apiEndpointsCalled: ["/api/action-forge/requests", "/api/action-forge/:id/publish"],
  navEntryName: "Action Forge",
  icon: "Zap",
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
  "/admin/action-forge": "Agents OS",
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
  "/admin/website/visits": "Trade",
  "/admin/website/seo": "Trade",
  "/admin/website/seo-autopilot": "Trade",
  "/admin/media/assets": "Trade",
  "/marketing": "Trade",
  "/client-hunter": "Trade",
  "/sales": "Trade",

  // Territory management is a first-class menu.
  "/territories": "Territories",
  "/territories/:id": "Territories",
  "/admin/territories": "Territories",
  "/admin/territories/:id": "Territories",

  // Settings & system tools
  "/admin/system/update": "Settings",
  "/admin/ux-audit": "Settings",
  "/admin/settings/map": "Settings",
  "/admin/map-icons": "Settings",
  "/admin/settings/onboarding": "Settings",
  "/admin/settings/integrations/google-maps": "Settings",
};

const MODULE_ORDER: AdminNavCategory[] = ["Agents OS", "Operations", "Trade", "Territories", "Finance", "Settings"];

const CATEGORY_ITEM_ORDER: Record<AdminNavCategory, Record<string, number>> = {
  "Agents OS": {
    [AGENTS_OS_ROUTE]: 0,
    "/operations/agents": 5,
    "/commerce/ai-marketplace/agents": 10,
    "/admin/action-forge": 15,
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
    "/expert-clones": 60,
  },
  Trade: {
    "/admin/industrial-network": 0,
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
    "/admin/website/visits": 0,
    "/admin/website/seo": 10,
    "/admin/website/seo-autopilot": 20,
    "/admin/media/assets": 30,
    "/marketing": 40,
    "/client-hunter": 50,
    "/sales": 60,
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
    "/admin/contacts": 5,
    "/admin/agents/governance": 6,
    "/admin/map-icons": 8,
    "/admin/email": 10,
    "/admin/settings/communications/twilio": 20,
    "/admin/settings/integrations/google-maps": 25,
  },
};

export function getAdminNavItems() {
  const visible = ADMIN_NAV_REGISTRY.items.filter((item) => item.visibleInNav && !LEGACY_AGENT_NAV_ROUTES.has(item.route));
  const hasAgentsOs = visible.some((item) => item.route === AGENTS_OS_ROUTE);
  const hasInternalAgents = visible.some((item) => item.route === OPERATIONS_INTERNAL_AGENTS_NAV_ITEM.route);
  const hasMarketplaceAgents = visible.some((item) => item.route === COMMERCE_MARKETPLACE_AGENTS_NAV_ITEM.route);
  const hasActionForge = visible.some((item) => item.route === ACTION_FORGE_NAV_ITEM.route);

  const next = [...visible];
  if (!hasAgentsOs) next.push(AGENTS_OS_NAV_ITEM);
  if (!hasInternalAgents) next.push(OPERATIONS_INTERNAL_AGENTS_NAV_ITEM);
  if (!hasMarketplaceAgents) next.push(COMMERCE_MARKETPLACE_AGENTS_NAV_ITEM);
  if (!hasActionForge) next.push(ACTION_FORGE_NAV_ITEM);
  if (!next.some((entry) => entry.route === INDUSTRIAL_NETWORK_NAV_ITEM.route)) {
    next.push(INDUSTRIAL_NETWORK_NAV_ITEM);
  }
  for (const item of PME_EXCHANGE_NAV_ITEMS) {
    if (!next.some((entry) => entry.route === item.route)) next.push(item);
  }
  if (!next.some((entry) => entry.route === GOOGLE_MAPS_NAV_ITEM.route)) next.push(GOOGLE_MAPS_NAV_ITEM);
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
