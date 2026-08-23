import crypto from "node:crypto";

import { db } from "@db";
import {
  adAccountConnections,
  adCampaigns,
  adCreatives,
  attributionRecords,
  auditLogs,
  conversionEvents,
  geoTerritories,
  industrialFulfillmentPlans,
  industrialOrders,
  payments,
  socialPublicationAttempts,
} from "@db/schema";
import { and, eq, or, sql } from "drizzle-orm";

import {
  completeRunFailure,
  completeRunSuccess,
  createActionRun,
} from "../actions/actionRuns";
import { getMediaRightsState } from "./mediaRights";
import {
  evaluateCanonicalFulfilledOrderAttribution,
  type CanonicalCommerceSourceKind,
} from "./canonicalCommerceAttributionPolicy";
import { recordTerritoryScorecardEvidence } from "./territoryScorecard";
import { TERRITORY_MEDIA_COMMERCE_METRIC_KEYS } from "./territoryScorecardPolicy";

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function rows(result: any): any[] {
  if (Array.isArray(result?.rows)) return result.rows;
  return Array.isArray(result) ? result : [];
}

function value(result: any, key: string) {
  const parsed = Number(rows(result)[0]?.[key]);
  return Number.isFinite(parsed) ? parsed : 0;
}

function boundedId(value: unknown, field: string) {
  const id = String(value || "").trim();
  if (!id) throw new Error(`${field} is required`);
  if (id.length > 180) throw new Error(`${field} is too long`);
  return id;
}

function normalizedIdempotencyKey(value: unknown, tenantId: number) {
  const key = boundedId(value, "idempotencyKey");
  if (key.length < 8) throw new Error("idempotencyKey must contain at least 8 characters");
  return `canonical-commerce:${tenantId}:${key}`;
}

function checksum(value: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function monthBounds(monthInput: unknown) {
  const month = String(monthInput || "").trim();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("month must use YYYY-MM");
  const [year, monthNumber] = month.split("-").map(Number);
  const start = new Date(Date.UTC(year, monthNumber - 1, 1));
  const endExclusive = new Date(Date.UTC(year, monthNumber, 1));
  const end = new Date(endExclusive.getTime() - 1);
  return { month, start, end, endExclusive };
}

function sourceBindingChecksum(input: {
  orderId: string;
  paymentId: string;
  fulfillmentPlanId: string;
  sourceKind: CanonicalCommerceSourceKind;
  campaignId?: string | null;
  creativeId?: string | null;
  publicationAttemptId?: string | null;
  attributionEvidence: unknown;
}) {
  return checksum({
    bindingVersion: 1,
    orderId: input.orderId,
    paymentId: input.paymentId,
    fulfillmentPlanId: input.fulfillmentPlanId,
    sourceKind: input.sourceKind,
    campaignId: input.campaignId || null,
    creativeId: input.creativeId || null,
    publicationAttemptId: input.publicationAttemptId || null,
    attributionEvidence: input.attributionEvidence,
  });
}

async function replayView(existing: typeof conversionEvents.$inferSelect) {
  const attribution = await db.query.attributionRecords.findFirst({
    where: and(
      eq(attributionRecords.tenantId, existing.tenantId),
      eq(attributionRecords.conversionEventId, existing.id),
    ),
  });
  return {
    idempotentReplay: true,
    conversion: existing,
    attribution: attribution || null,
    actionRunId: existing.reconciliationActionRunId,
    externalActionPerformed: false as const,
    backgroundExecutionStarted: false as const,
    credentialsExposed: false as const,
  };
}

export class CanonicalCommerceAttributionBlockedError extends Error {
  constructor(public readonly blockers: string[]) {
    super(`CANONICAL_COMMERCE_ATTRIBUTION_BLOCKED:${blockers.join(",")}`);
    this.name = "CanonicalCommerceAttributionBlockedError";
  }
}

export async function reconcileCanonicalFulfilledOrderAttribution(input: {
  tenantId: number;
  actorUserId: number | null;
  confirmed: boolean;
  idempotencyKey: unknown;
  orderId: unknown;
  paymentId: unknown;
  fulfillmentPlanId: unknown;
  sourceKind: unknown;
  campaignId?: unknown;
  creativeId?: unknown;
  publicationAttemptId?: unknown;
  attributionEvidence: unknown;
}) {
  if (!input.actorUserId) throw new Error("An authenticated reconciliation user is required");
  if (input.confirmed !== true) {
    throw new Error("Accountable canonical attribution confirmation is required");
  }
  const orderId = boundedId(input.orderId, "orderId");
  const paymentId = boundedId(input.paymentId, "paymentId");
  const fulfillmentPlanId = boundedId(input.fulfillmentPlanId, "fulfillmentPlanId");
  const sourceKind = String(input.sourceKind || "").trim().toLowerCase() as CanonicalCommerceSourceKind;
  const idempotencyKey = normalizedIdempotencyKey(input.idempotencyKey, input.tenantId);
  const campaignId = sourceKind === "ad_campaign" ? boundedId(input.campaignId, "campaignId") : null;
  const creativeId = sourceKind === "ad_campaign" ? boundedId(input.creativeId, "creativeId") : null;
  const publicationAttemptId = sourceKind === "social_publication"
    ? boundedId(input.publicationAttemptId, "publicationAttemptId")
    : null;

  const [order, payment, fulfillmentPlan, campaign, creative, publicationAttempt] = await Promise.all([
    db.query.industrialOrders.findFirst({
      where: and(eq(industrialOrders.tenantId, input.tenantId), eq(industrialOrders.id, orderId)),
    }),
    db.query.payments.findFirst({
      where: and(eq(payments.tenantId, input.tenantId), eq(payments.id, paymentId)),
    }),
    db.query.industrialFulfillmentPlans.findFirst({
      where: and(
        eq(industrialFulfillmentPlans.tenantId, input.tenantId),
        eq(industrialFulfillmentPlans.id, fulfillmentPlanId),
      ),
    }),
    campaignId
      ? db.query.adCampaigns.findFirst({
          where: and(eq(adCampaigns.tenantId, input.tenantId), eq(adCampaigns.id, campaignId)),
        })
      : Promise.resolve(null),
    creativeId
      ? db.query.adCreatives.findFirst({
          where: and(eq(adCreatives.tenantId, input.tenantId), eq(adCreatives.id, creativeId)),
        })
      : Promise.resolve(null),
    publicationAttemptId
      ? db.query.socialPublicationAttempts.findFirst({
          where: and(
            eq(socialPublicationAttempts.tenantId, input.tenantId),
            eq(socialPublicationAttempts.id, publicationAttemptId),
          ),
        })
      : Promise.resolve(null),
  ]);

  const sourceMediaItemId = String(creative?.mediaItemId || publicationAttempt?.mediaItemId || "").trim();
  let channel = String(publicationAttempt?.channel || "web").trim().toLowerCase();
  if (campaign) {
    const account = await db.query.adAccountConnections.findFirst({
      where: and(
        eq(adAccountConnections.tenantId, input.tenantId),
        eq(adAccountConnections.id, campaign.adAccountConnectionId),
      ),
      columns: { platform: true },
    });
    channel = String(account?.platform || "web").trim().toLowerCase();
  }
  const territoryId = Number(campaign?.territoryId || publicationAttempt?.territoryId || 0) || null;
  const rights = sourceMediaItemId
    ? await getMediaRightsState({
        tenantId: input.tenantId,
        mediaItemId: sourceMediaItemId,
        usageType: sourceKind === "ad_campaign" ? "paid_ad" : "organic_publication",
        channel,
        territoryId,
      })
    : null;

  const evaluation = evaluateCanonicalFulfilledOrderAttribution({
    tenantId: input.tenantId,
    sourceKind,
    order: order as any,
    payment: payment as any,
    fulfillmentPlan: fulfillmentPlan as any,
    campaign: campaign as any,
    creative: creative as any,
    publicationAttempt: publicationAttempt as any,
    rightsEligibility: rights?.eligibility as any,
    attributionEvidence: input.attributionEvidence,
  });
  if (!evaluation.eligible) throw new CanonicalCommerceAttributionBlockedError(evaluation.blockers);

  const payloadChecksum = sourceBindingChecksum({
    orderId,
    paymentId,
    fulfillmentPlanId,
    sourceKind,
    campaignId,
    creativeId,
    publicationAttemptId,
    attributionEvidence: evaluation.attributionEvidence,
  });
  const existing = await db.query.conversionEvents.findFirst({
    where: and(
      eq(conversionEvents.tenantId, input.tenantId),
      or(
        eq(conversionEvents.idempotencyKey, idempotencyKey),
        eq(conversionEvents.industrialOrderId, orderId),
      ),
    ),
  });
  if (existing) {
    if (String(asRecord(existing.bindingEvidence).payloadChecksum || "") !== payloadChecksum) {
      throw new Error("The idempotency key or industrial order is already bound to different attribution evidence");
    }
    return replayView(existing);
  }

  const actionRun = await createActionRun({
    tenantId: input.tenantId,
    actionKey: "COMMERCE_ATTRIBUTION_RECONCILE",
    requestedByUserId: input.actorUserId,
    correlationId: idempotencyKey,
    payload: {
      orderId,
      paymentId,
      fulfillmentPlanId,
      sourceKind,
      campaignId,
      creativeId,
      publicationAttemptId,
      territoryId: evaluation.territoryId,
      confirmed: true,
    },
  });

  try {
    const result = await db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`canonical-commerce:${input.tenantId}:${orderId}`}))`,
      );
      const concurrent = await tx.query.conversionEvents.findFirst({
        where: and(
          eq(conversionEvents.tenantId, input.tenantId),
          or(
            eq(conversionEvents.idempotencyKey, idempotencyKey),
            eq(conversionEvents.industrialOrderId, orderId),
          ),
        ),
      });
      if (concurrent) {
        if (String(asRecord(concurrent.bindingEvidence).payloadChecksum || "") !== payloadChecksum) {
          throw new Error("The industrial order was concurrently bound to different attribution evidence");
        }
        const attribution = await tx.query.attributionRecords.findFirst({
          where: and(
            eq(attributionRecords.tenantId, input.tenantId),
            eq(attributionRecords.conversionEventId, concurrent.id),
          ),
        });
        return { conversion: concurrent, attribution: attribution || null, idempotentReplay: true };
      }

      const now = new Date();
      const bindingEvidence = {
        verified: true,
        credentialsExcluded: true,
        bindingVersion: 1,
        payloadChecksum,
        policyBlockers: [],
        attributionEvidence: evaluation.attributionEvidence,
        sourceOccurredAt: evaluation.sourceOccurredAt?.toISOString() || null,
        reconciledAt: now.toISOString(),
      };
      const [conversion] = await tx
        .insert(conversionEvents)
        .values({
          tenantId: input.tenantId,
          campaignId,
          territoryId: evaluation.territoryId!,
          industrialOrderId: orderId,
          paymentId,
          fulfillmentPlanId,
          publicationAttemptId,
          sourceKind,
          canonicalBindingStatus: "verified",
          bindingEvidence,
          idempotencyKey,
          reconciliationActionRunId: actionRun.id,
          reconciledByUserId: input.actorUserId,
          reconciledAt: now,
          provider: "exportunity",
          providerEventId: `canonical:fulfilled-order:${orderId}`,
          eventType: "fulfilled_order",
          orderReference: order!.referenceCode,
          productReference: order!.catalogItemId || null,
          valueMinor: evaluation.amountMinor!,
          currencyCode: evaluation.currencyCode!,
          verificationStatus: "verified",
          evidence: {
            canonicalBinding: true,
            credentialsExcluded: true,
            sourceType: "canonical_ledger",
            industrialOrderId: orderId,
            paymentId,
            fulfillmentPlanId,
            sourceKind,
            campaignId,
            creativeId,
            publicationAttemptId,
            payloadChecksum,
          },
          occurredAt: evaluation.occurredAt!,
          verifiedAt: now,
          createdAt: now,
        })
        .returning();
      if (!conversion) throw new Error("Canonical conversion event was not persisted");

      const [attribution] = await tx
        .insert(attributionRecords)
        .values({
          tenantId: input.tenantId,
          conversionEventId: conversion.id,
          campaignId,
          creativeId,
          territoryId: evaluation.territoryId!,
          publicationAttemptId,
          mediaItemId: evaluation.mediaItemId!,
          sourceReferenceId: evaluation.sourceReferenceId!,
          rightsGrantId: evaluation.rightsGrantId!,
          attributionModel: "canonical_fulfilled_order_last_touch",
          touchpointReference: evaluation.touchpointReference!,
          weightBps: 10_000,
          attributedValueMinor: evaluation.amountMinor!,
          evidence: {
            canonicalBinding: true,
            credentialsExcluded: true,
            attributionEvidence: evaluation.attributionEvidence,
            payloadChecksum,
          },
          createdAt: now,
        })
        .returning();
      if (!attribution) throw new Error("Canonical attribution record was not persisted");

      await tx.insert(auditLogs).values({
        tenantId: input.tenantId,
        userId: input.actorUserId,
        userRole: "admin",
        action: "commerce.attribution.reconciled",
        entityType: "conversion_event",
        entityId: null,
        metadata: {
          conversionEventId: conversion.id,
          attributionRecordId: attribution.id,
          territoryId: evaluation.territoryId,
          industrialOrderId: orderId,
          sourceKind,
          payloadChecksum,
          credentialsExcluded: true,
          externalActionPerformed: false,
          backgroundExecutionStarted: false,
        },
        createdAt: now,
      });
      return { conversion, attribution, idempotentReplay: false };
    });

    await completeRunSuccess({
      tenantId: input.tenantId,
      runId: actionRun.id,
      enforceEvidence: true,
      result: {
        conversionEventId: result.conversion.id,
        attributionRecordId: result.attribution?.id || null,
        industrialOrderId: orderId,
        territoryId: evaluation.territoryId,
        sourceKind,
        idempotentReplay: result.idempotentReplay,
        externalActionPerformed: false,
        backgroundExecutionStarted: false,
      },
      evidence: [
        {
          evidenceType: "canonical_commerce_attribution",
          payload: {
            conversionEventId: result.conversion.id,
            attributionRecordId: result.attribution?.id || null,
            industrialOrderId: orderId,
            paymentId,
            fulfillmentPlanId,
            territoryId: evaluation.territoryId,
            sourceKind,
            payloadChecksum,
            attributionEvidence: evaluation.attributionEvidence,
            credentialsExcluded: true,
            externalActionPerformed: false,
            backgroundExecutionStarted: false,
          },
        },
      ],
    });
    return {
      ...result,
      actionRunId: actionRun.id,
      externalActionPerformed: false as const,
      backgroundExecutionStarted: false as const,
      credentialsExposed: false as const,
    };
  } catch (error: any) {
    await completeRunFailure({
      tenantId: input.tenantId,
      runId: actionRun.id,
      error: String(error?.message || "Canonical attribution reconciliation failed"),
    });
    throw error;
  }
}

export async function previewCanonicalTerritoryScorecard(input: {
  tenantId: number;
  territoryId: number;
  month: unknown;
}) {
  const bounds = monthBounds(input.month);
  const territory = await db.query.geoTerritories.findFirst({
    where: and(
      eq(geoTerritories.tenantId, input.tenantId),
      eq(geoTerritories.id, input.territoryId),
    ),
  });
  if (!territory) throw new Error("Territory not found");
  const currencyCode = String(territory.currency || "").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currencyCode)) {
    throw new Error("The canonical territory currency is missing or invalid");
  }

  const [commerceResult, spendResult, groupResult, leadsResult, rightsResult, publishedResult] =
    await Promise.all([
      db.execute(sql`
        with canonical_orders as (
          select
            ce.id,
            ce.value_minor,
            max(ar.attributed_value_minor) as attributed_value_minor,
            bool_or(ifs.on_time is not null) as on_time_observed,
            bool_or(ifs.on_time = true) as on_time
          from conversion_events ce
          left join attribution_records ar
            on ar.tenant_id = ce.tenant_id
           and ar.conversion_event_id = ce.id
           and ar.evidence @> '{"canonicalBinding": true}'::jsonb
          left join industrial_fulfillment_services ifs
            on ifs.tenant_id = ce.tenant_id
           and ifs.plan_id = ce.fulfillment_plan_id
           and ifs.service_type::text = 'last_mile'
           and ifs.status::text = 'completed'
          where ce.tenant_id = ${input.tenantId}
            and ce.territory_id = ${input.territoryId}
            and ce.canonical_binding_status = 'verified'
            and ce.verification_status = 'verified'
            and ce.event_type = 'fulfilled_order'
            and upper(ce.currency_code) = ${currencyCode}
            and ce.occurred_at >= ${bounds.start}
            and ce.occurred_at < ${bounds.endExclusive}
          group by ce.id, ce.value_minor
        )
        select
          count(*)::int as completed_orders,
          coalesce(sum(value_minor), 0)::bigint as fulfilled_gmv_minor,
          coalesce(sum(attributed_value_minor), 0)::bigint as creator_attributed_sales_minor,
          count(*) filter (where on_time_observed)::int as on_time_observed_orders,
          count(*) filter (where on_time_observed and on_time)::int as on_time_deliveries
        from canonical_orders
      `),
      db.execute(sql`
        select coalesce(sum(case when sl.direction = 'debit' then sl.amount_minor else -sl.amount_minor end), 0)::bigint as media_spend_minor
        from spend_ledger sl
        join ad_campaigns ac on ac.id = sl.campaign_id and ac.tenant_id = sl.tenant_id
        where sl.tenant_id = ${input.tenantId}
          and ac.territory_id = ${input.territoryId}
          and sl.reconciliation_status = 'verified'
          and sl.entry_type <> 'authorization_reserved'
          and upper(sl.currency_code) = ${currencyCode}
          and sl.occurred_at >= ${bounds.start}
          and sl.occurred_at < ${bounds.endExclusive}
      `),
      db.execute(sql`
        select
          count(*)::int as campaigns,
          count(*) filter (
            where threshold_reached_at >= ${bounds.start} and threshold_reached_at < ${bounds.endExclusive}
          )::int as thresholds
        from group_buying_campaigns
        where tenant_id = ${input.tenantId}
          and territory_id = ${input.territoryId}
          and created_at < ${bounds.endExclusive}
          and (deadline >= ${bounds.start} or threshold_reached_at >= ${bounds.start})
      `),
      db.execute(sql`
        select count(*)::int as qualified_leads
        from social_inbox_events sie
        join social_publication_targets spt on spt.id = sie.target_id and spt.tenant_id = sie.tenant_id
        where sie.tenant_id = ${input.tenantId}
          and spt.territory_id = ${input.territoryId}
          and sie.lead_status in ('created', 'matched')
          and sie.received_at >= ${bounds.start}
          and sie.received_at < ${bounds.endExclusive}
      `),
      db.execute(sql`
        select count(distinct scr.media_item_id)::int as rights_cleared_assets
        from media_rights_grants mrg
        join source_content_references scr
          on scr.id = mrg.source_reference_id and scr.tenant_id = mrg.tenant_id
        where mrg.tenant_id = ${input.tenantId}
          and mrg.status = 'granted'
          and scr.takedown_state = 'clear'
          and (mrg.starts_at is null or mrg.starts_at < ${bounds.endExclusive})
          and (mrg.expires_at is null or mrg.expires_at >= ${bounds.start})
          and (
            mrg.all_territories = true
            or mrg.territory_ids @> ${JSON.stringify([input.territoryId])}::jsonb
          )
      `),
      db.execute(sql`
        select count(distinct media_item_id)::int as published_content_assets
        from social_publication_attempts
        where tenant_id = ${input.tenantId}
          and territory_id = ${input.territoryId}
          and status = 'PUBLISHED'
          and provider_confirmed_at is not null
          and published_at >= ${bounds.start}
          and published_at < ${bounds.endExclusive}
      `),
    ]);

  const completedOrders = value(commerceResult, "completed_orders");
  const onTimeObservedOrders = value(commerceResult, "on_time_observed_orders");
  const mediaSpendMinor = value(spendResult, "media_spend_minor");
  const blockers: string[] = [];

  const metrics: Record<string, number> = {
    fulfilledGmvMinor: value(commerceResult, "fulfilled_gmv_minor"),
    creatorAttributedSalesMinor: value(commerceResult, "creator_attributed_sales_minor"),
    attributableCompletedOrders: completedOrders,
    paymentSuccesses: completedOrders,
    successfulDeliveries: completedOrders,
    groupOrderCampaigns: value(groupResult, "campaigns"),
    groupOrderThresholdsReached: value(groupResult, "thresholds"),
    qualifiedLeads: value(leadsResult, "qualified_leads"),
    rightsClearedAssets: value(rightsResult, "rights_cleared_assets"),
    publishedContentAssets: value(publishedResult, "published_content_assets"),
    mediaSpendMinor,
  };
  if (completedOrders === onTimeObservedOrders) {
    metrics.onTimeDeliveries = value(commerceResult, "on_time_deliveries");
  }
  for (const [key, metric] of Object.entries(metrics)) {
    if (!Number.isSafeInteger(metric) || metric < 0) {
      blockers.push(`${key}_is_negative_or_out_of_safe_integer_range`);
      delete metrics[key];
    }
  }
  if (
    metrics.groupOrderCampaigns !== undefined &&
    metrics.groupOrderThresholdsReached !== undefined &&
    metrics.groupOrderThresholdsReached > metrics.groupOrderCampaigns
  ) {
    blockers.push("group_order_thresholds_exceed_campaign_population");
  }
  if (
    metrics.onTimeDeliveries !== undefined &&
    metrics.successfulDeliveries !== undefined &&
    metrics.onTimeDeliveries > metrics.successfulDeliveries
  ) {
    blockers.push("on_time_deliveries_exceed_successful_deliveries");
  }

  const projectionChecksum = checksum({
    projectionVersion: 1,
    tenantId: input.tenantId,
    territoryId: input.territoryId,
    month: bounds.month,
    currencyCode,
    sourceWindowStart: bounds.start.toISOString(),
    sourceWindowEnd: bounds.end.toISOString(),
    metrics,
  });
  const sourceReference = `canonical-commerce-projection:territory:${input.territoryId}:${bounds.month}:${projectionChecksum.slice(0, 20)}`;
  const perMetricEvidence = Object.fromEntries(
    Object.keys(metrics).map((key) => [
      key,
      {
        sourceType: "canonical_ledger",
        sourceReference,
        observedAt: bounds.end.toISOString(),
        verified: true,
        credentialsExcluded: true,
      },
    ]),
  );
  const unknownMetrics = TERRITORY_MEDIA_COMMERCE_METRIC_KEYS.filter(
    (key) => metrics[key] === undefined,
  );

  return {
    projectionVersion: 1,
    territoryId: input.territoryId,
    month: bounds.month,
    currencyCode,
    sourceWindowStart: bounds.start.toISOString(),
    sourceWindowEnd: bounds.end.toISOString(),
    metrics,
    perMetricEvidence,
    unknownMetrics,
    projectionChecksum,
    sourceReference,
    blockers,
    readyToRecord: blockers.length === 0,
    populationScope: "verified_attributed_fulfilled_orders_and_territory_ledgers",
    limitations: [
      "Unknown metrics remain null; no value is inferred from absence.",
      "Payment-attempt and delivery-attempt rates remain unknown until their full territory ledgers are canonically attributable.",
      ...(completedOrders !== onTimeObservedOrders
        ? ["On-time deliveries remain unknown because not every attributed delivery has a completed last-mile observation."]
        : []),
    ],
    credentialsExposed: false as const,
    externalActionPerformed: false as const,
    backgroundExecutionStarted: false as const,
  };
}

export async function recordCanonicalTerritoryScorecardProjection(input: {
  tenantId: number;
  territoryId: number;
  actorUserId: number | null;
  confirmed: boolean;
  month: unknown;
  projectionChecksum: unknown;
  idempotencyKey: unknown;
}) {
  if (input.confirmed !== true) {
    throw new Error("Accountable canonical scorecard projection confirmation is required");
  }
  const preview = await previewCanonicalTerritoryScorecard(input);
  if (!preview.readyToRecord) {
    throw new Error(`Canonical scorecard projection is blocked: ${preview.blockers.join(", ")}`);
  }
  if (String(input.projectionChecksum || "").trim() !== preview.projectionChecksum) {
    throw new Error("Canonical scorecard preview changed; refresh and confirm the current projection");
  }
  const result = await recordTerritoryScorecardEvidence({
    tenantId: input.tenantId,
    territoryId: input.territoryId,
    actorUserId: input.actorUserId,
    confirmed: true,
    idempotencyKey: input.idempotencyKey,
    month: preview.month,
    currencyCode: preview.currencyCode,
    sourceWindowStart: preview.sourceWindowStart,
    sourceWindowEnd: preview.sourceWindowEnd,
    metrics: preview.metrics,
    evidence: {
      sourceType: "canonical_ledger",
      sourceReference: preview.sourceReference,
      observedAt: preview.sourceWindowEnd,
      verified: true,
      credentialsExcluded: true,
    },
    perMetricEvidence: preview.perMetricEvidence,
  });
  return {
    ...result,
    projection: preview,
    externalActionPerformed: false as const,
    backgroundExecutionStarted: false as const,
    credentialsExposed: false as const,
  };
}
