import type { AgentPlaybook } from "../types";

export const playbook: AgentPlaybook = {
  agent: "marketing",
  allowedActions: ["marketing.plan.draft", "template.reply", "log"],
  defaultBudget: { usd: 5, maxCalls: 50, maxTokens: 0 },
  defaultTemplates: [
    {
      category: "follow_up",
      language: "fr",
      templateText:
        "Bonjour, je reviens vers vous. Souhaitez-vous recevoir une offre et les prochaines étapes (quantité, lieu, délai) ?",
      tags: ["follow_up", "short"],
      intents: ["follow_up"],
    },
  ],
  cheapReply: { confidenceThreshold: 0.72 },
  escalation: { allowLlm: false },
  stopRules: { maxSteps: 12, maxMs: 45_000 },
};

export default playbook;

