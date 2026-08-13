import type { AgentPolicy } from "./registry";
import { getAgentPolicy } from "./registry";
import { createAgentJob, logAgentAuditEvent, updateAgentJob } from "./audit";
import { searchClues, addClue } from "./memory";
import { ensurePlaybook, runPlaybook } from "./playbooks";
import { findApprovedTemplate, renderTemplate } from "./templates";
import { runTool } from "./tools";
import { generateText } from "./llm-gateway";
import { db } from "@db";
import { templates } from "@db/schema";
import { eq } from "drizzle-orm";

export type RouterDecisionKind = "memory" | "playbook" | "template" | "rules" | "llm";

export type RouterDecision = {
  decision: RouterDecisionKind;
  reason: string;
  estimatedTokensSaved: number;
  selectedResources: {
    clueIds?: number[];
    templateId?: number;
    playbookId?: number;
  };
};

export function allowsDirectMemoryAnswer(intent: string | null | undefined) {
  return String(intent || "").trim() !== "industrial_opportunity_workstream";
}

function simpleIntent(task: string): string | null {
  const t = task.toLowerCase();
  if (t.includes("find leads") || t.includes("client hunter") || t.includes("prospect")) return "client_hunter";
  if (t.includes("kyc") || t.includes("compliance")) return "kyc_checklist";
  if (t.includes("dispute") || t.includes("complaint")) return "dispute_triage";
  return null;
}

function isSimpleRule(task: string) {
  const t = task.trim().toLowerCase();
  return t === "ping" || t === "health" || t === "status" || t === "help";
}

function ruleAnswer(task: string) {
  const t = task.trim().toLowerCase();
  if (t === "ping") return "pong";
  if (t === "health") return "ok";
  if (t === "status") return "ready";
  return "Tell me what you want to do (e.g., create outreach, run Client Hunter, search memory).";
}

async function decide(params: {
  jobId: string;
  policy: AgentPolicy;
  task: string;
  intent?: string | null;
  companyId?: number | null;
  entityId?: string | null;
  channel?: "email" | "whatsapp" | "linkedin" | "in_app" | null;
  useCase?: string | null;
  language?: string | null;
}): Promise<RouterDecision> {
  const keywordMemory = await searchClues({
    jobId: params.jobId,
    policy: params.policy,
    query: params.task,
    entityId: params.entityId ?? null,
    limit: 5,
    useEmbeddings: false,
  });

  const topKeyword = keywordMemory[0];
  if (
    allowsDirectMemoryAnswer(params.intent) &&
    topKeyword &&
    topKeyword.score >= 0.75
  ) {
    return {
      decision: "memory",
      reason: "High-confidence match found in memory",
      estimatedTokensSaved: 500,
      selectedResources: { clueIds: keywordMemory.map((s) => s.clue.clueId) },
    };
  }

  const resolvedIntent = params.intent ?? simpleIntent(params.task);
  if (resolvedIntent === "client_hunter") {
    return {
      decision: "playbook",
      reason: "Matched playbook: Client Hunter",
      estimatedTokensSaved: 800,
      selectedResources: {},
    };
  }

  if (params.useCase && params.channel && params.language) {
    const template = await findApprovedTemplate({
      companyId: params.policy.companyId,
      useCase: params.useCase,
      channel: params.channel,
      language: params.language,
    });
    if (template) {
      return {
        decision: "template",
        reason: "Approved template available",
        estimatedTokensSaved: 650,
        selectedResources: { templateId: template.templateId },
      };
    }
  }

  if (isSimpleRule(params.task)) {
    return {
      decision: "rules",
      reason: "Deterministic rule match",
      estimatedTokensSaved: 700,
      selectedResources: {},
    };
  }

  return {
    decision: "llm",
    reason: "No confident memory/playbook/template/rules match",
    estimatedTokensSaved: 0,
    selectedResources: {},
  };
}

export async function runAgentTask(params: {
  jobId?: string | null;
  agentId: number;
  companyId?: number | null;
  task: string;
  intent?: string | null;
  entityId?: string | null;
  channel?: "email" | "whatsapp" | "linkedin" | "in_app" | null;
  useCase?: string | null;
  language?: string | null;
  vars?: Record<string, unknown>;
  to?: string | null;
  conversationId?: string | null;
  correlationId?: string | null;
}): Promise<{
  jobId: string;
  decision: RouterDecision;
  output: Record<string, unknown>;
}> {
  const jobId =
    params.jobId ??
    (await createAgentJob({
      title:
        params.intent === "industrial_opportunity_workstream"
          ? "Industrial opportunity workstream"
          : "AgentOS Task",
      agentId: params.agentId,
      companyId: params.companyId ?? null,
      payload: {
        task: params.task,
        intent: params.intent ?? null,
        entityId: params.entityId ?? null,
        channel: params.channel ?? null,
        useCase: params.useCase ?? null,
        conversationId: params.conversationId ?? null,
        correlationId: params.correlationId ?? null,
      },
    }));

  const policy = await getAgentPolicy(params.agentId);
  await updateAgentJob(jobId, { status: "running" });

  const decision = await decide({
    jobId,
    policy,
    task: params.task,
    intent: params.intent ?? null,
    companyId: params.companyId ?? null,
    entityId: params.entityId ?? null,
    channel: params.channel ?? null,
    useCase: params.useCase ?? null,
    language: params.language ?? null,
  });

  await logAgentAuditEvent({
    jobId,
    agentId: policy.agentId,
    actionType: "router_decision",
    status: "ok",
    inputs: { task: params.task, intent: params.intent ?? null },
    outputs: decision as any,
  });

  try {
    if (decision.decision === "rules") {
      const message = ruleAnswer(params.task);
      await updateAgentJob(jobId, { status: "succeeded" });
      return { jobId, decision, output: { message } };
    }

    if (decision.decision === "memory") {
      const results = await searchClues({
        jobId,
        policy,
        query: params.task,
        entityId: params.entityId ?? null,
        limit: 5,
        useEmbeddings: false,
      });
      const top = results[0];
      await updateAgentJob(jobId, { status: "succeeded" });
      return {
        jobId,
        decision,
        output: {
          message: top ? top.clue.content : "No memory found.",
          clues: results.map((r) => ({ clueId: r.clue.clueId, score: r.score, type: r.clue.type })),
        },
      };
    }

    if (decision.decision === "template") {
      const template = decision.selectedResources.templateId
        ? await dbTemplateById(decision.selectedResources.templateId)
        : null;
      if (!template) throw new Error("Template not found");

      const rendered = await renderTemplate({
        jobId,
        policy,
        template,
        vars: params.vars ?? {},
      });

      const sent = await runTool({
        jobId,
        policy,
        name: "send_message",
        payload: {
          channel: params.channel ?? template.channel,
          to: params.to ?? null,
          subject: rendered.subject,
          content: rendered.body,
        },
      });

      await updateAgentJob(jobId, { status: "succeeded" });
      return { jobId, decision, output: { rendered, sent } };
    }

    if (decision.decision === "playbook") {
      const playbookCompanyId = params.companyId ?? policy.companyId;
      if (!playbookCompanyId) throw new Error("companyId required to run playbooks");
      const playbookId = await ensurePlaybook({
        companyId: playbookCompanyId,
        departmentId: policy.departmentId,
        name: "Client Hunter (Sales/Marketing)",
        description: "Lead discovery + outreach via templates (LLM-last).",
        steps: [
          { stepOrder: 1, type: "tool_call", config: { toolName: "create_lead", inputKey: "lead" } },
          { stepOrder: 2, type: "template_send", config: { useCase: "outreach", channel: "email", language: params.language ?? "en", toKey: "to", varsKey: "vars" } },
          { stepOrder: 3, type: "memory_write", config: { scope: "department", type: "metric", tags: ["client_hunter", "outreach"], embed: false } },
        ],
      });

      const result = await runPlaybook({
        jobId,
        policy,
        playbookId,
        inputs: {
          lead: (params.vars as any)?.lead ?? {},
          to: params.to ?? null,
          vars: params.vars ?? {},
        },
      });

      await updateAgentJob(jobId, { status: result.status });
      return { jobId, decision: { ...decision, selectedResources: { playbookId } }, output: result as any };
    }

    const memory = await searchClues({
      jobId,
      policy,
      query: params.task,
      entityId: params.entityId ?? null,
      limit: 6,
      useEmbeddings: true,
    });

    const memorySnippets = memory
      .slice(0, 4)
      .map((m) => `- (${m.clue.type}) ${m.clue.content}`)
      .join("\n");

    const industrialWorkstream =
      params.intent === "industrial_opportunity_workstream";
    const response = await generateText({
      jobId,
      policy,
      purpose: industrialWorkstream
        ? "industrial_opportunity_workstream"
        : "router_hard_case",
      taskKey: industrialWorkstream
        ? `industrial-opportunity:${params.entityId || jobId}`
        : undefined,
      conversationId: params.conversationId || null,
      correlationId: params.correlationId || jobId,
      messages: [
        {
          role: "system",
          content: industrialWorkstream
            ? `You are an accountable Exportunity employee executing one internal commercial-opportunity workstream. The canonical case in the user message is authoritative. Use memory only when it is directly relevant and never substitute cached content for the current case. Do not invent suppliers, prices, inventory, certifications, completed checks, or external actions. Do not contact anyone, move money, accept terms, or make commitments. Separate evidence, missing facts, risks, and proposed approval-gated next actions.\n\nSUPPORTING MEMORY:\n${memorySnippets || "(none)"}`
            : `You are an internal AgentOS helper.\n\nUse the memory if relevant. Be concise and actionable.\n\nMEMORY:\n${memorySnippets || "(none)"}`,
        },
        { role: "user", content: params.task },
      ],
      maxTokens: 400,
      temperature: 0.2,
    });

    const clueId = await addClue({
      jobId,
      policy,
      scope: industrialWorkstream ? "entity" : "personal",
      type: "note",
      content: response.text.slice(0, 600),
      entityId: industrialWorkstream ? params.entityId ?? null : null,
      tags: industrialWorkstream
        ? ["industrial_opportunity", "workstream_review"]
        : ["router_cache"],
      confidence: industrialWorkstream ? 0.75 : 0.6,
      embed: true,
    });

    await updateAgentJob(jobId, { status: "succeeded" });
    return { jobId, decision, output: { message: response.text, clueId, provider: response.provider, model: response.model } };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    await updateAgentJob(jobId, { status: "escalated", error: errMsg });
    await logAgentAuditEvent({
      jobId,
      agentId: policy.agentId,
      actionType: "router_decision",
      status: "error",
      inputs: { task: params.task },
      error: errMsg,
    });
    return {
      jobId,
      decision,
      output: { error: errMsg, message: "Temporarily unavailable; job escalated for review." },
    };
  }
}

async function dbTemplateById(templateId: number) {
  const rows = await db.select().from(templates).where(eq(templates.templateId, templateId)).limit(1);
  return rows[0] ?? null;
}
