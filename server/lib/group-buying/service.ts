import { randomUUID } from "node:crypto";

import { db } from "@db";
import {
  carrierBookingAuthorizations,
  geoTerritories,
  groupBuyingCampaigns,
  groupBuyingCommitments,
  groupBuyingEvents,
  groupBuyingPriceTiers,
  groupBuyingUpdates,
  groupSettlementAllocations,
  groupSettlementPlans,
  industrialAuditLogs,
  industrialCatalogItems,
  industrialFactories,
  industrialOrders,
  industrialSupplierProfiles,
  mediaRightsGrants,
  payments,
  productionBatchAllocations,
  productionBatches,
  sourceContentReferences,
} from "@db/schema";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";

import {
  completeRunFailure,
  completeRunSuccess,
  createActionRun,
} from "../actions/actionRuns";
import {
  assertCommerceOnlyLanguage,
  evaluateBuyingInterest,
  evaluateCampaignTransition,
  evaluateGroupCampaignReadiness,
  evaluatePaidOrderBinding,
  evaluatePriceTiers,
  evaluateProductionBatchTransition,
  evaluateSettlementPlan,
  exactMinorAmount,
  GROUP_BUYING_CAMPAIGN_STATUSES,
  GROUP_SETTLEMENT_ROLES,
  type GroupBuyingCampaignStatus,
  type GroupBuyingPriceTierSnapshot,
  type GroupSettlementAllocationInput,
  type ProductionBatchStatus,
  sanitizeGroupBuyingEvidence,
} from "./policy";

type JsonRecord = Record<string, unknown>;
type Executor = any;

const CAMPAIGN_TYPES = [
  "preorder",
  "group_order",
  "buyer_club",
  "production_batch",
  "recurring_procurement",
] as const;

export class GroupBuyingError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode = 409,
    public readonly blockers: string[] = [],
  ) {
    super(message);
    this.name = "GroupBuyingError";
  }
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function requiredText(value: unknown, field: string, max = 240) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new GroupBuyingError("group_buying_field_required", `${field} is required`, 400);
  if (normalized.length > max) throw new GroupBuyingError("group_buying_field_too_long", `${field} exceeds ${max} characters`, 400);
  return normalized;
}

function optionalText(value: unknown, max = 240) {
  const normalized = String(value || "").trim();
  return normalized ? normalized.slice(0, max) : null;
}

function requireUuid(value: unknown, field: string) {
  const normalized = requiredText(value, field, 80).toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(normalized)) {
    throw new GroupBuyingError("group_buying_uuid_invalid", `${field} must be a UUID`, 400);
  }
  return normalized;
}

function requirePositiveId(value: unknown, field: string) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new GroupBuyingError("group_buying_identifier_invalid", `${field} must be a positive integer`, 400);
  }
  return parsed;
}

function currencyCode(value: unknown) {
  const normalized = String(value || "").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) {
    throw new GroupBuyingError("group_buying_currency_invalid", "currencyCode must contain three letters", 400);
  }
  return normalized;
}

function nonNegativeMinor(value: unknown, field: string) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new GroupBuyingError("group_buying_amount_invalid", `${field} must be a non-negative integer in minor units`, 400);
  }
  return parsed;
}

function positiveQuantity(value: unknown, field: string) {
  const normalized = String(value ?? "").trim();
  if (!/^\d+(?:\.\d{1,4})?$/.test(normalized)) {
    throw new GroupBuyingError("group_buying_quantity_invalid", `${field} must be positive with at most four decimals`, 400);
  }
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 1_000_000_000) {
    throw new GroupBuyingError("group_buying_quantity_invalid", `${field} is outside the supported range`, 400);
  }
  return normalized;
}

function nonNegativeQuantity(value: unknown, field: string) {
  const normalized = String(value ?? "").trim();
  if (!/^\d+(?:\.\d{1,4})?$/.test(normalized)) {
    throw new GroupBuyingError("group_buying_quantity_invalid", `${field} must be non-negative with at most four decimals`, 400);
  }
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1_000_000_000) {
    throw new GroupBuyingError("group_buying_quantity_invalid", `${field} is outside the supported range`, 400);
  }
  return normalized;
}

function quantityUnits(value: unknown, field = "quantity") {
  const parsed = Number(value);
  const units = Math.round(parsed * 10_000);
  if (!Number.isSafeInteger(units) || units < 0 || Math.abs(parsed * 10_000 - units) > 0.000_001) {
    throw new GroupBuyingError("group_buying_quantity_invalid", `${field} must use at most four decimal places`, 400);
  }
  return units;
}

function quantityFromUnits(units: number) {
  return (units / 10_000).toFixed(4);
}

function dateValue(value: unknown, field: string) {
  const parsed = value instanceof Date ? value : new Date(String(value || ""));
  if (!Number.isFinite(parsed.getTime())) {
    throw new GroupBuyingError("group_buying_date_invalid", `${field} must be a valid date`, 400);
  }
  return parsed;
}

function idempotencyKey(value: unknown) {
  const key = requiredText(value, "idempotencyKey", 180);
  if (key.length < 8) throw new GroupBuyingError("group_buying_idempotency_short", "idempotencyKey must contain at least eight characters", 400);
  return key;
}

function slug(value: unknown) {
  const normalized = requiredText(value, "slug", 120)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (normalized.length < 3) throw new GroupBuyingError("group_buying_slug_invalid", "slug must contain at least three URL-safe characters", 400);
  return normalized;
}

function safeEvidenceArray(value: unknown, field: string) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 50).map((item, index) => {
    try {
      return sanitizeGroupBuyingEvidence(item);
    } catch (error: any) {
      throw new GroupBuyingError("group_buying_evidence_invalid", `${field}[${index}]: ${error.message}`, 400);
    }
  });
}

function safeDeliveryOptions(value: unknown) {
  if (!Array.isArray(value) || !value.length) {
    throw new GroupBuyingError("group_buying_delivery_option_required", "At least one delivery option is required", 400);
  }
  const options = value.slice(0, 20).map((item, index) => {
    const option = sanitizeGroupBuyingEvidence(item);
    const id = requiredText(option.id, `deliveryOptions[${index}].id`, 80);
    const label = requiredText(option.label, `deliveryOptions[${index}].label`, 160);
    return { ...option, id, label };
  });
  if (new Set(options.map((option) => option.id)).size !== options.length) {
    throw new GroupBuyingError("group_buying_delivery_option_duplicate", "Delivery option IDs must be unique", 400);
  }
  return options;
}

function campaignType(value: unknown) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!CAMPAIGN_TYPES.includes(normalized as (typeof CAMPAIGN_TYPES)[number])) {
    throw new GroupBuyingError("group_buying_campaign_type_invalid", "Unsupported group-buying campaign type", 400);
  }
  return normalized as (typeof CAMPAIGN_TYPES)[number];
}

async function governedAction<T>(input: {
  tenantId: number;
  actorUserId: number | null;
  actionKey: string;
  correlationId: string;
  payload: JsonRecord;
  work: (actionRunId: number) => Promise<T>;
  evidence: (result: T) => Array<{ evidenceType: string; payload: JsonRecord }>;
}) {
  const run = await createActionRun({
    tenantId: input.tenantId,
    actionKey: input.actionKey,
    requestedByUserId: input.actorUserId,
    correlationId: input.correlationId,
    payload: input.payload,
  });
  try {
    const result = await input.work(run.id);
    await completeRunSuccess({
      tenantId: input.tenantId,
      runId: run.id,
      enforceEvidence: true,
      result: {
        actionKey: input.actionKey,
        externalPaymentCollectionExecuted: false,
        externalProviderActionExecuted: false,
        externalSettlementExecuted: false,
      },
      evidence: input.evidence(result),
    });
    return { result, actionRunId: run.id };
  } catch (error: any) {
    await completeRunFailure({
      tenantId: input.tenantId,
      runId: run.id,
      error: String(error?.message || error),
    });
    throw error;
  }
}

async function advisoryLock(executor: Executor, tenantId: number, key: string) {
  await executor.execute(sql`select pg_advisory_xact_lock(${tenantId}, hashtext(${key}))`);
}

async function appendCampaignEvent(
  executor: Executor,
  input: {
    tenantId: number;
    campaignId: string;
    idempotencyKey: string;
    eventType: string;
    actorUserId: number | null;
    previousStatus?: GroupBuyingCampaignStatus | null;
    nextStatus?: GroupBuyingCampaignStatus | null;
    publicMessage?: string | null;
    internalNote?: string | null;
    evidence?: JsonRecord[];
    metadata?: JsonRecord;
  },
) {
  const existing = await executor.query.groupBuyingEvents.findFirst({
    where: and(
      eq(groupBuyingEvents.tenantId, input.tenantId),
      eq(groupBuyingEvents.idempotencyKey, input.idempotencyKey),
    ),
  });
  if (existing) return existing;
  const sequenceResult = await executor.execute(sql`
    select coalesce(max(sequence), 0)::integer as sequence
    from group_buying_events
    where tenant_id = ${input.tenantId} and campaign_id = ${input.campaignId}
  `);
  const row = Array.isArray((sequenceResult as any)?.rows)
    ? (sequenceResult as any).rows[0]
    : null;
  const sequence = Number(row?.sequence || 0) + 1;
  const [event] = await executor
    .insert(groupBuyingEvents)
    .values({
      tenantId: input.tenantId,
      campaignId: input.campaignId,
      sequence,
      idempotencyKey: input.idempotencyKey,
      eventType: input.eventType,
      previousStatus: input.previousStatus || null,
      nextStatus: input.nextStatus || null,
      actorUserId: input.actorUserId,
      publicMessage: input.publicMessage || null,
      internalNote: input.internalNote || null,
      evidence: input.evidence || [],
      metadata: input.metadata || {},
      occurredAt: new Date(),
      createdAt: new Date(),
    })
    .returning();
  return event;
}

async function loadCampaignDependencies(executor: Executor, campaign: typeof groupBuyingCampaigns.$inferSelect) {
  const [catalog, factory, supplier, territory, tiers, sourceReference, rightsGrant] = await Promise.all([
    executor.query.industrialCatalogItems.findFirst({
      where: and(
        eq(industrialCatalogItems.tenantId, campaign.tenantId),
        eq(industrialCatalogItems.id, campaign.catalogItemId),
      ),
    }),
    executor.query.industrialFactories.findFirst({
      where: and(
        eq(industrialFactories.tenantId, campaign.tenantId),
        eq(industrialFactories.id, campaign.producerFactoryId),
      ),
    }),
    campaign.supplierProfileId
      ? executor.query.industrialSupplierProfiles.findFirst({
          where: and(
            eq(industrialSupplierProfiles.tenantId, campaign.tenantId),
            eq(industrialSupplierProfiles.id, campaign.supplierProfileId),
          ),
        })
      : Promise.resolve(null),
    executor.query.geoTerritories.findFirst({
      where: and(
        eq(geoTerritories.tenantId, campaign.tenantId),
        eq(geoTerritories.id, campaign.territoryId),
      ),
    }),
    executor.query.groupBuyingPriceTiers.findMany({
      where: and(
        eq(groupBuyingPriceTiers.tenantId, campaign.tenantId),
        eq(groupBuyingPriceTiers.campaignId, campaign.id),
      ),
      orderBy: [asc(groupBuyingPriceTiers.minimumQuantity)],
    }),
    campaign.campaignMediaItemId
      ? executor.query.sourceContentReferences.findFirst({
          where: and(
            eq(sourceContentReferences.tenantId, campaign.tenantId),
            eq(sourceContentReferences.mediaItemId, campaign.campaignMediaItemId),
          ),
        })
      : Promise.resolve(null),
    campaign.mediaRightsGrantId
      ? executor.query.mediaRightsGrants.findFirst({
          where: and(
            eq(mediaRightsGrants.tenantId, campaign.tenantId),
            eq(mediaRightsGrants.id, campaign.mediaRightsGrantId),
          ),
        })
      : Promise.resolve(null),
  ]);
  return { catalog, factory, supplier, territory, tiers, sourceReference, rightsGrant };
}

function readinessInput(
  campaign: typeof groupBuyingCampaigns.$inferSelect,
  dependencies: Awaited<ReturnType<typeof loadCampaignDependencies>>,
  humanConfirmed: boolean,
) {
  return {
    tenantId: campaign.tenantId,
    campaign: {
      ...campaign,
      baseUnitPriceMinor: Number(campaign.baseUnitPriceMinor),
    },
    catalog: dependencies.catalog,
    factory: dependencies.factory,
    supplier: dependencies.supplier,
    territory: dependencies.territory,
    tiers: dependencies.tiers.map((tier: typeof groupBuyingPriceTiers.$inferSelect) => ({
      ...tier,
      unitPriceMinor: Number(tier.unitPriceMinor),
    })),
    sourceReference: dependencies.sourceReference
      ? {
          ...dependencies.sourceReference,
          mediaItemId: dependencies.sourceReference.mediaItemId,
        }
      : null,
    rightsGrant: dependencies.rightsGrant,
    humanConfirmed,
  };
}

export async function listPublicGroupBuyingCampaigns(input: {
  tenantId: number;
  territoryId?: number | null;
  limit?: number;
}) {
  const limit = Math.max(1, Math.min(100, Number(input.limit || 50)));
  const publicStatuses: GroupBuyingCampaignStatus[] = [
    "live",
    "threshold_pending",
    "moq_reached",
    "payment_confirmed",
    "production",
    "ready_for_pickup",
    "in_transit",
    "delivered",
    "settled",
    "refunding",
    "refunded",
  ];
  const where = input.territoryId
    ? and(
        eq(groupBuyingCampaigns.tenantId, input.tenantId),
        eq(groupBuyingCampaigns.territoryId, input.territoryId),
        inArray(groupBuyingCampaigns.status, publicStatuses),
      )
    : and(
        eq(groupBuyingCampaigns.tenantId, input.tenantId),
        inArray(groupBuyingCampaigns.status, publicStatuses),
      );
  const rows = await db
    .select({
      campaign: groupBuyingCampaigns,
      catalogName: industrialCatalogItems.name,
      catalogDescription: industrialCatalogItems.publicDescription,
      factoryName: industrialFactories.displayName,
      factoryCountryCode: industrialFactories.countryCode,
      territoryName: geoTerritories.name,
      territoryCountryCode: geoTerritories.countryCode,
    })
    .from(groupBuyingCampaigns)
    .innerJoin(industrialCatalogItems, eq(industrialCatalogItems.id, groupBuyingCampaigns.catalogItemId))
    .innerJoin(industrialFactories, eq(industrialFactories.id, groupBuyingCampaigns.producerFactoryId))
    .innerJoin(geoTerritories, eq(geoTerritories.id, groupBuyingCampaigns.territoryId))
    .where(where)
    .orderBy(desc(groupBuyingCampaigns.liveAt), asc(groupBuyingCampaigns.deadline))
    .limit(limit);
  const campaignIds = rows.map((row) => row.campaign.id);
  const tiers = campaignIds.length
    ? await db.query.groupBuyingPriceTiers.findMany({
        where: and(
          eq(groupBuyingPriceTiers.tenantId, input.tenantId),
          inArray(groupBuyingPriceTiers.campaignId, campaignIds),
          inArray(groupBuyingPriceTiers.status, ["verified", "active"]),
        ),
        orderBy: [asc(groupBuyingPriceTiers.minimumQuantity)],
      })
    : [];
  return rows.map((row) => ({
    ...row,
    campaign: {
      ...row.campaign,
      externalPaymentCollectionExecuted: undefined,
      externalSettlementExecuted: undefined,
      metadata: undefined,
      verificationEvidence: undefined,
    },
    tiers: tiers.filter((tier) => tier.campaignId === row.campaign.id),
    commerceDisclosure:
      "This is a product preorder or group purchase, not an investment, security, equity interest, or guaranteed return.",
  }));
}

export async function getPublicGroupBuyingCampaign(input: {
  tenantId: number;
  slug: string;
}) {
  const campaigns = await listPublicGroupBuyingCampaigns({ tenantId: input.tenantId, limit: 100 });
  const campaign = campaigns.find((row) => row.campaign.slug === input.slug);
  if (!campaign) throw new GroupBuyingError("group_buying_campaign_not_found", "Group-buying campaign not found", 404);
  const [updates, events] = await Promise.all([
    db.query.groupBuyingUpdates.findMany({
      where: and(
        eq(groupBuyingUpdates.tenantId, input.tenantId),
        eq(groupBuyingUpdates.campaignId, campaign.campaign.id),
        eq(groupBuyingUpdates.status, "published"),
      ),
      orderBy: [desc(groupBuyingUpdates.publishedAt)],
      limit: 100,
    }),
    db.query.groupBuyingEvents.findMany({
      where: and(
        eq(groupBuyingEvents.tenantId, input.tenantId),
        eq(groupBuyingEvents.campaignId, campaign.campaign.id),
      ),
      orderBy: [desc(groupBuyingEvents.sequence)],
      limit: 100,
    }),
  ]);
  return {
    ...campaign,
    updates: updates.map(({ internalNote: _internalNote, ...update }: any) => update),
    timeline: events
      .filter((event) => Boolean(event.publicMessage))
      .map((event) => ({
        id: event.id,
        sequence: event.sequence,
        eventType: event.eventType,
        previousStatus: event.previousStatus,
        nextStatus: event.nextStatus,
        publicMessage: event.publicMessage,
        occurredAt: event.occurredAt,
      })),
  };
}

export async function listGroupBuyingAdministration(tenantId: number) {
  const [campaigns, tiers, commitments, updates, batches, allocations, settlements, settlementAllocations] =
    await Promise.all([
      db.query.groupBuyingCampaigns.findMany({ where: eq(groupBuyingCampaigns.tenantId, tenantId), orderBy: [desc(groupBuyingCampaigns.updatedAt)], limit: 200 }),
      db.query.groupBuyingPriceTiers.findMany({ where: eq(groupBuyingPriceTiers.tenantId, tenantId), orderBy: [asc(groupBuyingPriceTiers.minimumQuantity)], limit: 500 }),
      db.query.groupBuyingCommitments.findMany({ where: eq(groupBuyingCommitments.tenantId, tenantId), orderBy: [desc(groupBuyingCommitments.createdAt)], limit: 1000 }),
      db.query.groupBuyingUpdates.findMany({ where: eq(groupBuyingUpdates.tenantId, tenantId), orderBy: [desc(groupBuyingUpdates.createdAt)], limit: 500 }),
      db.query.productionBatches.findMany({ where: eq(productionBatches.tenantId, tenantId), orderBy: [desc(productionBatches.updatedAt)], limit: 200 }),
      db.query.productionBatchAllocations.findMany({ where: eq(productionBatchAllocations.tenantId, tenantId), orderBy: [desc(productionBatchAllocations.createdAt)], limit: 1000 }),
      db.query.groupSettlementPlans.findMany({ where: eq(groupSettlementPlans.tenantId, tenantId), orderBy: [desc(groupSettlementPlans.updatedAt)], limit: 200 }),
      db.query.groupSettlementAllocations.findMany({ where: eq(groupSettlementAllocations.tenantId, tenantId), orderBy: [desc(groupSettlementAllocations.createdAt)], limit: 1000 }),
    ]);
  return {
    campaigns,
    tiers,
    commitments,
    updates,
    productionBatches: batches,
    productionBatchAllocations: allocations,
    settlementPlans: settlements,
    settlementAllocations,
    providerExecutionEnabled: false,
    investmentRailEnabled: false,
  };
}

export async function prepareGroupBuyingCampaign(input: {
  tenantId: number;
  actorUserId: number | null;
  referenceCode: unknown;
  slug: unknown;
  campaignType: unknown;
  catalogItemId: unknown;
  producerFactoryId: unknown;
  supplierProfileId?: unknown;
  territoryId: unknown;
  campaignMediaItemId?: unknown;
  mediaRightsGrantId?: unknown;
  title: unknown;
  publicSummary: unknown;
  unitOfMeasure: unknown;
  minimumQuantity: unknown;
  currencyCode: unknown;
  baseUnitPriceMinor: unknown;
  deadline: unknown;
  productionLeadTimeDays: unknown;
  estimatedReadyAt?: unknown;
  deliveryOptions: unknown;
  paymentTerms: unknown;
  refundConditions: unknown;
  capacityEvidence: unknown;
  campaignContent?: unknown;
  tiers: unknown;
  confirmed: boolean;
}) {
  if (!input.actorUserId) throw new GroupBuyingError("group_buying_actor_required", "An accountable tenant administrator is required", 403);
  if (!input.confirmed) throw new GroupBuyingError("group_buying_preparation_confirmation_required", "Campaign preparation confirmation is required", 400);
  const referenceCode = requiredText(input.referenceCode, "referenceCode", 80);
  const campaignSlug = slug(input.slug);
  const existing = await db.query.groupBuyingCampaigns.findFirst({
    where: and(
      eq(groupBuyingCampaigns.tenantId, input.tenantId),
      eq(groupBuyingCampaigns.referenceCode, referenceCode),
    ),
  });
  if (existing) return { campaign: existing, idempotentReplay: true, externalPaymentCollectionExecuted: false };

  const type = campaignType(input.campaignType);
  const catalogItemId = requireUuid(input.catalogItemId, "catalogItemId");
  const producerFactoryId = requireUuid(input.producerFactoryId, "producerFactoryId");
  const supplierProfileId = input.supplierProfileId
    ? requireUuid(input.supplierProfileId, "supplierProfileId")
    : null;
  const territoryId = requirePositiveId(input.territoryId, "territoryId");
  const campaignMediaItemId = optionalText(input.campaignMediaItemId, 240);
  const mediaRightsGrantId = input.mediaRightsGrantId
    ? requirePositiveId(input.mediaRightsGrantId, "mediaRightsGrantId")
    : null;
  if (Boolean(campaignMediaItemId) !== Boolean(mediaRightsGrantId)) {
    throw new GroupBuyingError("group_buying_media_rights_pair_required", "Campaign media and its rights grant must be supplied together", 400);
  }
  const title = requiredText(input.title, "title", 180);
  const publicSummary = requiredText(input.publicSummary, "publicSummary", 3000);
  const unitOfMeasure = requiredText(input.unitOfMeasure, "unitOfMeasure", 80);
  const minimumQuantity = positiveQuantity(input.minimumQuantity, "minimumQuantity");
  const currency = currencyCode(input.currencyCode);
  const baseUnitPriceMinor = nonNegativeMinor(input.baseUnitPriceMinor, "baseUnitPriceMinor");
  const deadline = dateValue(input.deadline, "deadline");
  const leadTime = Number(input.productionLeadTimeDays);
  if (!Number.isSafeInteger(leadTime) || leadTime < 0 || leadTime > 3650) {
    throw new GroupBuyingError("group_buying_lead_time_invalid", "productionLeadTimeDays must be between 0 and 3650", 400);
  }
  const estimatedReadyAt = input.estimatedReadyAt
    ? dateValue(input.estimatedReadyAt, "estimatedReadyAt")
    : null;
  const deliveryOptions = safeDeliveryOptions(input.deliveryOptions);
  const paymentTerms = requiredText(input.paymentTerms, "paymentTerms", 4000);
  const refundConditions = requiredText(input.refundConditions, "refundConditions", 4000);
  const capacityEvidence = sanitizeGroupBuyingEvidence(input.capacityEvidence);
  const campaignContent = sanitizeGroupBuyingEvidence(input.campaignContent);
  assertCommerceOnlyLanguage({ title, publicSummary, paymentTerms, refundConditions, campaignContent });

  if (!Array.isArray(input.tiers) || !input.tiers.length || input.tiers.length > 30) {
    throw new GroupBuyingError("group_buying_tiers_required", "One to thirty verified price tiers are required", 400);
  }
  const now = new Date();
  const tierDrafts = input.tiers.map((raw, index) => {
    const tier = asRecord(raw);
    const evidence = sanitizeGroupBuyingEvidence(tier.evidence);
    return {
      id: randomUUID(),
      tenantId: input.tenantId,
      minimumQuantity: positiveQuantity(tier.minimumQuantity, `tiers[${index}].minimumQuantity`),
      maximumQuantity:
        tier.maximumQuantity === undefined || tier.maximumQuantity === null || tier.maximumQuantity === ""
          ? null
          : positiveQuantity(tier.maximumQuantity, `tiers[${index}].maximumQuantity`),
      unitPriceMinor: nonNegativeMinor(tier.unitPriceMinor, `tiers[${index}].unitPriceMinor`),
      currencyCode: currencyCode(tier.currencyCode || currency),
      label: optionalText(tier.label, 160),
      status: "verified",
      evidence: { ...evidence, verified: true, credentialsExcluded: true },
      verifiedByUserId: input.actorUserId,
      verifiedAt: now,
      createdByUserId: input.actorUserId!,
    } satisfies GroupBuyingPriceTierSnapshot & { createdByUserId: number };
  });
  const tierEvaluation = evaluatePriceTiers({
    tenantId: input.tenantId,
    minimumQuantity,
    currencyCode: currency,
    tiers: tierDrafts,
  });
  if (!tierEvaluation.valid) {
    throw new GroupBuyingError(
      "group_buying_price_tiers_invalid",
      `Price tiers are not approval-ready: ${tierEvaluation.blockers.join(", ")}`,
      400,
      tierEvaluation.blockers,
    );
  }

  const [catalog, factory, supplier, territory, sourceReference, rightsGrant] = await Promise.all([
    db.query.industrialCatalogItems.findFirst({
      where: and(eq(industrialCatalogItems.tenantId, input.tenantId), eq(industrialCatalogItems.id, catalogItemId)),
    }),
    db.query.industrialFactories.findFirst({
      where: and(eq(industrialFactories.tenantId, input.tenantId), eq(industrialFactories.id, producerFactoryId)),
    }),
    supplierProfileId
      ? db.query.industrialSupplierProfiles.findFirst({
          where: and(eq(industrialSupplierProfiles.tenantId, input.tenantId), eq(industrialSupplierProfiles.id, supplierProfileId)),
        })
      : Promise.resolve(null),
    db.query.geoTerritories.findFirst({
      where: and(eq(geoTerritories.tenantId, input.tenantId), eq(geoTerritories.id, territoryId)),
    }),
    campaignMediaItemId
      ? db.query.sourceContentReferences.findFirst({
          where: and(eq(sourceContentReferences.tenantId, input.tenantId), eq(sourceContentReferences.mediaItemId, campaignMediaItemId)),
        })
      : Promise.resolve(null),
    mediaRightsGrantId
      ? db.query.mediaRightsGrants.findFirst({
          where: and(eq(mediaRightsGrants.tenantId, input.tenantId), eq(mediaRightsGrants.id, mediaRightsGrantId)),
        })
      : Promise.resolve(null),
  ]);
  if (sourceReference && rightsGrant && rightsGrant.sourceReferenceId !== sourceReference.id) {
    throw new GroupBuyingError("group_buying_media_rights_source_mismatch", "The selected rights grant does not cover the selected campaign media", 400);
  }
  const draftId = randomUUID();
  const readiness = evaluateGroupCampaignReadiness({
    tenantId: input.tenantId,
    campaign: {
      id: draftId,
      catalogItemId,
      producerFactoryId,
      supplierProfileId,
      territoryId,
      campaignMediaItemId,
      mediaRightsGrantId,
      title,
      publicSummary,
      unitOfMeasure,
      minimumQuantity,
      currencyCode: currency,
      baseUnitPriceMinor,
      deadline,
      productionLeadTimeDays: leadTime,
      deliveryOptions,
      paymentTerms,
      refundConditions,
      capacityEvidence,
      campaignContent,
      commerceRail: "preorder_or_group_purchase",
      regulatedCapitalEnabled: false,
      externalPaymentCollectionExecuted: false,
      externalSettlementExecuted: false,
    },
    catalog: catalog || null,
    factory: factory || null,
    supplier: supplier || null,
    territory: territory || null,
    tiers: tierDrafts.map((tier) => ({ ...tier, campaignId: draftId })),
    sourceReference: sourceReference ? { ...sourceReference, mediaItemId: sourceReference.mediaItemId } : null,
    rightsGrant: rightsGrant || null,
    humanConfirmed: true,
    now,
  });
  if (!readiness.readyForLive) {
    throw new GroupBuyingError(
      "group_buying_campaign_not_approval_ready",
      `Campaign preparation is blocked: ${readiness.blockers.join(", ")}`,
      409,
      readiness.blockers,
    );
  }

  const governed = await governedAction({
    tenantId: input.tenantId,
    actorUserId: input.actorUserId,
    actionKey: "GROUP_BUYING_CAMPAIGN_PREPARE",
    correlationId: `group-buying:campaign:${referenceCode}`,
    payload: { referenceCode, campaignType: type, catalogItemId, producerFactoryId, territoryId },
    work: async (actionRunId) =>
      db.transaction(async (tx) => {
        await advisoryLock(tx, input.tenantId, `group-buying:campaign:${referenceCode}`);
        const duplicate = await tx.query.groupBuyingCampaigns.findFirst({
          where: and(eq(groupBuyingCampaigns.tenantId, input.tenantId), eq(groupBuyingCampaigns.referenceCode, referenceCode)),
        });
        if (duplicate) return { campaign: duplicate, tiers: [], idempotentReplay: true };
        const [created] = await tx
          .insert(groupBuyingCampaigns)
          .values({
            id: draftId,
            tenantId: input.tenantId,
            referenceCode,
            slug: campaignSlug,
            campaignType: type,
            status: "verification_required",
            catalogItemId,
            producerFactoryId,
            supplierProfileId,
            territoryId,
            campaignMediaItemId,
            mediaRightsGrantId,
            title,
            publicSummary,
            unitOfMeasure,
            minimumQuantity,
            currencyCode: currency,
            baseUnitPriceMinor,
            deadline,
            productionLeadTimeDays: leadTime,
            estimatedReadyAt,
            deliveryOptions,
            paymentTerms,
            refundConditions,
            capacityEvidence,
            campaignContent,
            verificationEvidence: {
              verified: false,
              credentialsExcluded: true,
              preparedAt: now.toISOString(),
              readinessBlockers: [],
            },
            commerceRail: "preorder_or_group_purchase",
            regulatedCapitalEnabled: false,
            riskClassification: "standard_commerce",
            externalPaymentCollectionExecuted: false,
            externalSettlementExecuted: false,
            preparationActionRunId: actionRunId,
            preparedByUserId: input.actorUserId,
            metadata: { source: "governed_group_buying_preparation" },
            createdAt: now,
            updatedAt: now,
          })
          .returning();
        const createdTiers = await tx
          .insert(groupBuyingPriceTiers)
          .values(
            tierDrafts.map((tier) => ({
              id: tier.id,
              tenantId: input.tenantId,
              campaignId: created.id,
              minimumQuantity: tier.minimumQuantity,
              maximumQuantity: tier.maximumQuantity,
              unitPriceMinor: tier.unitPriceMinor,
              currencyCode: tier.currencyCode,
              label: tier.label,
              status: "verified",
              evidence: tier.evidence,
              verifiedByUserId: input.actorUserId,
              verifiedAt: now,
              createdByUserId: input.actorUserId,
              createdAt: now,
              updatedAt: now,
            })),
          )
          .returning();
        await appendCampaignEvent(tx, {
          tenantId: input.tenantId,
          campaignId: created.id,
          idempotencyKey: `campaign-prepared:${created.id}`,
          eventType: "campaign_prepared",
          actorUserId: input.actorUserId,
          previousStatus: "draft",
          nextStatus: "verification_required",
          internalNote: "Campaign and verified price tiers prepared for accountable live authorization.",
          evidence: [{ readinessEvaluated: true, blockers: [] }],
        });
        return { campaign: created, tiers: createdTiers, idempotentReplay: false };
      }),
    evidence: (result) => [
      {
        evidenceType: "group_buying_campaign_prepared",
        payload: {
          campaignId: result.campaign.id,
          status: result.campaign.status,
          tierCount: result.tiers.length,
          commerceRail: "preorder_or_group_purchase",
          regulatedCapitalEnabled: false,
        },
      },
    ],
  });
  return {
    ...governed.result,
    actionRunId: governed.actionRunId,
    externalPaymentCollectionExecuted: false,
    externalSettlementExecuted: false,
  };
}

export async function authorizeGroupBuyingCampaign(input: {
  tenantId: number;
  actorUserId: number | null;
  campaignId: string;
  verificationEvidence?: unknown;
  rationale: unknown;
  confirmed: boolean;
}) {
  if (!input.actorUserId) throw new GroupBuyingError("group_buying_actor_required", "An accountable tenant administrator is required", 403);
  if (!input.confirmed) throw new GroupBuyingError("group_buying_authorization_confirmation_required", "Live campaign authorization confirmation is required", 400);
  const campaignId = requireUuid(input.campaignId, "campaignId");
  const rationale = requiredText(input.rationale, "rationale", 2000);
  if (rationale.length < 12) throw new GroupBuyingError("group_buying_rationale_required", "Authorization rationale must contain at least twelve characters", 400);
  const suppliedEvidence = sanitizeGroupBuyingEvidence(input.verificationEvidence);
  const campaign = await db.query.groupBuyingCampaigns.findFirst({
    where: and(eq(groupBuyingCampaigns.tenantId, input.tenantId), eq(groupBuyingCampaigns.id, campaignId)),
  });
  if (!campaign) throw new GroupBuyingError("group_buying_campaign_not_found", "Group-buying campaign not found", 404);
  if (campaign.status === "live") return { campaign, idempotentReplay: true, externalPaymentCollectionExecuted: false };
  if (campaign.status !== "verification_required") {
    throw new GroupBuyingError("group_buying_campaign_not_authorizable", "Only a verification-required campaign can become live", 409);
  }
  const dependencies = await loadCampaignDependencies(db, campaign);
  if (
    dependencies.sourceReference &&
    dependencies.rightsGrant &&
    dependencies.rightsGrant.sourceReferenceId !== dependencies.sourceReference.id
  ) {
    throw new GroupBuyingError("group_buying_media_rights_source_mismatch", "The campaign rights grant does not cover its selected media", 409);
  }
  const readiness = evaluateGroupCampaignReadiness(readinessInput(campaign, dependencies, true));
  if (!readiness.readyForLive) {
    throw new GroupBuyingError(
      "group_buying_campaign_not_ready",
      `Campaign cannot become live: ${readiness.blockers.join(", ")}`,
      409,
      readiness.blockers,
    );
  }
  const transition = evaluateCampaignTransition(campaign.status, "live");
  if (!transition.valid) throw new GroupBuyingError("group_buying_transition_forbidden", transition.blockers.join(", "), 409, transition.blockers);
  const governed = await governedAction({
    tenantId: input.tenantId,
    actorUserId: input.actorUserId,
    actionKey: "GROUP_BUYING_CAMPAIGN_AUTHORIZE",
    correlationId: `group-buying:authorize:${campaign.id}`,
    payload: { campaignId: campaign.id, rationale },
    work: async (actionRunId) =>
      db.transaction(async (tx) => {
        await advisoryLock(tx, input.tenantId, `group-buying:campaign:${campaign.id}`);
        const current = await tx.query.groupBuyingCampaigns.findFirst({
          where: and(eq(groupBuyingCampaigns.tenantId, input.tenantId), eq(groupBuyingCampaigns.id, campaign.id)),
        });
        if (!current) throw new GroupBuyingError("group_buying_campaign_not_found", "Group-buying campaign not found", 404);
        if (current.status === "live") return { campaign: current, idempotentReplay: true };
        if (current.status !== "verification_required") throw new GroupBuyingError("group_buying_campaign_changed", "Campaign state changed before authorization", 409);
        const currentDependencies = await loadCampaignDependencies(tx, current);
        const currentReadiness = evaluateGroupCampaignReadiness(readinessInput(current, currentDependencies, true));
        if (!currentReadiness.readyForLive) {
          throw new GroupBuyingError("group_buying_campaign_not_ready", currentReadiness.blockers.join(", "), 409, currentReadiness.blockers);
        }
        const now = new Date();
        const [updated] = await tx
          .update(groupBuyingCampaigns)
          .set({
            status: "live",
            verificationEvidence: {
              ...suppliedEvidence,
              verified: true,
              credentialsExcluded: true,
              verifiedAt: now.toISOString(),
              verifiedByUserId: input.actorUserId,
              rationale,
              readinessBlockers: [],
            },
            approvalActionRunId: actionRunId,
            approvedByUserId: input.actorUserId,
            liveAt: now,
            updatedAt: now,
          })
          .where(and(eq(groupBuyingCampaigns.tenantId, input.tenantId), eq(groupBuyingCampaigns.id, current.id)))
          .returning();
        await appendCampaignEvent(tx, {
          tenantId: input.tenantId,
          campaignId: updated.id,
          idempotencyKey: `campaign-live:${updated.id}`,
          eventType: "campaign_authorized_live",
          actorUserId: input.actorUserId,
          previousStatus: "verification_required",
          nextStatus: "live",
          publicMessage: "This product group-purchase campaign is now open for non-binding buying interest.",
          internalNote: rationale,
          evidence: [{ verified: true, credentialsExcluded: true, actionRunId }],
        });
        await tx.insert(industrialAuditLogs).values({
          tenantId: input.tenantId,
          actorUserId: input.actorUserId,
          action: "group_buying.campaign_authorized_live",
          entityType: "group_buying_campaign",
          entityId: updated.id,
          reason: rationale,
          previousValue: { status: current.status },
          nextValue: { status: updated.status },
          metadata: { actionRunId, externalPaymentCollectionExecuted: false },
          createdAt: now,
        });
        return { campaign: updated, idempotentReplay: false };
      }),
    evidence: (result) => [{
      evidenceType: "group_buying_campaign_authorized",
      payload: {
        campaignId: result.campaign.id,
        status: result.campaign.status,
        humanApproved: true,
        externalPaymentCollectionExecuted: false,
      },
    }],
  });
  return {
    ...governed.result,
    actionRunId: governed.actionRunId,
    externalPaymentCollectionExecuted: false,
    externalSettlementExecuted: false,
  };
}

export async function recordGroupBuyingInterest(input: {
  tenantId: number;
  buyerUserId: number;
  campaignId: string;
  idempotencyKey: unknown;
  quantity: unknown;
  deliveryOptionId: unknown;
  buyerNotes?: unknown;
  refundConditionsAccepted: boolean;
}) {
  const campaignId = requireUuid(input.campaignId, "campaignId");
  const key = idempotencyKey(input.idempotencyKey);
  const buyerUserId = requirePositiveId(input.buyerUserId, "buyerUserId");
  if (!input.refundConditionsAccepted) {
    throw new GroupBuyingError("group_buying_refund_conditions_acceptance_required", "The campaign refund conditions must be acknowledged", 400);
  }
  const existing = await db.query.groupBuyingCommitments.findFirst({
    where: and(eq(groupBuyingCommitments.tenantId, input.tenantId), eq(groupBuyingCommitments.idempotencyKey, key)),
  });
  if (existing) {
    if (existing.buyerUserId !== buyerUserId || existing.campaignId !== campaignId) {
      throw new GroupBuyingError("group_buying_idempotency_conflict", "The idempotency key belongs to another interest record", 409);
    }
    return { commitment: existing, idempotentReplay: true, bindingCommitmentCreated: false, paymentCollected: false };
  }
  const quantity = positiveQuantity(input.quantity, "quantity");
  const deliveryOptionId = requiredText(input.deliveryOptionId, "deliveryOptionId", 80);
  const buyerNotes = optionalText(input.buyerNotes, 2000);
  const campaign = await db.query.groupBuyingCampaigns.findFirst({
    where: and(eq(groupBuyingCampaigns.tenantId, input.tenantId), eq(groupBuyingCampaigns.id, campaignId)),
  });
  if (!campaign) throw new GroupBuyingError("group_buying_campaign_not_found", "Group-buying campaign not found", 404);
  const tiers = await db.query.groupBuyingPriceTiers.findMany({
    where: and(eq(groupBuyingPriceTiers.tenantId, input.tenantId), eq(groupBuyingPriceTiers.campaignId, campaignId)),
  });
  const interest = evaluateBuyingInterest({
    campaign,
    tiers: tiers.map((tier) => ({ ...tier, unitPriceMinor: Number(tier.unitPriceMinor) })),
    quantity,
  });
  if (!interest.valid || !interest.priceTier || interest.totalAmountMinor === null) {
    throw new GroupBuyingError("group_buying_interest_blocked", interest.blockers.join(", "), 409, interest.blockers);
  }
  const options = Array.isArray(campaign.deliveryOptions) ? campaign.deliveryOptions : [];
  const selectedOption = options.find((option) => String(asRecord(option).id || "") === deliveryOptionId);
  if (!selectedOption) throw new GroupBuyingError("group_buying_delivery_option_invalid", "The selected delivery option is unavailable", 400);

  const governed = await governedAction({
    tenantId: input.tenantId,
    actorUserId: buyerUserId,
    actionKey: "GROUP_BUYING_INTEREST_RECORD",
    correlationId: `group-buying:interest:${key}`,
    payload: { campaignId, quantity: Number(quantity), deliveryOptionId },
    work: async (actionRunId) =>
      db.transaction(async (tx) => {
        await advisoryLock(tx, input.tenantId, `group-buying:campaign:${campaignId}`);
        const duplicate = await tx.query.groupBuyingCommitments.findFirst({
          where: and(eq(groupBuyingCommitments.tenantId, input.tenantId), eq(groupBuyingCommitments.idempotencyKey, key)),
        });
        if (duplicate) return { commitment: duplicate, idempotentReplay: true };
        const current = await tx.query.groupBuyingCampaigns.findFirst({
          where: and(eq(groupBuyingCampaigns.tenantId, input.tenantId), eq(groupBuyingCampaigns.id, campaignId)),
        });
        if (!current) throw new GroupBuyingError("group_buying_campaign_not_found", "Group-buying campaign not found", 404);
        const currentTiers = await tx.query.groupBuyingPriceTiers.findMany({
          where: and(eq(groupBuyingPriceTiers.tenantId, input.tenantId), eq(groupBuyingPriceTiers.campaignId, campaignId)),
        });
        const currentInterest = evaluateBuyingInterest({
          campaign: current,
          tiers: currentTiers.map((tier: typeof groupBuyingPriceTiers.$inferSelect) => ({ ...tier, unitPriceMinor: Number(tier.unitPriceMinor) })),
          quantity,
        });
        if (!currentInterest.valid || !currentInterest.priceTier || currentInterest.totalAmountMinor === null) {
          throw new GroupBuyingError("group_buying_interest_blocked", currentInterest.blockers.join(", "), 409, currentInterest.blockers);
        }
        const now = new Date();
        const [commitment] = await tx
          .insert(groupBuyingCommitments)
          .values({
            tenantId: input.tenantId,
            campaignId,
            idempotencyKey: key,
            buyerUserId,
            status: "interest_recorded",
            quantity,
            priceTierId: currentInterest.priceTier.id,
            unitPriceMinor: currentInterest.priceTier.unitPriceMinor,
            totalAmountMinor: currentInterest.totalAmountMinor,
            currencyCode: current.currencyCode,
            canonicalPaymentVerified: false,
            paymentEvidence: {},
            deliveryOptionSnapshot: sanitizeGroupBuyingEvidence(selectedOption),
            buyerNotes,
            refundConditionsAcceptedAt: now,
            createdByUserId: buyerUserId,
            updatedByUserId: buyerUserId,
            createdAt: now,
            updatedAt: now,
          })
          .returning();
        await tx
          .update(groupBuyingCampaigns)
          .set({
            interestQuantity: sql`${groupBuyingCampaigns.interestQuantity} + ${quantity}`,
            updatedAt: now,
          })
          .where(and(eq(groupBuyingCampaigns.tenantId, input.tenantId), eq(groupBuyingCampaigns.id, campaignId)));
        await appendCampaignEvent(tx, {
          tenantId: input.tenantId,
          campaignId,
          idempotencyKey: `interest-recorded:${commitment.id}`,
          eventType: "non_binding_interest_recorded",
          actorUserId: buyerUserId,
          internalNote: "Buyer interest recorded without collecting payment or reserving inventory.",
          evidence: [{ actionRunId, quantity: Number(quantity), binding: false }],
          metadata: { commitmentId: commitment.id },
        });
        return { commitment, idempotentReplay: false };
      }),
    evidence: (result) => [{
      evidenceType: "group_buying_non_binding_interest",
      payload: {
        campaignId,
        commitmentId: result.commitment.id,
        bindingCommitmentCreated: false,
        paymentCollected: false,
        inventoryReserved: false,
      },
    }],
  });
  return {
    ...governed.result,
    actionRunId: governed.actionRunId,
    bindingCommitmentCreated: false,
    paymentCollected: false,
    inventoryReserved: false,
  };
}

export async function bindPaidIndustrialOrderToCommitment(input: {
  tenantId: number;
  actorUserId: number | null;
  commitmentId: string;
  industrialOrderId: string;
  paymentId: string;
  confirmed: boolean;
}) {
  if (!input.actorUserId) throw new GroupBuyingError("group_buying_actor_required", "An accountable tenant administrator is required", 403);
  if (!input.confirmed) throw new GroupBuyingError("group_buying_payment_binding_confirmation_required", "Canonical paid-order binding confirmation is required", 400);
  const commitmentId = requireUuid(input.commitmentId, "commitmentId");
  const industrialOrderId = requireUuid(input.industrialOrderId, "industrialOrderId");
  const paymentId = requireUuid(input.paymentId, "paymentId");
  const commitment = await db.query.groupBuyingCommitments.findFirst({
    where: and(eq(groupBuyingCommitments.tenantId, input.tenantId), eq(groupBuyingCommitments.id, commitmentId)),
  });
  if (!commitment) throw new GroupBuyingError("group_buying_commitment_not_found", "Group-buying commitment not found", 404);
  if (
    commitment.canonicalPaymentVerified &&
    commitment.industrialOrderId === industrialOrderId &&
    commitment.paymentId === paymentId
  ) {
    return { commitment, idempotentReplay: true, providerVerified: true };
  }
  const [campaign, order, payment] = await Promise.all([
    db.query.groupBuyingCampaigns.findFirst({
      where: and(eq(groupBuyingCampaigns.tenantId, input.tenantId), eq(groupBuyingCampaigns.id, commitment.campaignId)),
    }),
    db.query.industrialOrders.findFirst({
      where: and(eq(industrialOrders.tenantId, input.tenantId), eq(industrialOrders.id, industrialOrderId)),
    }),
    db.query.payments.findFirst({
      where: and(eq(payments.tenantId, input.tenantId), eq(payments.id, paymentId)),
    }),
  ]);
  if (!campaign) throw new GroupBuyingError("group_buying_campaign_not_found", "Group-buying campaign not found", 404);
  const binding = evaluatePaidOrderBinding({
    tenantId: input.tenantId,
    campaign,
    commitment: { ...commitment, unitPriceMinor: Number(commitment.unitPriceMinor), totalAmountMinor: Number(commitment.totalAmountMinor) },
    order: order || null,
    payment: payment || null,
  });
  if (!binding.verified) {
    throw new GroupBuyingError("group_buying_paid_order_not_verified", binding.blockers.join(", "), 409, binding.blockers);
  }

  const governed = await governedAction({
    tenantId: input.tenantId,
    actorUserId: input.actorUserId,
    actionKey: "GROUP_BUYING_PAYMENT_BIND",
    correlationId: `group-buying:payment-bind:${commitment.id}`,
    payload: { commitmentId, industrialOrderId, paymentId },
    work: async (actionRunId) =>
      db.transaction(async (tx) => {
        await advisoryLock(tx, input.tenantId, `group-buying:campaign:${campaign.id}`);
        const [currentCommitment, currentCampaign, currentOrder, currentPayment] = await Promise.all([
          tx.query.groupBuyingCommitments.findFirst({ where: and(eq(groupBuyingCommitments.tenantId, input.tenantId), eq(groupBuyingCommitments.id, commitmentId)) }),
          tx.query.groupBuyingCampaigns.findFirst({ where: and(eq(groupBuyingCampaigns.tenantId, input.tenantId), eq(groupBuyingCampaigns.id, campaign.id)) }),
          tx.query.industrialOrders.findFirst({ where: and(eq(industrialOrders.tenantId, input.tenantId), eq(industrialOrders.id, industrialOrderId)) }),
          tx.query.payments.findFirst({ where: and(eq(payments.tenantId, input.tenantId), eq(payments.id, paymentId)) }),
        ]);
        if (!currentCommitment || !currentCampaign) throw new GroupBuyingError("group_buying_binding_target_missing", "Campaign or commitment no longer exists", 409);
        if (currentCommitment.canonicalPaymentVerified && currentCommitment.industrialOrderId === industrialOrderId && currentCommitment.paymentId === paymentId) {
          return { commitment: currentCommitment, campaign: currentCampaign, idempotentReplay: true };
        }
        const currentBinding = evaluatePaidOrderBinding({
          tenantId: input.tenantId,
          campaign: currentCampaign,
          commitment: { ...currentCommitment, unitPriceMinor: Number(currentCommitment.unitPriceMinor), totalAmountMinor: Number(currentCommitment.totalAmountMinor) },
          order: currentOrder || null,
          payment: currentPayment || null,
        });
        if (!currentBinding.verified || !currentOrder || !currentPayment) {
          throw new GroupBuyingError("group_buying_paid_order_not_verified", currentBinding.blockers.join(", "), 409, currentBinding.blockers);
        }
        const now = new Date();
        const [updatedCommitment] = await tx
          .update(groupBuyingCommitments)
          .set({
            status: "payment_confirmed",
            industrialOrderId,
            paymentId,
            canonicalPaymentVerified: true,
            paymentEvidence: {
              providerVerified: true,
              credentialsExcluded: true,
              provider: currentPayment.provider,
              providerTransactionId: currentPayment.providerTransactionId || null,
              providerTransactionRef: currentPayment.providerTransactionRef || null,
              creditedAt: currentPayment.creditedAt instanceof Date
                ? currentPayment.creditedAt.toISOString()
                : currentPayment.creditedAt,
              actionRunId,
              boundAt: now.toISOString(),
            },
            paymentConfirmedAt: now,
            updatedByUserId: input.actorUserId,
            updatedAt: now,
          })
          .where(and(eq(groupBuyingCommitments.tenantId, input.tenantId), eq(groupBuyingCommitments.id, commitmentId)))
          .returning();
        const aggregateResult = await tx.execute(sql`
          select coalesce(sum(quantity), 0)::text as committed_quantity
          from group_buying_commitments
          where tenant_id = ${input.tenantId}
            and campaign_id = ${currentCampaign.id}
            and canonical_payment_verified = true
            and status in ('payment_confirmed','allocated_to_batch','fulfilled')
        `);
        const aggregateRow = Array.isArray((aggregateResult as any)?.rows) ? (aggregateResult as any).rows[0] : null;
        const committedQuantity = String(aggregateRow?.committed_quantity || "0");
        const thresholdReached = Number(committedQuantity) >= Number(currentCampaign.minimumQuantity);
        let nextStatus = currentCampaign.status as GroupBuyingCampaignStatus;
        if (thresholdReached && ["live", "threshold_pending", "moq_reached"].includes(currentCampaign.status)) {
          nextStatus = "payment_confirmed";
        } else if (!thresholdReached && currentCampaign.status === "live") {
          nextStatus = "threshold_pending";
        }
        if (thresholdReached && ["live", "threshold_pending"].includes(currentCampaign.status)) {
          const toMoq = evaluateCampaignTransition(currentCampaign.status, "moq_reached");
          const toPaid = evaluateCampaignTransition("moq_reached", "payment_confirmed");
          if (!toMoq.valid || !toPaid.valid) throw new GroupBuyingError("group_buying_transition_forbidden", [...toMoq.blockers, ...toPaid.blockers].join(", "));
          await appendCampaignEvent(tx, {
            tenantId: input.tenantId,
            campaignId: currentCampaign.id,
            idempotencyKey: `campaign-moq-reached:${currentCampaign.id}`,
            eventType: "campaign_moq_reached_from_paid_orders",
            actorUserId: input.actorUserId,
            previousStatus: currentCampaign.status,
            nextStatus: "moq_reached",
            publicMessage: "The minimum group-purchase quantity has been reached through provider-confirmed paid orders.",
            evidence: [{ committedQuantity: Number(committedQuantity), canonicalPaidOrdersOnly: true }],
          });
          await appendCampaignEvent(tx, {
            tenantId: input.tenantId,
            campaignId: currentCampaign.id,
            idempotencyKey: `campaign-payment-confirmed:${currentCampaign.id}`,
            eventType: "campaign_payment_confirmed",
            actorUserId: input.actorUserId,
            previousStatus: "moq_reached",
            nextStatus: "payment_confirmed",
            publicMessage: "The production threshold is backed by provider-confirmed paid industrial orders.",
            evidence: [{ committedQuantity: Number(committedQuantity), providerVerified: true }],
          });
        } else if (nextStatus !== currentCampaign.status) {
          const allowed = evaluateCampaignTransition(currentCampaign.status, nextStatus);
          if (!allowed.valid) throw new GroupBuyingError("group_buying_transition_forbidden", allowed.blockers.join(", "));
          await appendCampaignEvent(tx, {
            tenantId: input.tenantId,
            campaignId: currentCampaign.id,
            idempotencyKey: `campaign-threshold-pending:${currentCampaign.id}`,
            eventType: "campaign_threshold_pending",
            actorUserId: input.actorUserId,
            previousStatus: currentCampaign.status,
            nextStatus,
            publicMessage: "Provider-confirmed paid orders are accumulating toward the production threshold.",
            evidence: [{ committedQuantity: Number(committedQuantity), canonicalPaidOrdersOnly: true }],
          });
        }
        const [updatedCampaign] = await tx
          .update(groupBuyingCampaigns)
          .set({
            committedQuantity,
            status: nextStatus,
            thresholdReachedAt: thresholdReached ? currentCampaign.thresholdReachedAt || now : null,
            paymentConfirmedAt: thresholdReached ? currentCampaign.paymentConfirmedAt || now : null,
            updatedAt: now,
          })
          .where(and(eq(groupBuyingCampaigns.tenantId, input.tenantId), eq(groupBuyingCampaigns.id, currentCampaign.id)))
          .returning();
        await appendCampaignEvent(tx, {
          tenantId: input.tenantId,
          campaignId: currentCampaign.id,
          idempotencyKey: `paid-order-bound:${updatedCommitment.id}`,
          eventType: "canonical_paid_order_bound",
          actorUserId: input.actorUserId,
          internalNote: "Commitment became binding only after exact industrial-order and provider payment reconciliation.",
          evidence: [{ industrialOrderId, paymentId, providerVerified: true }],
          metadata: { commitmentId: updatedCommitment.id, actionRunId },
        });
        return { commitment: updatedCommitment, campaign: updatedCampaign, idempotentReplay: false };
      }),
    evidence: (result) => [{
      evidenceType: "group_buying_canonical_payment_bound",
      payload: {
        campaignId: result.campaign.id,
        commitmentId: result.commitment.id,
        industrialOrderId,
        paymentId,
        providerVerified: true,
      },
    }],
  });
  return {
    ...governed.result,
    actionRunId: governed.actionRunId,
    providerVerified: true,
    duplicateCheckoutCreated: false,
    externalPaymentCollectionExecuted: false,
  };
}

export async function prepareProductionBatch(input: {
  tenantId: number;
  actorUserId: number | null;
  campaignId: string;
  referenceCode: unknown;
  commitmentIds: unknown;
  capacityEvidence?: unknown;
  confirmed: boolean;
}) {
  if (!input.actorUserId) throw new GroupBuyingError("group_buying_actor_required", "An accountable tenant administrator is required", 403);
  if (!input.confirmed) throw new GroupBuyingError("production_batch_confirmation_required", "Production-batch preparation confirmation is required", 400);
  const campaignId = requireUuid(input.campaignId, "campaignId");
  const referenceCode = requiredText(input.referenceCode, "referenceCode", 80);
  if (!Array.isArray(input.commitmentIds) || !input.commitmentIds.length || input.commitmentIds.length > 1000) {
    throw new GroupBuyingError("production_batch_commitments_required", "One to one thousand paid commitment IDs are required", 400);
  }
  const commitmentIds = Array.from(
    new Set(input.commitmentIds.map((value, index) => requireUuid(value, `commitmentIds[${index}]`))),
  );
  if (commitmentIds.length !== input.commitmentIds.length) {
    throw new GroupBuyingError("production_batch_commitment_duplicate", "Commitment IDs must be unique", 400);
  }
  const existing = await db.query.productionBatches.findFirst({
    where: and(eq(productionBatches.tenantId, input.tenantId), eq(productionBatches.campaignId, campaignId)),
  });
  if (existing) {
    if (existing.referenceCode !== referenceCode) {
      throw new GroupBuyingError("production_batch_already_exists", "This campaign already has a different production batch", 409);
    }
    return { productionBatch: existing, idempotentReplay: true, externalProductionExecuted: existing.externalProductionExecuted };
  }
  const campaign = await db.query.groupBuyingCampaigns.findFirst({
    where: and(eq(groupBuyingCampaigns.tenantId, input.tenantId), eq(groupBuyingCampaigns.id, campaignId)),
  });
  if (!campaign) throw new GroupBuyingError("group_buying_campaign_not_found", "Group-buying campaign not found", 404);
  if (campaign.status !== "payment_confirmed") {
    throw new GroupBuyingError("production_batch_campaign_not_paid", "Production batch preparation requires a payment-confirmed campaign", 409);
  }
  const commitments = await db.query.groupBuyingCommitments.findMany({
    where: and(
      eq(groupBuyingCommitments.tenantId, input.tenantId),
      eq(groupBuyingCommitments.campaignId, campaignId),
      inArray(groupBuyingCommitments.id, commitmentIds),
    ),
  });
  if (commitments.length !== commitmentIds.length) {
    throw new GroupBuyingError("production_batch_commitment_missing", "One or more selected commitments do not belong to this campaign", 409);
  }
  const invalid = commitments.filter(
    (row) =>
      row.status !== "payment_confirmed" ||
      row.canonicalPaymentVerified !== true ||
      !row.industrialOrderId ||
      !row.paymentId,
  );
  if (invalid.length) {
    throw new GroupBuyingError(
      "production_batch_unverified_commitment",
      `Every allocation must be backed by a canonical paid order; blocked: ${invalid.map((row) => row.id).join(", ")}`,
      409,
    );
  }
  const targetUnits = commitments.reduce(
    (sum, row) => sum + quantityUnits(row.quantity, `commitment:${row.id}.quantity`),
    0,
  );
  if (targetUnits < quantityUnits(campaign.minimumQuantity, "campaign.minimumQuantity")) {
    throw new GroupBuyingError("production_batch_below_moq", "Selected provider-confirmed paid orders do not reach the campaign minimum quantity", 409);
  }
  const targetQuantity = quantityFromUnits(targetUnits);
  const capacityEvidence = sanitizeGroupBuyingEvidence(input.capacityEvidence || campaign.capacityEvidence);
  if (capacityEvidence.verified !== true) {
    throw new GroupBuyingError("production_batch_capacity_unverified", "Verified batch capacity evidence is required", 400);
  }

  const governed = await governedAction({
    tenantId: input.tenantId,
    actorUserId: input.actorUserId,
    actionKey: "PRODUCTION_BATCH_PREPARE",
    correlationId: `group-buying:batch:${campaignId}`,
    payload: { campaignId, referenceCode, commitmentCount: commitmentIds.length },
    work: async (actionRunId) =>
      db.transaction(async (tx) => {
        await advisoryLock(tx, input.tenantId, `group-buying:campaign:${campaignId}`);
        const duplicate = await tx.query.productionBatches.findFirst({
          where: and(eq(productionBatches.tenantId, input.tenantId), eq(productionBatches.campaignId, campaignId)),
        });
        if (duplicate) return { productionBatch: duplicate, allocations: [], idempotentReplay: true };
        const currentCampaign = await tx.query.groupBuyingCampaigns.findFirst({
          where: and(eq(groupBuyingCampaigns.tenantId, input.tenantId), eq(groupBuyingCampaigns.id, campaignId)),
        });
        const currentCommitments = await tx.query.groupBuyingCommitments.findMany({
          where: and(
            eq(groupBuyingCommitments.tenantId, input.tenantId),
            eq(groupBuyingCommitments.campaignId, campaignId),
            inArray(groupBuyingCommitments.id, commitmentIds),
          ),
        });
        if (!currentCampaign || currentCampaign.status !== "payment_confirmed" || currentCommitments.length !== commitmentIds.length) {
          throw new GroupBuyingError("production_batch_source_changed", "Campaign or paid commitments changed before batch preparation", 409);
        }
        if (
          currentCommitments.some(
            (row: typeof groupBuyingCommitments.$inferSelect) =>
              row.status !== "payment_confirmed" ||
              row.canonicalPaymentVerified !== true ||
              !row.industrialOrderId ||
              !row.paymentId,
          )
        ) {
          throw new GroupBuyingError("production_batch_unverified_commitment", "A selected commitment is no longer backed by a canonical paid order", 409);
        }
        const currentTargetUnits = currentCommitments.reduce(
          (sum: number, row: typeof groupBuyingCommitments.$inferSelect) =>
            sum + quantityUnits(row.quantity, `commitment:${row.id}.quantity`),
          0,
        );
        if (currentTargetUnits !== targetUnits) {
          throw new GroupBuyingError("production_batch_quantity_changed", "Selected paid quantities changed before batch preparation", 409);
        }
        const now = new Date();
        const [productionBatch] = await tx
          .insert(productionBatches)
          .values({
            tenantId: input.tenantId,
            campaignId,
            referenceCode,
            status: "capacity_confirmed",
            targetQuantity,
            allocatedQuantity: targetQuantity,
            capacityEvidence: {
              ...capacityEvidence,
              verified: true,
              credentialsExcluded: true,
              approvedAt: now.toISOString(),
              actionRunId,
            },
            externalProductionExecuted: false,
            externalCarrierHandoffExecuted: false,
            externalSettlementExecuted: false,
            approvedByUserId: input.actorUserId,
            createdByUserId: input.actorUserId,
            updatedByUserId: input.actorUserId,
            createdAt: now,
            updatedAt: now,
          })
          .returning();
        const allocations = await tx
          .insert(productionBatchAllocations)
          .values(
            currentCommitments.map((commitment: typeof groupBuyingCommitments.$inferSelect) => ({
              tenantId: input.tenantId,
              productionBatchId: productionBatch.id,
              commitmentId: commitment.id,
              industrialOrderId: commitment.industrialOrderId!,
              quantity: commitment.quantity,
              status: "allocated",
              allocatedByUserId: input.actorUserId,
              allocatedAt: now,
              createdAt: now,
              updatedAt: now,
            })),
          )
          .returning();
        await tx
          .update(groupBuyingCommitments)
          .set({ status: "allocated_to_batch", updatedByUserId: input.actorUserId, updatedAt: now })
          .where(
            and(
              eq(groupBuyingCommitments.tenantId, input.tenantId),
              eq(groupBuyingCommitments.campaignId, campaignId),
              inArray(groupBuyingCommitments.id, commitmentIds),
            ),
          );
        await appendCampaignEvent(tx, {
          tenantId: input.tenantId,
          campaignId,
          idempotencyKey: `production-batch-prepared:${productionBatch.id}`,
          eventType: "production_batch_capacity_confirmed",
          actorUserId: input.actorUserId,
          internalNote: "Production batch was allocated exactly to provider-confirmed paid industrial orders.",
          evidence: [{
            productionBatchId: productionBatch.id,
            targetQuantity: Number(targetQuantity),
            allocationCount: allocations.length,
            canonicalPaidOrdersOnly: true,
            externalProductionExecuted: false,
          }],
        });
        return { productionBatch, allocations, idempotentReplay: false };
      }),
    evidence: (result) => [{
      evidenceType: "production_batch_prepared",
      payload: {
        campaignId,
        productionBatchId: result.productionBatch.id,
        status: result.productionBatch.status,
        allocationCount: result.allocations.length,
        externalProductionExecuted: false,
      },
    }],
  });
  return {
    ...governed.result,
    actionRunId: governed.actionRunId,
    externalProductionExecuted: false,
    externalCarrierHandoffExecuted: false,
    externalSettlementExecuted: false,
  };
}

function campaignStatusForBatch(nextStatus: ProductionBatchStatus): GroupBuyingCampaignStatus | null {
  if (nextStatus === "production" || nextStatus === "quality_review") return "production";
  if (nextStatus === "ready_for_pickup") return "ready_for_pickup";
  if (nextStatus === "in_transit") return "in_transit";
  if (nextStatus === "delivered" || nextStatus === "settlement_pending") return "delivered";
  if (nextStatus === "settled") return "settled";
  if (nextStatus === "failed") return "failed";
  if (nextStatus === "refunding") return "refunding";
  if (nextStatus === "refunded") return "refunded";
  return null;
}

export async function transitionProductionBatch(input: {
  tenantId: number;
  actorUserId: number | null;
  productionBatchId: string;
  nextStatus: unknown;
  quantities?: unknown;
  capacityEvidence?: unknown;
  productionEvidence?: unknown;
  inspectionEvidence?: unknown;
  handoffEvidence?: unknown;
  deliveryEvidence?: unknown;
  settlementEvidence?: unknown;
  carrierBookingAuthorizationId?: unknown;
  externalProductionExecuted?: boolean;
  externalCarrierHandoffExecuted?: boolean;
  externalSettlementExecuted?: boolean;
  publicMessage?: unknown;
  internalNote?: unknown;
  confirmed: boolean;
}) {
  if (!input.actorUserId) throw new GroupBuyingError("group_buying_actor_required", "An accountable tenant administrator is required", 403);
  if (!input.confirmed) throw new GroupBuyingError("production_batch_transition_confirmation_required", "Production-batch evidence recording confirmation is required", 400);
  const productionBatchId = requireUuid(input.productionBatchId, "productionBatchId");
  const nextStatus = String(input.nextStatus || "").trim() as ProductionBatchStatus;
  if (!["planned", "capacity_confirmed", "funded_by_orders", "production", "quality_review", "ready_for_pickup", "in_transit", "delivered", "settlement_pending", "settled", "failed", "refunding", "refunded"].includes(nextStatus)) {
    throw new GroupBuyingError("production_batch_status_invalid", "Unsupported production-batch status", 400);
  }
  if (["refunding", "refunded"].includes(nextStatus)) {
    throw new GroupBuyingError(
      "production_batch_refund_workflow_required",
      "A batch cannot claim refunding or refunded until the canonical provider-refund reconciliation workflow is connected.",
      409,
    );
  }
  const existing = await db.query.productionBatches.findFirst({
    where: and(eq(productionBatches.tenantId, input.tenantId), eq(productionBatches.id, productionBatchId)),
  });
  if (!existing) throw new GroupBuyingError("production_batch_not_found", "Production batch not found", 404);
  if (existing.status === nextStatus) return { productionBatch: existing, idempotentReplay: true, externalProviderActionExecuted: false };
  const publicMessage = optionalText(input.publicMessage, 2000);
  const internalNote = optionalText(input.internalNote, 4000);
  if (publicMessage) assertCommerceOnlyLanguage(publicMessage);

  const governed = await governedAction({
    tenantId: input.tenantId,
    actorUserId: input.actorUserId,
    actionKey: "PRODUCTION_BATCH_RECORD_EVENT",
    correlationId: `group-buying:batch-transition:${productionBatchId}:${nextStatus}`,
    payload: { productionBatchId, nextStatus },
    work: async (actionRunId) =>
      db.transaction(async (tx) => {
        await advisoryLock(tx, input.tenantId, `group-buying:batch:${productionBatchId}`);
        const current = await tx.query.productionBatches.findFirst({
          where: and(eq(productionBatches.tenantId, input.tenantId), eq(productionBatches.id, productionBatchId)),
        });
        if (!current) throw new GroupBuyingError("production_batch_not_found", "Production batch not found", 404);
        if (current.status === nextStatus) return { productionBatch: current, campaign: null, idempotentReplay: true };
        const campaign = await tx.query.groupBuyingCampaigns.findFirst({
          where: and(eq(groupBuyingCampaigns.tenantId, input.tenantId), eq(groupBuyingCampaigns.id, current.campaignId)),
        });
        if (!campaign) throw new GroupBuyingError("group_buying_campaign_not_found", "Group-buying campaign not found", 404);
        const quantities = asRecord(input.quantities);
        const now = new Date();
        const candidate = {
          ...current,
          allocatedQuantity: quantities.allocatedQuantity === undefined
            ? current.allocatedQuantity
            : nonNegativeQuantity(quantities.allocatedQuantity, "quantities.allocatedQuantity"),
          producedQuantity: quantities.producedQuantity === undefined
            ? current.producedQuantity
            : nonNegativeQuantity(quantities.producedQuantity, "quantities.producedQuantity"),
          passedInspectionQuantity: quantities.passedInspectionQuantity === undefined
            ? current.passedInspectionQuantity
            : nonNegativeQuantity(quantities.passedInspectionQuantity, "quantities.passedInspectionQuantity"),
          readyQuantity: quantities.readyQuantity === undefined
            ? current.readyQuantity
            : nonNegativeQuantity(quantities.readyQuantity, "quantities.readyQuantity"),
          handedToCarrierQuantity: quantities.handedToCarrierQuantity === undefined
            ? current.handedToCarrierQuantity
            : nonNegativeQuantity(quantities.handedToCarrierQuantity, "quantities.handedToCarrierQuantity"),
          deliveredQuantity: quantities.deliveredQuantity === undefined
            ? current.deliveredQuantity
            : nonNegativeQuantity(quantities.deliveredQuantity, "quantities.deliveredQuantity"),
          capacityEvidence: input.capacityEvidence === undefined
            ? current.capacityEvidence
            : sanitizeGroupBuyingEvidence(input.capacityEvidence),
          productionEvidence: input.productionEvidence === undefined
            ? current.productionEvidence
            : safeEvidenceArray(input.productionEvidence, "productionEvidence"),
          inspectionEvidence: input.inspectionEvidence === undefined
            ? current.inspectionEvidence
            : safeEvidenceArray(input.inspectionEvidence, "inspectionEvidence"),
          handoffEvidence: input.handoffEvidence === undefined
            ? current.handoffEvidence
            : safeEvidenceArray(input.handoffEvidence, "handoffEvidence"),
          deliveryEvidence: input.deliveryEvidence === undefined
            ? current.deliveryEvidence
            : safeEvidenceArray(input.deliveryEvidence, "deliveryEvidence"),
          settlementEvidence: input.settlementEvidence === undefined
            ? current.settlementEvidence
            : safeEvidenceArray(input.settlementEvidence, "settlementEvidence"),
          carrierBookingAuthorizationId: input.carrierBookingAuthorizationId === undefined
            ? current.carrierBookingAuthorizationId
            : input.carrierBookingAuthorizationId
              ? requireUuid(input.carrierBookingAuthorizationId, "carrierBookingAuthorizationId")
              : null,
          externalProductionExecuted:
            current.externalProductionExecuted || input.externalProductionExecuted === true,
          externalCarrierHandoffExecuted:
            current.externalCarrierHandoffExecuted || input.externalCarrierHandoffExecuted === true,
          externalSettlementExecuted:
            current.externalSettlementExecuted || input.externalSettlementExecuted === true,
          approvedByUserId: current.approvedByUserId || input.actorUserId,
          startedAt: current.startedAt || (nextStatus === "production" ? now : null),
          readyAt: current.readyAt || (nextStatus === "ready_for_pickup" ? now : null),
          handedToCarrierAt: current.handedToCarrierAt || (nextStatus === "in_transit" ? now : null),
          deliveredAt: current.deliveredAt || (nextStatus === "delivered" ? now : null),
          settledAt: current.settledAt || (nextStatus === "settled" ? now : null),
          failedAt: current.failedAt || (nextStatus === "failed" ? now : null),
        };
        const [commitments, allocations, carrierBooking, settlementPlan] = await Promise.all([
          tx.query.groupBuyingCommitments.findMany({
            where: and(eq(groupBuyingCommitments.tenantId, input.tenantId), eq(groupBuyingCommitments.campaignId, campaign.id)),
          }),
          tx.query.productionBatchAllocations.findMany({
            where: and(eq(productionBatchAllocations.tenantId, input.tenantId), eq(productionBatchAllocations.productionBatchId, current.id)),
          }),
          candidate.carrierBookingAuthorizationId
            ? tx.query.carrierBookingAuthorizations.findFirst({
                where: and(
                  eq(carrierBookingAuthorizations.tenantId, input.tenantId),
                  eq(carrierBookingAuthorizations.id, candidate.carrierBookingAuthorizationId),
                ),
              })
            : Promise.resolve(null),
          tx.query.groupSettlementPlans.findFirst({
            where: and(eq(groupSettlementPlans.tenantId, input.tenantId), eq(groupSettlementPlans.productionBatchId, current.id)),
          }),
        ]);
        const evaluation = evaluateProductionBatchTransition({
          tenantId: input.tenantId,
          currentStatus: current.status,
          nextStatus,
          campaign,
          batch: candidate,
          commitments,
          allocations,
          carrierBooking: carrierBooking || null,
          settlementPlan: settlementPlan || null,
        });
        if (!evaluation.valid) {
          throw new GroupBuyingError("production_batch_transition_blocked", evaluation.blockers.join(", "), 409, evaluation.blockers);
        }
        const [updatedBatch] = await tx
          .update(productionBatches)
          .set({
            status: nextStatus,
            allocatedQuantity: candidate.allocatedQuantity,
            producedQuantity: candidate.producedQuantity,
            passedInspectionQuantity: candidate.passedInspectionQuantity,
            readyQuantity: candidate.readyQuantity,
            handedToCarrierQuantity: candidate.handedToCarrierQuantity,
            deliveredQuantity: candidate.deliveredQuantity,
            carrierBookingAuthorizationId: candidate.carrierBookingAuthorizationId,
            capacityEvidence: candidate.capacityEvidence,
            productionEvidence: candidate.productionEvidence,
            inspectionEvidence: candidate.inspectionEvidence,
            handoffEvidence: candidate.handoffEvidence,
            deliveryEvidence: candidate.deliveryEvidence,
            settlementEvidence: candidate.settlementEvidence,
            externalProductionExecuted: candidate.externalProductionExecuted,
            externalCarrierHandoffExecuted: candidate.externalCarrierHandoffExecuted,
            externalSettlementExecuted: candidate.externalSettlementExecuted,
            approvedByUserId: candidate.approvedByUserId,
            startedAt: candidate.startedAt,
            readyAt: candidate.readyAt,
            handedToCarrierAt: candidate.handedToCarrierAt,
            deliveredAt: candidate.deliveredAt,
            settledAt: candidate.settledAt,
            failedAt: candidate.failedAt,
            updatedByUserId: input.actorUserId,
            updatedAt: now,
          })
          .where(and(eq(productionBatches.tenantId, input.tenantId), eq(productionBatches.id, current.id)))
          .returning();
        const mappedCampaignStatus = campaignStatusForBatch(nextStatus);
        let updatedCampaign = campaign;
        if (mappedCampaignStatus && mappedCampaignStatus !== campaign.status) {
          const transition = evaluateCampaignTransition(campaign.status, mappedCampaignStatus);
          if (!transition.valid) {
            throw new GroupBuyingError("group_buying_campaign_transition_blocked", transition.blockers.join(", "), 409, transition.blockers);
          }
          [updatedCampaign] = await tx
            .update(groupBuyingCampaigns)
            .set({
              status: mappedCampaignStatus,
              fulfilledQuantity: nextStatus === "delivered" || nextStatus === "settlement_pending" || nextStatus === "settled"
                ? candidate.deliveredQuantity
                : campaign.fulfilledQuantity,
              externalSettlementExecuted: nextStatus === "settled" ? true : campaign.externalSettlementExecuted,
              settledAt: nextStatus === "settled" ? candidate.settledAt : campaign.settledAt,
              failedAt: nextStatus === "failed" ? candidate.failedAt : campaign.failedAt,
              updatedAt: now,
            })
            .where(and(eq(groupBuyingCampaigns.tenantId, input.tenantId), eq(groupBuyingCampaigns.id, campaign.id)))
            .returning();
        }
        if (nextStatus === "delivered") {
          await tx
            .update(productionBatchAllocations)
            .set({ status: "fulfilled", fulfilledAt: now, updatedAt: now })
            .where(and(eq(productionBatchAllocations.tenantId, input.tenantId), eq(productionBatchAllocations.productionBatchId, current.id)));
          await tx
            .update(groupBuyingCommitments)
            .set({ status: "fulfilled", updatedByUserId: input.actorUserId, updatedAt: now })
            .where(and(eq(groupBuyingCommitments.tenantId, input.tenantId), eq(groupBuyingCommitments.campaignId, campaign.id), inArray(groupBuyingCommitments.id, allocations.map((row: typeof productionBatchAllocations.$inferSelect) => row.commitmentId))));
        }
        await appendCampaignEvent(tx, {
          tenantId: input.tenantId,
          campaignId: campaign.id,
          idempotencyKey: `production-batch:${current.id}:${nextStatus}`,
          eventType: `production_batch_${nextStatus}`,
          actorUserId: input.actorUserId,
          previousStatus: campaign.status as GroupBuyingCampaignStatus,
          nextStatus: mappedCampaignStatus || (campaign.status as GroupBuyingCampaignStatus),
          publicMessage,
          internalNote,
          evidence: [{
            actionRunId,
            productionBatchId: current.id,
            previousBatchStatus: current.status,
            nextBatchStatus: nextStatus,
            externalProviderActionExecuted: false,
          }],
        });
        return { productionBatch: updatedBatch, campaign: updatedCampaign, idempotentReplay: false };
      }),
    evidence: (result) => [{
      evidenceType: "production_batch_state_recorded",
      payload: {
        productionBatchId: result.productionBatch.id,
        status: result.productionBatch.status,
        externalProviderActionExecuted: false,
      },
    }],
  });
  return {
    ...governed.result,
    actionRunId: governed.actionRunId,
    externalProviderActionExecuted: false,
  };
}

export async function publishGroupBuyingUpdate(input: {
  tenantId: number;
  actorUserId: number | null;
  campaignId: string;
  idempotencyKey: unknown;
  audience: unknown;
  title: unknown;
  body: unknown;
  evidence: unknown;
  confirmed: boolean;
}) {
  if (!input.actorUserId) throw new GroupBuyingError("group_buying_actor_required", "An accountable tenant administrator is required", 403);
  if (!input.confirmed) throw new GroupBuyingError("group_buying_update_confirmation_required", "Campaign-update publication confirmation is required", 400);
  const campaignId = requireUuid(input.campaignId, "campaignId");
  const key = idempotencyKey(input.idempotencyKey);
  const audience = String(input.audience || "buyers").trim().toLowerCase();
  if (!["buyers", "public", "operations"].includes(audience)) {
    throw new GroupBuyingError("group_buying_update_audience_invalid", "Update audience must be buyers, public, or operations", 400);
  }
  const title = requiredText(input.title, "title", 180);
  const body = requiredText(input.body, "body", 5000);
  assertCommerceOnlyLanguage({ title, body });
  const evidence = sanitizeGroupBuyingEvidence(input.evidence);
  if (!Object.keys(evidence).length) throw new GroupBuyingError("group_buying_update_evidence_required", "Campaign updates require material evidence", 400);
  const campaign = await db.query.groupBuyingCampaigns.findFirst({
    where: and(eq(groupBuyingCampaigns.tenantId, input.tenantId), eq(groupBuyingCampaigns.id, campaignId)),
  });
  if (!campaign) throw new GroupBuyingError("group_buying_campaign_not_found", "Group-buying campaign not found", 404);
  if (["draft", "verification_required"].includes(campaign.status)) {
    throw new GroupBuyingError("group_buying_update_campaign_not_public", "The campaign must be live before publishing an update", 409);
  }

  const governed = await governedAction({
    tenantId: input.tenantId,
    actorUserId: input.actorUserId,
    actionKey: "GROUP_BUYING_UPDATE_PUBLISH",
    correlationId: `group-buying:update:${campaignId}:${key}`,
    payload: { campaignId, audience, title },
    work: async (actionRunId) =>
      db.transaction(async (tx) => {
        await advisoryLock(tx, input.tenantId, `group-buying:campaign:${campaignId}`);
        const eventKey = `campaign-update:${key}`;
        const priorEvent = await tx.query.groupBuyingEvents.findFirst({
          where: and(eq(groupBuyingEvents.tenantId, input.tenantId), eq(groupBuyingEvents.idempotencyKey, eventKey)),
        });
        if (priorEvent) {
          const priorUpdateId = String(asRecord(priorEvent.metadata).updateId || "");
          const priorUpdate = priorUpdateId
            ? await tx.query.groupBuyingUpdates.findFirst({
                where: and(eq(groupBuyingUpdates.tenantId, input.tenantId), eq(groupBuyingUpdates.id, priorUpdateId)),
              })
            : null;
          if (priorUpdate) return { update: priorUpdate, idempotentReplay: true };
        }
        const current = await tx.query.groupBuyingCampaigns.findFirst({
          where: and(eq(groupBuyingCampaigns.tenantId, input.tenantId), eq(groupBuyingCampaigns.id, campaignId)),
        });
        if (!current || ["draft", "verification_required"].includes(current.status)) {
          throw new GroupBuyingError("group_buying_update_campaign_not_public", "The campaign is not eligible for a published update", 409);
        }
        const now = new Date();
        const [update] = await tx
          .insert(groupBuyingUpdates)
          .values({
            tenantId: input.tenantId,
            campaignId,
            status: "published",
            audience,
            title,
            body,
            evidence: {
              ...evidence,
              humanApproved: true,
              credentialsExcluded: true,
              actionRunId,
            },
            createdByUserId: input.actorUserId,
            approvedByUserId: input.actorUserId,
            approvedAt: now,
            publishedAt: now,
            createdAt: now,
            updatedAt: now,
          })
          .returning();
        await appendCampaignEvent(tx, {
          tenantId: input.tenantId,
          campaignId,
          idempotencyKey: eventKey,
          eventType: "campaign_update_published",
          actorUserId: input.actorUserId,
          publicMessage: audience === "operations" ? null : body,
          internalNote: audience === "operations" ? body : null,
          evidence: [{ actionRunId, updateId: update.id, humanApproved: true }],
          metadata: { updateId: update.id, audience },
        });
        return { update, idempotentReplay: false };
      }),
    evidence: (result) => [{
      evidenceType: "group_buying_update_published",
      payload: {
        campaignId,
        updateId: result.update.id,
        audience: result.update.audience,
        externalPlatformPublicationExecuted: false,
      },
    }],
  });
  return {
    ...governed.result,
    actionRunId: governed.actionRunId,
    externalPlatformPublicationExecuted: false,
  };
}

function settlementAllocation(value: unknown, index: number, currency: string): GroupSettlementAllocationInput {
  const row = asRecord(value);
  const recipientRole = requiredText(row.recipientRole, `allocations[${index}].recipientRole`, 80);
  if (!GROUP_SETTLEMENT_ROLES.includes(recipientRole as any)) {
    throw new GroupBuyingError("group_settlement_role_invalid", `allocations[${index}].recipientRole is unsupported`, 400);
  }
  return {
    commitmentId: row.commitmentId ? requireUuid(row.commitmentId, `allocations[${index}].commitmentId`) : null,
    recipientRole,
    recipientReference: optionalText(row.recipientReference, 240),
    amountMinor: nonNegativeMinor(row.amountMinor, `allocations[${index}].amountMinor`),
    currencyCode: currencyCode(row.currencyCode || currency),
    calculationBasis: requiredText(row.calculationBasis, `allocations[${index}].calculationBasis`, 2000),
    evidence: sanitizeGroupBuyingEvidence(row.evidence),
  };
}

export async function prepareGroupSettlementPlan(input: {
  tenantId: number;
  actorUserId: number | null;
  productionBatchId: string;
  idempotencyKey: unknown;
  refundExposureMinor: unknown;
  currencyCode: unknown;
  allocations: unknown;
  calculationEvidence: unknown;
  confirmed: boolean;
}) {
  if (!input.actorUserId) throw new GroupBuyingError("group_buying_actor_required", "An accountable tenant administrator is required", 403);
  if (!input.confirmed) throw new GroupBuyingError("group_settlement_preparation_confirmation_required", "Settlement-plan preparation confirmation is required", 400);
  const productionBatchId = requireUuid(input.productionBatchId, "productionBatchId");
  const key = idempotencyKey(input.idempotencyKey);
  const currency = currencyCode(input.currencyCode);
  const refundExposureMinor = nonNegativeMinor(input.refundExposureMinor, "refundExposureMinor");
  if (!Array.isArray(input.allocations) || !input.allocations.length || input.allocations.length > 2000) {
    throw new GroupBuyingError("group_settlement_allocations_required", "One to two thousand settlement allocations are required", 400);
  }
  const allocations = input.allocations.map((row, index) => settlementAllocation(row, index, currency));
  const calculationEvidence = sanitizeGroupBuyingEvidence(input.calculationEvidence);
  const existing = await db.query.groupSettlementPlans.findFirst({
    where: and(eq(groupSettlementPlans.tenantId, input.tenantId), eq(groupSettlementPlans.idempotencyKey, key)),
  });
  if (existing) return { settlementPlan: existing, idempotentReplay: true, externalSettlementExecuted: existing.externalSettlementExecuted };
  const productionBatch = await db.query.productionBatches.findFirst({
    where: and(eq(productionBatches.tenantId, input.tenantId), eq(productionBatches.id, productionBatchId)),
  });
  if (!productionBatch) throw new GroupBuyingError("production_batch_not_found", "Production batch not found", 404);
  if (productionBatch.status !== "delivered") {
    throw new GroupBuyingError("group_settlement_batch_not_delivered", "Settlement planning requires a fully delivered production batch", 409);
  }
  const campaign = await db.query.groupBuyingCampaigns.findFirst({
    where: and(eq(groupBuyingCampaigns.tenantId, input.tenantId), eq(groupBuyingCampaigns.id, productionBatch.campaignId)),
  });
  if (!campaign || campaign.status !== "delivered") {
    throw new GroupBuyingError("group_settlement_campaign_not_delivered", "Settlement planning requires a delivered campaign", 409);
  }
  const paidCommitments = await db.query.groupBuyingCommitments.findMany({
    where: and(
      eq(groupBuyingCommitments.tenantId, input.tenantId),
      eq(groupBuyingCommitments.campaignId, campaign.id),
      inArray(groupBuyingCommitments.status, ["payment_confirmed", "allocated_to_batch", "fulfilled"]),
    ),
  });
  const grossCollectedMinor = paidCommitments.reduce(
    (sum, row) => sum + nonNegativeMinor(row.totalAmountMinor, `commitment:${row.id}.totalAmountMinor`),
    0,
  );
  const evaluation = evaluateSettlementPlan({
    grossCollectedMinor,
    refundExposureMinor,
    currencyCode: currency,
    paidCommitments: paidCommitments.map((row) => ({
      id: row.id,
      totalAmountMinor: Number(row.totalAmountMinor),
      currencyCode: row.currencyCode,
      canonicalPaymentVerified: row.canonicalPaymentVerified,
    })),
    allocations,
    calculationEvidence,
  });
  if (!evaluation.valid) {
    throw new GroupBuyingError("group_settlement_plan_invalid", evaluation.blockers.join(", "), 409, evaluation.blockers);
  }

  const governed = await governedAction({
    tenantId: input.tenantId,
    actorUserId: input.actorUserId,
    actionKey: "GROUP_SETTLEMENT_PREPARE",
    correlationId: `group-buying:settlement:${productionBatchId}:${key}`,
    payload: { productionBatchId, grossCollectedMinor, refundExposureMinor, currencyCode: currency },
    work: async (actionRunId) =>
      db.transaction(async (tx) => {
        await advisoryLock(tx, input.tenantId, `group-buying:batch:${productionBatchId}`);
        const duplicate = await tx.query.groupSettlementPlans.findFirst({
          where: and(eq(groupSettlementPlans.tenantId, input.tenantId), eq(groupSettlementPlans.idempotencyKey, key)),
        });
        if (duplicate) return { settlementPlan: duplicate, allocations: [], productionBatch, idempotentReplay: true };
        const currentBatch = await tx.query.productionBatches.findFirst({
          where: and(eq(productionBatches.tenantId, input.tenantId), eq(productionBatches.id, productionBatchId)),
        });
        if (!currentBatch || currentBatch.status !== "delivered") {
          throw new GroupBuyingError("group_settlement_batch_changed", "Production batch is no longer in the delivered state", 409);
        }
        const currentCommitments = await tx.query.groupBuyingCommitments.findMany({
          where: and(
            eq(groupBuyingCommitments.tenantId, input.tenantId),
            eq(groupBuyingCommitments.campaignId, campaign.id),
            inArray(groupBuyingCommitments.status, ["payment_confirmed", "allocated_to_batch", "fulfilled"]),
          ),
        });
        const currentGross = currentCommitments.reduce(
          (sum: number, row: typeof groupBuyingCommitments.$inferSelect) => sum + Number(row.totalAmountMinor),
          0,
        );
        const currentEvaluation = evaluateSettlementPlan({
          grossCollectedMinor: currentGross,
          refundExposureMinor,
          currencyCode: currency,
          paidCommitments: currentCommitments.map((row: typeof groupBuyingCommitments.$inferSelect) => ({
            id: row.id,
            totalAmountMinor: Number(row.totalAmountMinor),
            currencyCode: row.currencyCode,
            canonicalPaymentVerified: row.canonicalPaymentVerified,
          })),
          allocations,
          calculationEvidence,
        });
        if (!currentEvaluation.valid || currentGross !== grossCollectedMinor) {
          throw new GroupBuyingError("group_settlement_plan_changed", currentEvaluation.blockers.join(", ") || "Paid-order totals changed", 409, currentEvaluation.blockers);
        }
        const now = new Date();
        const [settlementPlan] = await tx
          .insert(groupSettlementPlans)
          .values({
            tenantId: input.tenantId,
            campaignId: campaign.id,
            productionBatchId,
            idempotencyKey: key,
            status: "approval_required",
            grossCollectedMinor,
            refundExposureMinor,
            distributableMinor: currentEvaluation.distributableMinor,
            currencyCode: currency,
            calculationEvidence: {
              ...calculationEvidence,
              verified: true,
              credentialsExcluded: true,
              canonicalPaidOrderCount: currentCommitments.length,
              actionRunId,
            },
            approvalEvidence: {},
            providerEvidence: {},
            externalSettlementExecuted: false,
            preparationActionRunId: actionRunId,
            preparedByUserId: input.actorUserId,
            createdAt: now,
            updatedAt: now,
          })
          .returning();
        const createdAllocations = await tx
          .insert(groupSettlementAllocations)
          .values(
            allocations.map((allocation) => ({
              tenantId: input.tenantId,
              settlementPlanId: settlementPlan.id,
              commitmentId: allocation.commitmentId || null,
              recipientRole: allocation.recipientRole,
              recipientReference: allocation.recipientReference || null,
              amountMinor: allocation.amountMinor,
              currencyCode: allocation.currencyCode,
              calculationBasis: allocation.calculationBasis,
              evidence: allocation.evidence || {},
              createdAt: now,
              updatedAt: now,
            })),
          )
          .returning();
        const [updatedBatch] = await tx
          .update(productionBatches)
          .set({ status: "settlement_pending", updatedByUserId: input.actorUserId, updatedAt: now })
          .where(and(eq(productionBatches.tenantId, input.tenantId), eq(productionBatches.id, productionBatchId)))
          .returning();
        await appendCampaignEvent(tx, {
          tenantId: input.tenantId,
          campaignId: campaign.id,
          idempotencyKey: `settlement-plan-prepared:${settlementPlan.id}`,
          eventType: "settlement_plan_prepared",
          actorUserId: input.actorUserId,
          publicMessage: "Delivery is complete. An explainable settlement plan is awaiting accountable approval.",
          internalNote: "No provider settlement was submitted by this preparation action.",
          evidence: [{
            settlementPlanId: settlementPlan.id,
            grossCollectedMinor,
            refundExposureMinor,
            allocationCount: createdAllocations.length,
            externalSettlementExecuted: false,
          }],
        });
        return { settlementPlan, allocations: createdAllocations, productionBatch: updatedBatch, idempotentReplay: false };
      }),
    evidence: (result) => [{
      evidenceType: "group_settlement_plan_prepared",
      payload: {
        settlementPlanId: result.settlementPlan.id,
        productionBatchId,
        allocationCount: result.allocations.length,
        balanced: true,
        externalSettlementExecuted: false,
      },
    }],
  });
  return {
    ...governed.result,
    actionRunId: governed.actionRunId,
    externalSettlementExecuted: false,
    providerSettlementConfirmed: false,
  };
}

export async function approveGroupSettlementPlan(input: {
  tenantId: number;
  actorUserId: number | null;
  settlementPlanId: string;
  approvalReference: unknown;
  rationale: unknown;
  approvalEvidence?: unknown;
  confirmed: boolean;
}) {
  if (!input.actorUserId) throw new GroupBuyingError("group_buying_actor_required", "An accountable tenant administrator is required", 403);
  if (!input.confirmed) throw new GroupBuyingError("group_settlement_approval_confirmation_required", "Settlement-plan approval confirmation is required", 400);
  const settlementPlanId = requireUuid(input.settlementPlanId, "settlementPlanId");
  const approvalReference = requiredText(input.approvalReference, "approvalReference", 240);
  const rationale = requiredText(input.rationale, "rationale", 2000);
  if (rationale.length < 12) throw new GroupBuyingError("group_settlement_rationale_required", "Approval rationale must contain at least twelve characters", 400);
  const suppliedEvidence = sanitizeGroupBuyingEvidence(input.approvalEvidence);
  const plan = await db.query.groupSettlementPlans.findFirst({
    where: and(eq(groupSettlementPlans.tenantId, input.tenantId), eq(groupSettlementPlans.id, settlementPlanId)),
  });
  if (!plan) throw new GroupBuyingError("group_settlement_plan_not_found", "Settlement plan not found", 404);
  if (plan.status === "approved_submission_ready") {
    return { settlementPlan: plan, idempotentReplay: true, providerSubmissionExecuted: false };
  }
  if (plan.status !== "approval_required") {
    throw new GroupBuyingError("group_settlement_plan_not_approvable", "Only an approval-required settlement plan can be approved", 409);
  }
  if (plan.externalSettlementExecuted) {
    throw new GroupBuyingError("group_settlement_external_state_conflict", "A preparation-only plan cannot already claim external settlement execution", 409);
  }
  const allocations = await db.query.groupSettlementAllocations.findMany({
    where: and(eq(groupSettlementAllocations.tenantId, input.tenantId), eq(groupSettlementAllocations.settlementPlanId, plan.id)),
  });
  const allocationTotal = allocations.reduce((sum, row) => sum + Number(row.amountMinor), 0);
  if (allocationTotal !== Number(plan.grossCollectedMinor)) {
    throw new GroupBuyingError("group_settlement_plan_unbalanced", "Settlement allocations no longer equal the canonical gross amount", 409);
  }

  const governed = await governedAction({
    tenantId: input.tenantId,
    actorUserId: input.actorUserId,
    actionKey: "GROUP_SETTLEMENT_AUTHORIZE",
    correlationId: `group-buying:settlement-approve:${plan.id}`,
    payload: { settlementPlanId: plan.id, approvalReference },
    work: async (actionRunId) =>
      db.transaction(async (tx) => {
        await advisoryLock(tx, input.tenantId, `group-buying:settlement:${plan.id}`);
        const current = await tx.query.groupSettlementPlans.findFirst({
          where: and(eq(groupSettlementPlans.tenantId, input.tenantId), eq(groupSettlementPlans.id, plan.id)),
        });
        if (!current) throw new GroupBuyingError("group_settlement_plan_not_found", "Settlement plan not found", 404);
        if (current.status === "approved_submission_ready") return { settlementPlan: current, idempotentReplay: true };
        if (current.status !== "approval_required" || current.externalSettlementExecuted) {
          throw new GroupBuyingError("group_settlement_plan_changed", "Settlement plan changed before approval", 409);
        }
        const now = new Date();
        const [updated] = await tx
          .update(groupSettlementPlans)
          .set({
            status: "approved_submission_ready",
            approvalEvidence: {
              ...suppliedEvidence,
              humanApproved: true,
              credentialsExcluded: true,
              approvalReference,
              rationale,
              actionRunId,
              approvedAt: now.toISOString(),
            },
            externalSettlementExecuted: false,
            approvalActionRunId: actionRunId,
            approvedByUserId: input.actorUserId,
            approvedAt: now,
            updatedAt: now,
          })
          .where(and(eq(groupSettlementPlans.tenantId, input.tenantId), eq(groupSettlementPlans.id, current.id)))
          .returning();
        await appendCampaignEvent(tx, {
          tenantId: input.tenantId,
          campaignId: updated.campaignId,
          idempotencyKey: `settlement-plan-approved:${updated.id}`,
          eventType: "settlement_plan_approved_submission_ready",
          actorUserId: input.actorUserId,
          publicMessage: "The explainable settlement plan passed accountable review and is ready for a separate provider submission step.",
          internalNote: rationale,
          evidence: [{ settlementPlanId: updated.id, humanApproved: true, providerSubmissionExecuted: false }],
        });
        return { settlementPlan: updated, idempotentReplay: false };
      }),
    evidence: (result) => [{
      evidenceType: "group_settlement_plan_authorized",
      payload: {
        settlementPlanId: result.settlementPlan.id,
        status: result.settlementPlan.status,
        humanApproved: true,
        providerSubmissionExecuted: false,
      },
    }],
  });
  return {
    ...governed.result,
    actionRunId: governed.actionRunId,
    providerSubmissionExecuted: false,
    externalSettlementExecuted: false,
    providerSettlementConfirmed: false,
  };
}
