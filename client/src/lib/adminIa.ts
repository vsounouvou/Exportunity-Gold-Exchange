import type { TenantKey } from "@/types/tenant";
import { getTenantAdminHomeRoute } from "@/lib/tenantPolicy";
import { hasTenantModule, type PlatformModuleKey } from "../../../tenants/index";

export type StandardAdminKey =
  | "dashboard"
  | "orders"
  | "products"
  | "collections"
  | "users"
  | "agents"
  | "wallets"
  | "analytics"
  | "map"
  | "settings"
  | "brand"
  | "modules";

type StandardAdminDefinition = {
  key: StandardAdminKey;
  label: string;
  canonicalPath: string;
  module?: PlatformModuleKey;
};

const STANDARD_ADMIN_DEFINITIONS: StandardAdminDefinition[] = [
  { key: "dashboard", label: "Dashboard", canonicalPath: "/admin/dashboard" },
  { key: "orders", label: "Orders", canonicalPath: "/admin/orders", module: "checkout" },
  { key: "products", label: "Products", canonicalPath: "/admin/products", module: "products" },
  { key: "collections", label: "Collections", canonicalPath: "/admin/collections", module: "collections" },
  { key: "users", label: "Users", canonicalPath: "/admin/users" },
  { key: "agents", label: "Agents", canonicalPath: "/admin/agents", module: "agents" },
  { key: "wallets", label: "Wallets", canonicalPath: "/admin/wallets", module: "wallet" },
  { key: "analytics", label: "Analytics", canonicalPath: "/admin/analytics", module: "analytics" },
  { key: "map", label: "Map", canonicalPath: "/admin/map", module: "map" },
  { key: "settings", label: "Settings", canonicalPath: "/admin/settings" },
  { key: "brand", label: "Brand", canonicalPath: "/admin/brand" },
  { key: "modules", label: "Modules", canonicalPath: "/admin/modules" },
];

function resolveSettingsRoute(tenantKey: TenantKey) {
  if (tenantKey === "agoojye") return "/admin/agoojye/settings";
  if (tenantKey === "met") return "/admin/met/settings";
  if (tenantKey === "vs") return "/admin/vs/settings";
  if (tenantKey === "hoz") return "/admin/hoz/settings";
  if (tenantKey === "mindbase") return "/admin/mindbase/settings";
  return "/admin/system/update";
}

export function resolveTenantAdminAliasDestination(tenantKey: TenantKey, target: StandardAdminKey) {
  switch (target) {
    case "dashboard":
      return getTenantAdminHomeRoute(tenantKey);
    case "orders":
      if (tenantKey === "agoojye") return "/admin/agoojye/sponsors";
      if (tenantKey === "bdo") return "/admin/dashboard";
      if (tenantKey === "met") return "/admin/met/orders";
      if (tenantKey === "vs") return "/admin/vs/inbox";
      if (tenantKey === "hoz") return "/admin/hoz/inbox";
      if (tenantKey === "mindbase") return "/admin/mindbase/users";
      return "/orders";
    case "products":
      if (tenantKey === "agoojye") return "/admin/agoojye/documents";
      if (tenantKey === "met") return "/admin/met/products";
      if (tenantKey === "vs") return "/store";
      if (tenantKey === "hoz") return "/admin/hoz/collections";
      if (tenantKey === "mindbase") return "/admin/mindbase/agents";
      return "/admin/marketplace/products";
    case "collections":
      if (tenantKey === "agoojye") return "/admin/agoojye/content";
      if (tenantKey === "met") return "/admin/met/plans";
      if (tenantKey === "vs") return "/admin/vs/website";
      if (tenantKey === "hoz") return "/admin/hoz/collections";
      if (tenantKey === "mindbase") return "/admin/mindbase/agents";
      return "/collections";
    case "users":
      if (tenantKey === "agoojye") return "/admin/agoojye/users";
      if (tenantKey === "vs") return "/admin/vs/users";
      if (tenantKey === "mindbase") return "/admin/mindbase/users";
      if (tenantKey === "met") return "/admin/met/leads";
      if (tenantKey === "hoz") return "/admin/hoz/settings";
      return "/admin-users";
    case "agents":
      if (tenantKey === "agoojye") return "/admin/agoojye/messages";
      if (tenantKey === "vs") return "/admin/vs/agents";
      if (tenantKey === "mindbase") return "/admin/mindbase/agents";
      return "/agents-os";
    case "wallets":
      return "/admin/wallet/accounts";
    case "analytics":
      if (tenantKey === "agoojye") return "/admin/agoojye";
      if (tenantKey === "met") return "/admin/met";
      if (tenantKey === "vs") return "/admin/vs";
      if (tenantKey === "hoz") return "/admin/hoz";
      if (tenantKey === "mindbase") return "/admin/mindbase";
      if (tenantKey === "zogueland") return "/admin/zogueland";
      return "/dashboard";
    case "map":
      if (tenantKey === "agoojye") return "/admin/agoojye/milestones";
      if (tenantKey === "met") return "/admin/met/projects";
      return "/territories";
    case "settings":
      return resolveSettingsRoute(tenantKey);
    case "brand":
      if (tenantKey === "agoojye") return "/admin/agoojye/media";
      if (tenantKey === "met") return "/admin/met/blog";
      if (tenantKey === "vs") return "/admin/vs/website";
      if (tenantKey === "hoz") return "/admin/hoz/website";
      if (tenantKey === "mindbase") return "/admin/mindbase/settings";
      return "/admin/website/visits";
    case "modules":
      if (tenantKey === "agoojye") return "/admin/agoojye/settings";
      return "/admin/system/update";
    default:
      return getTenantAdminHomeRoute(tenantKey);
  }
}

export function getTenantStandardAdminIa(tenantKey: TenantKey) {
  return STANDARD_ADMIN_DEFINITIONS.filter((entry) => {
    if (!entry.module) return true;
    return hasTenantModule(tenantKey, entry.module);
  }).map((entry) => ({
    ...entry,
    destination: resolveTenantAdminAliasDestination(tenantKey, entry.key),
  }));
}

