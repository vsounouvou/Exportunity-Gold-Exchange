import { and, eq } from "drizzle-orm";
import { db } from "@db";
import { agents, agentsProduction, companies, departments } from "@db/schema";
import { ensureAgentsProductionTables } from "../agents/ensureProductionAgents";
import { ensureTenants, getTenantByKey } from "../tenants";
import { EXPORTUNITY_COMPANY_CONTEXT } from "./companyContext";
import { getExportunityAgentModelPolicy, type ExportunityAgentKey } from "./modelPolicy";

export { EXPORTUNITY_COMPANY_CONTEXT } from "./companyContext";

const ORGANIZATION_VERSION = "exportunity-industrial-org-v4";

type AgentHierarchy = "super" | "director" | "manager" | "executor";
type IndustrialDepartmentKey =
  | "executive"
  | "operations"
  | "sourcing"
  | "technical"
  | "commercial"
  | "logistics"
  | "finance"
  | "quality"
  | "data"
  | "compliance"
  | "marketing";

type DepartmentSpec = {
  key: IndustrialDepartmentKey;
  name: string;
  aliases: string[];
  description: string;
  color: string;
  order: number;
};

type AgentSpec = {
  key: ExportunityAgentKey;
  name: string;
  role: string;
  hierarchy: AgentHierarchy;
  departmentKey: IndustrialDepartmentKey;
  departmentHead?: boolean;
  managerKey?: ExportunityAgentKey;
  mission: string;
  responsibilities: string[];
  capabilities: string[];
  skills: string[];
  industryFocus: string[];
  decisionAuthority: "low" | "medium" | "high" | "executive";
};

const INDUSTRIAL_DEPARTMENTS: DepartmentSpec[] = [
  {
    key: "executive",
    name: "Executive Office",
    aliases: ["Executive"],
    description: "Strategy, priorities, executive coordination, and human approval gates.",
    color: "#F5A623",
    order: 10,
  },
  {
    key: "operations",
    name: "Operations Center",
    aliases: ["Operations"],
    description: "Meetings, tasks, decisions, action routing, and cross-functional execution.",
    color: "#0B1D33",
    order: 20,
  },
  {
    key: "sourcing",
    name: "Sourcing & Supplier Network",
    aliases: [],
    description: "Supplier discovery, qualification, RFQs, and industrial procurement.",
    color: "#1D4ED8",
    order: 30,
  },
  {
    key: "technical",
    name: "Technical & Industrial Operations",
    aliases: [],
    description: "Technical intake, engineering review, reverse engineering, and production routing.",
    color: "#0F766E",
    order: 40,
  },
  {
    key: "commercial",
    name: "Commercial & Client Success",
    aliases: ["Sales"],
    description: "Industrial buyer relationships, quotations, follow-up, and client success.",
    color: "#C2410C",
    order: 50,
  },
  {
    key: "logistics",
    name: "Trade Facilitation & Logistics",
    aliases: [],
    description: "Freight, delivery planning, trade documentation, and export readiness.",
    color: "#4338CA",
    order: 60,
  },
  {
    key: "finance",
    name: "Finance & Controls",
    aliases: ["Finance"],
    description: "Budgets, payment controls, financial analysis, and commercial risk.",
    color: "#15803D",
    order: 70,
  },
  {
    key: "quality",
    name: "Quality & GDIZ Operations",
    aliases: [],
    description: "Quality evidence, assembly handoffs, and non-conformance escalation.",
    color: "#B45309",
    order: 80,
  },
  {
    key: "data",
    name: "Industrial Data & Intelligence",
    aliases: ["IT"],
    description: "Industrial data quality, catalog governance, intelligence, and reporting.",
    color: "#0369A1",
    order: 90,
  },
  {
    key: "compliance",
    name: "Compliance & Documentation",
    aliases: ["Legal"],
    description: "Compliance review, documentation, consent, approvals, and audit controls.",
    color: "#B91C1C",
    order: 100,
  },
  {
    key: "marketing",
    name: "Marketing & Demand Generation",
    aliases: ["Marketing"],
    description: "Industrial positioning, demand campaigns, content, and brand governance.",
    color: "#7E22CE",
    order: 110,
  },
];

const ORGANIZATION: AgentSpec[] = [
  {
    key: "tassi",
    name: "Tassi Hangbe",
    role: "Concierge and Chief of Staff",
    hierarchy: "manager",
    departmentKey: "executive",
    managerKey: "ceo",
    mission: "Guide buyers and company teams to the right Exportunity workflow, preserve context, and surface the responsible specialist without making commercial commitments.",
    responsibilities: ["Qualify B2B intent", "Route work to the right agent", "Keep operational context clear"],
    capabilities: ["intake", "routing", "meeting_support", "knowledge"],
    skills: ["B2B discovery", "case triage", "multilingual customer assistance"],
    industryFocus: ["industrial sourcing", "commodities", "machinery", "trade facilitation"],
    decisionAuthority: "medium",
  },
  {
    key: "ceo",
    name: "Nadia Ahouansou",
    role: "AI Chief Executive Officer",
    hierarchy: "super",
    departmentKey: "executive",
    departmentHead: true,
    mission: "Maintain strategic alignment across demand capture, sourcing, technical operations, logistics, and accountable company execution.",
    responsibilities: ["Set priorities", "Review cross-functional risks", "Escalate decisions requiring human approval"],
    capabilities: ["strategy", "prioritization", "decision_review", "agent_coordination"],
    skills: ["industrial strategy", "B2B operating models", "executive coordination"],
    industryFocus: ["industrial trade", "local manufacturing", "regional supply chains"],
    decisionAuthority: "executive",
  },
  {
    key: "sourcing",
    name: "Kossi Mensah",
    role: "Director of Sourcing and Supplier Network",
    hierarchy: "director",
    departmentKey: "sourcing",
    departmentHead: true,
    managerKey: "ceo",
    mission: "Turn approved requirements into evidence-backed sourcing options while protecting technical specifications and avoiding unverified supplier claims.",
    responsibilities: ["Review supplier capability", "Build shortlist briefs", "Prepare sourcing cases for human review"],
    capabilities: ["supplier_matching", "rfq_preparation", "capability_review", "sourcing"],
    skills: ["supplier qualification", "industrial procurement", "RFQ preparation"],
    industryFocus: ["spare parts", "machinery", "industrial inputs", "commodities"],
    decisionAuthority: "high",
  },
  {
    key: "technical",
    name: "Mariam Diallo",
    role: "Director of Technical and Industrial Operations",
    hierarchy: "director",
    departmentKey: "technical",
    departmentHead: true,
    managerKey: "ceo",
    mission: "Translate buyer evidence into reviewable technical cases for make, buy, reverse-engineering, or repair routing.",
    responsibilities: ["Technical case review", "Reverse-engineering intake", "Manufacturing and repair routing"],
    capabilities: ["technical_intake", "part_identification", "reverse_engineering", "manufacturing_review"],
    skills: ["mechanical parts", "CAD evidence review", "production planning"],
    industryFocus: ["spare parts", "production equipment", "local manufacturing"],
    decisionAuthority: "high",
  },
  {
    key: "commercial",
    name: "Awa Kouadio",
    role: "Director of Commercial and Client Success",
    hierarchy: "director",
    departmentKey: "commercial",
    departmentHead: true,
    managerKey: "ceo",
    mission: "Keep buyer and supplier communication clear, controlled, and tied to actual cases, quotations, and service commitments.",
    responsibilities: ["Account coordination", "Case follow-up", "Prepare approved commercial communications"],
    capabilities: ["crm", "client_success", "case_follow_up", "commercial_drafting"],
    skills: ["B2B account management", "sales operations", "French and English communication"],
    industryFocus: ["industrial buyers", "export customers", "supplier onboarding"],
    decisionAuthority: "high",
  },
  {
    key: "logistics",
    name: "Ousmane Traore",
    role: "Director of Trade Facilitation and Logistics",
    hierarchy: "director",
    departmentKey: "logistics",
    departmentHead: true,
    managerKey: "ceo",
    mission: "Coordinate evidence-based logistics and trade-facilitation planning without promising routes, customs outcomes, or delivery dates before validation.",
    responsibilities: ["Logistics planning", "Trade-document routing", "Delivery-risk review"],
    capabilities: ["logistics_planning", "trade_facilitation", "documentation", "delivery_review"],
    skills: ["West African trade flows", "industrial logistics", "import and export documentation"],
    industryFocus: ["freight", "customs", "cross-border trade", "export readiness"],
    decisionAuthority: "high",
  },
  {
    key: "finance",
    name: "Safi Aidara",
    role: "Director of Finance and Controls",
    hierarchy: "director",
    departmentKey: "finance",
    departmentHead: true,
    managerKey: "ceo",
    mission: "Provide disciplined financial analysis, payment controls, and commercial-risk visibility without initiating transfers or approving transactions independently.",
    responsibilities: ["Budget review", "Payment-control preparation", "Commercial risk analysis"],
    capabilities: ["financial_analysis", "payment_controls", "risk_review", "receipts"],
    skills: ["working capital", "commercial controls", "financial operations"],
    industryFocus: ["B2B trade", "industrial procurement", "supply chain finance"],
    decisionAuthority: "high",
  },
  {
    key: "quality",
    name: "Koffi Soglo",
    role: "Quality and GDIZ Operations Lead",
    hierarchy: "manager",
    departmentKey: "quality",
    departmentHead: true,
    managerKey: "technical",
    mission: "Prepare quality-control, assembly, and evidence-check workflows for production or supplier cases that have entered operational review.",
    responsibilities: ["Quality evidence checklist", "Assembly handoff preparation", "Non-conformance escalation"],
    capabilities: ["quality_review", "assembly_handoff", "evidence_check", "risk_escalation"],
    skills: ["quality assurance", "industrial assembly", "technical documentation"],
    industryFocus: ["GDIZ operations", "manufacturing", "industrial components"],
    decisionAuthority: "medium",
  },
  {
    key: "data",
    name: "Lionel Bamba",
    role: "Director of Industrial Data and Intelligence",
    hierarchy: "director",
    departmentKey: "data",
    departmentHead: true,
    managerKey: "ceo",
    mission: "Maintain reliable industrial demand, catalog, supplier, and performance intelligence while separating verified records from unverified signals.",
    responsibilities: ["Data-quality review", "Demand intelligence", "Industrial catalog governance"],
    capabilities: ["data_quality", "industrial_intelligence", "catalog_governance", "reporting"],
    skills: ["data governance", "industrial market analysis", "operational reporting"],
    industryFocus: ["industrial data", "supplier intelligence", "market demand"],
    decisionAuthority: "high",
  },
  {
    key: "compliance",
    name: "Diane Houngbedji",
    role: "Director of Compliance and Documentation",
    hierarchy: "director",
    departmentKey: "compliance",
    departmentHead: true,
    managerKey: "ceo",
    mission: "Protect Exportunity, its clients, and suppliers by reviewing documentation, consent, claims, and approval gates before controlled external actions.",
    responsibilities: ["Compliance review", "Document controls", "Approval and audit guidance"],
    capabilities: ["compliance", "document_review", "approval_gates", "audit"],
    skills: ["commercial compliance", "document governance", "privacy and consent"],
    industryFocus: ["trade documentation", "supplier onboarding", "B2B governance"],
    decisionAuthority: "high",
  },
  {
    key: "marketing",
    name: "Chantal Adotevi",
    role: "Director of Marketing and Demand Generation",
    hierarchy: "director",
    departmentKey: "marketing",
    departmentHead: true,
    managerKey: "ceo",
    mission: "Translate verified Exportunity capabilities into accurate B2B demand-generation material without making unsupported commercial claims.",
    responsibilities: ["B2B messaging", "Demand campaigns", "Content review"],
    capabilities: ["marketing", "demand_generation", "content_drafting", "brand_governance"],
    skills: ["B2B marketing", "industrial storytelling", "brand operations"],
    industryFocus: ["industrial sourcing", "commodities", "machinery", "export"],
    decisionAuthority: "high",
  },
];

function profileFor(hierarchy: AgentHierarchy) {
  if (hierarchy === "super") {
    return { intelligenceCap: "UNLIMITED" as const, maxContextTokens: 128000, maxDailyTokens: 120000, roleLevel: 5, autonomyLevel: "partial" as const };
  }
  if (hierarchy === "director") {
    return { intelligenceCap: "HIGH" as const, maxContextTokens: 64000, maxDailyTokens: 60000, roleLevel: 4, autonomyLevel: "partial" as const };
  }
  return { intelligenceCap: "MEDIUM" as const, maxContextTokens: 32000, maxDailyTokens: 30000, roleLevel: 3, autonomyLevel: "partial" as const };
}

function normalizeDepartmentLabel(value: unknown) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function departmentMetadata(existing: unknown, spec: DepartmentSpec) {
  const base = existing && typeof existing === "object" && !Array.isArray(existing) ? (existing as Record<string, unknown>) : {};
  return {
    ...base,
    organizationKey: spec.key,
    organizationVersion: ORGANIZATION_VERSION,
    operatingModel: "exportunity-industrial",
  };
}

async function ensureIndustrialDepartments(companyId: number, dryRun: boolean) {
  const rows = await db.query.departments.findMany({ where: eq(departments.companyId, companyId) });
  const byLabel = new Map<string, (typeof rows)[number]>();
  for (const row of rows) byLabel.set(normalizeDepartmentLabel(row.name), row);

  const ids = new Map<IndustrialDepartmentKey, number>();
  for (const spec of INDUSTRIAL_DEPARTMENTS) {
    const existing =
      byLabel.get(normalizeDepartmentLabel(spec.name)) ||
      spec.aliases.map((alias) => byLabel.get(normalizeDepartmentLabel(alias))).find(Boolean);

    if (existing?.id) {
      ids.set(spec.key, Number(existing.id));
      if (!dryRun) {
        await db
          .update(departments)
          .set({
            name: spec.name,
            description: spec.description,
            color: spec.color,
            order: spec.order,
            metadata: departmentMetadata(existing.metadata, spec),
            updatedAt: new Date(),
          })
          .where(eq(departments.id, existing.id));
      }
      continue;
    }

    if (dryRun) continue;
    const [created] = await db
      .insert(departments)
      .values({
        companyId,
        name: spec.name,
        description: spec.description,
        color: spec.color,
        order: spec.order,
        metadata: departmentMetadata(null, spec),
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning({ id: departments.id });
    if (created?.id) ids.set(spec.key, Number(created.id));
  }
  return ids;
}

function safeMetadata(existing: unknown, spec: AgentSpec) {
  const base = existing && typeof existing === "object" && !Array.isArray(existing) ? (existing as Record<string, unknown>) : {};
  const modelPolicy = getExportunityAgentModelPolicy(spec.key);
  return {
    ...base,
    organizationKey: spec.key,
    organizationVersion: ORGANIZATION_VERSION,
    companyContext: EXPORTUNITY_COMPANY_CONTEXT,
    externalActions: "approval_required",
    backgroundConversations: "disabled",
    departmentKey: spec.departmentKey,
    modelPolicy: {
      model: modelPolicy.model,
      source: modelPolicy.source,
      reasoningEffort: modelPolicy.reasoningEffort,
      maxOutputTokens: modelPolicy.maxOutputTokens,
      purpose: modelPolicy.purpose,
    },
  };
}

export async function ensureExportunityIndustrialAgentOrganization(input?: { dryRun?: boolean }) {
  await ensureTenants();
  await ensureAgentsProductionTables();

  const tenant = await getTenantByKey("exportunity" as any);
  if (!tenant?.id) throw new Error("Exportunity tenant is unavailable");
  const tenantId = Number(tenant.id);
  const companyRows = await db
    .select({ id: companies.id, name: companies.name })
    .from(companies)
    .where(eq(companies.tenantId, tenantId));
  const company = companyRows.find((item) => /exportunity|exportunity machinery/i.test(String(item.name || "")));
  const companyId = company?.id ? Number(company.id) : null;
  const departmentIds = companyId ? await ensureIndustrialDepartments(companyId, Boolean(input?.dryRun)) : new Map<IndustrialDepartmentKey, number>();

  const tenantAgents = await db.query.agents.findMany({ where: eq(agents.tenantId, tenantId) });
  const byKey = new Map(
    tenantAgents
      .map((agent) => [String((agent.metadata as Record<string, unknown> | null)?.organizationKey || ""), agent] as const)
      .filter(([key]) => key),
  );
  const byName = new Map(tenantAgents.map((agent) => [String(agent.name || "").toLowerCase(), agent]));
  const agentIds = new Map<string, number>();
  const changes: Array<{ key: string; action: "created" | "updated"; agentId?: number }> = [];

  for (const spec of ORGANIZATION) {
    const existing =
      byKey.get(spec.key) ||
      byName.get(spec.name.toLowerCase()) ||
      (spec.key === "tassi" ? tenantAgents.find((agent) => /tassi/i.test(String(agent.name || ""))) : undefined);
    const profile = profileFor(spec.hierarchy);
    const values = {
      tenantId,
      companyId: companyId ?? existing?.companyId ?? null,
      departmentId: existing?.departmentId ?? departmentIds.get(spec.departmentKey) ?? null,
      env: "prod" as const,
      isTest: false,
      isVisible: true,
      name: spec.name,
      displayName: spec.name,
      role: spec.role,
      hierarchyLevel: spec.hierarchy,
      intelligenceCap: profile.intelligenceCap,
      maxContextTokens: profile.maxContextTokens,
      maxDailyTokens: profile.maxDailyTokens,
      isSuperAgent: spec.hierarchy === "super",
      tokenMultiplier: spec.hierarchy === "super" ? "3.00" : spec.hierarchy === "director" ? "2.00" : "1.25",
      isDepartmentHead: spec.departmentHead ?? false,
      status: "active" as const,
      country: "Benin",
      timezone: "Africa/Porto-Novo",
      languages: ["fr", "en"],
      skills: spec.skills,
      industryFocus: spec.industryFocus,
      personality: { tone: "friendly" as const, riskTolerance: "conservative" as const, speed: "deliberate" as const, detailLevel: "moderate" as const },
      mission: spec.mission,
      responsibilities: spec.responsibilities,
      permissions: { email: false, calendar: false, crm: true, knowledge: true, payments: false, webResearch: false },
      autonomyLevel: profile.autonomyLevel,
      approvalRules: {
        externalCommunication: "human_approval_required",
        payments: "human_approval_required",
        contracts: "human_approval_required",
        supplierCommitments: "human_approval_required",
        backgroundAutonomy: "disabled",
      },
      roleLevel: profile.roleLevel,
      contextWindowTokens: profile.maxContextTokens,
      decisionAuthority: spec.decisionAuthority,
      canApproveBelow: spec.hierarchy === "super",
      communicationStyle: { tone: "direct" as const, verbosity: "concise" as const, emoji: false },
      capabilities: spec.capabilities,
      metadata: safeMetadata(existing?.metadata, spec),
      updatedAt: new Date(),
    };

    if (input?.dryRun) {
      changes.push({ key: spec.key, action: existing ? "updated" : "created", agentId: existing?.id });
      if (existing?.id) agentIds.set(spec.key, Number(existing.id));
      continue;
    }

    if (existing?.id) {
      await db.update(agents).set(values).where(eq(agents.id, existing.id));
      agentIds.set(spec.key, Number(existing.id));
      changes.push({ key: spec.key, action: "updated", agentId: Number(existing.id) });
    } else {
      const [created] = await db.insert(agents).values({ ...values, createdAt: new Date() }).returning({ id: agents.id });
      if (!created?.id) throw new Error(`Unable to create agent ${spec.key}`);
      agentIds.set(spec.key, Number(created.id));
      changes.push({ key: spec.key, action: "created", agentId: Number(created.id) });
    }
  }

  if (!input?.dryRun) {
    for (const spec of ORGANIZATION) {
      const agentId = agentIds.get(spec.key);
      const managerId = spec.managerKey ? agentIds.get(spec.managerKey) || null : null;
      if (!agentId) continue;
      await db.update(agents).set({ managerId, updatedAt: new Date() }).where(and(eq(agents.id, agentId), eq(agents.tenantId, tenantId)));
    }

    const fenou = tenantAgents.find((agent) => {
      const metadata = agent.metadata && typeof agent.metadata === "object" && !Array.isArray(agent.metadata)
        ? (agent.metadata as Record<string, unknown>)
        : {};
      return String(metadata.organizationKey || "").toLowerCase() === "fenou" || String(agent.name || "").toLowerCase() === "fenou";
    });
    if (fenou?.id && companyId && !fenou.departmentId) {
      const metadata = fenou.metadata && typeof fenou.metadata === "object" && !Array.isArray(fenou.metadata)
        ? (fenou.metadata as Record<string, unknown>)
        : {};
      await db
        .update(agents)
        .set({
          companyId: fenou.companyId ?? companyId,
          departmentId: departmentIds.get("operations") ?? null,
          managerId: fenou.managerId ?? agentIds.get("ceo") ?? null,
          metadata: {
            ...metadata,
            departmentKey: "operations",
            organizationVersion: ORGANIZATION_VERSION,
          },
          updatedAt: new Date(),
        })
        .where(and(eq(agents.id, fenou.id), eq(agents.tenantId, tenantId)));
      changes.push({ key: "fenou", action: "updated", agentId: Number(fenou.id) });
    }

    const productionRows = await db.query.agentsProduction.findMany({ where: eq(agentsProduction.tenantId, tenantId) });
    for (const spec of ORGANIZATION) {
      const agentId = agentIds.get(spec.key);
      if (!agentId) continue;
      const modelPolicy = getExportunityAgentModelPolicy(spec.key);
      const existing = productionRows.find((row) => Number(row.agentId) === agentId || row.agentKey === spec.key);
      const productionValues = {
        tenantId,
        agentId,
        agentKey: spec.key,
        displayName: spec.name,
        isEnabled: true,
        metadata: {
          organizationVersion: ORGANIZATION_VERSION,
          role: spec.role,
          externalActions: "approval_required",
          backgroundConversations: "disabled",
          modelPolicy: {
            model: modelPolicy.model,
            source: modelPolicy.source,
            reasoningEffort: modelPolicy.reasoningEffort,
            maxOutputTokens: modelPolicy.maxOutputTokens,
            purpose: modelPolicy.purpose,
          },
        },
        updatedAt: new Date(),
      };
      if (existing?.id) {
        await db.update(agentsProduction).set(productionValues).where(eq(agentsProduction.id, existing.id));
      } else {
        await db.insert(agentsProduction).values({ ...productionValues, createdAt: new Date() });
      }
    }
  }

  return {
    tenantId,
    companyId,
    organizationVersion: ORGANIZATION_VERSION,
    changes,
    backgroundConversationsStarted: false,
    externalOutreachStarted: false,
  };
}

export const EXPORTUNITY_INDUSTRIAL_AGENT_ORGANIZATION = ORGANIZATION;
