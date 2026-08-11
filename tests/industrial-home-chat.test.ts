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

test("Exportunity industrial home leads with Awa's case-backed commercial conversation", () => {
  const hub = readRepoFile(
    "client/src/pages/exportunity/IndustrialHubPage.tsx",
  );
  const assistant = readRepoFile(
    "client/src/components/exportunity/IndustrialAssistantChat.tsx",
  );
  const homeStart = hub.indexOf('{view === "home" ? (');
  const homeAssistantIndex = hub.indexOf("<IndustrialAssistantChat", homeStart);
  const publicDirectoryStart = hub.indexOf('{view !== "map"', homeStart);
  const homeMarkup = hub.slice(homeStart, publicDirectoryStart);
  const firstGenericSearchIndex = hub.indexOf(
    "placeholder={copy.searchPlaceholder}",
  );

  assert.match(
    hub,
    /import \{ IndustrialAssistantChat \} from "@\/components\/exportunity\/IndustrialAssistantChat";/,
  );
  assert.ok(homeAssistantIndex >= 0);
  assert.ok(homeStart >= 0);
  assert.ok(publicDirectoryStart > homeStart);
  assert.match(
    homeMarkup,
    /<IndustrialAssistantChat[\s\S]*?context=\{selectionAssistantContext\}[\s\S]*?product=\{selectedAssistantProduct\}/,
  );
  assert.match(homeMarkup, /data-testid="industrial-home-context-card"/);
  assert.match(
    hub,
    /showEmptyState &&[\s\S]*?visibleFactories\.length === 0 &&[\s\S]*?!selectedFactory &&[\s\S]*?!selectedContext/,
  );
  assert.match(
    homeMarkup,
    /data-testid="industrial-home-context-card"[\s\S]*?z-\[650\]/,
  );
  assert.match(homeMarkup, /onClick=\{scrollToSelectionCommerce\}/);
  assert.match(
    hub,
    /const revealCommerceSelection = \(\) => \{[\s\S]*?view !== "home"[\s\S]*?view !== "factories"[\s\S]*?scrollToSelectionCommerce\(\)/,
  );
  assert.match(
    homeMarkup,
    /View \$\{selectionCatalogItems\.length\} GDIZ products/,
  );
  assert.match(homeMarkup, /<IndustrialSelectionCommerce/);
  assert.doesNotMatch(homeMarkup, /onSubmit=\{goSearch\}/);
  assert.doesNotMatch(homeMarkup, /placeholder=\{copy\.searchPlaceholder\}/);
  assert.ok(firstGenericSearchIndex > homeAssistantIndex);
  assert.match(assistant, /\/api\/industrial\/assistant\/intake-preview/);
  assert.match(assistant, /\/api\/industrial\/requirements/);
  assert.match(assistant, /Message Awa/);
  assert.match(assistant, /Awa Kouadio/);
  assert.match(assistant, /commercialOwner/);
  assert.match(assistant, /consultative_discovery_summary_next_step/);
  assert.match(assistant, /priorityQuestion/);
  assert.match(assistant, /Exportunity AI/);
  assert.match(assistant, /VoiceToTextButton/);
  assert.doesNotMatch(assistant, /bg-\[#02070e\]\/92/);
  assert.match(assistant, /dark:bg-\[#02070e\]\/\[0\.96\]/);
});

test("factory and map discovery keep Awa, the map, and products in one flow", () => {
  const hub = readRepoFile(
    "client/src/pages/exportunity/IndustrialHubPage.tsx",
  );
  const mapStart = hub.indexOf('{view === "map" ? (');
  const factoriesStart = hub.indexOf('{view === "factories" ? (');
  const productsStart = hub.indexOf('{view === "products" ? (');

  assert.ok(mapStart >= 0);
  assert.ok(factoriesStart > mapStart);
  assert.ok(productsStart > factoriesStart);

  const mapMarkup = hub.slice(mapStart, factoriesStart);
  const factoriesMarkup = hub.slice(factoriesStart, productsStart);

  for (const markup of [mapMarkup, factoriesMarkup]) {
    assert.match(markup, /<IndustrialMap/);
    assert.match(markup, /<IndustrialAssistantChat/);
    assert.match(markup, /context=\{selectionAssistantContext\}/);
    assert.match(markup, /<IndustrialSelectionCommerce/);
  }

  assert.match(hub, /params\.set\("catalogItem", item\.id\)/);
  assert.match(hub, /params\.set\("order", item\.id\)/);
  assert.match(mapMarkup, /product=\{selectedAssistantProduct\}/);
  assert.match(factoriesMarkup, /product=\{selectedAssistantProduct\}/);
  assert.doesNotMatch(mapMarkup, /onSubmit=\{goSearch\}/);
  assert.match(hub, /title=\{contextMarkerTitle\}/);
  assert.match(hub, /alt=\{contextMarkerTitle\}/);
  assert.match(
    hub,
    /setAttribute\("aria-label", contextMarkerTitle\)/,
  );
  assert.match(
    hub,
    /title=\{`\$\{factory\.name\} - \$\{factory\.industry\}`\}/,
  );
});

test("product and quote journeys use Awa's progressive commercial conversation", () => {
  const hub = readRepoFile(
    "client/src/pages/exportunity/IndustrialHubPage.tsx",
  );
  const assistant = readRepoFile(
    "client/src/components/exportunity/IndustrialAssistantChat.tsx",
  );
  const industrialRoutes = readRepoFile("server/routes/industrial.ts");
  const intakeAssistant = readRepoFile(
    "server/lib/industrial/intakeAssistant.ts",
  );
  const quoteStart = hub.indexOf('{view === "quote" ? (');
  const registerStart = hub.indexOf('{view === "register" ? (', quoteStart);
  const quoteMarkup = hub.slice(quoteStart, registerStart);

  assert.ok(quoteStart >= 0);
  assert.ok(registerStart > quoteStart);
  assert.match(quoteMarkup, /<IndustrialAssistantChat/);
  assert.match(quoteMarkup, /mode="commercial"/);
  assert.match(quoteMarkup, /context=\{quoteAssistantContext\}/);
  assert.doesNotMatch(quoteMarkup, /<QuoteForm/);
  assert.match(hub, /function ConversationalCatalog/);
  assert.match(hub, /onStartConversation=\{updateOrderConversation\}/);
  assert.match(hub, /function quoteIntentForLocation/);
  assert.match(hub, /if \(type === "machinery"\)/);
  assert.match(hub, /if \(type === "spare_part"\)/);
  assert.match(hub, /if \(type === "export_quotation"\)/);
  assert.match(hub, /quoteIntent\?\.intro/);
  assert.match(
    assistant,
    /type ConversationStep =[\s\S]*?"quantity"[\s\S]*?"destination"[\s\S]*?"timing"[\s\S]*?"priority"[\s\S]*?"confirm"/,
  );
  assert.match(assistant, /function quantityQuestionForRequirement/);
  assert.match(
    assistant,
    /requirementType === "machinery"[\s\S]*?1 complete line[\s\S]*?Capacity to be defined/,
  );
  assert.match(
    assistant,
    /function destinationRepliesForTerritory[\s\S]*?territoryCode === "CI"[\s\S]*?territoryCode === "AE"[\s\S]*?territoryCode === "BJ"/,
  );
  assert.match(assistant, /value\.includes\("jebel ali"\)/);
  assert.match(
    assistant,
    /requirementType: initialRequirementType \|\| undefined/,
  );
  assert.match(
    assistant,
    /initialRequirementType \|\| intake\?\.requirementType/,
  );
  assert.match(
    industrialRoutes,
    /requirementType: z\.enum\(INDUSTRIAL_REQUIREMENT_TYPES\)\.optional\(\)/,
  );
  assert.match(
    industrialRoutes,
    /parsed\.data\.agentMode,[\s\S]*?parsed\.data\.requirementType/,
  );
  assert.match(
    intakeAssistant,
    /const CATEGORY_BY_REQUIREMENT_TYPE[\s\S]*?spare_part: "spare_parts_and_components"/,
  );
  assert.match(
    intakeAssistant,
    /requirementTypeHint[\s\S]*?requirementType: requirementTypeHint/,
  );
  assert.match(assistant, /data-conversation-mode=/);
  assert.match(assistant, /exportunity_ai_product_order/);
  assert.match(hub, /const withSelectedMarket = \(href: string\)/);
  assert.match(
    hub,
    /href=\{withSelectedMarket\([\s\S]*?\/request-quote\?type=machinery/,
  );
});

test("global sourcing offers inherit the selected market without claiming local stock", () => {
  const hub = readRepoFile(
    "client/src/pages/exportunity/IndustrialHubPage.tsx",
  );

  assert.match(
    hub,
    /function catalogDisplayProvider[\s\S]*?exportunity_sourcing_program[\s\S]*?Exportunity AI Sourcing/,
  );
  assert.match(
    hub,
    /function catalogDisplayLocation[\s\S]*?Reseau de sourcing[\s\S]*?Sourcing network/,
  );
  assert.match(hub, /No local stock is assumed/);
  assert.match(hub, /assistantProductContext\([\s\S]*?selectedTerritory/);
  assert.match(
    hub,
    /<ConversationalCatalog[\s\S]*?territory=\{selectedTerritory\}/,
  );
});

test("factory onboarding is a private one-question Awa conversation", () => {
  const hub = readRepoFile(
    "client/src/pages/exportunity/IndustrialHubPage.tsx",
  );
  const registerStart = hub.indexOf('{view === "register" ? (');
  const claimStart = hub.indexOf('{view === "claim" ? (', registerStart);
  const registerMarkup = hub.slice(registerStart, claimStart);

  assert.ok(registerStart >= 0);
  assert.ok(claimStart > registerStart);
  assert.match(registerMarkup, /<FactoryRegistrationConversation/);
  assert.doesNotMatch(registerMarkup, /<FactoryRegistrationForm/);
  assert.match(hub, /data-testid="factory-registration-conversation"/);
  assert.match(hub, /Question[^\n]*\{currentIndex \+ 1\}/);
  assert.match(hub, /\/api\/industrial\/factories\/register/);
  assert.match(hub, /Nothing is published before verification/);
  assert.match(hub, /Submit for verification/);
});

test("Awa owns the real commercial handoff while specialists join the case", () => {
  const organization = readRepoFile(
    "server/lib/industrial/agentOrganization.ts",
  );
  const handoff = readRepoFile("server/lib/industrial/operationsHandoff.ts");
  const intake = readRepoFile("server/lib/industrial/intakeAssistant.ts");
  const routes = readRepoFile("server/routes/industrial.ts");

  assert.match(organization, /name: "Awa Kouadio"/);
  assert.match(organization, /"deal_qualification"/);
  assert.match(organization, /"objection_handling"/);
  assert.match(organization, /"commercial_close"/);
  assert.match(
    handoff,
    /const primaryAgentKey: HandoffAgentKey = "commercial"/,
  );
  assert.match(handoff, /participantKeys\.add\("technical"\)/);
  assert.match(handoff, /participantKeys\.add\("sourcing"\)/);
  assert.match(handoff, /participantKeys\.add\("logistics"\)/);
  assert.match(intake, /You are Awa Kouadio/);
  assert.match(intake, /mutually agreed next step/);
  assert.match(
    routes,
    /agentMode: z[\s\S]*?\.enum\(\["concierge", "commercial"\]\)/,
  );
});

test("pathname navigation starts each industrial journey at the top", () => {
  const app = readRepoFile("client/src/App.tsx");

  assert.ok(
    app.includes(
      'const previousPathRef = useRef(location.split("?")[0] || "/");',
    ),
  );
  assert.match(app, /if \(previousPathRef\.current !== nextPath\)/);
  assert.match(
    app,
    /window\.scrollTo\(\{ top: 0, left: 0, behavior: "auto" \}\)/,
  );
});
