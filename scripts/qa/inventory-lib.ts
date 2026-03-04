import fs from "fs";
import path from "path";
import { ROUTE_META, type RouteMeta } from "../../client/src/lib/routeMeta";

export type RouteEntry = {
  path: string;
  component?: string;
  label?: string;
  authRequired: boolean;
  redirectTo?: string;
  featureFlag?: string;
  hiddenFromMenu?: boolean;
  hiddenReason?: string;
  sourceFile: string;
};

export type MenuEntry = {
  source: string;
  section: string;
  label: string;
  route: string;
  requiredRole?: string;
  tenant?: string;
  visible: boolean;
};

const APP_PATH = path.join(process.cwd(), "client", "src", "App.tsx");
const ADMIN_LAYOUT_PATH = path.join(process.cwd(), "client", "src", "components", "AdminLayout.tsx");
const ADMIN_NAV_REGISTRY_PATH = path.join(process.cwd(), "client", "src", "lib", "adminNavRegistry.json");
const NAV_BAR_PATH = path.join(process.cwd(), "client", "src", "components", "NavigationBar.tsx");
const MAIN_NAV_PATH = path.join(process.cwd(), "client", "src", "components", "MainNavigation.tsx");

const IGNORE_COMPONENTS = new Set([
  "Route",
  "ProtectedRoute",
  "Redirect",
  "Switch",
  "AdminLayout",
  "Fragment",
]);

export function normalizePath(raw: string) {
  if (!raw) return raw;
  if (raw === "/") return "/";
  return raw.replace(/\/+$/, "");
}

function buildRouteMetaMap(metaList: RouteMeta[]) {
  const map = new Map<string, RouteMeta>();
  for (const meta of metaList) {
    if (!meta?.path) continue;
    map.set(normalizePath(meta.path), meta);
  }
  return map;
}

function pickComponentFromBlock(block: string) {
  const componentAttr = block.match(/component=\{([A-Za-z0-9_]+)\}/);
  if (componentAttr?.[1]) return componentAttr[1];

  const jsxMatches = block.match(/<([A-Z][A-Za-z0-9_]*)\b/g) || [];
  for (const match of jsxMatches) {
    const name = match.replace(/[<\s]/g, "");
    if (!IGNORE_COMPONENTS.has(name)) {
      return name;
    }
  }
  return undefined;
}

export function buildPageInventory() {
  const content = fs.readFileSync(APP_PATH, "utf8");
  const routeMetaMap = buildRouteMetaMap(ROUTE_META);
  const routes: RouteEntry[] = [];

  const routeRegex = /<Route\b[^>]*\bpath=(["'])(.*?)\1[^>]*>/g;
  let match: RegExpExecArray | null;
  while ((match = routeRegex.exec(content)) !== null) {
    const rawPath = match[2];
    const normalizedPath = normalizePath(rawPath);
    const tag = match[0];
    const tagEnd = match.index + tag.length;
    const isSelfClosing = tag.trim().endsWith("/>") || tag.includes("/>");

    let block = "";
    if (!isSelfClosing) {
      const closeIndex = content.indexOf("</Route>", tagEnd);
      if (closeIndex !== -1) {
        block = content.slice(tagEnd, closeIndex);
      }
    }

    const authRequired = block.includes("<ProtectedRoute");
    const redirectMatch = block.match(/<Redirect\s+to=(["'])(.*?)\1/);
    const redirectTo = redirectMatch?.[2];
    const component = pickComponentFromBlock(tag + block);
    const meta = routeMetaMap.get(normalizedPath);

    routes.push({
      path: normalizedPath,
      component,
      label: meta?.label,
      authRequired,
      redirectTo,
      featureFlag: meta?.featureFlag,
      hiddenFromMenu: meta?.hiddenFromMenu,
      hiddenReason: meta?.reason,
      sourceFile: "client/src/App.tsx",
    });
  }

  return routes;
}

function parseSectionedMenu(content: string, sourceLabel: string, requiredRole?: string) {
  const items: MenuEntry[] = [];
  const sectionRegex = /{\s*label:\s*"([^"]+)"[\s\S]*?items:\s*\[([\s\S]*?)\]\s*}/g;
  let sectionMatch: RegExpExecArray | null;
  while ((sectionMatch = sectionRegex.exec(content)) !== null) {
    const sectionLabel = sectionMatch[1];
    const itemsBlock = sectionMatch[2];
    const itemRegex = /{[^}]*?href:\s*"([^"]+)"[^}]*?(label|name):\s*"([^"]+)"[^}]*?}/g;
    let itemMatch: RegExpExecArray | null;
    while ((itemMatch = itemRegex.exec(itemsBlock)) !== null) {
      items.push({
        source: sourceLabel,
        section: sectionLabel,
        label: itemMatch[3],
        route: normalizePath(itemMatch[1]),
        requiredRole,
        visible: true,
      });
    }
  }
  return items;
}

function parseFlatMenu(content: string, sourceLabel: string, requiredRole?: string) {
  const items: MenuEntry[] = [];
  const listMatch = content.match(/const\s+menuItems\s*=\s*\[([\s\S]*?)\]\s*;/m);
  if (!listMatch?.[1]) return items;
  const itemsBlock = listMatch[1];
  const itemRegex = /{[^}]*?href:\s*"([^"]+)"[^}]*?(label|name):\s*"([^"]+)"[^}]*?}/g;
  let itemMatch: RegExpExecArray | null;
  while ((itemMatch = itemRegex.exec(itemsBlock)) !== null) {
    items.push({
      source: sourceLabel,
      section: sourceLabel,
      label: itemMatch[3],
      route: normalizePath(itemMatch[1]),
      requiredRole,
      visible: true,
    });
  }
  return items;
}

export function buildMenuInventory() {
  const adminLayout = fs.existsSync(ADMIN_LAYOUT_PATH) ? fs.readFileSync(ADMIN_LAYOUT_PATH, "utf8") : "";
  const navBar = fs.existsSync(NAV_BAR_PATH) ? fs.readFileSync(NAV_BAR_PATH, "utf8") : "";
  const mainNav = fs.existsSync(MAIN_NAV_PATH) ? fs.readFileSync(MAIN_NAV_PATH, "utf8") : "";

  const adminItems: MenuEntry[] = [];
  if (fs.existsSync(ADMIN_NAV_REGISTRY_PATH)) {
    try {
      const raw = JSON.parse(fs.readFileSync(ADMIN_NAV_REGISTRY_PATH, "utf8")) as any;
      const items = Array.isArray(raw?.items) ? raw.items : [];
      for (const item of items) {
        if (!item || item.visibleInNav !== true) continue;
        if (typeof item.route !== "string" || !item.route) continue;
        adminItems.push({
          source: "adminNavRegistry",
          section: String(item.module || "Admin"),
          label: String(item.navEntryName || item.pageTitle || item.route),
          route: normalizePath(item.route),
          requiredRole: "authenticated",
          visible: true,
        });
      }
    } catch {
      // fall back to parsing AdminLayout when registry is invalid
    }
  }
  if (!adminItems.length && adminLayout) {
    adminItems.push(...parseSectionedMenu(adminLayout, "AdminLayout", "authenticated"));
  }
  const navItems = navBar ? parseFlatMenu(navBar, "NavigationBar", "authenticated") : [];
  const mainNavItems = mainNav ? parseFlatMenu(mainNav, "MainNavigation", "authenticated") : [];

  return [...adminItems, ...navItems, ...mainNavItems];
}

export function applyMenuLabels(routes: RouteEntry[], menuItems: MenuEntry[]) {
  const byRoute = new Map<string, string>();
  for (const item of menuItems) {
    if (!item.route) continue;
    if (!byRoute.has(item.route)) {
      byRoute.set(item.route, item.label);
    }
  }
  return routes.map((route) => {
    if (!route.label) {
      const label = byRoute.get(route.path);
      if (label) {
        return { ...route, label };
      }
    }
    return route;
  });
}

export function writePageInventory(routes: RouteEntry[], outputDir: string) {
  fs.mkdirSync(outputDir, { recursive: true });
  const jsonPath = path.join(outputDir, "page-inventory.json");
  const mdPath = path.join(outputDir, "page-inventory.md");
  const payload = {
    generatedAt: new Date().toISOString(),
    source: "client/src/App.tsx",
    routes,
  };
  fs.writeFileSync(jsonPath, JSON.stringify(payload, null, 2));

  const escapeCell = (value: string | undefined) =>
    (value ?? "").replace(/\|/g, "\\|");

  const lines: string[] = [];
  lines.push("# Page Inventory");
  lines.push("");
  lines.push(`Generated: ${payload.generatedAt}`);
  lines.push("");
  lines.push("| Path | Label | Auth Required | Hidden | Reason | Component | Redirect | Feature Flag |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const route of routes) {
    lines.push(
      `| ${escapeCell(route.path)} | ${escapeCell(route.label || route.component || "")} | ${route.authRequired ? "yes" : "no"} | ${route.hiddenFromMenu ? "yes" : "no"} | ${escapeCell(route.hiddenReason)} | ${escapeCell(route.component)} | ${escapeCell(route.redirectTo)} | ${escapeCell(route.featureFlag)} |`
    );
  }
  fs.writeFileSync(mdPath, lines.join("\n"));
}

export function writeMenuInventory(items: MenuEntry[], outputDir: string) {
  fs.mkdirSync(outputDir, { recursive: true });
  const jsonPath = path.join(outputDir, "menu-inventory.json");
  const payload = {
    generatedAt: new Date().toISOString(),
    items,
  };
  fs.writeFileSync(jsonPath, JSON.stringify(payload, null, 2));
}
