import fs from "fs";
import path from "path";
import { Router } from "express";
import { ensureTenantAdmin } from "./utils/auth";

type InventoryError = { scope: "routes" | "menu" | "registry"; message: string };

type AdminUxAuditPayload = {
  ok: boolean;
  generatedAt: string;
  tenantKey: string | null;
  errors: InventoryError[];
  routes: any[];
  menuItems: any[];
  stats: {
    routeCount: number;
    menuCount: number;
    missingMenuRoutes: number;
    uncoveredRoutes: number;
  };
  missingMenuLinks: any[];
  uncoveredRoutes: any[];
  registryUpdatedAt: string | null;
};

function normalizePath(raw: string) {
  if (!raw) return raw;
  if (raw === "/") return "/";
  return raw.replace(/\/+$/, "");
}

function readAdminNavRegistry() {
  const registryPath = path.join(process.cwd(), "client", "src", "lib", "adminNavRegistry.json");
  const raw = fs.readFileSync(registryPath, "utf8");
  const stat = fs.statSync(registryPath);
  const payload = JSON.parse(raw) as any;
  return {
    payload,
    updatedAt: Number.isFinite(stat.mtimeMs) ? new Date(stat.mtimeMs).toISOString() : null,
  };
}

const router = Router();

router.use(ensureTenantAdmin);

router.get("/", async (req, res) => {
  const tenantKey = String((req as any)?.tenant?.key || "").trim() || null;
  const errors: InventoryError[] = [];

  let routes: any[] = [];
  let menuItems: any[] = [];

  try {
    const { applyMenuLabels, buildMenuInventory, buildPageInventory } = await import("../../scripts/qa/inventory-lib");
    menuItems = buildMenuInventory();
    const rawRoutes = buildPageInventory();
    routes = applyMenuLabels(rawRoutes, menuItems);
  } catch (err: any) {
    errors.push({ scope: "routes", message: err?.message || "Failed to build route inventory" });
  }

  let registryUpdatedAt: string | null = null;
  try {
    const registry = readAdminNavRegistry();
    registryUpdatedAt = registry.updatedAt;
  } catch (err: any) {
    errors.push({ scope: "registry", message: err?.message || "Failed to read admin nav registry" });
  }

  const routeSet = new Set(routes.map((r) => normalizePath(String(r?.path || ""))).filter(Boolean));
  const visibleMenuItems = menuItems.filter((m) => (m?.visible ?? true) !== false);

  const missingMenuLinks = visibleMenuItems.filter((item) => {
    const route = normalizePath(String(item?.route || ""));
    if (!route) return true;
    if (routeSet.has(route)) return false;
    // allow "/territories/:id" to satisfy "/territories/123"
    const maybeParam = route.replace(/:[^/]+/g, ":id");
    if (routeSet.has(maybeParam)) return false;
    return true;
  });

  const uncoveredRoutes = routes.filter((r) => {
    if (r?.hiddenFromMenu) return false;
    const pathValue = normalizePath(String(r?.path || ""));
    if (!pathValue) return false;
    return !visibleMenuItems.some((m) => normalizePath(String(m?.route || "")) === pathValue);
  });

  const payload: AdminUxAuditPayload = {
    ok: true,
    generatedAt: new Date().toISOString(),
    tenantKey,
    errors,
    routes,
    menuItems,
    stats: {
      routeCount: routes.length,
      menuCount: visibleMenuItems.length,
      missingMenuRoutes: missingMenuLinks.length,
      uncoveredRoutes: uncoveredRoutes.length,
    },
    missingMenuLinks,
    uncoveredRoutes,
    registryUpdatedAt,
  };

  res.setHeader("Cache-Control", "no-store");
  res.json(payload);
});

export default router;

