import crypto from "node:crypto";

import { db } from "@db";
import {
  agentTasks,
  contacts,
  geoTerritories,
  marketingMediaItems,
  mediaInterviewClaims,
  mediaInterviewEvents,
  mediaInterviewSessions,
  mediaRenderJobs,
  mediaRightsGrants,
  mediaStudioAssets,
  mediaStudioEvents,
  mediaStudioProjects,
  mediaStudioVersions,
  sourceContentReferences,
} from "@db/schema";
import { and, desc, eq, inArray, sql } from "drizzle-orm";

import {
  completeRunFailure,
  completeRunSuccess,
  createActionRun,
} from "../actions/actionRuns";
import {
  evaluateInterviewReadiness,
  evaluateRenderPreparation,
  evaluateStudioProjectReadiness,
  normalizeMediaClaimCategory,
  normalizeMediaFactStatus,
  normalizeMediaInterviewMode,
  normalizeMediaRenderOutputFormat,
  normalizeMediaStudioAssetRole,
  sanitizeMediaStudioEvidence,
} from "./mediaStudioPolicy";

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function asRecordArray(value: unknown) {
  return Array.isArray(value) ? value.map(asRecord) : [];
}

function asStringArray(value: unknown) {
  const values = Array.isArray(value)
    ? value
    : String(value || "")
        .split(",")
        .map((entry) => entry.trim());
  return Array.from(new Set(values.map((entry) => String(entry || "").trim()).filter(Boolean)));
}

function requiredString(value: unknown, field: string, max = 500) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error(`${field} is required`);
  if (normalized.length > max) throw new Error(`${field} is too long`);
  return normalized;
}

function optionalString(value: unknown, max = 2_000) {
  const normalized = String(value || "").trim();
  if (normalized.length > max) throw new Error("Text value is too long");
  return normalized || null;
}

function normalizeIdempotencyKey(value: unknown, prefix: string) {
  const normalized = requiredString(value, "idempotencyKey", 180);
  return `${prefix}:${normalized}`;
}

function normalizeConsent(value: unknown) {
  const status = String(value || "unknown").trim().toLowerCase();
  if (["unknown", "pending", "granted", "declined", "revoked"].includes(status)) return status;
  throw new Error("Unsupported consent status");
}

function normalizeAssetConsent(value: unknown) {
  const status = String(value || "unknown").trim().toLowerCase();
  if (["unknown", "pending", "granted", "declined", "revoked", "not_applicable"].includes(status)) return status;
  throw new Error("Unsupported asset consent status");
}

function normalizeRightsStatus(value: unknown) {
  const status = String(value || "unknown").trim().toLowerCase();
  if (["unknown", "pending", "granted", "restricted", "revoked"].includes(status)) return status;
  throw new Error("Unsupported asset rights status");
}

function normalizeMusicStatus(value: unknown) {
  const status = String(value || "not_applicable").trim().toLowerCase();
  if (["unknown", "pending", "granted", "restricted", "revoked", "not_applicable"].includes(status)) return status;
  throw new Error("Unsupported music license status");
}

function assertConfirmed(confirmed: boolean, message = "Accountable human confirmation is required") {
  if (!confirmed) throw new Error(message);
}

function safeEvidence<T = unknown>(value: T, label: string): T {
  const check = sanitizeMediaStudioEvidence(value);
  if (check.containsCredentials) {
    throw new Error(`${label} contains credential material and cannot be stored (${check.redactedPaths.join(", ")})`);
  }
  return check.sanitized as T;
}

function stableHash(value: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function hasMaterialEvidence(value: unknown) {
  const record = asRecord(value);
  return Object.values(record).some((entry) => {
    if (typeof entry === "string") return Boolean(entry.trim());
    if (Array.isArray(entry)) return entry.length > 0;
    if (entry && typeof entry === "object") return Object.keys(entry as object).length > 0;
    return entry !== null && entry !== undefined && entry !== false;
  });
}

async function findSession(tenantId: number, sessionId: string) {
  return db.query.mediaInterviewSessions.findFirst({
    where: and(eq(mediaInterviewSessions.tenantId, tenantId), eq(mediaInterviewSessions.id, sessionId)),
  });
}

async function findProject(tenantId: number, projectId: string) {
  return db.query.mediaStudioProjects.findFirst({
    where: and(eq(mediaStudioProjects.tenantId, tenantId), eq(mediaStudioProjects.id, projectId)),
  });
}

async function findVersion(tenantId: number, projectId: string, versionId: string) {
  return db.query.mediaStudioVersions.findFirst({
    where: and(
      eq(mediaStudioVersions.tenantId, tenantId),
      eq(mediaStudioVersions.projectId, projectId),
      eq(mediaStudioVersions.id, versionId),
    ),
  });
}

async function validateInterviewReferences(input: {
  tenantId: number;
  territoryId: number | null;
  contactId: number | null;
  sourceReferenceId: number | null;
}) {
  const [territory, contact, sourceReference] = await Promise.all([
    input.territoryId
      ? db.query.geoTerritories.findFirst({
          where: and(eq(geoTerritories.tenantId, input.tenantId), eq(geoTerritories.id, input.territoryId)),
        })
      : null,
    input.contactId
      ? db.query.contacts.findFirst({
          where: and(eq(contacts.tenantId, input.tenantId), eq(contacts.id, input.contactId)),
        })
      : null,
    input.sourceReferenceId
      ? db.query.sourceContentReferences.findFirst({
          where: and(
            eq(sourceContentReferences.tenantId, input.tenantId),
            eq(sourceContentReferences.id, input.sourceReferenceId),
          ),
        })
      : null,
  ]);
  if (input.territoryId && !territory) throw new Error("Territory not found for tenant");
  if (input.contactId && !contact) throw new Error("Contact not found for tenant");
  if (input.sourceReferenceId && !sourceReference) throw new Error("Source reference not found for tenant");
  return { territory, contact, sourceReference };
}

export async function getMediaInterviewState(input: { tenantId: number; sessionId: string }) {
  const session = await findSession(input.tenantId, input.sessionId);
  if (!session) throw new Error("Interview session not found");
  const [claims, events] = await Promise.all([
    db
      .select()
      .from(mediaInterviewClaims)
      .where(and(eq(mediaInterviewClaims.tenantId, input.tenantId), eq(mediaInterviewClaims.sessionId, session.id)))
      .orderBy(mediaInterviewClaims.createdAt),
    db
      .select()
      .from(mediaInterviewEvents)
      .where(and(eq(mediaInterviewEvents.tenantId, input.tenantId), eq(mediaInterviewEvents.sessionId, session.id)))
      .orderBy(desc(mediaInterviewEvents.createdAt))
      .limit(200),
  ]);
  return {
    session,
    claims,
    events,
    readiness: evaluateInterviewReadiness({ session, claims }),
    invariants: {
      credentialsExposed: false,
      externalContactPerformed: false,
      recordingStarted: false,
      publicationPerformed: false,
    },
  };
}

async function getProjectComplianceState(tenantId: number, projectId: string) {
  const project = await findProject(tenantId, projectId);
  if (!project) throw new Error("Media studio project not found");
  const [sessionState, sourceReference, rightsGrant, assets] = await Promise.all([
    project.interviewSessionId
      ? getMediaInterviewState({ tenantId, sessionId: project.interviewSessionId })
      : null,
    project.sourceReferenceId
      ? db.query.sourceContentReferences.findFirst({
          where: and(
            eq(sourceContentReferences.tenantId, tenantId),
            eq(sourceContentReferences.id, project.sourceReferenceId),
          ),
        })
      : null,
    project.rightsGrantId
      ? db.query.mediaRightsGrants.findFirst({
          where: and(eq(mediaRightsGrants.tenantId, tenantId), eq(mediaRightsGrants.id, project.rightsGrantId)),
        })
      : null,
    db
      .select()
      .from(mediaStudioAssets)
      .where(and(eq(mediaStudioAssets.tenantId, tenantId), eq(mediaStudioAssets.projectId, projectId)))
      .orderBy(mediaStudioAssets.createdAt),
  ]);
  if (rightsGrant && sourceReference && rightsGrant.sourceReferenceId !== sourceReference.id) {
    throw new Error("Rights grant does not belong to the project source reference");
  }
  const readiness = evaluateStudioProjectReadiness({
    project,
    interview: sessionState
      ? { status: sessionState.session.status, readiness: sessionState.readiness }
      : null,
    sourceReference,
    rightsGrant,
    assets,
  });
  return { project, sessionState, sourceReference, rightsGrant, assets, readiness };
}

export async function getMediaStudioWorkspace(input: { tenantId: number; limit?: number }) {
  const limit = Math.max(1, Math.min(200, Number(input.limit || 100)));
  const [sessions, projects, assets, versions, renderJobs, workItems] = await Promise.all([
    db.select().from(mediaInterviewSessions).where(eq(mediaInterviewSessions.tenantId, input.tenantId)).orderBy(desc(mediaInterviewSessions.updatedAt)).limit(limit),
    db.select().from(mediaStudioProjects).where(eq(mediaStudioProjects.tenantId, input.tenantId)).orderBy(desc(mediaStudioProjects.updatedAt)).limit(limit),
    db.select().from(mediaStudioAssets).where(eq(mediaStudioAssets.tenantId, input.tenantId)).orderBy(desc(mediaStudioAssets.createdAt)).limit(limit * 3),
    db.select().from(mediaStudioVersions).where(eq(mediaStudioVersions.tenantId, input.tenantId)).orderBy(desc(mediaStudioVersions.createdAt)).limit(limit * 2),
    db.select().from(mediaRenderJobs).where(eq(mediaRenderJobs.tenantId, input.tenantId)).orderBy(desc(mediaRenderJobs.createdAt)).limit(limit * 2),
    db
      .select()
      .from(agentTasks)
      .where(
        and(
          eq(agentTasks.tenantId, input.tenantId),
          sql`${agentTasks.constraints} ->> 'source' in ('media_interview', 'media_studio')`,
        ),
      )
      .orderBy(desc(agentTasks.createdAt))
      .limit(limit * 2),
  ]);
  const sessionIds = sessions.map((row) => row.id);
  const claims = sessionIds.length
    ? await db
        .select()
        .from(mediaInterviewClaims)
        .where(and(eq(mediaInterviewClaims.tenantId, input.tenantId), inArray(mediaInterviewClaims.sessionId, sessionIds)))
        .orderBy(mediaInterviewClaims.createdAt)
    : [];
  return {
    sessions,
    claims,
    projects,
    assets,
    versions,
    renderJobs,
    workItems,
    vocabularies: {
      factStatuses: ["VERIFIED", "SUPPORTED_BY_DOCUMENT", "PRODUCER_CLAIM", "CREATOR_CLAIM", "INFERENCE", "UNVERIFIED", "OUTDATED"],
    },
    invariants: {
      providerNeutral: true,
      backgroundExecutionStarted: false,
      externalRenderExecuted: false,
      externalPublicationExecuted: false,
      tasksPausedByDefault: true,
      credentialsExposed: false,
    },
  };
}

export async function createMediaInterview(input: {
  tenantId: number;
  actorUserId: number | null;
  confirmed: boolean;
  idempotencyKey: unknown;
  mode: unknown;
  intervieweeName: unknown;
  intervieweeRole: unknown;
  organizationName: unknown;
  language?: unknown;
  territoryId?: number | null;
  contactId?: number | null;
  sourceReferenceId?: number | null;
  intendedUses?: unknown;
  recordingConsentStatus?: unknown;
  publicationConsentStatus?: unknown;
  aiProcessingConsentStatus?: unknown;
  consentEvidence?: unknown;
  questionPlan?: unknown;
}) {
  assertConfirmed(input.confirmed);
  const mode = normalizeMediaInterviewMode(input.mode);
  const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey, "media-interview");
  const existing = await db.query.mediaInterviewSessions.findFirst({
    where: and(
      eq(mediaInterviewSessions.tenantId, input.tenantId),
      eq(mediaInterviewSessions.idempotencyKey, idempotencyKey),
    ),
  });
  if (existing) return { idempotentReplay: true, ...(await getMediaInterviewState({ tenantId: input.tenantId, sessionId: existing.id })) };

  const territoryId = Number(input.territoryId || 0) || null;
  const contactId = Number(input.contactId || 0) || null;
  const sourceReferenceId = Number(input.sourceReferenceId || 0) || null;
  await validateInterviewReferences({ tenantId: input.tenantId, territoryId, contactId, sourceReferenceId });
  const consentEvidence = safeEvidence(asRecord(input.consentEvidence), "consentEvidence");
  const questionPlan = safeEvidence(asRecordArray(input.questionPlan), "questionPlan");
  const intendedUses = asStringArray(input.intendedUses).map((entry) => entry.toLowerCase());

  const actionRun = await createActionRun({
    tenantId: input.tenantId,
    actionKey: "MEDIA_INTERVIEW_PREPARE",
    requestedByUserId: input.actorUserId,
    correlationId: idempotencyKey,
    payload: { idempotencyKey, mode, confirmed: true },
  });
  try {
    const session = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${input.tenantId}:${idempotencyKey}`}))`);
      const replay = await tx.query.mediaInterviewSessions.findFirst({
        where: and(
          eq(mediaInterviewSessions.tenantId, input.tenantId),
          eq(mediaInterviewSessions.idempotencyKey, idempotencyKey),
        ),
      });
      if (replay) return replay;
      const recordingConsentStatus = normalizeConsent(input.recordingConsentStatus);
      const publicationConsentStatus = normalizeConsent(input.publicationConsentStatus);
      const aiProcessingConsentStatus = normalizeConsent(input.aiProcessingConsentStatus);
      const [created] = await tx
        .insert(mediaInterviewSessions)
        .values({
          tenantId: input.tenantId,
          territoryId,
          contactId,
          sourceReferenceId,
          idempotencyKey,
          mode,
          status:
            recordingConsentStatus === "granted" && aiProcessingConsentStatus === "granted"
              ? "draft"
              : "consent_pending",
          intervieweeName: requiredString(input.intervieweeName, "intervieweeName", 300),
          intervieweeRole: requiredString(input.intervieweeRole, "intervieweeRole", 300),
          organizationName: requiredString(input.organizationName, "organizationName", 300),
          language: String(input.language || "en").trim().toLowerCase() || "en",
          intendedUses,
          recordingConsentStatus,
          publicationConsentStatus,
          aiProcessingConsentStatus,
          consentEvidence,
          questionPlan,
          progress: { phase: "prepared", answeredClaims: 0 },
          blockers: [],
          preparationActionRunId: actionRun.id,
          createdByUserId: input.actorUserId,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();
      await tx.insert(mediaInterviewEvents).values({
        tenantId: input.tenantId,
        sessionId: created.id,
        eventType: "interview.prepared",
        actorUserId: input.actorUserId,
        payload: {
          actionRunId: actionRun.id,
          mode,
          intendedUses,
          recordingStarted: false,
          externalContactPerformed: false,
        },
      });
      return created;
    });
    await completeRunSuccess({
      tenantId: input.tenantId,
      runId: actionRun.id,
      enforceEvidence: true,
      result: { sessionId: session.id, recordingStarted: false, externalContactPerformed: false },
      evidence: [{ evidenceType: "MEDIA_INTERVIEW_PREPARATION", payload: { sessionId: session.id, mode, consentEvidence, confirmedByUserId: input.actorUserId } }],
    });
    return { idempotentReplay: false, ...(await getMediaInterviewState({ tenantId: input.tenantId, sessionId: session.id })) };
  } catch (error: any) {
    await completeRunFailure({ tenantId: input.tenantId, runId: actionRun.id, error: String(error?.message || error) }).catch(() => undefined);
    throw error;
  }
}

export async function upsertMediaInterviewClaim(input: {
  tenantId: number;
  actorUserId: number | null;
  sessionId: string;
  confirmed: boolean;
  questionKey: unknown;
  questionText: unknown;
  answerText: unknown;
  claimCategory?: unknown;
  factStatus?: unknown;
  isMaterial?: boolean;
  confidenceBps?: unknown;
  evidenceReferences?: unknown;
  evidence?: unknown;
  correctionNotes?: unknown;
  intervieweeApproved?: boolean;
}) {
  assertConfirmed(input.confirmed);
  const session = await findSession(input.tenantId, input.sessionId);
  if (!session) throw new Error("Interview session not found");
  if (["approved", "cancelled"].includes(session.status)) throw new Error("Approved or cancelled interviews are immutable");
  const questionKey = requiredString(input.questionKey, "questionKey", 180).toLowerCase().replace(/[^a-z0-9_.-]+/g, "_");
  const factStatus = normalizeMediaFactStatus(input.factStatus);
  const claimCategory = normalizeMediaClaimCategory(input.claimCategory);
  const evidenceReferences = safeEvidence(asStringArray(input.evidenceReferences), "evidenceReferences");
  const evidence = safeEvidence(asRecord(input.evidence), "evidence");
  const confidenceBps = Math.max(0, Math.min(10_000, Math.trunc(Number(input.confidenceBps || 0))));
  const verified = factStatus === "VERIFIED";
  const now = new Date();
  const [claim] = await db
    .insert(mediaInterviewClaims)
    .values({
      tenantId: input.tenantId,
      sessionId: session.id,
      questionKey,
      questionText: requiredString(input.questionText, "questionText", 2_000),
      answerText: requiredString(input.answerText, "answerText", 20_000),
      claimCategory,
      factStatus,
      isMaterial: input.isMaterial !== false,
      confidenceBps,
      evidenceReferences,
      evidence,
      correctionNotes: optionalString(input.correctionNotes, 5_000),
      verifiedByUserId: verified ? input.actorUserId : null,
      verifiedAt: verified ? now : null,
      intervieweeApprovedAt: input.intervieweeApproved === true ? now : null,
      createdByUserId: input.actorUserId,
      updatedByUserId: input.actorUserId,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [mediaInterviewClaims.sessionId, mediaInterviewClaims.questionKey],
      set: {
        questionText: requiredString(input.questionText, "questionText", 2_000),
        answerText: requiredString(input.answerText, "answerText", 20_000),
        claimCategory,
        factStatus,
        isMaterial: input.isMaterial !== false,
        confidenceBps,
        evidenceReferences,
        evidence,
        correctionNotes: optionalString(input.correctionNotes, 5_000),
        verifiedByUserId: verified ? input.actorUserId : null,
        verifiedAt: verified ? now : null,
        intervieweeApprovedAt: input.intervieweeApproved === true ? now : null,
        updatedByUserId: input.actorUserId,
        updatedAt: now,
      },
    })
    .returning();
  await db.transaction(async (tx) => {
    await tx.insert(mediaInterviewEvents).values({
      tenantId: input.tenantId,
      sessionId: session.id,
      claimId: claim.id,
      eventType: "interview.claim_recorded",
      actorUserId: input.actorUserId,
      payload: { questionKey, claimCategory, factStatus, isMaterial: input.isMaterial !== false },
    });
    const count = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(mediaInterviewClaims)
      .where(and(eq(mediaInterviewClaims.tenantId, input.tenantId), eq(mediaInterviewClaims.sessionId, session.id)));
    await tx
      .update(mediaInterviewSessions)
      .set({
        status: "in_progress",
        progress: { phase: "interview", answeredClaims: Number(count[0]?.count || 0) },
        updatedAt: now,
      })
      .where(and(eq(mediaInterviewSessions.tenantId, input.tenantId), eq(mediaInterviewSessions.id, session.id)));
  });
  return getMediaInterviewState({ tenantId: input.tenantId, sessionId: session.id });
}

async function createEvidenceTasks(input: {
  tenantId: number;
  sessionId: string;
  blockers: string[];
}) {
  const blockers = Array.from(new Set(input.blockers)).slice(0, 40);
  if (!blockers.length) return [];
  const existing = await db
    .select({ taskType: agentTasks.taskType })
    .from(agentTasks)
    .where(
      and(
        eq(agentTasks.tenantId, input.tenantId),
        sql`${agentTasks.constraints} ->> 'source' = 'media_interview'`,
        sql`${agentTasks.constraints} ->> 'sessionId' = ${input.sessionId}`,
      ),
    );
  const existingTypes = new Set(existing.map((row) => row.taskType));
  const rows = blockers
    .map((blocker) => ({ blocker, taskType: `media_interview:${input.sessionId}:evidence:${stableHash(blocker).slice(0, 12)}` }))
    .filter((row) => !existingTypes.has(row.taskType))
    .map((row) => ({
      tenantId: input.tenantId,
      agent: "media" as const,
      taskType: row.taskType,
      taskSource: "manual" as const,
      scriptGenerated: false,
      executionStatus: "queued" as const,
      goal: `Resolve interview evidence blocker: ${row.blocker}`,
      budgetUsdCap: "0.00",
      budgetMaxCalls: 0,
      budgetMaxTokens: 0,
      budgetUsedUsd: "0.0000",
      callsUsed: 0,
      tokensUsed: 0,
      status: "paused" as const,
      constraints: {
        source: "media_interview",
        sessionId: input.sessionId,
        blocker: row.blocker,
        approvalRequiredBeforeExecution: true,
        externalActionsForbidden: true,
        provenanceRequired: true,
      },
    }));
  return rows.length ? db.insert(agentTasks).values(rows).returning() : [];
}

export async function submitMediaInterviewForReview(input: {
  tenantId: number;
  actorUserId: number | null;
  sessionId: string;
  confirmed: boolean;
}) {
  assertConfirmed(input.confirmed);
  const state = await getMediaInterviewState({ tenantId: input.tenantId, sessionId: input.sessionId });
  if (["approved", "cancelled"].includes(state.session.status)) throw new Error("Interview cannot be submitted from its current state");
  const actionRun = await createActionRun({
    tenantId: input.tenantId,
    actionKey: "MEDIA_INTERVIEW_REVIEW",
    requestedByUserId: input.actorUserId,
    correlationId: `media-interview:${input.sessionId}:review:${Date.now()}`,
    payload: { sessionId: input.sessionId, operation: "submit", confirmed: true },
  });
  try {
    const blockers = state.readiness.productionBlockers;
    const tasks = await createEvidenceTasks({ tenantId: input.tenantId, sessionId: input.sessionId, blockers });
    await db.transaction(async (tx) => {
      await tx
        .update(mediaInterviewSessions)
        .set({
          status: state.readiness.productionReady ? "submitted" : "review_required",
          blockers,
          reviewActionRunId: actionRun.id,
          submittedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(eq(mediaInterviewSessions.tenantId, input.tenantId), eq(mediaInterviewSessions.id, input.sessionId)));
      await tx.insert(mediaInterviewEvents).values({
        tenantId: input.tenantId,
        sessionId: input.sessionId,
        eventType: "interview.submitted_for_review",
        actorUserId: input.actorUserId,
        payload: { actionRunId: actionRun.id, blockers, pausedEvidenceTaskIds: tasks.map((task) => task.id) },
      });
    });
    await completeRunSuccess({
      tenantId: input.tenantId,
      runId: actionRun.id,
      enforceEvidence: true,
      result: { sessionId: input.sessionId, productionReady: state.readiness.productionReady, taskCount: tasks.length },
      evidence: [{ evidenceType: "MEDIA_INTERVIEW_REVIEW", payload: { readiness: state.readiness, pausedEvidenceTaskIds: tasks.map((task) => task.id) } }],
    });
    return getMediaInterviewState({ tenantId: input.tenantId, sessionId: input.sessionId });
  } catch (error: any) {
    await completeRunFailure({ tenantId: input.tenantId, runId: actionRun.id, error: String(error?.message || error) }).catch(() => undefined);
    throw error;
  }
}

export async function approveMediaInterview(input: {
  tenantId: number;
  actorUserId: number | null;
  sessionId: string;
  confirmed: boolean;
  approvalEvidence?: unknown;
}) {
  assertConfirmed(input.confirmed);
  const approvalEvidence = safeEvidence(asRecord(input.approvalEvidence), "approvalEvidence");
  if (!hasMaterialEvidence(approvalEvidence)) throw new Error("Approval evidence is required");
  const state = await getMediaInterviewState({ tenantId: input.tenantId, sessionId: input.sessionId });
  const actionRun = await createActionRun({
    tenantId: input.tenantId,
    actionKey: "MEDIA_INTERVIEW_REVIEW",
    requestedByUserId: input.actorUserId,
    correlationId: `media-interview:${input.sessionId}:approve:${Date.now()}`,
    payload: { sessionId: input.sessionId, operation: "approve", confirmed: true },
  });
  try {
    if (!state.readiness.productionReady) {
      throw new Error(`Interview production approval blocked: ${state.readiness.productionBlockers.join(", ")}`);
    }
    await db.transaction(async (tx) => {
      await tx
        .update(mediaInterviewSessions)
        .set({
          status: "approved",
          blockers: [],
          reviewActionRunId: actionRun.id,
          approvedByUserId: input.actorUserId,
          approvedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(eq(mediaInterviewSessions.tenantId, input.tenantId), eq(mediaInterviewSessions.id, input.sessionId)));
      await tx.insert(mediaInterviewEvents).values({
        tenantId: input.tenantId,
        sessionId: input.sessionId,
        eventType: "interview.approved",
        actorUserId: input.actorUserId,
        payload: { actionRunId: actionRun.id, approvalEvidence },
      });
    });
    await completeRunSuccess({
      tenantId: input.tenantId,
      runId: actionRun.id,
      enforceEvidence: true,
      result: { sessionId: input.sessionId, approved: true },
      evidence: [{ evidenceType: "MEDIA_INTERVIEW_APPROVAL", payload: { approvalEvidence, readiness: state.readiness } }],
    });
    return getMediaInterviewState({ tenantId: input.tenantId, sessionId: input.sessionId });
  } catch (error: any) {
    await completeRunFailure({ tenantId: input.tenantId, runId: actionRun.id, error: String(error?.message || error), result: { blockers: state.readiness.productionBlockers } }).catch(() => undefined);
    throw error;
  }
}

export async function createMediaStudioProject(input: {
  tenantId: number;
  actorUserId: number | null;
  confirmed: boolean;
  idempotencyKey: unknown;
  interviewSessionId: string;
  sourceReferenceId?: number | null;
  rightsGrantId: number;
  sourceMediaItemId?: string | null;
  title: unknown;
  storyAngle?: unknown;
  language?: unknown;
  outputFormats?: unknown;
  contentPlan?: unknown;
}) {
  assertConfirmed(input.confirmed);
  const sessionState = await getMediaInterviewState({ tenantId: input.tenantId, sessionId: input.interviewSessionId });
  if (sessionState.session.status !== "approved" || !sessionState.readiness.productionReady) {
    throw new Error("An approved, production-ready interview is required");
  }
  const sourceReferenceId = Number(input.sourceReferenceId || sessionState.session.sourceReferenceId || 0);
  if (!sourceReferenceId) throw new Error("sourceReferenceId is required");
  const rightsGrantId = Number(input.rightsGrantId || 0);
  if (!rightsGrantId) throw new Error("rightsGrantId is required");
  const [sourceReference, rightsGrant, sourceMediaItem] = await Promise.all([
    db.query.sourceContentReferences.findFirst({
      where: and(eq(sourceContentReferences.tenantId, input.tenantId), eq(sourceContentReferences.id, sourceReferenceId)),
    }),
    db.query.mediaRightsGrants.findFirst({
      where: and(eq(mediaRightsGrants.tenantId, input.tenantId), eq(mediaRightsGrants.id, rightsGrantId)),
    }),
    input.sourceMediaItemId
      ? db.query.marketingMediaItems.findFirst({
          where: and(eq(marketingMediaItems.tenantId, input.tenantId), eq(marketingMediaItems.id, input.sourceMediaItemId)),
        })
      : null,
  ]);
  if (!sourceReference) throw new Error("Source reference not found for tenant");
  if (!rightsGrant || rightsGrant.sourceReferenceId !== sourceReference.id) throw new Error("Rights grant does not belong to the source reference");
  if (input.sourceMediaItemId && !sourceMediaItem) throw new Error("Source media item not found for tenant");
  const initialGate = evaluateStudioProjectReadiness({
    project: { sourceReferenceId, rightsGrantId },
    interview: { status: sessionState.session.status, readiness: sessionState.readiness },
    sourceReference,
    rightsGrant,
    assets: [],
  });
  const nonAssetBlockers = initialGate.blockers.filter((blocker) => blocker !== "at_least_one_provenance_asset_required");
  if (nonAssetBlockers.length) throw new Error(`Studio project blocked: ${nonAssetBlockers.join(", ")}`);
  const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey, "media-studio");
  const existing = await db.query.mediaStudioProjects.findFirst({
    where: and(eq(mediaStudioProjects.tenantId, input.tenantId), eq(mediaStudioProjects.idempotencyKey, idempotencyKey)),
  });
  if (existing) return { idempotentReplay: true, ...(await getProjectComplianceState(input.tenantId, existing.id)) };
  const contentPlan = safeEvidence(asRecord(input.contentPlan), "contentPlan");
  const outputFormats = asStringArray(input.outputFormats).map((format) => normalizeMediaRenderOutputFormat(format));
  const actionRun = await createActionRun({
    tenantId: input.tenantId,
    actionKey: "MEDIA_STUDIO_PROJECT_PREPARE",
    requestedByUserId: input.actorUserId,
    correlationId: idempotencyKey,
    payload: { idempotencyKey, interviewSessionId: input.interviewSessionId, confirmed: true },
  });
  try {
    const [project] = await db
      .insert(mediaStudioProjects)
      .values({
        tenantId: input.tenantId,
        territoryId: sessionState.session.territoryId,
        interviewSessionId: sessionState.session.id,
        sourceReferenceId,
        rightsGrantId,
        sourceMediaItemId: input.sourceMediaItemId || sourceReference.mediaItemId,
        idempotencyKey,
        title: requiredString(input.title, "title", 500),
        storyAngle: optionalString(input.storyAngle, 5_000),
        language: String(input.language || sessionState.session.language || "en").trim().toLowerCase(),
        status: "editing",
        outputFormats,
        contentPlan,
        complianceSnapshot: initialGate,
        blockers: ["at_least_one_provenance_asset_required"],
        preparationActionRunId: actionRun.id,
        externalRenderExecuted: false,
        createdByUserId: input.actorUserId,
      })
      .returning();
    await db.insert(mediaStudioEvents).values({
      tenantId: input.tenantId,
      projectId: project.id,
      eventType: "studio.project_prepared",
      actorUserId: input.actorUserId,
      payload: { actionRunId: actionRun.id, sourceReferenceId, rightsGrantId, externalRenderExecuted: false },
    });
    await completeRunSuccess({
      tenantId: input.tenantId,
      runId: actionRun.id,
      enforceEvidence: true,
      result: { projectId: project.id, externalRenderExecuted: false },
      evidence: [{ evidenceType: "MEDIA_STUDIO_PROJECT", payload: { projectId: project.id, sourceReferenceId, rightsGrantId, interviewSessionId: sessionState.session.id } }],
    });
    return { idempotentReplay: false, ...(await getProjectComplianceState(input.tenantId, project.id)) };
  } catch (error: any) {
    await completeRunFailure({ tenantId: input.tenantId, runId: actionRun.id, error: String(error?.message || error) }).catch(() => undefined);
    throw error;
  }
}

export async function addMediaStudioAsset(input: {
  tenantId: number;
  actorUserId: number | null;
  projectId: string;
  confirmed: boolean;
  assetRole: unknown;
  storageReference: unknown;
  originalSource: unknown;
  ownerName: unknown;
  sourceMediaItemId?: string | null;
  mimeType?: unknown;
  sha256?: unknown;
  generationProvider?: unknown;
  generationPrompt?: unknown;
  aiGenerated?: boolean;
  rightsStatus?: unknown;
  subjectConsentStatus?: unknown;
  musicLicenseStatus?: unknown;
  modifications?: unknown;
  metadata?: unknown;
}) {
  assertConfirmed(input.confirmed);
  const project = await findProject(input.tenantId, input.projectId);
  if (!project) throw new Error("Media studio project not found");
  if (["approved", "rendering", "ready", "scheduled", "published", "archived", "revoked"].includes(project.status)) {
    throw new Error("Project assets are immutable in the current state");
  }
  if (input.sourceMediaItemId) {
    const sourceItem = await db.query.marketingMediaItems.findFirst({
      where: and(eq(marketingMediaItems.tenantId, input.tenantId), eq(marketingMediaItems.id, input.sourceMediaItemId)),
    });
    if (!sourceItem) throw new Error("Source media item not found for tenant");
  }
  const storageReference = requiredString(input.storageReference, "storageReference", 4_000);
  const originalSource = requiredString(input.originalSource, "originalSource", 4_000);
  safeEvidence({ storageReference, originalSource }, "asset references");
  const metadata = safeEvidence(asRecord(input.metadata), "asset metadata");
  const modifications = safeEvidence(asRecordArray(input.modifications), "asset modifications");
  const assetRole = normalizeMediaStudioAssetRole(input.assetRole);
  const sha256 = optionalString(input.sha256, 128);
  if (sha256 && !/^[a-f0-9]{64}$/i.test(sha256)) throw new Error("sha256 must be a 64-character hexadecimal digest");
  const [asset] = await db
    .insert(mediaStudioAssets)
    .values({
      tenantId: input.tenantId,
      projectId: project.id,
      sourceMediaItemId: input.sourceMediaItemId || null,
      assetRole,
      storageReference,
      originalSource,
      ownerName: requiredString(input.ownerName, "ownerName", 500),
      uploaderUserId: input.actorUserId,
      mimeType: optionalString(input.mimeType, 300),
      sha256,
      generationProvider: optionalString(input.generationProvider, 300),
      generationPrompt: optionalString(input.generationPrompt, 20_000),
      aiGenerated: input.aiGenerated === true,
      rightsStatus: normalizeRightsStatus(input.rightsStatus),
      subjectConsentStatus: normalizeAssetConsent(input.subjectConsentStatus),
      musicLicenseStatus: normalizeMusicStatus(input.musicLicenseStatus),
      modifications,
      takedownState: "clear",
      metadata,
    })
    .onConflictDoUpdate({
      target: [mediaStudioAssets.projectId, mediaStudioAssets.storageReference],
      set: {
        assetRole,
        originalSource,
        ownerName: requiredString(input.ownerName, "ownerName", 500),
        mimeType: optionalString(input.mimeType, 300),
        sha256,
        generationProvider: optionalString(input.generationProvider, 300),
        generationPrompt: optionalString(input.generationPrompt, 20_000),
        aiGenerated: input.aiGenerated === true,
        rightsStatus: normalizeRightsStatus(input.rightsStatus),
        subjectConsentStatus: normalizeAssetConsent(input.subjectConsentStatus),
        musicLicenseStatus: normalizeMusicStatus(input.musicLicenseStatus),
        modifications,
        metadata,
        updatedAt: new Date(),
      },
    })
    .returning();
  await db.insert(mediaStudioEvents).values({
    tenantId: input.tenantId,
    projectId: project.id,
    eventType: "studio.asset_recorded",
    actorUserId: input.actorUserId,
    payload: { assetId: asset.id, assetRole, aiGenerated: asset.aiGenerated, credentialsStored: false },
  });
  return getProjectComplianceState(input.tenantId, project.id);
}

export async function createMediaStudioVersion(input: {
  tenantId: number;
  actorUserId: number | null;
  projectId: string;
  confirmed: boolean;
  storyboard?: unknown;
  editDecisionList?: unknown;
  naturalLanguageCommands?: unknown;
  outputSpecifications?: unknown;
  claimIds?: unknown;
  reviewComments?: unknown;
}) {
  assertConfirmed(input.confirmed);
  const state = await getProjectComplianceState(input.tenantId, input.projectId);
  if (["archived", "revoked", "published"].includes(state.project.status)) throw new Error("Project cannot be versioned in its current state");
  if (!state.assets.length) throw new Error("Record at least one provenance asset before creating a version");
  const claimIds = asStringArray(input.claimIds);
  if (!claimIds.length) throw new Error("At least one interview claim is required");
  const validClaimIds = new Set(state.sessionState?.claims.map((claim) => claim.id) || []);
  const invalidClaimIds = claimIds.filter((claimId) => !validClaimIds.has(claimId));
  if (invalidClaimIds.length) throw new Error(`Claim does not belong to the project interview: ${invalidClaimIds.join(", ")}`);
  const storyboard = safeEvidence(asRecordArray(input.storyboard), "storyboard");
  const editDecisionList = safeEvidence(asRecordArray(input.editDecisionList), "editDecisionList");
  const naturalLanguageCommands = safeEvidence(asStringArray(input.naturalLanguageCommands), "naturalLanguageCommands");
  const outputSpecifications = safeEvidence(asRecord(input.outputSpecifications), "outputSpecifications");
  const reviewComments = safeEvidence(asRecordArray(input.reviewComments), "reviewComments");
  const contentHash = stableHash({ storyboard, editDecisionList, naturalLanguageCommands, outputSpecifications, claimIds });
  const version = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${input.tenantId}:${input.projectId}:version`}))`);
    const [latest] = await tx
      .select({ versionNumber: mediaStudioVersions.versionNumber })
      .from(mediaStudioVersions)
      .where(and(eq(mediaStudioVersions.tenantId, input.tenantId), eq(mediaStudioVersions.projectId, input.projectId)))
      .orderBy(desc(mediaStudioVersions.versionNumber))
      .limit(1);
    const versionNumber = Number(latest?.versionNumber || 0) + 1;
    const [created] = await tx
      .insert(mediaStudioVersions)
      .values({
        tenantId: input.tenantId,
        projectId: input.projectId,
        versionNumber,
        status: "review_required",
        storyboard,
        editDecisionList,
        naturalLanguageCommands,
        outputSpecifications,
        claimIds,
        reviewComments,
        contentHash,
        createdByUserId: input.actorUserId,
      })
      .returning();
    await tx
      .update(mediaStudioProjects)
      .set({ status: "compliance_review", currentVersionNumber: versionNumber, updatedAt: new Date() })
      .where(and(eq(mediaStudioProjects.tenantId, input.tenantId), eq(mediaStudioProjects.id, input.projectId)));
    await tx.insert(mediaStudioEvents).values({
      tenantId: input.tenantId,
      projectId: input.projectId,
      versionId: created.id,
      eventType: "studio.version_created",
      actorUserId: input.actorUserId,
      payload: { versionNumber, contentHash },
    });
    return created;
  });
  return { version, ...(await getProjectComplianceState(input.tenantId, input.projectId)) };
}

export async function approveMediaStudioVersion(input: {
  tenantId: number;
  actorUserId: number | null;
  projectId: string;
  versionId: string;
  confirmed: boolean;
  approvalEvidence?: unknown;
}) {
  assertConfirmed(input.confirmed);
  const approvalEvidence = safeEvidence(asRecord(input.approvalEvidence), "approvalEvidence");
  if (!hasMaterialEvidence(approvalEvidence)) throw new Error("Approval evidence is required");
  const state = await getProjectComplianceState(input.tenantId, input.projectId);
  const version = await findVersion(input.tenantId, input.projectId, input.versionId);
  if (!version) throw new Error("Studio version not found");
  if (!version.contentHash) throw new Error("Version content hash is required");
  if (!state.readiness.readyForApproval) throw new Error(`Studio version approval blocked: ${state.readiness.blockers.join(", ")}`);
  await db.transaction(async (tx) => {
    await tx
      .update(mediaStudioVersions)
      .set({ status: "superseded", updatedAt: new Date() })
      .where(and(eq(mediaStudioVersions.tenantId, input.tenantId), eq(mediaStudioVersions.projectId, input.projectId), eq(mediaStudioVersions.status, "approved")));
    await tx
      .update(mediaStudioVersions)
      .set({ status: "approved", approvalEvidence, approvedByUserId: input.actorUserId, approvedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(mediaStudioVersions.tenantId, input.tenantId), eq(mediaStudioVersions.id, version.id)));
    await tx
      .update(mediaStudioProjects)
      .set({ status: "approved", complianceSnapshot: state.readiness, blockers: [], approvedByUserId: input.actorUserId, approvedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(mediaStudioProjects.tenantId, input.tenantId), eq(mediaStudioProjects.id, input.projectId)));
    await tx.insert(mediaStudioEvents).values({
      tenantId: input.tenantId,
      projectId: input.projectId,
      versionId: version.id,
      eventType: "studio.version_approved",
      actorUserId: input.actorUserId,
      payload: { contentHash: version.contentHash, approvalEvidence, externalRenderExecuted: false },
    });
  });
  return getProjectComplianceState(input.tenantId, input.projectId);
}

export class MediaRenderPreparationBlockedError extends Error {
  readonly blockers: string[];
  constructor(blockers: string[]) {
    super(`MEDIA_RENDER_PREPARATION_BLOCKED:${blockers.join(",")}`);
    this.name = "MediaRenderPreparationBlockedError";
    this.blockers = blockers;
  }
}

export async function prepareMediaRenderJob(input: {
  tenantId: number;
  actorUserId: number | null;
  projectId: string;
  versionId: string;
  confirmed: boolean;
  idempotencyKey: unknown;
  outputFormat: unknown;
  renderSpecification?: unknown;
  costEstimateMinor?: unknown;
  currencyCode?: unknown;
}) {
  assertConfirmed(input.confirmed);
  const state = await getProjectComplianceState(input.tenantId, input.projectId);
  const version = await findVersion(input.tenantId, input.projectId, input.versionId);
  if (!version) throw new Error("Studio version not found");
  const missingHashes = state.assets.filter((asset) => !String(asset.sha256 || "").trim());
  if (missingHashes.length) {
    throw new MediaRenderPreparationBlockedError(missingHashes.map((asset) => `asset:${asset.id}:sha256_required`));
  }
  const inputAssetHashes = state.assets.map((asset) => String(asset.sha256));
  const outputFormat = normalizeMediaRenderOutputFormat(input.outputFormat);
  const gate = evaluateRenderPreparation({
    project: state.project,
    version,
    projectReadiness: state.readiness,
    outputFormat,
    inputAssetHashes,
  });
  if (!gate.ready) throw new MediaRenderPreparationBlockedError(gate.blockers);
  const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey, "media-render");
  const existing = await db.query.mediaRenderJobs.findFirst({
    where: and(eq(mediaRenderJobs.tenantId, input.tenantId), eq(mediaRenderJobs.idempotencyKey, idempotencyKey)),
  });
  if (existing) {
    return { idempotentReplay: true, renderJob: existing, gate, providerSubmissionExecuted: false, externalRenderExecuted: existing.externalRenderExecuted };
  }
  const renderSpecification = safeEvidence(asRecord(input.renderSpecification), "renderSpecification");
  const actionRun = await createActionRun({
    tenantId: input.tenantId,
    actionKey: "MEDIA_RENDER_PREPARE",
    requestedByUserId: input.actorUserId,
    correlationId: idempotencyKey,
    payload: { projectId: input.projectId, versionId: input.versionId, outputFormat, confirmed: true },
  });
  try {
    const [renderJob] = await db
      .insert(mediaRenderJobs)
      .values({
        tenantId: input.tenantId,
        projectId: input.projectId,
        versionId: input.versionId,
        idempotencyKey,
        outputFormat,
        status: "prepared",
        provider: null,
        providerJobReference: null,
        costEstimateMinor: Math.max(0, Math.trunc(Number(input.costEstimateMinor || 0))) || null,
        currencyCode: optionalString(input.currencyCode, 12)?.toUpperCase() || null,
        renderSpecification,
        inputAssetHashes,
        externalRenderExecuted: false,
        providerConfirmed: false,
        preparationActionRunId: actionRun.id,
        requestedByUserId: input.actorUserId,
      })
      .returning();
    await db.insert(mediaStudioEvents).values({
      tenantId: input.tenantId,
      projectId: input.projectId,
      versionId: input.versionId,
      renderJobId: renderJob.id,
      eventType: "studio.render_prepared",
      actorUserId: input.actorUserId,
      payload: { actionRunId: actionRun.id, outputFormat, providerSubmissionExecuted: false, externalRenderExecuted: false },
    });
    await completeRunSuccess({
      tenantId: input.tenantId,
      runId: actionRun.id,
      enforceEvidence: true,
      result: { renderJobId: renderJob.id, status: "prepared", providerSubmissionExecuted: false, externalRenderExecuted: false },
      evidence: [{ evidenceType: "MEDIA_RENDER_PREPARATION", payload: { renderJobId: renderJob.id, projectId: input.projectId, versionId: input.versionId, contentHash: version.contentHash, inputAssetHashes, gate } }],
    });
    return { idempotentReplay: false, renderJob, gate, providerSubmissionExecuted: false, externalRenderExecuted: false };
  } catch (error: any) {
    await completeRunFailure({ tenantId: input.tenantId, runId: actionRun.id, error: String(error?.message || error) }).catch(() => undefined);
    throw error;
  }
}

export async function cancelPreparedMediaRenderJob(input: {
  tenantId: number;
  actorUserId: number | null;
  renderJobId: string;
  confirmed: boolean;
  reason?: unknown;
}) {
  assertConfirmed(input.confirmed);
  const renderJob = await db.query.mediaRenderJobs.findFirst({
    where: and(eq(mediaRenderJobs.tenantId, input.tenantId), eq(mediaRenderJobs.id, input.renderJobId)),
  });
  if (!renderJob) throw new Error("Render job not found");
  if (renderJob.status !== "prepared" || renderJob.externalRenderExecuted) {
    throw new Error("Only a non-executed prepared render job can be cancelled here");
  }
  const reason = requiredString(input.reason, "reason", 2_000);
  const [updated] = await db
    .update(mediaRenderJobs)
    .set({ status: "cancelled", failureDiagnostics: { cancellationReason: reason }, cancelledAt: new Date(), updatedAt: new Date() })
    .where(and(eq(mediaRenderJobs.tenantId, input.tenantId), eq(mediaRenderJobs.id, renderJob.id)))
    .returning();
  await db.insert(mediaStudioEvents).values({
    tenantId: input.tenantId,
    projectId: renderJob.projectId,
    versionId: renderJob.versionId,
    renderJobId: renderJob.id,
    eventType: "studio.render_cancelled",
    actorUserId: input.actorUserId,
    payload: { reason, externalRenderExecuted: false, providerSubmissionExecuted: false },
  });
  return { renderJob: updated, externalRenderExecuted: false, providerSubmissionExecuted: false };
}
