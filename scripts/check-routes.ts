import { APP_ROUTE_PATHS } from "../client/src/navigation/routes.generated";
import {
  ROUTES,
  isBackofficeRoutePath,
  isDynamicRoutePath,
  normalizeRoutePathForRegistry,
} from "../client/src/navigation/routeRegistry";

function main() {
  const discoveredBackoffice = Array.from(
    new Set(
      APP_ROUTE_PATHS.map((path) => normalizeRoutePathForRegistry(path))
        .filter(Boolean)
        .filter((path) => isBackofficeRoutePath(path)),
    ),
  ).sort((a, b) => a.localeCompare(b));

  const registryByPath = new Map(ROUTES.map((route) => [route.path, route]));
  const missing = discoveredBackoffice.filter((path) => !registryByPath.has(path));

  const menuRoutes = ROUTES.filter((route) => route.kind === "page" || route.kind === "hub");
  const invalidMenuDynamicRoutes = menuRoutes.filter((route) => isDynamicRoutePath(route.path));
  const unsortedMenuRoutes = menuRoutes.filter((route) => route.group === "unsorted");

  if (missing.length) {
    console.error("[check-routes] Missing route definitions for discovered backoffice routes:");
    for (const path of missing) console.error(`  - ${path}`);
  }

  if (invalidMenuDynamicRoutes.length) {
    console.error("[check-routes] Dynamic routes must not be menu-clickable:");
    for (const route of invalidMenuDynamicRoutes) console.error(`  - ${route.path} (${route.id})`);
  }

  console.log(`[check-routes] discovered backoffice routes: ${discoveredBackoffice.length}`);
  console.log(`[check-routes] registry routes: ${ROUTES.length}`);
  console.log(`[check-routes] menu routes (page/hub): ${menuRoutes.length}`);

  if (unsortedMenuRoutes.length) {
    console.log(`[check-routes] unsorted routes: ${unsortedMenuRoutes.length}`);
    for (const route of unsortedMenuRoutes.slice(0, 50)) {
      console.log(`  - ${route.path} (${route.title})`);
    }
  }

  if (missing.length || invalidMenuDynamicRoutes.length) {
    process.exitCode = 1;
    return;
  }

  console.log("[check-routes] PASS");
}

main();

