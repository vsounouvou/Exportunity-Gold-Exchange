import path from "path";
import {
  applyMenuLabels,
  buildMenuInventory,
  buildPageInventory,
  normalizePath,
  writeMenuInventory,
  writePageInventory,
} from "./inventory-lib";

const outputDir = path.join(process.cwd(), "docs", "qa");

const menuItems = buildMenuInventory();
const rawRoutes = buildPageInventory();
const routes = applyMenuLabels(rawRoutes, menuItems);

writePageInventory(routes, outputDir);
writeMenuInventory(menuItems, outputDir);

const menuRouteSet = new Set(menuItems.map((item) => normalizePath(item.route)));
const pageRouteSet = new Set(routes.map((route) => normalizePath(route.path)));

const hiddenMissingReason = routes.filter(
  (route) => route.hiddenFromMenu && !route.hiddenReason
);

const missingRoutes = routes.filter((route) => {
  if (route.hiddenFromMenu) return false;
  return !menuRouteSet.has(normalizePath(route.path));
});

const menuMissingRoutes = menuItems.filter(
  (item) => !pageRouteSet.has(normalizePath(item.route))
);

if (hiddenMissingReason.length) {
  console.error("[qa] Hidden routes missing reason:");
  hiddenMissingReason.forEach((route) => {
    console.error(`- ${route.path}`);
  });
}

if (missingRoutes.length) {
  console.error("[qa] Routes missing from menu:");
  missingRoutes.forEach((route) => {
    console.error(`- ${route.path}`);
  });
}

if (menuMissingRoutes.length) {
  console.error("[qa] Menu items missing routes:");
  menuMissingRoutes.forEach((item) => {
    console.error(`- ${item.route} (${item.label})`);
  });
}

if (hiddenMissingReason.length || missingRoutes.length || menuMissingRoutes.length) {
  console.error("[qa] Menu coverage check failed.");
  process.exit(1);
}

console.log("[qa] Menu coverage check passed.");
