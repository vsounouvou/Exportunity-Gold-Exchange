import { db } from "@db";
import { sql } from "drizzle-orm";

import {
  classifyMasterMenu,
  discoverRoutes,
  humanizeRouteTitle,
  isMenuEligibleRoute,
  isSystemUtilityRoutePath,
  isTemplateRoutePath,
  toRouteRegistryKey,
} from "./routeDiscovery";

export const MASTER_MENU_ORDER = [
  "Home",
  "Agents",
  "Operations",
  "Trade",
  "Assets",
  "Territories",
  "Finance",
  "Settings",
  "Tools",
] as const;

export type MasterMenuKey = (typeof MASTER_MENU_ORDER)[number];

export type PageRegistryItem = {
  id: string;
  key: string;
  title: string;
  path: string;
  masterMenu: MasterMenuKey;
  sortOrder: number;
  isEnabled: boolean;
  minRole: "PUBLIC" | "USER" | "STAFF" | "ADMIN" | "SUPERADMIN";
  tenantId: number | null;
  featureFlag: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type BrowsePageItem = PageRegistryItem & {
  source: "REGISTERED" | "UNREGISTERED";
  routeKind: "app" | "pages" | "wouter" | "unknown";
  filePath: string | null;
  tags: string[];
  brokenRoute: boolean;
  isRestricted: boolean;
  isFlaggedOff: boolean;
};

type PageRegistryRow = {
  id: string;
  key: string;
  title: string;
  path: string;
  master_menu: string;
  sort_order: number | string | null;
  is_enabled: boolean | string | number | null;
  min_role: string | null;
  tenant_id: number | string | null;
  feature_flag: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type DiscoveredRouteCacheRow = {
  path: string;
  file_path: string | null;
  route_kind: string | null;
  master_menu: string | null;
  title: string | null;
  is_active: boolean | string | number | null;
};

type AnyActor = {
  role?: string;
  roles?: string[];
  currentMode?: string;
  permissions?: string[];
};

const MENU_PATH_PRIORITY: Record<MasterMenuKey, string[]> = {
  Home: ["/home/center", "/dashboard", "/"],
  Agents: ["/agents/center", "/agents-os", "/operations/agents", "/commerce/ai-marketplace/agents", "/admin/action-forge"],
  Operations: ["/operations/center", "/ai-team", "/agenda", "/tasks", "/actions", "/admin/inbox"],
  Trade: ["/trade/center", "/admin/marketplace/products", "/marketplace/sellers", "/contracts", "/delivery/admin"],
  Assets: ["/assets/center", "/admin/stamped-gold", "/admin/stamped-gold/skus", "/admin/equipment-ops/listings"],
  Territories: ["/territories/center", "/territories"],
  Finance: ["/finance/center", "/finance", "/wallet", "/admin/wallet/accounts"],
  Settings: ["/settings/center", "/admin/system/update", "/admin/contacts", "/admin/email"],
  Tools: ["/tools/center"],
};

const CENTER_BY_MASTER: Record<MasterMenuKey, string> = {
  Home: "/home/center",
  Agents: "/agents/center",
  Operations: "/operations/center",
  Trade: "/trade/center",
  Assets: "/assets/center",
  Territories: "/territories/center",
  Finance: "/finance/center",
  Settings: "/settings/center",
  Tools: "/tools/center",
};

const ROLE_LEVEL: Record<string, number> = {
  PUBLIC: 0,
  USER: 1,
  STAFF: 2,
  ADMIN: 3,
  SUPERADMIN: 4,
};

function rows<T = any>(result: any): T[] {
  if (Array.isArray(result?.rows)) return result.rows as T[];
  if (Array.isArray(result)) return result as T[];
  return [];
}

function asString(value: unknown) {
  return String(value ?? "").trim();
}

function asInt(value: unknown, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.trunc(parsed);
}

function asBool(value: unknown) {
  if (typeof value === "boolean") return value;
  const normalized = asString(value).toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "t" || normalized === "yes" || normalized === "on";
}

function normalizeMaster(value: unknown): MasterMenuKey {
  const normalized = asString(value);
  const found = MASTER_MENU_ORDER.find((item) => item.toLowerCase() === normalized.toLowerCase());
  return found || "Tools";
}

function normalizeRole(value: unknown): PageRegistryItem["minRole"] {
  const normalized = asString(value).toUpperCase();
  if (normalized === "PUBLIC") return "PUBLIC";
  if (normalized === "USER") return "USER";
  if (normalized === "STAFF") return "STAFF";
  if (normalized === "SUPERADMIN") return "SUPERADMIN";
  return "ADMIN";
}

function normalizePath(value: unknown) {
  const raw = asString(value);
  if (!raw) return "/";
  if (raw === "/") return raw;
  const withSlash = raw.startsWith("/") ? raw : `/${raw}`;
  return withSlash.replace(/\/+$/, "");
}

function normalizeRoleToken(value: unknown) {
  return asString(value)
    .toLowerCase()
    .replace(/['Ã¢â‚¬â„¢]/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function resolveActorLevel(actor: AnyActor | null | undefined) {
  const currentMode = normalizeRoleToken(actor?.currentMode);
  const role = normalizeRoleToken(actor?.role);
  const roles = Array.isArray(actor?.roles) ? actor.roles.map((item) => normalizeRoleToken(item)) : [];
  const permissions = Array.isArray(actor?.permissions)
    ? actor.permissions.map((item) => asString(item).toLowerCase())
    : [];

  if (currentMode === "admin") return ROLE_LEVEL.ADMIN;
  if (permissions.includes("*") || permissions.includes("admin:*")) return ROLE_LEVEL.SUPERADMIN;
  if (roles.includes("super admin") || roles.includes("platform admin")) return ROLE_LEVEL.SUPERADMIN;
  if (role === "admin" || roles.includes("admin") || roles.includes("chairman")) return ROLE_LEVEL.ADMIN;
  if (roles.includes("staff") || roles.includes("agent")) return ROLE_LEVEL.STAFF;
  if (role) return ROLE_LEVEL.USER;
  return ROLE_LEVEL.PUBLIC;
}

function isAdminActor(actor: AnyActor | null | undefined) {
  return resolveActorLevel(actor) >= ROLE_LEVEL.ADMIN;
}

function isFeatureEnabled(flagName: string | null) {
  const key = asString(flagName);
  if (!key) return true;
  const raw = asString((process.env as Record<string, string | undefined>)[key]);
  if (!raw) return false;
  const normalized = raw.toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function mapRow(row: PageRegistryRow): PageRegistryItem {
  return {
    id: asString(row.id),
    key: asString(row.key),
    title: asString(row.title) || asString(row.key),
    path: normalizePath(row.path),
    masterMenu: normalizeMaster(row.master_menu),
    sortOrder: asInt(row.sort_order, 100),
    isEnabled: asBool(row.is_enabled),
    minRole: normalizeRole(row.min_role),
    tenantId: row.tenant_id == null ? null : asInt(row.tenant_id, 0) || null,
    featureFlag: asString(row.feature_flag) || null,
    createdAt: row.created_at ? String(row.created_at) : null,
    updatedAt: row.updated_at ? String(row.updated_at) : null,
  };
}

function dedupeTenantRows(items: PageRegistryItem[], tenantId: number) {
  const byKey = new Map<string, PageRegistryItem>();
  const sorted = items.slice().sort((left, right) => {
    const leftScore = left.tenantId === tenantId ? 0 : 1;
    const rightScore = right.tenantId === tenantId ? 0 : 1;
    if (leftScore !== rightScore) return leftScore - rightScore;
    if (left.sortOrder !== right.sortOrder) return left.sortOrder - right.sortOrder;
    return left.title.localeCompare(right.title);
  });

  for (const item of sorted) {
    if (!byKey.has(item.key)) byKey.set(item.key, item);
  }
  return Array.from(byKey.values());
}

async function fetchPagesRaw(
  tenantId: number,
  options: {
    includeAllTenants?: boolean;
  } = {},
): Promise<PageRegistryItem[]> {
  const includeAllTenants = options.includeAllTenants === true;
  const result = includeAllTenants
    ? await db.execute(sql`
        select
          id,
          key,
          title,
          path,
          master_menu,
          sort_order,
          is_enabled,
          min_role,
          tenant_id,
          feature_flag,
          created_at,
          updated_at
        from pages_registry
        order by master_menu asc, sort_order asc, updated_at desc
      `)
    : await db.execute(sql`
        select
          id,
          key,
          title,
          path,
          master_menu,
          sort_order,
          is_enabled,
          min_role,
          tenant_id,
          feature_flag,
          created_at,
          updated_at
        from pages_registry
        where tenant_id is null or tenant_id = ${tenantId}
        order by master_menu asc, sort_order asc, updated_at desc
      `);

  const mapped = rows<PageRegistryRow>(result).map(mapRow);
  return includeAllTenants ? mapped : dedupeTenantRows(mapped, tenantId);
}

function applyVisibilityFilter(
  items: PageRegistryItem[],
  actor: AnyActor | null | undefined,
  options: { menuOnly?: boolean } = {},
) {
  const menuOnly = options.menuOnly !== false;
  const adminMode = isAdminActor(actor);
  const actorLevel = resolveActorLevel(actor);
  return items.filter((item) => {
    if (!item.isEnabled) return false;
    if (menuOnly && !isMenuEligibleRoute(item.path)) return false;
    if (adminMode) return true;
    if (!isFeatureEnabled(item.featureFlag)) return false;
    const minRoleLevel = ROLE_LEVEL[item.minRole] ?? ROLE_LEVEL.ADMIN;
    return actorLevel >= minRoleLevel;
  });
}

type CachedRoute = {
  path: string;
  filePath: string | null;
  routeKind: "app" | "pages" | "wouter" | "unknown";
  masterMenu: MasterMenuKey;
  title: string;
};

let discoveredRouteMemo: { expiresAt: number; routes: CachedRoute[] } | null = null;

async function fetchDiscoveredRoutesFromCache() {
  const result = await db.execute(sql`
    select path, file_path, route_kind, master_menu, title, is_active
    from discovered_routes_cache
    where is_active = true
    order by path asc
  `);

  return rows<DiscoveredRouteCacheRow>(result)
    .filter((row) => asBool(row.is_active))
    .map((row) => {
      const pathValue = normalizePath(row.path);
      const routeKind = asString(row.route_kind).toLowerCase();
      return {
        path: pathValue,
        filePath: asString(row.file_path) || null,
        routeKind:
          routeKind === "app" || routeKind === "pages" || routeKind === "wouter"
            ? routeKind
            : "unknown",
        masterMenu: normalizeMaster(row.master_menu || classifyMasterMenu(pathValue)),
        title: asString(row.title) || humanizeRouteTitle(pathValue),
      } as CachedRoute;
    });
}

async function getDiscoveredRoutes() {
  if (discoveredRouteMemo && discoveredRouteMemo.expiresAt > Date.now()) {
    return discoveredRouteMemo.routes;
  }

  let discovered = await fetchDiscoveredRoutesFromCache();
  if (!discovered.length) {
    const fallback = await discoverRoutes(process.cwd());
    discovered = fallback.map((item) => ({
      path: normalizePath(item.path),
      filePath: item.filePath || null,
      routeKind: item.kind,
      masterMenu: normalizeMaster(item.masterMenu),
      title: item.title || humanizeRouteTitle(item.path),
    }));
  }

  discoveredRouteMemo = {
    routes: discovered,
    expiresAt: Date.now() + 30_000,
  };

  return discovered;
}

export async function getMasterMenus(tenantId: number, actor: AnyActor | null | undefined) {
  const visiblePages = applyVisibilityFilter(await fetchPagesRaw(tenantId), actor, { menuOnly: true });
  const byMaster = new Map<MasterMenuKey, number>();
  for (const item of visiblePages) {
    byMaster.set(item.masterMenu, (byMaster.get(item.masterMenu) || 0) + 1);
  }

  return MASTER_MENU_ORDER.map((master) => ({
    key: master,
    title: master,
    centerPath: CENTER_BY_MASTER[master],
    pageCount: byMaster.get(master) || 0,
  }));
}

export async function getAllPages(
  master: MasterMenuKey,
  tenantId: number,
  actor: AnyActor | null | undefined,
): Promise<PageRegistryItem[]> {
  if (isAdminActor(actor)) {
    const merged = await getBrowseAllPages(master, tenantId, actor);
    return merged
      .filter((item) => item.isEnabled && isMenuEligibleRoute(item.path))
      .map((item) => ({
        id: item.id,
        key: item.key,
        title: item.title,
        path: item.path,
        masterMenu: master,
        sortOrder: item.sortOrder,
        isEnabled: item.isEnabled,
        minRole: item.minRole,
        tenantId: item.tenantId,
        featureFlag: item.featureFlag,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      }))
      .sort((left, right) => {
        if (left.sortOrder !== right.sortOrder) return left.sortOrder - right.sortOrder;
        if (left.title !== right.title) return left.title.localeCompare(right.title);
        return left.path.localeCompare(right.path);
      });
  }

  const visiblePages = applyVisibilityFilter(await fetchPagesRaw(tenantId), actor, { menuOnly: true });
  return visiblePages
    .filter((item) => item.masterMenu === master)
    .sort((left, right) => {
      if (left.sortOrder !== right.sortOrder) return left.sortOrder - right.sortOrder;
      if (left.title !== right.title) return left.title.localeCompare(right.title);
      return left.path.localeCompare(right.path);
    });
}

function registryPrecedence(item: PageRegistryItem, tenantId: number) {
  if (item.tenantId === tenantId) return 0;
  if (item.tenantId === null) return 1;
  return 2;
}

function getMinRoleLevel(minRole: PageRegistryItem["minRole"]) {
  return ROLE_LEVEL[minRole] ?? ROLE_LEVEL.ADMIN;
}

export async function getBrowseAllPages(
  master: MasterMenuKey,
  tenantId: number,
  actor: AnyActor | null | undefined,
): Promise<BrowsePageItem[]> {
  const actorLevel = resolveActorLevel(actor);
  const adminMode = isAdminActor(actor);
  const registryRows = await fetchPagesRaw(tenantId, { includeAllTenants: adminMode });
  const discoveredRoutes = await getDiscoveredRoutes();

  const registryByPath = new Map<string, PageRegistryItem>();
  for (const row of registryRows) {
    const pathValue = normalizePath(row.path);
    const current = registryByPath.get(pathValue);
    if (!current || registryPrecedence(row, tenantId) < registryPrecedence(current, tenantId)) {
      registryByPath.set(pathValue, row);
    }
  }

  const discoveredByPath = new Map<string, CachedRoute>();
  const discoveredPaths = new Set<string>();
  for (const route of discoveredRoutes) {
    discoveredPaths.add(normalizePath(route.path));
    const routeMaster = classifyMasterMenu(route.path);
    if (routeMaster !== master) continue;
    discoveredByPath.set(normalizePath(route.path), {
      ...route,
      path: normalizePath(route.path),
      masterMenu: routeMaster,
    });
  }

  const merged: BrowsePageItem[] = [];

  for (const [pathValue, discovered] of discoveredByPath.entries()) {
    const registry = registryByPath.get(pathValue) || null;
    const isTemplateRoute = isTemplateRoutePath(pathValue);
    const isSystemUtility = isSystemUtilityRoutePath(pathValue);
    const minRole = registry?.minRole || "ADMIN";
    const minRoleLevel = getMinRoleLevel(minRole);
    const flaggedOff = !isFeatureEnabled(registry?.featureFlag || null);
    const isRestricted = actorLevel < minRoleLevel;
    const isEnabled = registry?.isEnabled ?? true;
    const tags = [
      registry ? "REGISTERED" : "UNREGISTERED",
      ...(isTemplateRoute ? ["TEMPLATE_ROUTE"] : []),
      ...(isSystemUtility ? ["SYSTEM_ROUTE"] : []),
      ...(registry?.isEnabled === false ? ["DISABLED"] : []),
      ...(flaggedOff ? ["FLAGGED_OFF"] : []),
      ...(isRestricted ? ["RESTRICTED"] : []),
    ];

    const item: BrowsePageItem = {
      id: registry?.id || `discovered:${pathValue}`,
      key: registry?.key || toRouteRegistryKey(pathValue),
      title: registry?.title || discovered.title || humanizeRouteTitle(pathValue),
      path: pathValue,
      masterMenu: registry?.masterMenu || master,
      sortOrder: registry?.sortOrder ?? 100_000,
      isEnabled,
      minRole,
      tenantId: registry?.tenantId ?? null,
      featureFlag: registry?.featureFlag ?? null,
      createdAt: registry?.createdAt ?? null,
      updatedAt: registry?.updatedAt ?? null,
      source: registry ? "REGISTERED" : "UNREGISTERED",
      routeKind: discovered.routeKind,
      filePath: discovered.filePath,
      tags,
      brokenRoute: false,
      isRestricted,
      isFlaggedOff: flaggedOff,
    };

    if (
      adminMode ||
      (item.isEnabled && !item.isFlaggedOff && !item.isRestricted && !isTemplateRoute && !isSystemUtility)
    ) {
      merged.push(item);
    }
  }

  for (const row of registryRows) {
    const pathValue = normalizePath(row.path);
    if (discoveredByPath.has(pathValue) || discoveredPaths.has(pathValue)) continue;

    const fallbackMaster = classifyMasterMenu(pathValue);
    const candidateMaster = row.masterMenu || fallbackMaster;
    if (candidateMaster !== master && fallbackMaster !== master) continue;

    const minRoleLevel = getMinRoleLevel(row.minRole);
    const flaggedOff = !isFeatureEnabled(row.featureFlag);
    const isRestricted = actorLevel < minRoleLevel;
    const tags = [
      "REGISTERED",
      "BROKEN_ROUTE",
      ...(row.isEnabled ? [] : ["DISABLED"]),
      ...(flaggedOff ? ["FLAGGED_OFF"] : []),
      ...(isRestricted ? ["RESTRICTED"] : []),
    ];

    const item: BrowsePageItem = {
      ...row,
      source: "REGISTERED",
      routeKind: "unknown",
      filePath: null,
      tags,
      brokenRoute: true,
      isRestricted,
      isFlaggedOff: flaggedOff,
    };

    if (adminMode || (item.isEnabled && !item.isFlaggedOff && !item.isRestricted)) {
      merged.push(item);
    }
  }

  merged.sort((left, right) => {
    const leftWeight = left.source === "REGISTERED" ? left.sortOrder : 100_000;
    const rightWeight = right.source === "REGISTERED" ? right.sortOrder : 100_000;
    if (leftWeight !== rightWeight) return leftWeight - rightWeight;
    return left.path.localeCompare(right.path);
  });

  return merged;
}

export async function getMenuItems(
  master: MasterMenuKey,
  tenantId: number,
  actor: AnyActor | null | undefined,
  limit = 5,
) {
  const all = await getAllPages(master, tenantId, actor);
  const normalizedCenter = normalizePath(CENTER_BY_MASTER[master]);
  const byPath = new Map<string, PageRegistryItem>();
  for (const item of all) {
    byPath.set(normalizePath(item.path), item);
  }

  const preferred = MENU_PATH_PRIORITY[master] || [];
  const selected: PageRegistryItem[] = [];
  const usedPaths = new Set<string>();
  const usedTitles = new Set<string>();

  function tryPush(item: PageRegistryItem | undefined | null) {
    if (!item) return;
    const pathValue = normalizePath(item.path);
    if (pathValue === normalizedCenter) return;
    const titleKey = asString(item.title).toLowerCase();
    if (usedPaths.has(pathValue)) return;
    if (titleKey && usedTitles.has(titleKey)) return;
    usedPaths.add(pathValue);
    if (titleKey) usedTitles.add(titleKey);
    selected.push(item);
  }

  for (const preferredPath of preferred) {
    tryPush(byPath.get(normalizePath(preferredPath)));
  }

  for (const item of all) {
    tryPush(item);
  }

  const safeLimit = Math.max(1, Math.min(5, asInt(limit, 5)));
  const directLimit = Math.max(0, safeLimit - 1);
  const directItems = selected.slice(0, directLimit);
  const browseItem: PageRegistryItem = {
    id: `browse-${master.toLowerCase()}`,
    key: `${master.toLowerCase()}.browse`,
    title: "Browse all pages",
    path: CENTER_BY_MASTER[master],
    masterMenu: master,
    sortOrder: 9999,
    isEnabled: true,
    minRole: "STAFF",
    tenantId,
    featureFlag: null,
    createdAt: null,
    updatedAt: null,
  };
  return {
    items: [...directItems, browseItem],
    totalPages: all.length,
    hasMore: all.length > directItems.length,
    browsePath: CENTER_BY_MASTER[master],
  };
}

export async function getNavPayload(tenantId: number, actor: AnyActor | null | undefined, limit = 5) {
  const actorLevel = resolveActorLevel(actor);
  const masters = await Promise.all(
    MASTER_MENU_ORDER.filter((master) => {
      if (master !== "Tools") return true;
      return actorLevel >= ROLE_LEVEL.SUPERADMIN;
    }).map(async (master) => {
      const menu = await getMenuItems(master, tenantId, actor, limit);
      return {
        key: master,
        title: master,
        centerPath: CENTER_BY_MASTER[master],
        browsePath: menu.browsePath,
        totalPages: menu.totalPages,
        hasMore: menu.hasMore,
        items: menu.items,
      };
    }),
  );

  return {
    generatedAt: new Date().toISOString(),
    masters,
  };
}

export async function upsertPage(input: {
  key: string;
  title: string;
  path: string;
  masterMenu: MasterMenuKey;
  sortOrder?: number;
  isEnabled?: boolean;
  minRole?: "PUBLIC" | "USER" | "STAFF" | "ADMIN" | "SUPERADMIN";
  tenantId?: number | null;
  featureFlag?: string | null;
}) {
  const key = asString(input.key);
  const title = asString(input.title);
  const pathValue = normalizePath(input.path);
  const masterMenu = normalizeMaster(input.masterMenu);
  const sortOrder = asInt(input.sortOrder, 100);
  const isEnabled = input.isEnabled !== false;
  const minRole = normalizeRole(input.minRole || "ADMIN");
  const tenantId = input.tenantId && Number.isFinite(input.tenantId) && input.tenantId > 0 ? input.tenantId : null;
  const featureFlag = asString(input.featureFlag) || null;

  if (!key) throw new Error("key is required");
  if (!title) throw new Error("title is required");
  if (!pathValue) throw new Error("path is required");

  const result = await db.execute(sql`
    insert into pages_registry (
      key,
      title,
      path,
      master_menu,
      sort_order,
      is_enabled,
      min_role,
      tenant_id,
      feature_flag,
      updated_at
    )
    values (
      ${key},
      ${title},
      ${pathValue},
      ${masterMenu},
      ${sortOrder},
      ${isEnabled},
      ${minRole},
      ${tenantId},
      ${featureFlag},
      now()
    )
    on conflict (key)
    do update set
      title = excluded.title,
      path = excluded.path,
      master_menu = excluded.master_menu,
      sort_order = excluded.sort_order,
      is_enabled = excluded.is_enabled,
      min_role = excluded.min_role,
      tenant_id = excluded.tenant_id,
      feature_flag = excluded.feature_flag,
      updated_at = now()
    returning
      id,
      key,
      title,
      path,
      master_menu,
      sort_order,
      is_enabled,
      min_role,
      tenant_id,
      feature_flag,
      created_at,
      updated_at
  `);

  const item = rows<PageRegistryRow>(result).map(mapRow)[0];
  return item || null;
}
