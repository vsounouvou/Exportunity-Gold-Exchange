import { and, asc, eq } from "drizzle-orm";

import { db } from "@db";
import {
  industrialAuditLogs,
  industrialFulfillmentEvents,
  industrialFulfillmentPlans,
  industrialFulfillmentServices,
  industrialOrderActualCostEntries,
  industrialOrderRevenueRecognitions,
  industrialOrders,
  industrialProcurementAuthorizations,
  industrialQuotes,
  industrialSupplierPurchaseOrderPackages,
  payments,
} from "@db/schema";
import { lockPlan } from "./fulfillment";
import {
  buildIndustrialActualCostEntryDraft,
  buildIndustrialRevenueRecognitionDraft,
  IndustrialDeliveryAccountingPolicyError,
  parseIndustrialRevenueRecognitionApproval,
} from "./deliveryAccountingPolicy";
import {
  ensureIndustrialRelationshipContinuity,
  IndustrialRelationshipContinuityError,
} from "./relationshipContinuity";

type Executor = any;

export class IndustrialDeliveryAccountingError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly statusCode = 409,
  ) {
    super(message);
  }
}

function translate(error: unknown): never {
  if (error instanceof IndustrialDeliveryAccountingError) throw error;
  if (error instanceof IndustrialRelationshipContinuityError) {
    throw new IndustrialDeliveryAccountingError(
      error.code,
      error.message,
      error.statusCode,
    );
  }
  if (error instanceof IndustrialDeliveryAccountingPolicyError) {
    throw new IndustrialDeliveryAccountingError(
      error.code,
      error.message,
      error.statusCode,
    );
  }
  throw error;
}

function documentedReason(value: unknown, label: string) {
  const normalized = String(value || "").replace(/\s+/g, " ").trim();
  if (normalized.length < 12 || normalized.length > 1200) {
    throw new IndustrialDeliveryAccountingError(
      "industrial_delivery_accounting_reason_required",
      `Document ${label} between 12 and 1200 characters.`,
      422,
    );
  }
  return normalized;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

type FulfillmentServiceType =
  | "procurement"
  | "inspection"
  | "freight"
  | "customs"
  | "last_mile";

const serviceTypeByCostCategory: Record<
  string,
  FulfillmentServiceType | undefined
> = {
  inspection: "inspection",
  freight: "freight",
  customs: "customs",
  last_mile: "last_mile",
};

async function loadAccountingSource(
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
    throw new IndustrialDeliveryAccountingError(
      "industrial_delivery_accounting_order_not_found",
      "The industrial order was not found.",
      404,
    );
  }
  const [customerQuote, payment, plan, procurementAuthorization, supplierPackage] =
    await Promise.all([
      executor.query.industrialQuotes.findFirst({
        where: and(
          eq(industrialQuotes.tenantId, input.tenantId),
          eq(industrialQuotes.id, order.quoteId),
        ),
      }),
      order.lastPaymentId
        ? executor.query.payments.findFirst({
            where: and(
              eq(payments.tenantId, input.tenantId),
              eq(payments.id, order.lastPaymentId),
            ),
          })
        : null,
      executor.query.industrialFulfillmentPlans.findFirst({
        where: and(
          eq(industrialFulfillmentPlans.tenantId, input.tenantId),
          eq(industrialFulfillmentPlans.orderId, input.orderId),
        ),
      }),
      executor.query.industrialProcurementAuthorizations.findFirst({
        where: and(
          eq(industrialProcurementAuthorizations.tenantId, input.tenantId),
          eq(industrialProcurementAuthorizations.orderId, input.orderId),
        ),
      }),
      executor.query.industrialSupplierPurchaseOrderPackages.findFirst({
        where: and(
          eq(industrialSupplierPurchaseOrderPackages.tenantId, input.tenantId),
          eq(industrialSupplierPurchaseOrderPackages.orderId, input.orderId),
        ),
      }),
    ]);
  if (!customerQuote || !payment || !plan || !procurementAuthorization || !supplierPackage) {
    throw new IndustrialDeliveryAccountingError(
      "industrial_delivery_accounting_source_incomplete",
      "The accepted quote, successful payment, procurement evidence, supplier package, and fulfillment plan are required.",
    );
  }
  const [deliveryProofEvent, actualCostEntries, recognition] = await Promise.all([
    executor.query.industrialFulfillmentEvents.findFirst({
      where: and(
        eq(industrialFulfillmentEvents.tenantId, input.tenantId),
        eq(industrialFulfillmentEvents.orderId, input.orderId),
        eq(industrialFulfillmentEvents.planId, plan.id),
        eq(industrialFulfillmentEvents.eventType, "delivery_proof_recorded"),
      ),
      orderBy: [asc(industrialFulfillmentEvents.sequence)],
    }),
    executor
      .select()
      .from(industrialOrderActualCostEntries)
      .where(
        and(
          eq(industrialOrderActualCostEntries.tenantId, input.tenantId),
          eq(industrialOrderActualCostEntries.orderId, input.orderId),
        ),
      )
      .orderBy(asc(industrialOrderActualCostEntries.entryHash)),
    executor.query.industrialOrderRevenueRecognitions.findFirst({
      where: and(
        eq(industrialOrderRevenueRecognitions.tenantId, input.tenantId),
        eq(industrialOrderRevenueRecognitions.orderId, input.orderId),
      ),
    }),
  ]);
  return {
    order,
    customerQuote,
    payment,
    plan,
    procurementAuthorization,
    supplierPackage,
    deliveryProofEvent,
    actualCostEntries,
    recognition: recognition || null,
  };
}

export function staffIndustrialDeliveryAccountingSummary(input: {
  actualCostEntries: any[];
  recognition: any | null;
} | null) {
  if (!input) return { actualCosts: [], recognition: null };
  return {
    actualCosts: input.actualCostEntries.map((row) => ({
      id: row.id,
      orderId: row.orderId,
      fulfillmentServiceId: row.fulfillmentServiceId,
      supplierPurchaseOrderPackageId: row.supplierPurchaseOrderPackageId,
      reversesCostEntryId: row.reversesCostEntryId,
      referenceCode: row.referenceCode,
      direction: row.direction,
      category: row.category,
      currencyCode: row.currencyCode,
      amountMinor: String(row.amountMinor),
      costReference: row.costReference,
      description: row.description,
      evidence: Array.isArray(row.evidence) ? row.evidence : [],
      evidenceHash: row.evidenceHash,
      entryHash: row.entryHash,
      incurredAt: row.incurredAt,
      recordedReason: row.recordedReason,
      recordedAt: row.recordedAt,
      externalAccountingPosted: false,
      externalAccountingReference: null,
    })),
    recognition: input.recognition
      ? {
          id: input.recognition.id,
          orderId: input.recognition.orderId,
          referenceCode: input.recognition.referenceCode,
          status: input.recognition.status,
          currencyCode: input.recognition.currencyCode,
          revenueMinor: String(input.recognition.revenueMinor),
          actualCostMinor: String(input.recognition.actualCostMinor),
          actualGrossMarginMinor: String(
            input.recognition.actualGrossMarginMinor,
          ),
          plannedCostMinor: String(input.recognition.plannedCostMinor),
          plannedMarginMinor: String(input.recognition.plannedMarginMinor),
          costVarianceMinor: String(input.recognition.costVarianceMinor),
          marginVarianceMinor: String(input.recognition.marginVarianceMinor),
          costEntryIds: Array.isArray(input.recognition.costEntryIds)
            ? input.recognition.costEntryIds
            : [],
          costEvidenceHash: input.recognition.costEvidenceHash,
          deliveryProofHash: input.recognition.deliveryProofHash,
          recognitionHash: input.recognition.recognitionHash,
          sourceSnapshot: record(input.recognition.sourceSnapshot),
          approvalChecklist: record(input.recognition.approvalChecklist),
          preparedReason: input.recognition.preparedReason,
          preparedAt: input.recognition.preparedAt,
          recognizedReason: input.recognition.recognizedReason,
          recognizedAt: input.recognition.recognizedAt,
          externalJournalPosted: false,
          externalJournalReference: null,
        }
      : null,
  };
}

export async function loadIndustrialDeliveryAccounting(input: {
  tenantId: number;
  orderId: string;
}) {
  const [actualCostEntries, recognition] = await Promise.all([
    db
      .select()
      .from(industrialOrderActualCostEntries)
      .where(
        and(
          eq(industrialOrderActualCostEntries.tenantId, input.tenantId),
          eq(industrialOrderActualCostEntries.orderId, input.orderId),
        ),
      )
      .orderBy(asc(industrialOrderActualCostEntries.entryHash)),
    db.query.industrialOrderRevenueRecognitions.findFirst({
      where: and(
        eq(industrialOrderRevenueRecognitions.tenantId, input.tenantId),
        eq(industrialOrderRevenueRecognitions.orderId, input.orderId),
      ),
    }),
  ]);
  return { actualCostEntries, recognition: recognition || null };
}

export async function recordIndustrialActualCost(input: {
  tenantId: number;
  orderId: string;
  actorUserId: number;
  entry: {
    direction?: unknown;
    category: unknown;
    currencyCode: unknown;
    amountMinor: unknown;
    costReference: unknown;
    description: unknown;
    evidence: unknown;
    incurredAt: unknown;
    reason: unknown;
    reversesCostEntryId?: unknown;
  };
}) {
  try {
    return await db.transaction(async (tx) => {
      await lockPlan(tx, input.tenantId, input.orderId);
      const current = await loadAccountingSource(tx, input);
      if (current.recognition?.status === "recognized") {
        throw new IndustrialDeliveryAccountingError(
          "industrial_actual_cost_ledger_closed",
          "Recognized revenue closes the actual-cost ledger. Record corrections before approval.",
        );
      }
      const serviceType = serviceTypeByCostCategory[String(input.entry.category || "")];
      const fulfillmentService = serviceType
        ? await tx.query.industrialFulfillmentServices.findFirst({
            where: and(
              eq(industrialFulfillmentServices.tenantId, input.tenantId),
              eq(industrialFulfillmentServices.orderId, input.orderId),
              eq(industrialFulfillmentServices.planId, current.plan.id),
              eq(industrialFulfillmentServices.serviceType, serviceType),
            ),
          })
        : null;
      const reversesCostEntryId = String(
        input.entry.reversesCostEntryId || "",
      ).trim();
      const originalCostEntry = reversesCostEntryId
        ? await tx.query.industrialOrderActualCostEntries.findFirst({
            where: and(
              eq(industrialOrderActualCostEntries.tenantId, input.tenantId),
              eq(industrialOrderActualCostEntries.orderId, input.orderId),
              eq(industrialOrderActualCostEntries.id, reversesCostEntryId),
            ),
          })
        : null;
      const alreadyReversedMinor = current.actualCostEntries
        .filter(
          (entry: any) =>
            entry.direction === "reversal" &&
            String(entry.reversesCostEntryId || "") === reversesCostEntryId,
        )
        .reduce((sum: bigint, entry: any) => sum + BigInt(String(entry.amountMinor)), 0n)
        .toString();
      const draft = buildIndustrialActualCostEntryDraft({
        tenantId: input.tenantId,
        order: current.order,
        fulfillmentPlan: current.plan,
        fulfillmentService,
        supplierPurchaseOrderPackage:
          String(input.entry.category || "") === "supplier"
            ? current.supplierPackage
            : null,
        originalCostEntry,
        alreadyReversedMinor,
        entry: input.entry,
      });
      const existing = await tx.query.industrialOrderActualCostEntries.findFirst({
        where: and(
          eq(industrialOrderActualCostEntries.tenantId, input.tenantId),
          eq(industrialOrderActualCostEntries.entryHash, draft.entryHash),
        ),
      });
      if (existing) return { entry: existing, created: false as const };
      const now = new Date();
      const [created] = await tx
        .insert(industrialOrderActualCostEntries)
        .values({
          tenantId: input.tenantId,
          orderId: input.orderId,
          fulfillmentPlanId: current.plan.id,
          fulfillmentServiceId: fulfillmentService?.id || null,
          supplierPurchaseOrderPackageId:
            draft.supplierPurchaseOrderPackageId || null,
          reversesCostEntryId: draft.reversesCostEntryId,
          referenceCode: `EXP-COST-${draft.entryHash.slice(0, 20).toUpperCase()}`,
          direction: draft.direction as "cost" | "reversal",
          category: draft.category as any,
          currencyCode: draft.currencyCode,
          amountMinor: draft.amountMinor,
          costReference: draft.costReference,
          description: draft.description,
          evidence: draft.evidence,
          evidenceHash: draft.evidenceHash,
          entryHash: draft.entryHash,
          incurredAt: new Date(draft.incurredAt),
          recordedReason: draft.recordedReason,
          recordedByUserId: input.actorUserId,
          recordedAt: now,
          externalAccountingPosted: false,
          externalAccountingReference: null,
        })
        .returning();
      await tx.insert(industrialAuditLogs).values({
        tenantId: input.tenantId,
        actorUserId: input.actorUserId,
        action: "industrial_delivery_accounting.actual_cost_recorded",
        entityType: "industrial_order_actual_cost_entry",
        entityId: created.id,
        reason: draft.recordedReason,
        nextValue: {
          direction: created.direction,
          category: created.category,
          currencyCode: created.currencyCode,
          amountMinor: String(created.amountMinor),
          entryHash: created.entryHash,
        },
        metadata: {
          orderId: input.orderId,
          fulfillmentPlanId: current.plan.id,
          exactMinorUnits: true,
          immutable: true,
          privateFinancialEvidence: true,
          externalAccountingPosted: false,
        },
        createdAt: now,
      });
      return { entry: created, created: true as const };
    });
  } catch (error) {
    translate(error);
  }
}

function recognitionDraft(current: Awaited<ReturnType<typeof loadAccountingSource>>) {
  if (!current.deliveryProofEvent) {
    throw new IndustrialDeliveryAccountingError(
      "industrial_revenue_recognition_delivery_proof_required",
      "Record immutable delivery proof before preparing revenue recognition.",
    );
  }
  return buildIndustrialRevenueRecognitionDraft({
    tenantId: Number(current.order.tenantId),
    order: current.order,
    customerQuote: current.customerQuote,
    payment: current.payment,
    procurementAuthorization: current.procurementAuthorization,
    supplierPurchaseOrderPackage: current.supplierPackage,
    fulfillmentPlan: current.plan,
    deliveryProofEvent: current.deliveryProofEvent,
    actualCostEntries: current.actualCostEntries,
  });
}

export async function prepareIndustrialRevenueRecognition(input: {
  tenantId: number;
  orderId: string;
  actorUserId: number;
  preparationReason: unknown;
}) {
  const preparationReason = documentedReason(
    input.preparationReason,
    "a revenue-recognition preparation reason",
  );
  try {
    return await db.transaction(async (tx) => {
      await lockPlan(tx, input.tenantId, input.orderId);
      const current = await loadAccountingSource(tx, input);
      const draft = recognitionDraft(current);
      if (current.recognition?.status === "recognized") {
        if (current.recognition.recognitionHash === draft.recognitionHash) {
          return { recognition: current.recognition, created: false as const };
        }
        throw new IndustrialDeliveryAccountingError(
          "industrial_revenue_recognition_immutable",
          "Recognized revenue is immutable; use a separately governed forward correction.",
        );
      }
      const now = new Date();
      const values = {
        customerQuoteId: draft.customerQuoteId,
        sourcePaymentId: draft.sourcePaymentId,
        procurementAuthorizationId: draft.procurementAuthorizationId,
        supplierPurchaseOrderPackageId:
          draft.supplierPurchaseOrderPackageId,
        fulfillmentPlanId: draft.fulfillmentPlanId,
        deliveryProofEventId: draft.deliveryProofEventId,
        referenceCode: `EXP-REV-${draft.recognitionHash.slice(0, 20).toUpperCase()}`,
        status: "approval_required" as const,
        currencyCode: draft.currencyCode,
        revenueMinor: draft.revenueMinor,
        actualCostMinor: draft.actualCostMinor,
        actualGrossMarginMinor: draft.actualGrossMarginMinor,
        plannedCostMinor: draft.plannedCostMinor,
        plannedMarginMinor: draft.plannedMarginMinor,
        costVarianceMinor: draft.costVarianceMinor,
        marginVarianceMinor: draft.marginVarianceMinor,
        costEntryIds: draft.costEntryIds,
        costEvidenceHash: draft.costEvidenceHash,
        deliveryProofHash: draft.deliveryProofHash,
        sourcePricingHash: draft.sourcePricingHash,
        sourceOrderConfirmationHash: draft.sourceOrderConfirmationHash,
        recognitionHash: draft.recognitionHash,
        sourceSnapshot: draft.sourceSnapshot,
        approvalChecklist: {},
        preparedReason: preparationReason,
        preparedByUserId: input.actorUserId,
        preparedAt: now,
        recognizedReason: null,
        recognizedByUserId: null,
        recognizedAt: null,
        externalJournalPosted: false,
        externalJournalReference: null,
        updatedAt: now,
      };
      let recognition: any;
      let created = false;
      if (current.recognition) {
        [recognition] = await tx
          .update(industrialOrderRevenueRecognitions)
          .set(values)
          .where(
            and(
              eq(industrialOrderRevenueRecognitions.id, current.recognition.id),
              eq(
                industrialOrderRevenueRecognitions.status,
                "approval_required",
              ),
            ),
          )
          .returning();
      } else {
        [recognition] = await tx
          .insert(industrialOrderRevenueRecognitions)
          .values({
            tenantId: input.tenantId,
            orderId: input.orderId,
            ...values,
            createdAt: now,
          })
          .returning();
        created = true;
      }
      if (!recognition) {
        throw new IndustrialDeliveryAccountingError(
          "industrial_revenue_recognition_concurrent_update",
          "The recognition proposal changed while it was being prepared.",
        );
      }
      await tx.insert(industrialAuditLogs).values({
        tenantId: input.tenantId,
        actorUserId: input.actorUserId,
        action: "industrial_delivery_accounting.recognition_prepared",
        entityType: "industrial_order_revenue_recognition",
        entityId: recognition.id,
        reason: preparationReason,
        nextValue: {
          status: recognition.status,
          recognitionHash: recognition.recognitionHash,
          revenueMinor: String(recognition.revenueMinor),
          actualCostMinor: String(recognition.actualCostMinor),
          actualGrossMarginMinor: String(recognition.actualGrossMarginMinor),
        },
        metadata: {
          orderId: input.orderId,
          deliveryProofEventId: draft.deliveryProofEventId,
          exactMinorUnits: true,
          privateFinancialEvidence: true,
          externalJournalPosted: false,
        },
        createdAt: now,
      });
      return { recognition, created };
    });
  } catch (error) {
    translate(error);
  }
}

export async function approveIndustrialRevenueRecognition(input: {
  tenantId: number;
  orderId: string;
  recognitionId: string;
  actorUserId: number;
  approval: unknown;
}) {
  try {
    const parsed = parseIndustrialRevenueRecognitionApproval(input.approval);
    return await db.transaction(async (tx) => {
      await lockPlan(tx, input.tenantId, input.orderId);
      const current = await loadAccountingSource(tx, input);
      const draft = recognitionDraft(current);
      const recognition = current.recognition;
      if (!recognition || recognition.id !== input.recognitionId) {
        throw new IndustrialDeliveryAccountingError(
          "industrial_revenue_recognition_not_found",
          "The revenue-recognition proposal was not found.",
          404,
        );
      }
      if (
        recognition.recognitionHash !== parsed.expectedRecognitionHash ||
        recognition.recognitionHash !== draft.recognitionHash
      ) {
        throw new IndustrialDeliveryAccountingError(
          "industrial_revenue_recognition_hash_mismatch",
          "Payment, actual cost, or delivery evidence changed; prepare a newly reviewed recognition proposal.",
        );
      }
      if (recognition.status === "recognized") {
        await ensureIndustrialRelationshipContinuity(tx, {
          tenantId: input.tenantId,
          orderId: input.orderId,
          actorUserId: input.actorUserId,
        });
        return { recognition, recognized: false as const };
      }
      const now = new Date();
      const [updated] = await tx
        .update(industrialOrderRevenueRecognitions)
        .set({
          status: "recognized",
          approvalChecklist: parsed.checklist,
          recognizedReason: parsed.reason,
          recognizedByUserId: input.actorUserId,
          recognizedAt: now,
          externalJournalPosted: false,
          externalJournalReference: null,
          updatedAt: now,
        })
        .where(
          and(
            eq(industrialOrderRevenueRecognitions.id, recognition.id),
            eq(industrialOrderRevenueRecognitions.status, "approval_required"),
            eq(
              industrialOrderRevenueRecognitions.recognitionHash,
              parsed.expectedRecognitionHash,
            ),
          ),
        )
        .returning();
      if (!updated) {
        throw new IndustrialDeliveryAccountingError(
          "industrial_revenue_recognition_concurrent_update",
          "The recognition proposal changed during approval.",
        );
      }
      await tx.insert(industrialAuditLogs).values({
        tenantId: input.tenantId,
        actorUserId: input.actorUserId,
        action: "industrial_delivery_accounting.revenue_recognized",
        entityType: "industrial_order_revenue_recognition",
        entityId: updated.id,
        reason: parsed.reason,
        previousValue: { status: recognition.status },
        nextValue: {
          status: updated.status,
          recognitionHash: updated.recognitionHash,
          revenueMinor: String(updated.revenueMinor),
          actualCostMinor: String(updated.actualCostMinor),
          actualGrossMarginMinor: String(updated.actualGrossMarginMinor),
        },
        metadata: {
          orderId: input.orderId,
          deliveryProofEventId: updated.deliveryProofEventId,
          exactMinorUnits: true,
          deliveryBound: true,
          privateFinancialEvidence: true,
          externalJournalPosted: false,
        },
        createdAt: now,
      });
      await ensureIndustrialRelationshipContinuity(tx, {
        tenantId: input.tenantId,
        orderId: input.orderId,
        actorUserId: input.actorUserId,
      });
      return { recognition: updated, recognized: true as const };
    });
  } catch (error) {
    translate(error);
  }
}
