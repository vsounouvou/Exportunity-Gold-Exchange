const CLOSED_REQUIREMENT_STATUSES = new Set(["closed", "cancelled"]);
const ACTIVE_ORDER_STATUSES = new Set([
  "confirmed",
  "procurement",
  "manufacturing",
  "quality_control",
  "delivery",
]);
const OPEN_CHALLENGE_STATUSES = new Set([
  "submitted",
  "triaged",
  "grouped",
  "sourcing_review",
  "engineering_review",
  "local_manufacturing_review",
]);

export type FactoryDashboardRequirement = {
  requirementType?: string | null;
  urgency?: string | null;
  status?: string | null;
};

export type FactoryDashboardQuote = {
  status?: string | null;
};

export type FactoryDashboardOrder = {
  status?: string | null;
  plannedDeliveryAt?: string | Date | null;
};

export type FactoryDashboardChallenge = {
  status?: string | null;
  urgency?: string | null;
  productionStopped?: boolean | null;
  attachmentCount?: number | null;
  requirementType?: string | null;
};

export function buildIndustrialFactoryDashboard(input: {
  requirements: FactoryDashboardRequirement[];
  quotes: FactoryDashboardQuote[];
  orders: FactoryDashboardOrder[];
  challenges: FactoryDashboardChallenge[];
  documentGapCount: number;
  documentsOnFile: number;
}) {
  const openRequirements = input.requirements.filter(
    (row) => !CLOSED_REQUIREMENT_STATUSES.has(String(row.status || "")),
  );
  const activeOrders = input.orders.filter((row) =>
    ACTIVE_ORDER_STATUSES.has(String(row.status || "")),
  );
  const openChallenges = input.challenges.filter((row) =>
    OPEN_CHALLENGE_STATUSES.has(String(row.status || "")),
  );

  return {
    openRequirements: openRequirements.length,
    quotationsAwaitingDecision: input.quotes.filter(
      (row) => String(row.status || "") === "issued",
    ).length,
    activeOrders: activeOrders.length,
    machineryProjects: openRequirements.filter(
      (row) => String(row.requirementType || "") === "machinery",
    ).length,
    rawMaterialRequests: openRequirements.filter(
      (row) => String(row.requirementType || "") === "raw_material",
    ).length,
    sparePartEmergencies: openRequirements.filter(
      (row) =>
        String(row.requirementType || "") === "spare_part" &&
        String(row.urgency || "") === "critical",
    ).length,
    scheduledDeliveries: activeOrders.filter((row) => Boolean(row.plannedDeliveryAt))
      .length,
    maintenanceRequests: openRequirements.filter(
      (row) => String(row.requirementType || "") === "industrial_service",
    ).length,
    criticalChallengesWithoutEvidence: openChallenges.filter(
      (row) =>
        (Boolean(row.productionStopped) || String(row.urgency || "") === "critical") &&
        Number(row.attachmentCount || 0) === 0,
    ).length,
    verificationEvidenceToAdd: Math.max(0, Math.trunc(input.documentGapCount)),
    documentsOnFile: Math.max(0, Math.trunc(input.documentsOnFile)),
  };
}
