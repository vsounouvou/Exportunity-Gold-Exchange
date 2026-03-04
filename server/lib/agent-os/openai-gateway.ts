import OpenAI from "openai";
import { assertAiEnabled } from "../ai-consent";
import { OpenAiPolicyError } from "./errors";
import type { AgentPolicy } from "./registry";
import { logAgentAuditEvent } from "./audit";

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

function getClient(): OpenAI {
  assertAiEnabled({
    what: "Call OpenAI from AgentOS",
    why: "This calls OpenAI for chat or embeddings.",
    forHowLong: "For this request only.",
    resources: ["External OpenAI API calls", "Compute/network usage"],
  });

  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY environment variable must be set");
  }

  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

function assertModelAllowed(policy: AgentPolicy, model: string) {
  if (policy.openaiPolicy.allowedModels.includes(model)) return;
  throw new OpenAiPolicyError(`Model not allowed for agent ${policy.agentId}: ${model}`);
}

export async function embedText(params: {
  jobId: string;
  policy: AgentPolicy;
  input: string;
  model?: string;
  purpose?: string;
}): Promise<{ embedding: number[]; usage?: { promptTokens: number; totalTokens: number } }> {
  const client = getClient();
  const model = params.model ?? "text-embedding-3-small";
  assertModelAllowed(params.policy, model);

  const startedAt = Date.now();
  try {
    const response = await client.embeddings.create(
      {
        model,
        input: params.input,
      },
      { timeout: params.policy.openaiPolicy.timeoutMs },
    );

    const embedding = response.data[0]?.embedding;
    if (!embedding) throw new Error("Missing embedding in response");

    const usage = response.usage
      ? { promptTokens: response.usage.prompt_tokens, totalTokens: response.usage.total_tokens }
      : undefined;

    await logAgentAuditEvent({
      jobId: params.jobId,
      agentId: params.policy.agentId,
      actionType: "llm_call",
      status: "ok",
      inputs: { kind: "embeddings", model, purpose: params.purpose ?? null },
      outputs: { vectorSize: embedding.length },
      latencyMs: Date.now() - startedAt,
      tokenUsage: usage
        ? { provider: "openai", model, promptTokens: usage.promptTokens, totalTokens: usage.totalTokens, endpoint: "embeddings" }
        : { provider: "openai", model, endpoint: "embeddings" },
    });

    return { embedding, usage };
  } catch (error) {
    await logAgentAuditEvent({
      jobId: params.jobId,
      agentId: params.policy.agentId,
      actionType: "llm_call",
      status: "error",
      inputs: { kind: "embeddings", model, purpose: params.purpose ?? null },
      error: error instanceof Error ? error.message : String(error),
      latencyMs: Date.now() - startedAt,
      tokenUsage: { provider: "openai", model, endpoint: "embeddings" },
    });
    throw error;
  }
}

export async function generateText(params: {
  jobId: string;
  policy: AgentPolicy;
  messages: ChatMessage[];
  model?: string;
  maxTokens?: number;
  temperature?: number;
  purpose?: string;
}): Promise<{ text: string; usage?: { promptTokens: number; completionTokens: number; totalTokens: number } }> {
  const client = getClient();
  const model = params.model ?? "gpt-4o-mini";
  assertModelAllowed(params.policy, model);

  const maxTokens = Math.min(params.maxTokens ?? 600, params.policy.openaiPolicy.maxTokens);
  const temperature = Math.min(params.temperature ?? params.policy.openaiPolicy.temperature, 1);

  const startedAt = Date.now();
  try {
    const response = await client.chat.completions.create(
      {
        model,
        messages: params.messages,
        temperature,
        max_tokens: maxTokens,
      },
      { timeout: params.policy.openaiPolicy.timeoutMs },
    );

    const text = response.choices[0]?.message?.content ?? "";
    const usage = response.usage
      ? {
          promptTokens: response.usage.prompt_tokens,
          completionTokens: response.usage.completion_tokens,
          totalTokens: response.usage.total_tokens,
        }
      : undefined;

    await logAgentAuditEvent({
      jobId: params.jobId,
      agentId: params.policy.agentId,
      actionType: "llm_call",
      status: "ok",
      inputs: { kind: "chat", model, purpose: params.purpose ?? null, maxTokens, temperature },
      outputs: { length: text.length },
      latencyMs: Date.now() - startedAt,
      tokenUsage: usage
        ? {
            provider: "openai",
            model,
            promptTokens: usage.promptTokens,
            completionTokens: usage.completionTokens,
            totalTokens: usage.totalTokens,
            endpoint: "chat.completions",
          }
        : { provider: "openai", model, endpoint: "chat.completions" },
    });

    return { text, usage };
  } catch (error) {
    await logAgentAuditEvent({
      jobId: params.jobId,
      agentId: params.policy.agentId,
      actionType: "llm_call",
      status: "error",
      inputs: { kind: "chat", model, purpose: params.purpose ?? null, maxTokens, temperature },
      error: error instanceof Error ? error.message : String(error),
      latencyMs: Date.now() - startedAt,
      tokenUsage: { provider: "openai", model, endpoint: "chat.completions" },
    });
    throw error;
  }
}
