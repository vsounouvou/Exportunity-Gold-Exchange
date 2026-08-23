import { createHash } from "node:crypto";

import {
  and,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  ne,
  or,
  sql,
} from "drizzle-orm";

import { db } from "@db";
import {
  industrialAuditLogs,
  industrialProductRequirements,
  industrialRequirements,
  tasks,
  tradeCoverageCells,
  tradeDemandEvents,
  tradeFacts,
  tradeIndustrySectors,
  tradeIntelligenceAlertImpacts,
  tradeIntelligenceAlerts,
  tradeIntelligenceSources,
  tradeKnowledgeEntities,
  tradeKnowledgeRelationships,
  tradeRegulatoryChanges,
  tradeResearchMissionEvidence,
  tradeResearchMissions,
  tradeSourceComparisons,
  tradeSourceSnapshots,
} from "@db/schema";
import { INDUSTRIAL_TAXONOMY } from "../industrial/taxonomy";
import {
  buildTradeIntelligenceCoverageTargets,
  buildTradeDemandRadar,
  buildZeroResultResearchMission,
  calculateTradePublicationEligibility,
  deriveTradeCoverage,
  normalizeCountryCode,
  normalizeTradeKey,
  normalizeTradeSectorCode,
  resolveTradeIndustrySectorTransition,
  shouldProposeZeroResultMission,
  TRADE_INTELLIGENCE_AFRICA_COUNTRIES,
  TRADE_INTELLIGENCE_PRIORITY_COUNTRIES,
  TRADE_INTELLIGENCE_PRIORITY_SECTORS,
} from "./foundation";
import {
  buildTradeSourceDocumentKey,
  buildTradeSourceSnapshotHash,
  compareTradeSourceSnapshots,
  matchTradeRequirementImpact,
  normalizeTradeSnapshotList,
  normalizeTradeSnapshotText,
} from "./sourceMonitoring";

const CANONICAL_INDUSTRIAL_CATEGORY_CODES = new Set(
  INDUSTRIAL_TAXONOMY.map((category) => category.code),
);

const OPEN_RESEARCH_MISSION_STATUSES = [
  "proposed",
  "queued",
  "in_progress",
  "awaiting_review",
] as const;

const COVERAGE_ENTITY_TYPES: Record<string, string[]> = {
  country_profile: ["country", "market_report"],
  sector_profile: ["sector", "product", "company", "market_report"],
  market_access: ["regulation", "tariff", "certification"],
  regulations: ["regulation", "certification"],
  tariffs: ["tariff"],
  logistics: ["port", "trade_corridor", "logistics_service"],
  companies: ["company"],
  products: ["product"],
  opportunities: ["trade_opportunity"],
  news: ["news_article"],
};

const COVERAGE_EXPECTED_FACTS: Record<string, number> = {
  country_profile: 8,
  sector_profile: 8,
  market_access: 6,
  regulations: 6,
  tariffs: 4,
  logistics: 6,
  companies: 10,
  products: 10,
  opportunities: 5,
  news: 5,
};

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`)
    .join(",")}}`;
}

function toDate(value: Date | string | null | undefined) {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.valueOf()) ? null : parsed;
}

function toOptionalDecimal(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? String(numeric) : null;
}

function normalizeCanonicalCategoryCodes(values: string[]) {
  const normalized = Array.from(
    new Set(
      values
        .map((value) =>
          String(value || "")
            .trim()
            .toLowerCase()
            .replace(/-/g, "_"),
        )
        .filter(Boolean),
    ),
  );
  if (!normalized.length) {
    throw new Error("At least one canonical Industrial OS category is required.");
  }
  const unknown = normalized.filter(
    (code) => !CANONICAL_INDUSTRIAL_CATEGORY_CODES.has(code),
  );
  if (unknown.length) {
    throw new Error(`Unknown canonical Industrial OS categories: ${unknown.join(", ")}.`);
  }
  return normalized;
}

export async function createTradeIndustrySectorProposal(input: {
  tenantId: number;
  userId?: number | null;
  code: string;
  name: string;
  nameFr?: string | null;
  description: string;
  rationale: string;
  canonicalCategoryCodes: string[];
  metadata?: Record<string, unknown>;
}) {
  const code = normalizeTradeSectorCode(input.code);
  if (!code || code === "__all__" || code === "all") {
    throw new Error("A distinct industry-sector code is required.");
  }
  const canonicalCategoryCodes = normalizeCanonicalCategoryCodes(
    input.canonicalCategoryCodes,
  );
  const now = new Date();
  return db.transaction(async (tx) => {
    const [sector] = await tx
      .insert(tradeIndustrySectors)
      .values({
        tenantId: input.tenantId,
        code,
        name: input.name.trim(),
        nameFr: input.nameFr?.trim() || null,
        description: input.description.trim(),
        status: "draft",
        coverageTier: "research_backlog",
        canonicalCategoryCodes,
        rationale: input.rationale.trim(),
        createdByUserId: input.userId || null,
        metadata: {
          ...(input.metadata || {}),
          proposalMode: "visible_governed_proposal",
          coverageTargetsCreated: false,
          externalCommunicationAllowed: false,
        },
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing({
        target: [tradeIndustrySectors.tenantId, tradeIndustrySectors.code],
      })
      .returning();
    if (!sector) {
      throw new Error("That industry-sector code already exists.");
    }
    await tx.insert(industrialAuditLogs).values({
      tenantId: input.tenantId,
      actorUserId: input.userId || null,
      action: "trade_intelligence.industry_sector_proposed",
      entityType: "trade_industry_sector",
      entityId: sector.id,
      nextValue: {
        code: sector.code,
        status: sector.status,
        canonicalCategoryCodes,
      },
      metadata: {
        coverageTargetsCreated: false,
        externalCommunicationAllowed: false,
      },
    });
    return sector;
  });
}

export async function transitionTradeIndustrySector(input: {
  tenantId: number;
  sectorId: string;
  userId?: number | null;
  action: "submit_for_review" | "activate" | "retire";
  reviewNotes: string;
}) {
  const [sector] = await db
    .select()
    .from(tradeIndustrySectors)
    .where(
      and(
        eq(tradeIndustrySectors.tenantId, input.tenantId),
        eq(tradeIndustrySectors.id, input.sectorId),
      ),
    )
    .limit(1);
  if (!sector) throw new Error("The industry sector is unavailable.");

  const nextStatus = resolveTradeIndustrySectorTransition(
    sector.status,
    input.action,
  );
  if (!nextStatus) {
    throw new Error(
      `Industry sector cannot transition from ${sector.status} with ${input.action}.`,
    );
  }
  const canonicalCategoryCodes = normalizeCanonicalCategoryCodes(
    sector.canonicalCategoryCodes || [],
  );
  const now = new Date();
  const coverageTargets =
    nextStatus === "active"
      ? buildTradeIntelligenceCoverageTargets(input.tenantId, [
          {
            code: sector.code,
            name: sector.name,
            nameFr: sector.nameFr || sector.name,
            description: sector.description,
            canonicalCategoryCodes,
            coverageTier: "research_backlog",
          },
        ]).filter((target) => target.dimension === "sector_profile")
      : [];

  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(tradeIndustrySectors)
      .set({
        status: nextStatus,
        approvedByUserId:
          nextStatus === "active"
            ? input.userId || null
            : sector.approvedByUserId,
        approvedAt: nextStatus === "active" ? now : sector.approvedAt,
        retiredAt: nextStatus === "retired" ? now : sector.retiredAt,
        metadata: {
          ...(sector.metadata || {}),
          lastTransition: input.action,
          lastReviewNotes: input.reviewNotes.trim(),
          coverageTargetsCreated: nextStatus === "active",
          externalCommunicationAllowed: false,
        },
        updatedAt: now,
      })
      .where(eq(tradeIndustrySectors.id, sector.id))
      .returning();
    if (coverageTargets.length) {
      await tx
        .insert(tradeCoverageCells)
        .values(coverageTargets)
        .onConflictDoNothing();
    }
    await tx.insert(industrialAuditLogs).values({
      tenantId: input.tenantId,
      actorUserId: input.userId || null,
      action: `trade_intelligence.industry_sector_${nextStatus}`,
      entityType: "trade_industry_sector",
      entityId: sector.id,
      reason: input.reviewNotes.trim(),
      previousValue: { status: sector.status },
      nextValue: {
        status: nextStatus,
        coverageTargetCount: coverageTargets.length,
      },
      metadata: {
        externalCommunicationAllowed: false,
        existingEvidencePreserved: true,
      },
    });
    return {
      sector: updated,
      coverageTargetCount: coverageTargets.length,
    };
  });
}

export async function upsertTradeIntelligenceSource(input: {
  tenantId: number;
  userId?: number | null;
  name: string;
  sourceType: string;
  baseUrl: string;
  countryCode?: string | null;
  languageCodes?: string[];
  trustScore?: number;
  accessPolicy?: string;
  robotsPolicy?: string;
  crawlCadence?: string | null;
  parserKey?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const parsedUrl = new URL(input.baseUrl);
  const normalizedKey = normalizeTradeKey(
    `${input.sourceType}-${input.countryCode || "global"}-${parsedUrl.hostname}`,
  );
  const now = new Date();
  const [source] = await db
    .insert(tradeIntelligenceSources)
    .values({
      tenantId: input.tenantId,
      normalizedKey,
      name: input.name.trim(),
      sourceType: input.sourceType as any,
      countryCode: normalizeCountryCode(input.countryCode),
      domain: parsedUrl.hostname.toLowerCase(),
      baseUrl: parsedUrl.toString(),
      languageCodes: (input.languageCodes || []).map((code) =>
        String(code).trim().toLowerCase(),
      ),
      trustScore: String(Math.min(1, Math.max(0, input.trustScore ?? 0.5))),
      accessPolicy: input.accessPolicy || "public",
      robotsPolicy: input.robotsPolicy || "unknown",
      crawlCadence: input.crawlCadence || null,
      parserKey: input.parserKey || null,
      metadata: input.metadata || {},
      createdByUserId: input.userId || null,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        tradeIntelligenceSources.tenantId,
        tradeIntelligenceSources.normalizedKey,
      ],
      set: {
        name: input.name.trim(),
        sourceType: input.sourceType as any,
        countryCode: normalizeCountryCode(input.countryCode),
        domain: parsedUrl.hostname.toLowerCase(),
        baseUrl: parsedUrl.toString(),
        languageCodes: (input.languageCodes || []).map((code) =>
          String(code).trim().toLowerCase(),
        ),
        trustScore: String(Math.min(1, Math.max(0, input.trustScore ?? 0.5))),
        accessPolicy: input.accessPolicy || "public",
        robotsPolicy: input.robotsPolicy || "unknown",
        crawlCadence: input.crawlCadence || null,
        parserKey: input.parserKey || null,
        metadata: input.metadata || {},
        updatedAt: now,
      },
    })
    .returning();
  return source;
}

export async function upsertTradeKnowledgeEntity(input: {
  tenantId: number;
  userId?: number | null;
  entityType: string;
  canonicalKey?: string;
  slug?: string;
  displayName: string;
  alternateNames?: string[];
  translations?: Record<string, string>;
  countryCode?: string | null;
  sectorCode?: string | null;
  summary?: string | null;
  structuredData?: Record<string, unknown>;
  primarySourceId?: string | null;
}) {
  if (input.primarySourceId) {
    const primarySource = await db.query.tradeIntelligenceSources.findFirst({
      where: and(
        eq(tradeIntelligenceSources.tenantId, input.tenantId),
        eq(tradeIntelligenceSources.id, input.primarySourceId),
        ne(tradeIntelligenceSources.status, "archived"),
      ),
      columns: { id: true },
    });
    if (!primarySource) {
      throw new Error("The primary provenance source is unavailable.");
    }
  }
  const canonicalKey = normalizeTradeKey(
    input.canonicalKey ||
      `${input.countryCode || "global"}-${input.entityType}-${input.displayName}`,
  );
  const slug = normalizeTradeKey(input.slug || input.displayName);
  const now = new Date();
  const [entity] = await db
    .insert(tradeKnowledgeEntities)
    .values({
      tenantId: input.tenantId,
      entityType: input.entityType as any,
      canonicalKey,
      slug,
      displayName: input.displayName.trim(),
      alternateNames: input.alternateNames || [],
      translations: input.translations || {},
      countryCode: normalizeCountryCode(input.countryCode),
      sectorCode: normalizeTradeSectorCode(input.sectorCode) || null,
      summary: input.summary || null,
      structuredData: input.structuredData || {},
      verificationStatus: "evidence_pending",
      publicationStatus: "draft",
      primarySourceId: input.primarySourceId || null,
      createdByUserId: input.userId || null,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        tradeKnowledgeEntities.tenantId,
        tradeKnowledgeEntities.entityType,
        tradeKnowledgeEntities.canonicalKey,
      ],
      set: {
        slug,
        displayName: input.displayName.trim(),
        alternateNames: input.alternateNames || [],
        translations: input.translations || {},
        countryCode: normalizeCountryCode(input.countryCode),
        sectorCode: normalizeTradeSectorCode(input.sectorCode) || null,
        summary: input.summary || null,
        structuredData: input.structuredData || {},
        primarySourceId: input.primarySourceId || null,
        updatedAt: now,
      },
    })
    .returning();
  return entity;
}

export async function upsertTradeKnowledgeRelationship(input: {
  tenantId: number;
  userId?: number | null;
  sourceEntityId: string;
  targetEntityId: string;
  relationshipType: string;
  summary?: string | null;
  structuredData?: Record<string, unknown>;
  confidence?: number;
  validFrom?: Date | string | null;
  validUntil?: Date | string | null;
}) {
  if (input.sourceEntityId === input.targetEntityId) {
    throw new Error("A knowledge relationship must connect distinct entities.");
  }
  const entities = await db
    .select({ id: tradeKnowledgeEntities.id })
    .from(tradeKnowledgeEntities)
    .where(
      and(
        eq(tradeKnowledgeEntities.tenantId, input.tenantId),
        inArray(tradeKnowledgeEntities.id, [
          input.sourceEntityId,
          input.targetEntityId,
        ]),
      ),
    );
  if (new Set(entities.map((entity) => entity.id)).size !== 2) {
    throw new Error("Both knowledge entities must exist in the same tenant.");
  }
  const relationshipType =
    normalizeTradeKey(input.relationshipType).replace(/-/g, "_") || "related_to";
  const now = new Date();
  const [relationship] = await db
    .insert(tradeKnowledgeRelationships)
    .values({
      tenantId: input.tenantId,
      sourceEntityId: input.sourceEntityId,
      targetEntityId: input.targetEntityId,
      relationshipType,
      summary: input.summary || null,
      structuredData: input.structuredData || {},
      confidence: String(
        Math.min(1, Math.max(0, Number(input.confidence || 0))),
      ),
      verificationStatus: "evidence_pending",
      validFrom: toDate(input.validFrom),
      validUntil: toDate(input.validUntil),
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        tradeKnowledgeRelationships.tenantId,
        tradeKnowledgeRelationships.sourceEntityId,
        tradeKnowledgeRelationships.targetEntityId,
        tradeKnowledgeRelationships.relationshipType,
      ],
      set: {
        summary: input.summary || null,
        structuredData: input.structuredData || {},
        confidence: String(
          Math.min(1, Math.max(0, Number(input.confidence || 0))),
        ),
        validFrom: toDate(input.validFrom),
        validUntil: toDate(input.validUntil),
        updatedAt: now,
      },
    })
    .returning();
  await db.insert(industrialAuditLogs).values({
    tenantId: input.tenantId,
    actorUserId: input.userId || null,
    action: "trade_intelligence.relationship_upserted",
    entityType: "trade_knowledge_relationship",
    entityId: relationship.id,
    nextValue: {
      sourceEntityId: relationship.sourceEntityId,
      targetEntityId: relationship.targetEntityId,
      relationshipType: relationship.relationshipType,
    },
  });
  return relationship;
}

async function refreshTradeEntityEligibility(
  tenantId: number,
  entityId: string,
) {
  const evidence = await db
    .select({
      id: tradeFacts.id,
      fieldKey: tradeFacts.fieldKey,
      value: tradeFacts.value,
      sourceId: tradeFacts.sourceId,
      trustScore: tradeIntelligenceSources.trustScore,
      verificationStatus: tradeFacts.verificationStatus,
      verifiedAt: tradeFacts.verifiedAt,
    })
    .from(tradeFacts)
    .innerJoin(
      tradeIntelligenceSources,
      and(
        eq(tradeFacts.sourceId, tradeIntelligenceSources.id),
        eq(tradeFacts.tenantId, tradeIntelligenceSources.tenantId),
      ),
    )
    .where(
      and(eq(tradeFacts.tenantId, tenantId), eq(tradeFacts.entityId, entityId)),
    );

  const verified = evidence.filter(
    (fact) => fact.verificationStatus === "verified",
  );
  const sourceIds = new Set(evidence.map((fact) => fact.sourceId));
  const fieldValues = new Map<string, Set<string>>();
  for (const fact of verified) {
    const values = fieldValues.get(fact.fieldKey) || new Set<string>();
    values.add(stableSerialize(fact.value));
    fieldValues.set(fact.fieldKey, values);
  }
  const hasConflicts = [...fieldValues.values()].some(
    (values) => values.size > 1,
  );
  const freshestVerifiedAt = verified
    .map((fact) => fact.verifiedAt)
    .filter((value): value is Date => Boolean(value))
    .sort((left, right) => right.valueOf() - left.valueOf())[0];
  const eligibility = calculateTradePublicationEligibility({
    factCount: evidence.length,
    verifiedFactCount: verified.length,
    independentSourceCount: sourceIds.size,
    sourceTrustScores: evidence.map((fact) => Number(fact.trustScore || 0)),
    freshestVerifiedAt,
    hasConflicts,
  });

  const [entity] = await db
    .update(tradeKnowledgeEntities)
    .set({
      publicationEligibilityScore: eligibility.score,
      verificationStatus: hasConflicts
        ? "disputed"
        : eligibility.eligible
          ? "verified"
          : evidence.length
            ? "under_review"
            : "evidence_pending",
      lastVerifiedAt: freshestVerifiedAt || null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(tradeKnowledgeEntities.tenantId, tenantId),
        eq(tradeKnowledgeEntities.id, entityId),
      ),
    )
    .returning();

  return { entity, eligibility };
}

export async function reviewTradeKnowledgeEntity(input: {
  tenantId: number;
  entityId: string;
  userId?: number | null;
  action: "request_review" | "approve" | "publish" | "withdraw";
}) {
  const current = await db.query.tradeKnowledgeEntities.findFirst({
    where: and(
      eq(tradeKnowledgeEntities.tenantId, input.tenantId),
      eq(tradeKnowledgeEntities.id, input.entityId),
    ),
  });
  if (!current) throw new Error("The knowledge entity is unavailable.");
  const allowedActions: Record<string, string[]> = {
    draft: ["request_review", "withdraw"],
    review: ["approve", "publish", "withdraw"],
    approved: ["publish", "withdraw"],
    published: ["withdraw"],
    withdrawn: ["request_review"],
  };
  if (!(allowedActions[current.publicationStatus] || []).includes(input.action)) {
    throw new Error(
      `The ${input.action} action is not allowed from ${current.publicationStatus}.`,
    );
  }
  const refreshed = await refreshTradeEntityEligibility(
    input.tenantId,
    input.entityId,
  );
  const entity = refreshed.entity || current;
  if (
    (input.action === "approve" || input.action === "publish") &&
    !refreshed.eligibility.eligible
  ) {
    throw new Error(
      `This entity is not publication-eligible: ${refreshed.eligibility.reasons.join(" ")}`,
    );
  }
  const publicReadyFacts = await db
    .select({ id: tradeFacts.id })
    .from(tradeFacts)
    .where(
      and(
        eq(tradeFacts.tenantId, input.tenantId),
        eq(tradeFacts.entityId, input.entityId),
        eq(tradeFacts.verificationStatus, "verified"),
        sql`${tradeFacts.valueText} is not null and trim(${tradeFacts.valueText}) <> ''`,
      ),
    );
  if (
    (input.action === "approve" || input.action === "publish") &&
    publicReadyFacts.length < 2
  ) {
    throw new Error(
      "At least two verified facts need a public value and citation before approval.",
    );
  }
  const publicationStatus =
    input.action === "request_review"
      ? "review"
      : input.action === "approve"
        ? "approved"
        : input.action === "publish"
          ? "published"
          : "withdrawn";
  const now = new Date();
  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(tradeKnowledgeEntities)
      .set({
        publicationStatus,
        publishedAt: input.action === "publish" ? now : null,
        updatedAt: now,
      })
      .where(eq(tradeKnowledgeEntities.id, input.entityId))
      .returning();
    if (input.action === "approve" || input.action === "publish") {
      await tx
        .update(tradeFacts)
        .set({
          publicationStatus:
            input.action === "publish" ? "published" : "approved",
          publishedAt: input.action === "publish" ? now : null,
          updatedAt: now,
        })
        .where(
          and(
            eq(tradeFacts.tenantId, input.tenantId),
            eq(tradeFacts.entityId, input.entityId),
            eq(tradeFacts.verificationStatus, "verified"),
            sql`${tradeFacts.valueText} is not null and trim(${tradeFacts.valueText}) <> ''`,
          ),
        );
    } else if (input.action === "withdraw") {
      await tx
        .update(tradeFacts)
        .set({ publicationStatus: "withdrawn", publishedAt: null, updatedAt: now })
        .where(
          and(
            eq(tradeFacts.tenantId, input.tenantId),
            eq(tradeFacts.entityId, input.entityId),
            inArray(tradeFacts.publicationStatus, ["approved", "published"]),
          ),
        );
    }
    await tx.insert(industrialAuditLogs).values({
      tenantId: input.tenantId,
      actorUserId: input.userId || null,
      action: `trade_intelligence.entity_${input.action}`,
      entityType: "trade_knowledge_entity",
      entityId: input.entityId,
      previousValue: {
        publicationStatus: current.publicationStatus,
        eligibilityScore: current.publicationEligibilityScore,
      },
      nextValue: {
        publicationStatus: updated.publicationStatus,
        eligibilityScore: updated.publicationEligibilityScore,
        publishedFactCount:
          input.action === "publish" ? publicReadyFacts.length : 0,
      },
      metadata: { eligibility: refreshed.eligibility },
    });
    return {
      entity: updated,
      eligibility: refreshed.eligibility,
      publicFactCount: publicReadyFacts.length,
    };
  });
}

export async function recordTradeFact(input: {
  tenantId: number;
  entityId?: string | null;
  relationshipId?: string | null;
  sourceId: string;
  fieldKey: string;
  value: unknown;
  valueText?: string | null;
  unit?: string | null;
  sourceUrl: string;
  sourceDocumentTitle?: string | null;
  sourcePublishedAt?: Date | string | null;
  effectiveFrom?: Date | string | null;
  effectiveUntil?: Date | string | null;
  evidenceExcerpt?: string | null;
  confidence?: number;
  verificationStatus?: string;
  verifiedByUserId?: number | null;
}) {
  if (Boolean(input.entityId) === Boolean(input.relationshipId)) {
    throw new Error("Exactly one entity or relationship must own a trade fact.");
  }
  const owner = input.entityId
    ? await db.query.tradeKnowledgeEntities.findFirst({
        where: and(
          eq(tradeKnowledgeEntities.tenantId, input.tenantId),
          eq(tradeKnowledgeEntities.id, input.entityId),
        ),
        columns: { id: true },
      })
    : await db.query.tradeKnowledgeRelationships.findFirst({
        where: and(
          eq(tradeKnowledgeRelationships.tenantId, input.tenantId),
          eq(tradeKnowledgeRelationships.id, input.relationshipId!),
        ),
        columns: { id: true },
      });
  const source = await db.query.tradeIntelligenceSources.findFirst({
    where: and(
      eq(tradeIntelligenceSources.tenantId, input.tenantId),
      eq(tradeIntelligenceSources.id, input.sourceId),
      ne(tradeIntelligenceSources.status, "archived"),
    ),
    columns: { id: true },
  });
  if (!owner || !source) {
    throw new Error("The fact owner or provenance source is unavailable.");
  }

  const parsedSourceUrl = new URL(input.sourceUrl).toString();
  const contentHash = createHash("sha256")
    .update(
      stableSerialize({
        ownerId: input.entityId || input.relationshipId,
        fieldKey: input.fieldKey,
        value: input.value,
        sourceUrl: parsedSourceUrl,
      }),
    )
    .digest("hex");
  const verificationStatus = input.verificationStatus || "evidence_pending";
  const verifiedAt =
    verificationStatus === "verified" ? new Date() : null;
  const now = new Date();
  const [fact] = await db
    .insert(tradeFacts)
    .values({
      tenantId: input.tenantId,
      entityId: input.entityId || null,
      relationshipId: input.relationshipId || null,
      fieldKey: normalizeTradeKey(input.fieldKey).replace(/-/g, "_") || "fact",
      value: input.value as any,
      valueText: input.valueText || null,
      unit: input.unit || null,
      sourceId: input.sourceId,
      sourceUrl: parsedSourceUrl,
      sourceDocumentTitle: input.sourceDocumentTitle || null,
      sourcePublishedAt: toDate(input.sourcePublishedAt),
      retrievedAt: now,
      effectiveFrom: toDate(input.effectiveFrom),
      effectiveUntil: toDate(input.effectiveUntil),
      contentHash,
      evidenceExcerpt: input.evidenceExcerpt || null,
      confidence: String(
        Math.min(1, Math.max(0, Number(input.confidence || 0))),
      ),
      verificationStatus: verificationStatus as any,
      publicationStatus: "draft",
      verifiedByUserId:
        verificationStatus === "verified"
          ? input.verifiedByUserId || null
          : null,
      verifiedAt,
      publishedAt: null,
      lastCheckedAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        tradeFacts.tenantId,
        tradeFacts.sourceId,
        tradeFacts.contentHash,
        tradeFacts.fieldKey,
      ],
      set: {
        value: input.value as any,
        valueText: input.valueText || null,
        unit: input.unit || null,
        sourceDocumentTitle: input.sourceDocumentTitle || null,
        sourcePublishedAt: toDate(input.sourcePublishedAt),
        retrievedAt: now,
        effectiveFrom: toDate(input.effectiveFrom),
        effectiveUntil: toDate(input.effectiveUntil),
        evidenceExcerpt: input.evidenceExcerpt || null,
        confidence: String(
          Math.min(1, Math.max(0, Number(input.confidence || 0))),
        ),
        verificationStatus: verificationStatus as any,
        publicationStatus: "draft",
        verifiedByUserId:
          verificationStatus === "verified"
            ? input.verifiedByUserId || null
            : null,
        verifiedAt,
        publishedAt: null,
        lastCheckedAt: now,
        updatedAt: now,
      },
    })
    .returning();

  const eligibility = input.entityId
    ? await refreshTradeEntityEligibility(input.tenantId, input.entityId)
    : null;
  return { fact, eligibility };
}

export async function recordTradeDemandEvent(input: {
  tenantId: number;
  eventType: string;
  sourceSurface: string;
  anonymousSessionId?: string | null;
  userId?: number | null;
  industrialRequirementId?: string | null;
  sourceConversationId?: string | null;
  queryText?: string | null;
  normalizedProduct?: string | null;
  productCategory?: string | null;
  sectorCode?: string | null;
  originCountryCode?: string | null;
  destinationCountryCode?: string | null;
  destinationCity?: string | null;
  commercialIntent?: string | null;
  resultCount?: number | null;
  quantityText?: string | null;
  estimatedValue?: number | string | null;
  currencyCode?: string | null;
  conversionStage?: string | null;
  difficultyScore?: number;
  metadata?: Record<string, unknown>;
}) {
  if (input.industrialRequirementId) {
    const existing = await db.query.tradeDemandEvents.findFirst({
      where: and(
        eq(tradeDemandEvents.tenantId, input.tenantId),
        eq(
          tradeDemandEvents.industrialRequirementId,
          input.industrialRequirementId,
        ),
        eq(tradeDemandEvents.eventType, input.eventType as any),
      ),
    });
    if (existing) return existing;
  }
  const [event] = await db
    .insert(tradeDemandEvents)
    .values({
      tenantId: input.tenantId,
      eventType: input.eventType as any,
      sourceSurface: input.sourceSurface,
      anonymousSessionId: input.anonymousSessionId
        ? createHash("sha256")
            .update(`${input.tenantId}:${input.anonymousSessionId}`)
            .digest("hex")
        : null,
      userId: input.userId || null,
      industrialRequirementId: input.industrialRequirementId || null,
      sourceConversationId: input.sourceConversationId || null,
      queryText: input.queryText || null,
      normalizedProduct:
        normalizeTradeKey(input.normalizedProduct || input.queryText) || null,
      productCategory: input.productCategory || null,
      sectorCode: normalizeTradeSectorCode(input.sectorCode) || null,
      originCountryCode: normalizeCountryCode(input.originCountryCode),
      destinationCountryCode: normalizeCountryCode(
        input.destinationCountryCode,
      ),
      destinationCity: input.destinationCity || null,
      commercialIntent: input.commercialIntent || null,
      resultCount:
        input.resultCount === null || input.resultCount === undefined
          ? null
          : Math.max(0, Math.floor(input.resultCount)),
      quantityText: input.quantityText || null,
      estimatedValue: toOptionalDecimal(input.estimatedValue),
      currencyCode: input.currencyCode
        ? String(input.currencyCode).trim().toUpperCase()
        : null,
      conversionStage: input.conversionStage || null,
      difficultyScore: Math.round(
        Math.min(100, Math.max(0, Number(input.difficultyScore || 0))),
      ),
      metadata: input.metadata || {},
    })
    .returning();
  return event;
}

const TRADE_SOURCE_SNAPSHOT_TYPES = new Set([
  "regulatory",
  "tariff",
  "standard",
  "logistics",
  "company",
  "market",
  "news",
  "other",
]);

const REGULATORY_SNAPSHOT_TYPES = new Set([
  "regulatory",
  "tariff",
  "standard",
]);

function snapshotType(value: unknown) {
  const normalized = normalizeTradeKey(value).replace(/-/g, "_");
  return TRADE_SOURCE_SNAPSHOT_TYPES.has(normalized) ? normalized : "other";
}

function unionSnapshotLists(
  previous: unknown,
  current: unknown,
  countryCodes = false,
) {
  return normalizeTradeSnapshotList(
    [
      ...(Array.isArray(previous) ? previous : []),
      ...(Array.isArray(current) ? current : []),
    ],
    { countryCodes },
  );
}

function sourceHostMatches(baseUrl: string, sourceUrl: string) {
  const baseHost = new URL(baseUrl).hostname.toLowerCase().replace(/^www\./, "");
  const targetHost = new URL(sourceUrl)
    .hostname.toLowerCase()
    .replace(/^www\./, "");
  return targetHost === baseHost || targetHost.endsWith(`.${baseHost}`);
}

function severityFromMateriality(score: number) {
  if (score >= 75) return "critical";
  if (score >= 45) return "material";
  return "informational";
}

async function persistTradeAlertImpacts(
  tx: any,
  input: {
    tenantId: number;
    alertId: string;
    affectedProducts: string[];
    affectedIndustries: string[];
    affectedHsCodes: string[];
    affectedCountryCodes: string[];
    affectedRoutes: string[];
  },
) {
  const requirements = await tx
    .select({
      id: industrialRequirements.id,
      requesterUserId: industrialRequirements.requesterUserId,
      assignedAccountManagerUserId:
        industrialRequirements.assignedAccountManagerUserId,
      customerContactId: industrialRequirements.customerContactId,
      requirementType: industrialRequirements.requirementType,
      categoryCode: industrialRequirements.categoryCode,
      title: industrialRequirements.title,
      details: industrialRequirements.details,
      deliveryCountryCode: industrialRequirements.deliveryCountryCode,
      deliveryCity: industrialRequirements.deliveryCity,
      productName: industrialProductRequirements.productName,
      productCategory: industrialProductRequirements.productCategory,
      specification: industrialProductRequirements.specification,
      origin: industrialProductRequirements.origin,
      destination: industrialProductRequirements.destination,
    })
    .from(industrialRequirements)
    .leftJoin(
      industrialProductRequirements,
      and(
        eq(
          industrialProductRequirements.requirementId,
          industrialRequirements.id,
        ),
        eq(
          industrialProductRequirements.tenantId,
          industrialRequirements.tenantId,
        ),
      ),
    )
    .where(
      and(
        eq(industrialRequirements.tenantId, input.tenantId),
        ne(industrialRequirements.status, "closed"),
        ne(industrialRequirements.status, "cancelled"),
      ),
    )
    .orderBy(desc(industrialRequirements.updatedAt))
    .limit(1_000);

  const impactRows: Array<
    typeof tradeIntelligenceAlertImpacts.$inferInsert
  > = [];
  const affectedRequirementIds = new Set<string>();
  const affectedUserIds = new Set<number>();
  for (const requirement of requirements) {
    const match = matchTradeRequirementImpact(input, requirement);
    if (!match) continue;
    affectedRequirementIds.add(requirement.id);
    const recipients = [
      requirement.requesterUserId
        ? {
            userId: requirement.requesterUserId,
            role: "requester",
          }
        : null,
      requirement.assignedAccountManagerUserId
        ? {
            userId: requirement.assignedAccountManagerUserId,
            role: "account_manager",
          }
        : null,
    ].filter(
      (recipient): recipient is { userId: number; role: string } =>
        Boolean(recipient?.userId),
    );
    if (!recipients.length) {
      impactRows.push({
        tenantId: input.tenantId,
        alertId: input.alertId,
        industrialRequirementId: requirement.id,
        userId: null,
        recipientRole: "unregistered_customer",
        matchKey: `requirement:${requirement.id}:unregistered_customer`,
        matchScore: match.matchScore,
        matchReasons: match.matchReasons,
        status: "identified",
        metadata: {
          customerContactId: requirement.customerContactId,
          notificationSent: false,
        },
      });
    }
    for (const recipient of recipients) {
      affectedUserIds.add(recipient.userId);
      impactRows.push({
        tenantId: input.tenantId,
        alertId: input.alertId,
        industrialRequirementId: requirement.id,
        userId: recipient.userId,
        recipientRole: recipient.role,
        matchKey: `requirement:${requirement.id}:${recipient.role}:${recipient.userId}`,
        matchScore: match.matchScore,
        matchReasons: match.matchReasons,
        status: "identified",
        metadata: { notificationSent: false },
      });
    }
  }
  if (impactRows.length) {
    await tx
      .insert(tradeIntelligenceAlertImpacts)
      .values(impactRows)
      .onConflictDoNothing({
        target: [
          tradeIntelligenceAlertImpacts.tenantId,
          tradeIntelligenceAlertImpacts.alertId,
          tradeIntelligenceAlertImpacts.matchKey,
        ],
      });
  }
  return {
    affectedRequirementCount: affectedRequirementIds.size,
    affectedRegisteredUserCount: affectedUserIds.size,
    impactRecordCount: impactRows.length,
  };
}

export async function captureTradeSourceSnapshot(input: {
  tenantId: number;
  userId?: number | null;
  sourceId: string;
  entityId?: string | null;
  documentKey?: string | null;
  snapshotType: string;
  sourceUrl: string;
  documentTitle: string;
  issuingInstitution?: string | null;
  jurisdictionCountryCode?: string | null;
  languageCode?: string | null;
  versionLabel?: string | null;
  contentText?: string | null;
  structuredData?: Record<string, unknown>;
  publishedAt?: Date | string | null;
  effectiveAt?: Date | string | null;
  affectedProducts?: string[];
  affectedIndustries?: string[];
  affectedHsCodes?: string[];
  affectedCountryCodes?: string[];
  affectedRoutes?: string[];
  metadata?: Record<string, unknown>;
}) {
  const source = await db.query.tradeIntelligenceSources.findFirst({
    where: and(
      eq(tradeIntelligenceSources.tenantId, input.tenantId),
      eq(tradeIntelligenceSources.id, input.sourceId),
      ne(tradeIntelligenceSources.status, "archived"),
    ),
  });
  if (!source) throw new Error("The registered source is unavailable.");
  if (source.status === "blocked" || source.accessPolicy === "not_allowed") {
    throw new Error("This source is blocked by its access policy.");
  }
  if (source.robotsPolicy === "disallowed") {
    throw new Error("This source is marked disallowed in the source registry.");
  }
  const sourceUrl = new URL(input.sourceUrl).toString();
  if (
    source.sourceType !== "manual_evidence" &&
    !sourceHostMatches(source.baseUrl, sourceUrl)
  ) {
    throw new Error(
      "The snapshot URL must belong to the registered source domain.",
    );
  }
  if (input.entityId) {
    const entity = await db.query.tradeKnowledgeEntities.findFirst({
      where: and(
        eq(tradeKnowledgeEntities.tenantId, input.tenantId),
        eq(tradeKnowledgeEntities.id, input.entityId),
      ),
      columns: { id: true },
    });
    if (!entity) throw new Error("The linked knowledge entity is unavailable.");
  }

  const normalizedContent = normalizeTradeSnapshotText(input.contentText);
  const structuredData = input.structuredData || {};
  if (!normalizedContent && !Object.keys(structuredData).length) {
    throw new Error(
      "A source snapshot needs extracted text or structured source fields.",
    );
  }
  const type = snapshotType(input.snapshotType);
  const jurisdictionCountryCode =
    normalizeCountryCode(input.jurisdictionCountryCode) ||
    normalizeCountryCode(source.countryCode);
  if (REGULATORY_SNAPSHOT_TYPES.has(type) && !jurisdictionCountryCode) {
    throw new Error(
      "A regulatory, tariff, or standards snapshot needs a jurisdiction country.",
    );
  }
  const documentKey = buildTradeSourceDocumentKey({
    documentKey: input.documentKey,
    sourceUrl,
    documentTitle: input.documentTitle,
  });
  const affectedProducts = normalizeTradeSnapshotList(input.affectedProducts);
  const affectedIndustries = normalizeTradeSnapshotList(
    input.affectedIndustries,
  );
  const affectedHsCodes = normalizeTradeSnapshotList(input.affectedHsCodes);
  const affectedCountryCodes = normalizeTradeSnapshotList(
    [
      ...(input.affectedCountryCodes || []),
      ...(jurisdictionCountryCode ? [jurisdictionCountryCode] : []),
    ],
    { countryCodes: true },
  );
  const affectedRoutes = normalizeTradeSnapshotList(input.affectedRoutes);
  const publishedAt = toDate(input.publishedAt);
  const effectiveAt = toDate(input.effectiveAt);
  const contentHash = buildTradeSourceSnapshotHash({
    sourceUrl,
    documentTitle: input.documentTitle,
    issuingInstitution: input.issuingInstitution,
    versionLabel: input.versionLabel,
    contentText: normalizedContent,
    structuredData,
    publishedAt,
    effectiveAt,
    affectedProducts,
    affectedIndustries,
    affectedHsCodes,
    affectedCountryCodes,
    affectedRoutes,
  });

  return db.transaction(async (tx) => {
    await tx.execute(sql`
      select pg_advisory_xact_lock(
        ${input.tenantId},
        hashtext(${`trade-source-snapshot:${input.sourceId}:${documentKey}`})
      )
    `);
    const [existing] = await tx
      .select()
      .from(tradeSourceSnapshots)
      .where(
        and(
          eq(tradeSourceSnapshots.tenantId, input.tenantId),
          eq(tradeSourceSnapshots.sourceId, input.sourceId),
          eq(tradeSourceSnapshots.documentKey, documentKey),
          eq(tradeSourceSnapshots.contentHash, contentHash),
        ),
      )
      .limit(1);
    const checkedAt = new Date();
    if (existing) {
      await tx
        .update(tradeIntelligenceSources)
        .set({
          lastCheckedAt: checkedAt,
          lastSucceededAt: checkedAt,
          lastError: null,
          updatedAt: checkedAt,
        })
        .where(
          and(
            eq(tradeIntelligenceSources.tenantId, input.tenantId),
            eq(tradeIntelligenceSources.id, input.sourceId),
          ),
        );
      return {
        snapshot: existing,
        comparison: null,
        regulatoryChange: null,
        alert: null,
        impactSummary: null,
        duplicate: true,
        baseline: false,
      };
    }

    const [previous] = await tx
      .select()
      .from(tradeSourceSnapshots)
      .where(
        and(
          eq(tradeSourceSnapshots.tenantId, input.tenantId),
          eq(tradeSourceSnapshots.sourceId, input.sourceId),
          eq(tradeSourceSnapshots.documentKey, documentKey),
        ),
      )
      .orderBy(desc(tradeSourceSnapshots.retrievedAt))
      .limit(1);
    const [snapshot] = await tx
      .insert(tradeSourceSnapshots)
      .values({
        tenantId: input.tenantId,
        sourceId: input.sourceId,
        entityId: input.entityId || null,
        documentKey,
        snapshotType: type,
        sourceUrl,
        documentTitle: input.documentTitle.trim(),
        issuingInstitution: input.issuingInstitution?.trim() || null,
        jurisdictionCountryCode,
        languageCode: input.languageCode?.trim().toLowerCase() || null,
        versionLabel: input.versionLabel?.trim() || null,
        contentText: normalizedContent || null,
        structuredData,
        affectedProducts,
        affectedIndustries,
        affectedHsCodes,
        affectedCountryCodes,
        affectedRoutes,
        contentHash,
        publishedAt,
        effectiveAt,
        retrievedAt: checkedAt,
        capturedByUserId: input.userId || null,
        metadata: {
          ...(input.metadata || {}),
          captureMode: "visible_manual_or_approved_ingestion",
          crawlerStarted: false,
        },
      })
      .returning();
    await tx
      .update(tradeIntelligenceSources)
      .set({
        lastCheckedAt: checkedAt,
        lastSucceededAt: checkedAt,
        lastError: null,
        updatedAt: checkedAt,
      })
      .where(
        and(
          eq(tradeIntelligenceSources.tenantId, input.tenantId),
          eq(tradeIntelligenceSources.id, input.sourceId),
        ),
      );

    if (!previous) {
      await tx.insert(industrialAuditLogs).values({
        tenantId: input.tenantId,
        actorUserId: input.userId || null,
        action: "trade_intelligence.source_snapshot_baseline_captured",
        entityType: "trade_source_snapshot",
        entityId: snapshot.id,
        nextValue: {
          sourceId: input.sourceId,
          documentKey,
          contentHash,
        },
        metadata: {
          sourceUrl,
          comparisonCreated: false,
          publicationCreated: false,
          externalCommunicationAllowed: false,
        },
      });
      return {
        snapshot,
        comparison: null,
        regulatoryChange: null,
        alert: null,
        impactSummary: null,
        duplicate: false,
        baseline: true,
      };
    }

    const deterministic = compareTradeSourceSnapshots(previous, snapshot);
    const [task] = await tx
      .insert(tasks)
      .values({
        companyId: input.tenantId,
        title: `Review source change: ${snapshot.documentTitle}`.slice(0, 240),
        description: [
          deterministic.deterministicSummary,
          `Previous snapshot: ${previous.id}.`,
          `Current snapshot: ${snapshot.id}.`,
          `Source: ${sourceUrl}.`,
          "Verify substantive meaning, affected products/routes, published date, effective date, and recommended action before any page update or alert delivery.",
        ].join("\n"),
        priority:
          deterministic.materialityScore >= 75
            ? "urgent"
            : deterministic.materialityScore >= 45
              ? "high"
              : "medium",
        status: "backlog",
        executionType: "trade_source_review",
        approvalStatus: "pending",
        isAutomated: false,
      })
      .returning({ id: tasks.id });
    const [comparison] = await tx
      .insert(tradeSourceComparisons)
      .values({
        tenantId: input.tenantId,
        sourceId: input.sourceId,
        previousSnapshotId: previous.id,
        currentSnapshotId: snapshot.id,
        canonicalTaskId: task.id,
        documentKey,
        comparisonHash: deterministic.comparisonHash,
        changedFields: deterministic.changedFields,
        addedPassages: deterministic.addedPassages,
        removedPassages: deterministic.removedPassages,
        affectedScopeChanges: deterministic.affectedScopeChanges,
        textSimilarity: String(deterministic.textSimilarity),
        materialityScore: deterministic.materialityScore,
        isSubstantive: deterministic.isSubstantive,
        deterministicSummary: deterministic.deterministicSummary,
        status: "review_pending",
        metadata: {
          comparisonMethod: "deterministic_structured_and_text_v1",
          semanticReviewCompleted: false,
          notificationSent: false,
          publicationCreated: false,
        },
      })
      .returning();

    let regulatoryChange: typeof tradeRegulatoryChanges.$inferSelect | null =
      null;
    let alert: typeof tradeIntelligenceAlerts.$inferSelect | null = null;
    let impactSummary: Awaited<
      ReturnType<typeof persistTradeAlertImpacts>
    > | null = null;
    if (REGULATORY_SNAPSHOT_TYPES.has(type)) {
      const scope = {
        affectedProducts: unionSnapshotLists(
          previous.affectedProducts,
          snapshot.affectedProducts,
        ),
        affectedIndustries: unionSnapshotLists(
          previous.affectedIndustries,
          snapshot.affectedIndustries,
        ),
        affectedHsCodes: unionSnapshotLists(
          previous.affectedHsCodes,
          snapshot.affectedHsCodes,
        ),
        affectedCountryCodes: unionSnapshotLists(
          previous.affectedCountryCodes,
          snapshot.affectedCountryCodes,
          true,
        ),
        affectedRoutes: unionSnapshotLists(
          previous.affectedRoutes,
          snapshot.affectedRoutes,
        ),
      };
      const severity = severityFromMateriality(
        deterministic.materialityScore,
      );
      const recommendedActions = [
        "Verify the changed passages against the original authority document.",
        "Confirm the published and effective dates separately.",
        "Review the matched open requirements before any customer or supplier notification.",
      ];
      [regulatoryChange] = await tx
        .insert(tradeRegulatoryChanges)
        .values({
          tenantId: input.tenantId,
          sourceId: input.sourceId,
          entityId: input.entityId || null,
          canonicalTaskId: task.id,
          comparisonId: comparison.id,
          previousSnapshotId: previous.id,
          currentSnapshotId: snapshot.id,
          jurisdictionCountryCode: jurisdictionCountryCode!,
          changeType: `${type}_source_update`,
          title: `Potential change: ${snapshot.documentTitle}`,
          summary: deterministic.deterministicSummary,
          issuingInstitution:
            snapshot.issuingInstitution || source.name || null,
          sourceUrl,
          contentHash: deterministic.comparisonHash,
          previousValue: {
            snapshotId: previous.id,
            contentHash: previous.contentHash,
            structuredData: previous.structuredData,
            publishedAt: previous.publishedAt,
            effectiveAt: previous.effectiveAt,
          },
          currentValue: {
            snapshotId: snapshot.id,
            contentHash: snapshot.contentHash,
            structuredData: snapshot.structuredData,
            publishedAt: snapshot.publishedAt,
            effectiveAt: snapshot.effectiveAt,
          },
          ...scope,
          consequences: null,
          recommendedActions,
          confidence: String(
            Math.min(0.7, 0.35 + deterministic.materialityScore / 250),
          ),
          severity,
          verificationStatus: "evidence_pending",
          publicationStatus: "draft",
          sourcePublishedAt: snapshot.publishedAt,
          effectiveAt: snapshot.effectiveAt,
        })
        .returning();
      [alert] = await tx
        .insert(tradeIntelligenceAlerts)
        .values({
          tenantId: input.tenantId,
          comparisonId: comparison.id,
          regulatoryChangeId: regulatoryChange.id,
          entityId: input.entityId || null,
          title: regulatoryChange.title,
          summary: deterministic.deterministicSummary,
          consequences: null,
          severity,
          verificationStatus: "evidence_pending",
          publicationStatus: "draft",
          deliveryStatus: "withheld",
          ...scope,
          recommendedActions,
          sourceUrl,
          sourcePublishedAt: snapshot.publishedAt,
          effectiveAt: snapshot.effectiveAt,
          metadata: {
            notificationApprovalRequired: true,
            notificationSent: false,
            pageUpdateAllowed: false,
          },
        })
        .returning();
      impactSummary = await persistTradeAlertImpacts(tx, {
        tenantId: input.tenantId,
        alertId: alert.id,
        ...scope,
      });
      await tx
        .update(tradeIntelligenceAlerts)
        .set({
          metadata: {
            notificationApprovalRequired: true,
            notificationSent: false,
            pageUpdateAllowed: false,
            ...impactSummary,
          },
          updatedAt: checkedAt,
        })
        .where(eq(tradeIntelligenceAlerts.id, alert.id));
    }

    await tx.insert(industrialAuditLogs).values({
      tenantId: input.tenantId,
      actorUserId: input.userId || null,
      action: "trade_intelligence.source_snapshot_compared",
      entityType: "trade_source_comparison",
      entityId: comparison.id,
      nextValue: {
        canonicalTaskId: task.id,
        materialityScore: comparison.materialityScore,
        isSubstantive: comparison.isSubstantive,
        status: comparison.status,
      },
      metadata: {
        sourceId: input.sourceId,
        previousSnapshotId: previous.id,
        currentSnapshotId: snapshot.id,
        regulatoryChangeId: regulatoryChange?.id || null,
        alertId: alert?.id || null,
        impactSummary,
        semanticReviewCompleted: false,
        externalCommunicationAllowed: false,
      },
    });
    return {
      snapshot,
      comparison,
      regulatoryChange,
      alert,
      impactSummary,
      duplicate: false,
      baseline: false,
    };
  });
}

export async function reviewTradeSourceComparison(input: {
  tenantId: number;
  userId?: number | null;
  comparisonId: string;
  action: "confirm" | "dismiss";
  reviewNotes: string;
  isSubstantive?: boolean;
  consequences?: string | null;
  recommendedActions?: string[];
  severity?: "informational" | "material" | "critical";
}) {
  const comparison = await db.query.tradeSourceComparisons.findFirst({
    where: and(
      eq(tradeSourceComparisons.tenantId, input.tenantId),
      eq(tradeSourceComparisons.id, input.comparisonId),
    ),
  });
  if (!comparison) throw new Error("The source comparison is unavailable.");
  if (comparison.status !== "review_pending") {
    throw new Error("This source comparison has already been reviewed.");
  }
  const [currentSnapshot, regulatoryChange, alert] = await Promise.all([
    db.query.tradeSourceSnapshots.findFirst({
      where: and(
        eq(tradeSourceSnapshots.tenantId, input.tenantId),
        eq(tradeSourceSnapshots.id, comparison.currentSnapshotId),
      ),
    }),
    db.query.tradeRegulatoryChanges.findFirst({
      where: and(
        eq(tradeRegulatoryChanges.tenantId, input.tenantId),
        eq(tradeRegulatoryChanges.comparisonId, comparison.id),
      ),
    }),
    db.query.tradeIntelligenceAlerts.findFirst({
      where: and(
        eq(tradeIntelligenceAlerts.tenantId, input.tenantId),
        eq(tradeIntelligenceAlerts.comparisonId, comparison.id),
      ),
    }),
  ]);
  if (!currentSnapshot) throw new Error("The current snapshot is unavailable.");

  const now = new Date();
  const confirmed = input.action === "confirm";
  const review = await db.transaction(async (tx) => {
    const [updatedComparison] = await tx
      .update(tradeSourceComparisons)
      .set({
        status: confirmed ? "confirmed" : "dismissed",
        isSubstantive:
          input.isSubstantive === undefined
            ? comparison.isSubstantive
            : input.isSubstantive,
        reviewOutcomeNotes: input.reviewNotes,
        reviewedByUserId: input.userId || null,
        reviewedAt: now,
        metadata: {
          ...(comparison.metadata || {}),
          semanticReviewCompleted: true,
          reviewedAction: input.action,
          notificationSent: false,
        },
        updatedAt: now,
      })
      .where(
        and(
          eq(tradeSourceComparisons.tenantId, input.tenantId),
          eq(tradeSourceComparisons.id, comparison.id),
          eq(tradeSourceComparisons.status, "review_pending"),
        ),
      )
      .returning();
    if (!updatedComparison) {
      throw new Error("The source comparison was reviewed concurrently.");
    }
    if (comparison.canonicalTaskId) {
      await tx
        .update(tasks)
        .set({
          status: confirmed ? "done" : "canceled",
          approvalStatus: confirmed ? "approved" : "rejected",
          rejectionReason: confirmed ? null : input.reviewNotes,
          completedAt: confirmed ? now : null,
          updatedAt: now,
        })
        .where(eq(tasks.id, comparison.canonicalTaskId));
    }

    let updatedChange: typeof tradeRegulatoryChanges.$inferSelect | null = null;
    if (regulatoryChange) {
      [updatedChange] = await tx
        .update(tradeRegulatoryChanges)
        .set({
          verificationStatus: confirmed ? "verified" : "disputed",
          publicationStatus: confirmed ? "draft" : "withdrawn",
          severity: input.severity || regulatoryChange.severity,
          consequences:
            input.consequences ||
            (confirmed ? input.reviewNotes : regulatoryChange.consequences),
          recommendedActions:
            input.recommendedActions || regulatoryChange.recommendedActions,
          confidence: confirmed
            ? String(Math.max(0.75, Number(regulatoryChange.confidence || 0)))
            : "0.000",
          reviewedByUserId: input.userId || null,
          reviewedAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(tradeRegulatoryChanges.tenantId, input.tenantId),
            eq(tradeRegulatoryChanges.id, regulatoryChange.id),
          ),
        )
        .returning();
    }

    let updatedAlert: typeof tradeIntelligenceAlerts.$inferSelect | null = null;
    if (alert) {
      [updatedAlert] = await tx
        .update(tradeIntelligenceAlerts)
        .set({
          verificationStatus: confirmed ? "verified" : "disputed",
          publicationStatus: confirmed ? "review" : "withdrawn",
          deliveryStatus: confirmed ? "withheld" : "cancelled",
          severity: input.severity || alert.severity,
          consequences:
            input.consequences ||
            (confirmed ? input.reviewNotes : alert.consequences),
          recommendedActions:
            input.recommendedActions || alert.recommendedActions,
          approvedByUserId: confirmed ? input.userId || null : null,
          approvedAt: confirmed ? now : null,
          metadata: {
            ...(alert.metadata || {}),
            reviewConfirmed: confirmed,
            notificationApprovalRequired: true,
            notificationSent: false,
            pageUpdateAllowed: false,
          },
          updatedAt: now,
        })
        .where(
          and(
            eq(tradeIntelligenceAlerts.tenantId, input.tenantId),
            eq(tradeIntelligenceAlerts.id, alert.id),
          ),
        )
        .returning();
      if (!confirmed) {
        await tx
          .update(tradeIntelligenceAlertImpacts)
          .set({ status: "cancelled", updatedAt: now })
          .where(
            and(
              eq(tradeIntelligenceAlertImpacts.tenantId, input.tenantId),
              eq(tradeIntelligenceAlertImpacts.alertId, alert.id),
            ),
          );
      }
    }

    if (confirmed && updatedChange?.entityId) {
      await tx
        .insert(tradeFacts)
        .values({
          tenantId: input.tenantId,
          entityId: updatedChange.entityId,
          relationshipId: null,
          fieldKey: "regulatory_change",
          value: {
            regulatoryChangeId: updatedChange.id,
            title: updatedChange.title,
            summary: updatedChange.summary,
            consequences: updatedChange.consequences,
            affectedProducts: updatedChange.affectedProducts,
            affectedHsCodes: updatedChange.affectedHsCodes,
            affectedCountryCodes: updatedChange.affectedCountryCodes,
            affectedRoutes: updatedChange.affectedRoutes,
            publishedAt: updatedChange.sourcePublishedAt,
            effectiveAt: updatedChange.effectiveAt,
          },
          valueText: updatedChange.summary,
          sourceId: updatedChange.sourceId,
          sourceUrl: updatedChange.sourceUrl,
          sourceDocumentTitle: currentSnapshot.documentTitle,
          sourcePublishedAt: currentSnapshot.publishedAt,
          retrievedAt: currentSnapshot.retrievedAt,
          effectiveFrom: currentSnapshot.effectiveAt,
          contentHash: updatedChange.contentHash,
          evidenceExcerpt: updatedChange.summary,
          confidence: updatedChange.confidence,
          verificationStatus: "verified",
          publicationStatus: "draft",
          verifiedByUserId: input.userId || null,
          verifiedAt: now,
          lastCheckedAt: now,
        })
        .onConflictDoNothing();
    }

    await tx.insert(industrialAuditLogs).values({
      tenantId: input.tenantId,
      actorUserId: input.userId || null,
      action: confirmed
        ? "trade_intelligence.source_change_confirmed"
        : "trade_intelligence.source_change_dismissed",
      entityType: "trade_source_comparison",
      entityId: comparison.id,
      previousValue: {
        status: comparison.status,
        isSubstantive: comparison.isSubstantive,
      },
      nextValue: {
        status: updatedComparison.status,
        isSubstantive: updatedComparison.isSubstantive,
        regulatoryChangeVerificationStatus:
          updatedChange?.verificationStatus || null,
        alertPublicationStatus: updatedAlert?.publicationStatus || null,
      },
      reason: input.reviewNotes,
      metadata: {
        regulatoryChangeId: updatedChange?.id || null,
        alertId: updatedAlert?.id || null,
        notificationSent: false,
        pageUpdateAllowed: false,
      },
    });
    return {
      comparison: updatedComparison,
      regulatoryChange: updatedChange,
      alert: updatedAlert,
    };
  });

  if (confirmed && review.regulatoryChange?.entityId) {
    await refreshTradeEntityEligibility(
      input.tenantId,
      review.regulatoryChange.entityId,
    );
  }
  return review;
}

export async function recordTradeRegulatoryChange(input: {
  tenantId: number;
  userId?: number | null;
  sourceId: string;
  entityId?: string | null;
  jurisdictionCountryCode: string;
  changeType: string;
  title: string;
  summary: string;
  sourceUrl: string;
  previousValue?: unknown;
  currentValue?: unknown;
  severity?: string;
  effectiveAt?: Date | string | null;
}) {
  const source = await db.query.tradeIntelligenceSources.findFirst({
    where: and(
      eq(tradeIntelligenceSources.tenantId, input.tenantId),
      eq(tradeIntelligenceSources.id, input.sourceId),
      ne(tradeIntelligenceSources.status, "archived"),
    ),
    columns: { id: true },
  });
  if (!source) throw new Error("The regulatory source is unavailable.");
  const jurisdictionCountryCode = normalizeCountryCode(
    input.jurisdictionCountryCode,
  );
  if (!jurisdictionCountryCode) {
    throw new Error("A valid ISO alpha-2 jurisdiction country is required.");
  }
  if (input.entityId) {
    const entity = await db.query.tradeKnowledgeEntities.findFirst({
      where: and(
        eq(tradeKnowledgeEntities.tenantId, input.tenantId),
        eq(tradeKnowledgeEntities.id, input.entityId),
      ),
      columns: { id: true },
    });
    if (!entity) throw new Error("The linked regulation entity is unavailable.");
  }
  const sourceUrl = new URL(input.sourceUrl).toString();
  const contentHash = createHash("sha256")
    .update(
      stableSerialize({
        sourceId: input.sourceId,
        country: jurisdictionCountryCode,
        changeType: input.changeType,
        title: input.title,
        previousValue: input.previousValue,
        currentValue: input.currentValue,
        sourceUrl,
      }),
    )
    .digest("hex");
  const existing = await db.query.tradeRegulatoryChanges.findFirst({
    where: and(
      eq(tradeRegulatoryChanges.tenantId, input.tenantId),
      eq(tradeRegulatoryChanges.sourceId, input.sourceId),
      eq(tradeRegulatoryChanges.contentHash, contentHash),
    ),
  });
  if (existing) return existing;

  return db.transaction(async (tx) => {
    const [task] = await tx
      .insert(tasks)
      .values({
        companyId: input.tenantId,
        title: `Review regulatory change: ${input.title}`,
        description: `${input.summary}\n\nVerify the cited source, effective date, affected products and transaction impact before publication.`,
        priority:
          input.severity === "critical"
            ? "urgent"
            : input.severity === "material"
              ? "high"
              : "medium",
        status: "backlog",
        executionType: "regulatory_review",
        approvalStatus: "pending",
        isAutomated: false,
      })
      .returning({ id: tasks.id });
    const [change] = await tx
      .insert(tradeRegulatoryChanges)
      .values({
        tenantId: input.tenantId,
        sourceId: input.sourceId,
        entityId: input.entityId || null,
        canonicalTaskId: task.id,
        jurisdictionCountryCode,
        changeType:
          normalizeTradeKey(input.changeType).replace(/-/g, "_") || "other",
        title: input.title,
        summary: input.summary,
        sourceUrl,
        contentHash,
        previousValue: input.previousValue as any,
        currentValue: input.currentValue as any,
        severity: input.severity || "informational",
        verificationStatus: "evidence_pending",
        publicationStatus: "draft",
        effectiveAt: toDate(input.effectiveAt),
      })
      .returning();
    await tx.insert(industrialAuditLogs).values({
      tenantId: input.tenantId,
      actorUserId: input.userId || null,
      action: "trade_intelligence.regulatory_change_recorded",
      entityType: "trade_regulatory_change",
      entityId: change.id,
      nextValue: {
        canonicalTaskId: task.id,
        verificationStatus: change.verificationStatus,
        publicationStatus: change.publicationStatus,
      },
      metadata: {
        sourceId: input.sourceId,
        jurisdictionCountryCode: change.jurisdictionCountryCode,
        externalCommunicationAllowed: false,
      },
    });
    return change;
  });
}

export async function createTradeResearchMission(input: {
  tenantId: number;
  userId?: number | null;
  companyId?: number | null;
  assignedAgentId?: number | null;
  missionType: string;
  title: string;
  objective: string;
  countryCode?: string | null;
  sectorCode?: string | null;
  priority?: string;
  triggeredByDemandEventId?: string | null;
  coverageCellId?: string | null;
  evidenceRequirements?: string[];
  metadata?: Record<string, unknown>;
  executionType?: string;
  initialStatus?: "proposed" | "queued";
  approvalStatus?: "pending" | "approved";
}) {
  const executionType = input.executionType || "trade_research";
  if (executionType.length > 20) {
    throw new Error("The canonical task execution type exceeds 20 characters.");
  }
  const initialStatus = input.initialStatus || "proposed";
  const approvalStatus = input.approvalStatus || "pending";
  return db.transaction(async (tx) => {
    const [task] = await tx
      .insert(tasks)
      .values({
        companyId: input.companyId || input.tenantId,
        agentId: input.assignedAgentId || null,
        title: input.title,
        description: input.objective,
        priority: input.priority || "medium",
        status: "backlog",
        executionType: "trade_research",
        approvalStatus: "pending",
        isAutomated: false,
        ...(input.executionType ? { executionType } : {}),
        ...(input.approvalStatus ? { approvalStatus } : {}),
        ...(input.assignedAgentId ? { isAutomated: true } : {}),
      })
      .returning({ id: tasks.id });
    const [mission] = await tx
      .insert(tradeResearchMissions)
      .values({
        tenantId: input.tenantId,
        canonicalTaskId: task.id,
        triggeredByDemandEventId: input.triggeredByDemandEventId || null,
        coverageCellId: input.coverageCellId || null,
        missionType: input.missionType,
        title: input.title,
        objective: input.objective,
        countryCode: normalizeCountryCode(input.countryCode),
        sectorCode: normalizeTradeSectorCode(input.sectorCode) || null,
        priority: input.priority || "medium",
        status: initialStatus,
        approvalStatus,
        assignedAgentId: input.assignedAgentId || null,
        evidenceRequirements: input.evidenceRequirements || [],
        metadata: {
          ...(input.metadata || {}),
          externalCommunicationAllowed: false,
          publicationAllowed: false,
          canonicalExecutionSystem: "tasks",
          canonicalCompanyId: input.companyId || input.tenantId,
        },
        createdByUserId: input.userId || null,
      })
      .returning();
    await tx.insert(industrialAuditLogs).values({
      tenantId: input.tenantId,
      actorUserId: input.userId || null,
      action: "trade_intelligence.research_mission_created",
      entityType: "trade_research_mission",
      entityId: mission.id,
      nextValue: {
        status: mission.status,
        canonicalTaskId: task.id,
        assignedAgentId: mission.assignedAgentId,
      },
      metadata: {
        missionType: mission.missionType,
        countryCode: mission.countryCode,
        sectorCode: mission.sectorCode,
        approvalStatus: mission.approvalStatus,
        executionType,
      },
    });
    return mission;
  });
}

export async function recordTradeResearchMissionEvidence(input: {
  tenantId: number;
  missionId: string;
  userId?: number | null;
  factId?: string | null;
  sourceId: string;
  evidenceType: string;
  title: string;
  sourceUrl: string;
  evidenceExcerpt?: string | null;
  notes?: string | null;
  verificationStatus?: string;
}) {
  const [mission, source, fact] = await Promise.all([
    db.query.tradeResearchMissions.findFirst({
      where: and(
        eq(tradeResearchMissions.tenantId, input.tenantId),
        eq(tradeResearchMissions.id, input.missionId),
      ),
      columns: { id: true, status: true },
    }),
    db.query.tradeIntelligenceSources.findFirst({
      where: and(
        eq(tradeIntelligenceSources.tenantId, input.tenantId),
        eq(tradeIntelligenceSources.id, input.sourceId),
        ne(tradeIntelligenceSources.status, "archived"),
      ),
      columns: { id: true },
    }),
    input.factId
      ? db.query.tradeFacts.findFirst({
          where: and(
            eq(tradeFacts.tenantId, input.tenantId),
            eq(tradeFacts.id, input.factId),
          ),
          columns: { id: true, sourceId: true },
        })
      : Promise.resolve(null),
  ]);
  if (!mission || !source) {
    throw new Error("The mission or evidence source is unavailable.");
  }
  if (input.factId && (!fact || fact.sourceId !== input.sourceId)) {
    throw new Error("The linked fact must use the same provenance source.");
  }
  if (["completed", "cancelled"].includes(mission.status)) {
    throw new Error("Evidence cannot be added to a closed research mission.");
  }
  const sourceUrl = new URL(input.sourceUrl).toString();
  const contentHash = createHash("sha256")
    .update(
      stableSerialize({
        missionId: input.missionId,
        factId: input.factId || null,
        sourceId: input.sourceId,
        evidenceType: input.evidenceType,
        title: input.title,
        sourceUrl,
        evidenceExcerpt: input.evidenceExcerpt || null,
      }),
    )
    .digest("hex");
  const verificationStatus = input.verificationStatus || "evidence_pending";
  const now = new Date();
  return db.transaction(async (tx) => {
    const [evidence] = await tx
      .insert(tradeResearchMissionEvidence)
      .values({
        tenantId: input.tenantId,
        missionId: input.missionId,
        factId: input.factId || null,
        sourceId: input.sourceId,
        evidenceType:
          normalizeTradeKey(input.evidenceType).replace(/-/g, "_") ||
          "source_document",
        title: input.title,
        sourceUrl,
        contentHash,
        evidenceExcerpt: input.evidenceExcerpt || null,
        notes: input.notes || null,
        verificationStatus: verificationStatus as any,
        verifiedByUserId:
          verificationStatus === "verified" ? input.userId || null : null,
        verifiedAt: verificationStatus === "verified" ? now : null,
        createdByUserId: input.userId || null,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          tradeResearchMissionEvidence.tenantId,
          tradeResearchMissionEvidence.missionId,
          tradeResearchMissionEvidence.contentHash,
        ],
        set: {
          factId: input.factId || null,
          sourceId: input.sourceId,
          title: input.title,
          sourceUrl,
          evidenceExcerpt: input.evidenceExcerpt || null,
          notes: input.notes || null,
          verificationStatus: verificationStatus as any,
          verifiedByUserId:
            verificationStatus === "verified" ? input.userId || null : null,
          verifiedAt: verificationStatus === "verified" ? now : null,
          updatedAt: now,
        },
      })
      .returning();
    const [verifiedMetric] = await tx
      .select({ total: sql<number>`count(*)` })
      .from(tradeResearchMissionEvidence)
      .where(
        and(
          eq(tradeResearchMissionEvidence.tenantId, input.tenantId),
          eq(tradeResearchMissionEvidence.missionId, input.missionId),
          eq(tradeResearchMissionEvidence.verificationStatus, "verified"),
        ),
      );
    const verifiedEvidenceCount = Number(verifiedMetric?.total || 0);
    await tx
      .update(tradeResearchMissions)
      .set({ evidenceCount: verifiedEvidenceCount, updatedAt: now })
      .where(eq(tradeResearchMissions.id, input.missionId));
    await tx.insert(industrialAuditLogs).values({
      tenantId: input.tenantId,
      actorUserId: input.userId || null,
      action: "trade_intelligence.research_evidence_recorded",
      entityType: "trade_research_mission",
      entityId: input.missionId,
      nextValue: {
        evidenceId: evidence.id,
        verificationStatus: evidence.verificationStatus,
        verifiedEvidenceCount,
      },
      metadata: {
        sourceId: input.sourceId,
        factId: input.factId || null,
        sourceUrl,
      },
    });
    return { evidence, verifiedEvidenceCount };
  });
}

export async function proposeZeroResultResearchMission(input: {
  tenantId: number;
  demandEventId: string;
  userId?: number | null;
}) {
  const event = await db.query.tradeDemandEvents.findFirst({
    where: and(
      eq(tradeDemandEvents.tenantId, input.tenantId),
      eq(tradeDemandEvents.id, input.demandEventId),
    ),
  });
  if (!event) throw new Error("The demand event is unavailable.");
  if (!shouldProposeZeroResultMission(event)) {
    throw new Error("Only qualified zero-result demand can create a mission.");
  }
  const existing = await db.query.tradeResearchMissions.findFirst({
    where: and(
      eq(tradeResearchMissions.tenantId, input.tenantId),
      eq(tradeResearchMissions.triggeredByDemandEventId, event.id),
      inArray(tradeResearchMissions.status, [
        ...OPEN_RESEARCH_MISSION_STATUSES,
      ]),
    ),
  });
  if (existing) return existing;
  const draft = buildZeroResultResearchMission(event);
  const { evidenceRequirements, ...missionDraft } = draft;
  return createTradeResearchMission({
    tenantId: input.tenantId,
    userId: input.userId,
    ...missionDraft,
    evidenceRequirements: [...evidenceRequirements],
    triggeredByDemandEventId: event.id,
    metadata: {
      product: event.normalizedProduct,
      sourceSurface: event.sourceSurface,
      sourceConversationId: event.sourceConversationId,
    },
  });
}

export async function refreshTradeCoverageCell(input: {
  tenantId: number;
  coverageCellId: string;
  researchInProgress?: boolean;
}) {
  const cell = await db.query.tradeCoverageCells.findFirst({
    where: and(
      eq(tradeCoverageCells.tenantId, input.tenantId),
      eq(tradeCoverageCells.id, input.coverageCellId),
    ),
  });
  if (!cell) throw new Error("The coverage cell is unavailable.");
  const entityTypes = COVERAGE_ENTITY_TYPES[cell.dimension] || [];
  const entityScope = and(
    eq(tradeKnowledgeEntities.tenantId, input.tenantId),
    eq(tradeKnowledgeEntities.countryCode, cell.countryCode),
    entityTypes.length
      ? inArray(tradeKnowledgeEntities.entityType, entityTypes as any)
      : undefined,
    cell.sectorCode !== "__all__"
      ? eq(tradeKnowledgeEntities.sectorCode, cell.sectorCode)
      : undefined,
  );
  const entityRows = await db
    .select({
      id: tradeKnowledgeEntities.id,
      verificationStatus: tradeKnowledgeEntities.verificationStatus,
    })
    .from(tradeKnowledgeEntities)
    .where(entityScope);
  const entityIds = entityRows.map((row) => row.id);
  const verifiedEntityIds = entityRows
    .filter((row) => row.verificationStatus === "verified")
    .map((row) => row.id);
  const factMetrics = entityIds.length
    ? await db
        .select({
          factCount: sql<number>`count(*)`,
          verifiedFactCount: sql<number>`count(*) filter (where ${tradeFacts.verificationStatus} = 'verified')`,
          sourceCount: sql<number>`count(distinct ${tradeFacts.sourceId})`,
          lastVerifiedAt: sql<Date | null>`max(${tradeFacts.verifiedAt})`,
        })
        .from(tradeFacts)
        .where(
          and(
            eq(tradeFacts.tenantId, input.tenantId),
            inArray(tradeFacts.entityId, entityIds),
          ),
        )
    : [];
  const metrics = factMetrics[0] || {
    factCount: 0,
    verifiedFactCount: 0,
    sourceCount: 0,
    lastVerifiedAt: null,
  };
  const factCount = Number(metrics.factCount || 0);
  const [verifiedMetrics] = verifiedEntityIds.length
    ? await db
        .select({
          verifiedFactCount: sql<number>`count(*)`,
          lastVerifiedAt: sql<Date | null>`max(${tradeFacts.verifiedAt})`,
        })
        .from(tradeFacts)
        .where(
          and(
            eq(tradeFacts.tenantId, input.tenantId),
            inArray(tradeFacts.entityId, verifiedEntityIds),
            eq(tradeFacts.verificationStatus, "verified"),
          ),
        )
    : [{ verifiedFactCount: 0, lastVerifiedAt: null }];
  const verifiedFactCount = Number(verifiedMetrics?.verifiedFactCount || 0);
  const sourceCount = Number(metrics.sourceCount || 0);
  const coverage = deriveTradeCoverage({
    expectedFacts: COVERAGE_EXPECTED_FACTS[cell.dimension] || 5,
    factCount,
    verifiedFactCount,
    sourceCount,
    lastVerifiedAt: verifiedMetrics?.lastVerifiedAt,
    researchInProgress: input.researchInProgress,
  });
  const missingFields = [
    factCount ? null : "cited_facts",
    verifiedFactCount < factCount || !factCount ? "verified_facts" : null,
    sourceCount < 2 ? "independent_sources" : null,
  ].filter((value): value is string => Boolean(value));
  const [updated] = await db
    .update(tradeCoverageCells)
    .set({
      ...coverage,
      entityCount: entityRows.length,
      factCount,
      verifiedFactCount,
      sourceCount,
      missingFields,
      lastVerifiedAt: verifiedMetrics?.lastVerifiedAt || null,
      updatedAt: new Date(),
    })
    .where(eq(tradeCoverageCells.id, cell.id))
    .returning();
  return updated;
}

export async function updateTradeResearchMission(input: {
  tenantId: number;
  missionId: string;
  userId?: number | null;
  status: string;
  approvalStatus?: string;
  assignedAgentId?: number | null;
  resultSummary?: string | null;
  recommendedActions?: string[];
  confidence?: number | null;
}) {
  const mission = await db.query.tradeResearchMissions.findFirst({
    where: and(
      eq(tradeResearchMissions.tenantId, input.tenantId),
      eq(tradeResearchMissions.id, input.missionId),
    ),
  });
  if (!mission) throw new Error("The research mission is unavailable.");
  const allowedTransitions: Record<string, string[]> = {
    proposed: ["queued", "blocked", "cancelled"],
    queued: ["in_progress", "blocked", "cancelled"],
    in_progress: ["awaiting_review", "blocked", "cancelled"],
    awaiting_review: ["in_progress", "completed", "blocked", "cancelled"],
    blocked: ["queued", "in_progress", "cancelled"],
    completed: [],
    cancelled: [],
  };
  if (
    input.status !== mission.status &&
    !(allowedTransitions[mission.status] || []).includes(input.status)
  ) {
    throw new Error(
      `A research mission cannot move from ${mission.status} to ${input.status}.`,
    );
  }
  const effectiveApprovalStatus =
    input.approvalStatus || mission.approvalStatus;
  if (
    ["queued", "in_progress", "awaiting_review", "completed"].includes(
      input.status,
    ) &&
    effectiveApprovalStatus !== "approved"
  ) {
    throw new Error("The mission must be approved before it enters execution.");
  }
  const [evidenceMetric] = await db
    .select({ total: sql<number>`count(*)` })
    .from(tradeResearchMissionEvidence)
    .where(
      and(
        eq(tradeResearchMissionEvidence.tenantId, input.tenantId),
        eq(tradeResearchMissionEvidence.missionId, mission.id),
        eq(tradeResearchMissionEvidence.verificationStatus, "verified"),
      ),
    );
  const effectiveEvidenceCount = Number(evidenceMetric?.total || 0);
  const effectiveResultSummary =
    input.resultSummary === undefined
      ? mission.resultSummary
      : input.resultSummary;
  const effectiveConfidence =
    input.confidence === undefined || input.confidence === null
      ? mission.confidence
      : String(Math.min(1, Math.max(0, input.confidence)));
  if (
    input.status === "completed" &&
    (effectiveEvidenceCount < 2 ||
      String(effectiveResultSummary || "").trim().length < 20 ||
      effectiveConfidence === null)
  ) {
    throw new Error(
      "Completion requires at least two evidence items, a result summary, and a confidence score.",
    );
  }
  const status = input.status as any;
  const now = new Date();
  const taskStatus =
    input.status === "completed"
      ? "done"
      : input.status === "awaiting_review"
        ? "done"
      : input.status === "cancelled"
        ? "canceled"
        : input.status === "blocked"
          ? "blocked"
          : input.status === "in_progress"
            ? "in_progress"
            : "backlog";
  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(tradeResearchMissions)
      .set({
        status,
        approvalStatus: effectiveApprovalStatus,
        assignedAgentId:
          input.assignedAgentId === undefined
            ? mission.assignedAgentId
            : input.assignedAgentId,
        resultSummary: effectiveResultSummary,
        recommendedActions:
          input.recommendedActions === undefined
            ? mission.recommendedActions
            : input.recommendedActions,
        confidence: effectiveConfidence,
        evidenceCount: effectiveEvidenceCount,
        startedAt:
          input.status === "in_progress" && !mission.startedAt
            ? now
            : mission.startedAt,
        completedAt: input.status === "completed" ? now : null,
        updatedAt: now,
      })
      .where(eq(tradeResearchMissions.id, mission.id))
      .returning();
    if (mission.canonicalTaskId) {
      await tx
        .update(tasks)
        .set({
          agentId:
            input.assignedAgentId === undefined
              ? mission.assignedAgentId
              : input.assignedAgentId,
          status: taskStatus,
          approvalStatus: effectiveApprovalStatus,
          completedAt: input.status === "completed" ? now : null,
          updatedAt: now,
        })
        .where(eq(tasks.id, mission.canonicalTaskId));
    }
    await tx.insert(industrialAuditLogs).values({
      tenantId: input.tenantId,
      actorUserId: input.userId || null,
      action: "trade_intelligence.research_mission_updated",
      entityType: "trade_research_mission",
      entityId: mission.id,
      previousValue: {
        status: mission.status,
        approvalStatus: mission.approvalStatus,
      },
      nextValue: {
        status: updated.status,
        approvalStatus: updated.approvalStatus,
      },
    });
    return updated;
  });
}

export async function loadTradeIntelligenceDashboard(tenantId: number) {
  const since = new Date(Date.now() - 90 * 86_400_000);
  const [
    sourceMetrics,
    entityMetrics,
    factMetrics,
    relationshipMetrics,
    coverage,
    recentDemand,
    missions,
    regulatoryChanges,
    sources,
    entities,
    sourceSnapshots,
    sourceComparisons,
    intelligenceAlerts,
    alertImpacts,
    sectorCatalog,
  ] = await Promise.all([
    db
      .select({
        status: tradeIntelligenceSources.status,
        total: sql<number>`count(*)`,
      })
      .from(tradeIntelligenceSources)
      .where(eq(tradeIntelligenceSources.tenantId, tenantId))
      .groupBy(tradeIntelligenceSources.status),
    db
      .select({
        entityType: tradeKnowledgeEntities.entityType,
        verificationStatus: tradeKnowledgeEntities.verificationStatus,
        publicationStatus: tradeKnowledgeEntities.publicationStatus,
        total: sql<number>`count(*)`,
      })
      .from(tradeKnowledgeEntities)
      .where(eq(tradeKnowledgeEntities.tenantId, tenantId))
      .groupBy(
        tradeKnowledgeEntities.entityType,
        tradeKnowledgeEntities.verificationStatus,
        tradeKnowledgeEntities.publicationStatus,
      ),
    db
      .select({
        verificationStatus: tradeFacts.verificationStatus,
        total: sql<number>`count(*)`,
      })
      .from(tradeFacts)
      .where(eq(tradeFacts.tenantId, tenantId))
      .groupBy(tradeFacts.verificationStatus),
    db
      .select({ total: sql<number>`count(*)` })
      .from(tradeKnowledgeRelationships)
      .where(eq(tradeKnowledgeRelationships.tenantId, tenantId)),
    db
      .select()
      .from(tradeCoverageCells)
      .where(eq(tradeCoverageCells.tenantId, tenantId))
      .orderBy(
        tradeCoverageCells.countryCode,
        tradeCoverageCells.dimension,
        tradeCoverageCells.sectorCode,
      ),
    db
      .select()
      .from(tradeDemandEvents)
      .where(
        and(
          eq(tradeDemandEvents.tenantId, tenantId),
          gte(tradeDemandEvents.occurredAt, since),
        ),
      )
      .orderBy(desc(tradeDemandEvents.occurredAt))
      .limit(2_000),
    db
      .select()
      .from(tradeResearchMissions)
      .where(eq(tradeResearchMissions.tenantId, tenantId))
      .orderBy(desc(tradeResearchMissions.createdAt))
      .limit(100),
    db
      .select()
      .from(tradeRegulatoryChanges)
      .where(eq(tradeRegulatoryChanges.tenantId, tenantId))
      .orderBy(desc(tradeRegulatoryChanges.detectedAt))
      .limit(100),
    db
      .select()
      .from(tradeIntelligenceSources)
      .where(eq(tradeIntelligenceSources.tenantId, tenantId))
      .orderBy(desc(tradeIntelligenceSources.updatedAt))
      .limit(100),
    db
      .select()
      .from(tradeKnowledgeEntities)
      .where(eq(tradeKnowledgeEntities.tenantId, tenantId))
      .orderBy(desc(tradeKnowledgeEntities.updatedAt))
      .limit(100),
    db
      .select()
      .from(tradeSourceSnapshots)
      .where(eq(tradeSourceSnapshots.tenantId, tenantId))
      .orderBy(desc(tradeSourceSnapshots.retrievedAt))
      .limit(100),
    db
      .select()
      .from(tradeSourceComparisons)
      .where(eq(tradeSourceComparisons.tenantId, tenantId))
      .orderBy(desc(tradeSourceComparisons.createdAt))
      .limit(100),
    db
      .select()
      .from(tradeIntelligenceAlerts)
      .where(eq(tradeIntelligenceAlerts.tenantId, tenantId))
      .orderBy(desc(tradeIntelligenceAlerts.createdAt))
      .limit(100),
    db
      .select()
      .from(tradeIntelligenceAlertImpacts)
      .where(eq(tradeIntelligenceAlertImpacts.tenantId, tenantId))
      .orderBy(desc(tradeIntelligenceAlertImpacts.createdAt))
      .limit(2_000),
    db
      .select()
      .from(tradeIndustrySectors)
      .where(eq(tradeIndustrySectors.tenantId, tenantId))
      .orderBy(tradeIndustrySectors.status, tradeIndustrySectors.name),
  ]);

  const demandRadar = buildTradeDemandRadar(recentDemand).slice(0, 50);
  const impactMetricsByAlert = new Map<
    string,
    {
      affectedRequirementIds: Set<string>;
      affectedUserIds: Set<number>;
      impactRecordCount: number;
    }
  >();
  for (const impact of alertImpacts) {
    const current = impactMetricsByAlert.get(impact.alertId) || {
      affectedRequirementIds: new Set<string>(),
      affectedUserIds: new Set<number>(),
      impactRecordCount: 0,
    };
    current.affectedRequirementIds.add(impact.industrialRequirementId);
    if (impact.userId) current.affectedUserIds.add(impact.userId);
    current.impactRecordCount += 1;
    impactMetricsByAlert.set(impact.alertId, current);
  }
  const alerts = intelligenceAlerts.map((alert) => {
    const impact = impactMetricsByAlert.get(alert.id);
    return {
      ...alert,
      affectedRequirementCount: impact?.affectedRequirementIds.size || 0,
      affectedRegisteredUserCount: impact?.affectedUserIds.size || 0,
      impactRecordCount: impact?.impactRecordCount || 0,
    };
  });
  const asCounts = <T extends { total: unknown }>(rows: T[]) =>
    rows.map((row) => ({ ...row, total: Number(row.total || 0) }));
  const activeSectors = sectorCatalog
    .filter((sector) => sector.status === "active")
    .map((sector) => ({
      code: sector.code,
      name: sector.name,
      nameFr: sector.nameFr || sector.name,
      description: sector.description,
      canonicalCategoryCodes: sector.canonicalCategoryCodes || [],
      coverageTier: sector.coverageTier,
    }));
  return {
    generatedAt: new Date().toISOString(),
    phaseOne: {
      countries: TRADE_INTELLIGENCE_PRIORITY_COUNTRIES,
      sectors: TRADE_INTELLIGENCE_PRIORITY_SECTORS,
    },
    coveragePlan: {
      scope: "africa_54",
      countryCount: TRADE_INTELLIGENCE_AFRICA_COUNTRIES.length,
      priorityCountryCount: TRADE_INTELLIGENCE_PRIORITY_COUNTRIES.length,
      countries: TRADE_INTELLIGENCE_AFRICA_COUNTRIES,
      priorityCountries: TRADE_INTELLIGENCE_PRIORITY_COUNTRIES,
      sectors: activeSectors,
      activeSectorCount: activeSectors.length,
      proposedSectorCount: sectorCatalog.filter(
        (sector) => sector.status === "draft" || sector.status === "review",
      ).length,
      emptyCoverageIsNotEvidence: true,
    },
    graph: {
      sources: asCounts(sourceMetrics),
      entities: asCounts(entityMetrics),
      facts: asCounts(factMetrics),
      relationshipCount: Number(relationshipMetrics[0]?.total || 0),
    },
    coverage,
    demandRadar,
    recentDemand: recentDemand.slice(0, 100),
    missions,
    regulatoryChanges,
    sources,
    entities,
    sourceSnapshots,
    sourceComparisons,
    intelligenceAlerts: alerts,
    alertImpacts: alertImpacts.slice(0, 500),
    sectorCatalog,
    governance: {
      publicationRequiresHumanApproval: true,
      externalCommunicationAllowed: false,
      canonicalMissionExecutionSystem: "tasks",
      publicationEligibilityThreshold: 75,
      sourceMonitoringMode: "visible_manual_or_approved_ingestion",
      automaticAlertDelivery: false,
      sectorActivationRequiresAdminReview: true,
      retiringSectorPreservesEvidence: true,
    },
  };
}

export async function loadPublicTradeOverview(
  tenantId: number,
  filters?: {
    countryCode?: string | null;
    sectorCode?: string | null;
    entityType?: string | null;
    query?: string | null;
  },
) {
  const countryCode = normalizeCountryCode(filters?.countryCode);
  const sectorCode = normalizeTradeSectorCode(filters?.sectorCode) || null;
  const entityType = normalizeTradeKey(filters?.entityType).replace(/-/g, "_");
  const query = String(filters?.query || "").trim().slice(0, 240);
  const [entities, coverage, recentDemand, activeSectorCatalog] = await Promise.all([
    db
      .select({
        id: tradeKnowledgeEntities.id,
        entityType: tradeKnowledgeEntities.entityType,
        slug: tradeKnowledgeEntities.slug,
        displayName: tradeKnowledgeEntities.displayName,
        alternateNames: tradeKnowledgeEntities.alternateNames,
        translations: tradeKnowledgeEntities.translations,
        countryCode: tradeKnowledgeEntities.countryCode,
        sectorCode: tradeKnowledgeEntities.sectorCode,
        summary: tradeKnowledgeEntities.summary,
        lastVerifiedAt: tradeKnowledgeEntities.lastVerifiedAt,
        publishedAt: tradeKnowledgeEntities.publishedAt,
        sourceName: tradeIntelligenceSources.name,
        sourceUrl: tradeIntelligenceSources.baseUrl,
      })
      .from(tradeKnowledgeEntities)
      .leftJoin(
        tradeIntelligenceSources,
        and(
          eq(
            tradeKnowledgeEntities.primarySourceId,
            tradeIntelligenceSources.id,
          ),
          eq(
            tradeKnowledgeEntities.tenantId,
            tradeIntelligenceSources.tenantId,
          ),
        ),
      )
      .where(
        and(
          eq(tradeKnowledgeEntities.tenantId, tenantId),
          eq(tradeKnowledgeEntities.publicationStatus, "published"),
          eq(tradeKnowledgeEntities.verificationStatus, "verified"),
          countryCode
            ? eq(tradeKnowledgeEntities.countryCode, countryCode)
            : undefined,
          sectorCode
            ? eq(tradeKnowledgeEntities.sectorCode, sectorCode)
            : undefined,
          entityType
            ? eq(tradeKnowledgeEntities.entityType, entityType as any)
            : undefined,
          query
            ? or(
                ilike(tradeKnowledgeEntities.displayName, `%${query}%`),
                ilike(tradeKnowledgeEntities.canonicalKey, `%${query}%`),
                ilike(tradeKnowledgeEntities.summary, `%${query}%`),
              )
            : undefined,
        ),
      )
      .orderBy(desc(tradeKnowledgeEntities.publishedAt))
      .limit(100),
    db
      .select({
        countryCode: tradeCoverageCells.countryCode,
        dimension: tradeCoverageCells.dimension,
        sectorCode: tradeCoverageCells.sectorCode,
        status: tradeCoverageCells.status,
        coveragePercent: tradeCoverageCells.coveragePercent,
        qualityScore: tradeCoverageCells.qualityScore,
        lastVerifiedAt: tradeCoverageCells.lastVerifiedAt,
      })
      .from(tradeCoverageCells)
      .where(
        and(
          eq(tradeCoverageCells.tenantId, tenantId),
          inArray(
            tradeCoverageCells.countryCode,
            Array.from(
              new Set([
                ...TRADE_INTELLIGENCE_PRIORITY_COUNTRIES.map(
                  (country) => country.code,
                ),
                ...(countryCode ? [countryCode] : []),
              ]),
            ),
          ),
          sectorCode
            ? eq(tradeCoverageCells.sectorCode, sectorCode)
            : undefined,
        ),
      )
      .orderBy(tradeCoverageCells.countryCode, tradeCoverageCells.dimension),
    db
      .select()
      .from(tradeDemandEvents)
      .where(
        and(
          eq(tradeDemandEvents.tenantId, tenantId),
          gte(
            tradeDemandEvents.occurredAt,
            new Date(Date.now() - 90 * 86_400_000),
          ),
          countryCode
            ? eq(tradeDemandEvents.destinationCountryCode, countryCode)
            : undefined,
          sectorCode
            ? eq(tradeDemandEvents.sectorCode, sectorCode)
            : undefined,
        ),
      )
      .limit(2_000),
    db
      .select({
        code: tradeIndustrySectors.code,
        name: tradeIndustrySectors.name,
        nameFr: tradeIndustrySectors.nameFr,
        description: tradeIndustrySectors.description,
        canonicalCategoryCodes: tradeIndustrySectors.canonicalCategoryCodes,
        coverageTier: tradeIndustrySectors.coverageTier,
      })
      .from(tradeIndustrySectors)
      .where(
        and(
          eq(tradeIndustrySectors.tenantId, tenantId),
          eq(tradeIndustrySectors.status, "active"),
        ),
      )
      .orderBy(tradeIndustrySectors.name),
  ]);
  const demandRadar = buildTradeDemandRadar(recentDemand)
    .filter((signal) => signal.eventCount >= 3)
    .slice(0, 20)
    .map(({ estimatedValues: _estimatedValues, ...signal }) => signal);
  const publishedFacts = entities.length
    ? await db
        .select({
          id: tradeFacts.id,
          entityId: tradeFacts.entityId,
          fieldKey: tradeFacts.fieldKey,
          valueText: tradeFacts.valueText,
          unit: tradeFacts.unit,
          sourceUrl: tradeFacts.sourceUrl,
          sourceDocumentTitle: tradeFacts.sourceDocumentTitle,
          sourceName: tradeIntelligenceSources.name,
          sourcePublishedAt: tradeFacts.sourcePublishedAt,
          retrievedAt: tradeFacts.retrievedAt,
          effectiveFrom: tradeFacts.effectiveFrom,
          effectiveUntil: tradeFacts.effectiveUntil,
          confidence: tradeFacts.confidence,
        })
        .from(tradeFacts)
        .innerJoin(
          tradeIntelligenceSources,
          and(
            eq(tradeFacts.sourceId, tradeIntelligenceSources.id),
            eq(tradeFacts.tenantId, tradeIntelligenceSources.tenantId),
          ),
        )
        .where(
          and(
            eq(tradeFacts.tenantId, tenantId),
            inArray(
              tradeFacts.entityId,
              entities.map((entity) => entity.id),
            ),
            eq(tradeFacts.verificationStatus, "verified"),
            eq(tradeFacts.publicationStatus, "published"),
            ne(tradeIntelligenceSources.status, "archived"),
          ),
        )
        .orderBy(tradeFacts.fieldKey, desc(tradeFacts.retrievedAt))
    : [];
  const factsByEntity = new Map<string, typeof publishedFacts>();
  for (const fact of publishedFacts) {
    if (!fact.entityId) continue;
    factsByEntity.set(fact.entityId, [
      ...(factsByEntity.get(fact.entityId) || []),
      fact,
    ]);
  }
  const publicEntities = entities.map((entity) => ({
    ...entity,
    facts: factsByEntity.get(entity.id) || [],
  }));
  return {
    generatedAt: new Date().toISOString(),
    phaseOne: {
      countries: TRADE_INTELLIGENCE_PRIORITY_COUNTRIES,
      sectors: TRADE_INTELLIGENCE_PRIORITY_SECTORS,
    },
    coveragePlan: {
      scope: "africa_54",
      countryCount: TRADE_INTELLIGENCE_AFRICA_COUNTRIES.length,
      priorityCountryCount: TRADE_INTELLIGENCE_PRIORITY_COUNTRIES.length,
      countries: TRADE_INTELLIGENCE_AFRICA_COUNTRIES,
      priorityCountries: TRADE_INTELLIGENCE_PRIORITY_COUNTRIES,
      sectors: activeSectorCatalog.map((sector) => ({
        ...sector,
        nameFr: sector.nameFr || sector.name,
        canonicalCategoryCodes: sector.canonicalCategoryCodes || [],
      })),
      activeSectorCount: activeSectorCatalog.length,
      proposedSectorCount: 0,
      emptyCoverageIsNotEvidence: true,
    },
    filters: {
      countryCode,
      sectorCode,
      entityType: entityType || null,
      query: query || null,
    },
    entities: publicEntities,
    coverage,
    demandRadar,
    disclosure: {
      publicationRule:
        "Only human-approved, verified entities backed by cited evidence are returned.",
      demandPrivacyThreshold: 3,
      emptyCoverageIsNotEvidence: true,
    },
  };
}
