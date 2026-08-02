export const INDUSTRIAL_RECURRING_REQUIREMENT_STATUSES = ["draft", "active", "paused", "closed"] as const;
export const INDUSTRIAL_RECURRING_REQUIREMENT_TYPES = ["raw_material", "industrial_input", "spare_part", "industrial_service"] as const;

export type IndustrialRecurringRequirementStatus = (typeof INDUSTRIAL_RECURRING_REQUIREMENT_STATUSES)[number];
export type IndustrialRecurringRequirementType = (typeof INDUSTRIAL_RECURRING_REQUIREMENT_TYPES)[number];

const RECURRING_REQUIREMENT_TRANSITIONS: Record<IndustrialRecurringRequirementStatus, readonly IndustrialRecurringRequirementStatus[]> = {
  draft: ["active", "paused", "closed"],
  active: ["paused", "closed"],
  paused: ["active", "closed"],
  closed: [],
};

export function canTransitionRecurringRequirement(
  from: IndustrialRecurringRequirementStatus,
  to: IndustrialRecurringRequirementStatus,
) {
  return from === to || RECURRING_REQUIREMENT_TRANSITIONS[from].includes(to);
}

export function isRecurringRequirementOpen(status: IndustrialRecurringRequirementStatus) {
  return status === "draft" || status === "active" || status === "paused";
}
