export const INDUSTRIAL_FACTORY_RELATIONSHIP_STAGES = [
  "identified",
  "research_in_progress",
  "contacted",
  "qualified",
  "visit_scheduled",
  "factory_visited",
  "requirements_collected",
  "proposal_in_preparation",
  "active_customer",
  "recurring_customer",
  "dormant",
  "disqualified",
] as const;

export type IndustrialFactoryRelationshipStage =
  (typeof INDUSTRIAL_FACTORY_RELATIONSHIP_STAGES)[number];

const TRANSITIONS: Record<
  IndustrialFactoryRelationshipStage,
  readonly IndustrialFactoryRelationshipStage[]
> = {
  identified: [
    "research_in_progress",
    "contacted",
    "qualified",
    "dormant",
    "disqualified",
  ],
  research_in_progress: ["contacted", "qualified", "dormant", "disqualified"],
  contacted: [
    "qualified",
    "visit_scheduled",
    "dormant",
    "disqualified",
  ],
  qualified: [
    "visit_scheduled",
    "factory_visited",
    "requirements_collected",
    "proposal_in_preparation",
    "active_customer",
    "dormant",
    "disqualified",
  ],
  visit_scheduled: ["factory_visited", "qualified", "dormant", "disqualified"],
  factory_visited: [
    "requirements_collected",
    "proposal_in_preparation",
    "active_customer",
    "dormant",
    "disqualified",
  ],
  requirements_collected: [
    "proposal_in_preparation",
    "active_customer",
    "dormant",
    "disqualified",
  ],
  proposal_in_preparation: [
    "active_customer",
    "dormant",
    "disqualified",
  ],
  active_customer: ["recurring_customer", "dormant", "disqualified"],
  recurring_customer: ["active_customer", "dormant", "disqualified"],
  dormant: [
    "research_in_progress",
    "contacted",
    "qualified",
    "active_customer",
    "disqualified",
  ],
  disqualified: [],
};

export function canTransitionFactoryRelationshipStage(
  current: IndustrialFactoryRelationshipStage,
  next: IndustrialFactoryRelationshipStage,
) {
  return current === next || TRANSITIONS[current].includes(next);
}

export function nextFactoryRelationshipStages(
  stage: IndustrialFactoryRelationshipStage,
) {
  return [stage, ...TRANSITIONS[stage]];
}

export function isActiveFactoryRelationshipStage(
  stage: IndustrialFactoryRelationshipStage,
) {
  return stage === "active_customer" || stage === "recurring_customer";
}
