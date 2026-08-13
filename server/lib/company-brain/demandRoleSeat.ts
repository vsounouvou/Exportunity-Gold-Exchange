import {
  EXPORTUNITY_ROLE_SEAT_DEPARTMENTS,
  roleSeatManagerOrganizationKey,
  roleSeatPermittedTools,
  type ExportunityRoleSeatProfile,
} from "./roleSeatCatalog";

const PROHIBITED_EXTERNAL_TOOLS = [
  "send_message",
  "send_email",
  "send_whatsapp",
  "make_call",
  "payments",
  "contract_commitment",
  "external_publish",
];

export const EXPORTUNITY_DEMAND_ROLE_SEAT_VERSION =
  "exportunity-demand-role-seats-v1";

function clean(value: unknown, max = 240) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function unique(values: unknown[]) {
  return Array.from(new Set(values.map((value) => clean(value, 100)).filter(Boolean)));
}

export type DemandRoleSeatProfile = ExportunityRoleSeatProfile & {
  dynamicRoleSeat: true;
  source: "demand_driven_workforce";
  staffingRequestId: number;
  demandCount: number;
  demandThreshold: number;
  evidenceRequirementIds: string[];
};

export function buildDemandRoleSeatProfile(input: {
  roleCode: string;
  roleTitle: string;
  departmentKey: string;
  reason: string;
  staffingRequestId: number;
  demandCount: number;
  demandThreshold: number;
  evidenceItems?: Array<Record<string, unknown>> | null;
}): DemandRoleSeatProfile {
  const department = EXPORTUNITY_ROLE_SEAT_DEPARTMENTS.find(
    (item) => item.key === input.departmentKey,
  );
  if (!department) {
    throw new Error(`Unknown Exportunity department: ${input.departmentKey}`);
  }

  const roleCode = clean(input.roleCode, 180);
  const roleTitle = clean(input.roleTitle, 120);
  if (!roleCode || !roleTitle) {
    throw new Error("A demand-created role requires a stable code and title.");
  }

  const evidenceItems = Array.isArray(input.evidenceItems)
    ? input.evidenceItems
    : [];
  const productCompetencies = unique(
    evidenceItems.flatMap((item) => [
      item.productName,
      item.productCategory,
      item.commercialIntent,
    ]),
  );
  const evidenceRequirementIds = unique(
    evidenceItems.map((item) => item.requirementId || item.requirement_id),
  );

  return {
    immutableAgentId: roleCode,
    defaultDisplayName: roleTitle,
    role: roleTitle,
    departmentKey: department.key,
    departmentName: department.name,
    managerOrganizationKey: roleSeatManagerOrganizationKey(department.key),
    companyEntityScope: ["Exportunity Group", "Exportunity.net"],
    description: [
      `${roleTitle} is a demand-backed role in Exportunity's ${department.name}.`,
      clean(input.reason, 700),
      "The employee maintains cited market knowledge, supports the linked commercial cases, and escalates every external commitment for visible approval.",
    ]
      .filter(Boolean)
      .join(" "),
    languages: ["English", "French"],
    geographicCompetencies: [
      "Global trade corridors",
      "West Africa",
      "Cote d'Ivoire",
      "Benin",
      "United Arab Emirates",
    ],
    sectorCompetencies: unique([
      ...department.sectorCompetencies,
      ...productCompetencies,
    ]),
    roleLevel: 3,
    decisionAuthority: "medium",
    permittedTools: roleSeatPermittedTools(department.key),
    prohibitedTools: [...PROHIBITED_EXTERNAL_TOOLS],
    budget: {
      currency: "USD",
      monthlyLimit: 0,
      dailyTokenLimit: 10_000,
    },
    contextPolicy: {
      mode: "task_scoped",
      evidenceRequired: true,
      conflictAware: true,
      staleDataPolicy: "label_and_escalate",
    },
    memoryScopes: ["personal", "department", "company", "entity"],
    escalationRules: [
      "Escalate external communications for recorded human approval.",
      "Escalate payments, contracts, supplier commitments and public claims.",
      "Escalate conflicting or stale evidence before relying on it.",
    ],
    performanceMetrics: [
      "linked demand coverage",
      "evidence quality",
      "task completion",
      "handoff quality",
      "policy compliance",
    ],
    activationStatus: "available",
    externalIdentityPolicy: {
      aiDisclosureRequired: true,
      impersonationProhibited: true,
      functionalIdentityAllowed: true,
    },
    mailboxIdentity: null,
    dynamicRoleSeat: true,
    source: "demand_driven_workforce",
    staffingRequestId: Math.max(1, Math.trunc(input.staffingRequestId)),
    demandCount: Math.max(1, Math.trunc(input.demandCount || 1)),
    demandThreshold: Math.max(1, Math.trunc(input.demandThreshold || 1)),
    evidenceRequirementIds,
  };
}
