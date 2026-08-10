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

test("Exportunity industrial home leads with the case-backed AI conversation", () => {
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
    homeMarkup,
    /View \$\{selectionCatalogItems\.length\} GDIZ products/,
  );
  assert.match(homeMarkup, /<IndustrialSelectionCommerce/);
  assert.doesNotMatch(homeMarkup, /onSubmit=\{goSearch\}/);
  assert.doesNotMatch(homeMarkup, /placeholder=\{copy\.searchPlaceholder\}/);
  assert.ok(firstGenericSearchIndex > homeAssistantIndex);
  assert.match(assistant, /\/api\/industrial\/assistant\/intake-preview/);
  assert.match(assistant, /\/api\/industrial\/requirements/);
  assert.match(assistant, /Message Tassi/);
  assert.match(assistant, /Awa Kouadio/);
  assert.match(assistant, /commercialOwner/);
  assert.match(assistant, /consultative_discovery_summary_next_step/);
  assert.match(assistant, /priorityQuestion/);
  assert.match(assistant, /Exportunity AI/);
  assert.match(assistant, /VoiceToTextButton/);
  assert.doesNotMatch(assistant, /bg-\[#02070e\]\/92/);
  assert.match(assistant, /dark:bg-\[#02070e\]\/\[0\.96\]/);
});

test("factory and map discovery keep Tassi, the map, and products in one flow", () => {
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
});

test("product and quote journeys use Awa's progressive commercial conversation", () => {
  const hub = readRepoFile(
    "client/src/pages/exportunity/IndustrialHubPage.tsx",
  );
  const assistant = readRepoFile(
    "client/src/components/exportunity/IndustrialAssistantChat.tsx",
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
  assert.match(
    assistant,
    /type ConversationStep =[\s\S]*?"quantity"[\s\S]*?"destination"[\s\S]*?"timing"[\s\S]*?"priority"[\s\S]*?"confirm"/,
  );
  assert.match(assistant, /data-conversation-mode=/);
  assert.match(assistant, /exportunity_ai_product_order/);
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
