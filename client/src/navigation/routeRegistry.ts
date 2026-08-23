import type { AdminNavIconKey } from "@/lib/adminNavRegistry";

import { APP_ROUTE_PATHS } from "./routes.generated";

export type RouteKind = "page" | "hub" | "dynamic" | "hidden";

export type RouteGroupId =
  | "overview"
  | "agents"
  | "operations"
  | "trade"
  | "assets"
  | "territories"
  | "finance"
  | "settings"
  | "system"
  | "unsorted";

export type RouteDef = {
  id: string;
  path: string;
  title: string;
  group: RouteGroupId;
  subgroup?: string;
  icon?: AdminNavIconKey;
  order?: number;
  kind: RouteKind;
  tags?: string[];
  adminOnly?: boolean;
  requiresParams?: string[];
};

export const ROUTE_GROUP_META: Array<{ groupId: RouteGroupId; label: string; order: number }> = [
  { groupId: "overview", label: "Overview", order: 0 },
  { groupId: "agents", label: "Agents", order: 10 },
  { groupId: "operations", label: "Operations", order: 20 },
  { groupId: "trade", label: "Trade", order: 30 },
  { groupId: "assets", label: "Assets", order: 40 },
  { groupId: "territories", label: "Territories", order: 50 },
  { groupId: "finance", label: "Finance", order: 60 },
  { groupId: "settings", label: "Settings", order: 70 },
  { groupId: "system", label: "System", order: 80 },
  { groupId: "unsorted", label: "Unsorted", order: 90 },
];

const BACKOFFICE_PREFIXES = [
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
  "/admin",
  "/finance",
  "/contracts",
  "/delivery/admin",
  "/marketplace/sellers",
  "/seller-dashboard",
  "/agent-economy",
  "/profile",
  "/mail",
  "/notifications",
  "/client-hunter",
  "/marketing",
  "/sales",
  "/bureaus",
  "/territories",
  "/machinery",
  "/admin-users",
  "/subscription-plans",
] as const;

const EXCLUDED_EXACT = new Set([
  "/",
  "/admin",
  "/admin/password",
  "/admin/login",
  "/admin/notifications/:id",
  "/notifications/:id",
  "/agents/:agentid",
  "/operations/agents/:agentid",
  "/commerce/ai-marketplace/agents/:agentid",
  "/agents-os/agents/:id",
  "/admin/agents-os/agents/:id",
  "/territories/:id",
  "/admin/territories/:id",
  "/admin/agents",
  "/admin/agents-os",
  "/admin/agents/governance",
  "/admin/territories",
  "/admin/settings/map",
  "/admin/gateway-images",
  "/admin/mail",
]);

const EXCLUDED_PREFIXES = ["/zone", "/retail", "/pro", "/app", "/platform", "/media", "/install", "/auth"] as const;

const OVERRIDES: Record<string, Partial<RouteDef>> = {
  "/dashboard": { title: "Dashboard", group: "overview", icon: "LayoutDashboard", order: 0, tags: ["kpi", "overview"] },
  "/companies": { title: "Companies", group: "overview", icon: "Building2", order: 10 },
  "/agents": { title: "Org Hierarchy", group: "agents", kind: "hub", icon: "Network", order: 0, tags: ["org", "hierarchy"] },
  "/operations/agents": { title: "Internal Agents", group: "agents", icon: "Users", order: 10, tags: ["internal", "agents"] },
  "/commerce/ai-marketplace/agents": {
    title: "AI Marketplace Agents",
    group: "agents",
    icon: "Store",
    order: 20,
    tags: ["marketplace", "agents"],
  },
  "/agents-os": { title: "Agents OS", group: "agents", icon: "Brain", order: 30 },
  "/admin/action-forge": { title: "Automation governance (alias)", group: "agents", kind: "hidden", icon: "Zap", order: 40, tags: ["actions", "registry"] },
  "/ai-team": { title: "Operations Center HQ", group: "operations", kind: "hub", icon: "MessageSquare", order: 0 },
  "/agenda": { title: "Agenda", group: "operations", icon: "Calendar", order: 10 },
  "/meetings": { title: "Video meetings", group: "operations", icon: "Calendar", order: 20 },
  "/tasks": { title: "Tasks", group: "operations", icon: "ClipboardList", order: 30 },
  "/goals": { title: "Objectives", group: "operations", icon: "Target", order: 40 },
  "/actions": { title: "Actions", group: "operations", icon: "Zap", order: 50 },
  "/knowledge": { title: "Knowledge", group: "operations", icon: "BookOpen", order: 60 },
  "/expert-clones": { title: "Expert agents", group: "operations", icon: "Brain", order: 70 },
  "/admin/inbox": { title: "Inbox", group: "operations", icon: "Mail", order: 80 },
  "/mail": { title: "Mail", group: "operations", icon: "Mail", order: 90 },
  "/admin/workstations": { title: "Workstations", group: "operations", icon: "LayoutDashboard", order: 100 },
  "/admin/evidence": { title: "Evidence", group: "operations", icon: "Search", order: 110 },
  "/admin/notifications": { title: "Notifications", group: "operations", icon: "Target", order: 120 },
  "/bureaus": { title: "Bureaus", group: "trade", icon: "Building2", order: 10 },
  "/contracts": { title: "Contracts", group: "trade", icon: "FileSignature", order: 20 },
  "/delivery/admin": { title: "Delivery", group: "trade", icon: "Truck", order: 30 },
  "/admin/equipment-ops": { title: "Equipment Ops Hub", group: "trade", subgroup: "Equipment Ops", kind: "hub", icon: "Truck", order: 35 },
  "/admin/equipment-ops/listings": { title: "Equipment Ops Listings", group: "trade", subgroup: "Equipment Ops", icon: "ShoppingBag", order: 36 },
  "/admin/equipment-ops/fleet-map": { title: "Equipment Ops Fleet Map", group: "trade", subgroup: "Equipment Ops", icon: "MapPin", order: 37 },
  "/admin/equipment-ops/contracts": { title: "Contracts (Equipment Ops)", group: "trade", subgroup: "Equipment Ops", icon: "FileSignature", order: 38 },
  "/admin/equipment-ops/maintenance": {
    title: "Equipment Ops Maintenance",
    group: "trade",
    subgroup: "Equipment Ops",
    icon: "ShieldCheck",
    order: 39,
  },
  "/admin/exportunity/integrations": {
    title: "Provider Connections",
    group: "settings",
    subgroup: "Exportunity",
    icon: "Network",
    order: 15,
    tags: ["exportunity", "google", "meta", "twilio", "oauth", "connections"],
  },
  "/admin/exportunity/supplier-discovery": {
    title: "Supplier Discovery",
    group: "trade",
    subgroup: "Exportunity",
    icon: "Search",
    order: 34,
    tags: [
      "exportunity",
      "supplier",
      "discovery",
      "provenance",
      "verification",
      "sourcing",
    ],
  },
  "/admin/exportunity/supplier-rfqs": {
    title: "Supplier RFQs",
    group: "trade",
    subgroup: "Exportunity",
    icon: "FileSignature",
    order: 35,
    tags: [
      "exportunity",
      "supplier",
      "rfq",
      "sourcing",
      "approval",
      "outreach",
    ],
  },
  "/marketplace/sellers": { title: "Sellers", group: "trade", icon: "Store", order: 40 },
  "/seller-dashboard": { title: "Seller Dashboard", group: "trade", icon: "Store", order: 50 },
  "/admin/marketplace/products": { title: "Marketplace Products", group: "trade", icon: "ShoppingBag", order: 60 },
  "/admin/marketplace/payments": { title: "Marketplace Payments", group: "trade", icon: "DollarSign", order: 70 },
  "/admin/industrial-network": {
    title: "Industrial Network",
    group: "trade",
    kind: "hub",
    icon: "Building2",
    order: 5,
    tags: ["factories", "buyers", "suppliers", "benin", "gdiz"],
  },
  "/admin/pme-exchange": { title: "PME Exchange", group: "trade", subgroup: "PME Exchange", kind: "hub", icon: "Store", order: 72 },
  "/admin/pme-exchange/map": { title: "PME Map", group: "trade", subgroup: "PME Exchange", icon: "MapPin", order: 73 },
  "/admin/pme-exchange/leads": { title: "PME Leads", group: "trade", subgroup: "PME Exchange", icon: "Users", order: 74 },
  "/admin/pme-exchange/import": { title: "Google Import", group: "trade", subgroup: "PME Exchange", icon: "Search", order: 75 },
  "/admin/pme-exchange/campaigns": { title: "Outreach Campaigns", group: "trade", subgroup: "PME Exchange", icon: "MessageSquare", order: 76 },
  "/admin/pme-exchange/conversations": { title: "PME Conversations", group: "trade", subgroup: "PME Exchange", icon: "Mail", order: 77 },
  "/admin/pme-exchange/profiles": { title: "Exchange Profiles", group: "trade", subgroup: "PME Exchange", icon: "ShieldCheck", order: 78 },
  "/admin/pme-exchange/audit": { title: "Outreach Audit", group: "trade", subgroup: "PME Exchange", icon: "FileSignature", order: 79 },
  "/marketing": { title: "Marketing", group: "trade", icon: "Megaphone", order: 80 },
  "/sales": { title: "Sales alias", group: "trade", kind: "hidden", icon: "DollarSign", order: 90 },
  "/client-hunter": { title: "Lead Hunter", group: "trade", icon: "Search", order: 100 },
  "/admin/met": { title: "Maison en Terre", group: "trade", subgroup: "Maison en Terre", kind: "hub", icon: "Building2", order: 110 },
  "/admin/met/leads": { title: "MET Leads", group: "trade", subgroup: "Maison en Terre", icon: "Users", order: 111 },
  "/admin/met/estimates": { title: "MET Estimates", group: "trade", subgroup: "Maison en Terre", icon: "FileSignature", order: 112 },
  "/admin/met/orders": { title: "MET Orders", group: "trade", subgroup: "Maison en Terre", icon: "ShoppingBag", order: 113 },
  "/admin/met/products": { title: "MET Products", group: "trade", subgroup: "Maison en Terre", icon: "Store", order: 114 },
  "/admin/met/plans": { title: "MET Plans", group: "trade", subgroup: "Maison en Terre", icon: "MapPin", order: 115 },
  "/admin/met/projects": { title: "MET Projects", group: "trade", subgroup: "Maison en Terre", icon: "Image", order: 116 },
  "/admin/met/blog": { title: "MET Blog", group: "trade", subgroup: "Maison en Terre", icon: "BookOpen", order: 117 },
  "/admin/met/media": { title: "MET Media", group: "trade", subgroup: "Maison en Terre", icon: "Image", order: 118 },
  "/admin/met/settings": { title: "MET Settings", group: "trade", subgroup: "Maison en Terre", icon: "ShieldCheck", order: 119 },
  "/admin/vs": {
    title: "Dashboard",
    group: "operations",
    subgroup: "Vital Sounouvou",
    kind: "hub",
    icon: "LayoutDashboard",
    order: 130,
  },
  "/admin/vs/dashboard": {
    title: "Dashboard",
    group: "operations",
    subgroup: "Vital Sounouvou",
    kind: "hidden",
    icon: "LayoutDashboard",
    order: 131,
  },
  "/admin/vs/reputation": {
    title: "Reputation",
    group: "operations",
    subgroup: "Vital Sounouvou",
    icon: "Search",
    order: 132,
  },
  "/admin/vs/pr": {
    title: "PR",
    group: "operations",
    subgroup: "Vital Sounouvou",
    icon: "Megaphone",
    order: 133,
  },
  "/admin/vs/studio": {
    title: "Studio",
    group: "operations",
    subgroup: "Vital Sounouvou",
    icon: "Image",
    order: 134,
  },
  "/admin/vs/social": {
    title: "Social",
    group: "operations",
    subgroup: "Vital Sounouvou",
    icon: "MessageSquare",
    order: 135,
  },
  "/admin/vs/inbox": {
    title: "Inbox",
    group: "operations",
    subgroup: "Vital Sounouvou",
    icon: "Mail",
    order: 136,
  },
  "/admin/vs/agents": {
    title: "Agents",
    group: "operations",
    subgroup: "Vital Sounouvou",
    icon: "Users",
    order: 137,
  },
  "/admin/vs/assistant": {
    title: "Assistant",
    group: "operations",
    subgroup: "Vital Sounouvou",
    icon: "Brain",
    order: 138,
  },
  "/admin/vs/actions": {
    title: "Actions",
    group: "operations",
    subgroup: "Vital Sounouvou",
    icon: "Zap",
    order: 139,
  },
  "/admin/vs/users": {
    title: "Users",
    group: "operations",
    subgroup: "Vital Sounouvou",
    icon: "User",
    order: 140,
  },
  "/admin/vs/settings": {
    title: "Settings",
    group: "operations",
    subgroup: "Vital Sounouvou",
    icon: "ShieldCheck",
    order: 141,
  },
  "/admin/vs/website": {
    title: "Website",
    group: "operations",
    subgroup: "Vital Sounouvou",
    icon: "Image",
    order: 142,
  },
  "/admin/agoojye": {
    title: "Tableau de bord",
    group: "operations",
    subgroup: "AGOOJIYE",
    kind: "hub",
    icon: "LayoutDashboard",
    order: 143,
  },
  "/admin/agoojye/dashboard": {
    title: "Tableau de bord",
    group: "operations",
    subgroup: "AGOOJIYE",
    kind: "hidden",
    icon: "LayoutDashboard",
    order: 144,
  },
  "/admin/agoojye/users": {
    title: "Utilisateurs",
    group: "operations",
    subgroup: "AGOOJIYE",
    icon: "Users",
    order: 145,
  },
  "/admin/agoojye/teams": {
    title: "Équipes",
    group: "operations",
    subgroup: "AGOOJIYE",
    icon: "Users",
    order: 146,
  },
  "/admin/agoojye/participants": {
    title: "Participants",
    group: "operations",
    subgroup: "AGOOJIYE",
    icon: "ShieldCheck",
    order: 147,
  },
  "/admin/agoojye/emails": {
    title: "Emails officiels",
    group: "operations",
    subgroup: "AGOOJIYE",
    icon: "Mail",
    order: 148,
  },
  "/admin/agoojye/messages": {
    title: "Messages",
    group: "operations",
    subgroup: "AGOOJIYE",
    icon: "MessageSquare",
    order: 149,
  },
  "/admin/agoojye/tasks": {
    title: "Tâches",
    group: "operations",
    subgroup: "AGOOJIYE",
    icon: "ClipboardList",
    order: 150,
  },
  "/admin/agoojye/milestones": {
    title: "Jalons",
    group: "operations",
    subgroup: "AGOOJIYE",
    icon: "Calendar",
    order: 151,
  },
  "/admin/agoojye/documents": {
    title: "Documents",
    group: "operations",
    subgroup: "AGOOJIYE",
    icon: "FileSignature",
    order: 152,
  },
  "/admin/agoojye/partners": {
    title: "Partenaires",
    group: "operations",
    subgroup: "AGOOJIYE",
    icon: "Building2",
    order: 153,
  },
  "/admin/agoojye/sponsors": {
    title: "Sponsors",
    group: "operations",
    subgroup: "AGOOJIYE",
    icon: "DollarSign",
    order: 154,
  },
  "/admin/agoojye/media": {
    title: "Médias",
    group: "operations",
    subgroup: "AGOOJIYE",
    icon: "Image",
    order: 155,
  },
  "/admin/agoojye/content": {
    title: "Contenu",
    group: "operations",
    subgroup: "AGOOJIYE",
    icon: "BookOpen",
    order: 156,
  },
  "/admin/agoojye/settings": {
    title: "Réglages",
    group: "operations",
    subgroup: "AGOOJIYE",
    icon: "ShieldCheck",
    order: 157,
  },
  "/admin/agoojye/audit": {
    title: "Journal d'audit",
    group: "operations",
    subgroup: "AGOOJIYE",
    icon: "Search",
    order: 158,
  },
  "/admin/hoz": {
    title: "Dashboard",
    group: "operations",
    subgroup: "House of Zogue",
    kind: "hub",
    icon: "LayoutDashboard",
    order: 160,
  },
  "/admin/hoz/dashboard": {
    title: "Dashboard",
    group: "operations",
    subgroup: "House of Zogue",
    kind: "hidden",
    icon: "LayoutDashboard",
    order: 161,
  },
  "/admin/hoz/collections": {
    title: "Collections",
    group: "operations",
    subgroup: "House of Zogue",
    icon: "BookOpen",
    order: 162,
  },
  "/admin/hoz/media": {
    title: "Media",
    group: "operations",
    subgroup: "House of Zogue",
    icon: "Image",
    order: 163,
  },
  "/admin/hoz/inbox": {
    title: "Inbox",
    group: "operations",
    subgroup: "House of Zogue",
    icon: "Mail",
    order: 164,
  },
  "/admin/hoz/website": {
    title: "Website",
    group: "operations",
    subgroup: "House of Zogue",
    icon: "Image",
    order: 165,
  },
  "/admin/hoz/settings": {
    title: "Settings",
    group: "operations",
    subgroup: "House of Zogue",
    icon: "ShieldCheck",
    order: 166,
  },
  "/admin/mindbase": {
    title: "Dashboard",
    group: "operations",
    subgroup: "MindBase",
    kind: "hub",
    icon: "LayoutDashboard",
    order: 150,
  },
  "/admin/mindbase/dashboard": {
    title: "Dashboard",
    group: "operations",
    subgroup: "MindBase",
    kind: "hidden",
    icon: "LayoutDashboard",
    order: 151,
  },
  "/admin/mindbase/moderation": {
    title: "Moderation",
    group: "operations",
    subgroup: "MindBase",
    icon: "ShieldCheck",
    order: 152,
  },
  "/admin/mindbase/users": {
    title: "Users",
    group: "operations",
    subgroup: "MindBase",
    icon: "Users",
    order: 153,
  },
  "/admin/mindbase/credits": {
    title: "Credits",
    group: "operations",
    subgroup: "MindBase",
    icon: "DollarSign",
    order: 154,
  },
  "/admin/mindbase/agents": {
    title: "Agents",
    group: "operations",
    subgroup: "MindBase",
    icon: "Brain",
    order: 155,
  },
  "/admin/mindbase/settings": {
    title: "Settings",
    group: "operations",
    subgroup: "MindBase",
    icon: "ShieldCheck",
    order: 156,
  },
  "/admin/stamped-gold": {
    title: "Gold Stamping Hub",
    group: "assets",
    subgroup: "Gold Stamping",
    kind: "hub",
    icon: "Coins",
    order: 0,
    tags: ["stamped", "gold", "qr", "sku"],
  },
  "/admin/stamped-gold/skus": {
    title: "Stamped Gold SKUs",
    group: "assets",
    subgroup: "Gold Stamping",
    icon: "Coins",
    order: 10,
  },
  "/admin/stamped-gold/minting-studio": {
    title: "Atelier de frappe",
    group: "assets",
    subgroup: "Gold Stamping",
    icon: "Zap",
    order: 15,
  },
  "/admin/stamped-gold/items": {
    title: "Stamped Gold Items",
    group: "assets",
    subgroup: "Gold Stamping",
    icon: "ShoppingBag",
    order: 20,
  },
  "/admin/stamped-gold/jewellers": {
    title: "Stamped Gold Jewellers",
    group: "assets",
    subgroup: "Gold Stamping",
    icon: "Store",
    order: 30,
  },
  "/admin/stamped-gold/scans": {
    title: "Stamped Gold Scans",
    group: "assets",
    subgroup: "Gold Stamping",
    icon: "Search",
    order: 40,
  },
  "/admin/stamped-gold/pickup": {
    title: "Stamped Gold Pickup",
    group: "assets",
    subgroup: "Gold Stamping",
    icon: "Truck",
    order: 50,
  },
  "/machinery": { title: "Machinery", group: "assets", subgroup: "Machinery", icon: "Building2", order: 60 },
  "/admin/media/assets": { title: "Asset Studio", group: "assets", subgroup: "Media", icon: "Image", order: 70 },
  "/admin/media/images": { title: "Media Images", group: "assets", subgroup: "Media", icon: "Image", order: 75 },
  "/admin/assets/images": { title: "Asset Images", group: "assets", subgroup: "Media", icon: "Image", order: 76 },
  "/territories": { title: "Territories Hub", group: "territories", kind: "hub", icon: "MapPin", order: 0 },
  "/finance": { title: "Finance Hub", group: "finance", kind: "hub", icon: "Wallet", order: 0 },
  "/admin/wallet": {
    title: "Wallet Hub",
    group: "finance",
    subgroup: "Wallet",
    kind: "hub",
    icon: "Wallet",
    order: 5,
    tags: ["ledger", "accounts", "risk", "payouts"],
  },
  "/admin/wallet/accounts": { title: "Wallet Accounts", group: "finance", subgroup: "Wallet", icon: "Wallet", order: 10 },
  "/admin/wallet/ledger": { title: "Wallet Ledger", group: "finance", subgroup: "Wallet", icon: "Wallet", order: 20 },
  "/admin/wallet/topups": { title: "Wallet Topups", group: "finance", subgroup: "Wallet", icon: "Wallet", order: 30 },
  "/admin/wallet/payouts": { title: "Wallet Payouts", group: "finance", subgroup: "Wallet", icon: "Wallet", order: 40 },
  "/admin/wallet/vouchers": { title: "Wallet Vouchers", group: "finance", subgroup: "Wallet", icon: "Wallet", order: 50 },
  "/admin/wallet/sellers": { title: "Wallet Sellers", group: "finance", subgroup: "Wallet", icon: "Wallet", order: 60 },
  "/admin/wallet/risk": { title: "Wallet Risk", group: "finance", subgroup: "Wallet", icon: "ShieldCheck", order: 70 },
  "/admin/wallet/config": { title: "Wallet Config", group: "finance", subgroup: "Wallet", icon: "Wallet", order: 80 },
  "/admin/system/update": { title: "System Hub", group: "system", kind: "hub", icon: "RefreshCw", order: 0 },
  "/admin/seo": { title: "Website Intelligence", group: "system", subgroup: "Digital operations", kind: "hub", icon: "BarChart3", order: 10 },
  "/admin/website/seo": { title: "SEO health (alias)", group: "system", kind: "hidden", icon: "Search", order: 20 },
  "/admin/website/seo-autopilot": { title: "SEO governance (alias)", group: "system", kind: "hidden", icon: "Zap", order: 30 },
  "/admin/website/visits": { title: "Visits intelligence (alias)", group: "system", kind: "hidden", icon: "BarChart3", order: 40 },
  "/admin/email": { title: "Email Control Center", group: "settings", subgroup: "Communications", icon: "Mail", order: 10 },
  "/admin/settings/communications/twilio": {
    title: "Twilio Control Center",
    group: "settings",
    subgroup: "Communications",
    icon: "MessageSquare",
    order: 20,
  },
  "/admin/settings/integrations/google-maps": {
    title: "Google Maps / Places",
    group: "settings",
    subgroup: "Integrations",
    icon: "MapPin",
    order: 25,
  },
  "/admin/settings/integrations/google-workspace": {
    title: "Google Workspace Evidence",
    group: "settings",
    subgroup: "Integrations",
    icon: "Cloud",
    order: 26,
    adminOnly: true,
    tags: ["company brain", "gmail", "drive", "contacts", "evidence"],
  },
  "/admin/company-brain": {
    title: "Company Brain",
    group: "operations",
    subgroup: "Knowledge",
    icon: "Brain",
    order: 55,
  },
  "/admin/communications/twilio": {
    title: "Twilio Inbox",
    group: "settings",
    subgroup: "Communications",
    icon: "MessageSquare",
    order: 30,
  },
  "/admin/communications/twilio/logs": {
    title: "Twilio Logs",
    group: "settings",
    subgroup: "Communications",
    icon: "MessageSquare",
    order: 40,
  },
  "/admin/communications/whatsapp": {
    title: "WhatsApp Conversations",
    group: "settings",
    subgroup: "Communications",
    icon: "MessageSquare",
    order: 50,
  },
  "/admin/communications/whatsapp/logs": {
    title: "WhatsApp Logs",
    group: "settings",
    subgroup: "Communications",
    icon: "MessageSquare",
    order: 60,
  },
  "/admin/contacts": { title: "Contacts", group: "settings", icon: "Users", order: 70 },
  "/admin/map-icons": { title: "Map Icons", group: "settings", icon: "MapPin", order: 80 },
  "/admin/settings/onboarding": { title: "Onboarding Settings", group: "settings", icon: "Target", order: 90 },
  "/admin/settings/developer": { title: "Voice Health (alias)", group: "system", kind: "hidden", icon: "RefreshCw", order: 100, adminOnly: true },
  "/admin/settings/fx": {
    title: "FX Settings",
    group: "settings",
    subgroup: "Finance",
    icon: "DollarSign",
    order: 95,
    tags: ["currency", "exchange", "rates", "overrides"],
  },
  "/admin/pro-test-accounts": { title: "Pro Test Accounts", group: "system", icon: "Users", order: 110, adminOnly: true },
  "/admin/ux-audit": { title: "Navigation audit (alias)", group: "system", kind: "hidden", icon: "Search", order: 120, adminOnly: true },
  "/admin-users": { title: "User Management", group: "settings", icon: "Users", order: 130 },
};

export function normalizeRoutePathForRegistry(value: string) {
  const raw = String(value || "").trim();
  if (!raw.startsWith("/")) return "";
  const withoutQuery = raw.split(/[?#]/)[0] || raw;
  if (withoutQuery.length > 1 && withoutQuery.endsWith("/")) return withoutQuery.slice(0, -1);
  return withoutQuery || "/";
}

function toId(path: string) {
  return path.replace(/[:*]/g, "").replace(/\/+/g, "_").replace(/^_+|_+$/g, "").toLowerCase() || "home";
}

export function isDynamicRoutePath(path: string) {
  return /:[a-z0-9_]+/i.test(path) || path.includes("*");
}

export function isBackofficeRoutePath(path: string) {
  if (!path) return false;
  if (EXCLUDED_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) return false;
  return BACKOFFICE_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

function toTitle(path: string) {
  const clean = path
    .split("/")
    .filter(Boolean)
    .filter((token) => !["admin", "settings", "communications", "website"].includes(token.toLowerCase()));
  if (!clean.length) return "Home";
  const token = clean[clean.length - 1] || clean[0];
  return token.replace(/[-_]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function classifyGroup(path: string): RouteGroupId {
  const value = path.toLowerCase();
  if (value === "/dashboard" || value === "/companies") return "overview";
  if (
    value.startsWith("/agents") ||
    value.startsWith("/agents-os") ||
    value.startsWith("/operations/agents") ||
    value.startsWith("/commerce/ai-marketplace/agents") ||
    value.startsWith("/admin/action-forge")
  ) {
    return "agents";
  }
  if (
    value.startsWith("/ai-team") ||
    value.startsWith("/agenda") ||
    value.startsWith("/meetings") ||
    value.startsWith("/tasks") ||
    value.startsWith("/goals") ||
    value.startsWith("/actions") ||
    value.startsWith("/knowledge") ||
    value.startsWith("/expert-clones") ||
    value.startsWith("/admin/inbox") ||
    value === "/mail" ||
    value.startsWith("/notifications") ||
    value.startsWith("/admin/workstations") ||
    value.startsWith("/admin/evidence")
  ) {
    return "operations";
  }
  if (
    value.startsWith("/marketplace") ||
    value.startsWith("/delivery/admin") ||
    value.startsWith("/contracts") ||
    value.startsWith("/client-hunter") ||
    value.startsWith("/marketing") ||
    value.startsWith("/sales") ||
    value.startsWith("/bureaus") ||
    value.startsWith("/admin/equipment-ops") ||
    value.startsWith("/seller-dashboard")
  ) {
    return "trade";
  }
  if (value.startsWith("/admin/stamped-gold") || value.startsWith("/admin/media") || value.startsWith("/machinery")) {
    return "assets";
  }
  if (value.startsWith("/territories")) return "territories";
  if (value === "/finance" || value.startsWith("/admin/wallet")) return "finance";
  if (value.startsWith("/admin/system") || value.startsWith("/admin/website/seo")) return "system";
  if (value.startsWith("/admin/contacts") || value.startsWith("/admin/email") || value.startsWith("/admin/settings")) {
    return "settings";
  }
  if (value.startsWith("/admin") || value.startsWith("/admin-users")) return "system";
  return "unsorted";
}

function classifySubgroup(path: string) {
  const value = path.toLowerCase();
  if (value.startsWith("/admin/stamped-gold")) return "Gold Stamping";
  if (value.startsWith("/admin/wallet")) return "Wallet";
  if (value.startsWith("/admin/website/seo") || value === "/admin/seo") return "SEO";
  if (value.startsWith("/admin/communications") || value.startsWith("/admin/settings/communications")) {
    return "Communications";
  }
  if (value.startsWith("/admin/equipment-ops")) return "Equipment Ops";
  if (value.startsWith("/admin/media") || value.startsWith("/admin/assets")) return "Media";
  return undefined;
}

export const ROUTES: RouteDef[] = Array.from(
  new Set(APP_ROUTE_PATHS.map((path) => normalizeRoutePathForRegistry(path)).filter((path) => isBackofficeRoutePath(path))),
)
  .sort((a, b) => a.localeCompare(b))
  .map((path) => {
    const override = OVERRIDES[path] || {};
    const dynamic = isDynamicRoutePath(path);
    const hidden = EXCLUDED_EXACT.has(path.toLowerCase()) || override.kind === "hidden";

    const route: RouteDef = {
      id: toId(path),
      path,
      title: override.title || toTitle(path),
      group: override.group || classifyGroup(path),
      subgroup: override.subgroup || classifySubgroup(path),
      icon: override.icon,
      order: override.order ?? 100,
      kind: dynamic ? "dynamic" : hidden ? "hidden" : (override.kind || "page"),
      tags: override.tags || [],
      adminOnly: override.adminOnly ?? path.startsWith("/admin"),
      requiresParams: dynamic ? ["id"] : undefined,
    };
    return route;
  });
