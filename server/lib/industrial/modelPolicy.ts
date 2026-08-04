export type ExportunityAgentKey =
  | "tassi"
  | "ceo"
  | "sourcing"
  | "technical"
  | "commercial"
  | "logistics"
  | "finance"
  | "quality"
  | "data"
  | "compliance"
  | "marketing";

export type ExportunityReasoningEffort = "low" | "medium" | "high";

type AgentModelDefinition = {
  key: ExportunityAgentKey;
  preferredModel: string;
  environmentKey: string;
  reasoningEffort: ExportunityReasoningEffort;
  maxOutputTokens: number;
  purpose: string;
};

export type ExportunityAgentModelPolicy = AgentModelDefinition & {
  model: string;
  source: "agent_override" | "tenant_override" | "legacy_override" | "default";
};

const AGENT_MODEL_DEFINITIONS: Record<ExportunityAgentKey, AgentModelDefinition> = {
  tassi: {
    key: "tassi",
    preferredModel: "gpt-5.6-luna",
    environmentKey: "OPENAI_EXPORTUNITY_TASSI_MODEL",
    reasoningEffort: "low",
    maxOutputTokens: 240,
    purpose: "Visible B2B intake, multilingual clarification, and safe workflow routing.",
  },
  ceo: {
    key: "ceo",
    preferredModel: "gpt-5.6-sol",
    environmentKey: "OPENAI_EXPORTUNITY_CEO_MODEL",
    reasoningEffort: "high",
    maxOutputTokens: 900,
    purpose: "Executive prioritization and cross-functional decision review.",
  },
  sourcing: {
    key: "sourcing",
    preferredModel: "gpt-5.6-terra",
    environmentKey: "OPENAI_EXPORTUNITY_SOURCING_MODEL",
    reasoningEffort: "medium",
    maxOutputTokens: 700,
    purpose: "Evidence-backed supplier and RFQ analysis.",
  },
  technical: {
    key: "technical",
    preferredModel: "gpt-5.6-terra",
    environmentKey: "OPENAI_EXPORTUNITY_TECHNICAL_MODEL",
    reasoningEffort: "medium",
    maxOutputTokens: 800,
    purpose: "Technical intake, part identification, and make-buy-repair review.",
  },
  commercial: {
    key: "commercial",
    preferredModel: "gpt-5.6-terra",
    environmentKey: "OPENAI_EXPORTUNITY_COMMERCIAL_MODEL",
    reasoningEffort: "medium",
    maxOutputTokens: 650,
    purpose: "Controlled B2B communication and case coordination.",
  },
  logistics: {
    key: "logistics",
    preferredModel: "gpt-5.6-terra",
    environmentKey: "OPENAI_EXPORTUNITY_LOGISTICS_MODEL",
    reasoningEffort: "medium",
    maxOutputTokens: 650,
    purpose: "Trade facilitation and logistics-risk review.",
  },
  finance: {
    key: "finance",
    preferredModel: "gpt-5.6-sol",
    environmentKey: "OPENAI_EXPORTUNITY_FINANCE_MODEL",
    reasoningEffort: "high",
    maxOutputTokens: 750,
    purpose: "Financial controls and commercial-risk analysis without transaction authority.",
  },
  quality: {
    key: "quality",
    preferredModel: "gpt-5.6-terra",
    environmentKey: "OPENAI_EXPORTUNITY_QUALITY_MODEL",
    reasoningEffort: "medium",
    maxOutputTokens: 650,
    purpose: "Quality, assembly, and evidence-check preparation.",
  },
  data: {
    key: "data",
    preferredModel: "gpt-5.6-terra",
    environmentKey: "OPENAI_EXPORTUNITY_DATA_MODEL",
    reasoningEffort: "medium",
    maxOutputTokens: 700,
    purpose: "Industrial demand intelligence and data-quality review.",
  },
  compliance: {
    key: "compliance",
    preferredModel: "gpt-5.6-sol",
    environmentKey: "OPENAI_EXPORTUNITY_COMPLIANCE_MODEL",
    reasoningEffort: "high",
    maxOutputTokens: 750,
    purpose: "Compliance, document controls, and approval-gate review.",
  },
  marketing: {
    key: "marketing",
    preferredModel: "gpt-5.6-luna",
    environmentKey: "OPENAI_EXPORTUNITY_MARKETING_MODEL",
    reasoningEffort: "low",
    maxOutputTokens: 550,
    purpose: "Verified B2B messaging and content drafting.",
  },
};

function configuredValue(key: string) {
  const value = String(process.env[key] || "").trim();
  return value || null;
}

export function getExportunityAgentModelPolicy(agentKey: ExportunityAgentKey): ExportunityAgentModelPolicy {
  const definition = AGENT_MODEL_DEFINITIONS[agentKey];
  const agentOverride = configuredValue(definition.environmentKey);
  if (agentOverride) return { ...definition, model: agentOverride, source: "agent_override" };

  const tenantOverride = configuredValue("OPENAI_EXPORTUNITY_MODEL");
  if (tenantOverride) return { ...definition, model: tenantOverride, source: "tenant_override" };

  if (agentKey === "tassi") {
    const legacyOverride =
      configuredValue("OPENAI_INDUSTRIAL_INTAKE_MODEL") ||
      configuredValue("OPENAI_MODEL_FAST") ||
      configuredValue("OPENAI_MODEL");
    if (legacyOverride) return { ...definition, model: legacyOverride, source: "legacy_override" };
  }

  return { ...definition, model: definition.preferredModel, source: "default" };
}

export function listExportunityAgentModelPolicies() {
  return (Object.keys(AGENT_MODEL_DEFINITIONS) as ExportunityAgentKey[]).map((agentKey) =>
    getExportunityAgentModelPolicy(agentKey),
  );
}
