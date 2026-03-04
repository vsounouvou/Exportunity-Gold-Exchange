import type { AgentPlaybook } from "../types";

export const playbook: AgentPlaybook = {
  agent: "seo_autopilot",
  allowedActions: ["seo.snapshot.scan", "seo.recommendations.generate", "seo.patches.apply_safe", "log"],
  defaultBudget: { usd: 0, maxCalls: 250, maxTokens: 0 },
  defaultTemplates: [],
  cheapReply: { confidenceThreshold: 0.75 },
  escalation: { allowLlm: false },
  stopRules: { maxSteps: 20, maxMs: 90_000 },
};

export default playbook;

