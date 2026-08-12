export type RoleSeatDecisionAuthority = "low" | "medium" | "high" | "executive";

export type ExportunityRoleSeatProfile = {
  immutableAgentId: string;
  defaultDisplayName: string;
  role: string;
  departmentKey: string;
  departmentName: string;
  companyEntityScope: string[];
  description: string;
  languages: string[];
  geographicCompetencies: string[];
  sectorCompetencies: string[];
  roleLevel: number;
  decisionAuthority: RoleSeatDecisionAuthority;
  permittedTools: string[];
  prohibitedTools: string[];
  budget: {
    currency: "USD";
    monthlyLimit: number;
    dailyTokenLimit: number;
  };
  contextPolicy: {
    mode: "task_scoped";
    evidenceRequired: true;
    conflictAware: true;
    staleDataPolicy: "label_and_escalate";
  };
  memoryScopes: string[];
  escalationRules: string[];
  performanceMetrics: string[];
  activationStatus: "available";
  externalIdentityPolicy: {
    aiDisclosureRequired: true;
    impersonationProhibited: true;
    functionalIdentityAllowed: true;
  };
  mailboxIdentity: null;
};

export type ExportunityRoleSeatDepartment = {
  key: string;
  name: string;
  capacity: number;
  mission: string;
  roles: string[];
  sectorCompetencies: string[];
  geographicCompetencies?: string[];
};

const GLOBAL_GEOGRAPHIES = [
  "Global trade corridors",
  "West Africa",
  "Cote d'Ivoire",
  "Benin",
  "United Arab Emirates",
];

const INTERNAL_TOOLS = ["create_job", "log_event", "kb_search", "get_entity", "attach_document"];
const COMMERCIAL_TOOLS = [...INTERNAL_TOOLS, "create_lead", "update_crm"];
const RESEARCH_TOOLS = [...INTERNAL_TOOLS, "search_web"];

export const EXPORTUNITY_ROLE_SEAT_DEPARTMENTS: ExportunityRoleSeatDepartment[] = [
  {
    key: "executive-office",
    name: "Executive Office",
    capacity: 6,
    mission: "Set enterprise direction, preserve decision quality, and coordinate accountable execution.",
    roles: [
      "Founder Liaison",
      "AI Chief of Staff",
      "Strategy Director",
      "Portfolio Director",
      "Decision Intelligence Officer",
      "Enterprise Risk Coordinator",
    ],
    sectorCompetencies: ["Corporate strategy", "Portfolio governance", "Global trade"],
  },
  {
    key: "global-revenue-business-development",
    name: "Global Revenue and Business Development",
    capacity: 12,
    mission: "Turn qualified demand into governed, profitable commercial opportunities.",
    roles: [
      "Lead Discovery Agent",
      "Account Research Agent",
      "Business Development Representative",
      "Account Executive",
      "Proposal Agent",
      "Tender Agent",
      "Partnership Agent",
      "Channel Agent",
      "Sales Operations Agent",
      "Pricing Support Agent",
      "Deal Desk Agent",
      "Revenue Forecast Agent",
    ],
    sectorCompetencies: ["B2B sales", "Industrial commerce", "Export development", "Partnerships"],
  },
  {
    key: "relationship-intelligence-crm",
    name: "Relationship Intelligence and CRM",
    capacity: 10,
    mission: "Maintain an evidence-backed relationship graph and make every follow-up context-aware.",
    roles: [
      "Relationship Intelligence Director",
      "CRM Data Steward",
      "Contact Intelligence Agent",
      "Relationship Mapping Agent",
      "Account History Agent",
      "Stakeholder Intelligence Agent",
      "Engagement Signal Agent",
      "Follow-up Coordinator",
      "Referral Network Agent",
      "Relationship Quality Analyst",
    ],
    sectorCompetencies: ["CRM", "Stakeholder intelligence", "Relationship operations", "Data stewardship"],
  },
  {
    key: "sourcing-procurement",
    name: "Sourcing and Procurement",
    capacity: 14,
    mission: "Convert requirements into comparable, traceable and approval-ready sourcing missions.",
    roles: [
      "Requirement Intake Agent",
      "Specification Agent",
      "Supplier Discovery Agent",
      "RFQ Agent",
      "Quote Comparison Agent",
      "Negotiation Support Agent",
      "Costing Agent",
      "Procurement Planning Agent",
      "Purchase Order Coordinator",
      "Supplier Follow-up Agent",
      "Quality Documentation Agent",
      "Alternative Supplier Agent",
      "Sourcing Mission Manager",
      "Procurement Analytics Agent",
    ],
    sectorCompetencies: ["Industrial sourcing", "Procurement", "Supplier qualification", "RFQ management"],
  },
  {
    key: "supplier-buyer-intelligence",
    name: "Supplier and Buyer Intelligence",
    capacity: 10,
    mission: "Qualify counterparties and match verified supply capabilities to real demand.",
    roles: [
      "Supplier Intelligence Lead",
      "Supplier Qualification Agent",
      "Buyer Intelligence Lead",
      "Buyer Qualification Agent",
      "Capability Verification Agent",
      "Capacity Intelligence Agent",
      "Demand Signal Agent",
      "Counterparty Research Agent",
      "Match Intelligence Agent",
      "Network Coverage Analyst",
    ],
    sectorCompetencies: ["Counterparty intelligence", "Supplier capacity", "Buyer demand", "Trade matching"],
  },
  {
    key: "trade-operations-logistics",
    name: "Trade Operations and Logistics",
    capacity: 10,
    mission: "Coordinate compliant movement of goods from confirmed order to delivery evidence.",
    roles: [
      "Trade Operations Director",
      "Order Operations Agent",
      "Freight Routing Agent",
      "Customs Documentation Agent",
      "Export Documentation Agent",
      "Incoterms Support Agent",
      "Shipment Tracking Agent",
      "Warehouse Coordination Agent",
      "Delivery Exception Agent",
      "Trade Corridor Operations Agent",
    ],
    sectorCompetencies: ["Freight", "Customs", "Warehousing", "Export logistics", "Incoterms"],
  },
  {
    key: "commodity-industry-desks",
    name: "Commodity and Industry Desks",
    capacity: 12,
    mission: "Provide sector-specific intelligence without creating hard-coded market boundaries.",
    roles: [
      "Cocoa Desk Agent",
      "Coffee Desk Agent",
      "Cashew Desk Agent",
      "Palm Oil Desk Agent",
      "Cereals and Fertilizers Desk Agent",
      "Machinery and Industrial Equipment Desk Agent",
      "Electric Mobility Desk Agent",
      "Precious Metals Desk Agent",
      "Construction and Materials Desk Agent",
      "Consumer Products Desk Agent",
      "Energy and Infrastructure Desk Agent",
      "Emerging Opportunities Desk Agent",
    ],
    sectorCompetencies: ["Commodities", "Industry intelligence", "Export readiness", "Supply markets"],
  },
  {
    key: "country-market-expansion",
    name: "Country and Market Expansion",
    capacity: 10,
    mission: "Build reusable market-entry knowledge and coordinate accountable country expansion.",
    roles: [
      "Country Intelligence Agent",
      "Market Entry Analysis Agent",
      "Regulation Research Agent",
      "Partner Mapping Agent",
      "Distributor Discovery Agent",
      "Local Service Coordination Agent",
      "Language Localization Agent",
      "Country Launch Manager",
      "Public Sector Relationship Support Agent",
      "Trade Corridor Intelligence Agent",
    ],
    sectorCompetencies: ["Market entry", "Free zones", "Trade corridors", "Localization", "Public sector"],
  },
  {
    key: "finance-treasury",
    name: "Finance and Treasury",
    capacity: 7,
    mission: "Protect cash, margin, controls and financial visibility across every transaction.",
    roles: [
      "Finance Director",
      "Treasury Agent",
      "Commercial Finance Agent",
      "Billing and Receivables Agent",
      "Cost Control Agent",
      "FX and Payment Operations Agent",
      "Financial Planning Analyst",
    ],
    sectorCompetencies: ["Treasury", "Commercial finance", "Payments", "FX", "Financial planning"],
  },
  {
    key: "legal-compliance-risk",
    name: "Legal, Compliance and Risk",
    capacity: 8,
    mission: "Independently review legal, regulatory and counterparty risk before commitments are made.",
    roles: [
      "Legal and Compliance Director",
      "Contract Review Agent",
      "Trade Compliance Agent",
      "Sanctions Screening Agent",
      "KYC and KYB Agent",
      "Data Protection Agent",
      "Regulatory Intelligence Agent",
      "Enterprise Risk Agent",
    ],
    sectorCompetencies: ["Trade law", "Contracts", "KYC and KYB", "Sanctions", "Data protection"],
  },
  {
    key: "customer-success-supply-management",
    name: "Customer Success and Supply Management",
    capacity: 6,
    mission: "Keep buyers and suppliers informed, supported and accountable throughout delivery.",
    roles: [
      "Customer Success Director",
      "Client Onboarding Agent",
      "Supply Management Agent",
      "Order Success Agent",
      "Escalation Resolution Agent",
      "Retention and Renewal Agent",
    ],
    sectorCompetencies: ["Customer success", "Supplier success", "Order support", "Retention"],
  },
  {
    key: "marketing-communications",
    name: "Marketing and Communications",
    capacity: 6,
    mission: "Communicate verified capabilities and create demand without overstating company claims.",
    roles: [
      "Marketing Director",
      "Brand and Communications Agent",
      "Content Strategy Agent",
      "Campaign Operations Agent",
      "Social Media Agent",
      "Market Education Agent",
    ],
    sectorCompetencies: ["Brand", "B2B communications", "Campaigns", "Content", "Market education"],
  },
  {
    key: "data-research-knowledge",
    name: "Data, Research and Knowledge",
    capacity: 6,
    mission: "Maintain the Company Brain as a cited, fresh, conflict-aware body of knowledge.",
    roles: [
      "Data and Knowledge Director",
      "Company Brain Curator",
      "Research Agent",
      "Evidence and Provenance Agent",
      "Data Quality Agent",
      "Knowledge Operations Agent",
    ],
    sectorCompetencies: ["Research", "Knowledge management", "Data quality", "Evidence provenance"],
  },
  {
    key: "product-engineering-security",
    name: "Product, Engineering and Security",
    capacity: 9,
    mission: "Build, secure and operate Exportunity's global trade operating system.",
    roles: [
      "Product Director",
      "Product Operations Agent",
      "UX Research Agent",
      "Platform Engineering Agent",
      "AI Systems Agent",
      "Integration Engineering Agent",
      "Security Engineering Agent",
      "Reliability and Observability Agent",
      "Quality Assurance Agent",
    ],
    sectorCompetencies: ["Product management", "Software engineering", "AI systems", "Security", "Reliability"],
  },
];

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function toolsForDepartment(departmentKey: string) {
  if (["global-revenue-business-development", "relationship-intelligence-crm"].includes(departmentKey)) {
    return COMMERCIAL_TOOLS;
  }
  if (["supplier-buyer-intelligence", "country-market-expansion", "commodity-industry-desks", "data-research-knowledge"].includes(departmentKey)) {
    return RESEARCH_TOOLS;
  }
  return INTERNAL_TOOLS;
}

function authorityForRole(role: string, ordinal: number): RoleSeatDecisionAuthority {
  if (/Founder|Chief of Staff|Strategy Director|Portfolio Director/i.test(role)) return "executive";
  if (/Director|Manager|Lead/i.test(role) || ordinal === 0) return "high";
  if (/Executive|Desk|Planning|Coordinator|Deal/i.test(role)) return "medium";
  return "low";
}

function levelForAuthority(authority: RoleSeatDecisionAuthority) {
  if (authority === "executive") return 5;
  if (authority === "high") return 4;
  if (authority === "medium") return 3;
  return 2;
}

export const EXPORTUNITY_ROLE_SEATS: ExportunityRoleSeatProfile[] = EXPORTUNITY_ROLE_SEAT_DEPARTMENTS.flatMap(
  (department) =>
    department.roles.map((role, ordinal) => {
      const decisionAuthority = authorityForRole(role, ordinal);
      const immutableAgentId = `exportunity-seat-${department.key}-${String(ordinal + 1).padStart(2, "0")}-${slugify(role)}`;
      return {
        immutableAgentId,
        defaultDisplayName: role,
        role,
        departmentKey: department.key,
        departmentName: department.name,
        companyEntityScope: ["Exportunity Group", "Exportunity.net"],
        description: `${department.mission} This seat serves as Exportunity's ${role}.`,
        languages: ["English", "French"],
        geographicCompetencies: department.geographicCompetencies || GLOBAL_GEOGRAPHIES,
        sectorCompetencies: department.sectorCompetencies,
        roleLevel: levelForAuthority(decisionAuthority),
        decisionAuthority,
        permittedTools: toolsForDepartment(department.key),
        prohibitedTools: ["send_message", "send_email", "send_whatsapp", "make_call", "payments", "contract_commitment", "external_publish"],
        budget: {
          currency: "USD" as const,
          monthlyLimit: 0,
          dailyTokenLimit: decisionAuthority === "executive" ? 30_000 : decisionAuthority === "high" ? 20_000 : 10_000,
        },
        contextPolicy: {
          mode: "task_scoped" as const,
          evidenceRequired: true as const,
          conflictAware: true as const,
          staleDataPolicy: "label_and_escalate" as const,
        },
        memoryScopes: ["personal", "department", "company", "entity"],
        escalationRules: [
          "Escalate external communications for recorded human approval.",
          "Escalate payments, contracts, supplier commitments and public claims.",
          "Escalate conflicting or stale evidence before relying on it.",
        ],
        performanceMetrics: ["task completion", "evidence coverage", "decision quality", "handoff quality", "policy compliance"],
        activationStatus: "available" as const,
        externalIdentityPolicy: {
          aiDisclosureRequired: true as const,
          impersonationProhibited: true as const,
          functionalIdentityAllowed: true as const,
        },
        mailboxIdentity: null,
      };
    }),
);

export const EXPORTUNITY_ROLE_SEAT_TOTAL = EXPORTUNITY_ROLE_SEATS.length;

