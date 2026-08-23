import { db } from "@db";
import {
  adBudgetEnvelopes,
  agentTasks,
  auditLogs,
  geoTerritories,
  territoryActivations,
  territoryAgentTeams,
  territoryBudgets,
  territoryCoverageSnapshots,
  territoryKpis,
  territoryOperationalProfiles,
} from "@db/schema";
import { and, desc, eq, sql } from "drizzle-orm";

import {
  completeRunFailure,
  completeRunSuccess,
  createActionRun,
} from "../actions/actionRuns";
import {
  evaluateTerritoryActivationReadiness,
  normalizeTerritoryCoverage,
  TERRITORY_ACTIVATION_WORKSTREAMS,
  type TerritoryOperatingMode,
} from "./territoryOperatingPolicy";
import { territoryScorecardView } from "./territoryScorecardPolicy";

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function asStringArray(value: unknown): string[] {
  const entries = Array.isArray(value)
    ? value
    : String(value || "")
        .split(",")
        .map((entry) => entry.trim());
  return Array.from(new Set(entries.map((entry) => String(entry || "").trim()).filter(Boolean)));
}

function normalizeMode(value: unknown): TerritoryOperatingMode {
  const mode = String(value || "research_only").trim().toLowerCase();
  if (mode === "media_pilot" || mode === "commerce") return mode;
  return "research_only";
}

function normalizeIdempotencyKey(value: unknown, territoryId: number) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error("idempotencyKey is required");
  if (normalized.length > 180) throw new Error("idempotencyKey is too long");
  return `territory:${territoryId}:${normalized}`;
}

function normalizeProfileInput(input: JsonRecord, territory: any) {
  const geographyEvidenceInput = asRecord(input.geographyEvidence);
  const evidenceReference = String(
    geographyEvidenceInput.reference || input.geographyEvidenceReference || "",
  ).trim();
  const geographyEvidence = {
    ...geographyEvidenceInput,
    ...(evidenceReference
      ? {
          confirmed: geographyEvidenceInput.confirmed === true || input.confirmGeographyEvidence === true,
          reference: evidenceReference,
        }
      : {}),
  };

  return {
    operatingMode: normalizeMode(input.operatingMode),
    primaryLanguage: String(input.primaryLanguage || territory.language || "").trim() || null,
    secondaryLanguages: asStringArray(input.secondaryLanguages),
    prioritySectors: asStringArray(input.prioritySectors),
    geographyEvidence,
    operatingRules: {
      noBackgroundExecution: true,
      externalActionsRequireApproval: true,
      noFabricatedGeography: true,
      noCreatorMediaReuseWithoutRights: true,
      ...asRecord(input.operatingRules),
    },
  };
}

async function findTerritory(tenantId: number, territoryId: number) {
  return db.query.geoTerritories.findFirst({
    where: and(eq(geoTerritories.tenantId, tenantId), eq(geoTerritories.id, territoryId)),
  });
}

export async function getTerritoryOperatingLayer(tenantId: number, territoryId: number) {
  const territory = await findTerritory(tenantId, territoryId);
  if (!territory) throw new Error("Territory not found");

  const [profile, activations, coverageSnapshots, team, workItems, budgets, scorecards, advertisingBudgetEnvelopes] =
    await Promise.all([
      db.query.territoryOperationalProfiles.findFirst({
        where: and(
          eq(territoryOperationalProfiles.tenantId, tenantId),
          eq(territoryOperationalProfiles.territoryId, territoryId),
        ),
      }),
      db
        .select()
        .from(territoryActivations)
        .where(
          and(
            eq(territoryActivations.tenantId, tenantId),
            eq(territoryActivations.territoryId, territoryId),
          ),
        )
        .orderBy(desc(territoryActivations.createdAt))
        .limit(20),
      db
        .select()
        .from(territoryCoverageSnapshots)
        .where(
          and(
            eq(territoryCoverageSnapshots.tenantId, tenantId),
            eq(territoryCoverageSnapshots.territoryId, territoryId),
          ),
        )
        .orderBy(desc(territoryCoverageSnapshots.capturedAt))
        .limit(20),
      db
        .select()
        .from(territoryAgentTeams)
        .where(
          and(
            eq(territoryAgentTeams.tenantId, tenantId),
            eq(territoryAgentTeams.territoryId, territoryId),
          ),
        )
        .orderBy(desc(territoryAgentTeams.createdAt)),
      db
        .select()
        .from(agentTasks)
        .where(
          and(
            eq(agentTasks.tenantId, tenantId),
            sql`${agentTasks.constraints} ->> 'territoryId' = ${String(territoryId)}`,
            sql`${agentTasks.constraints} ->> 'source' = 'territory_activation'`,
          ),
        )
        .orderBy(desc(agentTasks.createdAt))
        .limit(100),
      db
        .select()
        .from(territoryBudgets)
        .where(eq(territoryBudgets.territoryId, territoryId))
        .orderBy(desc(territoryBudgets.month))
        .limit(12),
      db
        .select()
        .from(territoryKpis)
        .where(eq(territoryKpis.territoryId, territoryId))
        .orderBy(desc(territoryKpis.month))
        .limit(12),
      db
        .select({
          id: adBudgetEnvelopes.id,
          parentEnvelopeId: adBudgetEnvelopes.parentEnvelopeId,
          name: adBudgetEnvelopes.name,
          scopeType: adBudgetEnvelopes.scopeType,
          scopeReferenceId: adBudgetEnvelopes.scopeReferenceId,
          currencyCode: adBudgetEnvelopes.currencyCode,
          status: adBudgetEnvelopes.status,
          periodStart: adBudgetEnvelopes.periodStart,
          periodEnd: adBudgetEnvelopes.periodEnd,
          totalCapMinor: adBudgetEnvelopes.totalCapMinor,
          dailyCapMinor: adBudgetEnvelopes.dailyCapMinor,
          weeklyCapMinor: adBudgetEnvelopes.weeklyCapMinor,
          monthlyCapMinor: adBudgetEnvelopes.monthlyCapMinor,
          committedMinor: adBudgetEnvelopes.committedMinor,
          spentMinor: adBudgetEnvelopes.spentMinor,
          maximumCacMinor: adBudgetEnvelopes.maximumCacMinor,
          minimumMarginBps: adBudgetEnvelopes.minimumMarginBps,
          agentReallocationAllowed: adBudgetEnvelopes.agentReallocationAllowed,
          maximumReallocationBps: adBudgetEnvelopes.maximumReallocationBps,
          approvedAt: adBudgetEnvelopes.approvedAt,
          updatedAt: adBudgetEnvelopes.updatedAt,
        })
        .from(adBudgetEnvelopes)
        .where(
          and(
            eq(adBudgetEnvelopes.tenantId, tenantId),
            eq(adBudgetEnvelopes.territoryId, territoryId),
          ),
        )
        .orderBy(desc(adBudgetEnvelopes.periodEnd))
        .limit(50),
    ]);

  const latestCoverage = coverageSnapshots[0] || null;
  const readiness = profile
    ? evaluateTerritoryActivationReadiness({
        territory,
        profile,
        coverage: latestCoverage?.dimensions || {},
      })
    : null;

  return {
    territory,
    profile,
    activations,
    latestActivation: activations[0] || null,
    coverageSnapshots,
    latestCoverage,
    team,
    workItems,
    budgets,
    scorecards: scorecards.map((scorecard) =>
      territoryScorecardView(scorecard as unknown as JsonRecord),
    ),
    advertisingBudgetEnvelopes,
    readiness,
    invariants: {
      canonicalGeographyTable: "geo_territories",
      budgetTableReused: "territory_budgets",
      scorecardTableReused: "territory_kpis",
      advertisingBudgetTableReused: "ad_budget_envelopes",
      tasksPausedByDefault: true,
      backgroundExecutionStarted: false,
    },
  };
}

export async function prepareTerritoryActivation(input: {
  tenantId: number;
  territoryId: number;
  requestedByUserId: number | null;
  idempotencyKey: string;
  profile?: JsonRecord;
  coverage?: unknown;
  activationScope?: JsonRecord;
}) {
  const territory = await findTerritory(input.tenantId, input.territoryId);
  if (!territory) throw new Error("Territory not found");

  const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey, input.territoryId);
  const existing = await db.query.territoryActivations.findFirst({
    where: and(
      eq(territoryActivations.tenantId, input.tenantId),
      eq(territoryActivations.idempotencyKey, idempotencyKey),
    ),
  });
  if (existing) {
    return {
      idempotentReplay: true,
      activation: existing,
      operatingLayer: await getTerritoryOperatingLayer(input.tenantId, input.territoryId),
    };
  }

  const profileInput = normalizeProfileInput(input.profile || {}, territory);
  const coverage = normalizeTerritoryCoverage(input.coverage);
  const readiness = evaluateTerritoryActivationReadiness({
    territory,
    profile: profileInput,
    coverage,
  });

  const preparationRun = await createActionRun({
    tenantId: input.tenantId,
    actionKey: "TERRITORY_ACTIVATION_PREPARE",
    requestedByUserId: input.requestedByUserId,
    correlationId: idempotencyKey,
    payload: {
      territoryId: input.territoryId,
      idempotencyKey,
      operatingMode: profileInput.operatingMode,
      noBackgroundExecution: true,
    },
  });

  try {
    const activation = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(${input.tenantId}, ${input.territoryId})`);

      const replay = await tx.query.territoryActivations.findFirst({
        where: and(
          eq(territoryActivations.tenantId, input.tenantId),
          eq(territoryActivations.idempotencyKey, idempotencyKey),
        ),
      });
      if (replay) return replay;

      const [profile] = await tx
        .insert(territoryOperationalProfiles)
        .values({
          tenantId: input.tenantId,
          territoryId: input.territoryId,
          operatingMode: profileInput.operatingMode,
          operationalStatus: readiness.eligibleForApproval ? "approval_required" : "draft",
          primaryLanguage: profileInput.primaryLanguage,
          secondaryLanguages: profileInput.secondaryLanguages,
          prioritySectors: profileInput.prioritySectors,
          geographyEvidence: profileInput.geographyEvidence,
          operatingRules: profileInput.operatingRules,
          dataGaps: readiness.dataGaps,
          readinessStatus: readiness.readinessStatus,
          createdByUserId: input.requestedByUserId,
          updatedByUserId: input.requestedByUserId,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [territoryOperationalProfiles.tenantId, territoryOperationalProfiles.territoryId],
          set: {
            operatingMode: profileInput.operatingMode,
            operationalStatus: readiness.eligibleForApproval ? "approval_required" : "draft",
            primaryLanguage: profileInput.primaryLanguage,
            secondaryLanguages: profileInput.secondaryLanguages,
            prioritySectors: profileInput.prioritySectors,
            geographyEvidence: profileInput.geographyEvidence,
            operatingRules: profileInput.operatingRules,
            dataGaps: readiness.dataGaps,
            readinessStatus: readiness.readinessStatus,
            updatedByUserId: input.requestedByUserId,
            updatedAt: new Date(),
          },
        })
        .returning();

      const [latestVersion] = await tx
        .select({ version: territoryActivations.version })
        .from(territoryActivations)
        .where(
          and(
            eq(territoryActivations.tenantId, input.tenantId),
            eq(territoryActivations.territoryId, input.territoryId),
          ),
        )
        .orderBy(desc(territoryActivations.version))
        .limit(1);

      const [created] = await tx
        .insert(territoryActivations)
        .values({
          tenantId: input.tenantId,
          territoryId: input.territoryId,
          profileId: profile.id,
          version: Number(latestVersion?.version || 0) + 1,
          status: readiness.eligibleForApproval ? "approval_required" : "blocked",
          operatingMode: readiness.operatingMode,
          idempotencyKey,
          preparationActionRunId: preparationRun.id,
          readinessSnapshot: readiness,
          activationScope: {
            atomicOperatingUnit: "neighborhood",
            ...asRecord(input.activationScope),
          },
          blockers: readiness.blockers,
          evidence: {
            geographySource: territory.source || null,
            geographySourceRef: territory.sourceRef || null,
            preparedFromCanonicalTerritoryId: territory.id,
          },
          requestedByUserId: input.requestedByUserId,
          requestedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      await tx.insert(territoryCoverageSnapshots).values({
        tenantId: input.tenantId,
        territoryId: input.territoryId,
        activationId: created.id,
        status: readiness.coverageStatus,
        dimensions: readiness.coverage,
        gaps: readiness.dataGaps,
        evidence: { preparedFromActivation: created.id },
        capturedByUserId: input.requestedByUserId,
        capturedAt: new Date(),
        createdAt: new Date(),
      });

      await tx.insert(territoryAgentTeams).values(
        TERRITORY_ACTIVATION_WORKSTREAMS.map((workstream) => ({
          tenantId: input.tenantId,
          territoryId: input.territoryId,
          activationId: created.id,
          departmentKey: workstream.departmentKey,
          roleKey: workstream.roleKey,
          autonomyLevel: "approval_required",
          responsibility: workstream.responsibility,
          budgetUsdCap: "0.00",
          status: "planned",
          createdAt: new Date(),
          updatedAt: new Date(),
        })),
      );

      await tx.insert(agentTasks).values(
        TERRITORY_ACTIVATION_WORKSTREAMS.map((workstream) => ({
          tenantId: input.tenantId,
          agent: workstream.agent,
          taskType: `territory_activation:${created.id}:${workstream.key}`,
          taskSource: "manual" as const,
          scriptGenerated: false,
          executionStatus: "queued" as const,
          goal: `${workstream.responsibility} Territory: ${territory.name}.`,
          budgetUsdCap: "0.00",
          budgetMaxCalls: 0,
          budgetMaxTokens: 0,
          budgetUsedUsd: "0.0000",
          callsUsed: 0,
          tokensUsed: 0,
          status: "paused" as const,
          constraints: {
            source: "territory_activation",
            tenantId: input.tenantId,
            territoryId: String(input.territoryId),
            activationId: String(created.id),
            workstream: workstream.key,
            approvalRequiredBeforeExecution: true,
            externalActionsForbidden: true,
            provenanceRequired: true,
          },
          createdByUserId: input.requestedByUserId,
          createdAt: new Date(),
          updatedAt: new Date(),
        })),
      );

      await tx.insert(auditLogs).values({
        tenantId: input.tenantId,
        userId: input.requestedByUserId,
        userRole: "admin",
        action: "territory.activation.prepared",
        entityType: "territory",
        entityId: input.territoryId,
        metadata: {
          activationId: created.id,
          actionRunId: preparationRun.id,
          status: created.status,
          blockers: readiness.blockers,
          workItemsCreated: TERRITORY_ACTIVATION_WORKSTREAMS.length,
          backgroundExecutionStarted: false,
        },
        createdAt: new Date(),
      });

      return created;
    });

    await completeRunSuccess({
      tenantId: input.tenantId,
      runId: preparationRun.id,
      enforceEvidence: true,
      result: {
        territoryId: input.territoryId,
        activationId: activation.id,
        status: activation.status,
        workItemsCreated: TERRITORY_ACTIVATION_WORKSTREAMS.length,
        backgroundExecutionStarted: false,
      },
      evidence: [
        {
          evidenceType: "DB_MUTATION",
          payload: {
            territoryId: input.territoryId,
            activationId: activation.id,
            profileId: activation.profileId,
            coverageSnapshotCreated: true,
            pausedWorkItemsCreated: TERRITORY_ACTIVATION_WORKSTREAMS.length,
          },
        },
      ],
    });

    return {
      idempotentReplay: false,
      activation,
      operatingLayer: await getTerritoryOperatingLayer(input.tenantId, input.territoryId),
    };
  } catch (error: any) {
    await completeRunFailure({
      tenantId: input.tenantId,
      runId: preparationRun.id,
      error: String(error?.message || error || "Territory activation preparation failed"),
    }).catch(() => undefined);
    throw error;
  }
}

export async function approveTerritoryActivation(input: {
  tenantId: number;
  territoryId: number;
  activationId: number;
  approvedByUserId: number | null;
  approvalNote: string;
}) {
  if (!String(input.approvalNote || "").trim()) throw new Error("approvalNote is required");

  const layer = await getTerritoryOperatingLayer(input.tenantId, input.territoryId);
  const activation = layer.activations.find((entry: any) => entry.id === input.activationId);
  if (!activation) throw new Error("Activation not found");
  if (activation.status === "active") return { idempotentReplay: true, activation, operatingLayer: layer };
  if (activation.status !== "approval_required" && activation.status !== "blocked") {
    throw new Error(`Activation cannot be approved from status ${activation.status}`);
  }
  if (!layer.profile) throw new Error("Operational profile not found");

  const readiness = evaluateTerritoryActivationReadiness({
    territory: layer.territory,
    profile: layer.profile,
    coverage: layer.latestCoverage?.dimensions || {},
  });
  if (!readiness.eligibleForApproval) {
    throw new Error(`TERRITORY_ACTIVATION_BLOCKED:${readiness.blockers.join(",")}`);
  }

  const run = await createActionRun({
    tenantId: input.tenantId,
    actionKey: "TERRITORY_ACTIVATE",
    requestedByUserId: input.approvedByUserId,
    correlationId: `territory:${input.territoryId}:activation:${input.activationId}`,
    payload: {
      territoryId: input.territoryId,
      activationId: input.activationId,
    },
  });

  try {
    const updated = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(${input.tenantId}, ${input.territoryId})`);
      const active = await tx.query.territoryActivations.findFirst({
        where: and(
          eq(territoryActivations.tenantId, input.tenantId),
          eq(territoryActivations.territoryId, input.territoryId),
          eq(territoryActivations.status, "active"),
        ),
      });
      if (active && active.id !== input.activationId) {
        throw new Error(`Another activation is already active (${active.id})`);
      }

      const now = new Date();
      const [row] = await tx
        .update(territoryActivations)
        .set({
          status: "active",
          activationActionRunId: run.id,
          readinessSnapshot: readiness,
          blockers: [],
          approvedByUserId: input.approvedByUserId,
          approvedAt: now,
          activatedAt: now,
          pausedAt: null,
          evidence: {
            ...asRecord(activation.evidence),
            approvalNote: String(input.approvalNote).trim(),
            approvedAgainstReadiness: readiness,
          },
          updatedAt: now,
        })
        .where(
          and(
            eq(territoryActivations.tenantId, input.tenantId),
            eq(territoryActivations.id, input.activationId),
          ),
        )
        .returning();

      await tx
        .update(territoryOperationalProfiles)
        .set({
          operationalStatus: "active",
          readinessStatus: readiness.dataGaps.length ? "active_with_gaps" : "ready",
          dataGaps: readiness.dataGaps,
          lastVerifiedAt: now,
          updatedByUserId: input.approvedByUserId,
          updatedAt: now,
        })
        .where(
          and(
            eq(territoryOperationalProfiles.tenantId, input.tenantId),
            eq(territoryOperationalProfiles.id, activation.profileId),
          ),
        );

      await tx.insert(auditLogs).values({
        tenantId: input.tenantId,
        userId: input.approvedByUserId,
        userRole: "admin",
        action: "territory.activated",
        entityType: "territory",
        entityId: input.territoryId,
        metadata: {
          activationId: input.activationId,
          actionRunId: run.id,
          approvalNote: String(input.approvalNote).trim(),
          workItemsRemainPaused: true,
          backgroundExecutionStarted: false,
        },
        createdAt: now,
      });
      return row;
    });

    await completeRunSuccess({
      tenantId: input.tenantId,
      runId: run.id,
      enforceEvidence: true,
      result: {
        territoryId: input.territoryId,
        activationId: input.activationId,
        status: "active",
        workItemsRemainPaused: true,
      },
      evidence: [
        {
          evidenceType: "APPROVAL",
          payload: {
            approvedByUserId: input.approvedByUserId,
            approvalNote: String(input.approvalNote).trim(),
            readiness,
          },
        },
      ],
    });

    return {
      idempotentReplay: false,
      activation: updated,
      operatingLayer: await getTerritoryOperatingLayer(input.tenantId, input.territoryId),
    };
  } catch (error: any) {
    await completeRunFailure({
      tenantId: input.tenantId,
      runId: run.id,
      error: String(error?.message || error || "Territory activation failed"),
    }).catch(() => undefined);
    throw error;
  }
}

export async function pauseTerritoryActivation(input: {
  tenantId: number;
  territoryId: number;
  activationId: number;
  actorUserId: number | null;
  reason: string;
}) {
  const reason = String(input.reason || "").trim();
  if (!reason) throw new Error("reason is required");

  const now = new Date();
  const [updated] = await db
    .update(territoryActivations)
    .set({ status: "paused", pausedAt: now, updatedAt: now })
    .where(
      and(
        eq(territoryActivations.tenantId, input.tenantId),
        eq(territoryActivations.territoryId, input.territoryId),
        eq(territoryActivations.id, input.activationId),
      ),
    )
    .returning();
  if (!updated) throw new Error("Activation not found");

  await db
    .update(territoryOperationalProfiles)
    .set({ operationalStatus: "paused", updatedByUserId: input.actorUserId, updatedAt: now })
    .where(
      and(
        eq(territoryOperationalProfiles.tenantId, input.tenantId),
        eq(territoryOperationalProfiles.id, updated.profileId),
      ),
    );
  await db.insert(auditLogs).values({
    tenantId: input.tenantId,
    userId: input.actorUserId,
    userRole: "admin",
    action: "territory.activation.paused",
    entityType: "territory",
    entityId: input.territoryId,
    metadata: { activationId: input.activationId, reason },
    createdAt: now,
  });
  return {
    activation: updated,
    operatingLayer: await getTerritoryOperatingLayer(input.tenantId, input.territoryId),
  };
}

export async function recordTerritoryCoverageSnapshot(input: {
  tenantId: number;
  territoryId: number;
  activationId?: number | null;
  actorUserId: number | null;
  dimensions: unknown;
  evidence?: JsonRecord;
}) {
  const territory = await findTerritory(input.tenantId, input.territoryId);
  if (!territory) throw new Error("Territory not found");
  const dimensions = normalizeTerritoryCoverage(input.dimensions);
  const gaps = Object.entries(dimensions)
    .filter(([, value]) => value?.status === "unknown" || value?.status === "gap")
    .map(([key]) => `${key}_coverage_gap`);
  const [snapshot] = await db
    .insert(territoryCoverageSnapshots)
    .values({
      tenantId: input.tenantId,
      territoryId: input.territoryId,
      activationId: input.activationId || null,
      status: gaps.length ? "gaps_identified" : "verified",
      dimensions,
      gaps,
      evidence: input.evidence || {},
      capturedByUserId: input.actorUserId,
      capturedAt: new Date(),
      createdAt: new Date(),
    })
    .returning();
  return snapshot;
}
