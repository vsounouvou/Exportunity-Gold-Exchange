export const INDUSTRIAL_CHALLENGE_STATUSES = [
  "submitted",
  "triaged",
  "grouped",
  "sourcing_review",
  "engineering_review",
  "local_manufacturing_review",
  "resolved",
  "declined",
  "closed",
] as const;

export type IndustrialChallengeStatus =
  (typeof INDUSTRIAL_CHALLENGE_STATUSES)[number];

export const INDUSTRIAL_CHALLENGE_OUTCOMES = [
  "review_required",
  "stock_candidate",
  "group_procurement",
  "reverse_engineering",
  "local_manufacturing",
  "redesign",
  "engineering_partner",
  "declined",
] as const;

export type IndustrialChallengeOutcome =
  (typeof INDUSTRIAL_CHALLENGE_OUTCOMES)[number];

export const INDUSTRIAL_CHALLENGE_PROBLEM_TYPES = [
  "recurring_component_failure",
  "long_lead_time",
  "equipment_gap",
  "equipment_cost",
  "manual_process",
  "unavailable_part",
  "production_bottleneck",
  "quality_issue",
  "maintenance_gap",
  "local_manufacturing_opportunity",
  "other",
] as const;

export const INDUSTRIAL_CHALLENGE_REQUIREMENT_TYPES = [
  "machinery",
  "raw_material",
  "industrial_input",
  "spare_part",
  "custom_manufacturing",
  "industrial_service",
] as const;

const TRANSITIONS: Record<
  IndustrialChallengeStatus,
  readonly IndustrialChallengeStatus[]
> = {
  submitted: ["triaged", "declined", "closed"],
  triaged: [
    "grouped",
    "sourcing_review",
    "engineering_review",
    "local_manufacturing_review",
    "declined",
    "closed",
  ],
  grouped: [
    "sourcing_review",
    "engineering_review",
    "local_manufacturing_review",
    "declined",
    "closed",
  ],
  sourcing_review: [
    "grouped",
    "engineering_review",
    "local_manufacturing_review",
    "resolved",
    "declined",
    "closed",
  ],
  engineering_review: [
    "grouped",
    "sourcing_review",
    "local_manufacturing_review",
    "resolved",
    "declined",
    "closed",
  ],
  local_manufacturing_review: [
    "grouped",
    "sourcing_review",
    "engineering_review",
    "resolved",
    "declined",
    "closed",
  ],
  resolved: ["closed"],
  declined: ["closed"],
  closed: [],
};

export function canTransitionIndustrialChallenge(
  current: IndustrialChallengeStatus,
  next: IndustrialChallengeStatus,
) {
  return current === next || TRANSITIONS[current].includes(next);
}

export function nextIndustrialChallengeStatuses(
  status: IndustrialChallengeStatus,
) {
  return [status, ...TRANSITIONS[status]];
}

export function isOpenIndustrialChallenge(status: IndustrialChallengeStatus) {
  return !["resolved", "declined", "closed"].includes(status);
}

export function requirementStatusForIndustrialChallenge(
  status: IndustrialChallengeStatus,
) {
  if (status === "submitted") return "submitted" as const;
  if (status === "triaged" || status === "grouped") return "triaged" as const;
  if (status === "sourcing_review") return "supplier_matching" as const;
  if (
    status === "engineering_review" ||
    status === "local_manufacturing_review"
  ) {
    return "under_review" as const;
  }
  return "closed" as const;
}

export function suggestIndustrialChallengeGroupKey(
  categoryCode: string,
  title: string,
) {
  const normalized = `${categoryCode}:${title}`
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((part) => part.length > 2)
    .slice(0, 8)
    .join("-");

  return normalized.slice(0, 180) || null;
}
