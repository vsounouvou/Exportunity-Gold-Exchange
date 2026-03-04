import { nanoid } from "nanoid";
import { eq } from "drizzle-orm";
import { db } from "@db";
import { agentAuditLog, agentJobs } from "@db/schema";
import { sha256Json } from "./hash";

export type AgentOsAuditActionType =
  | "tool_call"
  | "llm_call"
  | "openai_call"
  | "memory_read"
  | "memory_write"
  | "template_render"
  | "router_decision"
  | "playbook_step";

export type AgentOsAuditStatus = "ok" | "error";

export type AgentOsTokenUsage = {
  provider?: string;
  model?: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  endpoint?: string;
};

export async function createAgentJob(params: {
  title: string;
  agentId?: number | null;
  companyId?: number | null;
  payload?: Record<string, unknown>;
}): Promise<string> {
  const jobId = nanoid();
  await db.insert(agentJobs).values({
    jobId,
    title: params.title,
    agentId: params.agentId ?? null,
    companyId: params.companyId ?? null,
    payload: params.payload ?? {},
    status: "queued",
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return jobId;
}

export async function updateAgentJob(jobId: string, updates: { status?: string; error?: string | null }) {
  await db
    .update(agentJobs)
    .set({
      ...(updates.status ? { status: updates.status as any } : {}),
      ...(updates.error !== undefined ? { error: updates.error } : {}),
      updatedAt: new Date(),
    })
    .where(eq(agentJobs.jobId, jobId));
}

export async function logAgentAuditEvent(params: {
  jobId: string;
  agentId?: number | null;
  actionType: AgentOsAuditActionType;
  status: AgentOsAuditStatus;
  inputs?: Record<string, unknown> | null;
  outputs?: Record<string, unknown> | null;
  outputsRef?: string | null;
  error?: string | null;
  latencyMs?: number | null;
  tokenUsage?: AgentOsTokenUsage | null;
}) {
  const inputs = params.inputs ?? null;
  const inputsHash = inputs ? sha256Json(inputs) : null;

  await db.insert(agentAuditLog).values({
    jobId: params.jobId,
    agentId: params.agentId ?? null,
    actionType: params.actionType,
    status: params.status,
    inputsHash,
    inputs,
    outputs: params.outputs ?? null,
    outputsRef: params.outputsRef ?? null,
    error: params.error ?? null,
    latencyMs: params.latencyMs ?? null,
    tokenUsage: params.tokenUsage ?? null,
    createdAt: new Date(),
  });
}
