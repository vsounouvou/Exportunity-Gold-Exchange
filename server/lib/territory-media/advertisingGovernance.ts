import crypto from "node:crypto";

import { db } from "@db";
import {
  accountHealthIncidents,
  adAccountConnections,
  adBudgetEnvelopes,
  adCampaigns,
  adCreatives,
  adGroupsOrAdSets,
  attributionRecords,
  auditLogs,
  conversionEvents,
  exportunityIntegrationConnections,
  geoTerritories,
  mediaPlans,
  socialPublicationTargets,
  spendAuthorizations,
  spendLedger,
} from "@db/schema";
import { and, desc, eq, gte, ne, sql } from "drizzle-orm";

import { completeRunFailure, completeRunSuccess, createActionRun } from "../actions/actionRuns";
import { getMediaRightsState } from "./mediaRights";
import {
  AD_BUDGET_SCOPE_TYPES,
  buildManualAdHandoffPackage,
  campaignStatusForBlockers,
  evaluateAdAccountReadiness,
  evaluateAdPreSpendReadiness,
  evaluateHierarchicalBudgetAvailability,
  sanitizeAdAccountVerificationEvidence,
} from "./advertisingPolicy";

type JsonRecord = Record<string, unknown>;

const PLATFORM_PROVIDER: Record<string, string> = {
  facebook: "meta",
  instagram: "meta",
  youtube: "google",
  tiktok: "tiktok",
  linkedin: "linkedin",
  x: "x",
};

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function boundedText(value: unknown, field: string, max = 240) {
  const text = String(value || "").trim();
  if (!text) throw new Error(`${field} is required`);
  if (text.length > max) throw new Error(`${field} exceeds ${max} characters`);
  return text;
}

function optionalText(value: unknown, max = 240) {
  const text = String(value || "").trim();
  return text ? text.slice(0, max) : null;
}

function positiveMinor(value: unknown, field: string, allowZero = false) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0 || (!allowZero && parsed === 0)) {
    throw new Error(`${field} must be ${allowZero ? "a non-negative" : "a positive"} integer in minor currency units`);
  }
  return parsed;
}

function basisPoints(value: unknown, field: string) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 10_000) throw new Error(`${field} must be between 0 and 10000`);
  return parsed;
}

function currencyCode(value: unknown) {
  const code = String(value || "").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) throw new Error("currencyCode must contain three letters");
  return code;
}

function parseDate(value: unknown, field: string) {
  const date = new Date(String(value || ""));
  if (!Number.isFinite(date.getTime())) throw new Error(`${field} is required`);
  return date;
}

function validateIdempotencyKey(value: unknown) {
  const key = boundedText(value, "idempotencyKey", 180);
  if (key.length < 8) throw new Error("idempotencyKey must contain at least 8 characters");
  return key;
}

function assertNoCredentialMaterial(value: unknown, path = "evidence") {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoCredentialMaterial(item, `${path}[${index}]`));
    return;
  }
  for (const [key, child] of Object.entries(value as JsonRecord)) {
    if (/(?:password|passwd|secret|access.?token|refresh.?token|authorization|cookie|private.?key)/i.test(key)) {
      throw new Error(`${path} must not contain credentials (${key})`);
    }
    assertNoCredentialMaterial(child, `${path}.${key}`);
  }
}

function safeRecord(value: unknown, field: string) {
  const record = asRecord(value);
  assertNoCredentialMaterial(record, field);
  return record;
}

function safeRecordArray(value: unknown, field: string) {
  if (!Array.isArray(value)) return [];
  return value.map((item, index) => safeRecord(item, `${field}[${index}]`));
}

function trackingCode(input: { tenantId: number; idempotencyKey: string }) {
  return `ad_${crypto.createHash("sha256").update(`${input.tenantId}:${input.idempotencyKey}`).digest("hex").slice(0, 18)}`;
}

async function loadEnvelopeAncestors(tenantId: number, envelope: typeof adBudgetEnvelopes.$inferSelect) {
  const ancestors: Array<typeof adBudgetEnvelopes.$inferSelect> = [];
  const seen = new Set<string>([envelope.id]);
  let parentId = envelope.parentEnvelopeId;
  for (let depth = 0; parentId && depth < 12; depth += 1) {
    if (seen.has(parentId)) throw new Error("Budget envelope hierarchy contains a cycle");
    seen.add(parentId);
    const parent = await db.query.adBudgetEnvelopes.findFirst({
      where: and(eq(adBudgetEnvelopes.tenantId, tenantId), eq(adBudgetEnvelopes.id, parentId)),
    });
    if (!parent) throw new Error("Budget envelope parent is missing or belongs to another tenant");
    ancestors.push(parent);
    parentId = parent.parentEnvelopeId;
  }
  if (parentId) throw new Error("Budget envelope hierarchy exceeds the supported depth");
  return ancestors;
}

function accountPolicyInput(account: typeof adAccountConnections.$inferSelect) {
  return {
    tenantId: account.tenantId,
    ownershipStatus: account.ownershipStatus,
    billingOwnershipStatus: account.billingOwnershipStatus,
    authorizationStatus: account.authorizationStatus,
    healthStatus: account.healthStatus,
    restrictionStatus: account.restrictionStatus,
    capabilities: account.capabilities,
    permissions: account.permissions,
    verificationEvidence: account.verificationEvidence,
    lastVerifiedAt: account.lastVerifiedAt,
  };
}

async function currentSpendWindows(input: { tenantId: number; envelopeId: string; now?: Date; executor?: any }) {
  const executor = input.executor || db;
  const now = input.now || new Date();
  const dayStart = new Date(now);
  dayStart.setUTCHours(0, 0, 0, 0);
  const weekStart = new Date(dayStart);
  weekStart.setUTCDate(weekStart.getUTCDate() - ((weekStart.getUTCDay() + 6) % 7));
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  async function sumSince(since: Date) {
    const result = await executor
      .select({ total: sql<number>`coalesce(sum(${spendLedger.amountMinor}), 0)` })
      .from(spendLedger)
      .where(
        and(
          eq(spendLedger.tenantId, input.tenantId),
          eq(spendLedger.envelopeId, input.envelopeId),
          eq(spendLedger.direction, "debit"),
          ne(spendLedger.reconciliationStatus, "rejected"),
          gte(spendLedger.occurredAt, since),
        ),
      );
    return Number(result[0]?.total || 0);
  }
  const [spentTodayMinor, spentWeekMinor, spentMonthMinor] = await Promise.all([
    sumSince(dayStart),
    sumSince(weekStart),
    sumSince(monthStart),
  ]);
  return { spentTodayMinor, spentWeekMinor, spentMonthMinor };
}

export async function listAdvertisingGovernance(input: { tenantId: number; limit?: number }) {
  const limit = Math.max(1, Math.min(200, Number(input.limit || 100)));
  const [accounts, envelopes, plans, campaigns, authorizations, ledger, incidents, conversions, attributions] =
    await Promise.all([
      db.select().from(adAccountConnections).where(eq(adAccountConnections.tenantId, input.tenantId)).orderBy(desc(adAccountConnections.updatedAt)).limit(limit),
      db.select().from(adBudgetEnvelopes).where(eq(adBudgetEnvelopes.tenantId, input.tenantId)).orderBy(desc(adBudgetEnvelopes.updatedAt)).limit(limit),
      db.select().from(mediaPlans).where(eq(mediaPlans.tenantId, input.tenantId)).orderBy(desc(mediaPlans.updatedAt)).limit(limit),
      db.select().from(adCampaigns).where(eq(adCampaigns.tenantId, input.tenantId)).orderBy(desc(adCampaigns.updatedAt)).limit(limit),
      db.select().from(spendAuthorizations).where(eq(spendAuthorizations.tenantId, input.tenantId)).orderBy(desc(spendAuthorizations.updatedAt)).limit(limit),
      db.select().from(spendLedger).where(eq(spendLedger.tenantId, input.tenantId)).orderBy(desc(spendLedger.occurredAt)).limit(limit),
      db.select().from(accountHealthIncidents).where(eq(accountHealthIncidents.tenantId, input.tenantId)).orderBy(desc(accountHealthIncidents.detectedAt)).limit(limit),
      db.select().from(conversionEvents).where(eq(conversionEvents.tenantId, input.tenantId)).orderBy(desc(conversionEvents.occurredAt)).limit(limit),
      db.select().from(attributionRecords).where(eq(attributionRecords.tenantId, input.tenantId)).orderBy(desc(attributionRecords.createdAt)).limit(limit),
    ]);
  return {
    accounts,
    envelopes,
    plans,
    campaigns,
    authorizations,
    ledger,
    incidents,
    conversions,
    attributions,
    credentialsExposed: false,
    externalCampaignCreated: false,
    externalSpendPerformed: false,
  };
}

export async function recordVerifiedAdAccountConnection(input: {
  tenantId: number;
  actorUserId: number | null;
  confirmed: boolean;
  provider: unknown;
  platform: unknown;
  externalAdAccountId: unknown;
  externalAdAccountLabel?: unknown;
  businessOwnerReference?: unknown;
  publicationTargetId?: number | null;
  integrationConnectionId?: string | null;
  authorizationStatus: unknown;
  healthStatus: unknown;
  restrictionStatus: unknown;
  capabilities: unknown;
  permissions: unknown;
  verificationEvidence: unknown;
}) {
  if (input.confirmed !== true) throw new Error("Accountable account-verification confirmation is required");
  const platform = boundedText(input.platform, "platform", 32).toLowerCase();
  const expectedProvider = PLATFORM_PROVIDER[platform];
  if (!expectedProvider) throw new Error("Unsupported advertising platform");
  const provider = boundedText(input.provider, "provider", 32).toLowerCase();
  if (provider !== expectedProvider) throw new Error(`provider must be ${expectedProvider} for ${platform}`);
  const externalAdAccountId = boundedText(input.externalAdAccountId, "externalAdAccountId");
  const evidence = sanitizeAdAccountVerificationEvidence(input.verificationEvidence);
  const capabilities = Array.isArray(input.capabilities)
    ? Array.from(new Set(input.capabilities.map((item) => String(item || "").trim()).filter(Boolean))).slice(0, 100)
    : [];
  const permissions = Array.isArray(input.permissions)
    ? Array.from(new Set(input.permissions.map((item) => String(item || "").trim()).filter(Boolean))).slice(0, 100)
    : [];
  const authorizationStatus = boundedText(input.authorizationStatus, "authorizationStatus", 64).toLowerCase();
  const healthStatus = boundedText(input.healthStatus, "healthStatus", 64).toLowerCase();
  const restrictionStatus = boundedText(input.restrictionStatus, "restrictionStatus", 64).toLowerCase();
  const now = new Date();

  if (input.publicationTargetId) {
    const target = await db.query.socialPublicationTargets.findFirst({
      where: and(
        eq(socialPublicationTargets.tenantId, input.tenantId),
        eq(socialPublicationTargets.id, input.publicationTargetId),
      ),
      columns: {
        id: true,
        platform: true,
        exportunityIntegrationConnectionId: true,
      },
    });
    if (!target || target.platform !== platform) {
      throw new Error("Publication target is missing, cross-tenant, or belongs to another platform");
    }
    if (
      input.integrationConnectionId &&
      target.exportunityIntegrationConnectionId !== input.integrationConnectionId
    ) {
      throw new Error(
        "Publication target is not bound to the selected Exportunity-native connection",
      );
    }
  }
  if (input.integrationConnectionId) {
    const safeConnections = await db
      .select({
        id: exportunityIntegrationConnections.id,
        tenantId: exportunityIntegrationConnections.tenantId,
        provider: exportunityIntegrationConnections.provider,
        integrationId: exportunityIntegrationConnections.integrationId,
        status: exportunityIntegrationConnections.status,
      })
      .from(exportunityIntegrationConnections)
      .where(
        and(
          eq(exportunityIntegrationConnections.tenantId, input.tenantId),
          eq(exportunityIntegrationConnections.id, input.integrationConnectionId),
        ),
      )
      .limit(1);
    if (!safeConnections[0]) throw new Error("Integration connection is missing or belongs to another tenant");
    const expectedIntegrationId = provider === "meta" ? "meta_business" : null;
    if (
      !expectedIntegrationId ||
      safeConnections[0].provider !== provider ||
      safeConnections[0].integrationId !== expectedIntegrationId ||
      safeConnections[0].status !== "connected"
    ) {
      throw new Error(
        "A connected Exportunity-native provider authorization is required for this advertising platform",
      );
    }
  }

  const actionRun = await createActionRun({
    tenantId: input.tenantId,
    actionKey: "AD_ACCOUNT_VERIFICATION_RECORD",
    requestedByUserId: input.actorUserId,
    correlationId: `ad-account-verification:${provider}:${externalAdAccountId}`,
    payload: { provider, platform, externalAdAccountId, confirmed: true },
  });
  try {
  const [connection] = await db
    .insert(adAccountConnections)
    .values({
      tenantId: input.tenantId,
      publicationTargetId: input.publicationTargetId || null,
      integrationConnectionId: null,
      exportunityIntegrationConnectionId: input.integrationConnectionId || null,
      provider,
      platform,
      externalAdAccountId,
      externalAdAccountLabel: optionalText(input.externalAdAccountLabel, 200),
      businessOwnerReference: optionalText(input.businessOwnerReference) || evidence.businessOwnerReference,
      ownershipStatus: "business_owned",
      billingOwnershipStatus: "tenant_owned",
      authorizationStatus,
      healthStatus,
      restrictionStatus,
      capabilities,
      permissions,
      verificationEvidence: evidence,
      lastVerifiedAt: new Date(evidence.verifiedAt),
      createdByUserId: input.actorUserId,
      updatedByUserId: input.actorUserId,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        adAccountConnections.tenantId,
        adAccountConnections.provider,
        adAccountConnections.externalAdAccountId,
      ],
      set: {
        publicationTargetId: input.publicationTargetId || null,
        integrationConnectionId: null,
        exportunityIntegrationConnectionId: input.integrationConnectionId || null,
        externalAdAccountLabel: optionalText(input.externalAdAccountLabel, 200),
        businessOwnerReference: optionalText(input.businessOwnerReference) || evidence.businessOwnerReference,
        ownershipStatus: "business_owned",
        billingOwnershipStatus: "tenant_owned",
        authorizationStatus,
        healthStatus,
        restrictionStatus,
        capabilities,
        permissions,
        verificationEvidence: evidence,
        lastVerifiedAt: new Date(evidence.verifiedAt),
        updatedByUserId: input.actorUserId,
        updatedAt: now,
      },
    })
    .returning();

  const readiness = evaluateAdAccountReadiness(accountPolicyInput(connection));
  if (readiness.ready) {
    await db
      .update(accountHealthIncidents)
      .set({ status: "resolved", resolvedAt: now, updatedAt: now })
      .where(
        and(
          eq(accountHealthIncidents.tenantId, input.tenantId),
          eq(accountHealthIncidents.adAccountConnectionId, connection.id),
          ne(accountHealthIncidents.status, "resolved"),
        ),
      );
  } else {
    const existingIncident = await db.query.accountHealthIncidents.findFirst({
      where: and(
        eq(accountHealthIncidents.tenantId, input.tenantId),
        eq(accountHealthIncidents.adAccountConnectionId, connection.id),
        eq(accountHealthIncidents.incidentType, "account_readiness_blocked"),
        ne(accountHealthIncidents.status, "resolved"),
      ),
    });
    if (!existingIncident) {
      await db.insert(accountHealthIncidents).values({
        tenantId: input.tenantId,
        adAccountConnectionId: connection.id,
        incidentType: "account_readiness_blocked",
        severity: readiness.blockers.some((item) => item.includes("restriction")) ? "critical" : "high",
        status: "open",
        summary: "Advertising account is blocked by ownership, billing, authorization, health, permission, or restriction policy.",
        restrictions: readiness.blockers,
        evidence: { verificationReference: evidence.providerReference, credentialsExposed: false },
        detectedAt: now,
        createdAt: now,
        updatedAt: now,
      });
    }
  }
  await db.insert(auditLogs).values({
    tenantId: input.tenantId,
    userId: input.actorUserId,
    userRole: "admin",
    action: "advertising.account_verification_recorded",
    entityType: "ad_account_connection",
    entityId: null,
    metadata: {
      adAccountConnectionId: connection.id,
      provider,
      platform,
      externalAdAccountId,
      ownershipStatus: connection.ownershipStatus,
      billingOwnershipStatus: connection.billingOwnershipStatus,
      readiness,
      credentialsExposed: false,
    },
    createdAt: now,
  });
  await completeRunSuccess({
    tenantId: input.tenantId,
    runId: actionRun.id,
    enforceEvidence: true,
    result: {
      adAccountConnectionId: connection.id,
      ready: readiness.ready,
      blockers: readiness.blockers,
      credentialsExposed: false,
      externalActionPerformed: false,
    },
    evidence: [
      {
        evidenceType: "ad_account_verification",
        payload: {
          adAccountConnectionId: connection.id,
          provider,
          platform,
          externalAdAccountId,
          verificationReference: evidence.providerReference,
          ownershipStatus: connection.ownershipStatus,
          billingOwnershipStatus: connection.billingOwnershipStatus,
          readiness,
          credentialsExposed: false,
        },
      },
    ],
  });
  return { connection, readiness, actionRunId: actionRun.id, credentialsExposed: false, externalActionPerformed: false };
  } catch (error: any) {
    await completeRunFailure({ tenantId: input.tenantId, runId: actionRun.id, error: String(error?.message || error) });
    throw error;
  }
}

export async function prepareAdBudgetEnvelope(input: {
  tenantId: number;
  actorUserId: number | null;
  confirmed: boolean;
  idempotencyKey: unknown;
  parentEnvelopeId?: string | null;
  adAccountConnectionId?: string | null;
  territoryId?: number | null;
  name: unknown;
  scopeType: unknown;
  scopeReferenceId?: unknown;
  currencyCode: unknown;
  periodStart: unknown;
  periodEnd: unknown;
  totalCapMinor: unknown;
  dailyCapMinor: unknown;
  weeklyCapMinor: unknown;
  monthlyCapMinor: unknown;
  maximumCacMinor: unknown;
  minimumMarginBps: unknown;
  agentReallocationAllowed?: boolean;
  maximumReallocationBps?: unknown;
  stoppingConditions: unknown;
}) {
  if (input.confirmed !== true) throw new Error("Accountable budget-envelope confirmation is required");
  const idempotencyKey = validateIdempotencyKey(input.idempotencyKey);
  const replay = await db.query.adBudgetEnvelopes.findFirst({
    where: and(eq(adBudgetEnvelopes.tenantId, input.tenantId), eq(adBudgetEnvelopes.idempotencyKey, idempotencyKey)),
  });
  if (replay) return { idempotentReplay: true, envelope: replay, externalSpendAuthorized: false };

  const scopeType = boundedText(input.scopeType, "scopeType", 32).toLowerCase();
  if (!(AD_BUDGET_SCOPE_TYPES as readonly string[]).includes(scopeType)) throw new Error("Unsupported budget scopeType");
  const code = currencyCode(input.currencyCode);
  const periodStart = parseDate(input.periodStart, "periodStart");
  const periodEnd = parseDate(input.periodEnd, "periodEnd");
  if (periodEnd <= periodStart) throw new Error("periodEnd must be after periodStart");
  const caps = {
    totalCapMinor: positiveMinor(input.totalCapMinor, "totalCapMinor"),
    dailyCapMinor: positiveMinor(input.dailyCapMinor, "dailyCapMinor"),
    weeklyCapMinor: positiveMinor(input.weeklyCapMinor, "weeklyCapMinor"),
    monthlyCapMinor: positiveMinor(input.monthlyCapMinor, "monthlyCapMinor"),
  };
  for (const [key, cap] of Object.entries(caps)) {
    if (cap > caps.totalCapMinor) throw new Error(`${key} cannot exceed totalCapMinor`);
  }
  const maximumCacMinor = positiveMinor(input.maximumCacMinor, "maximumCacMinor");
  const minimumMarginBps = basisPoints(input.minimumMarginBps, "minimumMarginBps");
  const maximumReallocationBps = basisPoints(input.maximumReallocationBps || 0, "maximumReallocationBps");
  const stoppingConditions = safeRecord(input.stoppingConditions, "stoppingConditions");

  const [parent, account, territory] = await Promise.all([
    input.parentEnvelopeId
      ? db.query.adBudgetEnvelopes.findFirst({
          where: and(eq(adBudgetEnvelopes.tenantId, input.tenantId), eq(adBudgetEnvelopes.id, input.parentEnvelopeId)),
        })
      : null,
    input.adAccountConnectionId
      ? db.query.adAccountConnections.findFirst({
          where: and(eq(adAccountConnections.tenantId, input.tenantId), eq(adAccountConnections.id, input.adAccountConnectionId)),
        })
      : null,
    input.territoryId
      ? db.query.geoTerritories.findFirst({
          where: and(eq(geoTerritories.tenantId, input.tenantId), eq(geoTerritories.id, input.territoryId)),
        })
      : null,
  ]);
  if (input.parentEnvelopeId && !parent) throw new Error("Parent envelope not found for this tenant");
  if (input.adAccountConnectionId && !account) throw new Error("Ad account connection not found for this tenant");
  if (input.territoryId && !territory) throw new Error("Territory not found for this tenant");
  if (["country", "city", "neighborhood"].includes(scopeType)) {
    if (!territory) throw new Error(`${scopeType} envelopes require a tenant territory`);
    if (territory.territoryType !== scopeType) throw new Error(`Envelope scope requires a ${scopeType} territory`);
  }
  if (["brand", "channel", "campaign", "test", "production", "rights"].includes(scopeType) && !optionalText(input.scopeReferenceId)) {
    throw new Error(`${scopeType} envelopes require scopeReferenceId`);
  }
  if (parent) {
    if (parent.currencyCode !== code) throw new Error("Child envelope currency must match its parent");
    for (const [key, cap] of Object.entries(caps)) {
      const parentCap = Number((parent as any)[key] || 0);
      if (cap > parentCap) throw new Error(`Child envelope ${key} cannot exceed its parent`);
    }
    if (periodStart < parent.periodStart || periodEnd > parent.periodEnd) {
      throw new Error("Child envelope period must stay inside its parent period");
    }
  }

  const actionRun = await createActionRun({
    tenantId: input.tenantId,
    actionKey: "AD_BUDGET_ENVELOPE_PREPARE",
    requestedByUserId: input.actorUserId,
    correlationId: `ad-envelope:${idempotencyKey}`,
    payload: { idempotencyKey, scopeType, currencyCode: code, totalCapMinor: caps.totalCapMinor, confirmed: true },
  });
  try {
    const [envelope] = await db
      .insert(adBudgetEnvelopes)
      .values({
        tenantId: input.tenantId,
        parentEnvelopeId: parent?.id || null,
        adAccountConnectionId: account?.id || null,
        territoryId: territory?.id || null,
        idempotencyKey,
        name: boundedText(input.name, "name", 200),
        scopeType,
        scopeReferenceId: optionalText(input.scopeReferenceId),
        currencyCode: code,
        status: "approval_required",
        periodStart,
        periodEnd,
        ...caps,
        committedMinor: 0,
        spentMinor: 0,
        maximumCacMinor,
        minimumMarginBps,
        agentReallocationAllowed: input.agentReallocationAllowed === true,
        maximumReallocationBps,
        stoppingConditions,
        approvalEvidence: {},
        createdByUserId: input.actorUserId,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    await completeRunSuccess({
      tenantId: input.tenantId,
      runId: actionRun.id,
      enforceEvidence: true,
      result: { envelopeId: envelope.id, status: envelope.status, externalSpendAuthorized: false },
      evidence: [{ evidenceType: "budget_envelope", payload: { envelopeId: envelope.id, scopeType, caps, currencyCode: code } }],
    });
    return { idempotentReplay: false, envelope, actionRunId: actionRun.id, externalSpendAuthorized: false };
  } catch (error: any) {
    await completeRunFailure({ tenantId: input.tenantId, runId: actionRun.id, error: String(error?.message || error) });
    throw error;
  }
}

export async function approveAdBudgetEnvelope(input: {
  tenantId: number;
  actorUserId: number | null;
  envelopeId: string;
  confirmed: boolean;
  authorityReference: unknown;
  rationale: unknown;
}) {
  if (input.confirmed !== true) throw new Error("Accountable budget approval confirmation is required");
  if (!input.actorUserId) throw new Error("An authenticated approving user is required");
  const authorityReference = boundedText(input.authorityReference, "authorityReference");
  const rationale = boundedText(input.rationale, "rationale", 1000);
  const actionRun = await createActionRun({
    tenantId: input.tenantId,
    actionKey: "AD_BUDGET_ENVELOPE_APPROVE",
    requestedByUserId: input.actorUserId,
    correlationId: `ad-envelope-approval:${input.envelopeId}`,
    payload: { envelopeId: input.envelopeId, confirmed: true, authorityReference },
  });
  try {
    const envelope = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`ad-envelope:${input.envelopeId}`}))`);
      const current = await tx.query.adBudgetEnvelopes.findFirst({
        where: and(eq(adBudgetEnvelopes.tenantId, input.tenantId), eq(adBudgetEnvelopes.id, input.envelopeId)),
      });
      if (!current) throw new Error("Budget envelope not found");
      if (current.status === "active") return current;
      if (current.status !== "approval_required") throw new Error("Budget envelope is not awaiting approval");
      if (current.parentEnvelopeId) {
        const parent = await tx.query.adBudgetEnvelopes.findFirst({
          where: and(eq(adBudgetEnvelopes.tenantId, input.tenantId), eq(adBudgetEnvelopes.id, current.parentEnvelopeId)),
        });
        if (!parent || parent.status !== "active") throw new Error("Parent budget envelope must be active first");
        if (current.totalCapMinor > parent.totalCapMinor) throw new Error("Child envelope exceeds its active parent");
      }
      if (current.adAccountConnectionId) {
        const account = await tx.query.adAccountConnections.findFirst({
          where: and(eq(adAccountConnections.tenantId, input.tenantId), eq(adAccountConnections.id, current.adAccountConnectionId)),
        });
        const readiness = evaluateAdAccountReadiness(account ? accountPolicyInput(account) : null);
        if (!readiness.ready) throw new Error(`Ad account is not ready: ${readiness.blockers.join(", ")}`);
      }
      const now = new Date();
      const [updated] = await tx
        .update(adBudgetEnvelopes)
        .set({
          status: "active",
          approvalEvidence: { authorityReference, rationale, approvedAt: now.toISOString() },
          approvedByUserId: input.actorUserId,
          approvedAt: now,
          updatedAt: now,
        })
        .where(and(eq(adBudgetEnvelopes.tenantId, input.tenantId), eq(adBudgetEnvelopes.id, current.id)))
        .returning();
      return updated;
    });
    await completeRunSuccess({
      tenantId: input.tenantId,
      runId: actionRun.id,
      enforceEvidence: true,
      result: { envelopeId: envelope.id, status: envelope.status, externalSpendAuthorized: false },
      evidence: [{ evidenceType: "budget_approval", payload: { envelopeId: envelope.id, authorityReference, rationale } }],
    });
    return { envelope, actionRunId: actionRun.id, externalSpendAuthorized: false };
  } catch (error: any) {
    await completeRunFailure({ tenantId: input.tenantId, runId: actionRun.id, error: String(error?.message || error) });
    throw error;
  }
}

export async function prepareAdvertisingMediaPlan(input: {
  tenantId: number;
  actorUserId: number | null;
  confirmed: boolean;
  idempotencyKey: unknown;
  envelopeId: string;
  adAccountConnectionId: string;
  territoryId: number;
  mediaItemId: string;
  platform: string;
  title: unknown;
  objective: unknown;
  eligibleProducts: unknown;
  stockCapacityEvidence: unknown;
  deliveryCoverageEvidence: unknown;
  landingPageUrl: unknown;
  landingPageEvidence: unknown;
  trackingPlan: unknown;
  marginBps: unknown;
  maximumCacMinor: unknown;
  policyStatus: unknown;
  requestedBudgetMinor: unknown;
  stoppingConditions: unknown;
  creative?: {
    title?: unknown;
    body?: unknown;
    callToAction?: unknown;
    destinationUrl?: unknown;
    assetSnapshot?: unknown;
    factSnapshot?: unknown;
  };
}) {
  if (input.confirmed !== true) throw new Error("Accountable media-plan confirmation is required");
  const idempotencyKey = validateIdempotencyKey(input.idempotencyKey);
  const replay = await db.query.mediaPlans.findFirst({
    where: and(eq(mediaPlans.tenantId, input.tenantId), eq(mediaPlans.idempotencyKey, idempotencyKey)),
  });
  if (replay) {
    const campaign = await db.query.adCampaigns.findFirst({
      where: and(eq(adCampaigns.tenantId, input.tenantId), eq(adCampaigns.mediaPlanId, replay.id)),
    });
    return { idempotentReplay: true, plan: replay, campaign, externalCampaignCreated: false, externalSpendPerformed: false };
  }

  const envelope = await db.query.adBudgetEnvelopes.findFirst({
    where: and(eq(adBudgetEnvelopes.tenantId, input.tenantId), eq(adBudgetEnvelopes.id, input.envelopeId)),
  });
  if (!envelope) throw new Error("Budget envelope not found for this tenant");
  const account = await db.query.adAccountConnections.findFirst({
    where: and(eq(adAccountConnections.tenantId, input.tenantId), eq(adAccountConnections.id, input.adAccountConnectionId)),
  });
  if (!account) throw new Error("Ad account connection not found for this tenant");
  if (envelope.adAccountConnectionId && envelope.adAccountConnectionId !== account.id) {
    throw new Error("Budget envelope belongs to a different ad account");
  }
  const territory = await db.query.geoTerritories.findFirst({
    where: and(eq(geoTerritories.tenantId, input.tenantId), eq(geoTerritories.id, input.territoryId)),
  });
  if (!territory) throw new Error("Territory not found for this tenant");
  const platform = boundedText(input.platform, "platform", 32).toLowerCase();
  if (account.platform !== platform) throw new Error("Media plan platform must match the ad account");

  const [ancestors, rights] = await Promise.all([
    loadEnvelopeAncestors(input.tenantId, envelope),
    getMediaRightsState({
      tenantId: input.tenantId,
      mediaItemId: boundedText(input.mediaItemId, "mediaItemId", 160),
      usageType: "paid_ad",
      channel: platform,
      territoryId: territory.id,
    }),
  ]);
  const spendWindowEntries = await Promise.all(
    [envelope, ...ancestors].map(async (item) => [
      item.id,
      await currentSpendWindows({ tenantId: input.tenantId, envelopeId: item.id }),
    ] as const),
  );
  const spendWindowsByEnvelopeId = Object.fromEntries(spendWindowEntries);
  const spendWindows = spendWindowsByEnvelopeId[envelope.id];
  const rightsGrant = rights.eligibility.grantId
    ? rights.grants.find((grant) => grant.id === rights.eligibility.grantId) || null
    : null;
  const paidRightsEligible = Boolean(rights.eligibility.eligible && rights.sourceReference && rightsGrant);
  const rightsEvidence = paidRightsEligible
    ? {
        referenceId: `rights-grant:${rightsGrant!.id}`,
        verifiedAt: (rightsGrant!.grantedAt || rightsGrant!.updatedAt || rightsGrant!.createdAt)?.toISOString?.() || new Date().toISOString(),
        sourceReferenceId: rights.sourceReference!.id,
        eligibility: rights.eligibility,
      }
    : { blockers: rights.eligibility.blockers };
  const eligibleProducts = safeRecordArray(input.eligibleProducts, "eligibleProducts");
  const stockCapacityEvidence = safeRecord(input.stockCapacityEvidence, "stockCapacityEvidence");
  const deliveryCoverageEvidence = safeRecord(input.deliveryCoverageEvidence, "deliveryCoverageEvidence");
  const landingPageEvidence = safeRecord(input.landingPageEvidence, "landingPageEvidence");
  const trackingPlan = safeRecord(input.trackingPlan, "trackingPlan");
  const stoppingConditions = safeRecord(input.stoppingConditions, "stoppingConditions");
  const requestedBudgetMinor = positiveMinor(input.requestedBudgetMinor, "requestedBudgetMinor");
  const maximumCacMinor = positiveMinor(input.maximumCacMinor, "maximumCacMinor");
  const marginBps = basisPoints(input.marginBps, "marginBps");
  const objective = boundedText(input.objective, "objective", 1000);
  const title = boundedText(input.title, "title", 240);
  const landingPageUrl = boundedText(input.landingPageUrl, "landingPageUrl", 2048);
  const territoryEvidence = {
    referenceId: territory.sourceRef || `territory:${territory.id}`,
    verifiedAt: (territory.updatedAt || territory.createdAt || new Date()).toISOString(),
    territoryType: territory.territoryType,
    status: territory.status,
  };
  const readiness = evaluateAdPreSpendReadiness({
    tenantId: input.tenantId,
    currencyCode: envelope.currencyCode,
    objective,
    account: accountPolicyInput(account),
    envelope,
    ancestors,
    requestedBudgetMinor,
    ...spendWindows,
    spendWindowsByEnvelopeId,
    eligibleProducts,
    stockCapacityEvidence,
    territoryId: territory.id,
    territoryEvidence,
    deliveryCoverageEvidence,
    landingPageUrl,
    landingPageEvidence,
    trackingPlan,
    marginBps,
    maximumCacMinor,
    paidRightsEligible,
    rightsEvidence,
    policyStatus: input.policyStatus,
    stoppingConditions,
  });
  if (territory.status !== "active") readiness.blockers.push("active_territory_required");
  if (territory.territoryType !== "neighborhood") readiness.blockers.push("neighborhood_territory_required");
  readiness.readyForApproval = readiness.blockers.length === 0;
  const planStatus = readiness.readyForApproval ? "approval_required" : "blocked";
  const campaignStatus = campaignStatusForBlockers(readiness.blockers);
  const code = trackingCode({ tenantId: input.tenantId, idempotencyKey });

  const actionRun = await createActionRun({
    tenantId: input.tenantId,
    actionKey: "AD_MEDIA_PLAN_PREPARE",
    requestedByUserId: input.actorUserId,
    correlationId: `ad-media-plan:${idempotencyKey}`,
    payload: { idempotencyKey, envelopeId: envelope.id, territoryId: territory.id, mediaItemId: input.mediaItemId, confirmed: true },
  });
  try {
    const result = await db.transaction(async (tx) => {
      const [plan] = await tx
        .insert(mediaPlans)
        .values({
          tenantId: input.tenantId,
          envelopeId: envelope.id,
          territoryId: territory.id,
          actionRunId: actionRun.id,
          idempotencyKey,
          title,
          objective,
          status: planStatus,
          eligibleProducts,
          stockCapacityEvidence,
          deliveryCoverageEvidence,
          landingPageUrl,
          trackingPlan,
          marginBps,
          maximumCacMinor,
          rightsEvidence,
          policyStatus: String(input.policyStatus || "unknown").trim().toLowerCase(),
          requestedBudgetMinor,
          stoppingConditions,
          readinessSnapshot: readiness,
          blockers: readiness.blockers,
          requestedByUserId: input.actorUserId,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();
      const [campaign] = await tx
        .insert(adCampaigns)
        .values({
          tenantId: input.tenantId,
          mediaPlanId: plan.id,
          adAccountConnectionId: account.id,
          envelopeId: envelope.id,
          territoryId: territory.id,
          name: title,
          objective,
          status: campaignStatus,
          requestedBudgetMinor,
          trackingCode: code,
          stoppingConditions,
          providerState: { externalCampaignCreated: false, providerStatusUnverified: true },
          createdByUserId: input.actorUserId,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      let creative = null;
      if (paidRightsEligible && rights.sourceReference && rightsGrant) {
        const creativeInput = input.creative || {};
        const [insertedCreative] = await tx
          .insert(adCreatives)
          .values({
            tenantId: input.tenantId,
            campaignId: campaign.id,
            mediaItemId: rights.item.id,
            sourceReferenceId: rights.sourceReference.id,
            rightsGrantId: rightsGrant.id,
            status: "NEEDS_REVIEW",
            title: boundedText(creativeInput.title || rights.item.title, "creative.title", 240),
            body: boundedText(creativeInput.body || rights.item.excerpt || rights.item.title, "creative.body", 5000),
            callToAction: boundedText(creativeInput.callToAction || "Learn more", "creative.callToAction", 120),
            destinationUrl: boundedText(creativeInput.destinationUrl || landingPageUrl, "creative.destinationUrl", 2048),
            assetSnapshot: safeRecord(creativeInput.assetSnapshot, "creative.assetSnapshot"),
            factSnapshot: safeRecord(creativeInput.factSnapshot, "creative.factSnapshot"),
            rightsSnapshot: rightsEvidence,
            createdByUserId: input.actorUserId,
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .returning();
        creative = insertedCreative;
      }
      await tx.insert(auditLogs).values({
        tenantId: input.tenantId,
        userId: input.actorUserId,
        userRole: "admin",
        action: "advertising.media_plan_prepared",
        entityType: "media_plan",
        entityId: null,
        metadata: {
          mediaPlanId: plan.id,
          campaignId: campaign.id,
          creativeId: creative?.id || null,
          status: plan.status,
          campaignStatus: campaign.status,
          blockers: readiness.blockers,
          externalCampaignCreated: false,
          externalSpendPerformed: false,
        },
        createdAt: new Date(),
      });
      return { plan, campaign, creative };
    });

    await completeRunSuccess({
      tenantId: input.tenantId,
      runId: actionRun.id,
      enforceEvidence: true,
      result: {
        mediaPlanId: result.plan.id,
        campaignId: result.campaign.id,
        status: result.plan.status,
        campaignStatus: result.campaign.status,
        blockers: readiness.blockers,
        externalCampaignCreated: false,
        externalSpendPerformed: false,
      },
      evidence: [
        { evidenceType: "ad_pre_spend_readiness", payload: { readiness, rightsGrantId: rightsGrant?.id || null, territoryEvidence } },
      ],
    });
    const manualHandoff = readiness.readyForApproval
      ? buildManualAdHandoffPackage({
          mediaPlanId: result.plan.id,
          campaignId: result.campaign.id,
          accountReference: account.externalAdAccountId,
          objective,
          territoryId: territory.id,
          requestedBudgetMinor,
          currencyCode: envelope.currencyCode,
          trackingCode: code,
          stoppingConditions,
        })
      : null;
    return {
      idempotentReplay: false,
      ...result,
      readiness,
      manualHandoff,
      actionRunId: actionRun.id,
      externalCampaignCreated: false,
      externalSpendPerformed: false,
    };
  } catch (error: any) {
    await completeRunFailure({ tenantId: input.tenantId, runId: actionRun.id, error: String(error?.message || error) });
    throw error;
  }
}

export async function approveAdvertisingMediaPlan(input: {
  tenantId: number;
  actorUserId: number | null;
  mediaPlanId: string;
  confirmed: boolean;
  factsStillCurrent: boolean;
  creativeApproved: boolean;
  approvalReference: unknown;
}) {
  if (!input.actorUserId) throw new Error("An authenticated approving user is required");
  if (input.confirmed !== true || input.factsStillCurrent !== true || input.creativeApproved !== true) {
    throw new Error("Media plan, fact freshness, and creative approval confirmations are required");
  }
  const approvalReference = boundedText(input.approvalReference, "approvalReference");
  const actionRun = await createActionRun({
    tenantId: input.tenantId,
    actionKey: "AD_MEDIA_PLAN_APPROVE",
    requestedByUserId: input.actorUserId,
    correlationId: `ad-media-plan-approval:${input.mediaPlanId}`,
    payload: { mediaPlanId: input.mediaPlanId, confirmed: true, factsStillCurrent: true, creativeApproved: true },
  });
  try {
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`ad-media-plan:${input.mediaPlanId}`}))`);
      const plan = await tx.query.mediaPlans.findFirst({
        where: and(eq(mediaPlans.tenantId, input.tenantId), eq(mediaPlans.id, input.mediaPlanId)),
      });
      if (!plan) throw new Error("Media plan not found");
      if (plan.status === "approved") {
        const campaign = await tx.query.adCampaigns.findFirst({
          where: and(eq(adCampaigns.tenantId, input.tenantId), eq(adCampaigns.mediaPlanId, plan.id)),
        });
        return { plan, campaign, idempotentReplay: true };
      }
      if (plan.status !== "approval_required" || (Array.isArray(plan.blockers) && plan.blockers.length)) {
        throw new Error("Media plan has unresolved pre-spend blockers");
      }
      const campaign = await tx.query.adCampaigns.findFirst({
        where: and(eq(adCampaigns.tenantId, input.tenantId), eq(adCampaigns.mediaPlanId, plan.id)),
      });
      if (!campaign) throw new Error("Campaign preparation record not found");
      const [account, envelope, territory] = await Promise.all([
        tx.query.adAccountConnections.findFirst({
          where: and(eq(adAccountConnections.tenantId, input.tenantId), eq(adAccountConnections.id, campaign.adAccountConnectionId)),
        }),
        tx.query.adBudgetEnvelopes.findFirst({
          where: and(eq(adBudgetEnvelopes.tenantId, input.tenantId), eq(adBudgetEnvelopes.id, plan.envelopeId)),
        }),
        tx.query.geoTerritories.findFirst({
          where: and(eq(geoTerritories.tenantId, input.tenantId), eq(geoTerritories.id, plan.territoryId)),
        }),
      ]);
      const accountReadiness = evaluateAdAccountReadiness(account ? accountPolicyInput(account) : null);
      if (!accountReadiness.ready) throw new Error(`Ad account is not ready: ${accountReadiness.blockers.join(", ")}`);
      if (!envelope || envelope.status !== "active" || new Date(envelope.periodEnd) <= new Date()) {
        throw new Error("Budget envelope is not active");
      }
      if (!territory || territory.status !== "active") throw new Error("Territory is not active");
      const now = new Date();
      const [updatedPlan] = await tx
        .update(mediaPlans)
        .set({ status: "approved", approvedByUserId: input.actorUserId, approvedAt: now, updatedAt: now })
        .where(and(eq(mediaPlans.tenantId, input.tenantId), eq(mediaPlans.id, plan.id)))
        .returning();
      const [updatedCampaign] = await tx
        .update(adCampaigns)
        .set({ status: "APPROVED", updatedAt: now })
        .where(and(eq(adCampaigns.tenantId, input.tenantId), eq(adCampaigns.id, campaign.id)))
        .returning();
      await tx
        .update(adCreatives)
        .set({ status: "APPROVED", updatedAt: now })
        .where(and(eq(adCreatives.tenantId, input.tenantId), eq(adCreatives.campaignId, campaign.id)));
      await tx.insert(auditLogs).values({
        tenantId: input.tenantId,
        userId: input.actorUserId,
        userRole: "admin",
        action: "advertising.media_plan_approved",
        entityType: "media_plan",
        entityId: null,
        metadata: {
          mediaPlanId: plan.id,
          campaignId: campaign.id,
          approvalReference,
          externalCampaignCreated: false,
          externalSpendAuthorized: false,
        },
        createdAt: now,
      });
      return { plan: updatedPlan, campaign: updatedCampaign, idempotentReplay: false };
    });
    await completeRunSuccess({
      tenantId: input.tenantId,
      runId: actionRun.id,
      enforceEvidence: true,
      result: { mediaPlanId: result.plan.id, campaignId: result.campaign?.id || null, externalCampaignCreated: false },
      evidence: [{ evidenceType: "media_plan_approval", payload: { approvalReference, factsStillCurrent: true, creativeApproved: true } }],
    });
    return { ...result, actionRunId: actionRun.id, externalCampaignCreated: false, externalSpendAuthorized: false };
  } catch (error: any) {
    await completeRunFailure({ tenantId: input.tenantId, runId: actionRun.id, error: String(error?.message || error) });
    throw error;
  }
}

export async function prepareSpendAuthorization(input: {
  tenantId: number;
  actorUserId: number | null;
  confirmed: boolean;
  idempotencyKey: unknown;
  mediaPlanId: string;
  campaignId: string;
  amountMinor: unknown;
  validFrom: unknown;
  validUntil: unknown;
  purpose: unknown;
  authorityBounds: unknown;
}) {
  if (input.confirmed !== true) throw new Error("Accountable spend-authorization preparation confirmation is required");
  const idempotencyKey = validateIdempotencyKey(input.idempotencyKey);
  const replay = await db.query.spendAuthorizations.findFirst({
    where: and(eq(spendAuthorizations.tenantId, input.tenantId), eq(spendAuthorizations.idempotencyKey, idempotencyKey)),
  });
  if (replay) return { idempotentReplay: true, authorization: replay, externalSpendAuthorized: false };
  const [plan, campaign] = await Promise.all([
    db.query.mediaPlans.findFirst({
      where: and(eq(mediaPlans.tenantId, input.tenantId), eq(mediaPlans.id, input.mediaPlanId)),
    }),
    db.query.adCampaigns.findFirst({
      where: and(eq(adCampaigns.tenantId, input.tenantId), eq(adCampaigns.id, input.campaignId)),
    }),
  ]);
  if (!plan || plan.status !== "approved") throw new Error("Approved media plan is required");
  if (!campaign || campaign.mediaPlanId !== plan.id || campaign.status !== "APPROVED") {
    throw new Error("Approved matching campaign is required");
  }
  const envelope = await db.query.adBudgetEnvelopes.findFirst({
    where: and(eq(adBudgetEnvelopes.tenantId, input.tenantId), eq(adBudgetEnvelopes.id, plan.envelopeId)),
  });
  if (!envelope) throw new Error("Budget envelope not found");
  const amountMinor = positiveMinor(input.amountMinor, "amountMinor");
  if (amountMinor > plan.requestedBudgetMinor) throw new Error("Authorization exceeds the approved media-plan request");
  const validFrom = parseDate(input.validFrom, "validFrom");
  const validUntil = parseDate(input.validUntil, "validUntil");
  if (validUntil <= validFrom) throw new Error("validUntil must be after validFrom");
  if (validFrom < envelope.periodStart || validUntil > envelope.periodEnd) {
    throw new Error("Authorization validity must stay inside the budget-envelope period");
  }
  const authorityBounds = safeRecord(input.authorityBounds, "authorityBounds");
  const actionRun = await createActionRun({
    tenantId: input.tenantId,
    actionKey: "AD_SPEND_AUTHORIZATION_PREPARE",
    requestedByUserId: input.actorUserId,
    correlationId: `ad-spend-authorization:${idempotencyKey}`,
    payload: { idempotencyKey, mediaPlanId: plan.id, campaignId: campaign.id, amountMinor, confirmed: true },
  });
  try {
    const [authorization] = await db
      .insert(spendAuthorizations)
      .values({
        tenantId: input.tenantId,
        envelopeId: envelope.id,
        mediaPlanId: plan.id,
        campaignId: campaign.id,
        actionRunId: actionRun.id,
        idempotencyKey,
        status: "approval_required",
        amountMinor,
        currencyCode: envelope.currencyCode,
        validFrom,
        validUntil,
        purpose: boundedText(input.purpose, "purpose", 1000),
        authorityBounds,
        requestedByUserId: input.actorUserId,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    await completeRunSuccess({
      tenantId: input.tenantId,
      runId: actionRun.id,
      enforceEvidence: true,
      result: { authorizationId: authorization.id, status: authorization.status, externalSpendAuthorized: false },
      evidence: [{ evidenceType: "spend_authorization_request", payload: { authorizationId: authorization.id, amountMinor, currencyCode: envelope.currencyCode } }],
    });
    return { idempotentReplay: false, authorization, actionRunId: actionRun.id, externalSpendAuthorized: false };
  } catch (error: any) {
    await completeRunFailure({ tenantId: input.tenantId, runId: actionRun.id, error: String(error?.message || error) });
    throw error;
  }
}

export async function approveSpendAuthorization(input: {
  tenantId: number;
  actorUserId: number | null;
  authorizationId: string;
  confirmed: boolean;
  approvalReference: unknown;
  rationale: unknown;
}) {
  if (!input.actorUserId) throw new Error("An authenticated approving user is required");
  if (input.confirmed !== true) throw new Error("Accountable spend-authorization confirmation is required");
  const approvalReference = boundedText(input.approvalReference, "approvalReference");
  const rationale = boundedText(input.rationale, "rationale", 1000);
  const actionRun = await createActionRun({
    tenantId: input.tenantId,
    actionKey: "AD_SPEND_AUTHORIZATION_APPROVE",
    requestedByUserId: input.actorUserId,
    correlationId: `ad-spend-authorization-approval:${input.authorizationId}`,
    payload: { authorizationId: input.authorizationId, confirmed: true, approvalReference },
  });
  try {
    const result = await db.transaction(async (tx) => {
      const current = await tx.query.spendAuthorizations.findFirst({
        where: and(eq(spendAuthorizations.tenantId, input.tenantId), eq(spendAuthorizations.id, input.authorizationId)),
      });
      if (!current) throw new Error("Spend authorization not found");
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`ad-envelope:${current.envelopeId}`}))`);
      if (current.status === "approved") {
        return { authorization: current, idempotentReplay: true, campaignId: current.campaignId };
      }
      if (current.status !== "approval_required") throw new Error("Spend authorization is not awaiting approval");
      const [envelope, plan, campaign] = await Promise.all([
        tx.query.adBudgetEnvelopes.findFirst({
          where: and(eq(adBudgetEnvelopes.tenantId, input.tenantId), eq(adBudgetEnvelopes.id, current.envelopeId)),
        }),
        tx.query.mediaPlans.findFirst({
          where: and(eq(mediaPlans.tenantId, input.tenantId), eq(mediaPlans.id, current.mediaPlanId)),
        }),
        current.campaignId
          ? tx.query.adCampaigns.findFirst({
              where: and(eq(adCampaigns.tenantId, input.tenantId), eq(adCampaigns.id, current.campaignId)),
            })
          : null,
      ]);
      if (!envelope || envelope.status !== "active") throw new Error("Active budget envelope is required");
      if (!plan || plan.status !== "approved") throw new Error("Approved media plan is required");
      if (!campaign || campaign.status !== "APPROVED") throw new Error("Approved campaign is required");
      const account = await tx.query.adAccountConnections.findFirst({
        where: and(eq(adAccountConnections.tenantId, input.tenantId), eq(adAccountConnections.id, campaign.adAccountConnectionId)),
      });
      const accountReadiness = evaluateAdAccountReadiness(account ? accountPolicyInput(account) : null);
      if (!accountReadiness.ready) throw new Error(`Ad account is not ready: ${accountReadiness.blockers.join(", ")}`);
      const ancestors: Array<typeof adBudgetEnvelopes.$inferSelect> = [];
      let parentId = envelope.parentEnvelopeId;
      while (parentId && ancestors.length < 12) {
        const parent = await tx.query.adBudgetEnvelopes.findFirst({
          where: and(eq(adBudgetEnvelopes.tenantId, input.tenantId), eq(adBudgetEnvelopes.id, parentId)),
        });
        if (!parent) throw new Error("Budget envelope parent is missing");
        ancestors.push(parent);
        parentId = parent.parentEnvelopeId;
      }
      const now = new Date();
      const spendWindowEntries = await Promise.all(
        [envelope, ...ancestors].map(async (item) => [
          item.id,
          await currentSpendWindows({
            tenantId: input.tenantId,
            envelopeId: item.id,
            now,
            executor: tx,
          }),
        ] as const),
      );
      const spendWindowsByEnvelopeId = Object.fromEntries(spendWindowEntries);
      const availability = evaluateHierarchicalBudgetAvailability({
        tenantId: input.tenantId,
        currencyCode: current.currencyCode,
        requestedMinor: current.amountMinor,
        envelope,
        ancestors,
        ...spendWindowsByEnvelopeId[envelope.id],
        spendWindowsByEnvelopeId,
      });
      if (!availability.ready) throw new Error(`Budget authority is blocked: ${availability.blockers.join(", ")}`);
      if (now < current.validFrom || now >= current.validUntil) throw new Error("Spend authorization validity window is not current");
      const [authorization] = await tx
        .update(spendAuthorizations)
        .set({
          status: "approved",
          approvalEvidence: { approvalReference, rationale, approvedAt: now.toISOString() },
          approvedByUserId: input.actorUserId,
          approvedAt: now,
          updatedAt: now,
        })
        .where(and(eq(spendAuthorizations.tenantId, input.tenantId), eq(spendAuthorizations.id, current.id)))
        .returning();
      await tx
        .update(adBudgetEnvelopes)
        .set({ committedMinor: envelope.committedMinor + current.amountMinor, updatedAt: now })
        .where(and(eq(adBudgetEnvelopes.tenantId, input.tenantId), eq(adBudgetEnvelopes.id, envelope.id)));
      await tx
        .update(adCampaigns)
        .set({ status: "SUBMISSION_READY", updatedAt: now })
        .where(and(eq(adCampaigns.tenantId, input.tenantId), eq(adCampaigns.id, campaign.id)));
      await tx.insert(auditLogs).values({
        tenantId: input.tenantId,
        userId: input.actorUserId,
        userRole: "admin",
        action: "advertising.spend_authorization_approved",
        entityType: "spend_authorization",
        entityId: null,
        metadata: {
          authorizationId: current.id,
          envelopeId: envelope.id,
          campaignId: campaign.id,
          amountMinor: current.amountMinor,
          currencyCode: current.currencyCode,
          approvalReference,
          externalCampaignCreated: false,
          externalSpendPerformed: false,
        },
        createdAt: now,
      });
      return { authorization, idempotentReplay: false, campaignId: campaign.id };
    });
    await completeRunSuccess({
      tenantId: input.tenantId,
      runId: actionRun.id,
      enforceEvidence: true,
      result: { authorizationId: result.authorization.id, campaignId: result.campaignId, externalSpendPerformed: false },
      evidence: [{ evidenceType: "spend_authority_approval", payload: { approvalReference, rationale, amountMinor: result.authorization.amountMinor } }],
    });
    return { ...result, actionRunId: actionRun.id, externalCampaignCreated: false, externalSpendPerformed: false };
  } catch (error: any) {
    await completeRunFailure({ tenantId: input.tenantId, runId: actionRun.id, error: String(error?.message || error) });
    throw error;
  }
}
