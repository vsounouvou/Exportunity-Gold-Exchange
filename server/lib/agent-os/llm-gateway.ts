import type { AgentPolicy } from "./registry";
import type { ChatMessage } from "./anthropic-gateway";
import { generateText as generateAnthropicText } from "./anthropic-gateway";
import { generateText as generateOpenAiText } from "./openai-gateway";

export type LlmProvider = "openai" | "anthropic";
export type LlmTier = "fast" | "balanced" | "quality";

function isAiConsentError(error: unknown): boolean {
  return (
    !!error &&
    typeof error === "object" &&
    (error as any).name === "AiConsentRequiredError" &&
    typeof (error as any).status === "number" &&
    !!(error as any).plan
  );
}

function isChatModel(model: string) {
  return !model.startsWith("text-embedding");
}

function pickAllowedModel(params: { allowedModels: string[]; desired: string; fallback: string; filter?: (m: string) => boolean }) {
  const allowed = params.allowedModels.filter((m) => (params.filter ? params.filter(m) : true));
  if (!allowed.length) return params.desired;
  if (allowed.includes(params.desired)) return params.desired;
  if (allowed.includes(params.fallback)) return params.fallback;
  return allowed[0];
}

function computeTier(policy: AgentPolicy): LlmTier {
  const roleLevel = policy.roleLevel ?? 1;
  const authority = policy.decisionAuthority ?? "low";

  if (authority === "executive") return "quality";
  if (authority === "high") return roleLevel >= 4 ? "quality" : "balanced";
  if (authority === "medium") return roleLevel >= 3 ? "balanced" : "fast";
  return "fast";
}

function pickOpenAiModel(policy: AgentPolicy, tier: LlmTier) {
  const desired =
    tier === "quality"
      ? process.env.OPENAI_MODEL_QUALITY ?? process.env.OPENAI_MODEL ?? "gpt-4.1"
      : tier === "balanced"
        ? process.env.OPENAI_MODEL_BALANCED ?? process.env.OPENAI_MODEL ?? "gpt-4o"
        : process.env.OPENAI_MODEL_FAST ?? process.env.OPENAI_MODEL ?? "gpt-4o-mini";

  return pickAllowedModel({
    allowedModels: policy.openaiPolicy.allowedModels,
    desired,
    fallback: "gpt-4o-mini",
    filter: isChatModel,
  });
}

function pickAnthropicModel(policy: AgentPolicy, tier: LlmTier) {
  const base =
    process.env.AI_INTEGRATIONS_ANTHROPIC_MODEL ??
    process.env.ANTHROPIC_MODEL ??
    "claude-sonnet-4-5";

  const desired =
    tier === "quality"
      ? process.env.ANTHROPIC_MODEL_QUALITY ?? base
      : tier === "balanced"
        ? process.env.ANTHROPIC_MODEL_BALANCED ?? base
        : process.env.ANTHROPIC_MODEL_FAST ?? base;

  const allowed = policy.anthropicPolicy?.allowedModels ?? [];
  if (!allowed.length) return desired;
  if (allowed.includes(desired)) return desired;
  return allowed[0];
}

export async function generateText(params: {
  jobId: string;
  policy: AgentPolicy;
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  purpose?: string;
}): Promise<{
  text: string;
  provider: LlmProvider;
  model: string;
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
}> {
  const tier = computeTier(params.policy);

  const openaiConfigured = !!process.env.OPENAI_API_KEY;
  const anthropicConfigured = !!(process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY);

  const errors: Record<string, string> = {};

  if (openaiConfigured) {
    const model = pickOpenAiModel(params.policy, tier);
    try {
      const response = await generateOpenAiText({
        jobId: params.jobId,
        policy: params.policy,
        messages: params.messages,
        model,
        maxTokens: params.maxTokens,
        temperature: params.temperature,
        purpose: params.purpose,
      });
      return { text: response.text, provider: "openai", model, usage: response.usage };
    } catch (error) {
      if (isAiConsentError(error)) throw error;
      errors.openai = error instanceof Error ? error.message : String(error);
    }
  }

  if (anthropicConfigured) {
    const model = pickAnthropicModel(params.policy, tier);
    try {
      const response = await generateAnthropicText({
        jobId: params.jobId,
        policy: params.policy,
        messages: params.messages,
        model,
        maxTokens: params.maxTokens,
        temperature: params.temperature,
        purpose: params.purpose,
      });
      return { text: response.text, provider: "anthropic", model, usage: response.usage };
    } catch (error) {
      if (isAiConsentError(error)) throw error;
      errors.anthropic = error instanceof Error ? error.message : String(error);
    }
  }

  if (!openaiConfigured && !anthropicConfigured) {
    throw new Error("No LLM provider configured. Set OPENAI_API_KEY or ANTHROPIC_API_KEY.");
  }

  throw new Error(
    `All LLM providers failed: ${Object.entries(errors)
      .map(([provider, message]) => `${provider}: ${message}`)
      .join(", ")}`,
  );
}
