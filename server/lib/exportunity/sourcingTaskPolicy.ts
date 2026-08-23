export const EXPORTUNITY_SOURCING_MODULE_ID = "industrial_sourcing";
export const EXPORTUNITY_SOURCING_MANAGER_AGENT_KEY = "commercial";
export const EXPORTUNITY_SOURCING_EXECUTION_AGENT_KEY = "sourcing";

export interface QualifiedSourcingTaskPlan {
  idempotencyKey: string;
  moduleId: typeof EXPORTUNITY_SOURCING_MODULE_ID;
  title: string;
  instruction: string;
  objective: string;
  priority: number;
  tokenBudget: 0;
  initialState: "CREATED";
  managerAgentKey: typeof EXPORTUNITY_SOURCING_MANAGER_AGENT_KEY;
  executionAgentKey: typeof EXPORTUNITY_SOURCING_EXECUTION_AGENT_KEY;
  metadata: Record<string, unknown>;
}

function cleanText(value: unknown, limit = 200) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
}

function positiveInteger(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function buildQualifiedSourcingTaskPlan(input: {
  tenantKey: string;
  crmStatus: string;
  crmStage: string | null;
  chatLeadId: string;
  commercialLeadId: number | null;
  opportunityId: number | null;
  opportunityReferenceCode: string | null;
  requirementId: string | null;
  requirementReferenceCode: string | null;
}): QualifiedSourcingTaskPlan | null {
  const tenantKey = cleanText(input.tenantKey, 80).toLowerCase();
  const crmStatus = cleanText(input.crmStatus, 80).toLowerCase();
  const crmStage = cleanText(input.crmStage, 80).toLowerCase();
  const chatLeadId = cleanText(input.chatLeadId, 200);
  const requirementId = cleanText(input.requirementId, 200);
  const opportunityId = positiveInteger(input.opportunityId);

  if (
    tenantKey !== "exportunity" ||
    crmStatus !== "opportunity_opened" ||
    crmStage !== "qualified" ||
    !chatLeadId ||
    !requirementId ||
    !opportunityId
  ) {
    return null;
  }

  const requirementReferenceCode =
    cleanText(input.requirementReferenceCode, 100) || requirementId;
  const opportunityReferenceCode = cleanText(
    input.opportunityReferenceCode,
    120,
  );
  const commercialLeadId = positiveInteger(input.commercialLeadId);

  return {
    idempotencyKey: `exportunity:talk:sourcing-review:${requirementId}`.slice(
      0,
      240,
    ),
    moduleId: EXPORTUNITY_SOURCING_MODULE_ID,
    title: `Supplier sourcing review • ${requirementReferenceCode}`.slice(
      0,
      240,
    ),
    instruction: [
      `Review only Exportunity's verified internal supplier registry for industrial requirement ${requirementReferenceCode}.`,
      "Prepare an evidence-backed supplier shortlist and unresolved questions for a human commercial manager.",
      "Do not contact suppliers or buyers, send messages, request or accept quotations, propose or commit pricing, place orders, or trigger any external action.",
      "Keep the task at CREATED until a human manager explicitly plans and approves further work.",
    ].join(" "),
    objective:
      "Prepare a reviewable supplier shortlist, evidence gaps, and recommended next questions without external execution.",
    priority: 40,
    tokenBudget: 0,
    initialState: "CREATED",
    managerAgentKey: EXPORTUNITY_SOURCING_MANAGER_AGENT_KEY,
    executionAgentKey: EXPORTUNITY_SOURCING_EXECUTION_AGENT_KEY,
    metadata: {
      origin: "exportunity_talk_qualified_opportunity",
      tenantKey: "exportunity",
      chatLeadId,
      commercialLeadId,
      opportunityId,
      opportunityReferenceCode: opportunityReferenceCode || null,
      industrialRequirementId: requirementId,
      industrialRequirementReferenceCode: requirementReferenceCode,
      assignments: {
        managerAgentKey: EXPORTUNITY_SOURCING_MANAGER_AGENT_KEY,
        executionAgentKey: EXPORTUNITY_SOURCING_EXECUTION_AGENT_KEY,
      },
      governance: {
        initialState: "CREATED",
        humanApprovalRequired: true,
        autoQueueAllowed: false,
        externalCommunicationAllowed: false,
        supplierContactAllowed: false,
        quoteRequestAllowed: false,
        pricingCommitmentAllowed: false,
        orderPlacementAllowed: false,
      },
    },
  };
}
