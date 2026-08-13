import { EXPORTUNITY_ROLE_SEATS } from "./roleSeatCatalog";

export type CoreAgentRoleSeatBinding = {
  organizationKey: string;
  roleSeatCode: string;
  roleSeatTitle: string;
  rationale: string;
};

const CORE_ROLE_BINDINGS = [
  {
    organizationKey: "ceo",
    roleSeatTitle: "Founder Liaison",
    rationale: "Connects the AI Chief Executive Officer to the founder's final human authority.",
  },
  {
    organizationKey: "tassi",
    roleSeatTitle: "AI Chief of Staff",
    rationale: "Tassi coordinates visible intake, context, and accountable handoffs.",
  },
  {
    organizationKey: "commercial",
    roleSeatTitle: "Customer Success Director",
    rationale: "Owns qualified commercial relationships and the agreed next step.",
  },
  {
    organizationKey: "sourcing",
    roleSeatTitle: "Sourcing Mission Manager",
    rationale: "Owns evidence-backed supplier discovery, RFQs, and sourcing missions.",
  },
  {
    organizationKey: "technical",
    roleSeatTitle: "Product Director",
    rationale: "Owns technical intake, engineering review, and production routing.",
  },
  {
    organizationKey: "logistics",
    roleSeatTitle: "Trade Operations Director",
    rationale: "Owns governed freight, documentation, and delivery coordination.",
  },
  {
    organizationKey: "finance",
    roleSeatTitle: "Finance Director",
    rationale: "Owns financial controls, commercial risk, and payment review.",
  },
  {
    organizationKey: "quality",
    roleSeatTitle: "Quality Assurance Agent",
    rationale: "Owns quality evidence, assembly handoffs, and non-conformance escalation.",
  },
  {
    organizationKey: "data",
    roleSeatTitle: "Data and Knowledge Director",
    rationale: "Owns industrial intelligence, data quality, and Company Brain evidence.",
  },
  {
    organizationKey: "compliance",
    roleSeatTitle: "Legal and Compliance Director",
    rationale: "Owns independent compliance, documentation, and approval-gate review.",
  },
  {
    organizationKey: "marketing",
    roleSeatTitle: "Marketing Director",
    rationale: "Owns accurate industrial positioning and governed demand generation.",
  },
  {
    organizationKey: "fenou",
    roleSeatTitle: "Product Operations Agent",
    rationale: "Fenou coordinates visible tasks, meetings, and operational follow-through.",
  },
] as const;

export const EXPORTUNITY_CORE_AGENT_ROLE_SEAT_BINDINGS: CoreAgentRoleSeatBinding[] =
  CORE_ROLE_BINDINGS.map((binding) => {
    const roleSeat = EXPORTUNITY_ROLE_SEATS.find(
      (seat) => seat.role === binding.roleSeatTitle,
    );
    if (!roleSeat) {
      throw new Error(`Missing governed role seat for ${binding.roleSeatTitle}`);
    }
    return {
      ...binding,
      roleSeatCode: roleSeat.immutableAgentId,
    };
  });

export const EXPORTUNITY_CORE_AGENT_KEYS =
  EXPORTUNITY_CORE_AGENT_ROLE_SEAT_BINDINGS.map(
    (binding) => binding.organizationKey,
  );
