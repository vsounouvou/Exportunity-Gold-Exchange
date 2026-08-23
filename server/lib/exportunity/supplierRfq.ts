import { randomUUID } from "node:crypto";

import { and, desc, eq, inArray } from "drizzle-orm";

import { db } from "@db";
import {
  industrialAuditLogs,
  industrialProductRequirements,
  industrialRequirementDiscoveryCandidates,
  industrialRequirements,
  industrialRequirementSupplierMatches,
  industrialSupplierProfiles,
  industrialSupplierPromotions,
  industrialSupplierRfqDecisions,
  industrialSupplierRfqDrafts,
} from "@db/schema";
import { ensureIndustrialTables } from "../industrial/ensureTables";
import { resolveRequirementProductFacts } from "./productRequirementReadModel";
import {
  assertSupplierRfqContentIntegrity,
  composeSupplierRfqContent,
  parseSupplierRfqApprovalInput,
  parseSupplierRfqDraftInput,
  parseSupplierRfqRejectionInput,
  supplierRfqAuthorizationExpiry,
  type SupplierRfqStatus,
} from "./supplierRfqPolicy";
import { EXPORTUNITY_SUPPLIER_VERIFICATION_SCOPE } from "./supplierVerificationPolicy";

const RFQ_ACTIVE_REQUIREMENT_STATUSES = [
  "submitted",
  "triaged",
  "under_review",
  "supplier_matching",
  "quote_preparation",
] as const;

const RFQ_OPEN_STATUSES = new Set<SupplierRfqStatus>([
  "draft",
  "approval_pending",
  "approved_for_outreach",
]);

export class SupplierRfqServiceError extends Error {
  code: string;
  statusCode: number;

  constructor(code: string, statusCode: number, message: string) {
    super(message);
    this.name = "SupplierRfqServiceError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

function assertExportunityTenant(tenantKey: string) {
  if (String(tenantKey || "").trim().toLowerCase() !== "exportunity") {
    throw new SupplierRfqServiceError(
      "SUPPLIER_RFQ_TENANT_INVALID",
      404,
      "Supplier RFQs are available only inside Exportunity.",
    );
  }
}

function actorId(value: number | null | undefined) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new SupplierRfqServiceError(
      "SUPPLIER_RFQ_ACTOR_REQUIRED",
      403,
      "An authenticated Exportunity staff member is required for this decision.",
    );
  }
  return parsed;
}

function isActiveRequirementStatus(value: string) {
  return (RFQ_ACTIVE_REQUIREMENT_STATUSES as readonly string[]).includes(value);
}

function confirmedProfileContact(input: {
  contactType: string;
  email: string | null;
  phone: string | null;
  website: string | null;
}) {
  if (input.contactType === "email") return input.email;
  if (input.contactType === "phone") return input.phone;
  if (input.contactType === "website") return input.website;
  return null;
}

export type RfqAnchor = {
  promotionId: string;
  promotionRequirementId: string;
  promotionSupplierProfileId: string;
  verificationScope: string;
  promotionContactType: string;
  promotionContactValue: string;
  promotionOutreachAllowed: boolean;
  candidateStatus: string;
  requirementId: string;
  requirementReferenceCode: string;
  requirementTitle: string;
  requirementDetails: string;
  requirementCategoryCode: string | null;
  requirementQuantityText: string | null;
  requirementDeliveryCountryCode: string | null;
  requirementDeliveryCity: string | null;
  requirementRequiredBy: Date | null;
  requirementStatus: string;
  requirementMetadata: unknown;
  productRequirement:
    | typeof industrialProductRequirements.$inferSelect
    | null;
  supplierProfileId: string;
  supplierLegalName: string;
  supplierCountryCode: string;
  supplierEmail: string | null;
  supplierPhone: string | null;
  supplierWebsite: string | null;
  supplierStatus: string;
  supplierVerificationStatus: string;
  supplierVisibility: string;
  requirementSupplierMatchId: string;
  requirementSupplierMatchStatus: string;
};

function assertGovernedRfqAnchor(anchor: RfqAnchor) {
  if (
    anchor.promotionRequirementId !== anchor.requirementId ||
    anchor.promotionSupplierProfileId !== anchor.supplierProfileId
  ) {
    throw new SupplierRfqServiceError(
      "SUPPLIER_RFQ_PROVENANCE_CONFLICT",
      409,
      "The promotion, requirement, supplier profile, and match are not aligned.",
    );
  }
  if (
    anchor.verificationScope !== EXPORTUNITY_SUPPLIER_VERIFICATION_SCOPE ||
    anchor.candidateStatus !== "promoted" ||
    anchor.promotionOutreachAllowed !== false
  ) {
    throw new SupplierRfqServiceError(
      "SUPPLIER_RFQ_PROMOTION_INVALID",
      409,
      "The RFQ requires a governed supplier promotion whose original no-outreach invariant remains intact.",
    );
  }
  if (
    anchor.supplierStatus !== "active" ||
    anchor.supplierVerificationStatus !== "verified" ||
    anchor.supplierVisibility !== "exportunity_internal"
  ) {
    throw new SupplierRfqServiceError(
      "SUPPLIER_RFQ_SUPPLIER_INELIGIBLE",
      409,
      "The private supplier profile is no longer active and verified for Exportunity use.",
    );
  }
  if (!isActiveRequirementStatus(anchor.requirementStatus)) {
    throw new SupplierRfqServiceError(
      "SUPPLIER_RFQ_REQUIREMENT_INACTIVE",
      409,
      "The requirement is not in an active sourcing state.",
    );
  }
  if (anchor.requirementSupplierMatchStatus === "rejected") {
    throw new SupplierRfqServiceError(
      "SUPPLIER_RFQ_MATCH_REJECTED",
      409,
      "The requirement-to-supplier match has been rejected.",
    );
  }
  const profileContact = confirmedProfileContact({
    contactType: anchor.promotionContactType,
    email: anchor.supplierEmail,
    phone: anchor.supplierPhone,
    website: anchor.supplierWebsite,
  });
  if (!profileContact || profileContact !== anchor.promotionContactValue) {
    throw new SupplierRfqServiceError(
      "SUPPLIER_RFQ_CONTACT_CHANGED",
      409,
      "The supplier contact no longer matches the human-verified promotion evidence.",
    );
  }
  return anchor;
}

function productFactsFromAnchor(anchor: RfqAnchor) {
  return resolveRequirementProductFacts({
    requirement: {
      title: anchor.requirementTitle,
      categoryCode: anchor.requirementCategoryCode,
      quantityText: anchor.requirementQuantityText,
      deliveryCountryCode: anchor.requirementDeliveryCountryCode,
      deliveryCity: anchor.requirementDeliveryCity,
      metadata: anchor.requirementMetadata,
    },
    productRequirement: anchor.productRequirement,
  });
}

function composeFromAnchor(input: {
  anchor: RfqAnchor;
  buyerInstructions: string | null;
  responseDeadline: Date;
}) {
  const product = productFactsFromAnchor(input.anchor);
  const hasCanonicalProduct =
    product.source === "canonical_product_requirement" &&
    Boolean(product.productRequirementId);
  return composeSupplierRfqContent({
    requirement: {
      referenceCode: input.anchor.requirementReferenceCode,
      title: hasCanonicalProduct
        ? product.name
        : input.anchor.requirementTitle,
      details: input.anchor.requirementDetails,
      quantityText: hasCanonicalProduct
        ? product.quantityText
        : input.anchor.requirementQuantityText,
      deliveryCountryCode: input.anchor.requirementDeliveryCountryCode,
      deliveryCity: input.anchor.requirementDeliveryCity,
      requiredBy: input.anchor.requirementRequiredBy,
      productRequirement: hasCanonicalProduct ? product : null,
    },
    supplier: {
      legalName: input.anchor.supplierLegalName,
      countryCode: input.anchor.supplierCountryCode,
      contactType: input.anchor.promotionContactType,
      contactValue: input.anchor.promotionContactValue,
      verificationScope: input.anchor.verificationScope,
    },
    buyerInstructions: input.buyerInstructions,
    responseDeadline: input.responseDeadline,
  });
}

function assertCurrentContent(input: {
  anchor: RfqAnchor;
  draft: typeof industrialSupplierRfqDrafts.$inferSelect;
}) {
  assertSupplierRfqContentIntegrity({
    subject: input.draft.subject,
    messageBody: input.draft.messageBody,
    requestedFields: input.draft.requestedFields,
    requirementSnapshot: input.draft.requirementSnapshot,
    supplierSnapshot: input.draft.supplierSnapshot,
    buyerInstructions: input.draft.buyerInstructions,
    responseDeadline: input.draft.responseDeadline,
    contentHash: input.draft.contentHash,
  });
  const current = composeFromAnchor({
    anchor: input.anchor,
    buyerInstructions: input.draft.buyerInstructions,
    responseDeadline: input.draft.responseDeadline,
  });
  if (current.contentHash !== input.draft.contentHash) {
    throw new SupplierRfqServiceError(
      "SUPPLIER_RFQ_SOURCE_CHANGED",
      409,
      "The requirement or verified supplier contact changed after drafting. Create a new RFQ revision.",
    );
  }
}

function referenceCode(now: Date, revision: number) {
  const stamp = now.toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  return `ERFQ-${stamp}-R${revision}-${randomUUID().slice(0, 8).toUpperCase()}`;
}

function dateString(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

function draftResponse(input: {
  draft: typeof industrialSupplierRfqDrafts.$inferSelect;
  decision?: typeof industrialSupplierRfqDecisions.$inferSelect | null;
  supplierLegalName?: string;
}) {
  const { draft, decision = null } = input;
  return {
    id: draft.id,
    promotionId: draft.promotionId,
    requirementId: draft.requirementId,
    supplierProfileId: draft.supplierProfileId,
    requirementSupplierMatchId: draft.requirementSupplierMatchId,
    referenceCode: draft.referenceCode,
    revision: draft.revision,
    status: draft.status,
    subject: draft.subject,
    messageBody: draft.messageBody,
    requestedFields: draft.requestedFields,
    requirementSnapshot: draft.requirementSnapshot,
    supplierSnapshot: draft.supplierSnapshot,
    supplierLegalName:
      input.supplierLegalName || String(draft.supplierSnapshot?.legalName || ""),
    buyerInstructions: draft.buyerInstructions,
    responseDeadline: draft.responseDeadline.toISOString(),
    contentHash: draft.contentHash,
    submittedAt: dateString(draft.submittedAt),
    delivery: {
      status: "not_sent" as const,
      channel: null,
      deliveredAt: null,
      externalMessageId: null,
    },
    decision: decision
      ? {
          id: decision.id,
          decision: decision.decision,
          contentHash: decision.contentHash,
          checklist: decision.checklist,
          decisionNotes: decision.decisionNotes,
          decidedAt: decision.decidedAt.toISOString(),
          authorizationExpiresAt: dateString(decision.authorizationExpiresAt),
          outreachAuthorized: decision.outreachAuthorized,
          dispatchCreated: decision.dispatchCreated,
        }
      : null,
    createdAt: draft.createdAt.toISOString(),
    updatedAt: draft.updatedAt.toISOString(),
  };
}

function eligibilityResponse(anchor: RfqAnchor, latestStatus: string | null) {
  const product = productFactsFromAnchor(anchor);
  return {
    promotionId: anchor.promotionId,
    requirementId: anchor.requirementId,
    requirementSupplierMatchId: anchor.requirementSupplierMatchId,
    supplierProfileId: anchor.supplierProfileId,
    requirementReferenceCode: anchor.requirementReferenceCode,
    requirementTitle:
      product.source === "canonical_product_requirement"
        ? product.name
        : anchor.requirementTitle,
    productRequirementId: product.productRequirementId,
    productRequirementSource: product.source,
    productName: product.name,
    specification: product.specification,
    quantityText: product.quantityText,
    destination: product.destination,
    deliveryCountryCode: anchor.requirementDeliveryCountryCode,
    deliveryCity: anchor.requirementDeliveryCity,
    supplierLegalName: anchor.supplierLegalName,
    supplierCountryCode: anchor.supplierCountryCode,
    confirmedContact: {
      type: anchor.promotionContactType,
      value: anchor.promotionContactValue,
    },
    verificationScope: anchor.verificationScope,
    latestRfqStatus: latestStatus,
    canCreateDraft: !latestStatus || !RFQ_OPEN_STATUSES.has(latestStatus as SupplierRfqStatus),
  };
}

function anchorSelect() {
  return {
    promotionId: industrialSupplierPromotions.id,
    promotionRequirementId: industrialSupplierPromotions.requirementId,
    promotionSupplierProfileId: industrialSupplierPromotions.supplierProfileId,
    verificationScope: industrialSupplierPromotions.verificationScope,
    promotionContactType: industrialSupplierPromotions.contactType,
    promotionContactValue: industrialSupplierPromotions.contactValue,
    promotionOutreachAllowed: industrialSupplierPromotions.outreachAllowed,
    candidateStatus: industrialRequirementDiscoveryCandidates.status,
    requirementId: industrialRequirements.id,
    requirementReferenceCode: industrialRequirements.referenceCode,
    requirementTitle: industrialRequirements.title,
    requirementDetails: industrialRequirements.details,
    requirementCategoryCode: industrialRequirements.categoryCode,
    requirementQuantityText: industrialRequirements.quantityText,
    requirementDeliveryCountryCode: industrialRequirements.deliveryCountryCode,
    requirementDeliveryCity: industrialRequirements.deliveryCity,
    requirementRequiredBy: industrialRequirements.requiredBy,
    requirementStatus: industrialRequirements.status,
    requirementMetadata: industrialRequirements.metadata,
    productRequirement: industrialProductRequirements,
    supplierProfileId: industrialSupplierProfiles.id,
    supplierLegalName: industrialSupplierProfiles.legalName,
    supplierCountryCode: industrialSupplierProfiles.countryCode,
    supplierEmail: industrialSupplierProfiles.email,
    supplierPhone: industrialSupplierProfiles.phone,
    supplierWebsite: industrialSupplierProfiles.website,
    supplierStatus: industrialSupplierProfiles.supplierStatus,
    supplierVerificationStatus: industrialSupplierProfiles.verificationStatus,
    supplierVisibility: industrialSupplierProfiles.visibility,
    requirementSupplierMatchId: industrialRequirementSupplierMatches.id,
    requirementSupplierMatchStatus: industrialRequirementSupplierMatches.status,
  };
}

function anchorQuery(tx: any) {
  return tx
    .select(anchorSelect())
    .from(industrialSupplierPromotions)
    .innerJoin(
      industrialRequirementDiscoveryCandidates,
      eq(
        industrialRequirementDiscoveryCandidates.id,
        industrialSupplierPromotions.discoveryCandidateId,
      ),
    )
    .innerJoin(
      industrialRequirements,
      eq(industrialRequirements.id, industrialSupplierPromotions.requirementId),
    )
    .leftJoin(
      industrialProductRequirements,
      and(
        eq(
          industrialProductRequirements.requirementId,
          industrialRequirements.id,
        ),
        eq(
          industrialProductRequirements.tenantId,
          industrialSupplierPromotions.tenantId,
        ),
      ),
    )
    .innerJoin(
      industrialSupplierProfiles,
      eq(industrialSupplierProfiles.id, industrialSupplierPromotions.supplierProfileId),
    )
    .innerJoin(
      industrialRequirementSupplierMatches,
      and(
        eq(
          industrialRequirementSupplierMatches.requirementId,
          industrialSupplierPromotions.requirementId,
        ),
        eq(
          industrialRequirementSupplierMatches.supplierProfileId,
          industrialSupplierPromotions.supplierProfileId,
        ),
      ),
    );
}

async function loadAnchorByPromotion(
  tx: any,
  input: { tenantId: number; promotionId: string },
) {
  const [anchor] = await anchorQuery(tx)
    .where(
      and(
        eq(industrialSupplierPromotions.id, input.promotionId),
        eq(industrialSupplierPromotions.tenantId, input.tenantId),
        eq(industrialRequirements.tenantId, input.tenantId),
        eq(industrialSupplierProfiles.tenantId, input.tenantId),
        eq(industrialRequirementSupplierMatches.tenantId, input.tenantId),
        eq(industrialRequirementDiscoveryCandidates.tenantId, input.tenantId),
      ),
    )
    .limit(1);
  if (!anchor) {
    throw new SupplierRfqServiceError(
      "SUPPLIER_RFQ_PROMOTION_NOT_FOUND",
      404,
      "The governed supplier promotion was not found.",
    );
  }
  return assertGovernedRfqAnchor(anchor as RfqAnchor);
}

async function loadDraftWithAnchor(
  tx: any,
  input: { tenantId: number; draftId: string },
) {
  const [draft] = await tx
    .select()
    .from(industrialSupplierRfqDrafts)
    .where(
      and(
        eq(industrialSupplierRfqDrafts.id, input.draftId),
        eq(industrialSupplierRfqDrafts.tenantId, input.tenantId),
      ),
    )
    .limit(1);
  if (!draft) {
    throw new SupplierRfqServiceError(
      "SUPPLIER_RFQ_DRAFT_NOT_FOUND",
      404,
      "The supplier RFQ draft was not found.",
    );
  }
  const anchor = await loadAnchorByPromotion(tx, {
    tenantId: input.tenantId,
    promotionId: draft.promotionId,
  });
  if (
    anchor.requirementId !== draft.requirementId ||
    anchor.supplierProfileId !== draft.supplierProfileId ||
    anchor.requirementSupplierMatchId !== draft.requirementSupplierMatchId
  ) {
    throw new SupplierRfqServiceError(
      "SUPPLIER_RFQ_DRAFT_PROVENANCE_CONFLICT",
      409,
      "The RFQ draft no longer matches its governed supplier promotion.",
    );
  }
  return { draft, anchor };
}

async function loadDecision(tx: any, tenantId: number, draftId: string) {
  const [decision] = await tx
    .select()
    .from(industrialSupplierRfqDecisions)
    .where(
      and(
        eq(industrialSupplierRfqDecisions.tenantId, tenantId),
        eq(industrialSupplierRfqDecisions.rfqDraftId, draftId),
      ),
    )
    .limit(1);
  return decision || null;
}

export async function loadGovernedSupplierRfqDispatchContext(
  tx: any,
  input: { tenantId: number; draftId: string },
) {
  const { draft, anchor } = await loadDraftWithAnchor(tx, input);
  const decision = await loadDecision(tx, input.tenantId, draft.id);
  assertCurrentContent({ anchor, draft });
  return { draft, anchor, decision };
}

export async function listSupplierRfqs(input: {
  tenantId: number;
  tenantKey: string;
  status?: SupplierRfqStatus | null;
  limit?: number;
}) {
  assertExportunityTenant(input.tenantKey);
  await ensureIndustrialTables();
  const limit = Math.min(Math.max(Number(input.limit) || 50, 1), 100);
  const conditions = [
    eq(industrialSupplierRfqDrafts.tenantId, input.tenantId),
    eq(industrialSupplierProfiles.tenantId, input.tenantId),
  ];
  if (input.status) conditions.push(eq(industrialSupplierRfqDrafts.status, input.status));

  const rows = await db
    .select({
      draft: industrialSupplierRfqDrafts,
      supplierLegalName: industrialSupplierProfiles.legalName,
      decision: industrialSupplierRfqDecisions,
    })
    .from(industrialSupplierRfqDrafts)
    .innerJoin(
      industrialSupplierProfiles,
      eq(industrialSupplierProfiles.id, industrialSupplierRfqDrafts.supplierProfileId),
    )
    .leftJoin(
      industrialSupplierRfqDecisions,
      and(
        eq(industrialSupplierRfqDecisions.rfqDraftId, industrialSupplierRfqDrafts.id),
        eq(industrialSupplierRfqDecisions.tenantId, input.tenantId),
      ),
    )
    .where(and(...conditions))
    .orderBy(desc(industrialSupplierRfqDrafts.updatedAt))
    .limit(limit);

  const anchors = await anchorQuery(db)
    .where(
      and(
        eq(industrialSupplierPromotions.tenantId, input.tenantId),
        eq(industrialRequirements.tenantId, input.tenantId),
        eq(industrialSupplierProfiles.tenantId, input.tenantId),
        eq(industrialRequirementSupplierMatches.tenantId, input.tenantId),
        eq(industrialRequirementDiscoveryCandidates.tenantId, input.tenantId),
        inArray(industrialRequirements.status, [...RFQ_ACTIVE_REQUIREMENT_STATUSES]),
        eq(industrialRequirementDiscoveryCandidates.status, "promoted"),
        eq(industrialSupplierPromotions.outreachAllowed, false),
        eq(
          industrialSupplierPromotions.verificationScope,
          EXPORTUNITY_SUPPLIER_VERIFICATION_SCOPE,
        ),
        eq(industrialSupplierProfiles.supplierStatus, "active"),
        eq(industrialSupplierProfiles.verificationStatus, "verified"),
        eq(industrialSupplierProfiles.visibility, "exportunity_internal"),
        inArray(industrialRequirementSupplierMatches.status, [
          "candidate",
          "shortlisted",
          "selected",
        ]),
      ),
    )
    .orderBy(desc(industrialSupplierPromotions.approvedAt))
    .limit(100);

  const latestByPromotion = new Map<string, string>();
  const latestRows = await db
    .select({
      promotionId: industrialSupplierRfqDrafts.promotionId,
      status: industrialSupplierRfqDrafts.status,
      revision: industrialSupplierRfqDrafts.revision,
    })
    .from(industrialSupplierRfqDrafts)
    .where(eq(industrialSupplierRfqDrafts.tenantId, input.tenantId))
    .orderBy(
      industrialSupplierRfqDrafts.promotionId,
      desc(industrialSupplierRfqDrafts.revision),
    );
  for (const item of latestRows) {
    if (!latestByPromotion.has(item.promotionId)) {
      latestByPromotion.set(item.promotionId, item.status);
    }
  }

  return {
    items: rows.map((row) =>
      draftResponse({
        draft: row.draft,
        decision: row.decision,
        supplierLegalName: row.supplierLegalName,
      }),
    ),
    eligiblePromotions: (anchors as RfqAnchor[])
      .map((anchor: RfqAnchor) => assertGovernedRfqAnchor(anchor))
      .map((anchor: RfqAnchor) =>
        eligibilityResponse(
          anchor,
          latestByPromotion.get(anchor.promotionId) || null,
        ),
      ),
    governance: {
      humanApprovalRequired: true as const,
      contentHashBound: true as const,
      externalSideEffect: false as const,
      deliveryCreated: false as const,
      supportedDeliveryChannels: [] as const,
      separateDispatchRequired: true as const,
    },
  };
}

export async function createSupplierRfqDraft(input: {
  tenantId: number;
  tenantKey: string;
  actorUserId: number | null;
  payload: unknown;
}) {
  assertExportunityTenant(input.tenantKey);
  await ensureIndustrialTables();
  const userId = actorId(input.actorUserId);
  const now = new Date();
  const parsed = parseSupplierRfqDraftInput(input.payload, { now });

  return db.transaction(async (tx) => {
    const anchor = await loadAnchorByPromotion(tx, {
      tenantId: input.tenantId,
      promotionId: parsed.promotionId,
    });
    const content = composeFromAnchor({
      anchor,
      buyerInstructions: parsed.buyerInstructions,
      responseDeadline: parsed.responseDeadline,
    });
    const product = productFactsFromAnchor(anchor);

    const [sameContent] = await tx
      .select()
      .from(industrialSupplierRfqDrafts)
      .where(
        and(
          eq(industrialSupplierRfqDrafts.tenantId, input.tenantId),
          eq(industrialSupplierRfqDrafts.promotionId, anchor.promotionId),
          eq(industrialSupplierRfqDrafts.contentHash, content.contentHash),
        ),
      )
      .limit(1);
    if (sameContent) {
      return {
        draft: draftResponse({ draft: sameContent }),
        created: false,
        governance: {
          outreachAuthorized: false as const,
          deliveryCreated: false as const,
          separateApprovalRequired: true as const,
        },
      };
    }

    const [latest] = await tx
      .select()
      .from(industrialSupplierRfqDrafts)
      .where(
        and(
          eq(industrialSupplierRfqDrafts.tenantId, input.tenantId),
          eq(industrialSupplierRfqDrafts.promotionId, anchor.promotionId),
        ),
      )
      .orderBy(desc(industrialSupplierRfqDrafts.revision))
      .limit(1);
    if (latest && RFQ_OPEN_STATUSES.has(latest.status)) {
      throw new SupplierRfqServiceError(
        "SUPPLIER_RFQ_OPEN_REVISION_EXISTS",
        409,
        "This supplier promotion already has an open RFQ revision.",
      );
    }
    const revision = (latest?.revision || 0) + 1;
    const inserted = await tx
      .insert(industrialSupplierRfqDrafts)
      .values({
        tenantId: input.tenantId,
        promotionId: anchor.promotionId,
        requirementId: anchor.requirementId,
        supplierProfileId: anchor.supplierProfileId,
        requirementSupplierMatchId: anchor.requirementSupplierMatchId,
        referenceCode: referenceCode(now, revision),
        revision,
        status: "draft",
        subject: content.subject,
        messageBody: content.messageBody,
        requestedFields: content.requestedFields,
        requirementSnapshot: content.requirementSnapshot,
        supplierSnapshot: content.supplierSnapshot,
        buyerInstructions: content.buyerInstructions,
        responseDeadline: content.responseDeadline,
        contentHash: content.contentHash,
        createdByUserId: userId,
        submittedByUserId: null,
        submittedAt: null,
        deliveryStatus: "not_sent",
        deliveryChannel: null,
        deliveredAt: null,
        externalMessageId: null,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()
      .returning();
    const draft = inserted[0];
    if (!draft) {
      throw new SupplierRfqServiceError(
        "SUPPLIER_RFQ_CONCURRENT_DRAFT",
        409,
        "Another RFQ revision was created concurrently. Reload the queue.",
      );
    }

    await tx.insert(industrialAuditLogs).values({
      tenantId: input.tenantId,
      actorUserId: userId,
      action: "industrial_supplier_rfq.draft_created",
      entityType: "industrial_supplier_rfq_draft",
      entityId: draft.id,
      reason: "Created a content-hashed internal RFQ draft from a governed supplier promotion.",
      previousValue: {},
      nextValue: {
        status: "draft",
        contentHash: draft.contentHash,
        revision: draft.revision,
      },
      metadata: {
        promotionId: anchor.promotionId,
        requirementId: anchor.requirementId,
        productRequirementId: product.productRequirementId,
        productRequirementSource: product.source,
        supplierProfileId: anchor.supplierProfileId,
        humanApprovalRequired: true,
        externalSideEffect: false,
        outreachAuthorized: false,
        deliveryCreated: false,
        supportedDeliveryChannels: [],
      },
      createdAt: now,
    });

    return {
      draft: draftResponse({ draft }),
      created: true,
      governance: {
        outreachAuthorized: false as const,
        deliveryCreated: false as const,
        separateApprovalRequired: true as const,
      },
    };
  });
}

export async function submitSupplierRfqForApproval(input: {
  tenantId: number;
  tenantKey: string;
  actorUserId: number | null;
  draftId: string;
}) {
  assertExportunityTenant(input.tenantKey);
  await ensureIndustrialTables();
  const userId = actorId(input.actorUserId);
  const now = new Date();

  return db.transaction(async (tx) => {
    const { draft, anchor } = await loadDraftWithAnchor(tx, input);
    const decision = await loadDecision(tx, input.tenantId, draft.id);
    if (decision) {
      throw new SupplierRfqServiceError(
        "SUPPLIER_RFQ_ALREADY_DECIDED",
        409,
        "This RFQ revision already has an immutable decision.",
      );
    }
    if (draft.status === "approval_pending") {
      return {
        draft: draftResponse({ draft }),
        submitted: false,
        governance: { deliveryCreated: false as const },
      };
    }
    if (draft.status !== "draft") {
      throw new SupplierRfqServiceError(
        "SUPPLIER_RFQ_NOT_DRAFT",
        409,
        "Only a draft RFQ can be submitted for approval.",
      );
    }
    if (draft.responseDeadline.getTime() <= now.getTime() + 60 * 60 * 1_000) {
      throw new SupplierRfqServiceError(
        "SUPPLIER_RFQ_DEADLINE_TOO_CLOSE",
        409,
        "The response deadline must remain at least one hour in the future.",
      );
    }
    assertCurrentContent({ anchor, draft });

    const updated = await tx
      .update(industrialSupplierRfqDrafts)
      .set({
        status: "approval_pending",
        submittedByUserId: userId,
        submittedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(industrialSupplierRfqDrafts.id, draft.id),
          eq(industrialSupplierRfqDrafts.tenantId, input.tenantId),
          eq(industrialSupplierRfqDrafts.status, "draft"),
        ),
      )
      .returning();
    if (!updated[0]) {
      throw new SupplierRfqServiceError(
        "SUPPLIER_RFQ_SUBMISSION_CONFLICT",
        409,
        "The RFQ changed during submission. Reload and review it again.",
      );
    }

    await tx.insert(industrialAuditLogs).values({
      tenantId: input.tenantId,
      actorUserId: userId,
      action: "industrial_supplier_rfq.submitted_for_approval",
      entityType: "industrial_supplier_rfq_draft",
      entityId: draft.id,
      reason: "Submitted the frozen RFQ content hash for a human approval decision.",
      previousValue: { status: "draft" },
      nextValue: { status: "approval_pending", contentHash: draft.contentHash },
      metadata: {
        externalSideEffect: false,
        outreachAuthorized: false,
        deliveryCreated: false,
      },
      createdAt: now,
    });

    return {
      draft: draftResponse({ draft: updated[0] }),
      submitted: true,
      governance: { deliveryCreated: false as const },
    };
  });
}

export async function approveSupplierRfqOutreach(input: {
  tenantId: number;
  tenantKey: string;
  actorUserId: number | null;
  draftId: string;
  payload: unknown;
}) {
  assertExportunityTenant(input.tenantKey);
  await ensureIndustrialTables();
  const userId = actorId(input.actorUserId);
  const approval = parseSupplierRfqApprovalInput(input.payload);
  const now = new Date();

  return db.transaction(async (tx) => {
    const { draft, anchor } = await loadDraftWithAnchor(tx, input);
    const completed = await loadDecision(tx, input.tenantId, draft.id);
    if (completed) {
      if (completed.decision !== "approved") {
        throw new SupplierRfqServiceError(
          "SUPPLIER_RFQ_ALREADY_REJECTED",
          409,
          "This RFQ revision has already been rejected.",
        );
      }
      return {
        draft: draftResponse({ draft, decision: completed }),
        decided: false,
        governance: {
          outreachAuthorized: true as const,
          dispatchCreated: false as const,
          separateDispatchRequired: true as const,
        },
      };
    }
    if (draft.status !== "approval_pending") {
      throw new SupplierRfqServiceError(
        "SUPPLIER_RFQ_NOT_PENDING",
        409,
        "Only an approval_pending RFQ can be approved.",
      );
    }
    if (draft.responseDeadline.getTime() <= now.getTime() + 60 * 60 * 1_000) {
      throw new SupplierRfqServiceError(
        "SUPPLIER_RFQ_DEADLINE_TOO_CLOSE",
        409,
        "The response deadline must remain at least one hour in the future.",
      );
    }
    assertCurrentContent({ anchor, draft });
    const requestedExpiry = supplierRfqAuthorizationExpiry({
      decidedAt: now,
      authorizationWindowHours: approval.authorizationWindowHours,
    });
    const authorizationExpiresAt = new Date(
      Math.min(requestedExpiry.getTime(), draft.responseDeadline.getTime()),
    );

    const inserted = await tx
      .insert(industrialSupplierRfqDecisions)
      .values({
        tenantId: input.tenantId,
        rfqDraftId: draft.id,
        decision: "approved",
        contentHash: draft.contentHash,
        checklist: approval.checklist,
        decisionNotes: approval.decisionNotes,
        decidedByUserId: userId,
        decidedAt: now,
        authorizationExpiresAt,
        outreachAuthorized: true,
        dispatchCreated: false,
        createdAt: now,
      })
      .onConflictDoNothing()
      .returning();
    if (!inserted[0]) {
      throw new SupplierRfqServiceError(
        "SUPPLIER_RFQ_DECISION_CONFLICT",
        409,
        "Another administrator decided this RFQ. Reload the queue.",
      );
    }
    const updated = await tx
      .update(industrialSupplierRfqDrafts)
      .set({ status: "approved_for_outreach", updatedAt: now })
      .where(
        and(
          eq(industrialSupplierRfqDrafts.id, draft.id),
          eq(industrialSupplierRfqDrafts.tenantId, input.tenantId),
          eq(industrialSupplierRfqDrafts.status, "approval_pending"),
        ),
      )
      .returning();
    if (!updated[0]) {
      throw new SupplierRfqServiceError(
        "SUPPLIER_RFQ_APPROVAL_CONFLICT",
        409,
        "The RFQ changed during approval. Reload the queue.",
      );
    }

    await tx.insert(industrialAuditLogs).values({
      tenantId: input.tenantId,
      actorUserId: userId,
      action: "industrial_supplier_rfq.outreach_approved",
      entityType: "industrial_supplier_rfq_draft",
      entityId: draft.id,
      reason: approval.decisionNotes,
      previousValue: { status: "approval_pending", outreachAuthorized: false },
      nextValue: {
        status: "approved_for_outreach",
        outreachAuthorized: true,
        authorizationExpiresAt: authorizationExpiresAt.toISOString(),
      },
      metadata: {
        decisionId: inserted[0].id,
        contentHash: draft.contentHash,
        checklist: approval.checklist,
        externalSideEffect: false,
        deliveryCreated: false,
        dispatchCreated: false,
        separateDispatchRequired: true,
      },
      createdAt: now,
    });

    return {
      draft: draftResponse({ draft: updated[0], decision: inserted[0] }),
      decided: true,
      governance: {
        outreachAuthorized: true as const,
        dispatchCreated: false as const,
        separateDispatchRequired: true as const,
      },
    };
  });
}

export async function rejectSupplierRfq(input: {
  tenantId: number;
  tenantKey: string;
  actorUserId: number | null;
  draftId: string;
  payload: unknown;
}) {
  assertExportunityTenant(input.tenantKey);
  await ensureIndustrialTables();
  const userId = actorId(input.actorUserId);
  const rejection = parseSupplierRfqRejectionInput(input.payload);
  const now = new Date();

  return db.transaction(async (tx) => {
    const { draft } = await loadDraftWithAnchor(tx, input);
    const completed = await loadDecision(tx, input.tenantId, draft.id);
    if (completed) {
      if (completed.decision !== "rejected") {
        throw new SupplierRfqServiceError(
          "SUPPLIER_RFQ_ALREADY_APPROVED",
          409,
          "This RFQ revision has already been approved.",
        );
      }
      return {
        draft: draftResponse({ draft, decision: completed }),
        decided: false,
        governance: { outreachAuthorized: false as const, deliveryCreated: false as const },
      };
    }
    if (draft.status !== "approval_pending") {
      throw new SupplierRfqServiceError(
        "SUPPLIER_RFQ_NOT_PENDING",
        409,
        "Only an approval_pending RFQ can be rejected.",
      );
    }
    const inserted = await tx
      .insert(industrialSupplierRfqDecisions)
      .values({
        tenantId: input.tenantId,
        rfqDraftId: draft.id,
        decision: "rejected",
        contentHash: draft.contentHash,
        checklist: {},
        decisionNotes: rejection.decisionNotes,
        decidedByUserId: userId,
        decidedAt: now,
        authorizationExpiresAt: null,
        outreachAuthorized: false,
        dispatchCreated: false,
        createdAt: now,
      })
      .onConflictDoNothing()
      .returning();
    if (!inserted[0]) {
      throw new SupplierRfqServiceError(
        "SUPPLIER_RFQ_DECISION_CONFLICT",
        409,
        "Another administrator decided this RFQ. Reload the queue.",
      );
    }
    const updated = await tx
      .update(industrialSupplierRfqDrafts)
      .set({ status: "rejected", updatedAt: now })
      .where(
        and(
          eq(industrialSupplierRfqDrafts.id, draft.id),
          eq(industrialSupplierRfqDrafts.tenantId, input.tenantId),
          eq(industrialSupplierRfqDrafts.status, "approval_pending"),
        ),
      )
      .returning();
    if (!updated[0]) {
      throw new SupplierRfqServiceError(
        "SUPPLIER_RFQ_REJECTION_CONFLICT",
        409,
        "The RFQ changed during rejection. Reload the queue.",
      );
    }

    await tx.insert(industrialAuditLogs).values({
      tenantId: input.tenantId,
      actorUserId: userId,
      action: "industrial_supplier_rfq.rejected",
      entityType: "industrial_supplier_rfq_draft",
      entityId: draft.id,
      reason: rejection.decisionNotes,
      previousValue: { status: "approval_pending" },
      nextValue: { status: "rejected", outreachAuthorized: false },
      metadata: {
        decisionId: inserted[0].id,
        contentHash: draft.contentHash,
        externalSideEffect: false,
        deliveryCreated: false,
        dispatchCreated: false,
      },
      createdAt: now,
    });

    return {
      draft: draftResponse({ draft: updated[0], decision: inserted[0] }),
      decided: true,
      governance: { outreachAuthorized: false as const, deliveryCreated: false as const },
    };
  });
}
