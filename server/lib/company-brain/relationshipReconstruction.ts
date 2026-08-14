export const RELATIONSHIP_RECONSTRUCTION_MODE = "read_only" as const;

export type RelationshipCandidateKind =
  | "stalled_requirement"
  | "dormant_factory_relationship"
  | "awaiting_email_reply"
  | "unresolved_conversation";

export type RelationshipCandidatePriority = "high" | "medium" | "low" | "restricted";

export type RelationshipEvidenceReference = {
  entityType: string;
  entityId: string;
  label: string;
};

export type RelationshipCandidateInput = {
  id: string;
  kind: RelationshipCandidateKind;
  title: string;
  organization?: string | null;
  person?: string | null;
  stage?: string | null;
  lastActivityAt?: string | Date | null;
  dueAt?: string | Date | null;
  nextAction?: string | null;
  facts: string[];
  evidence: RelationshipEvidenceReference[];
  consentStatus?: string | null;
  isDnc?: boolean | null;
  openPath?: string | null;
  commercialEvidenceCount?: number;
};

export type RelationshipCandidate = {
  id: string;
  kind: RelationshipCandidateKind;
  title: string;
  organization: string | null;
  person: string | null;
  stage: string | null;
  priority: RelationshipCandidatePriority;
  relevanceScore: number;
  reason: string;
  lastActivityAt: string | null;
  dueAt: string | null;
  recommendedAction: string;
  evidence: RelationshipEvidenceReference[];
  restrictions: {
    consentStatus: string;
    isDnc: boolean;
    externalCommunicationAllowed: false;
    blockers: string[];
  };
  openPath: string | null;
};

function normalizedDate(value: string | Date | null | undefined) {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function daysBetween(earlier: Date | null, later: Date) {
  if (!earlier) return 0;
  return Math.max(0, Math.floor((later.getTime() - earlier.getTime()) / 86_400_000));
}

function defaultAction(kind: RelationshipCandidateKind, restricted: boolean) {
  if (restricted) return "Review the history internally. External contact is prohibited for this record.";
  switch (kind) {
    case "stalled_requirement":
      return "Review the requirement evidence and decide whether the commercial dossier should be reactivated.";
    case "dormant_factory_relationship":
      return "Review the documented relationship history and record a human decision on the next step.";
    case "awaiting_email_reply":
      return "Review the sent thread and its relationship context before proposing any follow-up.";
    case "unresolved_conversation":
      return "Review the conversation and decide whether it should become a governed industrial requirement.";
  }
}

export function buildRelationshipCandidate(
  input: RelationshipCandidateInput,
  now = new Date(),
): RelationshipCandidate {
  const lastActivity = normalizedDate(input.lastActivityAt);
  const dueAt = normalizedDate(input.dueAt);
  const inactivityDays = daysBetween(lastActivity, now);
  const overdueDays = dueAt && dueAt.getTime() < now.getTime() ? daysBetween(dueAt, now) : 0;
  const consentStatus = String(input.consentStatus || "unknown").trim().toLowerCase() || "unknown";
  const isDnc = Boolean(input.isDnc) || consentStatus === "opt_out";
  const blockers: string[] = [];
  if (isDnc) blockers.push("do_not_contact");
  else if (consentStatus !== "opt_in") blockers.push("contact_basis_requires_review");
  blockers.push("human_approval_required");

  let relevanceScore = 35;
  if (input.kind === "stalled_requirement") relevanceScore += 20;
  if (input.kind === "dormant_factory_relationship") relevanceScore += 12;
  if (input.kind === "awaiting_email_reply") relevanceScore += 15;
  if (input.kind === "unresolved_conversation") relevanceScore += 10;
  relevanceScore += Math.min(20, Math.floor(inactivityDays / 7) * 2);
  relevanceScore += Math.min(12, Math.floor(overdueDays / 7) * 3);
  relevanceScore += Math.min(10, Math.max(0, Number(input.commercialEvidenceCount || 0)) * 3);
  relevanceScore = Math.max(0, Math.min(100, relevanceScore));

  let priority: RelationshipCandidatePriority = "low";
  if (isDnc) priority = "restricted";
  else if (relevanceScore >= 75 || overdueDays >= 14) priority = "high";
  else if (relevanceScore >= 50 || overdueDays > 0) priority = "medium";

  const facts = input.facts.map((fact) => String(fact || "").trim()).filter(Boolean);
  const reason = facts.length
    ? facts.join(" ")
    : "This record needs human review because its next commercial state is not documented.";

  return {
    id: input.id,
    kind: input.kind,
    title: input.title,
    organization: input.organization || null,
    person: input.person || null,
    stage: input.stage || null,
    priority,
    relevanceScore,
    reason,
    lastActivityAt: lastActivity?.toISOString() || null,
    dueAt: dueAt?.toISOString() || null,
    recommendedAction: input.nextAction?.trim() || defaultAction(input.kind, isDnc),
    evidence: input.evidence,
    restrictions: {
      consentStatus,
      isDnc,
      externalCommunicationAllowed: false,
      blockers,
    },
    openPath: input.openPath || null,
  };
}

export function summarizeRelationshipCandidates(candidates: RelationshipCandidate[]) {
  const byKind: Record<RelationshipCandidateKind, number> = {
    stalled_requirement: 0,
    dormant_factory_relationship: 0,
    awaiting_email_reply: 0,
    unresolved_conversation: 0,
  };
  let highPriority = 0;
  let restricted = 0;
  for (const candidate of candidates) {
    byKind[candidate.kind] += 1;
    if (candidate.priority === "high") highPriority += 1;
    if (candidate.priority === "restricted") restricted += 1;
  }
  return { total: candidates.length, highPriority, restricted, byKind };
}
