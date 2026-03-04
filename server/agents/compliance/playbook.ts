import type { AgentPlaybook } from "../types";

export const playbook: AgentPlaybook = {
  agent: "compliance",
  allowedActions: ["compliance.kyc.checklist", "template.reply", "log"],
  defaultBudget: { usd: 5, maxCalls: 50, maxTokens: 0 },
  defaultTemplates: [
    {
      category: "kyc",
      language: "fr",
      templateText:
        "Checklist KYC:\n1) Pièce d'identité\n2) Preuve d'adresse\n3) Source des fonds\n4) Détails de la société (si applicable)\n5) Coordonnées + pays\nRépondez «KYC OK» quand prêt.",
      tags: ["kyc", "checklist"],
      intents: ["kyc"],
    },
    {
      category: "kyc",
      language: "en",
      templateText:
        "KYC checklist:\n1) Government ID\n2) Proof of address\n3) Source of funds\n4) Company docs (if applicable)\n5) Country + contact details\nReply “KYC OK” when ready.",
      tags: ["kyc", "checklist"],
      intents: ["kyc"],
    },
  ],
  cheapReply: { confidenceThreshold: 0.72 },
  escalation: { allowLlm: false },
  stopRules: { maxSteps: 10, maxMs: 45_000 },
};

export default playbook;

