import { Router } from "express";
import { z } from "zod";

import {
  ensureTenantAdmin,
  ensureTenantStaff,
} from "./utils/auth";
import {
  captureTradeSourceSnapshot,
  createTradeIndustrySectorProposal,
  createTradeResearchMission,
  loadPublicTradeOverview,
  loadTradeIntelligenceDashboard,
  proposeZeroResultResearchMission,
  recordTradeDemandEvent,
  recordTradeFact,
  recordTradeRegulatoryChange,
  recordTradeResearchMissionEvidence,
  refreshTradeCoverageCell,
  reviewTradeKnowledgeEntity,
  reviewTradeSourceComparison,
  transitionTradeIndustrySector,
  updateTradeResearchMission,
  upsertTradeIntelligenceSource,
  upsertTradeKnowledgeEntity,
  upsertTradeKnowledgeRelationship,
} from "../lib/trade-intelligence/service";
import { queueTradeSectorProposalFromDemand } from "../lib/trade-intelligence/agentSectorProposal";
import {
  addTradeNewsroomCitation,
  createTradeNewsroomArticle,
  loadAdminTradeNewsroom,
  loadPublishedTradeNewsroom,
  reviewTradeNewsroomCitation,
  TradeNewsroomError,
  transitionTradeNewsroomArticle,
  updateTradeNewsroomArticle,
} from "../lib/trade-intelligence/newsroom";

const router = Router();
const PUBLIC_DEMAND_LIMIT = 40;
const PUBLIC_DEMAND_WINDOW_MS = 60 * 60 * 1000;
const demandWindows = new Map<string, { count: number; resetAt: number }>();

const sourceTypes = [
  "official_registry",
  "customs_authority",
  "statistics_authority",
  "ministry",
  "standards_body",
  "port_authority",
  "logistics_operator",
  "chamber_of_commerce",
  "development_institution",
  "company_website",
  "industry_directory",
  "news_media",
  "research_publication",
  "manual_evidence",
] as const;

const entityTypes = [
  "country",
  "sector",
  "product",
  "company",
  "port",
  "trade_corridor",
  "regulation",
  "tariff",
  "certification",
  "logistics_service",
  "trade_opportunity",
  "market_report",
  "news_article",
] as const;

const verificationStatuses = [
  "evidence_pending",
  "under_review",
  "verified",
  "disputed",
  "stale",
] as const;

const missionStatuses = [
  "proposed",
  "queued",
  "in_progress",
  "awaiting_review",
  "completed",
  "blocked",
  "cancelled",
] as const;

const sourceSnapshotTypes = [
  "regulatory",
  "tariff",
  "standard",
  "logistics",
  "company",
  "market",
  "news",
  "other",
] as const;

const newsroomStoryTypes = [
  "news_brief",
  "regulatory_update",
  "market_analysis",
  "trade_opportunity",
  "logistics_update",
  "original_report",
] as const;

const newsroomArticleStatuses = [
  "draft",
  "research_review",
  "editor_review",
  "approved",
  "published",
  "rejected",
  "withdrawn",
] as const;

const publicDemandSchema = z
  .object({
    eventType: z.enum(["search", "assistant_intent", "zero_result"]),
    sourceSurface: z.string().trim().min(2).max(120),
    sessionId: z.string().trim().min(6).max(160).optional(),
    sourceConversationId: z.string().trim().max(160).optional(),
    queryText: z.string().trim().min(2).max(1_000).optional(),
    normalizedProduct: z.string().trim().min(2).max(240).optional(),
    productCategory: z.string().trim().max(160).optional(),
    sectorCode: z.string().trim().max(120).optional(),
    originCountryCode: z.string().trim().length(2).optional(),
    destinationCountryCode: z.string().trim().length(2).optional(),
    destinationCity: z.string().trim().max(160).optional(),
    commercialIntent: z.string().trim().max(120).optional(),
    resultCount: z.number().int().min(0).max(100_000).optional(),
    quantityText: z.string().trim().max(160).optional(),
    difficultyScore: z.number().int().min(0).max(100).optional(),
    locale: z.string().trim().max(20).optional(),
  })
  .superRefine((value, context) => {
    if (!value.queryText && !value.normalizedProduct) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A query or normalized product is required.",
        path: ["queryText"],
      });
    }
    if (value.eventType === "zero_result" && value.resultCount !== 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Zero-result events must declare a result count of zero.",
        path: ["resultCount"],
      });
    }
  });

const sourceSchema = z.object({
  name: z.string().trim().min(2).max(240),
  sourceType: z.enum(sourceTypes),
  baseUrl: z.string().url().max(2_000),
  countryCode: z.string().trim().length(2).optional().nullable(),
  languageCodes: z.array(z.string().trim().min(2).max(12)).max(20).optional(),
  trustScore: z.number().min(0).max(1).optional(),
  accessPolicy: z
    .enum(["public", "permission_required", "not_allowed"])
    .optional(),
  robotsPolicy: z
    .enum(["unknown", "allowed", "restricted", "disallowed"])
    .optional(),
  crawlCadence: z.string().trim().max(120).optional().nullable(),
  parserKey: z.string().trim().max(160).optional().nullable(),
  metadata: z.record(z.unknown()).optional(),
});

const industrySectorProposalSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2)
    .max(120)
    .regex(/^[A-Za-z0-9_-]+$/),
  name: z.string().trim().min(2).max(240),
  nameFr: z.string().trim().min(2).max(240).optional().nullable(),
  description: z.string().trim().min(10).max(5_000),
  rationale: z.string().trim().min(10).max(5_000),
  canonicalCategoryCodes: z
    .array(z.string().trim().min(2).max(120))
    .min(1)
    .max(20),
});

const industrySectorTransitionSchema = z.object({
  action: z.enum(["submit_for_review", "activate", "retire"]),
  reviewNotes: z.string().trim().min(10).max(10_000),
});

const sourceSnapshotSchema = z
  .object({
    entityId: z.string().uuid().optional().nullable(),
    documentKey: z.string().trim().max(240).optional().nullable(),
    snapshotType: z.enum(sourceSnapshotTypes),
    sourceUrl: z.string().url().max(2_000),
    documentTitle: z.string().trim().min(3).max(500),
    issuingInstitution: z.string().trim().max(500).optional().nullable(),
    jurisdictionCountryCode: z
      .string()
      .trim()
      .regex(/^[A-Za-z]{2}$/)
      .optional()
      .nullable(),
    languageCode: z.string().trim().max(12).optional().nullable(),
    versionLabel: z.string().trim().max(160).optional().nullable(),
    contentText: z.string().trim().max(200_000).optional().nullable(),
    structuredData: z.record(z.unknown()).optional().default({}),
    publishedAt: z.string().datetime().optional().nullable(),
    effectiveAt: z.string().datetime().optional().nullable(),
    affectedProducts: z.array(z.string().trim().min(1).max(500)).max(100).optional(),
    affectedIndustries: z.array(z.string().trim().min(1).max(500)).max(100).optional(),
    affectedHsCodes: z.array(z.string().trim().min(1).max(80)).max(100).optional(),
    affectedCountryCodes: z
      .array(z.string().trim().min(2).max(120))
      .max(100)
      .optional(),
    affectedRoutes: z.array(z.string().trim().min(2).max(500)).max(100).optional(),
    metadata: z.record(z.unknown()).optional(),
  })
  .superRefine((value, context) => {
    if (!value.contentText && !Object.keys(value.structuredData || {}).length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Extracted text or structured source fields are required.",
        path: ["contentText"],
      });
    }
    if (
      ["regulatory", "tariff", "standard"].includes(value.snapshotType) &&
      !value.jurisdictionCountryCode
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A regulatory snapshot needs a jurisdiction country.",
        path: ["jurisdictionCountryCode"],
      });
    }
  });

const sourceComparisonReviewSchema = z.object({
  action: z.enum(["confirm", "dismiss"]),
  reviewNotes: z.string().trim().min(10).max(10_000),
  isSubstantive: z.boolean().optional(),
  consequences: z.string().trim().min(10).max(20_000).optional().nullable(),
  recommendedActions: z
    .array(z.string().trim().min(3).max(2_000))
    .max(30)
    .optional(),
  severity: z.enum(["informational", "material", "critical"]).optional(),
});

const entitySchema = z.object({
  entityType: z.enum(entityTypes),
  canonicalKey: z.string().trim().max(240).optional(),
  slug: z.string().trim().max(180).optional(),
  displayName: z.string().trim().min(2).max(300),
  alternateNames: z.array(z.string().trim().min(1).max(300)).max(100).optional(),
  translations: z.record(z.string().max(500)).optional(),
  countryCode: z.string().trim().length(2).optional().nullable(),
  sectorCode: z.string().trim().max(120).optional().nullable(),
  summary: z.string().trim().max(5_000).optional().nullable(),
  structuredData: z.record(z.unknown()).optional(),
  primarySourceId: z.string().uuid().optional().nullable(),
});

const factSchema = z
  .object({
    entityId: z.string().uuid().optional().nullable(),
    relationshipId: z.string().uuid().optional().nullable(),
    sourceId: z.string().uuid(),
    fieldKey: z.string().trim().min(1).max(160),
    value: z.unknown(),
    valueText: z.string().trim().max(5_000).optional().nullable(),
    unit: z.string().trim().max(80).optional().nullable(),
    sourceUrl: z.string().url().max(2_000),
    sourceDocumentTitle: z.string().trim().max(500).optional().nullable(),
    sourcePublishedAt: z.string().datetime().optional().nullable(),
    effectiveFrom: z.string().datetime().optional().nullable(),
    effectiveUntil: z.string().datetime().optional().nullable(),
    evidenceExcerpt: z.string().trim().max(2_000).optional().nullable(),
    confidence: z.number().min(0).max(1).optional(),
    verificationStatus: z.enum(verificationStatuses).optional(),
  })
  .superRefine((value, context) => {
    if (!Object.prototype.hasOwnProperty.call(value, "value")) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A fact value is required.",
        path: ["value"],
      });
    }
    if (Boolean(value.entityId) === Boolean(value.relationshipId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Exactly one entity or relationship must own the fact.",
        path: ["entityId"],
      });
    }
  });

const relationshipSchema = z
  .object({
    sourceEntityId: z.string().uuid(),
    targetEntityId: z.string().uuid(),
    relationshipType: z.string().trim().min(2).max(160),
    summary: z.string().trim().max(5_000).optional().nullable(),
    structuredData: z.record(z.unknown()).optional(),
    confidence: z.number().min(0).max(1).optional(),
    validFrom: z.string().datetime().optional().nullable(),
    validUntil: z.string().datetime().optional().nullable(),
  })
  .refine((value) => value.sourceEntityId !== value.targetEntityId, {
    message: "A relationship must connect distinct entities.",
    path: ["targetEntityId"],
  });

const entityReviewSchema = z.object({
  action: z.enum(["request_review", "approve", "publish", "withdraw"]),
});

const regulatoryChangeSchema = z.object({
  sourceId: z.string().uuid(),
  entityId: z.string().uuid().optional().nullable(),
  jurisdictionCountryCode: z.string().trim().regex(/^[A-Za-z]{2}$/),
  changeType: z.string().trim().min(2).max(160),
  title: z.string().trim().min(3).max(500),
  summary: z.string().trim().min(10).max(20_000),
  sourceUrl: z.string().url().max(2_000),
  previousValue: z.unknown().optional(),
  currentValue: z.unknown().optional(),
  severity: z
    .enum(["informational", "material", "critical"])
    .optional(),
  effectiveAt: z.string().datetime().optional().nullable(),
});

const missionSchema = z.object({
  missionType: z.string().trim().min(2).max(120),
  title: z.string().trim().min(3).max(500),
  objective: z.string().trim().min(10).max(10_000),
  countryCode: z.string().trim().length(2).optional().nullable(),
  sectorCode: z.string().trim().max(120).optional().nullable(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  triggeredByDemandEventId: z.string().uuid().optional().nullable(),
  coverageCellId: z.string().uuid().optional().nullable(),
  evidenceRequirements: z
    .array(z.string().trim().min(2).max(500))
    .max(30)
    .optional(),
  metadata: z.record(z.unknown()).optional(),
});

const missionUpdateSchema = z.object({
  status: z.enum(missionStatuses),
  approvalStatus: z.enum(["pending", "approved", "rejected"]).optional(),
  assignedAgentId: z.number().int().positive().optional().nullable(),
  resultSummary: z.string().trim().max(20_000).optional().nullable(),
  recommendedActions: z
    .array(z.string().trim().min(2).max(2_000))
    .max(30)
    .optional(),
  confidence: z.number().min(0).max(1).optional().nullable(),
});

const missionEvidenceSchema = z.object({
  factId: z.string().uuid().optional().nullable(),
  sourceId: z.string().uuid(),
  evidenceType: z.string().trim().min(2).max(160),
  title: z.string().trim().min(3).max(500),
  sourceUrl: z.string().url().max(2_000),
  evidenceExcerpt: z.string().trim().max(2_000).optional().nullable(),
  notes: z.string().trim().max(5_000).optional().nullable(),
  verificationStatus: z.enum(verificationStatuses).optional(),
});

const newsroomTranslationsSchema = z.record(
  z.object({
    title: z.string().trim().max(500).optional(),
    dek: z.string().trim().max(1_000).optional(),
    bodyMarkdown: z.string().trim().max(100_000).optional(),
    reviewStatus: z.string().trim().max(80).optional(),
  }),
);

const newsroomArticleFieldsSchema = z.object({
    storyType: z.enum(newsroomStoryTypes),
    slug: z.string().trim().min(2).max(180).optional(),
    primaryLanguage: z
      .string()
      .trim()
      .regex(/^[a-z]{2}(?:-[A-Z]{2})?$/)
      .optional(),
    title: z.string().trim().min(3).max(500),
    dek: z.string().trim().max(1_000).optional().nullable(),
    bodyMarkdown: z.string().trim().min(1).max(100_000),
    originalAnalysis: z.string().trim().max(50_000).optional().nullable(),
    translations: newsroomTranslationsSchema.optional(),
    countryCode: z
      .string()
      .trim()
      .regex(/^[A-Za-z]{2}$/)
      .optional()
      .nullable(),
    sectorCode: z.string().trim().max(120).optional().nullable(),
    tags: z.array(z.string().trim().min(1).max(120)).max(30).optional(),
    linkedEntityIds: z.array(z.string().uuid()).max(100).optional(),
    knowledgeEntityId: z.string().uuid().optional().nullable(),
    researchMissionId: z.string().uuid().optional().nullable(),
    seoTitle: z.string().trim().max(500).optional().nullable(),
    seoDescription: z.string().trim().max(1_000).optional().nullable(),
    commercialCta: z.record(z.unknown()).optional(),
    draftOrigin: z.enum(["human", "ai_assisted", "imported"]).optional(),
    generationMetadata: z.record(z.unknown()).optional(),
  });

const newsroomArticleCreateSchema = newsroomArticleFieldsSchema
  .superRefine((value, context) => {
    if (
      value.draftOrigin === "ai_assisted" &&
      !Object.keys(value.generationMetadata || {}).length
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "AI-assisted drafts require generation provenance.",
        path: ["generationMetadata"],
      });
    }
  });

const newsroomArticleUpdateSchema = newsroomArticleFieldsSchema
  .omit({
    draftOrigin: true,
    generationMetadata: true,
    knowledgeEntityId: true,
    researchMissionId: true,
  })
  .partial()
  .extend({
    changeNote: z.string().trim().min(5).max(1_000),
  });

const newsroomCitationSchema = z.object({
  sourceId: z.string().uuid(),
  factId: z.string().uuid().optional().nullable(),
  snapshotId: z.string().uuid().optional().nullable(),
  sourceUrl: z.string().url().max(2_000),
  sourceTitle: z.string().trim().min(3).max(500),
  citedClaim: z.string().trim().min(12).max(5_000),
  evidenceExcerpt: z.string().trim().max(2_000).optional().nullable(),
  sourcePublishedAt: z.string().datetime().optional().nullable(),
});

const newsroomCitationReviewSchema = z.object({
  verificationStatus: z.enum(["verified", "disputed", "stale"]),
  reviewNotes: z.string().trim().min(10).max(5_000),
});

const newsroomTransitionSchema = z.object({
  toStatus: z.enum(newsroomArticleStatuses),
  reason: z.string().trim().min(10).max(5_000),
  humanConfirmed: z.boolean(),
});

function resolveTradeTenant(req: any, res: any) {
  const tenant = req?.tenant;
  if (
    !tenant?.id ||
    String(tenant?.key || "").trim().toLowerCase() !== "exportunity"
  ) {
    res.status(404).json({
      ok: false,
      message: "Trade intelligence is available on Exportunity only.",
    });
    return null;
  }
  return tenant;
}

function sendNewsroomError(res: any, error: unknown, fallback: string) {
  return res.status(
    error instanceof TradeNewsroomError ? error.statusCode : 409,
  ).json({
    ok: false,
    code: error instanceof TradeNewsroomError ? error.code : undefined,
    message: error instanceof Error ? error.message : fallback,
  });
}

function rateKey(req: any, tenantId: number) {
  const forwarded = String(req.headers?.["x-forwarded-for"] || "")
    .split(",")[0]
    ?.trim();
  return `${tenantId}:${forwarded || req.ip || req.socket?.remoteAddress || "unknown"}`;
}

function consumeDemandRate(req: any, tenantId: number) {
  const key = rateKey(req, tenantId);
  const now = Date.now();
  const existing = demandWindows.get(key);
  const current =
    existing && existing.resetAt > now
      ? existing
      : { count: 0, resetAt: now + PUBLIC_DEMAND_WINDOW_MS };
  if (current.count >= PUBLIC_DEMAND_LIMIT) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1_000)),
    };
  }
  current.count += 1;
  demandWindows.set(key, current);
  return { allowed: true, retryAfterSeconds: 0 };
}

router.get("/overview", async (req: any, res) => {
  const tenant = resolveTradeTenant(req, res);
  if (!tenant) return;
  try {
    const overview = await loadPublicTradeOverview(tenant.id, {
      countryCode: String(req.query?.country || "") || null,
      sectorCode: String(req.query?.sector || "") || null,
      entityType: String(req.query?.type || "") || null,
      query: String(req.query?.q || "") || null,
    });
    res.setHeader("Cache-Control", "public, max-age=120, stale-while-revalidate=600");
    return res.json({ ok: true, ...overview });
  } catch {
    return res.status(503).json({
      ok: false,
      message: "Trade intelligence is temporarily unavailable.",
    });
  }
});

router.get("/newsroom", async (req: any, res) => {
  const tenant = resolveTradeTenant(req, res);
  if (!tenant) return;
  try {
    const newsroom = await loadPublishedTradeNewsroom({
      tenantId: tenant.id,
      countryCode: String(req.query?.country || "") || null,
      sectorCode: String(req.query?.sector || "") || null,
      storyType: String(req.query?.type || "") || null,
      query: String(req.query?.q || "") || null,
      limit: 30,
    });
    res.setHeader("Cache-Control", "public, max-age=120, stale-while-revalidate=600");
    return res.json({ ok: true, ...newsroom });
  } catch {
    return res.status(503).json({
      ok: false,
      message: "The trade newsroom is temporarily unavailable.",
    });
  }
});

router.get("/newsroom/:slug", async (req: any, res) => {
  const tenant = resolveTradeTenant(req, res);
  if (!tenant) return;
  const slug = z.string().trim().min(2).max(180).safeParse(req.params?.slug);
  if (!slug.success) {
    return res.status(400).json({ ok: false, message: "Invalid article slug." });
  }
  try {
    const newsroom = await loadPublishedTradeNewsroom({
      tenantId: tenant.id,
      slug: slug.data,
      limit: 1,
    });
    if (!newsroom.article) {
      return res.status(404).json({
        ok: false,
        message: "This trade newsroom article is not published.",
      });
    }
    res.setHeader("Cache-Control", "public, max-age=120, stale-while-revalidate=600");
    return res.json({ ok: true, ...newsroom });
  } catch {
    return res.status(503).json({
      ok: false,
      message: "The trade newsroom article is temporarily unavailable.",
    });
  }
});

router.post("/demand-events", async (req: any, res) => {
  const tenant = resolveTradeTenant(req, res);
  if (!tenant) return;
  const rate = consumeDemandRate(req, tenant.id);
  if (!rate.allowed) {
    res.setHeader("Retry-After", String(rate.retryAfterSeconds));
    return res.status(429).json({
      ok: false,
      message: "Too many demand signals were submitted from this connection.",
      retryAfterSeconds: rate.retryAfterSeconds,
    });
  }
  const parsed = publicDemandSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      message: "The demand signal is incomplete.",
      issues: parsed.error.flatten(),
    });
  }
  try {
    const event = await recordTradeDemandEvent({
      tenantId: tenant.id,
      ...parsed.data,
      anonymousSessionId: parsed.data.sessionId || null,
      metadata: {
        locale: parsed.data.locale || null,
        publicSignal: true,
      },
    });
    return res.status(201).json({
      ok: true,
      eventId: event.id,
      missionCreated: false,
      message:
        "Demand recorded. Research missions require staff review and remain approval-gated.",
    });
  } catch {
    return res.status(503).json({
      ok: false,
      message: "The demand signal could not be recorded.",
    });
  }
});

router.get("/admin/dashboard", ensureTenantStaff, async (req: any, res) => {
  const tenant = resolveTradeTenant(req, res);
  if (!tenant) return;
  try {
    const [dashboard, newsroom] = await Promise.all([
      loadTradeIntelligenceDashboard(tenant.id),
      loadAdminTradeNewsroom(tenant.id),
    ]);
    return res.json({
      ok: true,
      ...dashboard,
      newsroom,
    });
  } catch {
    return res.status(503).json({
      ok: false,
      message: "The trade intelligence command center is temporarily unavailable.",
    });
  }
});

router.post("/admin/sectors", ensureTenantAdmin, async (req: any, res) => {
  const tenant = resolveTradeTenant(req, res);
  if (!tenant) return;
  const parsed = industrySectorProposalSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      message: "The industry-sector proposal is invalid.",
      issues: parsed.error.flatten(),
    });
  }
  try {
    const sector = await createTradeIndustrySectorProposal({
      tenantId: tenant.id,
      userId: req.adminUser?.id || null,
      ...parsed.data,
    });
    return res.status(201).json({
      ok: true,
      sector,
      message: "Industry sector saved as a draft; no coverage or outreach was started.",
    });
  } catch (error) {
    return res.status(409).json({
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "The industry-sector proposal could not be saved.",
    });
  }
});

router.post(
  "/admin/demand-events/:eventId/queue-sector-proposal",
  ensureTenantAdmin,
  async (req: any, res) => {
    const tenant = resolveTradeTenant(req, res);
    if (!tenant) return;
    const eventId = z.string().uuid().safeParse(req.params?.eventId);
    if (!eventId.success) {
      return res.status(400).json({
        ok: false,
        message: "The demand-event identifier is invalid.",
      });
    }
    try {
      const queued = await queueTradeSectorProposalFromDemand({
        tenantId: tenant.id,
        demandEventId: eventId.data,
        requestedByUserId: req.adminUser?.id || null,
      });
      return res.status(202).json({
        ok: true,
        ...queued,
        message:
          "The assigned data-intelligence employee now has a visible governed task. No worker, outreach, publication, or sector activation was started by this request.",
      });
    } catch (error) {
      return res.status(409).json({
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "The agent sector-proposal task could not be queued.",
      });
    }
  },
);

router.patch(
  "/admin/sectors/:sectorId/transition",
  ensureTenantAdmin,
  async (req: any, res) => {
    const tenant = resolveTradeTenant(req, res);
    if (!tenant) return;
    const sectorId = z.string().uuid().safeParse(req.params?.sectorId);
    const parsed = industrySectorTransitionSchema.safeParse(req.body || {});
    if (!sectorId.success || !parsed.success) {
      return res.status(400).json({
        ok: false,
        message: "The industry-sector transition is invalid.",
        issues: parsed.success ? undefined : parsed.error.flatten(),
      });
    }
    try {
      const result = await transitionTradeIndustrySector({
        tenantId: tenant.id,
        sectorId: sectorId.data,
        userId: req.adminUser?.id || null,
        ...parsed.data,
      });
      return res.json({
        ok: true,
        ...result,
        message:
          parsed.data.action === "activate"
            ? "Industry sector activated with empty Africa-wide research targets."
            : "Industry-sector status updated without deleting evidence.",
      });
    } catch (error) {
      return res.status(409).json({
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "The industry-sector transition could not be completed.",
      });
    }
  },
);

router.get("/admin/newsroom", ensureTenantStaff, async (req: any, res) => {
  const tenant = resolveTradeTenant(req, res);
  if (!tenant) return;
  try {
    return res.json({
      ok: true,
      ...(await loadAdminTradeNewsroom(tenant.id)),
    });
  } catch (error) {
    return sendNewsroomError(
      res,
      error,
      "The newsroom review queue is temporarily unavailable.",
    );
  }
});

router.get(
  "/admin/newsroom/:articleId",
  ensureTenantStaff,
  async (req: any, res) => {
    const tenant = resolveTradeTenant(req, res);
    if (!tenant) return;
    const articleId = z.string().uuid().safeParse(req.params?.articleId);
    if (!articleId.success) {
      return res.status(400).json({ ok: false, message: "Invalid article ID." });
    }
    try {
      const newsroom = await loadAdminTradeNewsroom(tenant.id, articleId.data);
      if (!newsroom.articles[0]) {
        return res.status(404).json({
          ok: false,
          message: "The newsroom article was not found.",
        });
      }
      return res.json({ ok: true, ...newsroom, article: newsroom.articles[0] });
    } catch (error) {
      return sendNewsroomError(
        res,
        error,
        "The newsroom article is temporarily unavailable.",
      );
    }
  },
);

router.post(
  "/admin/newsroom/articles",
  ensureTenantAdmin,
  async (req: any, res) => {
    const tenant = resolveTradeTenant(req, res);
    if (!tenant) return;
    const parsed = newsroomArticleCreateSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        message: "The newsroom draft is invalid.",
        issues: parsed.error.flatten(),
      });
    }
    try {
      const article = await createTradeNewsroomArticle({
        tenantId: tenant.id,
        userId: req.adminUser?.id || null,
        ...parsed.data,
      });
      return res.status(201).json({
        ok: true,
        article,
        message:
          "Draft created. Research review, editor review, and explicit human publication remain required.",
      });
    } catch (error) {
      return sendNewsroomError(res, error, "The newsroom draft could not be created.");
    }
  },
);

router.patch(
  "/admin/newsroom/articles/:articleId",
  ensureTenantAdmin,
  async (req: any, res) => {
    const tenant = resolveTradeTenant(req, res);
    if (!tenant) return;
    const articleId = z.string().uuid().safeParse(req.params?.articleId);
    const parsed = newsroomArticleUpdateSchema.safeParse(req.body || {});
    if (!articleId.success || !parsed.success) {
      return res.status(400).json({
        ok: false,
        message: "The newsroom revision is invalid.",
        issues: parsed.success ? undefined : parsed.error.flatten(),
      });
    }
    try {
      const article = await updateTradeNewsroomArticle({
        tenantId: tenant.id,
        articleId: articleId.data,
        userId: req.adminUser?.id || null,
        ...parsed.data,
      });
      return res.json({ ok: true, article });
    } catch (error) {
      return sendNewsroomError(res, error, "The newsroom revision could not be saved.");
    }
  },
);

router.post(
  "/admin/newsroom/articles/:articleId/citations",
  ensureTenantAdmin,
  async (req: any, res) => {
    const tenant = resolveTradeTenant(req, res);
    if (!tenant) return;
    const articleId = z.string().uuid().safeParse(req.params?.articleId);
    const parsed = newsroomCitationSchema.safeParse(req.body || {});
    if (!articleId.success || !parsed.success) {
      return res.status(400).json({
        ok: false,
        message: "The newsroom citation is invalid.",
        issues: parsed.success ? undefined : parsed.error.flatten(),
      });
    }
    try {
      const result = await addTradeNewsroomCitation({
        tenantId: tenant.id,
        articleId: articleId.data,
        userId: req.adminUser?.id || null,
        ...parsed.data,
      });
      return res.status(201).json({
        ok: true,
        ...result,
        message: "Citation recorded and withheld until accountable verification.",
      });
    } catch (error) {
      return sendNewsroomError(res, error, "The newsroom citation could not be added.");
    }
  },
);

router.patch(
  "/admin/newsroom/citations/:citationId/review",
  ensureTenantAdmin,
  async (req: any, res) => {
    const tenant = resolveTradeTenant(req, res);
    if (!tenant) return;
    const citationId = z.string().uuid().safeParse(req.params?.citationId);
    const parsed = newsroomCitationReviewSchema.safeParse(req.body || {});
    if (!citationId.success || !parsed.success) {
      return res.status(400).json({
        ok: false,
        message: "The citation review is invalid.",
        issues: parsed.success ? undefined : parsed.error.flatten(),
      });
    }
    try {
      const result = await reviewTradeNewsroomCitation({
        tenantId: tenant.id,
        citationId: citationId.data,
        userId: req.adminUser?.id || null,
        ...parsed.data,
      });
      return res.json({ ok: true, ...result });
    } catch (error) {
      return sendNewsroomError(res, error, "The citation review could not be saved.");
    }
  },
);

router.post(
  "/admin/newsroom/articles/:articleId/transition",
  ensureTenantAdmin,
  async (req: any, res) => {
    const tenant = resolveTradeTenant(req, res);
    if (!tenant) return;
    const articleId = z.string().uuid().safeParse(req.params?.articleId);
    const parsed = newsroomTransitionSchema.safeParse(req.body || {});
    if (!articleId.success || !parsed.success) {
      return res.status(400).json({
        ok: false,
        message: "The newsroom review transition is invalid.",
        issues: parsed.success ? undefined : parsed.error.flatten(),
      });
    }
    try {
      const result = await transitionTradeNewsroomArticle({
        tenantId: tenant.id,
        articleId: articleId.data,
        userId: req.adminUser?.id || null,
        ...parsed.data,
      });
      return res.json({
        ok: true,
        ...result,
        message:
          parsed.data.toStatus === "published"
            ? "The human-approved article is now public."
            : `Article moved to ${parsed.data.toStatus.replace(/_/g, " ")}.`,
      });
    } catch (error) {
      return sendNewsroomError(res, error, "The newsroom transition could not be completed.");
    }
  },
);

router.post("/admin/sources", ensureTenantAdmin, async (req: any, res) => {
  const tenant = resolveTradeTenant(req, res);
  if (!tenant) return;
  const parsed = sourceSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      message: "The source registry entry is invalid.",
      issues: parsed.error.flatten(),
    });
  }
  try {
    const source = await upsertTradeIntelligenceSource({
      tenantId: tenant.id,
      userId: req.adminUser?.id || null,
      ...parsed.data,
    });
    return res.status(201).json({ ok: true, source });
  } catch {
    return res.status(400).json({
      ok: false,
      message: "The source could not be registered. Check the URL and key fields.",
    });
  }
});

router.post(
  "/admin/sources/:sourceId/snapshots",
  ensureTenantAdmin,
  async (req: any, res) => {
    const tenant = resolveTradeTenant(req, res);
    if (!tenant) return;
    const sourceId = z.string().uuid().safeParse(req.params?.sourceId);
    const parsed = sourceSnapshotSchema.safeParse(req.body || {});
    if (!sourceId.success || !parsed.success) {
      return res.status(400).json({
        ok: false,
        message: "The source snapshot is invalid.",
        issues: parsed.success ? undefined : parsed.error.flatten(),
      });
    }
    try {
      const result = await captureTradeSourceSnapshot({
        tenantId: tenant.id,
        userId: req.adminUser?.id || null,
        sourceId: sourceId.data,
        ...parsed.data,
      });
      return res.status(result.duplicate ? 200 : 201).json({
        ok: true,
        ...result,
        message: result.duplicate
          ? "The source content is unchanged; the last-checked time was refreshed."
          : result.baseline
            ? "The first source baseline was stored. No change or alert was asserted."
            : "A version comparison and approval-pending review task were created. Alert delivery and publication remain withheld.",
      });
    } catch (error) {
      return res.status(409).json({
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "The source snapshot could not be recorded.",
      });
    }
  },
);

router.patch(
  "/admin/source-comparisons/:comparisonId/review",
  ensureTenantAdmin,
  async (req: any, res) => {
    const tenant = resolveTradeTenant(req, res);
    if (!tenant) return;
    const comparisonId = z.string().uuid().safeParse(req.params?.comparisonId);
    const parsed = sourceComparisonReviewSchema.safeParse(req.body || {});
    if (!comparisonId.success || !parsed.success) {
      return res.status(400).json({
        ok: false,
        message: "The source comparison review is invalid.",
        issues: parsed.success ? undefined : parsed.error.flatten(),
      });
    }
    try {
      const result = await reviewTradeSourceComparison({
        tenantId: tenant.id,
        userId: req.adminUser?.id || null,
        comparisonId: comparisonId.data,
        ...parsed.data,
      });
      return res.json({
        ok: true,
        ...result,
        message:
          parsed.data.action === "confirm"
            ? "The change was verified for internal review. Public release and alert delivery remain separately gated."
            : "The candidate was dismissed and its draft alert was cancelled.",
      });
    } catch (error) {
      return res.status(409).json({
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "The source comparison could not be reviewed.",
      });
    }
  },
);

router.post("/admin/entities", ensureTenantAdmin, async (req: any, res) => {
  const tenant = resolveTradeTenant(req, res);
  if (!tenant) return;
  const parsed = entitySchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      message: "The knowledge entity is invalid.",
      issues: parsed.error.flatten(),
    });
  }
  try {
    const entity = await upsertTradeKnowledgeEntity({
      tenantId: tenant.id,
      userId: req.adminUser?.id || null,
      ...parsed.data,
    });
    return res.status(201).json({ ok: true, entity });
  } catch {
    return res.status(400).json({
      ok: false,
      message: "The knowledge entity could not be recorded.",
    });
  }
});

router.post("/admin/facts", ensureTenantAdmin, async (req: any, res) => {
  const tenant = resolveTradeTenant(req, res);
  if (!tenant) return;
  const parsed = factSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      message: "The cited fact is invalid.",
      issues: parsed.error.flatten(),
    });
  }
  try {
    const result = await recordTradeFact({
      tenantId: tenant.id,
      verifiedByUserId: req.adminUser?.id || null,
      ...parsed.data,
      value: parsed.data.value,
    });
    return res.status(201).json({ ok: true, ...result });
  } catch (error) {
    return res.status(400).json({
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "The cited fact could not be recorded.",
    });
  }
});

router.post(
  "/admin/relationships",
  ensureTenantAdmin,
  async (req: any, res) => {
    const tenant = resolveTradeTenant(req, res);
    if (!tenant) return;
    const parsed = relationshipSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        message: "The knowledge relationship is invalid.",
        issues: parsed.error.flatten(),
      });
    }
    try {
      const relationship = await upsertTradeKnowledgeRelationship({
        tenantId: tenant.id,
        userId: req.adminUser?.id || null,
        ...parsed.data,
      });
      return res.status(201).json({ ok: true, relationship });
    } catch (error) {
      return res.status(400).json({
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "The relationship could not be recorded.",
      });
    }
  },
);

router.patch(
  "/admin/entities/:entityId/review",
  ensureTenantAdmin,
  async (req: any, res) => {
    const tenant = resolveTradeTenant(req, res);
    if (!tenant) return;
    const entityId = z.string().uuid().safeParse(req.params?.entityId);
    const parsed = entityReviewSchema.safeParse(req.body || {});
    if (!entityId.success || !parsed.success) {
      return res.status(400).json({
        ok: false,
        message: "The entity review request is invalid.",
        issues: parsed.success ? undefined : parsed.error.flatten(),
      });
    }
    try {
      const result = await reviewTradeKnowledgeEntity({
        tenantId: tenant.id,
        entityId: entityId.data,
        userId: req.adminUser?.id || null,
        action: parsed.data.action,
      });
      return res.json({ ok: true, ...result });
    } catch (error) {
      return res.status(409).json({
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "The entity review could not be completed.",
      });
    }
  },
);

router.post(
  "/admin/regulatory-changes",
  ensureTenantAdmin,
  async (req: any, res) => {
    const tenant = resolveTradeTenant(req, res);
    if (!tenant) return;
    const parsed = regulatoryChangeSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        message: "The regulatory change is invalid.",
        issues: parsed.error.flatten(),
      });
    }
    try {
      const change = await recordTradeRegulatoryChange({
        tenantId: tenant.id,
        userId: req.adminUser?.id || null,
        ...parsed.data,
      });
      return res.status(201).json({ ok: true, change });
    } catch (error) {
      return res.status(400).json({
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "The regulatory change could not be recorded.",
      });
    }
  },
);

router.post("/admin/missions", ensureTenantStaff, async (req: any, res) => {
  const tenant = resolveTradeTenant(req, res);
  if (!tenant) return;
  const parsed = missionSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      message: "The research mission is invalid.",
      issues: parsed.error.flatten(),
    });
  }
  try {
    const mission = await createTradeResearchMission({
      tenantId: tenant.id,
      userId: req.staffUser?.id || null,
      ...parsed.data,
    });
    return res.status(201).json({ ok: true, mission });
  } catch {
    return res.status(400).json({
      ok: false,
      message: "The research mission could not be created.",
    });
  }
});

router.post(
  "/admin/demand-events/:eventId/propose-mission",
  ensureTenantStaff,
  async (req: any, res) => {
    const tenant = resolveTradeTenant(req, res);
    if (!tenant) return;
    const eventId = z.string().uuid().safeParse(req.params?.eventId);
    if (!eventId.success) {
      return res.status(400).json({ ok: false, message: "Invalid demand event." });
    }
    try {
      const mission = await proposeZeroResultResearchMission({
        tenantId: tenant.id,
        demandEventId: eventId.data,
        userId: req.staffUser?.id || null,
      });
      return res.status(201).json({ ok: true, mission });
    } catch (error) {
      return res.status(409).json({
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "The research mission could not be proposed.",
      });
    }
  },
);

router.post(
  "/admin/coverage/:coverageCellId/refresh",
  ensureTenantStaff,
  async (req: any, res) => {
    const tenant = resolveTradeTenant(req, res);
    if (!tenant) return;
    const coverageCellId = z.string().uuid().safeParse(req.params?.coverageCellId);
    if (!coverageCellId.success) {
      return res.status(400).json({ ok: false, message: "Invalid coverage cell." });
    }
    try {
      const coverage = await refreshTradeCoverageCell({
        tenantId: tenant.id,
        coverageCellId: coverageCellId.data,
        researchInProgress: Boolean(req.body?.researchInProgress),
      });
      return res.json({ ok: true, coverage });
    } catch (error) {
      return res.status(404).json({
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "The coverage cell could not be refreshed.",
      });
    }
  },
);

router.post(
  "/admin/missions/:missionId/evidence",
  ensureTenantAdmin,
  async (req: any, res) => {
    const tenant = resolveTradeTenant(req, res);
    if (!tenant) return;
    const missionId = z.string().uuid().safeParse(req.params?.missionId);
    const parsed = missionEvidenceSchema.safeParse(req.body || {});
    if (!missionId.success || !parsed.success) {
      return res.status(400).json({
        ok: false,
        message: "The mission evidence is invalid.",
        issues: parsed.success ? undefined : parsed.error.flatten(),
      });
    }
    try {
      const evidence = await recordTradeResearchMissionEvidence({
        tenantId: tenant.id,
        missionId: missionId.data,
        userId: req.adminUser?.id || null,
        ...parsed.data,
      });
      return res.status(201).json({ ok: true, ...evidence });
    } catch (error) {
      return res.status(400).json({
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "The mission evidence could not be recorded.",
      });
    }
  },
);

router.patch(
  "/admin/missions/:missionId",
  ensureTenantAdmin,
  async (req: any, res) => {
    const tenant = resolveTradeTenant(req, res);
    if (!tenant) return;
    const missionId = z.string().uuid().safeParse(req.params?.missionId);
    const parsed = missionUpdateSchema.safeParse(req.body || {});
    if (!missionId.success || !parsed.success) {
      return res.status(400).json({
        ok: false,
        message: "The mission update is invalid.",
        issues: parsed.success ? undefined : parsed.error.flatten(),
      });
    }
    try {
      const mission = await updateTradeResearchMission({
        tenantId: tenant.id,
        missionId: missionId.data,
        userId: req.adminUser?.id || null,
        ...parsed.data,
      });
      return res.json({ ok: true, mission });
    } catch (error) {
      return res.status(404).json({
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "The mission could not be updated.",
      });
    }
  },
);

export default router;
