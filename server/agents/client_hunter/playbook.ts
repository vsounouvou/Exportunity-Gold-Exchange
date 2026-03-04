import type { AgentPlaybook } from "../types";

export const playbook: AgentPlaybook = {
  agent: "client_hunter",
  allowedActions: ["client_hunter.synthetic_leads", "template.reply", "log"],
  defaultBudget: { usd: 5, maxCalls: 50, maxTokens: 0 },
  defaultTemplates: [
    {
      category: "scheduling",
      language: "fr",
      templateText:
        "Pouvons-nous programmer un appel de 10 minutes ? Proposez 2 créneaux (heure locale) et votre pays/ville.",
      tags: ["scheduling", "short"],
      intents: ["schedule"],
    },
  ],
  cheapReply: { confidenceThreshold: 0.72 },
  escalation: { allowLlm: false },
  stopRules: { maxSteps: 12, maxMs: 45_000 },
};

export default playbook;

