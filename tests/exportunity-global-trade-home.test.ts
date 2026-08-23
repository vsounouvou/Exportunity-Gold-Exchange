import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

function readRepoFile(relativePath: string) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("Exportunity.net root is the unified proximity marketplace, not an industrial redirect", () => {
  const app = readRepoFile("client/src/App.tsx");
  const tenant = readRepoFile("tenants/exportunity/config.ts");
  const registry = readRepoFile("tenants/registry.ts");

  assert.match(
    app,
    /tenant\.key === "exportunity"\) return <ExportunityMarketplacePage \/>/,
  );
  assert.match(tenant, /homeRedirectTo: "\/"/);
  assert.match(registry, /key === "exportunity"\) return "\/"/);
  assert.doesNotMatch(tenant, /homeRedirectTo: "\/industrial"/);
});

test("the global trade home exposes all mission routes and remains global by default", () => {
  const app = readRepoFile("client/src/App.tsx");
  const home = readRepoFile(
    "client/src/pages/exportunity/GlobalTradeHomePage.tsx",
  );

  for (const route of ["/source", "/sell-export", "/manage-supply", "/expand"]) {
    assert.match(app, new RegExp(`path="${route}"`));
    assert.match(home, new RegExp(`href: "${route}"`));
  }

  assert.match(home, /useState<MarketCode>\("GLOBAL"\)/);
  assert.match(home, /code: "GLOBAL"/);
  assert.match(home, /code: "OTHER"/);
  assert.match(home, /Trade\. Source\. Expand\. Operate\./);
});

test("the root marketplace starts with the nearest truthful radius", () => {
  const marketplace = readRepoFile(
    "client/src/pages/exportunity/MarketplacePage.tsx",
  );
  const publicContracts = readRepoFile(
    "scripts/site/public-surface-contracts.ts",
  );

  assert.match(marketplace, /useState<MarketplaceScope>\(10\)/);
  assert.match(
    marketplace,
    /userLocation &&[\s\S]*scope !== "global" &&[\s\S]*listing\.distanceKm === null \|\| listing\.distanceKm > scope/,
  );
  assert.match(marketplace, /const SCOPE_OPTIONS: MarketplaceScope\[\] = \[10, 50, 250, 1000, "global"\]/);
  assert.match(marketplace, /slug: "marketplace"/);
  assert.match(marketplace, /slug: "industrial"/);
  assert.match(
    publicContracts,
    /path: "\/",[\s\S]*pageTitle: "Exportunity proximity-first Marketplace",[\s\S]*href: "\/apply\/shop"/,
  );
});

test("the global home reuses one real assistant and the existing commercial case API", () => {
  const home = readRepoFile(
    "client/src/pages/exportunity/GlobalTradeHomePage.tsx",
  );
  const assistant = readRepoFile(
    "client/src/components/exportunity/IndustrialAssistantChat.tsx",
  );

  assert.equal((home.match(/<IndustrialAssistantChat/g) || []).length, 1);
  assert.match(home, /queryKey: \["\/api\/industrial\/catalog"\]/);
  assert.match(home, /<MapContainer/);
  assert.match(home, /INDUSTRIAL_CONTEXT_LOCATIONS/);
  assert.match(assistant, /exportunity_ai_global_trade_mission/);
  assert.match(
    assistant,
    /fetch\("\/api\/industrial\/requirements", \{[\s\S]*?method: "POST"/,
  );
  assert.doesNotMatch(home, /placeholder|dummy|lorem ipsum/i);
});

test("the fixed assistant pane stays above the commerce canvas", () => {
  const home = readRepoFile(
    "client/src/pages/exportunity/GlobalTradeHomePage.tsx",
  );

  assert.match(
    home,
    /<aside[\s\S]*?className="relative z-\[100\] isolate[\s\S]*?aria-label="Exportunity commercial assistant"/,
  );
  assert.match(home, /<section className="relative z-0 order-4/);
});

test("public map and catalog language distinguishes evidence from unverified availability", () => {
  const home = readRepoFile(
    "client/src/pages/exportunity/GlobalTradeHomePage.tsx",
  );

  assert.match(home, /Public references and context links, not live shipments\./);
  assert.match(home, /not a stock promise or an approved supplier/);
  assert.match(home, /Supplier and availability to qualify/);
  assert.match(home, /Price, stock, capacity, supplier, and lead time are confirmed/);
});
