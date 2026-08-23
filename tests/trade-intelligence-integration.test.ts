import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("trade intelligence schema includes provenance, graph, demand, coverage, mission, and regulatory tables", async () => {
  const schema = await read("db/schema/trade-intelligence.ts");
  for (const table of [
    "trade_intelligence_sources",
    "trade_knowledge_entities",
    "trade_knowledge_relationships",
    "trade_facts",
    "trade_demand_events",
    "trade_industry_sectors",
    "trade_coverage_cells",
    "trade_research_missions",
    "trade_research_mission_evidence",
    "trade_newsroom_articles",
    "trade_newsroom_citations",
    "trade_newsroom_revisions",
    "trade_newsroom_review_events",
    "trade_source_snapshots",
    "trade_source_comparisons",
    "trade_regulatory_changes",
    "trade_intelligence_alerts",
    "trade_intelligence_alert_impacts",
  ]) {
    assert.match(schema, new RegExp(`"${table}"`));
  }
  assert.match(schema, /trade_facts_owner_check/);
  assert.match(schema, /canonicalTaskId/);
});

test("startup creates the foundation and seeds the governed Africa-wide backlog", async () => {
  const index = await read("server/index.ts");
  const ensure = await read("server/lib/trade-intelligence/ensureTables.ts");
  const migration = await read(
    "db/migrations/20270407_exportunity_trade_intelligence_foundation.sql",
  );
  const africaMigration = await read(
    "db/migrations/20260823_exportunity_africa_coverage_backlog.sql",
  );
  const sectorMigration = await read(
    "db/migrations/20260824_exportunity_trade_industry_catalog.sql",
  );
  assert.match(index, /await ensureTradeIntelligenceTables\(\)/);
  assert.match(ensure, /buildTradeIntelligenceCoverageTargets/);
  assert.match(migration, /ON CONFLICT \(tenant_id, country_code, dimension, sector_code\) DO NOTHING/);
  assert.match(africaMigration, /'coverageScope', 'africa_54'/);
  assert.match(africaMigration, /'coverageTier'/);
  assert.match(africaMigration, /'research_backlog'/);
  assert.match(africaMigration, /'emptyCoverageIsNotEvidence', true/);
  assert.match(africaMigration, /ON CONFLICT \(tenant_id, country_code, dimension, sector_code\) DO NOTHING/);
  assert.doesNotMatch(
    africaMigration,
    /INSERT INTO\s+(trade_facts|trade_knowledge_entities|trade_intelligence_sources)/i,
  );
  assert.match(sectorMigration, /CREATE TABLE IF NOT EXISTS trade_industry_sectors/);
  assert.match(sectorMigration, /status IN \('draft', 'review', 'active', 'retired'\)/);
  assert.match(sectorMigration, /canonical_category_codes/);
  assert.match(sectorMigration, /emptyCoverageIsNotEvidence/);
  assert.doesNotMatch(
    sectorMigration,
    /INSERT INTO\s+(trade_facts|trade_knowledge_entities|trade_intelligence_sources)/i,
  );
});

test("industry-sector expansion is reviewed, auditable, and preserves prior evidence", async () => {
  const service = await read("server/lib/trade-intelligence/service.ts");
  const route = await read("server/routes/trade-intelligence.ts");
  assert.match(route, /"\/admin\/sectors", ensureTenantAdmin/);
  assert.match(route, /"\/admin\/sectors\/:sectorId\/transition"/);
  assert.match(service, /createTradeIndustrySectorProposal/);
  assert.match(service, /transitionTradeIndustrySector/);
  assert.match(service, /submit_for_review/);
  assert.match(service, /buildTradeIntelligenceCoverageTargets/);
  assert.match(service, /existingEvidencePreserved: true/);
  assert.doesNotMatch(service, /delete\(tradeCoverageCells\)/);
});

test("research missions use canonical approval-pending tasks and never auto-enable outreach", async () => {
  const service = await read("server/lib/trade-intelligence/service.ts");
  assert.match(service, /executionType: "trade_research"/);
  assert.match(service, /approvalStatus: "pending"/);
  assert.match(service, /isAutomated: false/);
  assert.match(service, /externalCommunicationAllowed: false/);
  assert.match(service, /canonicalExecutionSystem: "tasks"/);
  assert.match(service, /tradeResearchMissionEvidence/);
  assert.match(service, /Completion requires at least two evidence items/);
});

test("public trade endpoints cannot publish facts or create missions", async () => {
  const route = await read("server/routes/trade-intelligence.ts");
  assert.match(route, /router\.get\("\/overview"/);
  assert.match(route, /router\.post\("\/demand-events"/);
  assert.match(route, /eventType: z\.enum\(\["search", "assistant_intent", "zero_result"\]\)/);
  assert.match(route, /"\/admin\/facts", ensureTenantAdmin/);
  assert.match(route, /"\/admin\/missions", ensureTenantStaff/);
  assert.match(route, /"\/admin\/entities\/:entityId\/review"/);
  assert.match(route, /"\/admin\/missions\/:missionId\/evidence"/);
  assert.match(route, /"\/admin\/sources\/:sourceId\/snapshots"/);
  assert.match(route, /"\/admin\/source-comparisons\/:comparisonId\/review"/);
});

test("source monitoring persists versions and withholds alerts until accountable review", async () => {
  const service = await read("server/lib/trade-intelligence/service.ts");
  const monitoring = await read(
    "server/lib/trade-intelligence/sourceMonitoring.ts",
  );
  const migration = await read(
    "db/migrations/20270409_exportunity_trade_source_monitoring.sql",
  );
  assert.match(service, /captureTradeSourceSnapshot/);
  assert.match(service, /executionType: "trade_source_review"/);
  assert.match(service, /deliveryStatus: "withheld"/);
  assert.match(service, /notificationSent: false/);
  assert.match(service, /matchTradeRequirementImpact/);
  assert.match(monitoring, /compareTradeSourceSnapshots/);
  assert.match(monitoring, /Human review|accountable review/i);
  assert.match(migration, /trade_source_snapshots/);
  assert.match(migration, /trade_intelligence_alert_impacts/);
  assert.doesNotMatch(service, /deliveryStatus: "sent"/);
});

test("industrial assistant and requirement submission both feed demand intelligence", async () => {
  const industrialRoutes = await read("server/routes/industrial.ts");
  assert.match(industrialRoutes, /eventType: "assistant_intent"/);
  assert.match(industrialRoutes, /eventType: "requirement"/);
  assert.match(industrialRoutes, /inferAfricaDestinationCountryCode/);
  assert.match(industrialRoutes, /tradeDemandEventId/);
});

test("public responses only select verified and published entities and aggregate demand", async () => {
  const service = await read("server/lib/trade-intelligence/service.ts");
  assert.match(service, /eq\(tradeKnowledgeEntities\.publicationStatus, "published"\)/);
  assert.match(service, /eq\(tradeKnowledgeEntities\.verificationStatus, "verified"\)/);
  assert.match(service, /filter\(\(signal\) => signal\.eventCount >= 3\)/);
  assert.match(service, /eq\(tradeFacts\.publicationStatus, "published"\)/);
  assert.doesNotMatch(
    service.slice(service.indexOf("export async function loadPublicTradeOverview")),
    /structuredData: tradeKnowledgeEntities\.structuredData/,
  );
});

test("public and staff user interfaces are routed and discoverable", async () => {
  const app = await read("client/src/App.tsx");
  const navigation = await read("client/src/lib/adminNavRegistry.ts");
  const home = await read("client/src/pages/exportunity/GlobalTradeHomePage.tsx");
  const service = await read("server/lib/trade-intelligence/service.ts");
  assert.match(app, /path="\/trade"/);
  assert.match(app, /path="\/trade\/countries\/:countryCode"/);
  assert.match(app, /path="\/trade\/articles\/:slug"/);
  assert.match(app, /path="\/admin\/trade-intelligence"/);
  assert.match(navigation, /Trade Intelligence/);
  assert.match(home, /href="\/trade"/);
  assert.match(service, /coveragePlan/);
  assert.match(service, /scope: "africa_54"/);
});
