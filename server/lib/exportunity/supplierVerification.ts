import { and, eq, inArray } from "drizzle-orm";

import { db } from "@db";
import {
  industrialAuditLogs,
  industrialDiscoveryEvidence,
  industrialFactoryLeads,
  industrialProductRequirements,
  industrialRequirements,
  industrialRequirementDiscoveryCandidates,
  industrialRequirementSupplierMatches,
  industrialSupplierProfiles,
  industrialSupplierPromotions,
} from "@db/schema";
import { ensureIndustrialTables } from "../industrial/ensureTables";
import { EXPORTUNITY_DISCOVERY_MINIMUM_RELEVANCE } from "./supplierDiscoveryPolicy";
import { resolveRequirementProductFacts } from "./productRequirementReadModel";
import {
  assessSupplierPromotionEvidence,
  parseSupplierPromotionDecision,
  type ParsedSupplierPromotionDecision,
} from "./supplierVerificationPolicy";

const PROMOTABLE_REQUIREMENT_STATUSES = new Set([
  "draft",
  "submitted",
  "triaged",
  "under_review",
  "supplier_matching",
]);

export class SupplierVerificationServiceError extends Error {
  code: string;
  statusCode: number;

  constructor(code: string, statusCode: number, message: string) {
    super(message);
    this.name = "SupplierVerificationServiceError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

function assertExportunityTenant(tenantKey: string) {
  if (String(tenantKey || "").trim().toLowerCase() !== "exportunity") {
    throw new SupplierVerificationServiceError(
      "SUPPLIER_VERIFICATION_TENANT_INVALID",
      404,
      "Supplier verification is available only inside Exportunity.",
    );
  }
}

function actorId(value: number | null | undefined) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new SupplierVerificationServiceError(
      "SUPPLIER_VERIFICATION_REVIEWER_REQUIRED",
      403,
      "An authenticated Exportunity administrator is required for this human decision.",
    );
  }
  return parsed;
}

function toRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}

function uniqueText(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(values.map((value) => String(value || "").trim()).filter(Boolean)),
  );
}

function promotionResponse(input: {
  promotion: typeof industrialSupplierPromotions.$inferSelect;
  profile: typeof industrialSupplierProfiles.$inferSelect;
  createdProfile: boolean;
  createdPromotion: boolean;
  createdMatch: boolean;
}) {
  return {
    status: "promoted" as const,
    promotion: {
      id: input.promotion.id,
      discoveryCandidateId: input.promotion.discoveryCandidateId,
      supplierProfileId: input.promotion.supplierProfileId,
      legalName: input.promotion.legalName,
      countryCode: input.promotion.countryCode,
      verificationScope: input.promotion.verificationScope,
      evidenceIds: input.promotion.evidenceIds,
      approvedAt: input.promotion.approvedAt.toISOString(),
      outreachAllowed: false as const,
    },
    supplierProfile: {
      id: input.profile.id,
      legalName: input.profile.legalName,
      displayName: input.profile.displayName,
      supplierStatus: input.profile.supplierStatus,
      verificationStatus: input.profile.verificationStatus,
      visibility: input.profile.visibility,
      verifiedAt: input.profile.verifiedAt?.toISOString() || null,
    },
    created: {
      supplierProfile: input.createdProfile,
      promotion: input.createdPromotion,
      requirementMatch: input.createdMatch,
    },
    governance: {
      humanDecisionRecorded: true as const,
      verificationScope: input.promotion.verificationScope,
      identityPublic: false as const,
      outreachAllowed: false as const,
      outreachCreated: false as const,
      rfqCreated: false as const,
      quoteCreated: false as const,
      capacityVerified: false as const,
      certificationVerified: false as const,
      performanceVerified: false as const,
    },
  };
}

export async function promoteVerifiedSupplierCandidate(input: {
  tenantId: number;
  tenantKey: string;
  actorUserId: number | null;
  candidateId: string;
  payload: unknown;
}) {
  assertExportunityTenant(input.tenantKey);
  await ensureIndustrialTables();
  const reviewerUserId = actorId(input.actorUserId);
  const decision: ParsedSupplierPromotionDecision = parseSupplierPromotionDecision({
    ...(toRecord(input.payload) as Record<string, unknown>),
    candidateId: input.candidateId,
  });
  const now = new Date();

  return db.transaction(async (tx) => {
    const [candidate] = await tx
      .select({
        id: industrialRequirementDiscoveryCandidates.id,
        requirementId: industrialRequirementDiscoveryCandidates.requirementId,
        factoryLeadId: industrialRequirementDiscoveryCandidates.factoryLeadId,
        status: industrialRequirementDiscoveryCandidates.status,
        relevanceScore: industrialRequirementDiscoveryCandidates.relevanceScore,
        relevanceRationale: industrialRequirementDiscoveryCandidates.relevanceRationale,
        contactStatus: industrialRequirementDiscoveryCandidates.contactStatus,
        outreachAllowed: industrialRequirementDiscoveryCandidates.outreachAllowed,
        humanApprovalRequired:
          industrialRequirementDiscoveryCandidates.humanApprovalRequired,
        reviewedByUserId:
          industrialRequirementDiscoveryCandidates.reviewedByUserId,
        reviewedAt: industrialRequirementDiscoveryCandidates.reviewedAt,
        reviewNotes: industrialRequirementDiscoveryCandidates.reviewNotes,
        companyName: industrialFactoryLeads.name,
        primaryIndustry: industrialFactoryLeads.primaryIndustry,
        leadCountryCode: industrialFactoryLeads.countryCode,
        requirementTitle: industrialRequirements.title,
        requirementCategoryCode: industrialRequirements.categoryCode,
        requirementQuantityText: industrialRequirements.quantityText,
        requirementDeliveryCountryCode:
          industrialRequirements.deliveryCountryCode,
        requirementDeliveryCity: industrialRequirements.deliveryCity,
        requirementStatus: industrialRequirements.status,
        requirementMetadata: industrialRequirements.metadata,
        productRequirement: industrialProductRequirements,
      })
      .from(industrialRequirementDiscoveryCandidates)
      .innerJoin(
        industrialFactoryLeads,
        eq(
          industrialFactoryLeads.id,
          industrialRequirementDiscoveryCandidates.factoryLeadId,
        ),
      )
      .innerJoin(
        industrialRequirements,
        eq(
          industrialRequirements.id,
          industrialRequirementDiscoveryCandidates.requirementId,
        ),
      )
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
          eq(industrialRequirementDiscoveryCandidates.id, decision.candidateId),
          eq(industrialRequirementDiscoveryCandidates.tenantId, input.tenantId),
          eq(industrialFactoryLeads.tenantId, input.tenantId),
          eq(industrialRequirements.tenantId, input.tenantId),
        ),
      )
      .limit(1);

    if (!candidate) {
      throw new SupplierVerificationServiceError(
        "SUPPLIER_VERIFICATION_CANDIDATE_NOT_FOUND",
        404,
        "The Exportunity discovery candidate was not found.",
      );
    }
    const [completedPromotion] = await tx
      .select()
      .from(industrialSupplierPromotions)
      .where(
        and(
          eq(industrialSupplierPromotions.tenantId, input.tenantId),
          eq(industrialSupplierPromotions.discoveryCandidateId, candidate.id),
        ),
      )
      .limit(1);
    if (completedPromotion) {
      const [completedProfile] = await tx
        .select()
        .from(industrialSupplierProfiles)
        .where(
          and(
            eq(industrialSupplierProfiles.tenantId, input.tenantId),
            eq(industrialSupplierProfiles.id, completedPromotion.supplierProfileId),
          ),
        )
        .limit(1);
      if (!completedProfile) {
        throw new SupplierVerificationServiceError(
          "SUPPLIER_VERIFICATION_PROFILE_MISSING",
          409,
          "The existing promotion references a missing supplier profile.",
        );
      }
      return promotionResponse({
        promotion: completedPromotion,
        profile: completedProfile,
        createdProfile: false,
        createdPromotion: false,
        createdMatch: false,
      });
    }
    if (candidate.status !== "verification_pending") {
      throw new SupplierVerificationServiceError(
        "SUPPLIER_VERIFICATION_CANDIDATE_NOT_READY",
        409,
        "Only a human-reviewed verification_pending candidate can be promoted.",
      );
    }
    if (
      candidate.relevanceScore < EXPORTUNITY_DISCOVERY_MINIMUM_RELEVANCE ||
      candidate.humanApprovalRequired !== true ||
      !candidate.reviewedByUserId ||
      !candidate.reviewedAt ||
      !String(candidate.reviewNotes || "").trim()
    ) {
      throw new SupplierVerificationServiceError(
        "SUPPLIER_VERIFICATION_REVIEW_INCOMPLETE",
        409,
        "The discovery record is missing the required human review or relevance threshold.",
      );
    }
    if (!PROMOTABLE_REQUIREMENT_STATUSES.has(candidate.requirementStatus)) {
      throw new SupplierVerificationServiceError(
        "SUPPLIER_VERIFICATION_REQUIREMENT_INACTIVE",
        409,
        "The governed requirement is no longer active for supplier promotion.",
      );
    }
    if (
      candidate.contactStatus !== "not_contacted" ||
      candidate.outreachAllowed !== false
    ) {
      throw new SupplierVerificationServiceError(
        "SUPPLIER_VERIFICATION_GOVERNANCE_BREACH",
        409,
        "The candidate no-contact invariant is not intact.",
      );
    }
    if (
      candidate.leadCountryCode &&
      candidate.leadCountryCode.toUpperCase() !== decision.countryCode
    ) {
      throw new SupplierVerificationServiceError(
        "SUPPLIER_VERIFICATION_COUNTRY_CONFLICT",
        409,
        "The confirmed country conflicts with the discovery record and requires correction before promotion.",
      );
    }

    const [existingPromotion] = await tx
      .select()
      .from(industrialSupplierPromotions)
      .where(
        and(
          eq(industrialSupplierPromotions.tenantId, input.tenantId),
          eq(industrialSupplierPromotions.discoveryCandidateId, candidate.id),
        ),
      )
      .limit(1);
    if (existingPromotion) {
      const [existingProfile] = await tx
        .select()
        .from(industrialSupplierProfiles)
        .where(
          and(
            eq(industrialSupplierProfiles.tenantId, input.tenantId),
            eq(industrialSupplierProfiles.id, existingPromotion.supplierProfileId),
          ),
        )
        .limit(1);
      if (!existingProfile) {
        throw new SupplierVerificationServiceError(
          "SUPPLIER_VERIFICATION_PROFILE_MISSING",
          409,
          "The existing promotion references a missing supplier profile.",
        );
      }
      return promotionResponse({
        promotion: existingPromotion,
        profile: existingProfile,
        createdProfile: false,
        createdPromotion: false,
        createdMatch: false,
      });
    }

    const evidence = await tx
      .select({
        id: industrialDiscoveryEvidence.id,
        sourceType: industrialDiscoveryEvidence.sourceType,
        sourceUrl: industrialDiscoveryEvidence.sourceUrl,
        retrievedAt: industrialDiscoveryEvidence.retrievedAt,
        contentHash: industrialDiscoveryEvidence.contentHash,
        evidence: industrialDiscoveryEvidence.evidence,
      })
      .from(industrialDiscoveryEvidence)
      .where(
        and(
          eq(industrialDiscoveryEvidence.tenantId, input.tenantId),
          eq(industrialDiscoveryEvidence.discoveryCandidateId, candidate.id),
          inArray(industrialDiscoveryEvidence.id, decision.selectedEvidenceIds),
        ),
      );
    const evidenceAssessment = assessSupplierPromotionEvidence({
      decision,
      evidence,
      now,
    });
    const product = resolveRequirementProductFacts({
      requirement: {
        title: candidate.requirementTitle,
        categoryCode: candidate.requirementCategoryCode,
        quantityText: candidate.requirementQuantityText,
        deliveryCountryCode: candidate.requirementDeliveryCountryCode,
        deliveryCity: candidate.requirementDeliveryCity,
        metadata: candidate.requirementMetadata,
      },
      productRequirement: candidate.productRequirement,
    });
    if (!product.name) {
      throw new SupplierVerificationServiceError(
        "SUPPLIER_VERIFICATION_PRODUCT_MISSING",
        409,
        "The governed requirement does not contain a specific product name.",
      );
    }

    const contactFields = {
      email: decision.contact.type === "email" ? decision.contact.value : null,
      phone: decision.contact.type === "phone" ? decision.contact.value : null,
      website: decision.contact.type === "website" ? decision.contact.value : null,
    };
    const insertedProfiles = await tx
      .insert(industrialSupplierProfiles)
      .values({
        tenantId: input.tenantId,
        linkedFactoryId: null,
        ownerUserId: null,
        legalName: decision.legalName,
        displayName: candidate.companyName,
        normalizedName: decision.normalizedLegalName,
        supplierStatus: "active",
        verificationStatus: "verified",
        visibility: "exportunity_internal",
        countryCode: decision.countryCode,
        city: null,
        address: null,
        website: contactFields.website,
        email: contactFields.email,
        phone: contactFields.phone,
        industriesServed: uniqueText([candidate.primaryIndustry, product.name]),
        categoryCodes: uniqueText([candidate.requirementCategoryCode]),
        capabilities: uniqueText([
          product.name,
          product.specification
            ? `${product.name} ${product.specification}`
            : null,
        ]),
        materialsHandled: uniqueText([product.name]),
        certifications: [],
        adminNotes:
          "Human-approved Exportunity promotion. Verification scope is limited to business identity and relevance to the linked requirement product. Capacity, certification, performance, and outreach authority are not verified.",
        verifiedAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()
      .returning();
    let profile = insertedProfiles[0];
    const createdProfile = Boolean(profile);
    if (!profile) {
      [profile] = await tx
        .select()
        .from(industrialSupplierProfiles)
        .where(
          and(
            eq(industrialSupplierProfiles.tenantId, input.tenantId),
            eq(
              industrialSupplierProfiles.normalizedName,
              decision.normalizedLegalName,
            ),
          ),
        )
        .limit(1);
      if (
        !profile ||
        profile.supplierStatus !== "active" ||
        profile.verificationStatus !== "verified" ||
        profile.visibility !== "exportunity_internal" ||
        profile.countryCode.toUpperCase() !== decision.countryCode
      ) {
        throw new SupplierVerificationServiceError(
          "SUPPLIER_VERIFICATION_PROFILE_CONFLICT",
          409,
          "A supplier profile with this legal identity already exists in a conflicting state and requires manual resolution.",
        );
      }
      const [governedExistingProfile] = await tx
        .select({ id: industrialSupplierPromotions.id })
        .from(industrialSupplierPromotions)
        .where(
          and(
            eq(industrialSupplierPromotions.tenantId, input.tenantId),
            eq(industrialSupplierPromotions.supplierProfileId, profile.id),
          ),
        )
        .limit(1);
      if (!governedExistingProfile) {
        throw new SupplierVerificationServiceError(
          "SUPPLIER_VERIFICATION_PROFILE_PROVENANCE_CONFLICT",
          409,
          "The existing supplier profile has no governed promotion provenance and cannot be reused automatically.",
        );
      }
    }

    const insertedPromotions = await tx
      .insert(industrialSupplierPromotions)
      .values({
        tenantId: input.tenantId,
        discoveryCandidateId: candidate.id,
        requirementId: candidate.requirementId,
        supplierProfileId: profile.id,
        verificationScope: decision.verificationScope,
        evidenceIds: decision.selectedEvidenceIds,
        officialEvidenceId: decision.officialEvidenceId,
        contactEvidenceId: decision.contactEvidenceId,
        legalName: decision.legalName,
        countryCode: decision.countryCode,
        contactType: decision.contact.type,
        contactValue: decision.contact.value,
        checklist: decision.checklist,
        decisionNotes: decision.decisionNotes,
        approvedByUserId: reviewerUserId,
        approvedAt: now,
        outreachAllowed: false,
        createdAt: now,
      })
      .onConflictDoNothing()
      .returning();
    const promotion = insertedPromotions[0];
    if (!promotion) {
      throw new SupplierVerificationServiceError(
        "SUPPLIER_VERIFICATION_CONCURRENT_DECISION",
        409,
        "Another administrator completed this promotion. Reload the queue before continuing.",
      );
    }

    const promotedCandidates = await tx
      .update(industrialRequirementDiscoveryCandidates)
      .set({ status: "promoted", updatedAt: now })
      .where(
        and(
          eq(industrialRequirementDiscoveryCandidates.id, candidate.id),
          eq(industrialRequirementDiscoveryCandidates.tenantId, input.tenantId),
          eq(
            industrialRequirementDiscoveryCandidates.status,
            "verification_pending",
          ),
        ),
      )
      .returning({ id: industrialRequirementDiscoveryCandidates.id });
    if (!promotedCandidates[0]) {
      throw new SupplierVerificationServiceError(
        "SUPPLIER_VERIFICATION_CANDIDATE_CHANGED",
        409,
        "The discovery candidate changed during approval. Reload the queue and review it again.",
      );
    }

    const insertedMatches = await tx
      .insert(industrialRequirementSupplierMatches)
      .values({
        tenantId: input.tenantId,
        requirementId: candidate.requirementId,
        supplierProfileId: profile.id,
        status: "candidate",
        matchScore: candidate.relevanceScore,
        matchReason:
          "Human-verified business identity with provenance-backed relevance to this requirement product. No outreach or RFQ was authorized.",
        internalNotes: candidate.relevanceRationale,
        createdByUserId: reviewerUserId,
        selectedByUserId: null,
        selectedAt: null,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()
      .returning({ id: industrialRequirementSupplierMatches.id });

    if (PROMOTABLE_REQUIREMENT_STATUSES.has(candidate.requirementStatus)) {
      await tx
        .update(industrialRequirements)
        .set({ status: "supplier_matching", updatedAt: now })
        .where(
          and(
            eq(industrialRequirements.id, candidate.requirementId),
            eq(industrialRequirements.tenantId, input.tenantId),
          ),
        );
    }

    await tx.insert(industrialAuditLogs).values({
      tenantId: input.tenantId,
      actorUserId: reviewerUserId,
      action: "industrial_supplier_profile.verified_and_promoted",
      entityType: "industrial_supplier_profile",
      entityId: profile.id,
      reason: decision.decisionNotes,
      previousValue: {},
      nextValue: {
        supplierStatus: profile.supplierStatus,
        verificationStatus: profile.verificationStatus,
        visibility: profile.visibility,
        verificationScope: decision.verificationScope,
      },
      metadata: {
        discoveryCandidateId: candidate.id,
        requirementId: candidate.requirementId,
        productRequirementId: product.productRequirementId,
        productRequirementSource: product.source,
        promotionId: promotion.id,
        evidenceIds: decision.selectedEvidenceIds,
        evidenceAssessment,
        checklist: decision.checklist,
        contactType: decision.contact.type,
        humanDecision: true,
        identityPublic: false,
        outreachAllowed: false,
        outreachCreated: false,
        rfqCreated: false,
        quoteCreated: false,
        capacityVerified: false,
        certificationVerified: false,
        performanceVerified: false,
      },
      createdAt: now,
    });

    return promotionResponse({
      promotion,
      profile,
      createdProfile,
      createdPromotion: true,
      createdMatch: insertedMatches.length > 0,
    });
  });
}
