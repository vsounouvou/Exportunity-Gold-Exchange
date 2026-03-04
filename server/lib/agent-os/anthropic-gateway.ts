import Anthropic from "@anthropic-ai/sdk";
import { assertAiEnabled } from "../ai-consent";
import { LlmPolicyError } from "./errors";
import type { AgentPolicy } from "./registry";
import { logAgentAuditEvent } from "./audit";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

function getClient(): Anthropic {
  assertAiEnabled({
    what: "Call Anthropic from AgentOS",
    why: "This calls Anthropic for chat generation.",
    forHowLong: "For this request only.",
    resources: ["External Anthropic API calls", "Compute/network usage"],
  });

  const apiKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
  const baseURL = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY (or AI_INTEGRATIONS_ANTHROPIC_API_KEY) must be set");
  }

  return new Anthropic({
    apiKey,
    ...(baseURL ? { baseURL } : {}),
  });
}

function assertModelAllowed(policy: AgentPolicy, model: string) {
  const allowed = policy.anthropicPolicy?.allowedModels ?? [];
  if (!allowed.length || allowed.includes(model)) return;
  throw new LlmPolicyError(`Model not allowed for agent ${policy.agentId}: ${model}`);
}

function splitSystemMessages(messages: ChatMessage[]) {
  const system = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n")
    .trim();

  const userAssistant = messages.filter((m) => m.role !== "system") as Array<{
    role: "user" | "assistant";
    content: string;
  }>;

  return { system: system || undefined, messages: userAssistant };
}

function extractText(response: Anthropic.Messages.Message) {
  return (response.content || [])
    .filter((block) => block.type === "text")
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("")
    .trim();
}

export async function generateText(params: {
  jobId: string;
  policy: AgentPolicy;
  messages: ChatMessage[];
  model: string;
  maxTokens?: number;
  temperature?: number;
  purpose?: string;
}): Promise<{ text: string; usage?: { promptTokens: number; completionTokens: number; totalTokens: number } }> {
  const client = getClient();
  assertModelAllowed(params.policy, params.model);

  const maxTokens = Math.min(params.maxTokens ?? 600, params.policy.anthropicPolicy?.maxTokens ?? 800);
  const temperature = Math.min(params.temperature ?? params.policy.anthropicPolicy?.temperature ?? 0.3, 1);

  const startedAt = Date.now();
  try {
    const split = splitSystemMessages(params.messages);
    const response = await client.messages.create(
      {
        model: params.model,
        max_tokens: maxTokens,
        temperature,
        ...(split.system ? { system: split.system } : {}),
        messages: split.messages.map((m) => ({ role: m.role, content: m.content })),
      },
      { timeout: params.policy.anthropicPolicy?.timeoutMs ?? 25_000 },
    );

    const text = extractText(response);
    const usage = response.usage
      ? {
          promptTokens: response.usage.input_tokens,
          completionTokens: response.usage.output_tokens,
          totalTokens: response.usage.input_tokens + response.usage.output_tokens,
        }
      : undefined;

    await logAgentAuditEvent({
      jobId: params.jobId,
      agentId: params.policy.agentId,
      actionType: "llm_call",
      status: "ok",
      inputs: { kind: "chat", provider: "anthropic", model: params.model, purpose: params.purpose ?? null, maxTokens, temperature },
      outputs: { length: text.length },
      latencyMs: Date.now() - startedAt,
      tokenUsage: usage
        ? {
            provider: "anthropic",
            model: params.model,
            promptTokens: usage.promptTokens,
            completionTokens: usage.completionTokens,
            totalTokens: usage.totalTokens,
            endpoint: "messages",
          }
        : { provider: "anthropic", model: params.model, endpoint: "messages" },
    });

    return { text, usage };
  } catch (error) {
    await logAgentAuditEvent({
      jobId: params.jobId,
      agentId: params.policy.agentId,
      actionType: "llm_call",
      status: "error",
      inputs: { kind: "chat", provider: "anthropic", model: params.model, purpose: params.purpose ?? null, maxTokens, temperature },
      error: error instanceof Error ? error.message : String(error),
      latencyMs: Date.now() - startedAt,
      tokenUsage: { provider: "anthropic", model: params.model, endpoint: "messages" },
    });
    throw error;
  }
}

