import { and, asc, eq } from "drizzle-orm";
import { db } from "@db";
import { playbooks, playbookSteps } from "@db/schema";
import type { AgentPolicy } from "./registry";
import { logAgentAuditEvent, updateAgentJob } from "./audit";
import { runTool } from "./tools";
import { addClue } from "./memory";
import { findApprovedTemplate, renderTemplate } from "./templates";
import { generateText } from "./llm-gateway";

type StepRow = typeof playbookSteps.$inferSelect;

export async function ensurePlaybook(params: {
  companyId: number;
  departmentId?: number | null;
  name: string;
  description?: string | null;
  steps: Array<{
    stepOrder: number;
    type: StepRow["type"];
    config?: Record<string, unknown>;
    retryPolicy?: Record<string, unknown>;
    onFail?: Record<string, unknown>;
  }>;
}): Promise<number> {
  const playbook = await db.query.playbooks.findFirst({
    where: and(eq(playbooks.companyId, params.companyId), eq(playbooks.name, params.name)),
    orderBy: asc(playbooks.playbookId),
  });

  const playbookId =
    playbook?.playbookId ??
    (
      await db
        .insert(playbooks)
        .values({
          companyId: params.companyId,
          departmentId: params.departmentId ?? null,
          name: params.name,
          description: params.description ?? null,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning({ id: playbooks.playbookId })
    )[0].id;

  const existingSteps = await db
    .select()
    .from(playbookSteps)
    .where(eq(playbookSteps.playbookId, playbookId));

  if (!existingSteps.length) {
    await db.insert(playbookSteps).values(
      params.steps.map((s) => ({
        playbookId,
        stepOrder: s.stepOrder,
        type: s.type,
        config: s.config ?? {},
        retryPolicy: s.retryPolicy ?? {},
        onFail: s.onFail ?? {},
        inputsSchema: {},
        outputsSchema: {},
        conditions: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
    );
  }

  return playbookId;
}

export async function runPlaybook(params: {
  jobId: string;
  policy: AgentPolicy;
  playbookId: number;
  inputs: Record<string, unknown>;
}) {
  const steps = await db
    .select()
    .from(playbookSteps)
    .where(eq(playbookSteps.playbookId, params.playbookId))
    .orderBy(asc(playbookSteps.stepOrder));

  const state: Record<string, unknown> = { inputs: params.inputs };

  await updateAgentJob(params.jobId, { status: "running" });

  for (const step of steps) {
    const startedAt = Date.now();
    const config = (step.config as any) ?? {};

    const retries = typeof (step.retryPolicy as any)?.retries === "number" ? (step.retryPolicy as any).retries : 0;
    let attempt = 0;

    while (true) {
      attempt += 1;
      try {
        let output: Record<string, unknown> = {};

        if (step.type === "tool_call") {
          const toolName = String(config.toolName ?? "");
          const inputKey = typeof config.inputKey === "string" ? config.inputKey : null;
          const payload =
            inputKey && typeof (params.inputs as any)?.[inputKey] === "object"
              ? ((params.inputs as any)[inputKey] as Record<string, unknown>)
              : ((config.payload as any) ?? {});

          output = await runTool({
            jobId: params.jobId,
            policy: params.policy,
            name: toolName as any,
            payload,
          });

          if (typeof (output as any).leadId === "number") {
            state.leadId = (output as any).leadId;
          }
        } else if (step.type === "template_send") {
          const useCase = String(config.useCase ?? "outreach");
          const channel = String(config.channel ?? "email") as any;
          const language = String(config.language ?? "en");
          const toKey = typeof config.toKey === "string" ? config.toKey : "to";
          const varsKey = typeof config.varsKey === "string" ? config.varsKey : "vars";

          const to = (params.inputs as any)?.[toKey] ? String((params.inputs as any)[toKey]) : null;
          const vars = (params.inputs as any)?.[varsKey] && typeof (params.inputs as any)[varsKey] === "object"
            ? ((params.inputs as any)[varsKey] as Record<string, unknown>)
            : params.inputs;

          const template = await findApprovedTemplate({
            companyId: params.policy.companyId,
            useCase,
            channel,
            language,
          });
          if (!template) throw new Error(`No approved template for ${useCase}/${channel}/${language}`);

          const rendered = await renderTemplate({
            jobId: params.jobId,
            policy: params.policy,
            template,
            vars,
          });

          output = await runTool({
            jobId: params.jobId,
            policy: params.policy,
            name: "send_message",
            payload: {
              channel,
              to,
              subject: rendered.subject,
              content: rendered.body,
              leadId: typeof state.leadId === "number" ? state.leadId : null,
            },
          });

          state.lastMessage = { ...rendered, to };
        } else if (step.type === "memory_write") {
          const content =
            typeof config.content === "string"
              ? config.content
              : typeof (state as any).lastMessage?.body === "string"
                ? (state as any).lastMessage.body
                : JSON.stringify(state.lastMessage ?? {});

          const clueId = await addClue({
            jobId: params.jobId,
            policy: params.policy,
            scope: (config.scope as any) ?? "personal",
            type: (config.type as any) ?? "note",
            content,
            tags: Array.isArray(config.tags) ? config.tags : ["playbook"],
            confidence: 0.7,
            embed: !!config.embed,
          });
          output = { clueId };
        } else if (step.type === "openai_call") {
          const system = typeof config.system === "string" ? config.system : "You are a helpful internal agent. Be concise.";
          const promptKey = typeof config.promptKey === "string" ? config.promptKey : null;
          const prompt =
            promptKey && typeof (params.inputs as any)?.[promptKey] === "string"
              ? String((params.inputs as any)[promptKey])
              : typeof config.prompt === "string"
                ? config.prompt
                : JSON.stringify(params.inputs);

          const maxTokens = typeof config.maxTokens === "number" ? config.maxTokens : 500;
          const temperature = typeof config.temperature === "number" ? config.temperature : 0.2;

          const response = await generateText({
            jobId: params.jobId,
            policy: params.policy,
            purpose: typeof config.purpose === "string" ? config.purpose : "playbook_llm_step",
            messages: [
              { role: "system", content: system },
              { role: "user", content: prompt },
            ],
            maxTokens,
            temperature,
          });

          const outputKey = typeof config.outputKey === "string" ? config.outputKey : "llmText";
          (state as any)[outputKey] = response.text;
          output = { outputKey, provider: response.provider, model: response.model, length: response.text.length };
        } else if (step.type === "handoff") {
          await updateAgentJob(params.jobId, { status: "escalated" });
          output = { escalated: true };
        } else {
          output = { skipped: true };
        }

        await logAgentAuditEvent({
          jobId: params.jobId,
          agentId: params.policy.agentId,
          actionType: "playbook_step",
          status: "ok",
          inputs: { playbookId: params.playbookId, stepId: step.stepId, type: step.type, attempt },
          outputs: output,
          latencyMs: Date.now() - startedAt,
        });

        break;
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);

        await logAgentAuditEvent({
          jobId: params.jobId,
          agentId: params.policy.agentId,
          actionType: "playbook_step",
          status: "error",
          inputs: { playbookId: params.playbookId, stepId: step.stepId, type: step.type, attempt },
          error: errMsg,
          latencyMs: Date.now() - startedAt,
        });

        if (attempt <= retries) continue;

        const escalate = !!(step.onFail as any)?.escalate;
        await updateAgentJob(params.jobId, { status: escalate ? "escalated" : "failed", error: errMsg });
        if (escalate) return { status: "escalated", error: errMsg, state };
        throw error;
      }
    }
  }

  await updateAgentJob(params.jobId, { status: "succeeded" });
  return { status: "succeeded", state };
}
