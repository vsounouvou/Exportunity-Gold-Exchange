import type { AgentPlaybook } from "../types";

export const playbook: AgentPlaybook = {
  agent: "ops",
  allowedActions: ["territory.audit.kpis", "territory.audit.navigation", "log"],
  defaultBudget: { usd: 5, maxCalls: 50, maxTokens: 0 },
  defaultTemplates: [],
  cheapReply: { confidenceThreshold: 0.72 },
  escalation: { allowLlm: false },
  stopRules: { maxSteps: 16, maxMs: 60_000 },
};

export default playbook;

