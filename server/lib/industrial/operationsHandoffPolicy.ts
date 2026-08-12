export type IndustrialRequirementHandoffType =
  | "machinery"
  | "raw_material"
  | "industrial_input"
  | "spare_part"
  | "custom_manufacturing"
  | "industrial_service"
  | "export_quotation";

export type IndustrialRequirementHandoffUrgency =
  | "standard"
  | "urgent"
  | "planned";

export type HandoffAgentKey =
  | "tassi"
  | "commercial"
  | "technical"
  | "sourcing"
  | "logistics"
  | "quality"
  | "finance"
  | "compliance";

export type IndustrialRequirementHandoffPlan = {
  primaryAgentKey: HandoffAgentKey;
  participantAgentKeys: HandoffAgentKey[];
  priority: "medium" | "high" | "critical";
  urgencyScore: number;
};

export function resolveIndustrialRequirementHandoffPlan(input: {
  requirementType: IndustrialRequirementHandoffType;
  urgency: IndustrialRequirementHandoffUrgency;
}): IndustrialRequirementHandoffPlan {
  const primaryAgentKey: HandoffAgentKey = "commercial";
  const participantKeys = new Set<HandoffAgentKey>([
    primaryAgentKey,
    "commercial",
    "tassi",
  ]);

  if (
    input.requirementType === "machinery" ||
    input.requirementType === "spare_part" ||
    input.requirementType === "custom_manufacturing"
  ) {
    participantKeys.add("technical");
    participantKeys.add("sourcing");
    participantKeys.add("logistics");
    participantKeys.add("finance");
  }

  if (
    input.requirementType === "raw_material" ||
    input.requirementType === "industrial_input"
  ) {
    participantKeys.add("sourcing");
    participantKeys.add("quality");
    participantKeys.add("logistics");
    participantKeys.add("compliance");
    participantKeys.add("finance");
  }

  if (
    input.requirementType === "spare_part" ||
    input.requirementType === "custom_manufacturing"
  ) {
    participantKeys.add("quality");
  }

  if (input.requirementType === "export_quotation") {
    participantKeys.add("sourcing");
    participantKeys.add("logistics");
    participantKeys.add("compliance");
    participantKeys.add("finance");
  }

  if (input.requirementType === "industrial_service") {
    participantKeys.add("technical");
    participantKeys.add("logistics");
  }

  return {
    primaryAgentKey,
    participantAgentKeys: Array.from(participantKeys),
    priority:
      input.urgency === "urgent"
        ? "critical"
        : input.urgency === "planned"
          ? "medium"
          : "high",
    urgencyScore:
      input.urgency === "urgent" ? 10 : input.urgency === "planned" ? 4 : 7,
  };
}

export function industrialSpecialistKeys(
  plan: IndustrialRequirementHandoffPlan,
) {
  return plan.participantAgentKeys.filter(
    (key): key is Exclude<HandoffAgentKey, "tassi" | "commercial"> =>
      key !== "tassi" && key !== "commercial",
  );
}
