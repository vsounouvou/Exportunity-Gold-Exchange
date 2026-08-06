export type ChairmanAssistantIdentity = {
  name: string;
  role: string;
  capabilities: string[];
  organizationKey: string;
};

const DEFAULT_IDENTITY: ChairmanAssistantIdentity = {
  name: "Tassi Hangbe",
  role: "CHAIRMAN_ASSISTANT",
  capabilities: ["chairman_console", "assistant"],
  organizationKey: "chairman-assistant",
};

const EXPORTUNITY_IDENTITY: ChairmanAssistantIdentity = {
  name: "Fenou",
  role: "Operations and Task Assistant",
  capabilities: [
    "chairman_console",
    "assistant",
    "meeting_support",
    "task_orchestration",
    "decision_support",
    "action_routing",
    "document_analysis",
  ],
  organizationKey: "fenou",
};

export function getChairmanAssistantIdentity(tenantKey: unknown): ChairmanAssistantIdentity {
  return String(tenantKey || "").trim().toLowerCase() === "exportunity"
    ? EXPORTUNITY_IDENTITY
    : DEFAULT_IDENTITY;
}
