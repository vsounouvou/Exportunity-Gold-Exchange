import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import test from "node:test";

const appSource = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");
const platformHomeSource = readFileSync(
  new URL("../client/src/pages/exportunity/GlobalTradeHomePage.tsx", import.meta.url),
  "utf8",
);
const industrialHubSource = readFileSync(
  new URL("../client/src/pages/exportunity/IndustrialHubPage.tsx", import.meta.url),
  "utf8",
);
const marketplaceSource = readFileSync(
  new URL("../client/src/pages/exportunity/MarketplacePage.tsx", import.meta.url),
  "utf8",
);
const producerExchangeSource = readFileSync(
  new URL("../client/src/pages/exportunity/ProducerExchangePage.tsx", import.meta.url),
  "utf8",
);
const viteConfigSource = readFileSync(new URL("../vite.config.ts", import.meta.url), "utf8");

test("every Exportunity public hostname opens the unified proximity marketplace", () => {
  assert.match(appSource, /tenant\.key === "exportunity"\) return <ExportunityMarketplacePage \/>/);
  assert.doesNotMatch(
    appSource,
    /ExportunityMarketing[A-Za-z]+Page|MarketingHomePage|MarketingRedirect|MarketingOrAuthRedirect/,
  );
  assert.match(marketplaceSource, /Exportunity marketplace · proximity first/);
  assert.match(marketplaceSource, /Start around you\. Expand without limits\./);
});

test("the .net home exposes the global commercial missions and real operating surfaces", () => {
  for (const label of [
    "Tell us what you need",
    "Source",
    "Sell and export",
    "Manage supply",
    "Enter a market",
  ]) {
    assert.match(platformHomeSource, new RegExp(label));
  }

  assert.match(platformHomeSource, /href="\/industrial"/);
  assert.match(platformHomeSource, /href="\/marketplace"/);
  assert.match(platformHomeSource, /href="\/trade"/);
  assert.match(platformHomeSource, /href="\/producer-exchange"/);
  assert.match(platformHomeSource, /<MapContainer/);
  assert.match(platformHomeSource, /<IndustrialAssistantChat/);
});

test("the separate MindBase project is absent from the Exportunity public home", () => {
  assert.doesNotMatch(platformHomeSource, /MindBase/i);
});

test("current GTN operating surfaces own their browser metadata", () => {
  assert.match(industrialHubSource, /African Industrial Sourcing \| Exportunity/);
  assert.match(industrialHubSource, /African Industrial Network Map \| Exportunity/);
  assert.match(producerExchangeSource, /African Producer Exchange \| Exportunity/);
  assert.doesNotMatch(industrialHubSource, /BOURSE DE L'OR/i);
  assert.doesNotMatch(producerExchangeSource, /BOURSE DE L'OR/i);
});

test("the dedicated Exportunity build excludes the shared Bourse and Zone storefront", () => {
  assert.match(viteConfigSource, /__BUILD_INCLUDE_SHARED_STOREFRONT__/);
  assert.match(viteConfigSource, /buildAppName !== "exportunity"/);
  assert.match(appSource, /const includeSharedStorefront = __BUILD_INCLUDE_SHARED_STOREFRONT__/);
  assert.match(appSource, /includeSharedStorefront[\s\S]*@\/pages\/store\/StorePage/);
  assert.doesNotMatch(appSource, /@\/pages\/MarketingPage/);
  assert.match(appSource, /path="\/marketing"[\s\S]*<Redirect to="\/admin\/media"/);
});

test("the dedicated Exportunity build excludes MindBase product pages", () => {
  assert.match(viteConfigSource, /__BUILD_INCLUDE_MINDBASE__/);
  assert.match(viteConfigSource, /buildAppName === "" \|\| buildAppName === "mindbase"/);
  assert.match(appSource, /const includeMindbase = __BUILD_INCLUDE_MINDBASE__/);
  assert.match(appSource, /includeMindbase[\s\S]*@\/pages\/mindbase\/MindbaseLandingPage/);
});

test("the current Marketplace absorbs Zone as a proximity-first layer", () => {
  assert.match(appSource, /path="\/marketplace" component=\{ExportunityMarketplaceRoute\}/);
  assert.match(
    appSource,
    /path="\/zone" component=\{\(\) => <ExportunityIndustrialAliasRoute to="\/marketplace" \/>\}/,
  );
  assert.match(marketplaceSource, /data-testid="exportunity-marketplace"/);
  assert.match(marketplaceSource, /<Circle/);
  assert.match(marketplaceSource, /\/api\/marketplace\/buyer\/nearby/);
  assert.match(marketplaceSource, /\/api\/industrial\/factories/);
  assert.match(marketplaceSource, /\/api\/industrial\/catalog/);
  assert.match(marketplaceSource, /Approved seller listing/);
  assert.match(marketplaceSource, /Documented reference; supplier and stock to qualify/);
  assert.match(marketplaceSource, /data-testid="marketplace-primary-grid"/);
  assert.match(marketplaceSource, /<main className="contents">/);
  assert.match(marketplaceSource, /order-2 min-w-0 lg:col-start-1 lg:row-start-2/);
  assert.match(marketplaceSource, /Marketplace proximity map[\s\S]*?lg:col-start-1 lg:row-start-3|lg:col-start-1 lg:row-start-3[\s\S]*?Marketplace proximity map/);
  assert.doesNotMatch(marketplaceSource, /lg:col-span-2 lg:row-start-2/);
  assert.match(marketplaceSource, /expandedScopeFallback/);
  assert.match(marketplaceSource, /No listing with a verified distance is available inside/);
  assert.doesNotMatch(marketplaceSource, /\/api\/marketplace\/buyer\/orders|pay-with-wallet/i);
});

test("the retired corporate renderer source has been removed, not merely hidden", () => {
  const retiredPages = readdirSync(
    new URL("../client/src/pages/exportunity", import.meta.url),
  ).filter((name) => /^Marketing.*Page\.tsx$/.test(name));
  assert.deepEqual(retiredPages, []);
  for (const relativePath of [
    "../client/src/components/exportunity/MarketingShell.tsx",
    "../client/src/components/exportunity/MarketingChatDesk.tsx",
    "../client/src/components/exportunity/PlatformModulePage.tsx",
    "../client/src/pages/MarketplacePage.tsx",
    "../client/src/content/marketing/pageContracts.ts",
    "../client/src/content/marketing/site.ts",
    "../client/src/content/marketing/vitrine.ts",
    "../client/src/content/platformModules.ts",
    "../content/marketing/site.json",
    "../scripts/site/audit-site.ts",
    "../scripts/site/marketing-quality-gate.mjs",
    "../client/src/components/exportunity/InvestmentLeadForm.tsx",
    "../client/src/components/exportunity/PlatformExecutionDiagram.tsx",
    "../client/src/components/exportunity/PlatformProofGrid.tsx",
    "../client/src/components/exportunity/ProofPanel.tsx",
    "../client/src/components/exportunity/invest-ui.tsx",
    "../client/src/components/exportunity/marketing-ui.tsx",
    "../client/src/components/exportunity/useMarketingLinks.ts",
    "../client/src/pages/MarketingPage.tsx",
  ]) {
    assert.equal(existsSync(new URL(relativePath, import.meta.url)), false, relativePath);
  }
  assert.doesNotMatch(platformHomeSource, /<MarketingChatDesk/);
  assert.doesNotMatch(appSource, /ExportunityLegacyMarketplaceRoute|@\/pages\/MarketplacePage/);
  assert.match(
    appSource,
    /path="\/marketplace-old" component=\{\(\) => <ExportunityIndustrialAliasRoute to="\/marketplace" \/>\}/,
  );
});
