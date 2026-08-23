import { and, eq } from "drizzle-orm";

import { db } from "@db";
import {
  contacts,
  industrialAuditLogs,
  industrialFulfillmentPlans,
  industrialOrders,
  industrialOrderRevenueRecognitions,
  industrialProductRequirements,
  industrialRelationshipContinuityReviews,
  industrialRequirements,
  industrialSupplierProfiles,
  industrialSupplierPurchaseOrderPackages,
  industrialTransactionRelationshipMemories,
  tenantContacts,
} from "@db/schema";
import { lockPlan } from "./fulfillment";
import {
  buildIndustrialRelationshipMemoryDraft,
  IndustrialRelationshipContinuityPolicyError,
  parseIndustrialRelationshipContinuityApproval,
} from "./relationshipContinuityPolicy";

type Executor = any;

export class IndustrialRelationshipContinuityError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly statusCode = 409,
  ) {
    super(message);
  }
}

function translate(error: unknown): never {
  if (error instanceof IndustrialRelationshipContinuityError) throw error;
  if (error instanceof IndustrialRelationshipContinuityPolicyError) {
    throw new IndustrialRelationshipContinuityError(
      error.code,
      error.message,
      error.statusCode,
    );
  }
  throw error;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

async function loadRelationshipSource(
  executor: Executor,
  input: { tenantId: number; orderId: string },
) {
  const order = await executor.query.industrialOrders.findFirst({
    where: and(
      eq(industrialOrders.tenantId, input.tenantId),
      eq(industrialOrders.id, input.orderId),
    ),
  });
  if (!order) {
    throw new IndustrialRelationshipContinuityError(
      "industrial_relationship_continuity_order_not_found",
      "The delivered industrial order was not found.",
      404,
    );
  }
  const [recognition, requirement, productRequirement, fulfillmentPlan, supplierPackage] =
    await Promise.all([
      executor.query.industrialOrderRevenueRecognitions.findFirst({
        where: and(
          eq(industrialOrderRevenueRecognitions.tenantId, input.tenantId),
          eq(industrialOrderRevenueRecognitions.orderId, input.orderId),
        ),
      }),
      executor.query.industrialRequirements.findFirst({
        where: and(
          eq(industrialRequirements.tenantId, input.tenantId),
          eq(industrialRequirements.id, order.requirementId),
        ),
      }),
      executor.query.industrialProductRequirements.findFirst({
        where: and(
          eq(industrialProductRequirements.tenantId, input.tenantId),
          eq(industrialProductRequirements.requirementId, order.requirementId),
        ),
      }),
      executor.query.industrialFulfillmentPlans.findFirst({
        where: and(
          eq(industrialFulfillmentPlans.tenantId, input.tenantId),
          eq(industrialFulfillmentPlans.orderId, input.orderId),
        ),
      }),
      executor.query.industrialSupplierPurchaseOrderPackages.findFirst({
        where: and(
          eq(industrialSupplierPurchaseOrderPackages.tenantId, input.tenantId),
          eq(industrialSupplierPurchaseOrderPackages.orderId, input.orderId),
        ),
      }),
    ]);
  if (!recognition || !requirement || !fulfillmentPlan || !supplierPackage) {
    throw new IndustrialRelationshipContinuityError(
      "industrial_relationship_continuity_source_incomplete",
      "Recognized revenue, requirement, delivered fulfillment, and supplier package evidence are required.",
    );
  }
  const [supplierProfile, customerContact, tenantContact] = await Promise.all([
    executor.query.industrialSupplierProfiles.findFirst({
      where: and(
        eq(industrialSupplierProfiles.tenantId, input.tenantId),
        eq(industrialSupplierProfiles.id, supplierPackage.supplierProfileId),
      ),
    }),
    requirement.customerContactId
      ? executor.query.contacts.findFirst({
          where: eq(contacts.id, requirement.customerContactId),
        })
      : null,
    requirement.customerContactId
      ? executor.query.tenantContacts.findFirst({
          where: and(
            eq(tenantContacts.tenantId, input.tenantId),
            eq(tenantContacts.contactId, requirement.customerContactId),
          ),
        })
      : null,
  ]);
  if (!supplierProfile) {
    throw new IndustrialRelationshipContinuityError(
      "industrial_relationship_continuity_supplier_not_found",
      "The supplier profile bound to the delivered transaction was not found.",
      404,
    );
  }
  return {
    order,
    recognition,
    requirement,
    productRequirement: productRequirement || null,
    fulfillmentPlan,
    supplierPackage,
    supplierProfile,
    customerContact: customerContact || null,
    consentStatus:
      tenantContact?.consentStatus || customerContact?.consentStatus || "unknown",
    isDnc: Boolean(tenantContact?.isDnc || customerContact?.isDnc),
  };
}

export async function loadIndustrialRelationshipContinuity(input: {
  tenantId: number;
  orderId: string;
}) {
  const memory = await db.query.industrialTransactionRelationshipMemories.findFirst({
    where: and(
      eq(industrialTransactionRelationshipMemories.tenantId, input.tenantId),
      eq(industrialTransactionRelationshipMemories.orderId, input.orderId),
    ),
  });
  if (!memory) return { memory: null, review: null };
  const review = await db.query.industrialRelationshipContinuityReviews.findFirst({
    where: and(
      eq(industrialRelationshipContinuityReviews.tenantId, input.tenantId),
      eq(industrialRelationshipContinuityReviews.memoryId, memory.id),
    ),
  });
  return { memory, review: review || null };
}

export function staffIndustrialRelationshipContinuitySummary(input: {
  memory: any | null;
  review: any | null;
} | null) {
  if (!input?.memory) return { memory: null, review: null };
  const memory = input.memory;
  const review = input.review;
  return {
    memory: {
      id: memory.id,
      recognitionId: memory.recognitionId,
      orderId: memory.orderId,
      requirementId: memory.requirementId,
      supplierProfileId: memory.supplierProfileId,
      customerContactId: memory.customerContactId,
      referenceCode: memory.referenceCode,
      productName: memory.productName,
      specification: memory.specification,
      quantityText: memory.quantityText,
      unitOfMeasure: memory.unitOfMeasure,
      destination: memory.destination,
      countryOfOrigin: memory.countryOfOrigin,
      cadenceText: memory.cadenceText,
      deliveredAt: memory.deliveredAt,
      currencyCode: memory.currencyCode,
      revenueMinor: String(memory.revenueMinor),
      actualCostMinor: String(memory.actualCostMinor),
      actualGrossMarginMinor: String(memory.actualGrossMarginMinor),
      customerMemory: record(memory.customerMemory),
      supplierMemory: record(memory.supplierMemory),
      evidenceHash: memory.evidenceHash,
      memoryHash: memory.memoryHash,
      recordedAt: memory.recordedAt,
      privateFinancialEvidence: true,
    },
    review: review
      ? {
          id: review.id,
          memoryId: review.memoryId,
          status: review.status,
          recommendedAction: review.recommendedAction,
          proposedNextReviewAt: review.proposedNextReviewAt,
          consentStatus: review.consentStatus,
          isDnc: Boolean(review.isDnc),
          decisionChecklist: record(review.decisionChecklist),
          decisionReason: review.decisionReason,
          approvedAt: review.approvedAt,
          externalCommunicationAuthorized: false,
          externalCommunicationExecuted: false,
          externalMessageReference: null,
        }
      : null,
  };
}

export async function ensureIndustrialRelationshipContinuity(
  executor: Executor,
  input: { tenantId: number; orderId: string; actorUserId: number },
) {
  const source = await loadRelationshipSource(executor, input);
  const draft = buildIndustrialRelationshipMemoryDraft({
    tenantId: input.tenantId,
    recognition: source.recognition,
    order: source.order,
    requirement: source.requirement,
    productRequirement: source.productRequirement,
    fulfillmentPlan: source.fulfillmentPlan,
    supplierPurchaseOrderPackage: source.supplierPackage,
    supplierProfile: source.supplierProfile,
    customerContact: source.customerContact,
    consentStatus: source.consentStatus,
    isDnc: source.isDnc,
  });
  let memory =
    await executor.query.industrialTransactionRelationshipMemories.findFirst({
      where: and(
        eq(industrialTransactionRelationshipMemories.tenantId, input.tenantId),
        eq(
          industrialTransactionRelationshipMemories.recognitionId,
          source.recognition.id,
        ),
      ),
    });
  let created = false;
  const now = new Date();
  if (memory) {
    if (memory.memoryHash !== draft.memoryHash) {
      throw new IndustrialRelationshipContinuityError(
        "industrial_relationship_continuity_memory_mismatch",
        "The immutable relationship memory no longer matches the recognized transaction evidence.",
      );
    }
  } else {
    [memory] = await executor
      .insert(industrialTransactionRelationshipMemories)
      .values({
        tenantId: input.tenantId,
        recognitionId: draft.recognitionId,
        orderId: draft.orderId,
        requirementId: draft.requirementId,
        fulfillmentPlanId: draft.fulfillmentPlanId,
        supplierPurchaseOrderPackageId:
          draft.supplierPurchaseOrderPackageId,
        supplierProfileId: draft.supplierProfileId,
        customerContactId: draft.customerContactId,
        referenceCode: `EXP-MEM-${draft.memoryHash.slice(0, 20).toUpperCase()}`,
        productName: draft.productName,
        specification: draft.specification,
        quantityText: draft.quantityText,
        unitOfMeasure: draft.unitOfMeasure,
        destination: draft.destination,
        countryOfOrigin: draft.countryOfOrigin,
        cadenceText: draft.cadenceText,
        deliveredAt: new Date(draft.deliveredAt),
        currencyCode: draft.currencyCode,
        revenueMinor: draft.revenueMinor,
        actualCostMinor: draft.actualCostMinor,
        actualGrossMarginMinor: draft.actualGrossMarginMinor,
        customerMemory: draft.customerMemory,
        supplierMemory: draft.supplierMemory,
        sourceSnapshot: draft.sourceSnapshot,
        evidenceHash: draft.evidenceHash,
        memoryHash: draft.memoryHash,
        recordedByUserId: input.actorUserId,
        recordedAt: now,
      })
      .returning();
    created = true;
  }
  if (!memory) {
    throw new IndustrialRelationshipContinuityError(
      "industrial_relationship_continuity_memory_create_failed",
      "The immutable relationship memory could not be recorded.",
    );
  }
  let review = await executor.query.industrialRelationshipContinuityReviews.findFirst({
    where: and(
      eq(industrialRelationshipContinuityReviews.tenantId, input.tenantId),
      eq(industrialRelationshipContinuityReviews.memoryId, memory.id),
    ),
  });
  if (!review) {
    [review] = await executor
      .insert(industrialRelationshipContinuityReviews)
      .values({
        tenantId: input.tenantId,
        memoryId: memory.id,
        status: "review_required",
        recommendedAction: draft.recommendedAction,
        proposedNextReviewAt: draft.proposedNextReviewAt
          ? new Date(draft.proposedNextReviewAt)
          : null,
        consentStatus: draft.consentStatus,
        isDnc: draft.isDnc,
        decisionChecklist: {},
        decisionReason: null,
        approvedByUserId: null,
        approvedAt: null,
        externalCommunicationAuthorized: false,
        externalCommunicationExecuted: false,
        externalMessageReference: null,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
  }
  if (!review) {
    throw new IndustrialRelationshipContinuityError(
      "industrial_relationship_continuity_review_create_failed",
      "The internal relationship review could not be prepared.",
    );
  }
  if (created) {
    await executor.insert(industrialAuditLogs).values({
      tenantId: input.tenantId,
      actorUserId: input.actorUserId,
      action: "industrial_relationship_continuity.memory_recorded",
      entityType: "industrial_transaction_relationship_memory",
      entityId: memory.id,
      reason:
        "Recorded immutable customer and supplier relationship memory from the recognized delivered transaction.",
      nextValue: {
        memoryHash: memory.memoryHash,
        status: review.status,
        nextReviewAt: review.proposedNextReviewAt,
      },
      metadata: {
        orderId: input.orderId,
        recognitionId: source.recognition.id,
        requirementId: source.requirement.id,
        supplierProfileId: source.supplierProfile.id,
        customerContactId: source.requirement.customerContactId || null,
        exactMinorUnits: true,
        privateFinancialEvidence: true,
        externalCommunicationAuthorized: false,
        externalCommunicationExecuted: false,
      },
      createdAt: now,
    });
  }
  return { memory, review, created };
}

export async function approveIndustrialRelationshipContinuity(input: {
  tenantId: number;
  orderId: string;
  reviewId: string;
  actorUserId: number;
  approval: unknown;
}) {
  try {
    const parsed = parseIndustrialRelationshipContinuityApproval(input.approval);
    return await db.transaction(async (tx) => {
      await lockPlan(tx, input.tenantId, input.orderId);
      const ensured = await ensureIndustrialRelationshipContinuity(tx, input);
      const memory = ensured.memory;
      const review = ensured.review;
      if (review.id !== input.reviewId) {
        throw new IndustrialRelationshipContinuityError(
          "industrial_relationship_continuity_review_not_found",
          "The internal relationship continuity review was not found.",
          404,
        );
      }
      if (memory.memoryHash !== parsed.expectedMemoryHash) {
        throw new IndustrialRelationshipContinuityError(
          "industrial_relationship_continuity_hash_mismatch",
          "The delivered transaction memory changed; reload the exact relationship evidence.",
        );
      }
      if (review.status === "approved_internal") {
        return { memory, review, approved: false as const };
      }
      const now = new Date();
      const [updated] = await tx
        .update(industrialRelationshipContinuityReviews)
        .set({
          status: "approved_internal",
          proposedNextReviewAt: new Date(parsed.nextReviewAt),
          decisionChecklist: parsed.checklist,
          decisionReason: parsed.reason,
          approvedByUserId: input.actorUserId,
          approvedAt: now,
          externalCommunicationAuthorized: false,
          externalCommunicationExecuted: false,
          externalMessageReference: null,
          updatedAt: now,
        })
        .where(
          and(
            eq(industrialRelationshipContinuityReviews.id, review.id),
            eq(
              industrialRelationshipContinuityReviews.status,
              "review_required",
            ),
          ),
        )
        .returning();
      if (!updated) {
        throw new IndustrialRelationshipContinuityError(
          "industrial_relationship_continuity_concurrent_update",
          "The relationship continuity review changed during approval.",
        );
      }
      await tx.insert(industrialAuditLogs).values({
        tenantId: input.tenantId,
        actorUserId: input.actorUserId,
        action: "industrial_relationship_continuity.internal_plan_approved",
        entityType: "industrial_relationship_continuity_review",
        entityId: updated.id,
        reason: parsed.reason,
        previousValue: { status: review.status },
        nextValue: {
          status: updated.status,
          nextReviewAt: updated.proposedNextReviewAt,
          memoryHash: memory.memoryHash,
        },
        metadata: {
          orderId: input.orderId,
          recognitionId: memory.recognitionId,
          internalReviewOnly: true,
          externalCommunicationAuthorized: false,
          externalCommunicationExecuted: false,
        },
        createdAt: now,
      });
      return { memory, review: updated, approved: true as const };
    });
  } catch (error) {
    translate(error);
  }
}
