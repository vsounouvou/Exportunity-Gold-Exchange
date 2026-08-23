import { and, eq, inArray } from "drizzle-orm";

import { db } from "@db";
import {
  industrialAuditLogs,
  industrialRequirements,
  industrialRequirementSupplierMatches,
  industrialSupplierProfiles,
} from "@db/schema";
import type { CommercialIntentResult } from "../commercialIntentEngine";
import type { QualifiedSourcingTaskSyncResult } from "./sourcingTask";
import {
  buildSupplierCandidateScreeningPlan,
  rankVerifiedInternalSupplierCandidate,
} from "./supplierCandidatePolicy";

export type SupplierCandidateScreeningStatus =
  | "not_eligible"
  | "requirement_not_found"
  | "no_verified_candidate"
  | "candidates_ready";

export interface SupplierCandidateScreeningResult {
  status: SupplierCandidateScreeningStatus;
  screeningState: "not_run" | "completed";
  source: "verified_internal_supplier_registry";
  threshold: number;
  candidateCount: number;
  newCandidateCount: number;
  existingCandidateCount: number;
  topScore: number | null;
  sourcingTaskId: number | null;
  sourcingTaskPublicId: string | null;
  requiresHumanApproval: true;
  supplierIdentityPublic: false;
  outboundActionsAllowed: false;
  externalDiscoveryStarted: false;
  quoteCreated: false;
  screenedAt: string;
}

function baseResult(
  status: SupplierCandidateScreeningStatus,
): SupplierCandidateScreeningResult {
  return {
    status,
    screeningState: "not_run",
    source: "verified_internal_supplier_registry",
    threshold: 0.78,
    candidateCount: 0,
    newCandidateCount: 0,
    existingCandidateCount: 0,
    topScore: null,
    sourcingTaskId: null,
    sourcingTaskPublicId: null,
    requiresHumanApproval: true,
    supplierIdentityPublic: false,
    outboundActionsAllowed: false,
    externalDiscoveryStarted: false,
    quoteCreated: false,
    screenedAt: new Date().toISOString(),
  };
}

export async function syncVerifiedInternalSupplierCandidates(input: {
  tenantId: number;
  tenantKey: string;
  crmStatus: string;
  crmStage: string | null;
  requirementId: string | null;
  commercial: CommercialIntentResult;
  sourcingTask: QualifiedSourcingTaskSyncResult | null;
}): Promise<SupplierCandidateScreeningResult> {
  const plan = buildSupplierCandidateScreeningPlan({
    tenantKey: input.tenantKey,
    crmStatus: input.crmStatus,
    crmStage: input.crmStage,
    requirementId: input.requirementId,
    productName: input.commercial.product?.name || null,
    sourcingTaskStatus: input.sourcingTask?.status || null,
    sourcingTaskId: input.sourcingTask?.taskId || null,
    sourcingTaskPublicId: input.sourcingTask?.publicTaskId || null,
  });
  if (!plan) return baseResult("not_eligible");

  const requirement = await db.query.industrialRequirements.findFirst({
    where: and(
      eq(industrialRequirements.id, plan.requirementId),
      eq(industrialRequirements.tenantId, input.tenantId),
    ),
  });
  if (!requirement) return baseResult("requirement_not_found");

  const supplierRows = await db
    .select({
      id: industrialSupplierProfiles.id,
      legalName: industrialSupplierProfiles.legalName,
      displayName: industrialSupplierProfiles.displayName,
      supplierStatus: industrialSupplierProfiles.supplierStatus,
      verificationStatus: industrialSupplierProfiles.verificationStatus,
      visibility: industrialSupplierProfiles.visibility,
      categoryCodes: industrialSupplierProfiles.categoryCodes,
      capabilities: industrialSupplierProfiles.capabilities,
      materialsHandled: industrialSupplierProfiles.materialsHandled,
      industriesServed: industrialSupplierProfiles.industriesServed,
      certifications: industrialSupplierProfiles.certifications,
    })
    .from(industrialSupplierProfiles)
    .where(
      and(
        eq(industrialSupplierProfiles.tenantId, input.tenantId),
        eq(industrialSupplierProfiles.supplierStatus, "active"),
        eq(industrialSupplierProfiles.verificationStatus, "verified"),
        eq(industrialSupplierProfiles.visibility, "exportunity_internal"),
      ),
    )
    .limit(250);

  const ranked = supplierRows
    .map((supplier) =>
      rankVerifiedInternalSupplierCandidate({
        supplier,
        requirement,
        intent: input.commercial,
      }),
    )
    .filter(
      (candidate) =>
        candidate.eligible &&
        candidate.productMatch &&
        !candidate.conflictingSpecification &&
        candidate.relevanceScore >= plan.threshold,
    )
    .sort(
      (left, right) =>
        right.relevanceScore - left.relevanceScore ||
        left.supplierProfileId.localeCompare(right.supplierProfileId),
    )
    .slice(0, plan.maximumCandidates);

  const candidateIds = ranked.map((candidate) => candidate.supplierProfileId);
  const existingRows = candidateIds.length
    ? await db
        .select({
          id: industrialRequirementSupplierMatches.id,
          supplierProfileId:
            industrialRequirementSupplierMatches.supplierProfileId,
          status: industrialRequirementSupplierMatches.status,
        })
        .from(industrialRequirementSupplierMatches)
        .where(
          and(
            eq(industrialRequirementSupplierMatches.tenantId, input.tenantId),
            eq(
              industrialRequirementSupplierMatches.requirementId,
              requirement.id,
            ),
            inArray(
              industrialRequirementSupplierMatches.supplierProfileId,
              candidateIds,
            ),
          ),
        )
    : [];
  const existingSupplierIds = new Set(
    existingRows.map((row) => row.supplierProfileId),
  );
  const newCandidates = ranked.filter(
    (candidate) => !existingSupplierIds.has(candidate.supplierProfileId),
  );
  const now = new Date();
  const inserted = newCandidates.length
    ? await db
        .insert(industrialRequirementSupplierMatches)
        .values(
          newCandidates.map((candidate) => ({
            tenantId: input.tenantId,
            requirementId: requirement.id,
            supplierProfileId: candidate.supplierProfileId,
            status: "candidate" as const,
            matchScore: Math.round(candidate.relevanceScore * 100),
            matchReason: candidate.matchReason,
            internalNotes:
              "Deterministic Exportunity Talk pre-screening. Human review is required; no supplier contact or quotation was created.",
            createdByUserId: null,
            selectedByUserId: null,
            selectedAt: null,
            createdAt: now,
            updatedAt: now,
          })),
        )
        .onConflictDoNothing()
        .returning({ id: industrialRequirementSupplierMatches.id })
    : [];

  const recordedRows = candidateIds.length
    ? await db
        .select({
          id: industrialRequirementSupplierMatches.id,
          supplierProfileId:
            industrialRequirementSupplierMatches.supplierProfileId,
          status: industrialRequirementSupplierMatches.status,
        })
        .from(industrialRequirementSupplierMatches)
        .where(
          and(
            eq(industrialRequirementSupplierMatches.tenantId, input.tenantId),
            eq(
              industrialRequirementSupplierMatches.requirementId,
              requirement.id,
            ),
            inArray(
              industrialRequirementSupplierMatches.supplierProfileId,
              candidateIds,
            ),
          ),
        )
    : [];
  const activeRecordedRows = recordedRows.filter(
    (row) => row.status !== "rejected",
  );
  const activeSupplierIds = new Set(
    activeRecordedRows.map((row) => row.supplierProfileId),
  );
  const activeRanked = ranked.filter((candidate) =>
    activeSupplierIds.has(candidate.supplierProfileId),
  );

  if (
    activeRecordedRows.length > 0 &&
    ["draft", "submitted", "triaged", "under_review"].includes(
      requirement.status,
    )
  ) {
    await db
      .update(industrialRequirements)
      .set({ status: "supplier_matching", updatedAt: now })
      .where(
        and(
          eq(industrialRequirements.id, requirement.id),
          eq(industrialRequirements.tenantId, input.tenantId),
        ),
      );
  }

  const previousScreening = await db.query.industrialAuditLogs.findFirst({
    where: and(
      eq(industrialAuditLogs.tenantId, input.tenantId),
      eq(
        industrialAuditLogs.action,
        "industrial_requirement_supplier_candidates.screened",
      ),
      eq(industrialAuditLogs.entityType, "industrial_requirement"),
      eq(industrialAuditLogs.entityId, requirement.id),
    ),
  });
  if (!previousScreening || inserted.length > 0) {
    await db.insert(industrialAuditLogs).values({
      tenantId: input.tenantId,
      actorUserId: null,
      action: "industrial_requirement_supplier_candidates.screened",
      entityType: "industrial_requirement",
      entityId: requirement.id,
      reason:
        "Deterministic screening of active, verified Exportunity-internal supplier evidence.",
      previousValue: {},
      nextValue: {
        candidateCount: ranked.length,
        recordedCandidateCount: activeRecordedRows.length,
        newCandidateCount: inserted.length,
        topScore: activeRanked.length
          ? Math.round(activeRanked[0].relevanceScore * 100)
          : null,
      },
      metadata: {
        idempotencyKey: plan.idempotencyKey,
        threshold: plan.threshold,
        maximumCandidates: plan.maximumCandidates,
        sourcingTaskId: plan.sourcingTaskId,
        sourcingTaskPublicId: plan.sourcingTaskPublicId,
        screeningMode: "deterministic_internal_preflight",
        governance: plan.governance,
        supplierIdentityExposed: false,
        outreachCreated: false,
        externalDiscoveryStarted: false,
        quoteCreated: false,
      },
      createdAt: now,
    });
  }

  return {
    ...baseResult(
      activeRecordedRows.length > 0
        ? "candidates_ready"
        : "no_verified_candidate",
    ),
    screeningState: "completed",
    threshold: plan.threshold,
    candidateCount: activeRecordedRows.length,
    newCandidateCount: inserted.length,
    existingCandidateCount: Math.max(
      0,
      activeRecordedRows.length - inserted.length,
    ),
    topScore: activeRanked.length
      ? Math.round(activeRanked[0].relevanceScore * 100)
      : null,
    sourcingTaskId: plan.sourcingTaskId,
    sourcingTaskPublicId: plan.sourcingTaskPublicId,
    screenedAt: now.toISOString(),
  };
}
