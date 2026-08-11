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

test("the industrial platform uses the approved Exportunity AI master mark", () => {
  const logo = readRepoFile("client/public/tenants/exportunity/logo.svg");
  const app = readRepoFile("client/src/App.tsx");
  const hub = readRepoFile(
    "client/src/pages/exportunity/IndustrialHubPage.tsx",
  );
  const assistant = readRepoFile(
    "client/src/components/exportunity/IndustrialAssistantChat.tsx",
  );

  assert.match(logo, /Exportunity AI/);
  assert.match(logo, /EXPORTUNITY/);
  assert.match(logo, />AI</);
  assert.match(logo, /stroke="#F5A623"/);
  assert.match(hub, /src="\/tenants\/exportunity\/logo\.svg"/);
  assert.match(hub, /alt="Exportunity AI"/);
  assert.doesNotMatch(hub, /src="\/tenants\/exportunity\/machinery-logo\.svg"/);
  assert.doesNotMatch(assistant, /tenants\/exportunity\/machinery-logo\.svg/);
  assert.match(app, /function RouteLoadingFallback\(\)/);
  assert.match(
    app,
    /tenant\.key === "exportunity"[\s\S]*?\/tenants\/exportunity\/logo\.svg[\s\S]*?Opening the industrial network/,
  );
  assert.match(app, /fallback=\{<RouteLoadingFallback \/>\}/);
});

test("public industrial discovery covers Cote d'Ivoire, Benin, and the UAE", () => {
  const context = readRepoFile(
    "client/src/components/exportunity/industrialContext.ts",
  );
  const hub = readRepoFile(
    "client/src/pages/exportunity/IndustrialHubPage.tsx",
  );

  assert.match(context, /type IndustrialTerritoryCode = "BJ" \| "CI" \| "AE"/);
  assert.match(context, /id: "abidjan-pk24"/);
  assert.match(context, /id: "port-abidjan"/);
  assert.match(context, /id: "gdiz"/);
  assert.match(context, /id: "dubai-industrial-city"/);
  assert.match(context, /id: "jebel-ali-port"/);
  assert.match(context, /id: "dmcc-commodities"/);
  assert.match(context, /does not prove supplier identity/);
  assert.match(context, /not a verified company directory or proof of stock/);
  assert.match(hub, /<IndustrialTerritorySwitcher/);
  assert.match(hub, /territory=\{selectedTerritory\}/);
  assert.match(hub, /contexts=\{territoryContexts\}/);
  assert.match(hub, /exportunity-industrial-territory/);
});

test("the homepage presents current corridors as one expanding industrial network", () => {
  const context = readRepoFile(
    "client/src/components/exportunity/industrialContext.ts",
  );
  const hub = readRepoFile(
    "client/src/pages/exportunity/IndustrialHubPage.tsx",
  );

  assert.match(context, /corridorName: IndustrialContextCopy/);
  assert.match(context, /Zones industrielles d'Abidjan/);
  assert.match(context, /Axe GDIZ - Cotonou/);
  assert.match(context, /Corridor industriel de Dubai/);
  assert.match(hub, /Corridors industriels actifs/);
  assert.match(hub, /Reseau en expansion/);
  assert.match(hub, /Autre marche/);
  assert.match(hub, /topic === "new-market"/);
  assert.match(hub, /Nos corridors actuels ne limitent pas notre reseau/);
  assert.match(hub, /Explorer une zone industrielle/);
  assert.match(
    hub,
    /industrialContextsForTerritory\(territoryCode\)[\s\S]*?\.map\(\(context\) => context\.markerLabel\)/,
  );
  assert.match(hub, /max-w-\[132px\]/);
  assert.match(hub, /mb-3[\s\S]*?xl:hidden/);
  assert.match(hub, /hidden[\s\S]*?xl:block/);
});

test("territory selection preserves one real commercial conversation", () => {
  const hub = readRepoFile(
    "client/src/pages/exportunity/IndustrialHubPage.tsx",
  );
  const homeStart = hub.indexOf('{view === "home" ? (');
  const secondaryViewsStart = hub.indexOf('{view !== "map"', homeStart);
  const homeMarkup = hub.slice(homeStart, secondaryViewsStart);

  assert.match(homeMarkup, /<IndustrialAssistantChat/);
  assert.equal(
    (homeMarkup.match(/<IndustrialAssistantChat/g) || []).length,
    1,
  );
  assert.match(homeMarkup, /value=\{selectedTerritoryCode\}/);
  assert.match(homeMarkup, /onChange=\{changeIndustrialTerritory\}/);
  assert.match(homeMarkup, /territory=\{selectedTerritory\}/);
  assert.doesNotMatch(homeMarkup, /placeholder=\{copy\.searchPlaceholder\}/);
  assert.doesNotMatch(
    hub,
    /Pieces, equipements et produits fabriques au Benin/,
  );
  assert.match(hub, /sourcing industriel pour la Cote d'Ivoire/);
  assert.match(hub, /routes d'approvisionnement depuis Dubai/);
  assert.match(hub, /Offres industrielles documentees/);
  assert.match(hub, /Acheter pour votre usine \| \$\{marketLabel\}/);
  assert.doesNotMatch(
    hub,
    /id="industrial-quick-products"[\s\S]{0,120}className="truncate/,
  );
});

test("unselected map catalog stays scoped to the active territory", () => {
  const hub = readRepoFile(
    "client/src/pages/exportunity/IndustrialHubPage.tsx",
  );

  assert.match(
    hub,
    /if \(selectedIndustrialContext\) \{[\s\S]*?return contextCatalogItems\(selectedIndustrialContext, catalogItems\);[\s\S]*?\}[\s\S]*?return territoryCatalogItems;/,
  );
  assert.match(
    hub,
    /Industrial offerings - \$\{industrialContextText\(territory\.shortName, language\)\}/,
  );
  assert.match(
    hub,
    /<IndustrialSelectionCommerce[\s\S]*?territory=\{selectedTerritory\}/,
  );
});

test("market switching updates the shareable route instead of being reset", () => {
  const hub = readRepoFile(
    "client/src/pages/exportunity/IndustrialHubPage.tsx",
  );

  assert.match(hub, /params\.set\("market", territoryCode\)/);
  assert.match(hub, /if \(nextLocation !== location\) navigate\(nextLocation\)/);
  assert.match(
    hub,
    /const changeIndustrialTerritory =[\s\S]*?setSelectedFactory\(null\);[\s\S]*?setSelectedIndustrialContext\(null\);/,
  );
  assert.doesNotMatch(
    hub,
    /const changeIndustrialTerritory =[\s\S]*?setSelectedIndustrialContext\([\s\S]*?industrialContextsForTerritory\(territoryCode\)\[0\]/,
  );
  assert.match(
    hub,
    /const requestedTerritory = queryValue\(location, "market"\)[\s\S]*?\}, \[location\]\);/,
  );
  assert.doesNotMatch(
    hub,
    /const requestedTerritory = queryValue\(location, "market"\)[\s\S]*?\}, \[location, selectedTerritoryCode\]\);/,
  );
});

test("factory discovery opens on the complete territory instead of forcing the first hub", () => {
  const hub = readRepoFile(
    "client/src/pages/exportunity/IndustrialHubPage.tsx",
  );

  assert.doesNotMatch(
    hub,
    /view === "factories"[\s\S]*?setSelectedIndustrialContext\(territoryContexts\[0\]/,
  );
  assert.match(
    hub,
    /Selectionnez un repere pour explorer les produits et ouvrir une conversation commerciale/,
  );
  assert.match(
    hub,
    /<IndustrialAssistantChat[\s\S]*?context=\{selectionAssistantContext\}/,
  );
});
