import { and, eq, sql } from "drizzle-orm";

import { db } from "@db";
import {
  industrialAuditLogs,
  industrialFulfillmentPlans,
  industrialFulfillmentServices,
  industrialOrders,
  industrialProcurementAuthorizations,
  industrialQuotes,
  industrialRequirements,
  industrialSupplierProfiles,
  industrialSupplierQuotes,
  payments,
} from "@db/schema";
import {
  appendEventInTransaction,
  lockPlan,
} from "./fulfillment";
import {
  buildIndustrialProcurementAuthorizationDraft,
  IndustrialProcurementPolicyError,
  parseIndustrialProcurementApprovalInput,
} from "./procurementAuthorizationPolicy";

type Executor = any;

export class IndustrialProcurementAuthorizationError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly statusCode = 409,
  ) {
    super(message);
  }
}

function translate(error: unknown): never {
  if (error instanceof IndustrialProcurementAuthorizationError) throw error;
  if (error instanceof IndustrialProcurementPolicyError) {
    throw new IndustrialProcurementAuthorizationError(
      error.code,
      error.message,
      error.statusCode,
    );
  }
  throw error;
}

function reason(value: unknown) {
  const normalized = String(value || "").trim();
  if (normalized.length < 12 || normalized.length > 1200) {
    throw new IndustrialProcurementAuthorizationError(
      "industrial_procurement_preparation_reason_required",
      "Document a procurement preparation reason between 12 and 1200 characters.",
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

export async function loadCurrentProcurementSource(
  executor: Executor,
  input: { tenantId: number; orderId: string },
) {
  const [order] = await executor
    .select()
    .from(industrialOrders)
    .where(
      and(
        eq(industrialOrders.tenantId, input.tenantId),
        eq(industrialOrders.id, input.orderId),
      ),
    )
    .limit(1);
  if (!order) {
    throw new IndustrialProcurementAuthorizationError(
      "industrial_procurement_order_not_found",
      "The industrial order was not found.",
      404,
    );
  }
  const [customerQuote, payment, plan] = await Promise.all([
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
        eq(industrialFulfillmentPlans.orderId, order.id),
      ),
    }),
  ]);
  if (!customerQuote || !payment || !plan) {
    throw new IndustrialProcurementAuthorizationError(
      "industrial_procurement_evidence_incomplete",
      "The accepted quote, successful payment, and fulfillment plan are required.",
    );
  }
  const [supplierQuote, procurementService] = await Promise.all([
    customerQuote.sourceSupplierQuoteId
      ? executor.query.industrialSupplierQuotes.findFirst({
          where: and(
            eq(industrialSupplierQuotes.tenantId, input.tenantId),
            eq(
              industrialSupplierQuotes.id,
              customerQuote.sourceSupplierQuoteId,
            ),
          ),
        })
      : null,
    executor.query.industrialFulfillmentServices.findFirst({
      where: and(
        eq(industrialFulfillmentServices.tenantId, input.tenantId),
        eq(industrialFulfillmentServices.planId, plan.id),
        eq(industrialFulfillmentServices.serviceType, "procurement"),
      ),
    }),
  ]);
  if (!supplierQuote || !procurementService) {
    throw new IndustrialProcurementAuthorizationError(
      "industrial_procurement_supplier_or_service_missing",
      "The qualified supplier quote and accountable procurement service are required.",
    );
  }
  const supplierProfile =
    await executor.query.industrialSupplierProfiles.findFirst({
      where: and(
        eq(industrialSupplierProfiles.tenantId, input.tenantId),
        eq(industrialSupplierProfiles.id, supplierQuote.supplierProfileId),
      ),
    });
  if (!supplierProfile) {
    throw new IndustrialProcurementAuthorizationError(
      "industrial_procurement_supplier_profile_missing",
      "The quoted supplier profile is unavailable in this Exportunity tenant.",
    );
  }
  const draft = buildIndustrialProcurementAuthorizationDraft({
    tenantId: input.tenantId,
    order,
    payment,
    customerQuote,
    supplierQuote,
    supplierProfile,
    fulfillmentPlan: plan,
    procurementService,
  });
  return {
    order,
    payment,
    customerQuote,
    supplierQuote,
    supplierProfile,
    plan,
    procurementService,
    draft,
  };
}

export function staffIndustrialProcurementAuthorizationSummary(row: any) {
  if (!row) return null;
  return {
    id: row.id,
    orderId: row.orderId,
    referenceCode: row.referenceCode,
    status: row.status,
    supplierQuoteId: row.supplierQuoteId,
    supplierProfileId: row.supplierProfileId,
    fulfillmentPlanId: row.fulfillmentPlanId,
    procurementServiceId: row.procurementServiceId,
    currencyCode: row.currencyCode,
    supplierCostMinor: String(row.supplierCostMinor),
    additionalCostsMinor: String(row.additionalCostsMinor),
    totalCostMinor: String(row.totalCostMinor),
    marginMinor: String(row.marginMinor),
    customerPriceMinor: String(row.customerPriceMinor),
    sourcePricingHash: row.sourcePricingHash,
    sourceSupplierQuoteHash: row.sourceSupplierQuoteHash,
    sourceOrderConfirmationHash: row.sourceOrderConfirmationHash,
    sourcePaymentId: row.sourcePaymentId,
    releaseHash: row.releaseHash,
    sourceSnapshot: record(row.sourceSnapshot),
    approvalChecklist: record(row.approvalChecklist),
    preparedReason: row.preparedReason,
    preparedAt: row.preparedAt,
    approvedReason: row.approvedReason,
    approvedAt: row.approvedAt,
    externalActionExecuted: false,
    supplierContacted: false,
    supplierCommitmentCreated: false,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function loadIndustrialProcurementAuthorization(input: {
  tenantId: number;
  orderId: string;
}) {
  return (
    (await db.query.industrialProcurementAuthorizations.findFirst({
      where: and(
        eq(industrialProcurementAuthorizations.tenantId, input.tenantId),
        eq(industrialProcurementAuthorizations.orderId, input.orderId),
      ),
    })) || null
  );
}

export async function prepareIndustrialProcurementAuthorization(input: {
  tenantId: number;
  orderId: string;
  actorUserId: number;
  preparationReason: unknown;
}) {
  const preparationReason = reason(input.preparationReason);
  try {
    return await db.transaction(async (tx) => {
      await lockPlan(tx, input.tenantId, input.orderId);
      const current = await loadCurrentProcurementSource(tx, input);
      const existing = await tx.query.industrialProcurementAuthorizations.findFirst({
        where: and(
          eq(industrialProcurementAuthorizations.tenantId, input.tenantId),
          eq(industrialProcurementAuthorizations.orderId, input.orderId),
        ),
      });
      if (existing) {
        if (existing.releaseHash === current.draft.releaseHash) {
          return { authorization: existing, created: false as const };
        }
        throw new IndustrialProcurementAuthorizationError(
          "industrial_procurement_authorization_stale",
          "A procurement authorization already exists for different source evidence.",
        );
      }
      const now = new Date();
      const [authorization] = await tx
        .insert(industrialProcurementAuthorizations)
        .values({
          tenantId: input.tenantId,
          orderId: current.order.id,
          customerQuoteId: current.customerQuote.id,
          supplierQuoteId: current.supplierQuote.id,
          supplierProfileId: current.draft.supplierProfileId,
          fulfillmentPlanId: current.plan.id,
          procurementServiceId: current.procurementService.id,
          referenceCode: `EXP-PROC-${current.draft.releaseHash.slice(0, 20).toUpperCase()}`,
          status: "approval_required",
          currencyCode: current.draft.currencyCode,
          supplierCostMinor: current.draft.supplierCostMinor,
          additionalCostsMinor: current.draft.additionalCostsMinor,
          totalCostMinor: current.draft.totalCostMinor,
          marginMinor: current.draft.marginMinor,
          customerPriceMinor: current.draft.customerPriceMinor,
          sourcePricingHash: current.draft.sourcePricingHash,
          sourceSupplierQuoteHash: current.draft.sourceSupplierQuoteHash,
          sourceOrderConfirmationHash:
            current.draft.sourceOrderConfirmationHash,
          sourcePaymentId: current.payment.id,
          releaseHash: current.draft.releaseHash,
          sourceSnapshot: current.draft,
          approvalChecklist: {},
          preparedReason: preparationReason,
          preparedByUserId: input.actorUserId,
          preparedAt: now,
          externalActionExecuted: false,
          supplierContacted: false,
          supplierCommitmentCreated: false,
          externalReference: null,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      await tx.insert(industrialAuditLogs).values({
        tenantId: input.tenantId,
        actorUserId: input.actorUserId,
        action: "industrial_procurement.authorization_prepared",
        entityType: "industrial_procurement_authorization",
        entityId: authorization.id,
        reason: preparationReason,
        nextValue: {
          status: authorization.status,
          orderId: authorization.orderId,
          releaseHash: authorization.releaseHash,
        },
        metadata: {
          requirementId: current.order.requirementId,
          supplierQuoteId: current.supplierQuote.id,
          sourcePaymentId: current.payment.id,
          exactMinorUnits: true,
          externalActionExecuted: false,
          supplierContacted: false,
          supplierCommitmentCreated: false,
        },
        createdAt: now,
      });
      return { authorization, created: true as const };
    });
  } catch (error) {
    translate(error);
  }
}

export async function approveIndustrialProcurementAuthorization(input: {
  tenantId: number;
  orderId: string;
  authorizationId: string;
  actorUserId: number;
  approval: unknown;
}) {
  try {
    const parsed = parseIndustrialProcurementApprovalInput(input.approval);
    return await db.transaction(async (tx) => {
      await lockPlan(tx, input.tenantId, input.orderId);
      const current = await loadCurrentProcurementSource(tx, input);
      const authorization =
        await tx.query.industrialProcurementAuthorizations.findFirst({
          where: and(
            eq(industrialProcurementAuthorizations.tenantId, input.tenantId),
            eq(industrialProcurementAuthorizations.id, input.authorizationId),
            eq(industrialProcurementAuthorizations.orderId, input.orderId),
          ),
        });
      if (!authorization) {
        throw new IndustrialProcurementAuthorizationError(
          "industrial_procurement_authorization_not_found",
          "The procurement authorization was not found.",
          404,
        );
      }
      if (
        authorization.releaseHash !== parsed.expectedReleaseHash ||
        authorization.releaseHash !== current.draft.releaseHash
      ) {
        throw new IndustrialProcurementAuthorizationError(
          "industrial_procurement_release_hash_mismatch",
          "Procurement source evidence changed; prepare a new reviewed authorization.",
        );
      }
      if (authorization.status === "approved") {
        return { authorization, approved: false as const };
      }
      if (authorization.status !== "approval_required") {
        throw new IndustrialProcurementAuthorizationError(
          "industrial_procurement_authorization_not_approvable",
          "The procurement authorization is not awaiting approval.",
        );
      }
      const now = new Date();
      const [updated] = await tx
        .update(industrialProcurementAuthorizations)
        .set({
          status: "approved",
          approvalChecklist: parsed.checklist,
          approvedReason: parsed.reason,
          approvedByUserId: input.actorUserId,
          approvedAt: now,
          externalActionExecuted: false,
          supplierContacted: false,
          supplierCommitmentCreated: false,
          externalReference: null,
          updatedAt: now,
        })
        .where(
          and(
            eq(industrialProcurementAuthorizations.id, authorization.id),
            eq(
              industrialProcurementAuthorizations.status,
              "approval_required",
            ),
            eq(
              industrialProcurementAuthorizations.releaseHash,
              parsed.expectedReleaseHash,
            ),
          ),
        )
        .returning();
      if (!updated) {
        throw new IndustrialProcurementAuthorizationError(
          "industrial_procurement_concurrent_update",
          "The procurement authorization changed while it was being approved.",
        );
      }

      if (current.procurementService.status === "approved") {
        await tx
          .update(industrialFulfillmentServices)
          .set({
            status: "in_progress",
            startedAt: current.procurementService.startedAt || now,
            updatedByUserId: input.actorUserId,
            updatedAt: now,
          })
          .where(
            and(
              eq(industrialFulfillmentServices.id, current.procurementService.id),
              eq(industrialFulfillmentServices.status, "approved"),
            ),
          );
      }
      if (current.plan.status === "release_review") {
        await tx
          .update(industrialFulfillmentPlans)
          .set({
            status: "procurement",
            startedAt: current.plan.startedAt || now,
            updatedByUserId: input.actorUserId,
            updatedAt: now,
          })
          .where(
            and(
              eq(industrialFulfillmentPlans.id, current.plan.id),
              eq(industrialFulfillmentPlans.status, "release_review"),
            ),
          );
      }
      if (current.order.status === "confirmed") {
        await tx
          .update(industrialOrders)
          .set({
            status: "procurement",
            updatedByUserId: input.actorUserId,
            updatedAt: now,
          })
          .where(
            and(
              eq(industrialOrders.id, current.order.id),
              eq(industrialOrders.status, "confirmed"),
            ),
          );
      }

      await appendEventInTransaction(tx, {
        tenantId: input.tenantId,
        planId: current.plan.id,
        orderId: current.order.id,
        idempotencyKey: `industrial-procurement-release:${updated.id}:${updated.releaseHash}`,
        eventType: "procurement_released",
        planStatus: "procurement",
        title: "Procurement workstream released",
        customerMessage:
          "Your paid order has entered Exportunity's controlled procurement workstream.",
        internalNotes: parsed.reason,
        customerVisible: true,
        evidence: [
          {
            kind: "internal_procurement_authorization",
            authorizationId: updated.id,
            referenceCode: updated.referenceCode,
            releaseHash: updated.releaseHash,
            sourcePaymentId: updated.sourcePaymentId,
            externalActionExecuted: false,
            supplierContacted: false,
            supplierCommitmentCreated: false,
          },
        ],
        source: "staff",
        actorUserId: input.actorUserId,
        occurredAt: now,
      });

      const requirement =
        await tx.query.industrialRequirements.findFirst({
          where: and(
            eq(industrialRequirements.tenantId, input.tenantId),
            eq(industrialRequirements.id, current.order.requirementId),
          ),
        });
      if (requirement) {
        const metadata = record(requirement.metadata);
        const workflow = record(metadata.internalWorkflow);
        const nextAction =
          "Reconfirm supplier terms and prepare the separately governed supplier commitment. No supplier has been contacted by this approval.";
        await tx
          .update(industrialRequirements)
          .set({
            nextAction,
            nextActionAt: now,
            metadata: {
              ...metadata,
              internalWorkflow: {
                ...workflow,
                procurementStarted: true,
                procurementAuthorizationId: updated.id,
                procurementReleaseHash: updated.releaseHash,
                supplierContacted: false,
                supplierCommitmentCreated: false,
                nextAction,
                lastReviewedAt: now.toISOString(),
                lastReviewedByUserId: input.actorUserId,
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
      }

      await tx.insert(industrialAuditLogs).values({
        tenantId: input.tenantId,
        actorUserId: input.actorUserId,
        action: "industrial_procurement.authorization_approved",
        entityType: "industrial_procurement_authorization",
        entityId: updated.id,
        reason: parsed.reason,
        previousValue: { status: authorization.status },
        nextValue: {
          status: updated.status,
          releaseHash: updated.releaseHash,
          fulfillmentStatus: "procurement",
        },
        metadata: {
          requirementId: current.order.requirementId,
          orderId: current.order.id,
          sourcePaymentId: current.payment.id,
          exactMinorUnits: true,
          externalActionExecuted: false,
          supplierContacted: false,
          supplierCommitmentCreated: false,
        },
        createdAt: now,
      });
      return { authorization: updated, approved: true as const };
    });
  } catch (error) {
    translate(error);
  }
}
