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
  assert.match(hub, /sourcing pour la Cote d'Ivoire/);
  assert.match(hub, /sourcing international depuis Dubai/);
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
