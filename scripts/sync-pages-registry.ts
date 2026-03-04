import { db } from "@db";
import { sql } from "drizzle-orm";

import { ensurePageRegistryTables } from "../server/lib/platform/ensurePageRegistryTables";
import {
  classifyMasterMenu,
  discoverRoutes,
  humanizeRouteTitle,
  toRouteRegistryKey,
  type DiscoveredRoute,
} from "../server/lib/platform/routeDiscovery";

type RegistryRow = {
  key: string;
  path: string;
  title: string;
  master_menu: string;
  sort_order: number | string | null;
  is_enabled: boolean | string | number | null;
  tenant_id: number | string | null;
};

type CacheRow = {
  path: string;
};

function rows<T = any>(result: any): T[] {
  if (Array.isArray(result?.rows)) return result.rows as T[];
  if (Array.isArray(result)) return result as T[];
  return [];
}

function asString(value: unknown) {
  return String(value ?? "").trim();
}

function normalizePath(input: string) {
  const raw = asString(input);
  if (!raw) return "/";
  if (raw === "/") return "/";
  const withSlash = raw.startsWith("/") ? raw : `/${raw}`;
  return withSlash.replace(/\/+$/, "");
}

function isGenericTitle(value: string) {
  const normalized = asString(value).toLowerCase();
  return (
    !normalized ||
    normalized === "id" ||
    normalized === "slug" ||
    normalized === "tab" ||
    normalized === "role" ||
    normalized === "rest" ||
    normalized === "section" ||
    normalized === "roomkey" ||
    normalized === "contractid" ||
    normalized === "agentid" ||
    normalized === "return"
  );
}

async function readRegistryRows() {
  const result = await db.execute(sql`
    select key, path, title, master_menu, sort_order, is_enabled, tenant_id
    from pages_registry
    where tenant_id is null
    order by sort_order asc, title asc
  `);
  return rows<RegistryRow>(result).map((row) => ({
    key: asString(row.key),
    path: normalizePath(asString(row.path)),
    title: asString(row.title),
    masterMenu: asString(row.master_menu),
    sortOrder: Number.parseInt(asString(row.sort_order), 10) || 100,
    isEnabled:
      row.is_enabled === true ||
      asString(row.is_enabled).toLowerCase() === "true" ||
      asString(row.is_enabled) === "1",
  }));
}

async function readCacheRows() {
  const result = await db.execute(sql`
    select path
    from discovered_routes_cache
    where is_active = true
    order by path asc
  `);
  return rows<CacheRow>(result).map((row) => normalizePath(asString(row.path)));
}

async function syncCache(discovered: DiscoveredRoute[]) {
  const discoveredPaths = new Set(discovered.map((item) => normalizePath(item.path)));
  const cachedPaths = new Set(await readCacheRows());

  for (const route of discovered) {
    const pathValue = normalizePath(route.path);
    await db.execute(sql`
      insert into discovered_routes_cache (
        path,
        file_path,
        route_kind,
        master_menu,
        title,
        is_active,
        discovered_at
      )
      values (
        ${pathValue},
        ${route.filePath},
        ${route.kind},
        ${route.masterMenu},
        ${route.title || humanizeRouteTitle(pathValue)},
        true,
        now()
      )
      on conflict (path)
      do update set
        file_path = excluded.file_path,
        route_kind = excluded.route_kind,
        master_menu = excluded.master_menu,
        title = excluded.title,
        is_active = true,
        discovered_at = now();
    `);
  }

  const toDeactivate = Array.from(cachedPaths.values()).filter((pathValue) => !discoveredPaths.has(pathValue));
  if (toDeactivate.length > 0) {
    for (const pathValue of toDeactivate) {
      // eslint-disable-next-line no-await-in-loop
      await db.execute(sql`
        update discovered_routes_cache
        set is_active = false, discovered_at = now()
        where path = ${pathValue}
      `);
    }
  }

  return {
    upserted: discovered.length,
    deactivated: toDeactivate.length,
  };
}

async function main() {
  await ensurePageRegistryTables();

  const discovered = await discoverRoutes(process.cwd());
  const discoveredByPath = new Map<string, DiscoveredRoute>();
  for (const route of discovered) {
    discoveredByPath.set(normalizePath(route.path), route);
  }

  const registryRows = await readRegistryRows();
  const registryByPath = new Map<string, (typeof registryRows)[number]>();
  for (const row of registryRows) {
    registryByPath.set(normalizePath(row.path), row);
  }

  const inserted: string[] = [];
  const updated: string[] = [];
  const disabled: string[] = [];

  for (const [pathValue, route] of discoveredByPath.entries()) {
    const existing = registryByPath.get(pathValue);
    const discoveredTitle = route.title || humanizeRouteTitle(pathValue);
    const masterMenu = classifyMasterMenu(pathValue);
    // Source of truth is discovered routes in code. Keep them enabled by default,
    // and let menu eligibility logic decide what appears in compact dropdown menus.
    const desiredEnabled = true;

    if (!existing) {
      const key = toRouteRegistryKey(pathValue);
      await db.execute(sql`
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
          ${discoveredTitle},
          ${pathValue},
          ${masterMenu},
          100,
          ${desiredEnabled},
          'ADMIN',
          null,
          null,
          now()
        )
        on conflict (key)
        do update set
          title = excluded.title,
          path = excluded.path,
          master_menu = excluded.master_menu,
          is_enabled = excluded.is_enabled,
          updated_at = now();
      `);
      inserted.push(pathValue);
      continue;
    }

    const allowTitleUpdate = existing.key.startsWith("route.") || isGenericTitle(existing.title);
    const desiredTitle = allowTitleUpdate ? discoveredTitle : existing.title;

    if (
      existing.title !== desiredTitle ||
      existing.masterMenu !== masterMenu ||
      existing.isEnabled !== desiredEnabled
    ) {
      await db.execute(sql`
        update pages_registry
        set
          title = ${desiredTitle},
          master_menu = ${masterMenu},
          is_enabled = ${desiredEnabled},
          updated_at = now()
        where path = ${pathValue} and tenant_id is null
      `);
      updated.push(pathValue);
    }
  }

  for (const row of registryRows) {
    const pathValue = normalizePath(row.path);
    if (discoveredByPath.has(pathValue)) continue;
    if (!row.isEnabled) continue;
    await db.execute(sql`
      update pages_registry
      set is_enabled = false, updated_at = now()
      where path = ${pathValue} and tenant_id is null
    `);
    disabled.push(pathValue);
  }

  const cacheStats = await syncCache(discovered);

  const report = {
    discoveredRoutes: discovered.length,
    registryRows: registryRows.length,
    inserted: inserted.length,
    updated: updated.length,
    disabled: disabled.length,
    cache: cacheStats,
    samples: {
      inserted: inserted.slice(0, 20),
      updated: updated.slice(0, 20),
      disabled: disabled.slice(0, 20),
    },
  };

  console.log("[sync-pages-registry]", JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error("[sync-pages-registry] failed:", error?.message || error);
  process.exitCode = 1;
});
