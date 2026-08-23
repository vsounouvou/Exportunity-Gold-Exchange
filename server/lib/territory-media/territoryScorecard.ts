import crypto from "node:crypto";

import { db } from "@db";
import { auditLogs, geoTerritories, territoryKpis } from "@db/schema";
import { and, eq, sql } from "drizzle-orm";

import {
  completeRunFailure,
  completeRunSuccess,
  createActionRun,
} from "../actions/actionRuns";
import {
  normalizeTerritoryScorecardEvidence,
  territoryScorecardView,
  type TerritoryMediaCommerceMetricKey,
} from "./territoryScorecardPolicy";

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function normalizeIdempotencyKey(value: unknown, territoryId: number, month: string) {
  const raw = String(value || "").trim();
  if (!raw) throw new Error("idempotencyKey is required");
  if (raw.length > 160) throw new Error("idempotencyKey is too long");
  return `territory:${territoryId}:scorecard:${month}:${raw}`;
}

function payloadChecksum(value: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function idempotencyReceipts(value: unknown) {
  const rows = asRecord(value).idempotencyReceipts;
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => asRecord(row))
    .filter((row) => typeof row.key === "string" && typeof row.payloadChecksum === "string")
    .slice(-100);
}

function findIdempotencyReceipt(value: unknown, key: string) {
  return idempotencyReceipts(value).find((row) => row.key === key) || null;
}

function metricColumnValues(
  metrics: Partial<Record<TerritoryMediaCommerceMetricKey, number>>,
) {
  return {
    fulfilledGmvMinor: metrics.fulfilledGmvMinor ?? null,
    producerIncomeMinor: metrics.producerIncomeMinor ?? null,
    contributionMarginMinor: metrics.contributionMarginMinor ?? null,
    creatorAttributedSalesMinor: metrics.creatorAttributedSalesMinor ?? null,
    mediaSpendMinor: metrics.mediaSpendMinor ?? null,
    productPageSessions: metrics.productPageSessions ?? null,
    qualifiedLeads: metrics.qualifiedLeads ?? null,
    acquiredCustomers: metrics.acquiredCustomers ?? null,
    attributableCompletedOrders: metrics.attributableCompletedOrders ?? null,
    groupOrderCampaigns: metrics.groupOrderCampaigns ?? null,
    groupOrderThresholdsReached: metrics.groupOrderThresholdsReached ?? null,
    paymentAttempts: metrics.paymentAttempts ?? null,
    paymentSuccesses: metrics.paymentSuccesses ?? null,
    deliveryAttempts: metrics.deliveryAttempts ?? null,
    successfulDeliveries: metrics.successfulDeliveries ?? null,
    onTimeDeliveries: metrics.onTimeDeliveries ?? null,
    disputes: metrics.disputes ?? null,
    refunds: metrics.refunds ?? null,
    repeatBuyers: metrics.repeatBuyers ?? null,
    rightsClearedAssets: metrics.rightsClearedAssets ?? null,
    publishedContentAssets: metrics.publishedContentAssets ?? null,
  };
}

export async function recordTerritoryScorecardEvidence(input: {
  tenantId: number;
  territoryId: number;
  actorUserId: number | null;
  confirmed: boolean;
  idempotencyKey: unknown;
  month: unknown;
  currencyCode: unknown;
  sourceWindowStart: unknown;
  sourceWindowEnd: unknown;
  metrics: unknown;
  evidence: unknown;
  perMetricEvidence?: unknown;
}) {
  if (input.confirmed !== true) {
    throw new Error("Accountable scorecard evidence confirmation is required");
  }
  if (!input.actorUserId) throw new Error("An authenticated recording user is required");

  const territory = await db.query.geoTerritories.findFirst({
    where: and(
      eq(geoTerritories.tenantId, input.tenantId),
      eq(geoTerritories.id, input.territoryId),
    ),
  });
  if (!territory) throw new Error("Territory not found");

  const normalized = normalizeTerritoryScorecardEvidence({
    month: input.month,
    currencyCode: input.currencyCode,
    sourceWindowStart: input.sourceWindowStart,
    sourceWindowEnd: input.sourceWindowEnd,
    metrics: input.metrics,
    evidence: input.evidence,
    perMetricEvidence: input.perMetricEvidence,
  });
  if (
    territory.currency &&
    /^[A-Z]{3}$/.test(String(territory.currency).toUpperCase()) &&
    normalized.currencyCode !== String(territory.currency).toUpperCase()
  ) {
    throw new Error("Scorecard currency must match the canonical territory currency");
  }
  if (
    normalized.sourceWindowStart.toISOString().slice(0, 7) !== normalized.month ||
    normalized.sourceWindowEnd.toISOString().slice(0, 7) !== normalized.month
  ) {
    throw new Error("The source window must remain inside the scorecard month");
  }

  const idempotencyKey = normalizeIdempotencyKey(
    input.idempotencyKey,
    input.territoryId,
    normalized.month,
  );
  const checksum = payloadChecksum({
    month: normalized.month,
    currencyCode: normalized.currencyCode,
    sourceWindowStart: normalized.sourceWindowStart.toISOString(),
    sourceWindowEnd: normalized.sourceWindowEnd.toISOString(),
    metrics: normalized.metrics,
    metricEvidence: normalized.metricEvidence,
  });
  const existing = await db.query.territoryKpis.findFirst({
    where: and(
      eq(territoryKpis.territoryId, input.territoryId),
      eq(territoryKpis.month, normalized.month),
    ),
  });
  const previousReceipt = existing
    ? findIdempotencyReceipt(existing.metricEvidence, idempotencyKey) ||
      (existing.evidenceIdempotencyKey === idempotencyKey
        ? { key: idempotencyKey, payloadChecksum: asRecord(existing.metricEvidence).payloadChecksum }
        : null)
    : null;
  if (previousReceipt && existing) {
    const existingEvidence = asRecord(existing.metricEvidence);
    if ((previousReceipt.payloadChecksum || existingEvidence.payloadChecksum) !== checksum) {
      throw new Error("Idempotency key was already used with different scorecard evidence");
    }
    return {
      idempotentReplay: true,
      scorecard: territoryScorecardView(existing as unknown as JsonRecord),
      externalActionPerformed: false,
      backgroundExecutionStarted: false,
      credentialsExposed: false,
    };
  }

  const actionRun = await createActionRun({
    tenantId: input.tenantId,
    actionKey: "TERRITORY_SCORECARD_RECORD",
    requestedByUserId: input.actorUserId,
    correlationId: idempotencyKey,
    payload: {
      territoryId: input.territoryId,
      month: normalized.month,
      metricKeys: normalized.metricKeys,
      evidenceStatus: normalized.evidenceStatus,
      confirmed: true,
    },
  });

  try {
    const transactionResult = await db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`territory-scorecard:${input.territoryId}:${normalized.month}`}))`,
      );
      const current = await tx.query.territoryKpis.findFirst({
        where: and(
          eq(territoryKpis.territoryId, input.territoryId),
          eq(territoryKpis.month, normalized.month),
        ),
      });
      const concurrentReceipt = current
        ? findIdempotencyReceipt(current.metricEvidence, idempotencyKey) ||
          (current.evidenceIdempotencyKey === idempotencyKey
            ? {
                key: idempotencyKey,
                payloadChecksum: asRecord(current.metricEvidence).payloadChecksum,
              }
            : null)
        : null;
      if (concurrentReceipt && current) {
        if (concurrentReceipt.payloadChecksum !== checksum) {
          throw new Error("Idempotency key was already used with different scorecard evidence");
        }
        return { scorecard: current, idempotentReplay: true };
      }
      const now = new Date();
      const priorReceipts = current ? idempotencyReceipts(current.metricEvidence) : [];
      const nextReceipt = {
        key: idempotencyKey,
        payloadChecksum: checksum,
        actionRunId: actionRun.id,
        recordedAt: now.toISOString(),
      };
      const scorecardValues = {
        ...metricColumnValues(normalized.metrics),
        currencyCode: normalized.currencyCode,
        evidenceStatus: normalized.evidenceStatus,
        metricEvidence: {
          credentialsExcluded: true,
          payloadChecksum: checksum,
          metricKeys: normalized.metricKeys,
          metrics: normalized.metricEvidence,
          idempotencyReceipts: [...priorReceipts, nextReceipt].slice(-100),
        },
        sourceWindowStart: normalized.sourceWindowStart,
        sourceWindowEnd: normalized.sourceWindowEnd,
        evidenceIdempotencyKey: idempotencyKey,
        evidenceVersion: Number(current?.evidenceVersion || 0) + 1,
        scorecardActionRunId: actionRun.id,
        recordedByUserId: input.actorUserId,
        recordedAt: now,
        updatedAt: now,
      };
      const [row] = await tx
        .insert(territoryKpis)
        .values({
          territoryId: input.territoryId,
          month: normalized.month,
          ...scorecardValues,
          createdAt: now,
        })
        .onConflictDoUpdate({
          target: [territoryKpis.territoryId, territoryKpis.month],
          set: scorecardValues,
        })
        .returning();
      if (!row) throw new Error("Territory scorecard evidence was not persisted");

      await tx.insert(auditLogs).values({
        tenantId: input.tenantId,
        userId: input.actorUserId,
        userRole: "admin",
        action: "territory.scorecard.evidence_recorded",
        entityType: "territory_scorecard",
        entityId: row.id,
        metadata: {
          territoryId: input.territoryId,
          month: normalized.month,
          metricKeys: normalized.metricKeys,
          evidenceStatus: normalized.evidenceStatus,
          evidenceVersion: scorecardValues.evidenceVersion,
          credentialsExcluded: true,
          externalActionPerformed: false,
          backgroundExecutionStarted: false,
        },
      });
      return { scorecard: row, idempotentReplay: false };
    });

    const scorecard = transactionResult.scorecard;
    const view = territoryScorecardView(scorecard as unknown as JsonRecord);
    await completeRunSuccess({
      tenantId: input.tenantId,
      runId: actionRun.id,
      result: {
        territoryId: input.territoryId,
        scorecardId: scorecard.id,
        month: normalized.month,
        evidenceStatus: normalized.evidenceStatus,
        idempotentReplay: transactionResult.idempotentReplay,
        externalActionPerformed: false,
      },
      evidence: [
        {
          evidenceType: "territory_scorecard_evidence",
          payload: {
            territoryId: input.territoryId,
            scorecardId: scorecard.id,
            month: normalized.month,
            metricKeys: normalized.metricKeys,
            metricEvidence: normalized.metricEvidence,
            payloadChecksum: checksum,
            credentialsExcluded: true,
            externalActionPerformed: false,
            backgroundExecutionStarted: false,
          },
        },
      ],
      enforceEvidence: true,
    });
    return {
      idempotentReplay: transactionResult.idempotentReplay,
      scorecard: view,
      actionRunId: actionRun.id,
      externalActionPerformed: false,
      backgroundExecutionStarted: false,
      credentialsExposed: false,
    };
  } catch (error: any) {
    await completeRunFailure({
      tenantId: input.tenantId,
      runId: actionRun.id,
      error: String(error?.message || "Failed to record territory scorecard evidence"),
    });
    throw error;
  }
}
