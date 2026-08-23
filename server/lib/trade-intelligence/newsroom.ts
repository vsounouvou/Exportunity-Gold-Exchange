import { createHash } from "node:crypto";

import { and, asc, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";

import { db } from "@db";
import {
  industrialAuditLogs,
  tradeFacts,
  tradeIntelligenceSources,
  tradeKnowledgeEntities,
  tradeNewsroomArticles,
  tradeNewsroomCitations,
  tradeNewsroomReviewEvents,
  tradeNewsroomRevisions,
  tradeResearchMissions,
  tradeSourceSnapshots,
} from "@db/schema";
import {
  normalizeCountryCode,
  normalizeTradeKey,
  normalizeTradeSectorCode,
} from "./foundation";
import {
  assertTradeNewsroomTransition,
  evaluateNewsroomPublicationReadiness,
  TRADE_NEWSROOM_STORY_TYPES,
  type TradeNewsroomArticleStatus,
  type TradeNewsroomStoryType,
} from "./newsroomPolicy";

type Executor = any;

export class TradeNewsroomError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode = 409,
  ) {
    super(message);
    this.name = "TradeNewsroomError";
  }
}

type NewsroomTranslations = Record<
  string,
  {
    title?: string;
    dek?: string;
    bodyMarkdown?: string;
    reviewStatus?: string;
  }
>;

type NewsroomArticleContentInput = {
  storyType?: TradeNewsroomStoryType;
  slug?: string;
  primaryLanguage?: string;
  title?: string;
  dek?: string | null;
  bodyMarkdown?: string;
  originalAnalysis?: string | null;
  translations?: NewsroomTranslations;
  countryCode?: string | null;
  sectorCode?: string | null;
  tags?: string[];
  linkedEntityIds?: string[];
  seoTitle?: string | null;
  seoDescription?: string | null;
  commercialCta?: Record<string, unknown>;
};

function cleanStringList(values?: string[]) {
  return [...new Set((values || []).map((value) => value.trim()).filter(Boolean))];
}

function normalizeLanguage(value?: string | null) {
  const language = String(value || "en").trim();
  if (!/^[a-z]{2}(?:-[A-Z]{2})?$/.test(language)) {
    throw new TradeNewsroomError(
      "trade_newsroom_language_invalid",
      "Use a two-letter language code, optionally followed by a region such as en-GB.",
      400,
    );
  }
  return language;
}

function normalizeHttpUrl(value: string) {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new TradeNewsroomError(
      "trade_newsroom_source_url_invalid",
      "A citation requires a precise HTTP or HTTPS source URL.",
      400,
    );
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new TradeNewsroomError(
      "trade_newsroom_source_url_invalid",
      "A citation requires a precise HTTP or HTTPS source URL.",
      400,
    );
  }
  parsed.hash = "";
  return parsed.toString();
}

function newsroomCitationHash(input: {
  sourceId: string;
  sourceUrl: string;
  citedClaim: string;
  evidenceExcerpt?: string | null;
  factId?: string | null;
  snapshotId?: string | null;
}) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        sourceId: input.sourceId,
        sourceUrl: input.sourceUrl,
        citedClaim: input.citedClaim.trim(),
        evidenceExcerpt: String(input.evidenceExcerpt || "").trim(),
        factId: input.factId || null,
        snapshotId: input.snapshotId || null,
      }),
    )
    .digest("hex");
}

async function lockNewsroomArticle(
  executor: Executor,
  tenantId: number,
  articleId: string,
) {
  await executor.execute(sql`
    select pg_advisory_xact_lock(
      ${tenantId},
      hashtext(${`trade-newsroom-article:${articleId}`})
    )
  `);
}

async function validateArticleReferences(
  input: {
    tenantId: number;
    knowledgeEntityId?: string | null;
    researchMissionId?: string | null;
    linkedEntityIds?: string[];
  },
  executor: Executor = db,
) {
  const entityIds = cleanStringList([
    ...(input.linkedEntityIds || []),
    ...(input.knowledgeEntityId ? [input.knowledgeEntityId] : []),
  ]);
  if (entityIds.length) {
    const rows = await executor
      .select({ id: tradeKnowledgeEntities.id })
      .from(tradeKnowledgeEntities)
      .where(
        and(
          eq(tradeKnowledgeEntities.tenantId, input.tenantId),
          inArray(tradeKnowledgeEntities.id, entityIds),
        ),
      );
    if (new Set(rows.map((row: { id: string }) => row.id)).size !== entityIds.length) {
      throw new TradeNewsroomError(
        "trade_newsroom_entity_scope_invalid",
        "Every linked knowledge entity must exist in the same tenant.",
        400,
      );
    }
  }
  if (input.researchMissionId) {
    const [mission] = await executor
      .select({ id: tradeResearchMissions.id })
      .from(tradeResearchMissions)
      .where(
        and(
          eq(tradeResearchMissions.tenantId, input.tenantId),
          eq(tradeResearchMissions.id, input.researchMissionId),
        ),
      )
      .limit(1);
    if (!mission) {
      throw new TradeNewsroomError(
        "trade_newsroom_mission_scope_invalid",
        "The linked research mission is unavailable in this tenant.",
        400,
      );
    }
  }
}

async function loadEditorialCitationRows(
  tenantId: number,
  articleId: string,
  executor: Executor = db,
) {
  return executor
    .select({
      id: tradeNewsroomCitations.id,
      articleId: tradeNewsroomCitations.articleId,
      sourceId: tradeNewsroomCitations.sourceId,
      factId: tradeNewsroomCitations.factId,
      snapshotId: tradeNewsroomCitations.snapshotId,
      sequence: tradeNewsroomCitations.sequence,
      sourceUrl: tradeNewsroomCitations.sourceUrl,
      sourceTitle: tradeNewsroomCitations.sourceTitle,
      citedClaim: tradeNewsroomCitations.citedClaim,
      evidenceExcerpt: tradeNewsroomCitations.evidenceExcerpt,
      sourcePublishedAt: tradeNewsroomCitations.sourcePublishedAt,
      retrievedAt: tradeNewsroomCitations.retrievedAt,
      verificationStatus: tradeNewsroomCitations.verificationStatus,
      reviewNotes: tradeNewsroomCitations.reviewNotes,
      reviewedByUserId: tradeNewsroomCitations.reviewedByUserId,
      reviewedAt: tradeNewsroomCitations.reviewedAt,
      createdAt: tradeNewsroomCitations.createdAt,
      updatedAt: tradeNewsroomCitations.updatedAt,
      sourceName: tradeIntelligenceSources.name,
      sourceStatus: tradeIntelligenceSources.status,
      sourceBaseUrl: tradeIntelligenceSources.baseUrl,
      sourceTrustScore: tradeIntelligenceSources.trustScore,
    })
    .from(tradeNewsroomCitations)
    .innerJoin(
      tradeIntelligenceSources,
      and(
        eq(tradeNewsroomCitations.sourceId, tradeIntelligenceSources.id),
        eq(tradeNewsroomCitations.tenantId, tradeIntelligenceSources.tenantId),
      ),
    )
    .where(
      and(
        eq(tradeNewsroomCitations.tenantId, tenantId),
        eq(tradeNewsroomCitations.articleId, articleId),
      ),
    )
    .orderBy(asc(tradeNewsroomCitations.sequence));
}

async function loadCitationReviewContext(
  executor: Executor,
  tenantId: number,
  citationId: string,
) {
  const [citation] = await executor
    .select({
      id: tradeNewsroomCitations.id,
      articleId: tradeNewsroomCitations.articleId,
      verificationStatus: tradeNewsroomCitations.verificationStatus,
      factId: tradeNewsroomCitations.factId,
      sourceId: tradeNewsroomCitations.sourceId,
      articleStatus: tradeNewsroomArticles.status,
      sourceStatus: tradeIntelligenceSources.status,
    })
    .from(tradeNewsroomCitations)
    .innerJoin(
      tradeNewsroomArticles,
      and(
        eq(tradeNewsroomCitations.articleId, tradeNewsroomArticles.id),
        eq(tradeNewsroomCitations.tenantId, tradeNewsroomArticles.tenantId),
      ),
    )
    .innerJoin(
      tradeIntelligenceSources,
      and(
        eq(tradeNewsroomCitations.sourceId, tradeIntelligenceSources.id),
        eq(tradeNewsroomCitations.tenantId, tradeIntelligenceSources.tenantId),
      ),
    )
    .where(
      and(
        eq(tradeNewsroomCitations.tenantId, tenantId),
        eq(tradeNewsroomCitations.id, citationId),
      ),
    )
    .limit(1);
  return citation || null;
}

async function refreshArticleCitationCounters(
  tenantId: number,
  articleId: string,
  executor: Executor = db,
) {
  const citations = await loadEditorialCitationRows(
    tenantId,
    articleId,
    executor,
  );
  const verified = citations.filter(
    (citation: {
      verificationStatus: string;
      sourceStatus: string;
      sourceId: string;
    }) =>
      citation.verificationStatus === "verified" &&
      citation.sourceStatus === "active",
  );
  const counters = {
    citationCount: citations.length,
    verifiedCitationCount: verified.length,
    distinctSourceCount: new Set(verified.map((citation: { sourceId: string }) => citation.sourceId))
      .size,
  };
  await executor
    .update(tradeNewsroomArticles)
    .set({ ...counters, updatedAt: new Date() })
    .where(
      and(
        eq(tradeNewsroomArticles.tenantId, tenantId),
        eq(tradeNewsroomArticles.id, articleId),
      ),
    );
  return { citations, counters };
}

export async function createTradeNewsroomArticle(input: {
  tenantId: number;
  userId?: number | null;
  storyType: TradeNewsroomStoryType;
  slug?: string;
  primaryLanguage?: string;
  title: string;
  dek?: string | null;
  bodyMarkdown: string;
  originalAnalysis?: string | null;
  translations?: NewsroomTranslations;
  countryCode?: string | null;
  sectorCode?: string | null;
  tags?: string[];
  linkedEntityIds?: string[];
  knowledgeEntityId?: string | null;
  researchMissionId?: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  commercialCta?: Record<string, unknown>;
  draftOrigin?: "human" | "ai_assisted" | "imported";
  generationMetadata?: Record<string, unknown>;
}) {
  const title = input.title.trim();
  const bodyMarkdown = input.bodyMarkdown.trim();
  const slug = normalizeTradeKey(input.slug || title);
  if (!title || !bodyMarkdown || !slug) {
    throw new TradeNewsroomError(
      "trade_newsroom_content_invalid",
      "A newsroom draft requires a title, slug, and article body.",
      400,
    );
  }
  const draftOrigin = input.draftOrigin || "human";
  if (
    draftOrigin === "ai_assisted" &&
    !Object.keys(input.generationMetadata || {}).length
  ) {
    throw new TradeNewsroomError(
      "trade_newsroom_generation_provenance_required",
      "AI-assisted drafts must retain their generation provenance.",
      400,
    );
  }
  await validateArticleReferences({
    tenantId: input.tenantId,
    knowledgeEntityId: input.knowledgeEntityId,
    researchMissionId: input.researchMissionId,
    linkedEntityIds: input.linkedEntityIds,
  });
  const now = new Date();
  return db.transaction(async (tx) => {
    const [article] = await tx
      .insert(tradeNewsroomArticles)
      .values({
        tenantId: input.tenantId,
        knowledgeEntityId: input.knowledgeEntityId || null,
        researchMissionId: input.researchMissionId || null,
        storyType: input.storyType,
        status: "draft",
        slug,
        primaryLanguage: normalizeLanguage(input.primaryLanguage),
        title,
        dek: input.dek?.trim() || null,
        bodyMarkdown,
        originalAnalysis: input.originalAnalysis?.trim() || null,
        translations: input.translations || {},
        countryCode: normalizeCountryCode(input.countryCode),
        sectorCode: normalizeTradeSectorCode(input.sectorCode) || null,
        tags: cleanStringList(input.tags),
        linkedEntityIds: cleanStringList(input.linkedEntityIds),
        seoTitle: input.seoTitle?.trim() || null,
        seoDescription: input.seoDescription?.trim() || null,
        commercialCta: input.commercialCta || {},
        draftOrigin,
        generationMetadata: input.generationMetadata || {},
        authoredByUserId: input.userId || null,
        editedByUserId: input.userId || null,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    await tx.insert(tradeNewsroomRevisions).values({
      tenantId: input.tenantId,
      articleId: article.id,
      version: 1,
      status: article.status,
      title: article.title,
      dek: article.dek,
      bodyMarkdown: article.bodyMarkdown,
      originalAnalysis: article.originalAnalysis,
      translations: article.translations,
      changeNote: "Initial newsroom draft",
      actorUserId: input.userId || null,
    });
    await tx.insert(industrialAuditLogs).values({
      tenantId: input.tenantId,
      actorUserId: input.userId || null,
      action: "trade_intelligence.newsroom_article_created",
      entityType: "trade_newsroom_article",
      entityId: article.id,
      nextValue: {
        status: article.status,
        storyType: article.storyType,
        slug: article.slug,
        draftOrigin,
      },
    });
    return article;
  });
}

export async function updateTradeNewsroomArticle(
  input: {
    tenantId: number;
    articleId: string;
    userId?: number | null;
    changeNote: string;
  } & NewsroomArticleContentInput,
) {
  return db.transaction(async (tx) => {
    await lockNewsroomArticle(tx, input.tenantId, input.articleId);
    const [current] = await tx
      .select()
      .from(tradeNewsroomArticles)
      .where(
        and(
          eq(tradeNewsroomArticles.tenantId, input.tenantId),
          eq(tradeNewsroomArticles.id, input.articleId),
        ),
      )
      .limit(1);
    if (!current) {
      throw new TradeNewsroomError(
        "trade_newsroom_article_not_found",
        "The newsroom article was not found.",
        404,
      );
    }
    if (!["draft", "research_review", "editor_review"].includes(current.status)) {
      throw new TradeNewsroomError(
        "trade_newsroom_article_locked",
        "Move the article back into an editable review state before changing its content.",
      );
    }
    await validateArticleReferences(
      {
        tenantId: input.tenantId,
        knowledgeEntityId: current.knowledgeEntityId,
        researchMissionId: current.researchMissionId,
        linkedEntityIds: input.linkedEntityIds ?? current.linkedEntityIds,
      },
      tx,
    );

    const nextVersion = current.currentVersion + 1;
    const now = new Date();
    const next = {
      storyType: input.storyType ?? current.storyType,
      slug:
        input.slug === undefined ? current.slug : normalizeTradeKey(input.slug),
      primaryLanguage:
        input.primaryLanguage === undefined
          ? current.primaryLanguage
          : normalizeLanguage(input.primaryLanguage),
      title: input.title === undefined ? current.title : input.title.trim(),
      dek: input.dek === undefined ? current.dek : input.dek?.trim() || null,
      bodyMarkdown:
        input.bodyMarkdown === undefined
          ? current.bodyMarkdown
          : input.bodyMarkdown.trim(),
      originalAnalysis:
        input.originalAnalysis === undefined
          ? current.originalAnalysis
          : input.originalAnalysis?.trim() || null,
      translations: input.translations ?? current.translations,
      countryCode:
        input.countryCode === undefined
          ? current.countryCode
          : normalizeCountryCode(input.countryCode),
      sectorCode:
        input.sectorCode === undefined
          ? current.sectorCode
          : normalizeTradeSectorCode(input.sectorCode) || null,
      tags:
        input.tags === undefined ? current.tags : cleanStringList(input.tags),
      linkedEntityIds:
        input.linkedEntityIds === undefined
          ? current.linkedEntityIds
          : cleanStringList(input.linkedEntityIds),
      seoTitle:
        input.seoTitle === undefined
          ? current.seoTitle
          : input.seoTitle?.trim() || null,
      seoDescription:
        input.seoDescription === undefined
          ? current.seoDescription
          : input.seoDescription?.trim() || null,
      commercialCta: input.commercialCta ?? current.commercialCta,
    };
    if (!next.title || !next.slug || !next.bodyMarkdown) {
      throw new TradeNewsroomError(
        "trade_newsroom_content_invalid",
        "A newsroom article cannot have an empty title, slug, or body.",
        400,
      );
    }
    const [article] = await tx
      .update(tradeNewsroomArticles)
      .set({
        ...next,
        currentVersion: nextVersion,
        editedByUserId: input.userId || null,
        updatedAt: now,
      })
      .where(
        and(
          eq(tradeNewsroomArticles.tenantId, input.tenantId),
          eq(tradeNewsroomArticles.id, input.articleId),
          eq(tradeNewsroomArticles.currentVersion, current.currentVersion),
          eq(tradeNewsroomArticles.status, current.status),
        ),
      )
      .returning();
    if (!article) {
      throw new TradeNewsroomError(
        "trade_newsroom_revision_conflict",
        "The article changed during editing. Reload it before saving again.",
      );
    }
    await tx.insert(tradeNewsroomRevisions).values({
      tenantId: input.tenantId,
      articleId: article.id,
      version: nextVersion,
      status: article.status,
      title: article.title,
      dek: article.dek,
      bodyMarkdown: article.bodyMarkdown,
      originalAnalysis: article.originalAnalysis,
      translations: article.translations,
      changeNote: input.changeNote.trim(),
      actorUserId: input.userId || null,
    });
    await tx.insert(industrialAuditLogs).values({
      tenantId: input.tenantId,
      actorUserId: input.userId || null,
      action: "trade_intelligence.newsroom_article_revised",
      entityType: "trade_newsroom_article",
      entityId: article.id,
      previousValue: { version: current.currentVersion },
      nextValue: { version: nextVersion, status: article.status },
      metadata: { changeNote: input.changeNote.trim() },
    });
    return article;
  });
}

export async function addTradeNewsroomCitation(input: {
  tenantId: number;
  articleId: string;
  userId?: number | null;
  sourceId: string;
  factId?: string | null;
  snapshotId?: string | null;
  sourceUrl: string;
  sourceTitle: string;
  citedClaim: string;
  evidenceExcerpt?: string | null;
  sourcePublishedAt?: Date | string | null;
}) {
  return db.transaction(async (tx) => {
  await lockNewsroomArticle(tx, input.tenantId, input.articleId);
  const [article] = await tx
    .select({ id: tradeNewsroomArticles.id, status: tradeNewsroomArticles.status })
    .from(tradeNewsroomArticles)
    .where(
      and(
        eq(tradeNewsroomArticles.tenantId, input.tenantId),
        eq(tradeNewsroomArticles.id, input.articleId),
      ),
    )
    .limit(1);
  if (!article) {
    throw new TradeNewsroomError(
      "trade_newsroom_article_not_found",
      "The newsroom article was not found.",
      404,
    );
  }
  if (["approved", "published"].includes(article.status)) {
    throw new TradeNewsroomError(
      "trade_newsroom_citations_locked",
      "Return the article to editor review before changing citations.",
    );
  }
  const [source] = await tx
    .select({ id: tradeIntelligenceSources.id, status: tradeIntelligenceSources.status })
    .from(tradeIntelligenceSources)
    .where(
      and(
        eq(tradeIntelligenceSources.tenantId, input.tenantId),
        eq(tradeIntelligenceSources.id, input.sourceId),
      ),
    )
    .limit(1);
  if (!source || source.status !== "active") {
    throw new TradeNewsroomError(
      "trade_newsroom_source_unavailable",
      "Citations can only be added from active same-tenant source entries.",
      400,
    );
  }
  if (input.factId) {
    const [fact] = await tx
      .select({ id: tradeFacts.id, sourceId: tradeFacts.sourceId })
      .from(tradeFacts)
      .where(
        and(
          eq(tradeFacts.tenantId, input.tenantId),
          eq(tradeFacts.id, input.factId),
          eq(tradeFacts.sourceId, input.sourceId),
        ),
      )
      .limit(1);
    if (!fact) {
      throw new TradeNewsroomError(
        "trade_newsroom_fact_scope_invalid",
        "The cited fact must belong to the selected source and tenant.",
        400,
      );
    }
  }
  if (input.snapshotId) {
    const [snapshot] = await tx
      .select({ id: tradeSourceSnapshots.id })
      .from(tradeSourceSnapshots)
      .where(
        and(
          eq(tradeSourceSnapshots.tenantId, input.tenantId),
          eq(tradeSourceSnapshots.id, input.snapshotId),
          eq(tradeSourceSnapshots.sourceId, input.sourceId),
        ),
      )
      .limit(1);
    if (!snapshot) {
      throw new TradeNewsroomError(
        "trade_newsroom_snapshot_scope_invalid",
        "The cited snapshot must belong to the selected source and tenant.",
        400,
      );
    }
  }

  const sourceUrl = normalizeHttpUrl(input.sourceUrl);
  const sourceTitle = input.sourceTitle.trim();
  const citedClaim = input.citedClaim.trim();
  if (sourceTitle.length < 3 || citedClaim.length < 12) {
    throw new TradeNewsroomError(
      "trade_newsroom_citation_incomplete",
      "A citation needs a source title and the precise claim it supports.",
      400,
    );
  }
  const evidenceExcerpt = String(input.evidenceExcerpt || "").trim() || null;
  if (evidenceExcerpt && evidenceExcerpt.length > 2_000) {
    throw new TradeNewsroomError(
      "trade_newsroom_excerpt_too_long",
      "Keep citation excerpts below 2,000 characters and write original article prose.",
      400,
    );
  }
  const [sequenceResult] = await tx
    .select({ next: sql<number>`coalesce(max(${tradeNewsroomCitations.sequence}), 0) + 1` })
    .from(tradeNewsroomCitations)
    .where(eq(tradeNewsroomCitations.articleId, input.articleId));
  const contentHash = newsroomCitationHash({
    sourceId: input.sourceId,
    sourceUrl,
    citedClaim,
    evidenceExcerpt,
    factId: input.factId,
    snapshotId: input.snapshotId,
  });
  const [citation] = await tx
    .insert(tradeNewsroomCitations)
    .values({
      tenantId: input.tenantId,
      articleId: input.articleId,
      sourceId: input.sourceId,
      factId: input.factId || null,
      snapshotId: input.snapshotId || null,
      sequence: Number(sequenceResult?.next || 1),
      sourceUrl,
      sourceTitle,
      citedClaim,
      evidenceExcerpt,
      sourcePublishedAt: input.sourcePublishedAt
        ? new Date(input.sourcePublishedAt)
        : null,
      contentHash,
      verificationStatus: "under_review",
      createdByUserId: input.userId || null,
      updatedAt: new Date(),
    })
    .onConflictDoNothing()
    .returning();
  if (!citation) {
    throw new TradeNewsroomError(
      "trade_newsroom_citation_duplicate",
      "This evidence is already cited by the article.",
    );
  }
  const { counters } = await refreshArticleCitationCounters(
    input.tenantId,
    input.articleId,
    tx,
  );
  await tx.insert(industrialAuditLogs).values({
    tenantId: input.tenantId,
    actorUserId: input.userId || null,
    action: "trade_intelligence.newsroom_citation_added",
    entityType: "trade_newsroom_citation",
    entityId: citation.id,
    nextValue: {
      articleId: input.articleId,
      sourceId: input.sourceId,
      verificationStatus: citation.verificationStatus,
    },
  });
  return { citation, counters };
  });
}

export async function reviewTradeNewsroomCitation(input: {
  tenantId: number;
  citationId: string;
  userId?: number | null;
  verificationStatus: "verified" | "disputed" | "stale";
  reviewNotes: string;
}) {
  return db.transaction(async (tx) => {
    const initial = await loadCitationReviewContext(
      tx,
      input.tenantId,
      input.citationId,
    );
    if (!initial) {
      throw new TradeNewsroomError(
        "trade_newsroom_citation_not_found",
        "The newsroom citation was not found.",
        404,
      );
    }
    await lockNewsroomArticle(tx, input.tenantId, initial.articleId);
    const current = await loadCitationReviewContext(
      tx,
      input.tenantId,
      input.citationId,
    );
    if (!current) {
      throw new TradeNewsroomError(
        "trade_newsroom_citation_not_found",
        "The newsroom citation was not found.",
        404,
      );
    }
    if (["approved", "published"].includes(current.articleStatus)) {
      throw new TradeNewsroomError(
        "trade_newsroom_citations_locked",
        "Return the article to editor review before changing citation reviews.",
      );
    }
    if (
      input.verificationStatus === "verified" &&
      current.sourceStatus !== "active"
    ) {
      throw new TradeNewsroomError(
        "trade_newsroom_source_unavailable",
        "An inactive source cannot support a verified citation.",
      );
    }
    if (input.verificationStatus === "verified" && current.factId) {
      const [fact] = await tx
        .select({ verificationStatus: tradeFacts.verificationStatus })
        .from(tradeFacts)
        .where(
          and(
            eq(tradeFacts.tenantId, input.tenantId),
            eq(tradeFacts.id, current.factId),
            eq(tradeFacts.sourceId, current.sourceId),
          ),
        )
        .limit(1);
      if (!fact || fact.verificationStatus !== "verified") {
        throw new TradeNewsroomError(
          "trade_newsroom_fact_unverified",
          "Verify the linked graph fact before verifying this citation.",
        );
      }
    }
    const now = new Date();
    const [citation] = await tx
      .update(tradeNewsroomCitations)
      .set({
        verificationStatus: input.verificationStatus,
        reviewNotes: input.reviewNotes.trim(),
        reviewedByUserId: input.userId || null,
        reviewedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(tradeNewsroomCitations.tenantId, input.tenantId),
          eq(tradeNewsroomCitations.id, input.citationId),
        ),
      )
      .returning();
    const { counters } = await refreshArticleCitationCounters(
      input.tenantId,
      current.articleId,
      tx,
    );
    await tx.insert(industrialAuditLogs).values({
      tenantId: input.tenantId,
      actorUserId: input.userId || null,
      action: "trade_intelligence.newsroom_citation_reviewed",
      entityType: "trade_newsroom_citation",
      entityId: citation.id,
      previousValue: { verificationStatus: current.verificationStatus },
      nextValue: { verificationStatus: citation.verificationStatus },
      metadata: { reviewNotes: input.reviewNotes.trim() },
    });
    return { citation, counters };
  });
}

export async function transitionTradeNewsroomArticle(input: {
  tenantId: number;
  articleId: string;
  userId?: number | null;
  toStatus: TradeNewsroomArticleStatus;
  reason: string;
  humanConfirmed: boolean;
}) {
  return db.transaction(async (tx) => {
    await lockNewsroomArticle(tx, input.tenantId, input.articleId);
    const [article] = await tx
      .select()
      .from(tradeNewsroomArticles)
      .where(
        and(
          eq(tradeNewsroomArticles.tenantId, input.tenantId),
          eq(tradeNewsroomArticles.id, input.articleId),
        ),
      )
      .limit(1);
    if (!article) {
      throw new TradeNewsroomError(
        "trade_newsroom_article_not_found",
        "The newsroom article was not found.",
        404,
      );
    }
    assertTradeNewsroomTransition(article.status, input.toStatus);
    const citations = await loadEditorialCitationRows(
      input.tenantId,
      input.articleId,
      tx,
    );
    const readiness = evaluateNewsroomPublicationReadiness({
      title: article.title,
      dek: article.dek,
      bodyMarkdown: article.bodyMarkdown,
      originalAnalysis: article.originalAnalysis,
      citations,
      humanConfirmed: input.humanConfirmed,
    });
    if (
      ["approved", "published"].includes(input.toStatus) &&
      !readiness.eligible
    ) {
      throw new TradeNewsroomError(
        "trade_newsroom_not_publication_ready",
        `The article is not publication-ready: ${readiness.reasons.join(" ")}`,
      );
    }
    const now = new Date();
    const update: Partial<typeof tradeNewsroomArticles.$inferInsert> = {
      status: input.toStatus,
      editedByUserId: input.userId || null,
      updatedAt: now,
    };
    if (input.toStatus === "approved") {
      update.approvedByUserId = input.userId || null;
      update.approvedAt = now;
    }
    if (input.toStatus === "published") {
      update.publishedByUserId = input.userId || null;
      update.publishedAt = now;
      update.withdrawnAt = null;
    }
    if (input.toStatus === "withdrawn") update.withdrawnAt = now;
    if (input.toStatus === "editor_review" && article.status === "withdrawn") {
      update.publishedAt = null;
    }
    const [updated] = await tx
      .update(tradeNewsroomArticles)
      .set(update)
      .where(
        and(
          eq(tradeNewsroomArticles.tenantId, input.tenantId),
          eq(tradeNewsroomArticles.id, input.articleId),
          eq(tradeNewsroomArticles.status, article.status),
        ),
      )
      .returning();
    if (!updated) {
      throw new TradeNewsroomError(
        "trade_newsroom_transition_conflict",
        "The article changed during review. Reload it before retrying.",
      );
    }
    await tx.insert(tradeNewsroomReviewEvents).values({
      tenantId: input.tenantId,
      articleId: input.articleId,
      fromStatus: article.status,
      toStatus: input.toStatus,
      action: `transition_to_${input.toStatus}`,
      reason: input.reason.trim(),
      checklist: readiness.checklist,
      actorUserId: input.userId || null,
    });
    await tx.insert(industrialAuditLogs).values({
      tenantId: input.tenantId,
      actorUserId: input.userId || null,
      action: `trade_intelligence.newsroom_${input.toStatus}`,
      entityType: "trade_newsroom_article",
      entityId: input.articleId,
      previousValue: { status: article.status },
      nextValue: { status: input.toStatus },
      metadata: {
        reason: input.reason.trim(),
        humanConfirmed: input.humanConfirmed,
        readiness,
        automaticPublication: false,
      },
    });
    return { article: updated, readiness };
  });
}

export async function loadAdminTradeNewsroom(
  tenantId: number,
  articleId?: string | null,
) {
  const articles = await db
    .select()
    .from(tradeNewsroomArticles)
    .where(
      and(
        eq(tradeNewsroomArticles.tenantId, tenantId),
        articleId ? eq(tradeNewsroomArticles.id, articleId) : undefined,
      ),
    )
    .orderBy(desc(tradeNewsroomArticles.updatedAt))
    .limit(articleId ? 1 : 100);
  const selectedIds = articles.map((article) => article.id);
  const [citations, revisions, reviewEvents] = selectedIds.length
    ? await Promise.all([
        db
          .select({
            id: tradeNewsroomCitations.id,
            articleId: tradeNewsroomCitations.articleId,
            sourceId: tradeNewsroomCitations.sourceId,
            factId: tradeNewsroomCitations.factId,
            snapshotId: tradeNewsroomCitations.snapshotId,
            sequence: tradeNewsroomCitations.sequence,
            sourceUrl: tradeNewsroomCitations.sourceUrl,
            sourceTitle: tradeNewsroomCitations.sourceTitle,
            citedClaim: tradeNewsroomCitations.citedClaim,
            evidenceExcerpt: tradeNewsroomCitations.evidenceExcerpt,
            sourcePublishedAt: tradeNewsroomCitations.sourcePublishedAt,
            retrievedAt: tradeNewsroomCitations.retrievedAt,
            verificationStatus: tradeNewsroomCitations.verificationStatus,
            reviewNotes: tradeNewsroomCitations.reviewNotes,
            reviewedByUserId: tradeNewsroomCitations.reviewedByUserId,
            reviewedAt: tradeNewsroomCitations.reviewedAt,
            createdAt: tradeNewsroomCitations.createdAt,
            sourceName: tradeIntelligenceSources.name,
            sourceStatus: tradeIntelligenceSources.status,
          })
          .from(tradeNewsroomCitations)
          .innerJoin(
            tradeIntelligenceSources,
            and(
              eq(tradeNewsroomCitations.sourceId, tradeIntelligenceSources.id),
              eq(tradeNewsroomCitations.tenantId, tradeIntelligenceSources.tenantId),
            ),
          )
          .where(
            and(
              eq(tradeNewsroomCitations.tenantId, tenantId),
              inArray(tradeNewsroomCitations.articleId, selectedIds),
            ),
          )
          .orderBy(tradeNewsroomCitations.articleId, tradeNewsroomCitations.sequence),
        db
          .select()
          .from(tradeNewsroomRevisions)
          .where(
            and(
              eq(tradeNewsroomRevisions.tenantId, tenantId),
              inArray(tradeNewsroomRevisions.articleId, selectedIds),
            ),
          )
          .orderBy(desc(tradeNewsroomRevisions.createdAt))
          .limit(articleId ? 100 : 300),
        db
          .select()
          .from(tradeNewsroomReviewEvents)
          .where(
            and(
              eq(tradeNewsroomReviewEvents.tenantId, tenantId),
              inArray(tradeNewsroomReviewEvents.articleId, selectedIds),
            ),
          )
          .orderBy(desc(tradeNewsroomReviewEvents.createdAt))
          .limit(articleId ? 100 : 300),
      ])
    : [[], [], []];
  const citationsByArticle = new Map<string, typeof citations>();
  const revisionsByArticle = new Map<string, typeof revisions>();
  const eventsByArticle = new Map<string, typeof reviewEvents>();
  for (const citation of citations) {
    citationsByArticle.set(citation.articleId, [
      ...(citationsByArticle.get(citation.articleId) || []),
      citation,
    ]);
  }
  for (const revision of revisions) {
    revisionsByArticle.set(revision.articleId, [
      ...(revisionsByArticle.get(revision.articleId) || []),
      revision,
    ]);
  }
  for (const event of reviewEvents) {
    eventsByArticle.set(event.articleId, [
      ...(eventsByArticle.get(event.articleId) || []),
      event,
    ]);
  }
  const hydrated = articles.map((article) => ({
    ...article,
    citations: citationsByArticle.get(article.id) || [],
    revisions: revisionsByArticle.get(article.id) || [],
    reviewEvents: eventsByArticle.get(article.id) || [],
  }));
  return {
    articles: hydrated,
    metrics: {
      total: articles.length,
      draft: articles.filter((article) => article.status === "draft").length,
      inReview: articles.filter((article) =>
        ["research_review", "editor_review"].includes(article.status),
      ).length,
      approved: articles.filter((article) => article.status === "approved").length,
      published: articles.filter((article) => article.status === "published").length,
      blockedByEvidence: articles.filter(
        (article) =>
          article.status !== "published" &&
          (article.verifiedCitationCount < 2 || article.distinctSourceCount < 2),
      ).length,
    },
    governance: {
      minimumVerifiedCitations: 2,
      minimumDistinctActiveSources: 2,
      automaticPublication: false,
      humanApprovalRequired: true,
    },
  };
}

export async function loadPublishedTradeNewsroom(input: {
  tenantId: number;
  slug?: string | null;
  countryCode?: string | null;
  sectorCode?: string | null;
  storyType?: string | null;
  query?: string | null;
  limit?: number;
}) {
  const countryCode = normalizeCountryCode(input.countryCode);
  const sectorCode = normalizeTradeSectorCode(input.sectorCode) || null;
  const requestedStoryType = normalizeTradeKey(input.storyType).replace(/-/g, "_");
  const storyType = TRADE_NEWSROOM_STORY_TYPES.includes(
    requestedStoryType as TradeNewsroomStoryType,
  )
    ? (requestedStoryType as TradeNewsroomStoryType)
    : null;
  const invalidStoryType = Boolean(String(input.storyType || "").trim()) && !storyType;
  const query = String(input.query || "").trim().slice(0, 240);
  const articles = await db
    .select({
      id: tradeNewsroomArticles.id,
      storyType: tradeNewsroomArticles.storyType,
      slug: tradeNewsroomArticles.slug,
      primaryLanguage: tradeNewsroomArticles.primaryLanguage,
      title: tradeNewsroomArticles.title,
      dek: tradeNewsroomArticles.dek,
      bodyMarkdown: tradeNewsroomArticles.bodyMarkdown,
      originalAnalysis: tradeNewsroomArticles.originalAnalysis,
      translations: tradeNewsroomArticles.translations,
      countryCode: tradeNewsroomArticles.countryCode,
      sectorCode: tradeNewsroomArticles.sectorCode,
      tags: tradeNewsroomArticles.tags,
      linkedEntityIds: tradeNewsroomArticles.linkedEntityIds,
      knowledgeEntityId: tradeNewsroomArticles.knowledgeEntityId,
      seoTitle: tradeNewsroomArticles.seoTitle,
      seoDescription: tradeNewsroomArticles.seoDescription,
      commercialCta: tradeNewsroomArticles.commercialCta,
      citationCount: tradeNewsroomArticles.citationCount,
      verifiedCitationCount: tradeNewsroomArticles.verifiedCitationCount,
      distinctSourceCount: tradeNewsroomArticles.distinctSourceCount,
      publishedAt: tradeNewsroomArticles.publishedAt,
      updatedAt: tradeNewsroomArticles.updatedAt,
    })
    .from(tradeNewsroomArticles)
    .where(
      and(
        eq(tradeNewsroomArticles.tenantId, input.tenantId),
        eq(tradeNewsroomArticles.status, "published"),
        invalidStoryType ? sql`false` : undefined,
        input.slug ? eq(tradeNewsroomArticles.slug, normalizeTradeKey(input.slug)) : undefined,
        countryCode ? eq(tradeNewsroomArticles.countryCode, countryCode) : undefined,
        sectorCode ? eq(tradeNewsroomArticles.sectorCode, sectorCode) : undefined,
        storyType ? eq(tradeNewsroomArticles.storyType, storyType) : undefined,
        query
          ? or(
              ilike(tradeNewsroomArticles.title, `%${query}%`),
              ilike(tradeNewsroomArticles.dek, `%${query}%`),
              ilike(tradeNewsroomArticles.bodyMarkdown, `%${query}%`),
            )
          : undefined,
      ),
    )
    .orderBy(desc(tradeNewsroomArticles.publishedAt))
    .limit(Math.min(100, Math.max(1, input.limit || 30)));
  const articleIds = articles.map((article) => article.id);
  const citations = articleIds.length
    ? await db
        .select({
          id: tradeNewsroomCitations.id,
          articleId: tradeNewsroomCitations.articleId,
          sequence: tradeNewsroomCitations.sequence,
          sourceUrl: tradeNewsroomCitations.sourceUrl,
          sourceTitle: tradeNewsroomCitations.sourceTitle,
          citedClaim: tradeNewsroomCitations.citedClaim,
          evidenceExcerpt: tradeNewsroomCitations.evidenceExcerpt,
          sourcePublishedAt: tradeNewsroomCitations.sourcePublishedAt,
          retrievedAt: tradeNewsroomCitations.retrievedAt,
          sourceId: tradeNewsroomCitations.sourceId,
          sourceName: tradeIntelligenceSources.name,
        })
        .from(tradeNewsroomCitations)
        .innerJoin(
          tradeIntelligenceSources,
          and(
            eq(tradeNewsroomCitations.sourceId, tradeIntelligenceSources.id),
            eq(tradeNewsroomCitations.tenantId, tradeIntelligenceSources.tenantId),
          ),
        )
        .where(
          and(
            eq(tradeNewsroomCitations.tenantId, input.tenantId),
            inArray(tradeNewsroomCitations.articleId, articleIds),
            eq(tradeNewsroomCitations.verificationStatus, "verified"),
            eq(tradeIntelligenceSources.status, "active"),
          ),
        )
        .orderBy(tradeNewsroomCitations.articleId, tradeNewsroomCitations.sequence)
    : [];
  const citationsByArticle = new Map<string, typeof citations>();
  for (const citation of citations) {
    const safeCitation = {
      ...citation,
      evidenceExcerpt: citation.evidenceExcerpt?.slice(0, 800) || null,
    };
    citationsByArticle.set(citation.articleId, [
      ...(citationsByArticle.get(citation.articleId) || []),
      safeCitation,
    ]);
  }
  const publicArticles = articles
    .map((article) => ({
      ...article,
      citations: citationsByArticle.get(article.id) || [],
    }))
    .filter(
      (article) =>
        article.citations.length >= 2 &&
        new Set(article.citations.map((citation) => citation.sourceId)).size >= 2,
    );

  const selected = input.slug ? publicArticles[0] || null : null;
  const relatedIds = selected
    ? cleanStringList([
        ...(selected.linkedEntityIds || []),
        ...(selected.knowledgeEntityId ? [selected.knowledgeEntityId] : []),
      ])
    : [];
  const relatedEntities = relatedIds.length
    ? await db
        .select({
          id: tradeKnowledgeEntities.id,
          entityType: tradeKnowledgeEntities.entityType,
          slug: tradeKnowledgeEntities.slug,
          displayName: tradeKnowledgeEntities.displayName,
          countryCode: tradeKnowledgeEntities.countryCode,
          sectorCode: tradeKnowledgeEntities.sectorCode,
          summary: tradeKnowledgeEntities.summary,
        })
        .from(tradeKnowledgeEntities)
        .where(
          and(
            eq(tradeKnowledgeEntities.tenantId, input.tenantId),
            inArray(tradeKnowledgeEntities.id, relatedIds),
            eq(tradeKnowledgeEntities.verificationStatus, "verified"),
            eq(tradeKnowledgeEntities.publicationStatus, "published"),
          ),
        )
    : [];
  return {
    articles: input.slug ? (selected ? [selected] : []) : publicArticles,
    article: selected,
    relatedEntities,
    disclosure: {
      editorialRule:
        "Published stories passed research review, editor review, and explicit human release with at least two verified active sources.",
      automaticPublication: false,
    },
  };
}
