import { and, desc, eq, inArray } from "drizzle-orm";

import { db } from "@db";
import {
  industrialAuditLogs,
  industrialDiscoveryEvidence,
  industrialFactoryLeads,
  industrialProductRequirements,
  industrialRequirementDiscoveryCandidates,
  industrialRequirements,
  industrialSupplierPromotions,
} from "@db/schema";
import { ensureIndustrialTables } from "../industrial/ensureTables";
import { resolveRequirementProductFacts } from "./productRequirementReadModel";
import {
  assessSupplierDiscoveryRelevance,
  parseSupplierDiscoveryIntake,
  parseSupplierDiscoveryReview,
  type ParsedSupplierDiscoveryIntake,
  type SupplierDiscoveryCandidateStatus,
} from "./supplierDiscoveryPolicy";

const ACTIVE_DISCOVERY_REQUIREMENT_STATUSES = new Set([
  "submitted",
  "triaged",
  "under_review",
  "supplier_matching",
]);

export class SupplierDiscoveryServiceError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, statusCode: number, message: string) {
    super(message);
    this.name = "SupplierDiscoveryServiceError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

function assertExportunityTenant(tenantKey: string) {
  if (String(tenantKey || "").trim().toLowerCase() !== "exportunity") {
    throw new SupplierDiscoveryServiceError(
      "EXPORTUNITY_TENANT_REQUIRED",
      404,
      "Supplier discovery is available only inside the Exportunity tenant.",
    );
  }
}

function actorId(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

async function loadActiveRequirement(input: {
  tenantId: number;
  requirementId: string;
}) {
  const [row] = await db
    .select({
      requirement: industrialRequirements,
      productRequirement: industrialProductRequirements,
    })
    .from(industrialRequirements)
    .leftJoin(
      industrialProductRequirements,
      and(
        eq(
          industrialProductRequirements.requirementId,
          industrialRequirements.id,
        ),
        eq(industrialProductRequirements.tenantId, input.tenantId),
      ),
    )
    .where(
      and(
        eq(industrialRequirements.id, input.requirementId),
        eq(industrialRequirements.tenantId, input.tenantId),
      ),
    )
    .limit(1);
  if (!row) {
    throw new SupplierDiscoveryServiceError(
      "DISCOVERY_REQUIREMENT_NOT_FOUND",
      404,
      "The Exportunity requirement was not found.",
    );
  }
  if (!ACTIVE_DISCOVERY_REQUIREMENT_STATUSES.has(row.requirement.status)) {
    throw new SupplierDiscoveryServiceError(
      "DISCOVERY_REQUIREMENT_INACTIVE",
      409,
      `Supplier discovery cannot be recorded while the requirement is ${row.requirement.status}.`,
    );
  }
  return row;
}

function leadMetadata(candidate: ParsedSupplierDiscoveryIntake) {
  return {
    exportunityDiscovery: {
      state: "unverified",
      candidateKey: candidate.candidateKey,
      sourceType: candidate.source.type,
      firstRecordedAt: new Date().toISOString(),
      humanApprovalRequired: true,
      supplierProfileCreated: false,
      supplierVerified: false,
      outreachAllowed: false,
      outreachCreated: false,
    },
  };
}

export async function recordSupplierDiscoveryCandidate(input: {
  tenantId: number;
  tenantKey: string;
  actorUserId: number | null;
  payload: unknown;
}) {
  assertExportunityTenant(input.tenantKey);
  const candidateInput = parseSupplierDiscoveryIntake(input.payload);
  await ensureIndustrialTables();
  const activeRequirement = await loadActiveRequirement({
    tenantId: input.tenantId,
    requirementId: candidateInput.requirementId,
  });
  const requirement = activeRequirement.requirement;
  const product = resolveRequirementProductFacts({
    requirement,
    productRequirement: activeRequirement.productRequirement,
  });
  const relevanceAssessment = assessSupplierDiscoveryRelevance({
    productName: product.name,
    specification: product.specification,
    candidate: candidateInput,
  });
  const now = new Date();
  const userId = actorId(input.actorUserId);

  return db.transaction(async (tx) => {
    let [factoryLead] = await tx
      .select()
      .from(industrialFactoryLeads)
      .where(
        and(
          eq(industrialFactoryLeads.tenantId, input.tenantId),
          eq(industrialFactoryLeads.discoveryKey, candidateInput.candidateKey),
        ),
      )
      .limit(1);
    let createdLead = false;
    if (!factoryLead) {
      const insertedLeads = await tx
        .insert(industrialFactoryLeads)
        .values({
          tenantId: input.tenantId,
          source: `external_discovery:${candidateInput.source.type}`,
          discoveryKey: candidateInput.candidateKey,
          googlePlaceId: candidateInput.company.googlePlaceId,
          name: candidateInput.company.name,
          normalizedName: candidateInput.company.normalizedName,
          primaryIndustry: candidateInput.company.primaryIndustry,
          googleTypes: [],
          address: candidateInput.company.address,
          city: candidateInput.company.city,
          countryCode: candidateInput.company.countryCode,
          phone: null,
          website: candidateInput.company.website,
          googleMapsUrl: candidateInput.company.googleMapsUrl,
          leadStatus: "new",
          qualificationScore: 0,
          screeningNotes:
            "Unverified external discovery record. Human evidence review is required before supplier onboarding or contact.",
          contactStatus: "not_contacted",
          metadata: leadMetadata(candidateInput),
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing()
        .returning();
      factoryLead = insertedLeads[0];
      createdLead = Boolean(factoryLead);
      if (!factoryLead) {
        [factoryLead] = await tx
          .select()
          .from(industrialFactoryLeads)
          .where(
            and(
              eq(industrialFactoryLeads.tenantId, input.tenantId),
              eq(
                industrialFactoryLeads.discoveryKey,
                candidateInput.candidateKey,
              ),
            ),
          )
          .limit(1);
      }
    }
    if (!factoryLead) {
      throw new SupplierDiscoveryServiceError(
        "DISCOVERY_LEAD_UPSERT_FAILED",
        500,
        "The unverified company lead could not be recorded.",
      );
    }

    let [candidate] = await tx
      .select()
      .from(industrialRequirementDiscoveryCandidates)
      .where(
        and(
          eq(
            industrialRequirementDiscoveryCandidates.tenantId,
            input.tenantId,
          ),
          eq(
            industrialRequirementDiscoveryCandidates.requirementId,
            requirement.id,
          ),
          eq(
            industrialRequirementDiscoveryCandidates.candidateKey,
            candidateInput.candidateKey,
          ),
        ),
      )
      .limit(1);
    let createdCandidate = false;
    if (!candidate) {
      const insertedCandidates = await tx
        .insert(industrialRequirementDiscoveryCandidates)
        .values({
          tenantId: input.tenantId,
          requirementId: requirement.id,
          factoryLeadId: factoryLead.id,
          candidateKey: candidateInput.candidateKey,
          status: "discovered",
          relevanceScore: candidateInput.relevance.score,
          relevanceRationale: candidateInput.relevance.rationale,
          contactStatus: "not_contacted",
          outreachAllowed: false,
          humanApprovalRequired: true,
          createdByUserId: userId,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing()
        .returning();
      candidate = insertedCandidates[0];
      createdCandidate = Boolean(candidate);
      if (!candidate) {
        [candidate] = await tx
          .select()
          .from(industrialRequirementDiscoveryCandidates)
          .where(
            and(
              eq(
                industrialRequirementDiscoveryCandidates.tenantId,
                input.tenantId,
              ),
              eq(
                industrialRequirementDiscoveryCandidates.requirementId,
                requirement.id,
              ),
              eq(
                industrialRequirementDiscoveryCandidates.candidateKey,
                candidateInput.candidateKey,
              ),
            ),
          )
          .limit(1);
      }
    }
    if (!candidate) {
      throw new SupplierDiscoveryServiceError(
        "DISCOVERY_CANDIDATE_UPSERT_FAILED",
        500,
        "The requirement discovery candidate could not be recorded.",
      );
    }

    const insertedEvidence = await tx
      .insert(industrialDiscoveryEvidence)
      .values({
        tenantId: input.tenantId,
        discoveryCandidateId: candidate.id,
        sourceType: candidateInput.source.type,
        sourceName: candidateInput.source.name,
        sourceUrl: candidateInput.source.url,
        retrievedAt: candidateInput.source.retrievedAt,
        contentHash: candidateInput.source.contentHash,
        evidence: candidateInput.source.evidence,
        createdByUserId: userId,
        createdAt: now,
      })
      .onConflictDoNothing()
      .returning({ id: industrialDiscoveryEvidence.id });
    const createdEvidence = insertedEvidence.length > 0;
    const affectedRows =
      Number(createdLead) + Number(createdCandidate) + Number(createdEvidence);

    if (affectedRows > 0) {
      await tx.insert(industrialAuditLogs).values({
        tenantId: input.tenantId,
        actorUserId: userId,
        action: "industrial_supplier_discovery.recorded",
        entityType: "industrial_requirement_discovery_candidate",
        entityId: candidate.id,
        reason:
          "Provenance-backed external company discovery recorded for human verification.",
        previousValue: {},
        nextValue: {
          status: candidate.status,
          relevanceScore: candidate.relevanceScore,
          sourceType: candidateInput.source.type,
          contentHash: candidateInput.source.contentHash,
        },
        metadata: {
          requirementId: requirement.id,
          productRequirementId: product.productRequirementId,
          productRequirementSource: product.source,
          factoryLeadId: factoryLead.id,
          productMatch: relevanceAssessment.productMatch,
          evidenceFingerprint: relevanceAssessment.evidenceFingerprint,
          createdLead,
          createdCandidate,
          createdEvidence,
          supplierProfileCreated: false,
          supplierVerified: false,
          identityPublic: false,
          outreachAllowed: false,
          outreachCreated: false,
          quoteCreated: false,
        },
        createdAt: now,
      });
    }

    return {
      candidate: {
        id: candidate.id,
        requirementId: candidate.requirementId,
        factoryLeadId: candidate.factoryLeadId,
        companyName: factoryLead.name,
        status: candidate.status,
        relevanceScore: candidate.relevanceScore,
        relevanceRationale: candidate.relevanceRationale,
        evidenceCountIncrement: createdEvidence ? 1 : 0,
      },
      created: {
        lead: createdLead,
        candidate: createdCandidate,
        evidence: createdEvidence,
      },
      governance: {
        verificationState: "unverified" as const,
        humanApprovalRequired: true as const,
        identityPublic: false as const,
        supplierProfileCreated: false as const,
        outreachAllowed: false as const,
        outreachCreated: false as const,
        quoteCreated: false as const,
      },
      evidence: {
        entity_ids: [
          factoryLead.id,
          candidate.id,
          ...insertedEvidence.map((row) => row.id),
        ],
        affected_rows: affectedRows,
        response_hash: candidateInput.source.contentHash,
      },
    };
  });
}

export async function listSupplierDiscoveryCandidates(input: {
  tenantId: number;
  tenantKey: string;
  status?: SupplierDiscoveryCandidateStatus | null;
  requirementId?: string | null;
  limit?: number;
}) {
  assertExportunityTenant(input.tenantKey);
  await ensureIndustrialTables();
  const conditions = [
    eq(industrialRequirementDiscoveryCandidates.tenantId, input.tenantId),
  ];
  if (input.status) {
    conditions.push(
      eq(industrialRequirementDiscoveryCandidates.status, input.status),
    );
  }
  if (input.requirementId) {
    conditions.push(
      eq(
        industrialRequirementDiscoveryCandidates.requirementId,
        input.requirementId,
      ),
    );
  }
  const limit = Math.min(Math.max(Number(input.limit) || 50, 1), 100);
  const rows = await db
    .select({
      id: industrialRequirementDiscoveryCandidates.id,
      requirementId: industrialRequirementDiscoveryCandidates.requirementId,
      requirementReferenceCode: industrialRequirements.referenceCode,
      requirementTitle: industrialRequirements.title,
      factoryLeadId: industrialRequirementDiscoveryCandidates.factoryLeadId,
      companyName: industrialFactoryLeads.name,
      primaryIndustry: industrialFactoryLeads.primaryIndustry,
      website: industrialFactoryLeads.website,
      city: industrialFactoryLeads.city,
      countryCode: industrialFactoryLeads.countryCode,
      leadStatus: industrialFactoryLeads.leadStatus,
      status: industrialRequirementDiscoveryCandidates.status,
      relevanceScore:
        industrialRequirementDiscoveryCandidates.relevanceScore,
      relevanceRationale:
        industrialRequirementDiscoveryCandidates.relevanceRationale,
      contactStatus: industrialRequirementDiscoveryCandidates.contactStatus,
      outreachAllowed:
        industrialRequirementDiscoveryCandidates.outreachAllowed,
      humanApprovalRequired:
        industrialRequirementDiscoveryCandidates.humanApprovalRequired,
      reviewNotes: industrialRequirementDiscoveryCandidates.reviewNotes,
      reviewedAt: industrialRequirementDiscoveryCandidates.reviewedAt,
      createdAt: industrialRequirementDiscoveryCandidates.createdAt,
      updatedAt: industrialRequirementDiscoveryCandidates.updatedAt,
    })
    .from(industrialRequirementDiscoveryCandidates)
    .innerJoin(
      industrialFactoryLeads,
      eq(
        industrialRequirementDiscoveryCandidates.factoryLeadId,
        industrialFactoryLeads.id,
      ),
    )
    .innerJoin(
      industrialRequirements,
      eq(
        industrialRequirementDiscoveryCandidates.requirementId,
        industrialRequirements.id,
      ),
    )
    .where(and(...conditions))
    .orderBy(desc(industrialRequirementDiscoveryCandidates.updatedAt))
    .limit(limit);

  const ids = rows.map((row) => row.id);
  const provenance = ids.length
    ? await db
        .select({
          id: industrialDiscoveryEvidence.id,
          candidateId: industrialDiscoveryEvidence.discoveryCandidateId,
          sourceType: industrialDiscoveryEvidence.sourceType,
          sourceName: industrialDiscoveryEvidence.sourceName,
          sourceUrl: industrialDiscoveryEvidence.sourceUrl,
          retrievedAt: industrialDiscoveryEvidence.retrievedAt,
          contentHash: industrialDiscoveryEvidence.contentHash,
          evidence: industrialDiscoveryEvidence.evidence,
          createdAt: industrialDiscoveryEvidence.createdAt,
        })
        .from(industrialDiscoveryEvidence)
        .where(
          and(
            eq(industrialDiscoveryEvidence.tenantId, input.tenantId),
            inArray(industrialDiscoveryEvidence.discoveryCandidateId, ids),
          ),
        )
        .orderBy(desc(industrialDiscoveryEvidence.createdAt))
    : [];
  const evidenceByCandidate = new Map<string, typeof provenance>();
  for (const item of provenance) {
    const group = evidenceByCandidate.get(item.candidateId) || [];
    group.push(item);
    evidenceByCandidate.set(item.candidateId, group);
  }
  const promotions = ids.length
    ? await db
        .select({
          id: industrialSupplierPromotions.id,
          candidateId: industrialSupplierPromotions.discoveryCandidateId,
          supplierProfileId: industrialSupplierPromotions.supplierProfileId,
          legalName: industrialSupplierPromotions.legalName,
          countryCode: industrialSupplierPromotions.countryCode,
          verificationScope: industrialSupplierPromotions.verificationScope,
          evidenceIds: industrialSupplierPromotions.evidenceIds,
          approvedAt: industrialSupplierPromotions.approvedAt,
          outreachAllowed: industrialSupplierPromotions.outreachAllowed,
        })
        .from(industrialSupplierPromotions)
        .where(
          and(
            eq(industrialSupplierPromotions.tenantId, input.tenantId),
            inArray(industrialSupplierPromotions.discoveryCandidateId, ids),
          ),
        )
    : [];
  const promotionByCandidate = new Map(
    promotions.map((promotion) => [promotion.candidateId, promotion]),
  );

  return {
    items: rows.map((row) => {
      const promotion = promotionByCandidate.get(row.id) || null;
      return {
        ...row,
        verificationState: "unverified" as const,
        supplierProfileCreated: Boolean(promotion),
        identityPublic: false as const,
        promotion: promotion
          ? {
              ...promotion,
              approvedAt: promotion.approvedAt.toISOString(),
              outreachAllowed: false as const,
            }
          : null,
        provenance: evidenceByCandidate.get(row.id) || [],
      };
    }),
    governance: {
      humanApprovalRequired: true as const,
      identityPublic: false as const,
      outreachAllowed: false as const,
      supplierVerificationImplied: false as const,
    },
  };
}

export async function reviewSupplierDiscoveryCandidate(input: {
  tenantId: number;
  tenantKey: string;
  actorUserId: number | null;
  candidateId: string;
  nextStatus: unknown;
  notes: unknown;
}) {
  assertExportunityTenant(input.tenantKey);
  await ensureIndustrialTables();
  const [current] = await db
    .select()
    .from(industrialRequirementDiscoveryCandidates)
    .where(
      and(
        eq(industrialRequirementDiscoveryCandidates.id, input.candidateId),
        eq(
          industrialRequirementDiscoveryCandidates.tenantId,
          input.tenantId,
        ),
      ),
    )
    .limit(1);
  if (!current) {
    throw new SupplierDiscoveryServiceError(
      "DISCOVERY_CANDIDATE_NOT_FOUND",
      404,
      "The supplier discovery candidate was not found.",
    );
  }
  const [promotion] = await db
    .select({ id: industrialSupplierPromotions.id })
    .from(industrialSupplierPromotions)
    .where(
      and(
        eq(industrialSupplierPromotions.tenantId, input.tenantId),
        eq(industrialSupplierPromotions.discoveryCandidateId, current.id),
      ),
    )
    .limit(1);
  if (promotion) {
    throw new SupplierDiscoveryServiceError(
      "DISCOVERY_CANDIDATE_ALREADY_PROMOTED",
      409,
      "A promoted supplier decision is immutable. Review the supplier profile instead.",
    );
  }
  const review = parseSupplierDiscoveryReview({
    currentStatus: current.status,
    nextStatus: input.nextStatus,
    notes: input.notes,
  });
  const now = new Date();
  const userId = actorId(input.actorUserId);

  return db.transaction(async (tx) => {
    const updated = await tx
      .update(industrialRequirementDiscoveryCandidates)
      .set({
        status: review.nextStatus,
        reviewNotes: review.notes,
        reviewedByUserId: userId,
        reviewedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(industrialRequirementDiscoveryCandidates.id, current.id),
          eq(
            industrialRequirementDiscoveryCandidates.tenantId,
            input.tenantId,
          ),
          eq(industrialRequirementDiscoveryCandidates.status, current.status),
        ),
      )
      .returning();
    if (!updated[0]) {
      throw new SupplierDiscoveryServiceError(
        "DISCOVERY_REVIEW_CONFLICT",
        409,
        "The discovery candidate changed during review. Reload the queue and try again.",
      );
    }

    await tx.insert(industrialAuditLogs).values({
      tenantId: input.tenantId,
      actorUserId: userId,
      action: "industrial_supplier_discovery.reviewed",
      entityType: "industrial_requirement_discovery_candidate",
      entityId: current.id,
      reason: review.notes,
      previousValue: {
        status: current.status,
        reviewNotes: current.reviewNotes,
      },
      nextValue: {
        status: review.nextStatus,
        reviewNotes: review.notes,
      },
      metadata: {
        humanReviewed: true,
        supplierProfileCreated: false,
        supplierVerified: false,
        identityPublic: false,
        outreachAllowed: false,
        outreachCreated: false,
      },
      createdAt: now,
    });

    return {
      candidate: {
        id: current.id,
        previousStatus: current.status,
        status: review.nextStatus,
        reviewNotes: review.notes,
        reviewedAt: now,
      },
      governance: {
        verificationState: "unverified" as const,
        humanReviewed: true as const,
        supplierProfileCreated: false as const,
        outreachAllowed: false as const,
        outreachCreated: false as const,
      },
      evidence: {
        entity_ids: [current.id],
        affected_rows: 1,
      },
    };
  });
}
