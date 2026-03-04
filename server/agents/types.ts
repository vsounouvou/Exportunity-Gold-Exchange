export type AgentKey = "marketing" | "client_hunter" | "media" | "ops" | "compliance" | "data" | "seo_autopilot";

export type AgentRunStatus = "idle" | "running" | "error";

export type AgentBudget = {
  usd: number;
  maxCalls: number;
  maxTokens?: number;
};

export type AgentPlaybook = {
  agent: AgentKey;
  allowedActions: string[];
  defaultBudget: AgentBudget;
  defaultTemplates: Array<{
    category: string;
    language: string;
    templateText: string;
    tags?: string[];
    intents?: string[];
  }>;
  cheapReply: {
    confidenceThreshold: number;
  };
  escalation: {
    allowLlm: boolean;
  };
  stopRules: {
    maxSteps: number;
    maxMs: number;
  };
};
