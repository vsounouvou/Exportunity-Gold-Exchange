import fs from "fs/promises";
import path from "path";

export const MASTER_MENU_KEYS = [
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

export type MasterMenuKey = (typeof MASTER_MENU_KEYS)[number];
export type RouteKind = "app" | "pages" | "wouter";

export type DiscoveredRoute = {
  path: string;
  filePath: string;
  kind: RouteKind;
  masterMenu: MasterMenuKey;
  title: string;
};

const APP_PAGE_RE = /^page\.(tsx|ts|jsx|js)$/i;
const PAGE_FILE_RE = /\.(tsx|ts|jsx|js)$/i;
const IGNORED_DIR_NAMES = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  ".turbo",
  "coverage",
]);

function asString(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeSlashes(input: string) {
  return input.replace(/\\/g, "/").replace(/\/+/g, "/");
}

function normalizeRoutePath(rawPath: string) {
  const input = asString(rawPath);
  if (!input) return "/";

  const normalizedSegments = normalizeSlashes(input)
    .split("/")
    .filter(Boolean)
    .filter((segment) => {
      return !(segment.startsWith("(") && segment.endsWith(")"));
    })
    .map((segment) => {
      if (segment === "page") return "";
      const catchAllOptional = segment.match(/^\[\[\.\.\.(.+)\]\]$/);
      if (catchAllOptional) return `:${catchAllOptional[1]}*`;
      const catchAll = segment.match(/^\[\.\.\.(.+)\]$/);
      if (catchAll) return `:${catchAll[1]}*`;
      const dynamic = segment.match(/^\[(.+)\]$/);
      if (dynamic) return `:${dynamic[1]}`;
      return segment;
    })
    .filter(Boolean);

  if (normalizedSegments.length === 0) return "/";
  return `/${normalizedSegments.join("/")}`.replace(/\/+$/, "");
}

function humanizeToken(token: string) {
  return token
    .replace(/^:/, "")
    .replace(/\*$/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function singularizeToken(token: string) {
  const value = token.toLowerCase();
  if (value.endsWith("ies")) return token.slice(0, -3) + "y";
  if (value.endsWith("ses")) return token.slice(0, -2);
  if (value.endsWith("s") && !value.endsWith("ss")) return token.slice(0, -1);
  return token;
}

export function isTemplateRoutePath(routePath: string) {
  const normalized = normalizeRoutePath(routePath);
  return /\/:[^/]+/.test(normalized) || /\*$/.test(normalized);
}

export function isSystemUtilityRoutePath(routePath: string) {
  const pathValue = normalizeRoutePath(routePath).toLowerCase();
  if (!pathValue || pathValue === "/") return false;

  if (
    pathValue.includes("/return") ||
    pathValue.includes("/callback") ||
    pathValue.includes("/redirect") ||
    pathValue.includes("/debug") ||
    pathValue.includes("/test") ||
    pathValue.includes("/qa") ||
    pathValue.includes("/install") ||
    pathValue.includes("/auth") ||
    pathValue.endsWith("/login") ||
    pathValue.endsWith("/register") ||
    pathValue.includes("/application-status")
  ) {
    return true;
  }

  return false;
}

export function isMenuEligibleRoute(routePath: string) {
  const normalized = normalizeRoutePath(routePath);
  if (!normalized) return false;
  if (normalized === "/") return true;
  if (isTemplateRoutePath(normalized)) return false;
  if (isSystemUtilityRoutePath(normalized)) return false;
  return true;
}

export function humanizeRouteTitle(routePath: string) {
  const normalized = normalizeRoutePath(routePath);
  if (normalized === "/") return "Home";
  const segments = normalized.split("/").filter(Boolean);
  const last = segments.at(-1) || "page";
  const previous = segments.at(-2) || "";

  if (last.startsWith(":")) {
    const base = previous ? singularizeToken(previous) : "record";
    return `${humanizeToken(base)} Detail`;
  }

  if (last.endsWith("*")) {
    const base = previous || "route";
    return `${humanizeToken(base)} Wildcard`;
  }

  if (last === "center" && previous) {
    return `${humanizeToken(previous)} Center`;
  }

  if (last === "return" && previous) {
    return `${humanizeToken(previous)} Return`;
  }

  if (last === "callback" && previous) {
    return `${humanizeToken(previous)} Callback`;
  }

  return humanizeToken(last);
}

export function classifyMasterMenu(routePath: string): MasterMenuKey {
  const pathValue = normalizeRoutePath(routePath).toLowerCase();

  if (pathValue === "/" || pathValue === "/dashboard" || pathValue.startsWith("/home")) return "Home";

  if (
    pathValue.startsWith("/agents") ||
    pathValue.startsWith("/agents-os") ||
    pathValue.startsWith("/operations/agents") ||
    pathValue.startsWith("/admin/action-forge")
  ) {
    return "Agents";
  }

  if (
    pathValue.startsWith("/operations") ||
    pathValue.startsWith("/ai-team") ||
    pathValue.startsWith("/meetings") ||
    pathValue.startsWith("/agenda") ||
    pathValue.startsWith("/tasks") ||
    pathValue.startsWith("/actions") ||
    pathValue.startsWith("/admin/contacts") ||
    pathValue.startsWith("/contact") ||
    pathValue.startsWith("/contacts")
  ) {
    return "Operations";
  }

  if (
    pathValue.startsWith("/trade") ||
    pathValue.startsWith("/commerce") ||
    pathValue.startsWith("/marketplace") ||
    pathValue.startsWith("/sellers") ||
    pathValue.startsWith("/seller") ||
    pathValue.startsWith("/products") ||
    pathValue.startsWith("/orders") ||
    pathValue.startsWith("/logistics") ||
    pathValue.startsWith("/customers")
  ) {
    return "Trade";
  }

  if (
    pathValue.startsWith("/assets") ||
    pathValue.startsWith("/gold") ||
    pathValue.startsWith("/vault") ||
    pathValue.startsWith("/cert") ||
    pathValue.startsWith("/admin/stamped-gold") ||
    pathValue.startsWith("/admin/equipment-ops")
  ) {
    return "Assets";
  }

  if (pathValue.startsWith("/territor")) return "Territories";
  if (pathValue.startsWith("/finance") || pathValue.startsWith("/billing") || pathValue.startsWith("/wallet")) {
    return "Finance";
  }
  if (pathValue.startsWith("/settings") || pathValue.startsWith("/admin/settings")) return "Settings";
  if (pathValue.startsWith("/admin") || pathValue.startsWith("/system")) return "Settings";

  return "Tools";
}

function toRelativeFilePath(absoluteFilePath: string, baseDir: string) {
  const relative = normalizeSlashes(path.relative(baseDir, absoluteFilePath));
  return relative || normalizeSlashes(absoluteFilePath);
}

async function existsPath(targetPath: string) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function walkFiles(rootDir: string, predicate: (absoluteFilePath: string, fileName: string) => boolean) {
  const discovered: string[] = [];

  async function walk(currentDir: string): Promise<void> {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (IGNORED_DIR_NAMES.has(entry.name)) continue;
        await walk(path.join(currentDir, entry.name));
        continue;
      }
      if (!entry.isFile()) continue;

      const absoluteFilePath = path.join(currentDir, entry.name);
      if (!predicate(absoluteFilePath, entry.name)) continue;
      discovered.push(absoluteFilePath);
    }
  }

  await walk(rootDir);
  return discovered;
}

function deriveAppRoutePath(appRoot: string, pageFilePath: string) {
  const relativeDir = normalizeSlashes(path.relative(appRoot, path.dirname(pageFilePath)));
  const segments = relativeDir.split("/").filter(Boolean);
  if (segments[0] === "api") return null;
  return normalizeRoutePath(`/${segments.join("/")}`);
}

function derivePagesRoutePath(pagesRoot: string, pageFilePath: string) {
  const relativeFile = normalizeSlashes(path.relative(pagesRoot, pageFilePath));
  const parsed = path.parse(relativeFile);
  const normalizedPath = normalizeSlashes(path.join(parsed.dir, parsed.name));
  const segments = normalizedPath.split("/").filter(Boolean);

  if (!segments.length) return "/";
  if (segments[0] === "api") return null;
  if (["_app", "_document", "_error"].includes(segments.at(-1) || "")) return null;
  if ((segments.at(-1) || "").toLowerCase() === "index") segments.pop();

  return normalizeRoutePath(`/${segments.join("/")}`);
}

export async function discoverAppRouterRoutes(baseDir = process.cwd()): Promise<DiscoveredRoute[]> {
  const roots = ["app", "src/app", "client/app"].map((candidate) => path.join(baseDir, candidate));

  const output: DiscoveredRoute[] = [];
  for (const root of roots) {
    // eslint-disable-next-line no-await-in-loop
    if (!(await existsPath(root))) continue;
    // eslint-disable-next-line no-await-in-loop
    const files = await walkFiles(root, (_absoluteFilePath, fileName) => APP_PAGE_RE.test(fileName));
    for (const filePath of files) {
      const routePath = deriveAppRoutePath(root, filePath);
      if (!routePath) continue;
      output.push({
        path: routePath,
        filePath: toRelativeFilePath(filePath, baseDir),
        kind: "app",
        masterMenu: classifyMasterMenu(routePath),
        title: humanizeRouteTitle(routePath),
      });
    }
  }
  return output;
}

export async function discoverPagesRouterRoutes(baseDir = process.cwd()): Promise<DiscoveredRoute[]> {
  const roots = ["pages"].map((candidate) => path.join(baseDir, candidate));
  const output: DiscoveredRoute[] = [];

  for (const root of roots) {
    // eslint-disable-next-line no-await-in-loop
    if (!(await existsPath(root))) continue;
    // eslint-disable-next-line no-await-in-loop
    const files = await walkFiles(root, (_absoluteFilePath, fileName) => PAGE_FILE_RE.test(fileName));
    for (const filePath of files) {
      const routePath = derivePagesRoutePath(root, filePath);
      if (!routePath) continue;
      output.push({
        path: routePath,
        filePath: toRelativeFilePath(filePath, baseDir),
        kind: "pages",
        masterMenu: classifyMasterMenu(routePath),
        title: humanizeRouteTitle(routePath),
      });
    }
  }

  return output;
}

export async function discoverWouterRoutes(baseDir = process.cwd()): Promise<DiscoveredRoute[]> {
  const candidates = ["client/src/App.tsx", "src/App.tsx"].map((candidate) => path.join(baseDir, candidate));
  const output: DiscoveredRoute[] = [];

  for (const candidate of candidates) {
    // eslint-disable-next-line no-await-in-loop
    if (!(await existsPath(candidate))) continue;
    // eslint-disable-next-line no-await-in-loop
    const source = await fs.readFile(candidate, "utf8");
    const routeRegex = /<Route\s+path="([^"]+)"/g;
    let match: RegExpExecArray | null = null;
    while ((match = routeRegex.exec(source)) !== null) {
      const routePath = normalizeRoutePath(match[1] || "");
      if (!routePath) continue;
      output.push({
        path: routePath,
        filePath: toRelativeFilePath(candidate, baseDir),
        kind: "wouter",
        masterMenu: classifyMasterMenu(routePath),
        title: humanizeRouteTitle(routePath),
      });
    }
  }

  return output;
}

export async function discoverRoutes(baseDir = process.cwd()): Promise<DiscoveredRoute[]> {
  const [appRoutes, pagesRoutes, wouterRoutes] = await Promise.all([
    discoverAppRouterRoutes(baseDir),
    discoverPagesRouterRoutes(baseDir),
    discoverWouterRoutes(baseDir),
  ]);

  const combined = [...wouterRoutes, ...appRoutes, ...pagesRoutes];
  const kindPriority: Record<RouteKind, number> = { wouter: 0, app: 1, pages: 2 };

  const byPath = new Map<string, DiscoveredRoute>();
  for (const route of combined) {
    const pathValue = normalizeRoutePath(route.path);
    if (!pathValue) continue;
    const current = byPath.get(pathValue);
    if (!current) {
      byPath.set(pathValue, { ...route, path: pathValue });
      continue;
    }
    if (kindPriority[route.kind] < kindPriority[current.kind]) {
      byPath.set(pathValue, { ...route, path: pathValue });
    }
  }

  return Array.from(byPath.values()).sort((left, right) => left.path.localeCompare(right.path));
}

export function toRouteRegistryKey(routePath: string) {
  const normalized = normalizeRoutePath(routePath);
  const seed = normalized
    .replace(/^\/+/, "")
    .replace(/[:*]/g, "")
    .replace(/[^a-zA-Z0-9/]+/g, "-")
    .replace(/\/+/g, ".")
    .replace(/\.+/g, ".")
    .replace(/^\.|\.$/g, "")
    .toLowerCase();
  return `route.${seed || "root"}`;
}
