import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import type { CandidateModel, GatewayToolSchema, ProviderChatRequest, ProviderChatResponse } from "./types";

export interface ModelProviderClient {
  execute(model: CandidateModel, request: ProviderChatRequest): Promise<ProviderChatResponse>;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const handle = setTimeout(() => reject(new Error(message)), timeoutMs);
    promise
      .then((result) => {
        clearTimeout(handle);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(handle);
        reject(error);
      });
  });
}

function normalizeUsage(payload: any) {
  const prompt = Number(payload?.usage?.prompt_tokens ?? payload?.usage?.input_tokens ?? 0);
  const completion = Number(payload?.usage?.completion_tokens ?? payload?.usage?.output_tokens ?? 0);
  const total = Number(payload?.usage?.total_tokens ?? prompt + completion);
  return {
    inputTokens: Number.isFinite(prompt) ? Math.max(0, Math.trunc(prompt)) : 0,
    outputTokens: Number.isFinite(completion) ? Math.max(0, Math.trunc(completion)) : 0,
    totalTokens: Number.isFinite(total) ? Math.max(0, Math.trunc(total)) : 0,
  };
}

function normalizeToolCalls(raw: any[]): Array<{ id: string; name: string; arguments: Record<string, unknown> }> {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      const id = String(entry?.id || entry?.tool_use_id || "").trim();
      const name = String(entry?.function?.name || entry?.name || "").trim();
      const argsRaw = entry?.function?.arguments ?? entry?.input ?? "{}";
      let parsed: Record<string, unknown> = {};
      if (typeof argsRaw === "string") {
        try {
          const json = JSON.parse(argsRaw);
          if (json && typeof json === "object") parsed = json as Record<string, unknown>;
        } catch {
          parsed = {};
        }
      } else if (argsRaw && typeof argsRaw === "object") {
        parsed = argsRaw as Record<string, unknown>;
      }
      if (!name) return null;
      return {
        id: id || `${name}-${Date.now()}`,
        name,
        arguments: parsed,
      };
    })
    .filter((entry): entry is { id: string; name: string; arguments: Record<string, unknown> } => Boolean(entry));
}

function toOpenAiTools(tools: GatewayToolSchema[]) {
  return tools.map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

async function invokeOpenAiCompatible(
  endpointUrl: string,
  model: string,
  request: ProviderChatRequest,
  apiKey?: string | null,
): Promise<ProviderChatResponse> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (apiKey) headers.authorization = `Bearer ${apiKey}`;

  const response = await withTimeout(
    fetch(endpointUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        messages: request.messages.map((message) => ({
          role: message.role,
          content: message.content,
          ...(message.name ? { name: message.name } : {}),
          ...(message.tool_call_id ? { tool_call_id: message.tool_call_id } : {}),
        })),
        tools: request.tools.length ? toOpenAiTools(request.tools) : undefined,
        response_format: request.responseFormat || undefined,
        max_tokens: request.maxTokens,
      }),
    }),
    45_000,
    "provider_timeout",
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`provider_http_${response.status}:${body.slice(0, 500)}`);
  }

  const payload = await response.json();
  const choice = Array.isArray(payload?.choices) ? payload.choices[0] : null;
  const messageContent = choice?.message?.content;
  const text =
    typeof messageContent === "string"
      ? messageContent
      : Array.isArray(messageContent)
        ? messageContent.map((part: any) => String(part?.text || "")).join("\n")
        : "";

  return {
    message: text,
    toolCalls: normalizeToolCalls(choice?.message?.tool_calls || []),
    usage: normalizeUsage(payload),
  };
}

export class LlamaCppProvider implements ModelProviderClient {
  async execute(model: CandidateModel, request: ProviderChatRequest): Promise<ProviderChatResponse> {
    const endpoint = String(model.endpointUrl || process.env.MODEL_GATEWAY_LLAMA_CPP_ENDPOINT || "http://127.0.0.1:8080/v1/chat/completions");
    return invokeOpenAiCompatible(endpoint, model.baseModel, request, null);
  }
}

export class VllmProvider implements ModelProviderClient {
  async execute(model: CandidateModel, request: ProviderChatRequest): Promise<ProviderChatResponse> {
    const endpoint = String(model.endpointUrl || process.env.MODEL_GATEWAY_VLLM_ENDPOINT || "http://127.0.0.1:8000/v1/chat/completions");
    const apiKey = process.env.MODEL_GATEWAY_VLLM_API_KEY || process.env.VLLM_API_KEY || null;
    return invokeOpenAiCompatible(endpoint, model.baseModel, request, apiKey);
  }
}

export class ExternalProviderOpenAI implements ModelProviderClient {
  async execute(model: CandidateModel, request: ProviderChatRequest): Promise<ProviderChatResponse> {
    const apiKey = process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY || "";
    if (!apiKey) throw new Error("openai_not_configured");

    const client = new OpenAI({
      apiKey,
      baseURL: process.env.MODEL_GATEWAY_OPENAI_BASE_URL || process.env.OPENAI_BASE_URL || undefined,
    });

    const completion: any = await withTimeout(
      client.chat.completions.create(
        {
          model: model.baseModel || process.env.MODEL_GATEWAY_OPENAI_MODEL || "gpt-4.1-mini",
          messages: request.messages.map((message) => ({
            role: message.role,
            content: message.content,
            ...(message.name ? { name: message.name } : {}),
            ...(message.tool_call_id ? { tool_call_id: message.tool_call_id } : {}),
          })),
          tools: request.tools.length ? toOpenAiTools(request.tools) : undefined,
          response_format: request.responseFormat as any,
          max_tokens: request.maxTokens,
        } as any,
      ) as any,
      45_000,
      "openai_timeout",
    );

    const choice = completion.choices?.[0];
    const messageContent = (choice as any)?.message?.content;
    const text =
      typeof messageContent === "string"
        ? messageContent
        : Array.isArray(messageContent)
          ? messageContent.map((part: any) => String(part?.text || "")).join("\n")
          : "";

    return {
      message: text,
      toolCalls: normalizeToolCalls((choice as any)?.message?.tool_calls || []),
      usage: {
        inputTokens: Number(completion.usage?.prompt_tokens || 0),
        outputTokens: Number(completion.usage?.completion_tokens || 0),
        totalTokens: Number(completion.usage?.total_tokens || 0),
      },
    };
  }
}

export class ExternalProviderAnthropic implements ModelProviderClient {
  async execute(model: CandidateModel, request: ProviderChatRequest): Promise<ProviderChatResponse> {
    const apiKey = process.env.ANTHROPIC_API_KEY || process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY || "";
    if (!apiKey) throw new Error("anthropic_not_configured");

    const anthropic = new Anthropic({
      apiKey,
      ...(process.env.MODEL_GATEWAY_ANTHROPIC_BASE_URL || process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL
        ? { baseURL: process.env.MODEL_GATEWAY_ANTHROPIC_BASE_URL || process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL }
        : {}),
    });

    const systemMessages = request.messages.filter((message) => message.role === "system").map((message) => message.content);
    const chatMessages = request.messages
      .filter((message) => message.role !== "system")
      .map((message) => ({
        role: message.role === "assistant" ? "assistant" : "user",
        content: message.content,
      }));

    const message: any = await withTimeout(
      anthropic.messages.create(
        {
          model: model.baseModel || process.env.MODEL_GATEWAY_ANTHROPIC_MODEL || "claude-3-5-haiku-latest",
          max_tokens: request.maxTokens,
          system: systemMessages.join("\n\n").trim() || undefined,
          messages: chatMessages as any,
        } as any,
      ) as any,
      45_000,
      "anthropic_timeout",
    );

    const text = Array.isArray(message.content)
      ? message.content
          .filter((part: any) => part?.type === "text")
          .map((part: any) => String(part?.text || ""))
          .join("\n")
      : "";

    const toolCalls = Array.isArray(message.content)
      ? normalizeToolCalls(
          message.content
            .filter((part: any) => part?.type === "tool_use")
            .map((part: any) => ({ id: part.id, name: part.name, input: part.input })),
        )
      : [];

    return {
      message: text,
      toolCalls,
      usage: {
        inputTokens: Number((message as any)?.usage?.input_tokens || 0),
        outputTokens: Number((message as any)?.usage?.output_tokens || 0),
        totalTokens: Number((message as any)?.usage?.input_tokens || 0) + Number((message as any)?.usage?.output_tokens || 0),
      },
    };
  }
}
