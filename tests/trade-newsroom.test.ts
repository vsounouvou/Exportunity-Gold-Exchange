import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  assertTradeNewsroomTransition,
  canTransitionTradeNewsroomArticle,
  evaluateNewsroomPublicationReadiness,
} from "../server/lib/trade-intelligence/newsroomPolicy";

const read = (path: string) =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");

const publicationReadyContent = {
  title: "West African port rules change for industrial importers",
  dek: "A sourced explanation of the new rule and what import teams should do next.",
  bodyMarkdown: "A".repeat(500),
  originalAnalysis:
    "The change affects landed-cost planning and evidence collection across the corridor, so buyers should refresh their shipment files before release.",
};

test("newsroom workflow follows research, editor, approval, and human publication gates", () => {
  assert.equal(canTransitionTradeNewsroomArticle("draft", "research_review"), true);
  assert.equal(
    canTransitionTradeNewsroomArticle("research_review", "editor_review"),
    true,
  );
  assert.equal(canTransitionTradeNewsroomArticle("editor_review", "approved"), true);
  assert.equal(canTransitionTradeNewsroomArticle("approved", "published"), true);
  assert.equal(canTransitionTradeNewsroomArticle("draft", "published"), false);
  assert.throws(
    () => assertTradeNewsroomTransition("published", "published"),
    /must change the article status/i,
  );
  assert.throws(
    () => assertTradeNewsroomTransition("draft", "published"),
    /not allowed/i,
  );
});

test("publication readiness refuses short, unverified, single-source, or unconfirmed copy", () => {
  const result = evaluateNewsroomPublicationReadiness({
    title: "Short",
    dek: "Too short",
    bodyMarkdown: "Thin copy",
    originalAnalysis: "No analysis",
    humanConfirmed: false,
    citations: [
      {
        sourceId: "source-one",
        sourceStatus: "active",
        sourceUrl: "https://example.test/report",
        sourceTitle: "Example report",
        citedClaim: "This claim has enough detail.",
        verificationStatus: "under_review",
      },
    ],
  });
  assert.equal(result.eligible, false);
  assert.match(result.reasons.join(" "), /two citations/i);
  assert.match(result.reasons.join(" "), /two active sources/i);
  assert.match(result.reasons.join(" "), /accountable human/i);
  assert.equal(result.checklist.allCitationsVerified, false);
});

test("publication readiness accepts original copy with two active verified sources", () => {
  const result = evaluateNewsroomPublicationReadiness({
    ...publicationReadyContent,
    humanConfirmed: true,
    citations: [
      {
        sourceId: "source-one",
        sourceStatus: "active",
        sourceUrl: "https://authority.example/rule",
        sourceTitle: "Authority rule",
        citedClaim: "The filing rule takes effect in September.",
        verificationStatus: "verified",
      },
      {
        sourceId: "source-two",
        sourceStatus: "active",
        sourceUrl: "https://statistics.example/release",
        sourceTitle: "Statistics release",
        citedClaim: "The corridor handled more industrial cargo this year.",
        verificationStatus: "verified",
      },
    ],
  });
  assert.equal(result.eligible, true);
  assert.equal(result.verifiedCitationCount, 2);
  assert.equal(result.distinctSourceCount, 2);
  assert.deepEqual(result.reasons, []);
});

test("newsroom persistence has immutable revisions, citations, and review events", async () => {
  const [schema, migration, ensure] = await Promise.all([
    read("db/schema/trade-intelligence.ts"),
    read("db/migrations/20270411_exportunity_trade_newsroom.sql"),
    read("server/lib/trade-intelligence/ensureTables.ts"),
  ]);
  for (const table of [
    "trade_newsroom_articles",
    "trade_newsroom_citations",
    "trade_newsroom_revisions",
    "trade_newsroom_review_events",
  ]) {
    assert.match(schema, new RegExp(`"${table}"`));
    assert.match(migration, new RegExp(table));
    assert.match(ensure, new RegExp(table));
  }
  assert.match(migration, /trade_newsroom_revisions_article_version_unique/);
  assert.match(migration, /from_status <> to_status/);
});

test("newsroom APIs separate staff editing from evidence-filtered public reading", async () => {
  const [route, service] = await Promise.all([
    read("server/routes/trade-intelligence.ts"),
    read("server/lib/trade-intelligence/newsroom.ts"),
  ]);
  assert.match(route, /router\.get\("\/newsroom"/);
  assert.match(route, /router\.get\("\/newsroom\/:slug"/);
  assert.match(route, /"\/admin\/newsroom\/articles",\s*ensureTenantAdmin/);
  assert.match(route, /"\/admin\/newsroom\/citations\/:citationId\/review"/);
  assert.match(route, /"\/admin\/newsroom\/articles\/:articleId\/transition"/);
  assert.match(service, /eq\(tradeNewsroomArticles\.status, "published"\)/);
  assert.match(service, /eq\(tradeNewsroomCitations\.verificationStatus, "verified"\)/);
  assert.match(service, /eq\(tradeIntelligenceSources\.status, "active"\)/);
  assert.match(service, /automaticPublication: false/);
  assert.match(service, /pg_advisory_xact_lock/);
  assert.match(service, /lockNewsroomArticle\(tx, input\.tenantId, input\.articleId\)/);
  assert.doesNotMatch(service, /status:\s*"published"[\s\S]{0,200}createTradeNewsroomArticle/);
});
