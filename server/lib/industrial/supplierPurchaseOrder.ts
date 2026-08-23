import { and, eq } from "drizzle-orm";

import { db } from "@db";
import {
  industrialAuditLogs,
  industrialProcurementAuthorizations,
  industrialRequirements,
  industrialSupplierPurchaseOrderPackages,
} from "@db/schema";
import { lockPlan } from "./fulfillment";
import { loadCurrentProcurementSource } from "./procurementAuthorization";
import {
  buildIndustrialSupplierPurchaseOrderPackageDraft,
  IndustrialSupplierPurchaseOrderPolicyError,
  parseIndustrialSupplierPurchaseOrderApproval,
} from "./supplierPurchaseOrderPolicy";

type Executor = any;

export class IndustrialSupplierPurchaseOrderError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly statusCode = 409,
  ) {
    super(message);
  }
}

function translate(error: unknown): never {
  if (error instanceof IndustrialSupplierPurchaseOrderError) throw error;
  if (error instanceof IndustrialSupplierPurchaseOrderPolicyError) {
    throw new IndustrialSupplierPurchaseOrderError(
      error.code,
      error.message,
      error.statusCode,
    );
  }
  throw error;
}

function documentedReason(value: unknown, code: string, label: string) {
  const normalized = String(value || "").trim();
  if (normalized.length < 12 || normalized.length > 1200) {
    throw new IndustrialSupplierPurchaseOrderError(
      code,
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

async function loadCurrentPackageSource(
  executor: Executor,
  input: { tenantId: number; orderId: string },
) {
  const current = await loadCurrentProcurementSource(executor, input);
  const procurementAuthorization =
    await executor.query.industrialProcurementAuthorizations.findFirst({
      where: and(
        eq(industrialProcurementAuthorizations.tenantId, input.tenantId),
        eq(industrialProcurementAuthorizations.orderId, input.orderId),
      ),
    });
  if (!procurementAuthorization) {
    throw new IndustrialSupplierPurchaseOrderError(
      "industrial_supplier_po_procurement_authorization_missing",
      "The exact procurement authorization is required first.",
    );
  }
  const draft = buildIndustrialSupplierPurchaseOrderPackageDraft({
    tenantId: input.tenantId,
    procurementAuthorization,
    procurementDraft: current.draft,
    order: current.order,
    supplierQuote: current.supplierQuote,
    supplierProfile: current.supplierProfile,
    fulfillmentPlan: current.plan,
    procurementService: current.procurementService,
  });
  return { ...current, procurementAuthorization, packageDraft: draft };
}

export function staffIndustrialSupplierPurchaseOrderPackageSummary(row: any) {
  if (!row) return null;
  return {
    id: row.id,
    orderId: row.orderId,
    procurementAuthorizationId: row.procurementAuthorizationId,
    referenceCode: row.referenceCode,
    status: row.status,
    supplierQuoteId: row.supplierQuoteId,
    supplierProfileId: row.supplierProfileId,
    currencyCode: row.currencyCode,
    supplierTotalMinor: String(row.supplierTotalMinor),
    productName: row.productName,
    specification: row.specification,
    offeredQuantity: row.offeredQuantity,
    unitOfMeasure: row.unitOfMeasure,
    unitPriceText: row.unitPriceText,
    packaging: row.packaging,
    leadTime: row.leadTime,
    incoterm: row.incoterm,
    paymentTerms: row.paymentTerms,
    destination: row.destination,
    countryOfOrigin: row.countryOfOrigin,
    warranty: row.warranty,
    supplierQuoteReference: row.supplierQuoteReference,
    supplierQuoteValidUntil: row.supplierQuoteValidUntil,
    lineItems: Array.isArray(row.lineItems) ? row.lineItems : [],
    sourcePricingHash: row.sourcePricingHash,
    sourceSupplierQuoteHash: row.sourceSupplierQuoteHash,
    sourceOrderConfirmationHash: row.sourceOrderConfirmationHash,
    procurementReleaseHash: row.procurementReleaseHash,
    packageHash: row.packageHash,
    sourceSnapshot: record(row.sourceSnapshot),
    approvalChecklist: record(row.approvalChecklist),
    preparedReason: row.preparedReason,
    preparedAt: row.preparedAt,
    approvedReason: row.approvedReason,
    approvedAt: row.approvedAt,
    externalActionExecuted: false,
    transmittedToSupplier: false,
    supplierAccepted: false,
    externalPurchaseOrderReference: null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function loadIndustrialSupplierPurchaseOrderPackage(input: {
  tenantId: number;
  orderId: string;
}) {
  return (
    (await db.query.industrialSupplierPurchaseOrderPackages.findFirst({
      where: and(
        eq(industrialSupplierPurchaseOrderPackages.tenantId, input.tenantId),
        eq(industrialSupplierPurchaseOrderPackages.orderId, input.orderId),
      ),
    })) || null
  );
}

export async function prepareIndustrialSupplierPurchaseOrderPackage(input: {
  tenantId: number;
  orderId: string;
  actorUserId: number;
  preparationReason: unknown;
}) {
  const preparationReason = documentedReason(
    input.preparationReason,
    "industrial_supplier_po_preparation_reason_required",
    "a purchase-order package preparation reason",
  );
  try {
    return await db.transaction(async (tx) => {
      await lockPlan(tx, input.tenantId, input.orderId);
      const current = await loadCurrentPackageSource(tx, input);
      const existing =
        await tx.query.industrialSupplierPurchaseOrderPackages.findFirst({
          where: and(
            eq(
              industrialSupplierPurchaseOrderPackages.tenantId,
              input.tenantId,
            ),
            eq(
              industrialSupplierPurchaseOrderPackages.orderId,
              input.orderId,
            ),
          ),
        });
      if (existing) {
        if (existing.packageHash === current.packageDraft.packageHash) {
          return { package: existing, created: false as const };
        }
        throw new IndustrialSupplierPurchaseOrderError(
          "industrial_supplier_po_package_stale",
          "A purchase-order package already exists for different source evidence.",
        );
      }
      const now = new Date();
      const draft = current.packageDraft;
      const [created] = await tx
        .insert(industrialSupplierPurchaseOrderPackages)
        .values({
          tenantId: input.tenantId,
          orderId: current.order.id,
          procurementAuthorizationId: current.procurementAuthorization.id,
          customerQuoteId: current.customerQuote.id,
          supplierQuoteId: current.supplierQuote.id,
          supplierProfileId: current.supplierProfile.id,
          fulfillmentPlanId: current.plan.id,
          procurementServiceId: current.procurementService.id,
          sourcePaymentId: current.payment.id,
          referenceCode: `EXP-SPO-${draft.packageHash.slice(0, 20).toUpperCase()}`,
          status: "approval_required",
          currencyCode: draft.currencyCode,
          supplierTotalMinor: draft.supplierTotalMinor,
          productName: draft.productName,
          specification: draft.specification,
          offeredQuantity: draft.offeredQuantity,
          unitOfMeasure: draft.unitOfMeasure,
          unitPriceText: draft.unitPriceText,
          packaging: draft.packaging,
          leadTime: draft.leadTime,
          incoterm: draft.incoterm,
          paymentTerms: draft.paymentTerms,
          destination: draft.destination,
          countryOfOrigin: draft.countryOfOrigin,
          warranty: draft.warranty,
          supplierQuoteReference: draft.supplierQuoteReference,
          supplierQuoteValidUntil: new Date(draft.supplierQuoteValidUntil),
          lineItems: draft.lineItems,
          sourcePricingHash: draft.sourcePricingHash,
          sourceSupplierQuoteHash: draft.sourceSupplierQuoteHash,
          sourceOrderConfirmationHash: draft.sourceOrderConfirmationHash,
          procurementReleaseHash: draft.procurementReleaseHash,
          packageHash: draft.packageHash,
          sourceSnapshot: draft,
          approvalChecklist: {},
          preparedReason: preparationReason,
          preparedByUserId: input.actorUserId,
          preparedAt: now,
          externalActionExecuted: false,
          transmittedToSupplier: false,
          supplierAccepted: false,
          externalPurchaseOrderReference: null,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      await tx.insert(industrialAuditLogs).values({
        tenantId: input.tenantId,
        actorUserId: input.actorUserId,
        action: "industrial_supplier_purchase_order.package_prepared",
        entityType: "industrial_supplier_purchase_order_package",
        entityId: created.id,
        reason: preparationReason,
        nextValue: {
          status: created.status,
          orderId: created.orderId,
          packageHash: created.packageHash,
        },
        metadata: {
          requirementId: current.order.requirementId,
          procurementAuthorizationId: current.procurementAuthorization.id,
          supplierQuoteId: current.supplierQuote.id,
          exactMinorUnits: true,
          externalActionExecuted: false,
          transmittedToSupplier: false,
          supplierAccepted: false,
        },
        createdAt: now,
      });
      return { package: created, created: true as const };
    });
  } catch (error) {
    translate(error);
  }
}

export async function approveIndustrialSupplierPurchaseOrderPackage(input: {
  tenantId: number;
  orderId: string;
  packageId: string;
  actorUserId: number;
  approval: unknown;
}) {
  try {
    const parsed = parseIndustrialSupplierPurchaseOrderApproval(input.approval);
    return await db.transaction(async (tx) => {
      await lockPlan(tx, input.tenantId, input.orderId);
      const current = await loadCurrentPackageSource(tx, input);
      const purchaseOrderPackage =
        await tx.query.industrialSupplierPurchaseOrderPackages.findFirst({
          where: and(
            eq(
              industrialSupplierPurchaseOrderPackages.tenantId,
              input.tenantId,
            ),
            eq(industrialSupplierPurchaseOrderPackages.id, input.packageId),
            eq(
              industrialSupplierPurchaseOrderPackages.orderId,
              input.orderId,
            ),
          ),
        });
      if (!purchaseOrderPackage) {
        throw new IndustrialSupplierPurchaseOrderError(
          "industrial_supplier_po_package_not_found",
          "The supplier purchase-order package was not found.",
          404,
        );
      }
      if (
        purchaseOrderPackage.packageHash !== parsed.expectedPackageHash ||
        purchaseOrderPackage.packageHash !== current.packageDraft.packageHash
      ) {
        throw new IndustrialSupplierPurchaseOrderError(
          "industrial_supplier_po_package_hash_mismatch",
          "The supplier, price, terms, or procurement evidence changed; prepare a newly reviewed package.",
        );
      }
      if (purchaseOrderPackage.status === "approved_for_submission") {
        return { package: purchaseOrderPackage, approved: false as const };
      }
      if (purchaseOrderPackage.status !== "approval_required") {
        throw new IndustrialSupplierPurchaseOrderError(
          "industrial_supplier_po_package_not_approvable",
          "The supplier purchase-order package is not awaiting approval.",
        );
      }
      const now = new Date();
      const [updated] = await tx
        .update(industrialSupplierPurchaseOrderPackages)
        .set({
          status: "approved_for_submission",
          approvalChecklist: parsed.checklist,
          approvedReason: parsed.reason,
          approvedByUserId: input.actorUserId,
          approvedAt: now,
          externalActionExecuted: false,
          transmittedToSupplier: false,
          supplierAccepted: false,
          externalPurchaseOrderReference: null,
          updatedAt: now,
        })
        .where(
          and(
            eq(industrialSupplierPurchaseOrderPackages.id, input.packageId),
            eq(
              industrialSupplierPurchaseOrderPackages.status,
              "approval_required",
            ),
            eq(
              industrialSupplierPurchaseOrderPackages.packageHash,
              parsed.expectedPackageHash,
            ),
          ),
        )
        .returning();
      if (!updated) {
        throw new IndustrialSupplierPurchaseOrderError(
          "industrial_supplier_po_concurrent_update",
          "The supplier purchase-order package changed during approval.",
        );
      }

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
          "Select a separately governed supplier submission channel and request action-time approval. The internal package has not been sent.";
        await tx
          .update(industrialRequirements)
          .set({
            nextAction,
            nextActionAt: now,
            metadata: {
              ...metadata,
              internalWorkflow: {
                ...workflow,
                supplierPurchaseOrderPackageId: updated.id,
                supplierPurchaseOrderPackageHash: updated.packageHash,
                supplierPurchaseOrderPackageApproved: true,
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
        action: "industrial_supplier_purchase_order.package_approved",
        entityType: "industrial_supplier_purchase_order_package",
        entityId: updated.id,
        reason: parsed.reason,
        previousValue: { status: purchaseOrderPackage.status },
        nextValue: {
          status: updated.status,
          packageHash: updated.packageHash,
        },
        metadata: {
          requirementId: current.order.requirementId,
          orderId: current.order.id,
          procurementAuthorizationId: current.procurementAuthorization.id,
          exactMinorUnits: true,
          externalActionExecuted: false,
          transmittedToSupplier: false,
          supplierAccepted: false,
        },
        createdAt: now,
      });
      return { package: updated, approved: true as const };
    });
  } catch (error) {
    translate(error);
  }
}
