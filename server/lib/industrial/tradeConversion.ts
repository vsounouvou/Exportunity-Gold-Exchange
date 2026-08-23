import { and, eq } from "drizzle-orm";

import { db } from "@db";
import {
  industrialAuditLogs,
  industrialProductRequirements,
} from "@db/schema";
import {
  inferAfricaDestinationCountryCode,
  inferTradeSectorCode,
} from "../trade-intelligence/foundation";
import { recordTradeDemandEvent } from "../trade-intelligence/service";

export async function recordIndustrialTradeConversion(input: {
  tenantId: number;
  actorUserId?: number | null;
  eventType: "quote" | "order";
  requirement: any;
  entityId: string;
  referenceCode: string;
  estimatedValue?: string | null;
  currencyCode?: string | null;
}) {
  try {
    const productRequirement =
      await db.query.industrialProductRequirements.findFirst({
        where: and(
          eq(industrialProductRequirements.tenantId, input.tenantId),
          eq(
            industrialProductRequirements.requirementId,
            input.requirement.id,
          ),
        ),
      });
    return await recordTradeDemandEvent({
      tenantId: input.tenantId,
      eventType: input.eventType,
      sourceSurface: "industrial_commercial_pipeline",
      industrialRequirementId: input.requirement.id,
      sourceConversationId: input.requirement.sourceConversationId || null,
      queryText: input.requirement.details,
      normalizedProduct:
        productRequirement?.productName || input.requirement.title,
      productCategory:
        productRequirement?.productCategory || input.requirement.categoryCode,
      sectorCode: inferTradeSectorCode({
        categoryCode: input.requirement.categoryCode,
        requirementType: input.requirement.requirementType,
        productName:
          productRequirement?.productName || input.requirement.title,
        details: input.requirement.details,
      }),
      destinationCountryCode:
        input.requirement.deliveryCountryCode ||
        inferAfricaDestinationCountryCode(
          productRequirement?.destination || input.requirement.deliveryCity,
        ),
      destinationCity:
        productRequirement?.destination || input.requirement.deliveryCity || null,
      commercialIntent: input.requirement.commercialIntent || null,
      quantityText:
        productRequirement?.quantityText || input.requirement.quantityText || null,
      estimatedValue: input.estimatedValue || null,
      currencyCode: input.currencyCode || productRequirement?.currency || null,
      conversionStage:
        input.eventType === "quote" ? "quote_issued" : "order_confirmed",
      difficultyScore: input.eventType === "order" ? 70 : 55,
      metadata: {
        entityId: input.entityId,
        referenceCode: input.referenceCode,
        actorUserId: input.actorUserId || null,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    console.error("industrial_trade_conversion_recording_failed", {
      eventType: input.eventType,
      requirementId: input.requirement?.id,
      entityId: input.entityId,
      message,
    });
    try {
      await db.insert(industrialAuditLogs).values({
        tenantId: input.tenantId,
        actorUserId: input.actorUserId || null,
        action: "trade_intelligence.conversion_recording_failed",
        entityType: `industrial_${input.eventType}`,
        entityId: input.entityId,
        reason: message,
        metadata: {
          requirementId: input.requirement?.id || null,
          referenceCode: input.referenceCode,
        },
      });
    } catch {
      // The primary commercial operation must remain available even if its
      // secondary intelligence audit cannot be persisted.
    }
    return null;
  }
}
