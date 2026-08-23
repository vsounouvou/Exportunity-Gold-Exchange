import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";

import { db } from "@db";
import {
  contacts,
  industrialAuditLogs,
  industrialOrders,
  industrialQuotes,
  industrialRequirements,
  industrialSupplierProfiles,
  industrialSupplierQuotes,
} from "@db/schema";
import { ensureIndustrialTables } from "../industrial/ensureTables";
import { recordIndustrialTradeConversion } from "../industrial/tradeConversion";
import {
  buildCommercialOfferPricing,
  commercialOfferSourceEvidenceMatches,
  CommercialOfferPolicyError,
  formatMinorUnits,
  parseCommercialOfferApprovalInput,
  parseCommercialOfferCustomerResponseInput,
  parseCommercialOfferDraftInput,
  parseCommercialOfferIssueInput,
  parseCommercialOfferRejectionInput,
  parseCommercialOfferSubmissionInput,
  parseCommercialOrderCreateInput,
} from "./commercialOfferPolicy";

export class CommercialOfferServiceError extends Error {
  code: string;
  statusCode: number;

  constructor(code: string, statusCode: number, message: string) {
    super(message);
    this.name = "CommercialOfferServiceError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

function assertExportunityTenant(tenantKey: string) {
  if (String(tenantKey || "").trim().toLowerCase() !== "exportunity") {
    throw new CommercialOfferServiceError(
      "COMMERCIAL_OFFER_TENANT_INVALID",
      404,
      "Commercial offer preparation is available only inside Exportunity.",
    );
  }
}

function actorId(value: number | null | undefined) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new CommercialOfferServiceError(
      "COMMERCIAL_OFFER_ACTOR_REQUIRED",
      403,
      "An authenticated Exportunity staff member is required.",
    );
  }
  return parsed;
}

function iso(value: Date | string | null | undefined) {
  if (!value) return null;
  return new Date(value).toISOString();
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

type OfferEnrichment = {
  sourceReferenceCode?: string | null;
  sourceQuoteHash?: string | null;
  supplierLegalName?: string | null;
  orderId?: string | null;
  orderReferenceCode?: string | null;
  orderStatus?: string | null;
  orderPaymentStatus?: string | null;
};

function offerResponse(
  offer: typeof industrialQuotes.$inferSelect,
  enrichment: OfferEnrichment = {},
) {
  const currencyCode = offer.currencyCode;
  const customerOfferIssued = Boolean(offer.issuedAt);
  const customerResponseRecorded = Boolean(offer.customerResponseHash);
  const orderCreated = Boolean(enrichment.orderId);
  const displayAmount = (value: string | null) =>
    value === null
      ? null
      : `${currencyCode} ${formatMinorUnits(value, currencyCode)}`;
  return {
    id: offer.id,
    referenceCode: offer.referenceCode,
    requirementId: offer.requirementId,
    status: offer.status,
    visibility: offer.visibility,
    source: {
      supplierQuoteId: offer.sourceSupplierQuoteId,
      supplierQuoteReferenceCode: enrichment.sourceReferenceCode ?? null,
      supplierQuoteHash: enrichment.sourceQuoteHash ?? null,
      supplierLegalName: enrichment.supplierLegalName ?? null,
    },
    pricing: {
      version: offer.pricingVersion,
      hash: offer.pricingHash,
      currencyCode,
      supplierCostMinor: offer.supplierCostMinor,
      additionalCostsMinor: offer.additionalCostsMinor,
      totalCostMinor: offer.totalCostMinor,
      targetGrossMarginBps: offer.targetGrossMarginBps,
      marginMinor: offer.marginMinor,
      customerPriceMinor: offer.customerPriceMinor,
      display: {
        supplierCost: displayAmount(offer.supplierCostMinor),
        additionalCosts: displayAmount(offer.additionalCostsMinor),
        totalCost: displayAmount(offer.totalCostMinor),
        margin: displayAmount(offer.marginMinor),
        customerPrice: displayAmount(offer.customerPriceMinor),
      },
      costStack: offer.costStack,
      checklist: offer.pricingChecklist,
      notes: offer.pricingNotes,
    },
    customerDraft: {
      totalAmount: offer.totalAmount,
      lineItems: offer.lineItems,
      leadTime: offer.leadTimeText,
      validUntil: iso(offer.validUntil),
      commercialTerms: offer.commercialTerms,
      customerNotes: offer.customerNotes,
    },
    review: {
      submittedByUserId: offer.pricingSubmittedByUserId,
      submittedAt: iso(offer.pricingSubmittedAt),
      approvedByUserId: offer.pricingApprovedByUserId,
      approvedAt: iso(offer.pricingApprovedAt),
      decisionNotes: offer.pricingDecisionNotes,
    },
    customerResponse: {
      status:
        offer.status === "accepted" || offer.status === "declined"
          ? offer.status
          : null,
      hash: offer.customerResponseHash,
      channel: offer.customerResponseChannel,
      reference: offer.customerResponseReference,
      evidence: offer.customerResponseEvidence,
      recordedByUserId: offer.customerResponseRecordedByUserId,
      receivedAt: iso(offer.respondedAt),
    },
    order: enrichment.orderId
      ? {
          id: enrichment.orderId,
          referenceCode: enrichment.orderReferenceCode ?? null,
          status: enrichment.orderStatus ?? null,
          paymentStatus: enrichment.orderPaymentStatus ?? null,
        }
      : null,
    governance: {
      exactMinorUnits: true as const,
      currencyConversionPerformed: false as const,
      sourceSupplierQuoteRequired: true as const,
      sourceSupplierCostPrivate: true as const,
      externalSideEffect: false as const,
      customerOfferIssued,
      customerMessageSent: false as const,
      customerResponseRecorded,
      orderCreated,
      paymentCreated: false as const,
      separateIssueActionRequired: !customerOfferIssued,
      separateOrderActionRequired:
        offer.status === "accepted" && customerResponseRecorded && !orderCreated,
    },
    createdAt: iso(offer.createdAt),
    updatedAt: iso(offer.updatedAt),
  };
}

async function loadOffer(
  tenantId: number,
  offerId: string,
  transaction: Parameters<Parameters<typeof db.transaction>[0]>[0] = db as any,
) {
  const [row] = await transaction
    .select({
      offer: industrialQuotes,
      sourceReferenceCode: industrialSupplierQuotes.referenceCode,
      sourceQuoteHash: industrialSupplierQuotes.quoteHash,
      supplierLegalName: industrialSupplierProfiles.legalName,
      orderId: industrialOrders.id,
      orderReferenceCode: industrialOrders.referenceCode,
      orderStatus: industrialOrders.status,
      orderPaymentStatus: industrialOrders.paymentStatus,
    })
    .from(industrialQuotes)
    .leftJoin(
      industrialSupplierQuotes,
      and(
        eq(industrialSupplierQuotes.id, industrialQuotes.sourceSupplierQuoteId),
        eq(industrialSupplierQuotes.tenantId, industrialQuotes.tenantId),
      ),
    )
    .leftJoin(
      industrialSupplierProfiles,
      and(
        eq(
          industrialSupplierProfiles.id,
          industrialSupplierQuotes.supplierProfileId,
        ),
        eq(industrialSupplierProfiles.tenantId, industrialQuotes.tenantId),
      ),
    )
    .leftJoin(
      industrialOrders,
      and(
        eq(industrialOrders.quoteId, industrialQuotes.id),
        eq(industrialOrders.tenantId, industrialQuotes.tenantId),
      ),
    )
    .where(
      and(
        eq(industrialQuotes.id, offerId),
        eq(industrialQuotes.tenantId, tenantId),
        isNotNull(industrialQuotes.pricingVersion),
      ),
    )
    .limit(1);
  return row || null;
}

export async function listCommercialOffers(input: {
  tenantId: number;
  tenantKey: string;
  limit?: number;
  requirementId?: string | null;
}) {
  assertExportunityTenant(input.tenantKey);
  await ensureIndustrialTables();
  const limit = Math.max(1, Math.min(250, Math.trunc(Number(input.limit) || 100)));
  const rows = await db
    .select({
      offer: industrialQuotes,
      sourceReferenceCode: industrialSupplierQuotes.referenceCode,
      sourceQuoteHash: industrialSupplierQuotes.quoteHash,
      supplierLegalName: industrialSupplierProfiles.legalName,
      orderId: industrialOrders.id,
      orderReferenceCode: industrialOrders.referenceCode,
      orderStatus: industrialOrders.status,
      orderPaymentStatus: industrialOrders.paymentStatus,
    })
    .from(industrialQuotes)
    .leftJoin(
      industrialSupplierQuotes,
      and(
        eq(industrialSupplierQuotes.id, industrialQuotes.sourceSupplierQuoteId),
        eq(industrialSupplierQuotes.tenantId, industrialQuotes.tenantId),
      ),
    )
    .leftJoin(
      industrialSupplierProfiles,
      and(
        eq(
          industrialSupplierProfiles.id,
          industrialSupplierQuotes.supplierProfileId,
        ),
        eq(industrialSupplierProfiles.tenantId, industrialQuotes.tenantId),
      ),
    )
    .leftJoin(
      industrialOrders,
      and(
        eq(industrialOrders.quoteId, industrialQuotes.id),
        eq(industrialOrders.tenantId, industrialQuotes.tenantId),
      ),
    )
    .where(
      and(
        eq(industrialQuotes.tenantId, input.tenantId),
        isNotNull(industrialQuotes.pricingVersion),
        input.requirementId
          ? eq(industrialQuotes.requirementId, input.requirementId)
          : undefined,
      ),
    )
    .orderBy(desc(industrialQuotes.updatedAt))
    .limit(limit);
  return {
    items: rows.map((row) =>
      offerResponse(row.offer, {
        sourceReferenceCode: row.sourceReferenceCode,
        sourceQuoteHash: row.sourceQuoteHash,
        supplierLegalName: row.supplierLegalName,
        orderId: row.orderId,
        orderReferenceCode: row.orderReferenceCode,
        orderStatus: row.orderStatus,
        orderPaymentStatus: row.orderPaymentStatus,
      }),
    ),
    governance: {
      lifecycleLedger: true as const,
      internalDraftsOnly: false as const,
      exactMinorUnits: true as const,
      currencyConversionPerformed: false as const,
      automatedSupplierRanking: false as const,
      customerOfferIssuanceEnabled: true as const,
      externalOfferDeliveryEnabled: false as const,
      customerResponseRecordingEnabled: true as const,
      orderCreationEnabled: true as const,
      paymentCreationEnabled: false as const,
    },
  };
}

export async function createCommercialOfferDraft(input: {
  tenantId: number;
  tenantKey: string;
  actorUserId: number | null;
  payload: unknown;
}) {
  assertExportunityTenant(input.tenantKey);
  await ensureIndustrialTables();
  const userId = actorId(input.actorUserId);
  const parsed = parseCommercialOfferDraftInput(input.payload);

  return db.transaction(async (tx) => {
    const [source] = await tx
      .select({
        quote: industrialSupplierQuotes,
        supplierLegalName: industrialSupplierProfiles.legalName,
      })
      .from(industrialSupplierQuotes)
      .innerJoin(
        industrialSupplierProfiles,
        and(
          eq(
            industrialSupplierProfiles.id,
            industrialSupplierQuotes.supplierProfileId,
          ),
          eq(
            industrialSupplierProfiles.tenantId,
            industrialSupplierQuotes.tenantId,
          ),
        ),
      )
      .where(
        and(
          eq(industrialSupplierQuotes.id, parsed.sourceSupplierQuoteId),
          eq(industrialSupplierQuotes.tenantId, input.tenantId),
        ),
      )
      .limit(1)
      .for("share");
    if (!source) {
      throw new CommercialOfferServiceError(
        "COMMERCIAL_OFFER_SOURCE_QUOTE_NOT_FOUND",
        404,
        "The canonical supplier quote was not found.",
      );
    }
    if (source.quote.status !== "qualified") {
      throw new CommercialOfferServiceError(
        "COMMERCIAL_OFFER_SOURCE_QUOTE_NOT_QUALIFIED",
        409,
        "Only a currently qualified canonical supplier quote can source an offer draft.",
      );
    }
    if (!source.quote.offerPreparationReady) {
      throw new CommercialOfferServiceError(
        "COMMERCIAL_OFFER_SOURCE_QUOTE_BLOCKED",
        409,
        `Offer preparation is blocked: ${source.quote.offerPreparationBlockers.join(", ") || "source evidence incomplete"}.`,
      );
    }
    if (
      !source.quote.quoteIntakeId ||
      !source.quote.rfqDispatchId ||
      !source.quote.rfqDraftId ||
      !source.quote.supplierProfileId ||
      !source.quote.sourceReceivedAt ||
      !source.quote.projectionVersion ||
      !source.quote.normalizationVersion ||
      !source.quote.quoteHash ||
      !source.quote.qualifiedAt
    ) {
      throw new CommercialOfferServiceError(
        "COMMERCIAL_OFFER_SOURCE_QUOTE_LINEAGE_INCOMPLETE",
        409,
        "The supplier quote is missing canonical source lineage and cannot source an offer draft.",
      );
    }
    const canonicalSourceQuote = {
      ...source.quote,
      quoteHash: source.quote.quoteHash,
    };
    const pricing = buildCommercialOfferPricing({
      request: parsed,
      sourceQuote: canonicalSourceQuote,
    });
    const now = new Date();
    const [existing] = await tx
      .select()
      .from(industrialQuotes)
      .where(
        and(
          eq(industrialQuotes.tenantId, input.tenantId),
          eq(industrialQuotes.pricingHash, pricing.pricingHash),
        ),
      )
      .limit(1);
    if (existing) {
      return {
        created: false as const,
        offer: offerResponse(existing, {
          sourceReferenceCode: source.quote.referenceCode,
          sourceQuoteHash: source.quote.quoteHash,
          supplierLegalName: source.supplierLegalName,
        }),
        evidence: {
          entity_ids: [existing.id, source.quote.id],
          affected_rows: 0,
          idempotent: true,
          external_side_effect: false,
        },
      };
    }

    const [created] = await tx
      .insert(industrialQuotes)
      .values({
        tenantId: input.tenantId,
        requirementId: source.quote.requirementId,
        referenceCode: `EXP-OFFER-${pricing.pricingHash.slice(0, 20).toUpperCase()}`,
        status: "draft",
        currencyCode: pricing.currencyCode,
        totalAmount: pricing.databaseTotalAmount,
        lineItems: pricing.lineItems,
        leadTimeText: source.quote.leadTime,
        validUntil: parsed.validUntil,
        commercialTerms: parsed.commercialTerms,
        customerNotes: parsed.customerNotes,
        internalNotes: parsed.internalNotes,
        sourceSupplierQuoteId: source.quote.id,
        pricingVersion: pricing.pricingVersion,
        pricingHash: pricing.pricingHash,
        supplierCostMinor: pricing.supplierCostMinor,
        additionalCostsMinor: pricing.additionalCostsMinor,
        totalCostMinor: pricing.totalCostMinor,
        targetGrossMarginBps: pricing.targetGrossMarginBps,
        marginMinor: pricing.marginMinor,
        customerPriceMinor: pricing.customerPriceMinor,
        costStack: pricing.costStack,
        pricingChecklist: {},
        pricingNotes: parsed.internalNotes,
        visibility: "exportunity_internal",
        createdByUserId: userId,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing({
        target: [industrialQuotes.tenantId, industrialQuotes.pricingHash],
      })
      .returning();
    if (!created) {
      const [concurrent] = await tx
        .select()
        .from(industrialQuotes)
        .where(
          and(
            eq(industrialQuotes.tenantId, input.tenantId),
            eq(industrialQuotes.pricingHash, pricing.pricingHash),
          ),
        )
        .limit(1);
      if (!concurrent) {
        throw new CommercialOfferServiceError(
          "COMMERCIAL_OFFER_CREATE_CONFLICT",
          409,
          "The commercial offer draft changed concurrently.",
        );
      }
      return {
        created: false as const,
        offer: offerResponse(concurrent, {
          sourceReferenceCode: source.quote.referenceCode,
          sourceQuoteHash: source.quote.quoteHash,
          supplierLegalName: source.supplierLegalName,
        }),
        evidence: {
          entity_ids: [concurrent.id, source.quote.id],
          affected_rows: 0,
          idempotent: true,
          external_side_effect: false,
        },
      };
    }

    await tx
      .update(industrialRequirements)
      .set({ status: "quote_preparation", updatedAt: now })
      .where(
        and(
          eq(industrialRequirements.id, created.requirementId),
          eq(industrialRequirements.tenantId, input.tenantId),
          inArray(industrialRequirements.status, [
            "draft",
            "submitted",
            "triaged",
            "under_review",
            "supplier_matching",
            "quote_preparation",
          ]),
        ),
      );
    await tx.insert(industrialAuditLogs).values({
      tenantId: input.tenantId,
      actorUserId: userId,
      action: "industrial_commercial_offer.draft_created",
      entityType: "industrial_quote",
      entityId: created.id,
      reason: parsed.internalNotes,
      previousValue: {},
      nextValue: {
        status: created.status,
        pricingHash: created.pricingHash,
        sourceSupplierQuoteId: created.sourceSupplierQuoteId,
        currencyCode: created.currencyCode,
        totalCostMinor: created.totalCostMinor,
        targetGrossMarginBps: created.targetGrossMarginBps,
        customerPriceMinor: created.customerPriceMinor,
      },
      metadata: {
        pricingVersion: created.pricingVersion,
        sourceSupplierQuoteHash: source.quote.quoteHash,
        currencyConversionPerformed: false,
        externalSideEffect: false,
        customerOfferIssued: false,
        orderCreated: false,
        paymentCreated: false,
      },
      createdAt: now,
    });
    return {
      created: true as const,
      offer: offerResponse(created, {
        sourceReferenceCode: source.quote.referenceCode,
        sourceQuoteHash: source.quote.quoteHash,
        supplierLegalName: source.supplierLegalName,
      }),
      evidence: {
        entity_ids: [created.id, source.quote.id],
        affected_rows: 2,
        idempotent: false,
        external_side_effect: false,
        customer_offer_issued: false,
        order_created: false,
        payment_created: false,
      },
    };
  });
}

function checklistWithPrefix(
  prefix: "submission" | "approval" | "issuance" | "response",
  checklist: Record<string, true>,
) {
  return Object.fromEntries(
    Object.entries(checklist).map(([key, value]) => [`${prefix}.${key}`, value]),
  );
}

export async function submitCommercialOfferForApproval(input: {
  tenantId: number;
  tenantKey: string;
  actorUserId: number | null;
  offerId: string;
  payload: unknown;
}) {
  assertExportunityTenant(input.tenantKey);
  await ensureIndustrialTables();
  const userId = actorId(input.actorUserId);
  const parsed = parseCommercialOfferSubmissionInput(input.payload);
  const now = new Date();
  return db.transaction(async (tx) => {
    const current = await loadOffer(input.tenantId, input.offerId, tx);
    if (!current) {
      throw new CommercialOfferServiceError(
        "COMMERCIAL_OFFER_NOT_FOUND",
        404,
        "The commercial offer draft was not found.",
      );
    }
    if (current.offer.pricingHash !== parsed.expectedPricingHash) {
      throw new CommercialOfferServiceError(
        "COMMERCIAL_OFFER_HASH_MISMATCH",
        409,
        "The pricing inputs changed; review the current exact pricing hash.",
      );
    }
    if (current.offer.status === "under_review") {
      return {
        updated: false as const,
        offer: offerResponse(current.offer, current),
        evidence: { entity_ids: [current.offer.id], affected_rows: 0, idempotent: true, external_side_effect: false },
      };
    }
    if (current.offer.status !== "draft") {
      throw new CommercialOfferServiceError(
        "COMMERCIAL_OFFER_STATUS_INVALID",
        409,
        "Only an internal draft can be submitted for pricing approval.",
      );
    }
    const [saved] = await tx
      .update(industrialQuotes)
      .set({
        status: "under_review",
        pricingChecklist: checklistWithPrefix("submission", parsed.checklist),
        pricingSubmittedByUserId: userId,
        pricingSubmittedAt: now,
        pricingDecisionNotes: parsed.decisionNotes,
        updatedAt: now,
      })
      .where(
        and(
          eq(industrialQuotes.id, current.offer.id),
          eq(industrialQuotes.tenantId, input.tenantId),
          eq(industrialQuotes.status, "draft"),
          eq(industrialQuotes.pricingHash, parsed.expectedPricingHash),
        ),
      )
      .returning();
    if (!saved) {
      throw new CommercialOfferServiceError(
        "COMMERCIAL_OFFER_REVIEW_CONFLICT",
        409,
        "The offer review state changed concurrently.",
      );
    }
    await tx.insert(industrialAuditLogs).values({
      tenantId: input.tenantId,
      actorUserId: userId,
      action: "industrial_commercial_offer.submitted",
      entityType: "industrial_quote",
      entityId: saved.id,
      reason: parsed.decisionNotes,
      previousValue: { status: current.offer.status },
      nextValue: { status: saved.status, pricingHash: saved.pricingHash },
      metadata: {
        externalSideEffect: false,
        customerOfferIssued: false,
        orderCreated: false,
        paymentCreated: false,
      },
      createdAt: now,
    });
    return {
      updated: true as const,
      offer: offerResponse(saved, current),
      evidence: { entity_ids: [saved.id], affected_rows: 2, idempotent: false, external_side_effect: false },
    };
  });
}

export async function approveCommercialOfferPricing(input: {
  tenantId: number;
  tenantKey: string;
  actorUserId: number | null;
  offerId: string;
  payload: unknown;
}) {
  assertExportunityTenant(input.tenantKey);
  await ensureIndustrialTables();
  const userId = actorId(input.actorUserId);
  const parsed = parseCommercialOfferApprovalInput(input.payload);
  const now = new Date();
  return db.transaction(async (tx) => {
    const current = await loadOffer(input.tenantId, input.offerId, tx);
    if (!current) {
      throw new CommercialOfferServiceError(
        "COMMERCIAL_OFFER_NOT_FOUND",
        404,
        "The commercial offer draft was not found.",
      );
    }
    if (current.offer.pricingHash !== parsed.expectedPricingHash) {
      throw new CommercialOfferServiceError(
        "COMMERCIAL_OFFER_HASH_MISMATCH",
        409,
        "The pricing inputs changed; approval cannot be reused.",
      );
    }
    if (current.offer.status === "ready_for_account_manager") {
      return {
        updated: false as const,
        offer: offerResponse(current.offer, current),
        evidence: { entity_ids: [current.offer.id], affected_rows: 0, idempotent: true, external_side_effect: false },
      };
    }
    if (current.offer.status !== "under_review") {
      throw new CommercialOfferServiceError(
        "COMMERCIAL_OFFER_STATUS_INVALID",
        409,
        "Only an offer under pricing review can be approved.",
      );
    }
    const [saved] = await tx
      .update(industrialQuotes)
      .set({
        status: "ready_for_account_manager",
        pricingChecklist: {
          ...(current.offer.pricingChecklist || {}),
          ...checklistWithPrefix("approval", parsed.checklist),
        },
        pricingApprovedByUserId: userId,
        pricingApprovedAt: now,
        pricingDecisionNotes: parsed.decisionNotes,
        updatedAt: now,
      })
      .where(
        and(
          eq(industrialQuotes.id, current.offer.id),
          eq(industrialQuotes.tenantId, input.tenantId),
          eq(industrialQuotes.status, "under_review"),
          eq(industrialQuotes.pricingHash, parsed.expectedPricingHash),
        ),
      )
      .returning();
    if (!saved) {
      throw new CommercialOfferServiceError(
        "COMMERCIAL_OFFER_APPROVAL_CONFLICT",
        409,
        "The offer approval state changed concurrently.",
      );
    }
    await tx.insert(industrialAuditLogs).values({
      tenantId: input.tenantId,
      actorUserId: userId,
      action: "industrial_commercial_offer.pricing_approved",
      entityType: "industrial_quote",
      entityId: saved.id,
      reason: parsed.decisionNotes,
      previousValue: { status: current.offer.status },
      nextValue: {
        status: saved.status,
        pricingHash: saved.pricingHash,
        customerOfferIssued: false,
      },
      metadata: {
        separateIssueActionRequired: true,
        externalSideEffect: false,
        customerOfferIssued: false,
        orderCreated: false,
        paymentCreated: false,
      },
      createdAt: now,
    });
    return {
      updated: true as const,
      offer: offerResponse(saved, current),
      evidence: {
        entity_ids: [saved.id],
        affected_rows: 2,
        idempotent: false,
        external_side_effect: false,
        customer_offer_issued: false,
      },
    };
  });
}

export async function rejectCommercialOfferPricing(input: {
  tenantId: number;
  tenantKey: string;
  actorUserId: number | null;
  offerId: string;
  payload: unknown;
}) {
  assertExportunityTenant(input.tenantKey);
  await ensureIndustrialTables();
  const userId = actorId(input.actorUserId);
  const parsed = parseCommercialOfferRejectionInput(input.payload);
  const now = new Date();
  return db.transaction(async (tx) => {
    const current = await loadOffer(input.tenantId, input.offerId, tx);
    if (!current) {
      throw new CommercialOfferServiceError(
        "COMMERCIAL_OFFER_NOT_FOUND",
        404,
        "The commercial offer draft was not found.",
      );
    }
    if (current.offer.pricingHash !== parsed.expectedPricingHash) {
      throw new CommercialOfferServiceError(
        "COMMERCIAL_OFFER_HASH_MISMATCH",
        409,
        "The pricing inputs changed; rejection cannot be applied.",
      );
    }
    if (current.offer.status !== "under_review") {
      throw new CommercialOfferServiceError(
        "COMMERCIAL_OFFER_STATUS_INVALID",
        409,
        "Only an offer under pricing review can be rejected.",
      );
    }
    const [saved] = await tx
      .update(industrialQuotes)
      .set({
        status: "draft",
        pricingApprovedByUserId: null,
        pricingApprovedAt: null,
        pricingDecisionNotes: parsed.decisionNotes,
        updatedAt: now,
      })
      .where(
        and(
          eq(industrialQuotes.id, current.offer.id),
          eq(industrialQuotes.tenantId, input.tenantId),
          eq(industrialQuotes.status, "under_review"),
          eq(industrialQuotes.pricingHash, parsed.expectedPricingHash),
        ),
      )
      .returning();
    if (!saved) {
      throw new CommercialOfferServiceError(
        "COMMERCIAL_OFFER_REJECTION_CONFLICT",
        409,
        "The offer review state changed concurrently.",
      );
    }
    await tx.insert(industrialAuditLogs).values({
      tenantId: input.tenantId,
      actorUserId: userId,
      action: "industrial_commercial_offer.pricing_rejected",
      entityType: "industrial_quote",
      entityId: saved.id,
      reason: parsed.decisionNotes,
      previousValue: { status: current.offer.status },
      nextValue: { status: saved.status, pricingHash: saved.pricingHash },
      metadata: {
        externalSideEffect: false,
        customerOfferIssued: false,
        orderCreated: false,
        paymentCreated: false,
      },
      createdAt: now,
    });
    return {
      updated: true as const,
      offer: offerResponse(saved, current),
      evidence: { entity_ids: [saved.id], affected_rows: 2, idempotent: false, external_side_effect: false },
    };
  });
}

export async function issueCommercialOffer(input: {
  tenantId: number;
  tenantKey: string;
  actorUserId: number | null;
  offerId: string;
  payload: unknown;
}) {
  assertExportunityTenant(input.tenantKey);
  await ensureIndustrialTables();
  const userId = actorId(input.actorUserId);
  const parsed = parseCommercialOfferIssueInput(input.payload);
  const now = new Date();

  const outcome = await db.transaction(async (tx) => {
    const current = await loadOffer(input.tenantId, input.offerId, tx);
    if (!current) {
      throw new CommercialOfferServiceError(
        "COMMERCIAL_OFFER_NOT_FOUND",
        404,
        "The exact Exportunity offer was not found.",
      );
    }
    if (current.offer.pricingHash !== parsed.expectedPricingHash) {
      throw new CommercialOfferServiceError(
        "COMMERCIAL_OFFER_HASH_MISMATCH",
        409,
        "The pricing inputs changed; issuance requires the current exact pricing hash.",
      );
    }
    if (current.offer.status === "issued") {
      return {
        updated: false as const,
        offer: offerResponse(current.offer, current),
        requirement: null,
        evidence: {
          entity_ids: [current.offer.id],
          affected_rows: 0,
          idempotent: true,
          external_side_effect: false,
          customer_offer_issued: true,
          customer_message_sent: false,
        },
      };
    }
    if (current.offer.status !== "ready_for_account_manager") {
      throw new CommercialOfferServiceError(
        "COMMERCIAL_OFFER_STATUS_INVALID",
        409,
        "Only an exact offer with approved pricing can be issued.",
      );
    }
    if (
      !current.offer.pricingSubmittedByUserId ||
      !current.offer.pricingSubmittedAt ||
      !current.offer.pricingApprovedByUserId ||
      !current.offer.pricingApprovedAt
    ) {
      throw new CommercialOfferServiceError(
        "COMMERCIAL_OFFER_APPROVAL_EVIDENCE_MISSING",
        409,
        "The pricing submission and approval evidence is incomplete.",
      );
    }
    if (!current.offer.validUntil || current.offer.validUntil.getTime() <= now.getTime()) {
      throw new CommercialOfferServiceError(
        "COMMERCIAL_OFFER_EXPIRED",
        409,
        "The approved offer validity window has expired.",
      );
    }

    const [requirement] = await tx
      .select()
      .from(industrialRequirements)
      .where(
        and(
          eq(industrialRequirements.id, current.offer.requirementId),
          eq(industrialRequirements.tenantId, input.tenantId),
        ),
      )
      .limit(1)
      .for("share");
    const [sourceQuote] = await tx
      .select()
      .from(industrialSupplierQuotes)
      .where(
        and(
          eq(industrialSupplierQuotes.id, current.offer.sourceSupplierQuoteId!),
          eq(industrialSupplierQuotes.tenantId, input.tenantId),
        ),
      )
      .limit(1)
      .for("share");
    const customerContact = requirement?.customerContactId
      ? (
          await tx
            .select({ id: contacts.id })
            .from(contacts)
            .where(
              and(
                eq(contacts.id, requirement.customerContactId),
                eq(contacts.tenantId, input.tenantId),
              ),
            )
            .limit(1)
            .for("share")
        )[0]
      : null;
    if (!requirement || !customerContact) {
      throw new CommercialOfferServiceError(
        "COMMERCIAL_OFFER_CUSTOMER_REQUIRED",
        409,
        "A tenant-scoped customer contact is required before issuance.",
      );
    }
    if (["cancelled", "closed"].includes(requirement.status)) {
      throw new CommercialOfferServiceError(
        "COMMERCIAL_OFFER_REQUIREMENT_CLOSED",
        409,
        "The source commercial requirement is no longer open for an offer.",
      );
    }
    if (
      !sourceQuote ||
      sourceQuote.status !== "qualified" ||
      !sourceQuote.offerPreparationReady ||
      !sourceQuote.quoteHash
    ) {
      throw new CommercialOfferServiceError(
        "COMMERCIAL_OFFER_SOURCE_QUOTE_STALE",
        409,
        "The canonical supplier quote is no longer qualified and offer-preparation-ready.",
      );
    }
    const sourceEvidenceCurrent = commercialOfferSourceEvidenceMatches(
      current.offer.costStack,
      sourceQuote.id,
      sourceQuote.quoteHash,
    );
    if (!sourceEvidenceCurrent) {
      throw new CommercialOfferServiceError(
        "COMMERCIAL_OFFER_SOURCE_HASH_CHANGED",
        409,
        "The supplier evidence changed after pricing; prepare and approve a revised offer.",
      );
    }

    const [saved] = await tx
      .update(industrialQuotes)
      .set({
        status: "issued",
        visibility: "parties_to_transaction",
        pricingChecklist: {
          ...(current.offer.pricingChecklist || {}),
          ...checklistWithPrefix("issuance", parsed.checklist),
        },
        issuedByUserId: userId,
        issuedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(industrialQuotes.id, current.offer.id),
          eq(industrialQuotes.tenantId, input.tenantId),
          eq(industrialQuotes.status, "ready_for_account_manager"),
          eq(industrialQuotes.pricingHash, parsed.expectedPricingHash),
        ),
      )
      .returning();
    if (!saved) {
      throw new CommercialOfferServiceError(
        "COMMERCIAL_OFFER_ISSUE_CONFLICT",
        409,
        "The offer state changed concurrently; reload before issuing.",
      );
    }

    const metadata = recordValue(requirement.metadata);
    const workflow = recordValue(metadata.internalWorkflow);
    await tx
      .update(industrialRequirements)
      .set({
        status: "quoted",
        nextAction:
          "Present the issued quotation through an approved channel and record the customer's evidenced response.",
        nextActionAt: now,
        metadata: {
          ...metadata,
          internalWorkflow: {
            ...workflow,
            nextAction:
              "Present the issued quotation through an approved channel and record the customer's evidenced response.",
            quoteStatus: "issued",
            quoteReferenceCode: saved.referenceCode,
            commercialPhase: null,
            closureOutcome: null,
            lastReviewedAt: now.toISOString(),
            lastReviewedByUserId: userId,
          },
        },
        updatedAt: now,
      })
      .where(
        and(
          eq(industrialRequirements.id, requirement.id),
          eq(industrialRequirements.tenantId, input.tenantId),
        ),
      );

    await tx.insert(industrialAuditLogs).values({
      tenantId: input.tenantId,
      actorUserId: userId,
      action: "industrial_commercial_offer.issued",
      entityType: "industrial_quote",
      entityId: saved.id,
      reason: parsed.decisionNotes,
      previousValue: {
        status: current.offer.status,
        visibility: current.offer.visibility,
      },
      nextValue: {
        status: saved.status,
        visibility: saved.visibility,
        pricingHash: saved.pricingHash,
        issuedAt: saved.issuedAt,
      },
      metadata: {
        requirementId: requirement.id,
        customerContactId: customerContact.id,
        sourceSupplierQuoteId: sourceQuote.id,
        sourceSupplierQuoteHash: sourceQuote.quoteHash,
        pricingHash: saved.pricingHash,
        exactMinorUnits: true,
        sourceSupplierCostPrivate: true,
        externalSideEffect: false,
        customerOfferIssued: true,
        customerMessageSent: false,
        orderCreated: false,
        paymentCreated: false,
      },
      createdAt: now,
    });

    return {
      updated: true as const,
      offer: offerResponse(saved, {
        sourceReferenceCode: sourceQuote.referenceCode,
        sourceQuoteHash: sourceQuote.quoteHash,
        supplierLegalName: current.supplierLegalName,
      }),
      requirement,
      evidence: {
        entity_ids: [saved.id, sourceQuote.id, requirement.id],
        affected_rows: 3,
        idempotent: false,
        external_side_effect: false,
        customer_offer_issued: true,
        customer_message_sent: false,
      },
    };
  });

  if (outcome.updated && outcome.requirement) {
    await recordIndustrialTradeConversion({
      tenantId: input.tenantId,
      actorUserId: userId,
      eventType: "quote",
      requirement: outcome.requirement,
      entityId: outcome.offer.id,
      referenceCode: outcome.offer.referenceCode,
      estimatedValue: outcome.offer.customerDraft.totalAmount,
      currencyCode: outcome.offer.pricing.currencyCode,
    });
  }
  return {
    updated: outcome.updated,
    offer: outcome.offer,
    evidence: outcome.evidence,
  };
}

export async function recordCommercialOfferCustomerResponse(input: {
  tenantId: number;
  tenantKey: string;
  actorUserId: number | null;
  offerId: string;
  payload: unknown;
}) {
  assertExportunityTenant(input.tenantKey);
  await ensureIndustrialTables();
  const userId = actorId(input.actorUserId);
  const now = new Date();
  const parsed = parseCommercialOfferCustomerResponseInput(input.payload, {
    now,
  });

  return db.transaction(async (tx) => {
    const current = await loadOffer(input.tenantId, input.offerId, tx);
    if (!current) {
      throw new CommercialOfferServiceError(
        "COMMERCIAL_OFFER_NOT_FOUND",
        404,
        "The exact Exportunity offer was not found.",
      );
    }
    if (current.offer.pricingHash !== parsed.expectedPricingHash) {
      throw new CommercialOfferServiceError(
        "COMMERCIAL_OFFER_HASH_MISMATCH",
        409,
        "The pricing inputs changed; the customer response cannot be attached to this offer.",
      );
    }
    if (current.offer.status === parsed.response) {
      if (current.offer.customerResponseHash !== parsed.responseHash) {
        throw new CommercialOfferServiceError(
          "COMMERCIAL_OFFER_RESPONSE_CONFLICT",
          409,
          "A different customer-response record already exists for this offer.",
        );
      }
      return {
        updated: false as const,
        offer: offerResponse(current.offer, current),
        evidence: {
          entity_ids: [current.offer.id],
          affected_rows: 0,
          idempotent: true,
          external_side_effect: false,
          customer_response_recorded: true,
          order_created: Boolean(current.orderId),
          payment_created: false,
        },
      };
    }
    if (current.offer.status !== "issued") {
      throw new CommercialOfferServiceError(
        "COMMERCIAL_OFFER_STATUS_INVALID",
        409,
        "Only an issued exact offer can receive a customer response.",
      );
    }
    if (
      !current.offer.issuedAt ||
      parsed.responseReceivedAt.getTime() < current.offer.issuedAt.getTime()
    ) {
      throw new CommercialOfferServiceError(
        "COMMERCIAL_OFFER_RESPONSE_TIME_INVALID",
        409,
        "The evidenced customer response cannot predate offer issuance.",
      );
    }
    if (
      parsed.response === "accepted" &&
      (!current.offer.validUntil ||
        parsed.responseReceivedAt.getTime() > current.offer.validUntil.getTime())
    ) {
      throw new CommercialOfferServiceError(
        "COMMERCIAL_OFFER_ACCEPTANCE_EXPIRED",
        409,
        "The evidenced acceptance falls outside the approved offer validity window.",
      );
    }

    const [requirement] = await tx
      .select()
      .from(industrialRequirements)
      .where(
        and(
          eq(industrialRequirements.id, current.offer.requirementId),
          eq(industrialRequirements.tenantId, input.tenantId),
        ),
      )
      .limit(1)
      .for("share");
    const customerContact = requirement?.customerContactId
      ? (
          await tx
            .select({ id: contacts.id })
            .from(contacts)
            .where(
              and(
                eq(contacts.id, requirement.customerContactId),
                eq(contacts.tenantId, input.tenantId),
              ),
            )
            .limit(1)
            .for("share")
        )[0]
      : null;
    if (!requirement || !customerContact) {
      throw new CommercialOfferServiceError(
        "COMMERCIAL_OFFER_CUSTOMER_REQUIRED",
        409,
        "A tenant-scoped customer contact is required before recording a response.",
      );
    }

    if (parsed.response === "accepted") {
      const [sourceQuote] = await tx
        .select()
        .from(industrialSupplierQuotes)
        .where(
          and(
            eq(
              industrialSupplierQuotes.id,
              current.offer.sourceSupplierQuoteId!,
            ),
            eq(industrialSupplierQuotes.tenantId, input.tenantId),
          ),
        )
        .limit(1)
        .for("share");
      if (
        !sourceQuote ||
        sourceQuote.status !== "qualified" ||
        !sourceQuote.offerPreparationReady ||
        !sourceQuote.quoteHash ||
        !commercialOfferSourceEvidenceMatches(
          current.offer.costStack,
          sourceQuote.id,
          sourceQuote.quoteHash,
        )
      ) {
        throw new CommercialOfferServiceError(
          "COMMERCIAL_OFFER_SOURCE_QUOTE_STALE",
          409,
          "The supplier evidence changed before acceptance; prepare and approve a revised offer.",
        );
      }
    }

    const [saved] = await tx
      .update(industrialQuotes)
      .set({
        status: parsed.response,
        pricingChecklist: {
          ...(current.offer.pricingChecklist || {}),
          ...checklistWithPrefix("response", parsed.checklist),
        },
        customerResponseHash: parsed.responseHash,
        customerResponseChannel: parsed.channel,
        customerResponseReference: parsed.evidenceReference,
        customerResponseEvidence: {
          customerStatement: parsed.customerStatement,
          response: parsed.response,
          responseReceivedAt: parsed.responseReceivedAt.toISOString(),
          recordedWithoutExternalContact: true,
        },
        customerResponseRecordedByUserId: userId,
        respondedAt: parsed.responseReceivedAt,
        closedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(industrialQuotes.id, current.offer.id),
          eq(industrialQuotes.tenantId, input.tenantId),
          eq(industrialQuotes.status, "issued"),
          eq(industrialQuotes.pricingHash, parsed.expectedPricingHash),
        ),
      )
      .returning();
    if (!saved) {
      throw new CommercialOfferServiceError(
        "COMMERCIAL_OFFER_RESPONSE_CONFLICT",
        409,
        "The offer response state changed concurrently; reload before recording it.",
      );
    }

    const metadata = recordValue(requirement.metadata);
    const workflow = recordValue(metadata.internalWorkflow);
    const nextAction =
      parsed.response === "accepted"
        ? "Create the exact order only after rechecking this customer acceptance and all payment and fulfilment separations."
        : "Resume verified supplier matching or close the commercial requirement with evidence.";
    await tx
      .update(industrialRequirements)
      .set({
        status: parsed.response === "accepted" ? "closed" : "supplier_matching",
        nextAction,
        nextActionAt: now,
        metadata: {
          ...metadata,
          internalWorkflow: {
            ...workflow,
            nextAction,
            quoteStatus: saved.status,
            quoteReferenceCode: saved.referenceCode,
            customerResponseHash: parsed.responseHash,
            customerResponseChannel: parsed.channel,
            lastReviewedAt: now.toISOString(),
            lastReviewedByUserId: userId,
          },
        },
        updatedAt: now,
      })
      .where(
        and(
          eq(industrialRequirements.id, requirement.id),
          eq(industrialRequirements.tenantId, input.tenantId),
        ),
      );

    await tx.insert(industrialAuditLogs).values({
      tenantId: input.tenantId,
      actorUserId: userId,
      action: "industrial_commercial_offer.customer_response_recorded",
      entityType: "industrial_quote",
      entityId: saved.id,
      reason: parsed.decisionNotes,
      previousValue: { status: current.offer.status },
      nextValue: {
        status: saved.status,
        pricingHash: saved.pricingHash,
        customerResponseHash: saved.customerResponseHash,
        respondedAt: saved.respondedAt,
      },
      metadata: {
        requirementId: requirement.id,
        customerContactId: customerContact.id,
        channel: parsed.channel,
        evidenceReference: parsed.evidenceReference,
        externalSideEffect: false,
        customerMessageSent: false,
        orderCreated: false,
        paymentCreated: false,
        procurementStarted: false,
      },
      createdAt: now,
    });

    return {
      updated: true as const,
      offer: offerResponse(saved, current),
      evidence: {
        entity_ids: [saved.id, requirement.id],
        affected_rows: 3,
        idempotent: false,
        external_side_effect: false,
        customer_response_recorded: true,
        order_created: false,
        payment_created: false,
      },
    };
  });
}

function commercialOrderResponse(order: typeof industrialOrders.$inferSelect) {
  return {
    id: order.id,
    referenceCode: order.referenceCode,
    quoteId: order.quoteId,
    requirementId: order.requirementId,
    status: order.status,
    currencyCode: order.currencyCode,
    totalAmount: order.totalAmount,
    totalAmountMinor: order.totalAmountMinor,
    sourcePricingHash: order.sourcePricingHash,
    customerResponseHash: order.customerResponseHash,
    orderConfirmationHash: order.orderConfirmationHash,
    paymentStatus: order.paymentStatus,
    plannedDeliveryAt: iso(order.plannedDeliveryAt),
    confirmedAt: iso(order.confirmedAt),
    governance: {
      exactMinorUnits: true as const,
      paymentCreated: false as const,
      procurementStarted: false as const,
      fulfillmentInitialized: false as const,
      separatePaymentActionRequired: true as const,
      separateFulfillmentActionRequired: true as const,
    },
  };
}

export async function createCommercialOrderFromAcceptedOffer(input: {
  tenantId: number;
  tenantKey: string;
  actorUserId: number | null;
  offerId: string;
  payload: unknown;
}) {
  assertExportunityTenant(input.tenantKey);
  await ensureIndustrialTables();
  const userId = actorId(input.actorUserId);
  const now = new Date();
  const parsed = parseCommercialOrderCreateInput(input.payload, { now });
  if (
    parsed.plannedDeliveryAt &&
    parsed.plannedDeliveryAt.getTime() <= now.getTime()
  ) {
    throw new CommercialOfferServiceError(
      "COMMERCIAL_ORDER_DELIVERY_DATE_INVALID",
      422,
      "Planned delivery must be in the future.",
    );
  }

  const outcome = await db.transaction(async (tx) => {
    const current = await loadOffer(input.tenantId, input.offerId, tx);
    if (!current) {
      throw new CommercialOfferServiceError(
        "COMMERCIAL_OFFER_NOT_FOUND",
        404,
        "The accepted exact Exportunity offer was not found.",
      );
    }
    if (current.offer.pricingHash !== parsed.expectedPricingHash) {
      throw new CommercialOfferServiceError(
        "COMMERCIAL_OFFER_HASH_MISMATCH",
        409,
        "The pricing inputs changed; order confirmation requires the accepted exact pricing hash.",
      );
    }
    if (
      current.offer.customerResponseHash !== parsed.expectedCustomerResponseHash
    ) {
      throw new CommercialOfferServiceError(
        "COMMERCIAL_OFFER_RESPONSE_HASH_MISMATCH",
        409,
        "The customer-response evidence changed; order confirmation requires the current response hash.",
      );
    }

    const existingOrder = await tx.query.industrialOrders.findFirst({
      where: and(
        eq(industrialOrders.tenantId, input.tenantId),
        eq(industrialOrders.quoteId, current.offer.id),
      ),
    });
    if (existingOrder) {
      if (existingOrder.orderConfirmationHash !== parsed.confirmationHash) {
        throw new CommercialOfferServiceError(
          "COMMERCIAL_ORDER_CONFIRMATION_CONFLICT",
          409,
          "This accepted offer already has an order created from different confirmation evidence.",
        );
      }
      return {
        created: false as const,
        order: existingOrder,
        requirement: null,
        evidence: {
          entity_ids: [existingOrder.id, current.offer.id],
          affected_rows: 0,
          idempotent: true,
          external_side_effect: false,
          order_created: true,
          payment_created: false,
          procurement_started: false,
        },
      };
    }
    if (current.offer.status !== "accepted") {
      throw new CommercialOfferServiceError(
        "COMMERCIAL_OFFER_STATUS_INVALID",
        409,
        "Only an evidenced accepted exact offer can become an order.",
      );
    }
    if (
      !current.offer.customerResponseHash ||
      !current.offer.respondedAt ||
      !current.offer.customerResponseRecordedByUserId
    ) {
      throw new CommercialOfferServiceError(
        "COMMERCIAL_OFFER_ACCEPTANCE_EVIDENCE_MISSING",
        409,
        "Customer acceptance evidence is incomplete.",
      );
    }
    if (!current.offer.customerPriceMinor || !current.offer.pricingHash) {
      throw new CommercialOfferServiceError(
        "COMMERCIAL_OFFER_EXACT_PRICE_MISSING",
        409,
        "The accepted offer does not contain an exact customer price.",
      );
    }

    const [requirement] = await tx
      .select()
      .from(industrialRequirements)
      .where(
        and(
          eq(industrialRequirements.id, current.offer.requirementId),
          eq(industrialRequirements.tenantId, input.tenantId),
        ),
      )
      .limit(1)
      .for("share");
    const [sourceQuote] = await tx
      .select()
      .from(industrialSupplierQuotes)
      .where(
        and(
          eq(
            industrialSupplierQuotes.id,
            current.offer.sourceSupplierQuoteId!,
          ),
          eq(industrialSupplierQuotes.tenantId, input.tenantId),
        ),
      )
      .limit(1)
      .for("share");
    const customerContact = requirement?.customerContactId
      ? (
          await tx
            .select({ id: contacts.id })
            .from(contacts)
            .where(
              and(
                eq(contacts.id, requirement.customerContactId),
                eq(contacts.tenantId, input.tenantId),
              ),
            )
            .limit(1)
            .for("share")
        )[0]
      : null;
    if (!requirement || !customerContact) {
      throw new CommercialOfferServiceError(
        "COMMERCIAL_ORDER_CUSTOMER_REQUIRED",
        409,
        "A tenant-scoped customer contact is required before order creation.",
      );
    }
    if (
      !sourceQuote ||
      sourceQuote.status !== "qualified" ||
      !sourceQuote.offerPreparationReady ||
      !sourceQuote.quoteHash ||
      !commercialOfferSourceEvidenceMatches(
        current.offer.costStack,
        sourceQuote.id,
        sourceQuote.quoteHash,
      )
    ) {
      throw new CommercialOfferServiceError(
        "COMMERCIAL_ORDER_SOURCE_QUOTE_STALE",
        409,
        "The supplier evidence changed before order confirmation; prepare a revised offer.",
      );
    }

    const totalAmount = formatMinorUnits(
      current.offer.customerPriceMinor,
      current.offer.currencyCode,
    );
    const [order] = await tx
      .insert(industrialOrders)
      .values({
        tenantId: input.tenantId,
        quoteId: current.offer.id,
        requirementId: current.offer.requirementId,
        factoryId: current.offer.factoryId,
        catalogItemId: current.offer.catalogItemId,
        referenceCode: `EXP-ORD-${parsed.confirmationHash.slice(0, 20).toUpperCase()}`,
        status: "confirmed",
        currencyCode: current.offer.currencyCode,
        totalAmount,
        totalAmountMinor: current.offer.customerPriceMinor,
        sourcePricingHash: current.offer.pricingHash,
        customerResponseHash: current.offer.customerResponseHash,
        orderConfirmationHash: parsed.confirmationHash,
        orderConfirmationChecklist: parsed.checklist,
        paymentStatus: "unpaid",
        lineItems: Array.isArray(current.offer.lineItems)
          ? current.offer.lineItems
          : [],
        commercialTerms: current.offer.commercialTerms,
        internalNotes: parsed.confirmationNote,
        sourceQuoteSnapshot: {
          offerReferenceCode: current.offer.referenceCode,
          offerStatus: current.offer.status,
          pricingVersion: current.offer.pricingVersion,
          pricingHash: current.offer.pricingHash,
          customerResponseHash: current.offer.customerResponseHash,
          customerPriceMinor: current.offer.customerPriceMinor,
          totalAmount,
          currencyCode: current.offer.currencyCode,
          leadTimeText: current.offer.leadTimeText,
          validUntil: iso(current.offer.validUntil),
          issuedAt: iso(current.offer.issuedAt),
          acceptedAt: iso(current.offer.respondedAt),
          supplierCostExcluded: true,
        },
        visibility: "parties_to_transaction",
        confirmedByUserId: userId,
        confirmedAt: now,
        plannedDeliveryAt: parsed.plannedDeliveryAt,
        createdByUserId: userId,
        updatedByUserId: userId,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing({
        target: [industrialOrders.tenantId, industrialOrders.quoteId],
      })
      .returning();
    if (!order) {
      const concurrentOrder = await tx.query.industrialOrders.findFirst({
        where: and(
          eq(industrialOrders.tenantId, input.tenantId),
          eq(industrialOrders.quoteId, current.offer.id),
        ),
      });
      if (
        concurrentOrder?.orderConfirmationHash === parsed.confirmationHash
      ) {
        return {
          created: false as const,
          order: concurrentOrder,
          requirement: null,
          evidence: {
            entity_ids: [concurrentOrder.id, current.offer.id],
            affected_rows: 0,
            idempotent: true,
            external_side_effect: false,
            order_created: true,
            payment_created: false,
            procurement_started: false,
          },
        };
      }
      throw new CommercialOfferServiceError(
        "COMMERCIAL_ORDER_CREATE_CONFLICT",
        409,
        "This accepted offer already has an order; reload before continuing.",
      );
    }

    const metadata = recordValue(requirement.metadata);
    const workflow = recordValue(metadata.internalWorkflow);
    const nextAction =
      "Select and authorize the governed payment path. Procurement and fulfilment remain blocked until verified payment evidence.";
    await tx
      .update(industrialRequirements)
      .set({
        status: "closed",
        nextAction,
        nextActionAt: now,
        metadata: {
          ...metadata,
          internalWorkflow: {
            ...workflow,
            nextAction,
            quoteStatus: current.offer.status,
            orderStatus: order.status,
            orderReferenceCode: order.referenceCode,
            orderConfirmationHash: parsed.confirmationHash,
            paymentStatus: "unpaid",
            procurementStarted: false,
            lastReviewedAt: now.toISOString(),
            lastReviewedByUserId: userId,
          },
        },
        updatedAt: now,
      })
      .where(
        and(
          eq(industrialRequirements.id, requirement.id),
          eq(industrialRequirements.tenantId, input.tenantId),
        ),
      );

    await tx.insert(industrialAuditLogs).values({
      tenantId: input.tenantId,
      actorUserId: userId,
      action: "industrial_order.confirmed_from_accepted_exact_offer",
      entityType: "industrial_order",
      entityId: order.id,
      reason: parsed.confirmationNote,
      nextValue: {
        status: order.status,
        quoteId: order.quoteId,
        requirementId: order.requirementId,
        totalAmountMinor: order.totalAmountMinor,
        currencyCode: order.currencyCode,
        orderConfirmationHash: order.orderConfirmationHash,
      },
      metadata: {
        orderReferenceCode: order.referenceCode,
        offerReferenceCode: current.offer.referenceCode,
        pricingHash: current.offer.pricingHash,
        customerResponseHash: current.offer.customerResponseHash,
        exactMinorUnits: true,
        supplierCostPrivate: true,
        externalSideEffect: false,
        paymentCreated: false,
        procurementStarted: false,
        fulfillmentInitialized: false,
      },
      createdAt: now,
    });

    return {
      created: true as const,
      order,
      requirement,
      evidence: {
        entity_ids: [order.id, current.offer.id, requirement.id],
        affected_rows: 3,
        idempotent: false,
        external_side_effect: false,
        order_created: true,
        payment_created: false,
        procurement_started: false,
        fulfillment_initialized: false,
      },
    };
  });

  if (outcome.created && outcome.requirement) {
    await recordIndustrialTradeConversion({
      tenantId: input.tenantId,
      actorUserId: userId,
      eventType: "order",
      requirement: outcome.requirement,
      entityId: outcome.order.id,
      referenceCode: outcome.order.referenceCode,
      estimatedValue: outcome.order.totalAmount,
      currencyCode: outcome.order.currencyCode,
    });
  }
  return {
    created: outcome.created,
    order: commercialOrderResponse(outcome.order),
    evidence: outcome.evidence,
  };
}

export { CommercialOfferPolicyError };
