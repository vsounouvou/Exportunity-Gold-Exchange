import type { Agent } from "@db/schema";

export type AgentSuggestionResponse = {
  generatedAt: string;
  mode: "offline" | "ai";
  text: {
    cv: string[];
    lifeStory: string[];
    personalGoals: string[];
    mission: string[];
  };
  tags: {
    skills: string[];
    industryFocus: string[];
    responsibilities: string[];
    languages: string[];
  };
};

function uniq(values: string[]) {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of values) {
    const trimmed = v.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

function guessLanguages(country: string | null | undefined) {
  const c = (country || "").toLowerCase();
  if (
    c.includes("côte") ||
    c.includes("cote") ||
    c.includes("ivoire") ||
    c.includes("ivory") ||
    c === "ci"
  )
    return ["French", "English"];
  if (c.includes("ghana")) return ["English", "French"];
  if (c.includes("senegal") || c.includes("mali") || c.includes("burkina")) return ["French", "English"];
  if (c.includes("morocco")) return ["Arabic", "French", "English"];
  if (c.includes("mexico")) return ["Spanish", "English", "French"];
  if (c.includes("india")) return ["English", "Hindi"];
  if (c.includes("germany")) return ["English", "German", "French"];
  if (c.includes("korea")) return ["English", "Korean"];
  return ["English", "French"];
}

function roleKey(agent: Agent) {
  const name = (agent.name || "").toLowerCase();
  const role = (agent.role || "").toLowerCase();
  const combined = `${name} ${role}`;
  if (combined.includes("chief of staff")) return "chief_of_staff";
  if (combined.includes("sourcing") || combined.includes("procurement") || combined.includes("supplier")) return "sourcing";
  if (combined.includes("technical") || combined.includes("engineering") || combined.includes("reverse")) return "technical_operations";
  if (combined.includes("quality") || combined.includes("gdiz")) return "quality_operations";
  if (combined.includes("trade facilitation") || combined.includes("logistics")) return "trade_logistics";
  if (combined.includes("finance") || combined.includes("accounting")) return "finance_controls";
  if (combined.includes("commercial") || combined.includes("client success")) return "commercial";
  if (combined.includes("marketing") || combined.includes("demand generation")) return "marketing";
  if (combined.includes("compliance") || combined.includes("aml") || combined.includes("kyc")) return "compliance";
  if (combined.includes("legal") || combined.includes("contract") || combined.includes("counsel")) return "legal";
  if (combined.includes("treasury") || combined.includes("payments") || combined.includes("controller")) return "treasury";
  if (combined.includes("pricing") || combined.includes("hedg")) return "pricing";
  if (combined.includes("marketplace") || combined.includes("ops")) return "marketplace_ops";
  if (combined.includes("onboarding") || combined.includes("vendor") || combined.includes("seller")) return "onboarding";
  if (combined.includes("customer") || combined.includes("success") || combined.includes("dispute")) return "customer_success";
  if (combined.includes("dispatch") || combined.includes("logistics") || combined.includes("delivery")) return "dispatch";
  if (combined.includes("data") || combined.includes("bi") || combined.includes("analytics")) return "data_bi";
  if (combined.includes("ceo")) return "ceo";
  return "general";
}

function isExportunityIndustrialAgent(agent: Agent) {
  const metadata =
    agent.metadata && typeof agent.metadata === "object" && !Array.isArray(agent.metadata)
      ? (agent.metadata as Record<string, unknown>)
      : {};
  return typeof metadata.organizationVersion === "string" && metadata.organizationVersion.startsWith("exportunity-industrial-org-");
}

export function buildOfflineAgentSuggestions(agent: Agent): AgentSuggestionResponse {
  const key = roleKey(agent);
  const country = agent.country || "West Africa";
  const isIndustrial = isExportunityIndustrialAgent(agent);

  const baseSkillsByKey: Record<string, string[]> = {
    chief_of_staff: ["Executive operations", "Decision briefs", "Cross-team orchestration", "Prioritization", "Governance cadence"],
    compliance: ["AML/KYC", "Sanctions screening", "Risk scoring", "Audit evidence", "Policy design"],
    legal: ["Contract drafting", "Dispute resolution", "Policy translation", "Terms & compliance", "Evidence standards"],
    treasury: ["Reconciliation", "Ledger controls", "Settlement operations", "Cash forecasting", "FX operations"],
    pricing: ["Pricing models", "FX", "Margin management", "Scenario planning", "Anomaly detection"],
    marketplace_ops: ["Seller ops", "Catalog QA", "SLA design", "Process improvement", "Escalation handling"],
    onboarding: ["Onboarding playbooks", "Documentation", "Partner success", "Pipeline management", "Follow-ups"],
    customer_success: ["Dispute resolution", "Customer success", "Escalation handling", "SLA enforcement", "Root-cause analysis"],
    dispatch: ["Dispatch operations", "Exception handling", "SLA monitoring", "Coordination", "Route planning"],
    data_bi: ["Dashboards", "KPI design", "Anomaly detection", "Data storytelling", "Executive reporting"],
    ceo: ["Strategy", "Leadership", "Negotiation", "Risk management", "Stakeholder communication"],
    general: ["Communication", "Problem solving", "Process improvement", "Documentation", "Analysis"],
  };

  const industrialSkillsByKey: Record<string, string[]> = {
    chief_of_staff: ["Executive operations", "Cross-functional routing", "Decision briefs", "Approval tracking", "B2B case coordination"],
    sourcing: ["Supplier qualification", "Industrial procurement", "RFQ preparation", "Capability evidence", "Source validation"],
    technical_operations: ["Technical intake", "Part identification", "Reverse-engineering review", "CAD evidence", "Manufacturing routing"],
    quality_operations: ["Quality evidence", "Assembly preparation", "Non-conformance review", "Technical documentation", "Operational risk escalation"],
    trade_logistics: ["Trade facilitation", "Industrial logistics", "Export documentation", "Delivery-risk review", "Route planning"],
    finance_controls: ["Commercial controls", "Working-capital analysis", "Payment review", "Costing support", "Risk visibility"],
    commercial: ["B2B account coordination", "Quote preparation", "Case follow-up", "Customer success", "Commercial drafting"],
    marketing: ["Industrial storytelling", "B2B demand generation", "Brand governance", "Campaign planning", "Evidence-based messaging"],
    data_bi: ["Industrial intelligence", "Data quality", "Catalog governance", "Demand analysis", "Operational reporting"],
    ceo: ["Industrial strategy", "Portfolio prioritization", "Risk review", "Agent coordination", "Executive decision support"],
    general: ["B2B operations", "Documentation", "Evidence review", "Process improvement", "Analysis"],
  };

  const baseIndustryByKey: Record<string, string[]> = {
    chief_of_staff: ["Gold supply chain", "Marketplace operations", "Payments & settlements"],
    compliance: ["Gold trade compliance", "Marketplace onboarding", "Payments monitoring"],
    legal: ["Commodities contracts", "Marketplace disputes", "Digital contracting"],
    treasury: ["Treasury", "Payments", "Cross-border settlement"],
    pricing: ["Gold pricing", "FX rates", "Margin management"],
    marketplace_ops: ["Marketplace operations", "Seller onboarding", "Customer experience"],
    onboarding: ["Vendor onboarding", "B2B partnerships", "Seller enablement"],
    customer_success: ["Marketplace CX", "Returns/refunds", "Dispute evidence"],
    dispatch: ["Delivery ops", "Logistics", "Order fulfillment"],
    data_bi: ["Marketplace metrics", "Treasury metrics", "Operational analytics"],
    ceo: ["Gold & metals", "Trade & export", "Platform strategy"],
    general: ["Operations", "Marketplace", "Gold exchange"],
  };

  const industrialIndustryByKey: Record<string, string[]> = {
    chief_of_staff: ["Industrial operations", "B2B trade", "Machinery and spare parts"],
    sourcing: ["Industrial sourcing", "Supplier networks", "Commodities and inputs"],
    technical_operations: ["Spare parts", "Reverse engineering", "Local manufacturing"],
    quality_operations: ["Quality assurance", "GDIZ-aligned operations", "Industrial components"],
    trade_logistics: ["Trade facilitation", "Freight and logistics", "Export readiness"],
    finance_controls: ["B2B trade", "Industrial procurement", "Commercial controls"],
    commercial: ["Industrial buyers", "Supplier onboarding", "Export customers"],
    marketing: ["Industrial sourcing", "Machinery", "B2B demand generation"],
    data_bi: ["Industrial data", "Supplier intelligence", "Market demand"],
    ceo: ["Industrial strategy", "African trade", "Regional supply chains"],
    general: ["Industrial operations", "B2B trade", "Supply chains"],
  };

  const baseResponsibilitiesByKey: Record<string, string[]> = {
    chief_of_staff: ["Run executive cadence (KPIs, risks, decisions)", "Maintain decision log and follow-ups", "Coordinate escalations across modules"],
    compliance: ["Design onboarding verification workflows", "Flag suspicious patterns and escalate", "Maintain compliance playbooks and audit logs"],
    legal: ["Standardize contract templates", "Define dispute playbooks and evidence requirements", "Review sensitive policy changes"],
    treasury: ["Monitor wallet balances and settlements", "Define payment approval rules and limits", "Investigate reconciliation discrepancies"],
    pricing: ["Maintain gold and FX inputs and checks", "Recommend spreads/fees by tier and risk", "Publish daily pricing brief"],
    marketplace_ops: ["Oversee seller approvals and performance", "Track cancellations/refunds/disputes", "Coordinate SLAs with delivery ops"],
    onboarding: ["Guide applicants through verification", "Collect and validate documents", "Hand off verified partners for activation"],
    customer_success: ["Run disputes queue and resolution playbooks", "Coordinate with Legal on policies", "Report weekly dispute trends and fixes"],
    dispatch: ["Monitor delivery pipeline and failures", "Coordinate with agents and sellers", "Report daily SLA performance and blockers"],
    data_bi: ["Maintain Chairman dashboards and scorecards", "Define KPIs per module and track trends", "Flag anomalies in orders and payments"],
    ceo: ["Set priorities and growth targets", "Approve strategic changes and escalations", "Represent company in key negotiations"],
    general: ["Own a clear module scope", "Document decisions and actions", "Report weekly progress to the Chairman"],
  };

  const industrialResponsibilitiesByKey: Record<string, string[]> = {
    chief_of_staff: ["Route cases to the accountable specialist", "Maintain visible decisions and follow-ups", "Protect company context across workflows"],
    sourcing: ["Prepare verified supplier options", "Collect technical sourcing evidence", "Escalate unverified claims for review"],
    technical_operations: ["Classify technical intake", "Prepare make, buy, repair, or reverse-engineering cases", "Define evidence needed before a quote"],
    quality_operations: ["Prepare quality and assembly checklists", "Escalate non-conformances", "Link technical evidence to operational cases"],
    trade_logistics: ["Prepare logistics and documentation plans", "Flag delivery and trade risks", "Avoid unverified route commitments"],
    finance_controls: ["Review costs and payment controls", "Surface commercial risks", "Require approval before financial actions"],
    commercial: ["Coordinate B2B account follow-up", "Prepare clear commercial drafts", "Keep commitments linked to validated cases"],
    marketing: ["Translate verified capabilities into demand messaging", "Review claims before publication", "Support industrial campaign planning"],
    data_bi: ["Maintain demand and catalog intelligence", "Separate verified data from signals", "Report operational patterns"],
    ceo: ["Set cross-functional priorities", "Review material risks", "Escalate decisions that require human approval"],
    general: ["Own a defined industrial workflow", "Document evidence and decisions", "Escalate ambiguity early"],
  };

  const skillsByKey = isIndustrial ? industrialSkillsByKey : baseSkillsByKey;
  const industryByKey = isIndustrial ? industrialIndustryByKey : baseIndustryByKey;
  const responsibilitiesByKey = isIndustrial ? industrialResponsibilitiesByKey : baseResponsibilitiesByKey;
  const skills = uniq([...(agent.skills as any as string[] | undefined) || [], ...(skillsByKey[key] || [])]);
  const industryFocus = uniq([...(agent.industryFocus as any as string[] | undefined) || [], ...(industryByKey[key] || [])]);
  const responsibilities = uniq([...(agent.responsibilities as any as string[] | undefined) || [], ...(responsibilitiesByKey[key] || [])]);
  const languages = uniq([...(agent.languages as any as string[] | undefined) || [], ...guessLanguages(agent.country)]);

  const role = agent.role || "Team member";
  const agentName = agent.name || "Agent";

  const cvOptions = [
    `${agentName} is a ${role} focused on execution quality and measurable outcomes across ${isIndustrial ? "Exportunity's industrial trade and operations platform" : "the Exportunity Gold Exchange marketplace and gold operations"}.`,
    `Experienced operator in ${industryFocus.slice(0, 2).join(" & ")}; designs repeatable processes, escalations, and dashboards that keep the Chairman informed.`,
    `Specializes in ${skills.slice(0, 3).join(", ")} with a bias for speed, clear ownership, and compliance-first execution.`,
  ];

  const missionOptions = [
    `Own ${role} outcomes with tight execution: clear metrics, evidence-aware decisions, and reliable delivery across ${isIndustrial ? "industrial trade and operations workflows" : "marketplace and gold exchange modules"}.`,
    `Reduce risk and friction while improving throughput: automate checks, standardize playbooks, and escalate only what truly needs the Chairman.`,
    `Turn daily operations into predictable performance: measure, improve, and keep stakeholders aligned with clear next actions.`,
  ];

  const lifeStoryOptions = [
    `Raised in ${country}, ${agentName} learned early that trust is earned through consistent delivery. Over time, they developed a reputation for calm execution under pressure and a habit of writing things down so nothing falls through.`,
    `${agentName} started in hands-on operations before moving into platform work. They value clarity, prefer simple workflows over complex ones, and believe great teams run on rhythm: metrics, decisions, follow-ups.`,
    `After seeing how small process gaps create big failures, ${agentName} made it a personal mission to build systems that are transparent, auditable, and easy for real people to use, especially in ${industryFocus[0] || "trade"}.`,
  ];

  const goalsOptions = [
    `Make my module predictable: reduce turnaround time, increase success rates, and document every decision so execution stays aligned.`,
    `Help the Chairman operate at maximum leverage by turning alerts into actions, actions into owners, and owners into results.`,
    `Build trust at scale: fewer disputes, fewer exceptions, faster resolutions, and tighter compliance with minimal friction.`,
  ];

  return {
    generatedAt: new Date().toISOString(),
    mode: "offline",
    text: {
      cv: uniq(cvOptions),
      lifeStory: uniq(lifeStoryOptions),
      personalGoals: uniq(goalsOptions),
      mission: uniq(missionOptions),
    },
    tags: {
      skills,
      industryFocus,
      responsibilities,
      languages,
    },
  };
}

