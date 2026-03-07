export type ModelTier = "TIER_LOCAL_TINY" | "TIER_LOCAL_GPU" | "TIER_EXTERNAL";
export type ModelProvider = "llama_cpp" | "vllm" | "openai" | "anthropic";

export type GatewayRole = "system" | "user" | "assistant" | "tool";

export type GatewayMessage = {
  role: GatewayRole;
  content: string;
  name?: string;
  tool_call_id?: string;
};

export type GatewayToolSchema = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

export type GatewayToolCall = {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  allowed: boolean;
  status: "pending" | "rejected" | "executed" | "failed";
  result?: unknown;
  error?: string;
};

export type GatewayUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
};

export type GatewayChatRequest = {
  tenantId: number;
  agentId: number;
  sessionId?: string;
  workspace?: string;
  domain?: string;
  messages: GatewayMessage[];
  toolsAllowed?: string[];
  responseFormat?: Record<string, unknown> | null;
  budget?: {
    maxTokens?: number;
    maxCostUsd?: number;
  } | null;
  preferredModelTier?: ModelTier;
  forceExternal?: boolean;
};

export type GatewayChatResponse = {
  message: string;
  toolCalls: GatewayToolCall[];
  usage: GatewayUsage;
  model: {
    id: number | null;
    name: string;
    tier: ModelTier;
    provider: ModelProvider;
  };
  latencyMs: number;
  traceId: string;
  degraded?: boolean;
};

export type ProviderChatRequest = {
  traceId: string;
  messages: GatewayMessage[];
  tools: GatewayToolSchema[];
  responseFormat?: Record<string, unknown> | null;
  maxTokens: number;
};

export type ProviderChatResponse = {
  message: string;
  toolCalls: Array<{
    id: string;
    name: string;
    arguments: Record<string, unknown>;
  }>;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
};

export type CandidateModel = {
  id: number | null;
  name: string;
  tier: ModelTier;
  provider: ModelProvider;
  baseModel: string;
  endpointUrl: string | null;
  contextLen: number;
  tenantScope: number | null;
};
