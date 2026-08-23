import { db } from "@db";
import {
  industrialAuditLogs,
  industrialProductRequirements,
} from "@db/schema";

import type { CommercialIntentResult } from "../commercialIntentEngine";
import { projectCanonicalProductRequirement } from "./productRequirementPolicy";

export type CanonicalProductRequirementSyncResult = {
  id: string;
  requirementId: string;
  sourceMessageId: number | null;
  intent: string;
  suggestedAction: string;
  productName: string | null;
  productCategory: string | null;
  quantity: string | null;
  unit: string | null;
  destination: string | null;
  updatedAt: Date;
};

export async function syncCanonicalProductRequirement(input: {
  tenantId: number;
  requirementId: string;
  requirementReferenceCode?: string | null;
  sourceChatLeadId?: string | null;
  sourceMessageId?: number | null;
  commercial: CommercialIntentResult;
}): Promise<CanonicalProductRequirementSyncResult> {
  const projection = projectCanonicalProductRequirement({
    commercial: input.commercial,
    sourceMessageId: input.sourceMessageId,
    sourceChatLeadId: input.sourceChatLeadId,
    requirementReferenceCode: input.requirementReferenceCode,
  });
  const now = new Date();

  return db.transaction(async (tx) => {
    const [productRequirement] = await tx
      .insert(industrialProductRequirements)
      .values({
        tenantId: input.tenantId,
        requirementId: input.requirementId,
        ...projection,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: industrialProductRequirements.requirementId,
        set: {
          sourceMessageId: projection.sourceMessageId,
          intent: projection.intent,
          intentConfidence: projection.intentConfidence,
          suggestedAction: projection.suggestedAction,
          productName: projection.productName,
          productCategory: projection.productCategory,
          specification: projection.specification,
          quantity: projection.quantity,
          quantityText: projection.quantityText,
          unit: projection.unit,
          origin: projection.origin,
          destination: projection.destination,
          targetPrice: projection.targetPrice,
          currency: projection.currency,
          deadlineText: projection.deadlineText,
          frequency: projection.frequency,
          incoterm: projection.incoterm,
          customerType: projection.customerType,
          missingFields: projection.missingFields,
          metadata: projection.metadata,
          updatedAt: now,
        },
      })
      .returning({
        id: industrialProductRequirements.id,
        requirementId: industrialProductRequirements.requirementId,
        sourceMessageId: industrialProductRequirements.sourceMessageId,
        intent: industrialProductRequirements.intent,
        suggestedAction: industrialProductRequirements.suggestedAction,
        productName: industrialProductRequirements.productName,
        productCategory: industrialProductRequirements.productCategory,
        quantity: industrialProductRequirements.quantity,
        unit: industrialProductRequirements.unit,
        destination: industrialProductRequirements.destination,
        updatedAt: industrialProductRequirements.updatedAt,
      });

    await tx.insert(industrialAuditLogs).values({
      tenantId: input.tenantId,
      action: "industrial_product_requirement.synced",
      entityType: "industrial_product_requirement",
      entityId: productRequirement.id,
      nextValue: {
        requirementId: input.requirementId,
        intent: projection.intent,
        suggestedAction: projection.suggestedAction,
        productName: projection.productName,
        productCategory: projection.productCategory,
        quantity: projection.quantity,
        unit: projection.unit,
        destination: projection.destination,
        missingFields: projection.missingFields,
      },
      metadata: {
        source: "exportunity_talk",
        sourceChatLeadId: projection.metadata.sourceChatLeadId,
        sourceMessageId: projection.sourceMessageId,
        requirementReferenceCode:
          projection.metadata.requirementReferenceCode,
        outboundActionCreated: false,
        quoteCreated: false,
      },
      createdAt: now,
    });

    return productRequirement;
  });
}
