import { db } from "@db";
import { sql } from "drizzle-orm";
import { ensurePageRegistryTables } from "../server/lib/platform/ensurePageRegistryTables";
import {
  classifyMasterMenu,
  discoverRoutes,
  humanizeRouteTitle,
  isMenuEligibleRoute,
  toRouteRegistryKey,
} from "../server/lib/platform/routeDiscovery";

type RegistryRow = {
  key: string;
  path: string;
  is_enabled: boolean | string | number | null;
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
  const prefixed = raw.startsWith("/") ? raw : `/${raw}`;
  return prefixed.replace(/\/+$/, "");
}

async function readRegistryRows() {
  const result = await db.execute(sql`
    select key, path, is_enabled
    from pages_registry
    order by key asc
  `);
  return rows<RegistryRow>(result).map((row) => ({
    key: asString(row.key),
    path: normalizePath(row.path),
    isEnabled: row.is_enabled === true || asString(row.is_enabled).toLowerCase() === "true" || asString(row.is_enabled) === "1",
  }));
}

async function main() {
  await ensurePageRegistryTables();
  const discoveredRoutes = await discoverRoutes(process.cwd());
  const declaredRoutes = discoveredRoutes.map((item) => normalizePath(item.path));
  const registryRows = await readRegistryRows();

  const declaredSet = new Set(declaredRoutes);
  const registryPathSet = new Set(registryRows.map((row) => row.path).filter(Boolean));

  const missingInRegistry = declaredRoutes.filter((routePath) => !registryPathSet.has(routePath));
  const brokenRegistryRoutes = registryRows.filter((row) => row.path && !declaredSet.has(row.path));

  for (const routePath of missingInRegistry) {
    const key = toRouteRegistryKey(routePath);
    const masterMenu = classifyMasterMenu(routePath);
    const isEnabled = routePath.endsWith("/center") || isMenuEligibleRoute(routePath);
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
        ${humanizeRouteTitle(routePath)},
        ${routePath},
        ${masterMenu},
        100,
        ${isEnabled},
        'ADMIN',
        null,
        null,
        now()
      )
      on conflict (key) do update set
        title = excluded.title,
        path = excluded.path,
        master_menu = excluded.master_menu,
        is_enabled = excluded.is_enabled,
        updated_at = now()
    `);
  }

  for (const row of brokenRegistryRoutes) {
    await db.execute(sql`
      update pages_registry
      set is_enabled = false, updated_at = now()
      where key = ${row.key}
    `);
  }

  const report = {
    declaredRouteCount: declaredRoutes.length,
    registryRouteCount: registryRows.length,
    missingInRegistry: missingInRegistry.length,
    brokenRegistryRoutes: brokenRegistryRoutes.length,
    inserted: missingInRegistry.slice(0, 20),
    disabledBroken: brokenRegistryRoutes.slice(0, 20).map((row) => row.path),
  };

  console.log("[registry-drift-check]", JSON.stringify(report, null, 2));

  if (String(process.env.NODE_ENV || "").toLowerCase() === "production" && brokenRegistryRoutes.length > 0) {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error("[registry-drift-check] failed:", error?.message || error);
  process.exitCode = 1;
});
