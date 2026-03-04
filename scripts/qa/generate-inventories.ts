import path from "path";
import {
  applyMenuLabels,
  buildMenuInventory,
  buildPageInventory,
  writeMenuInventory,
  writePageInventory,
} from "./inventory-lib";

const outputDir = path.join(process.cwd(), "docs", "qa");

const menuItems = buildMenuInventory();
const rawRoutes = buildPageInventory();
const routes = applyMenuLabels(rawRoutes, menuItems);

writePageInventory(routes, outputDir);
writeMenuInventory(menuItems, outputDir);

console.log(`[qa] page-inventory: ${routes.length} routes`);
console.log(`[qa] menu-inventory: ${menuItems.length} items`);
