import { discoverRoutes } from "../server/lib/platform/routeDiscovery";

async function main() {
  const routes = await discoverRoutes(process.cwd());
  console.log(JSON.stringify({ count: routes.length, routes }, null, 2));
}

main().catch((error) => {
  console.error("[discover-routes] failed:", error?.message || error);
  process.exitCode = 1;
});
