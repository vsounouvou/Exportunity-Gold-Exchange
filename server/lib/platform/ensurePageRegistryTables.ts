import fs from "fs";
import path from "path";

import { db } from "@db";
import { sql } from "drizzle-orm";

type LegacyNavItem = {
  route?: string;
  module?: string;
  pageTitle?: string;
  navEntryName?: string | null;
  capabilityTag?: string;
  visibleInNav?: boolean;
  redirectTo?: string;
};

const MASTER_ORDER = [
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

const CENTER_PAGES = [
  { key: "home.center", title: "Home Center", path: "/home/center", master: "Home", sort: 0 },
  { key: "agents.center", title: "Agents Center", path: "/agents/center", master: "Agents", sort: 0 },
  { key: "operations.center", title: "Operations Center", path: "/operations/center", master: "Operations", sort: 0 },
  { key: "trade.center", title: "Trade Center", path: "/trade/center", master: "Trade", sort: 0 },
  { key: "assets.center", title: "Assets Center", path: "/assets/center", master: "Assets", sort: 0 },
  { key: "territories.center", title: "Territories Center", path: "/territories/center", master: "Territories", sort: 0 },
  { key: "finance.center", title: "Finance Center", path: "/finance/center", master: "Finance", sort: 0 },
  { key: "settings.center", title: "Settings Center", path: "/settings/center", master: "Settings", sort: 0 },
  { key: "tools.center", title: "Tools Center", path: "/tools/center", master: "Tools", sort: 0 },
] as const;

function asString(value: unknown) {
  return String(value ?? "").trim();
}

function normalizePath(input: string) {
  const raw = asString(input);
  if (!raw || /^https?:\/\//i.test(raw)) return "";
  if (raw === "/") return raw;
  return raw.startsWith("/") ? raw.replace(/\/+$/, "") : `/${raw.replace(/\/+$/, "")}`;
}

function toKeySeed(pathValue: string, fallback: string) {
  const byPath = pathValue
    .replace(/^\/+/, "")
    .replace(/[:*]/g, "")
    .replace(/[^a-zA-Z0-9/]+/g, "-")
    .replace(/\/+/g, ".")
    .replace(/\.+/g, ".")
    .replace(/^\.|\.$/g, "")
    .toLowerCase();
  const byFallback = asString(fallback)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return byPath ? `nav.${byPath}` : `nav.${byFallback || "unknown"}`;
}

function titleFromPath(pathValue: string) {
  const normalized = normalizePath(pathValue);
  if (!normalized || normalized === "/") return "Untitled Page";
  const token = normalized.split("/").filter(Boolean).at(-1) || "page";
  return token
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function resolveMasterFromPath(pathValue: string, moduleName?: string) {
  const route = normalizePath(pathValue).toLowerCase();
  const module = asString(moduleName).toLowerCase();

  if (
    route.startsWith("/agents-os") ||
    route.startsWith("/operations/agents") ||
    route.startsWith("/commerce/ai-marketplace/agents") ||
    route.startsWith("/admin/action-forge")
  ) {
    return "Agents";
  }

  if (
    route.startsWith("/ai-team") ||
    route.startsWith("/agenda") ||
    route.startsWith("/tasks") ||
    route.startsWith("/actions") ||
    route.startsWith("/admin/inbox") ||
    route.startsWith("/mail") ||
    route.startsWith("/notifications")
  ) {
    return "Operations";
  }

  if (
    route.startsWith("/admin/stamped-gold") ||
    route.startsWith("/gold-stamping") ||
    route.startsWith("/admin/equipment-ops") ||
    route.startsWith("/admin/media/assets") ||
    route.startsWith("/admin/assets/images")
  ) {
    return "Assets";
  }

  if (
    route.startsWith("/admin/marketplace") ||
    route.startsWith("/marketplace") ||
    route.startsWith("/seller") ||
    route.startsWith("/bureaus") ||
    route.startsWith("/contracts") ||
    route.startsWith("/delivery")
  ) {
    return "Trade";
  }

  if (route.startsWith("/territories") || route.startsWith("/admin/territories")) {
    return "Territories";
  }

  if (route.startsWith("/finance") || route.startsWith("/admin/wallet")) {
    return "Finance";
  }

  if (route.startsWith("/admin/system") || route.startsWith("/admin/settings") || route.startsWith("/admin/email")) {
    return "Settings";
  }

  if (route.startsWith("/home") || route === "/dashboard") {
    return "Home";
  }

  if (module.includes("finance")) return "Finance";
  if (module.includes("territor")) return "Territories";
  if (module.includes("operation")) return "Operations";
  if (module.includes("agent")) return "Agents";
  if (module.includes("trade") || module.includes("marketplace")) return "Trade";
  if (module.includes("asset")) return "Assets";
  if (module.includes("setting") || module.includes("admin")) return "Settings";

  return "Tools";
}

function readLegacyNavRegistry() {
  const registryPath = path.join(process.cwd(), "client", "src", "lib", "adminNavRegistry.json");
  if (!fs.existsSync(registryPath)) return [] as LegacyNavItem[];

  try {
    const payload = JSON.parse(fs.readFileSync(registryPath, "utf8")) as { items?: LegacyNavItem[] };
    return Array.isArray(payload?.items) ? payload.items : [];
  } catch {
    return [] as LegacyNavItem[];
  }
}

export async function ensurePageRegistryTables() {
  await db.execute(sql`create extension if not exists pgcrypto;`);
  await db.execute(sql`
    create table if not exists pages_registry (
      id uuid primary key default gen_random_uuid(),
      key text not null unique,
      title text not null,
      path text not null,
      master_menu text not null,
      sort_order int not null default 100,
      is_enabled bool not null default true,
      min_role text not null default 'ADMIN',
      tenant_id int references tenants(id) on delete cascade,
      feature_flag text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `);

  await db.execute(sql`
    do $$
    begin
      begin
        alter table pages_registry
        add constraint pages_registry_master_menu_check
        check (
          master_menu in ('Home', 'Agents', 'Operations', 'Trade', 'Assets', 'Territories', 'Finance', 'Settings', 'Tools')
        );
      exception
        when duplicate_object then null;
      end;
    end $$;
  `);

  await db.execute(sql`
    do $$
    begin
      begin
        alter table pages_registry
        add constraint pages_registry_min_role_check
        check (
          upper(min_role) in ('PUBLIC', 'USER', 'STAFF', 'ADMIN', 'SUPERADMIN')
        );
      exception
        when duplicate_object then null;
      end;
    end $$;
  `);

  await db.execute(sql`
    create index if not exists pages_registry_master_sort_idx
      on pages_registry (master_menu, sort_order, title);
  `);

  await db.execute(sql`
    create index if not exists pages_registry_tenant_idx
      on pages_registry (tenant_id, master_menu, sort_order);
  `);

  await db.execute(sql`
    create table if not exists discovered_routes_cache (
      id uuid primary key default gen_random_uuid(),
      path text not null unique,
      file_path text,
      route_kind text not null default 'unknown',
      master_menu text not null,
      title text not null,
      is_active bool not null default true,
      discovered_at timestamptz not null default now()
    );
  `);

  await db.execute(sql`
    create index if not exists discovered_routes_cache_master_idx
      on discovered_routes_cache (master_menu, is_active, path);
  `);

  await db.execute(sql`
    insert into pages_registry (key, title, path, master_menu, sort_order, is_enabled, min_role, tenant_id, feature_flag, updated_at)
    values
      ${sql.join(
        CENTER_PAGES.map((item) => {
          return sql`(${item.key}, ${item.title}, ${item.path}, ${item.master}, ${item.sort}, true, 'ADMIN', null, null, now())`;
        }),
        sql`, `,
      )}
    on conflict (key) do update
      set
        title = excluded.title,
        path = excluded.path,
        master_menu = excluded.master_menu,
        sort_order = excluded.sort_order,
        updated_at = now();
  `);

  const legacyItems = readLegacyNavRegistry()
    .filter((item) => item && item.visibleInNav !== false)
    .map((item, index) => {
      const routeCandidate = normalizePath(asString(item.redirectTo) || asString(item.route));
      if (!routeCandidate) return null;

      const title = asString(item.navEntryName) || asString(item.pageTitle) || titleFromPath(routeCandidate);
      const key = toKeySeed(routeCandidate, asString(item.capabilityTag) || title);
      const master = resolveMasterFromPath(routeCandidate, asString(item.module));
      const moduleRank = MASTER_ORDER.indexOf(master as (typeof MASTER_ORDER)[number]);
      const sortOrder = moduleRank >= 0 ? moduleRank * 1000 + index + 10 : 9000 + index;

      return {
        key,
        title,
        path: routeCandidate,
        master,
        sortOrder,
      };
    })
    .filter(Boolean) as Array<{ key: string; title: string; path: string; master: string; sortOrder: number }>;

  for (const item of legacyItems) {
    await db.execute(sql`
      insert into pages_registry (key, title, path, master_menu, sort_order, is_enabled, min_role, tenant_id, feature_flag, updated_at)
      values (${item.key}, ${item.title}, ${item.path}, ${item.master}, ${item.sortOrder}, true, 'ADMIN', null, null, now())
      on conflict (key) do nothing;
    `);
  }
}
