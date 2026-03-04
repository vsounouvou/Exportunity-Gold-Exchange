import type { AgentPlaybook } from "../types";

export const playbook: AgentPlaybook = {
  agent: "data",
  allowedActions: ["data.admin.ia.audit", "log"],
  defaultBudget: { usd: 5, maxCalls: 50, maxTokens: 0 },
  defaultTemplates: [],
  cheapReply: { confidenceThreshold: 0.72 },
  escalation: { allowLlm: false },
  stopRules: { maxSteps: 12, maxMs: 45_000 },
};

export default playbook;

