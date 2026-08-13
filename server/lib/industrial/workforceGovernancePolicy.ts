import type { CompanyBrainCitation } from "@db/schema";

import type { CompanyBrainContextPack } from "../company-brain/contextAssembler";

export type WorkforceGovernanceStatus = "ready" | "review_required" | "unavailable";

export type WorkforceGovernanceSnapshot = {
  version: "workforce-governance-v1";
  status: WorkforceGovernanceStatus;
  reason: string;
  contextPackId: number | null;
  correlationId: string | null;
  taskKey: string;
  agentId: number | null;
  sourceCitations: CompanyBrainCitation[];
  citationCount: number;
  knownConflicts: CompanyBrainContextPack["known_conflicts"];
  openQuestions: CompanyBrainContextPack["open_questions"];
  requiredApprovals: CompanyBrainContextPack["required_approvals"];
  assembledAt: string;
  expiresAt: string | null;
  externalActionsStarted: false;
};

export function summarizeWorkforceGovernancePack(
  pack: CompanyBrainContextPack,
): WorkforceGovernanceSnapshot {
  const citationCount = pack.source_citations.length;
  const hasReviewBlockers = pack.known_conflicts.length > 0 || pack.open_questions.length > 0;
  const status: WorkforceGovernanceStatus =
    pack.contextPackId && citationCount > 0 && !hasReviewBlockers
      ? "ready"
      : "review_required";
  const reason = status === "ready"
    ? `${citationCount} governed Company Brain citation${citationCount === 1 ? "" : "s"} are frozen for review.`
    : pack.known_conflicts.length > 0
      ? "Resolve Company Brain conflicts before approving this staffing need."
      : pack.open_questions.length > 0
        ? "Resolve Company Brain evidence questions before approving this staffing need."
        : "No governed Company Brain citation is available for this staffing decision.";

  return {
    version: "workforce-governance-v1",
    status,
    reason,
    contextPackId: pack.contextPackId,
    correlationId: pack.task.correlationId,
    taskKey: pack.task.key,
    agentId: pack.agentId,
    sourceCitations: pack.source_citations,
    citationCount,
    knownConflicts: pack.known_conflicts,
    openQuestions: pack.open_questions,
    requiredApprovals: pack.required_approvals,
    assembledAt: pack.freshness.assembledAt,
    expiresAt: pack.freshness.expiresAt,
    externalActionsStarted: false,
  };
}

export function assertWorkforceGovernanceReady(
  snapshot: WorkforceGovernanceSnapshot | null | undefined,
  now = new Date(),
) {
  if (!snapshot || snapshot.status !== "ready") {
    throw new Error(snapshot?.reason || "Company Brain governance evidence is required before approval.");
  }
  if (!snapshot.contextPackId || snapshot.citationCount < 1) {
    throw new Error("A persisted, cited Company Brain context pack is required before approval.");
  }
  if (snapshot.knownConflicts.length || snapshot.openQuestions.length) {
    throw new Error("Resolve Company Brain conflicts and evidence questions before approval.");
  }
  const expiresAt = snapshot.expiresAt ? new Date(snapshot.expiresAt) : null;
  if (!expiresAt || !Number.isFinite(expiresAt.getTime()) || expiresAt <= now) {
    throw new Error("The Company Brain context pack expired. Refresh the staffing review.");
  }
}
