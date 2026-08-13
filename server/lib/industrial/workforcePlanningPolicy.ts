export type CommercialStaffingContext = {
  intent?: string | null;
  productCategory?: string | null;
  requirementType: string;
  missingSpecialistKeys?: string[];
};

export type CommercialStaffingSignalType =
  | "recurring_demand"
  | "critical_capability_gap"
  | "inactive_capacity";

export type CommercialStaffingRecommendation = {
  roleTitle: string;
  signalType: CommercialStaffingSignalType;
  demandThreshold: number;
  rationale: string;
};

const RECURRING_DEMAND_THRESHOLDS: Record<string, number> = {
  "Palm Oil Desk Agent": 10,
  "Cocoa Desk Agent": 10,
  "Coffee Desk Agent": 10,
  "Cashew Desk Agent": 10,
  "Machinery and Industrial Equipment Desk Agent": 5,
  "Buyer Intelligence Lead": 5,
};

const MISSING_SPECIALIST_ROLES: Record<string, string> = {
  commercial: "Account Executive",
  sourcing: "Supplier Discovery Agent",
  technical: "Specification Agent",
  logistics: "Freight Routing Agent",
  finance: "Commercial Finance Agent",
  quality: "Quality Documentation Agent",
  compliance: "Trade Compliance Agent",
};

function normalize(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

export function commercialStaffingSpecialistKey(roleTitle: unknown) {
  const normalizedRoleTitle = normalize(roleTitle);
  return (
    Object.entries(MISSING_SPECIALIST_ROLES).find(
      ([, title]) => normalize(title) === normalizedRoleTitle,
    )?.[0] || null
  );
}

export function commercialStaffingRecommendations(
  context: CommercialStaffingContext,
): CommercialStaffingRecommendation[] {
  const recommendations = new Map<string, CommercialStaffingRecommendation>();
  const category = normalize(context.productCategory);
  const intent = normalize(context.intent);

  const addRecurringDemand = (roleTitle: string) => {
    recommendations.set(roleTitle, {
      roleTitle,
      signalType: "recurring_demand",
      demandThreshold: RECURRING_DEMAND_THRESHOLDS[roleTitle] || 5,
      rationale:
        "Create a permanent desk only after enough distinct commercial requirements prove durable demand.",
    });
  };

  if (category === "palm_oil") addRecurringDemand("Palm Oil Desk Agent");
  if (category === "cocoa") addRecurringDemand("Cocoa Desk Agent");
  if (category === "coffee") addRecurringDemand("Coffee Desk Agent");
  if (category === "cashew") addRecurringDemand("Cashew Desk Agent");
  if (
    ["machinery", "spare_part", "custom_manufacturing"].includes(
      context.requirementType,
    )
  ) {
    addRecurringDemand("Machinery and Industrial Equipment Desk Agent");
  }
  if (intent === "find_buyer" || intent === "sell_export") {
    addRecurringDemand("Buyer Intelligence Lead");
  }

  for (const specialistKey of context.missingSpecialistKeys || []) {
    const normalizedKey = normalize(specialistKey);
    const roleTitle = MISSING_SPECIALIST_ROLES[normalizedKey];
    if (!roleTitle || recommendations.has(roleTitle)) continue;
    recommendations.set(roleTitle, {
      roleTitle,
      signalType: "critical_capability_gap",
      demandThreshold: 1,
      rationale:
        `A live commercial case cannot be staffed because the ${normalizedKey} specialist is unavailable.`,
    });
  }

  return Array.from(recommendations.values());
}

export function commercialStaffingRoleTitles(
  context: CommercialStaffingContext,
) {
  return commercialStaffingRecommendations(context).map(
    (recommendation) => recommendation.roleTitle,
  );
}
