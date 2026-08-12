import { createHash } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "@db";
import { leads, leadMessages } from "@db/schema";
import type { AgentPolicy } from "./registry";
import { assertToolAllowed, getAgentPolicy } from "./registry";
import { logAgentAuditEvent, createAgentJob } from "./audit";
import { assertExternalCommunicationAuthorized } from "../company-brain/featureFlags";

export type ToolName =
  | "send_message"
  | "search_web"
  | "create_lead"
  | "update_crm"
  | "create_job"
  | "log_event"
  | "get_entity"
  | "attach_document";

const toolExecutionIdempotencyCache = new Set<string>();

function computeToolIdempotencyKey(input: {
  agentId: number;
  jobId: string;
  toolName: ToolName;
  args: Record<string, unknown>;
  idempotencyKey?: string | null;
}) {
  const explicit = String(input.idempotencyKey || "").trim();
  if (explicit) return explicit;
  const digest = createHash("sha256")
    .update(
      JSON.stringify({
        agentId: input.agentId,
        jobId: input.jobId,
        toolName: input.toolName,
        args: input.args,
      }),
    )
    .digest("hex");
  return digest.slice(0, 64);
}

export async function executeTool(params: {
  agentId: number;
  jobId: string;
  toolName: ToolName;
  args: Record<string, unknown>;
  idempotencyKey?: string | null;
  maxRetries?: number;
}): Promise<Record<string, unknown>> {
  const policy = await getAgentPolicy(params.agentId);
  const idempotencyKey = computeToolIdempotencyKey({
    agentId: params.agentId,
    jobId: params.jobId,
    toolName: params.toolName,
    args: params.args,
    idempotencyKey: params.idempotencyKey,
  });

  if (toolExecutionIdempotencyCache.has(idempotencyKey)) {
    await logAgentAuditEvent({
      jobId: params.jobId,
      agentId: params.agentId,
      actionType: "tool_call",
      status: "ok",
      inputs: {
        toolName: params.toolName,
        idempotencyKey,
        deduped: true,
      },
      outputs: { deduped: true },
    });
    return { deduped: true, idempotencyKey };
  }

  const maxRetries = Math.max(0, Math.min(5, Number(params.maxRetries ?? 2)));
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      const result = await runTool({
        jobId: params.jobId,
        policy,
        name: params.toolName,
        payload: params.args,
      });
      toolExecutionIdempotencyCache.add(idempotencyKey);
      await logAgentAuditEvent({
        jobId: params.jobId,
        agentId: params.agentId,
        actionType: "tool_call",
        status: "ok",
        inputs: {
          toolName: params.toolName,
          idempotencyKey,
          attempt: attempt + 1,
          maxRetries,
        },
        outputs: result,
      });
      return { ...result, idempotencyKey };
    } catch (error) {
      lastError = error;
      await logAgentAuditEvent({
        jobId: params.jobId,
        agentId: params.agentId,
        actionType: "tool_call",
        status: "error",
        inputs: {
          toolName: params.toolName,
          idempotencyKey,
          attempt: attempt + 1,
          maxRetries,
        },
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError || "Tool execution failed"));
}

export async function runTool(params: {
  jobId: string;
  policy: AgentPolicy;
  name: ToolName;
  payload: Record<string, unknown>;
}): Promise<Record<string, unknown>> {
  assertToolAllowed(params.policy, params.name);
  const startedAt = Date.now();

  try {
    let output: Record<string, unknown>;

    switch (params.name) {
      case "log_event": {
        output = { ok: true };
        break;
      }
      case "create_job": {
        const title = typeof params.payload.title === "string" ? params.payload.title : "Agent Job";
        const jobId = await createAgentJob({
          title,
          agentId: params.policy.agentId,
          companyId: params.policy.companyId,
          payload: params.payload,
        });
        output = { jobId };
        break;
      }
      case "search_web": {
        const query = String(params.payload.query ?? "").trim();
        output = {
          query,
          results: query
            ? [
                {
                  title: `Lead: ${query} Trading Co`,
                  url: "https://example.com",
                  snippet: "Sample result (offline stub).",
                },
                {
                  title: `Lead: ${query} Imports`,
                  url: "https://example.org",
                  snippet: "Sample result (offline stub).",
                },
              ]
            : [],
        };
        break;
      }
      case "create_lead": {
        const lead = (params.payload.lead as any) ?? params.payload;
        const [created] = await db
          .insert(leads)
          .values({
            source: "manual",
            sourceLink: typeof lead.sourceLink === "string" ? lead.sourceLink : null,
            companyName: typeof lead.companyName === "string" ? lead.companyName : null,
            contactName: typeof lead.contactName === "string" ? lead.contactName : null,
            contactEmail: typeof lead.contactEmail === "string" ? lead.contactEmail : null,
            contactPhone: typeof lead.contactPhone === "string" ? lead.contactPhone : null,
            country: typeof lead.country === "string" ? lead.country : null,
            city: typeof lead.city === "string" ? lead.city : null,
            category: typeof lead.category === "string" ? lead.category : null,
            subcategory: typeof lead.subcategory === "string" ? lead.subcategory : null,
            score: typeof lead.score === "number" ? lead.score : 0,
            priority: typeof lead.priority === "string" ? lead.priority : "medium",
            status: "new",
            ownerAgentId: params.policy.agentId,
            notes: typeof lead.notes === "string" ? lead.notes : null,
            tags: Array.isArray(lead.tags) ? lead.tags : [],
            enrichmentData: typeof lead.enrichmentData === "object" && lead.enrichmentData ? lead.enrichmentData : {},
            metadata: {},
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .returning({ id: leads.id });

        output = { leadId: created.id };
        break;
      }
      case "send_message": {
        assertExternalCommunicationAuthorized(
          params.payload.approval && typeof params.payload.approval === "object"
            ? (params.payload.approval as Record<string, unknown>)
            : null,
        );
        const channel = typeof params.payload.channel === "string" ? params.payload.channel : "in_app";
        const to = typeof params.payload.to === "string" ? params.payload.to : null;
        const content = typeof params.payload.content === "string" ? params.payload.content : "";
        const subject = typeof params.payload.subject === "string" ? params.payload.subject : null;
        const leadId = typeof params.payload.leadId === "number" ? params.payload.leadId : null;

        if (leadId) {
          await db.insert(leadMessages).values({
            leadId,
            channel: channel as any,
            direction: "outbound",
            subject,
            content,
            sentBy: "client_hunter_agent",
            status: "sent",
            sentAt: new Date(),
            metadata: { to },
            createdAt: new Date(),
          });
        }

        output = { delivered: true, channel, to };
        break;
      }
      case "update_crm": {
        const leadId = typeof params.payload.leadId === "number" ? params.payload.leadId : null;
        const fields = (params.payload.fields as any) ?? {};
        if (!leadId) {
          output = { updated: false, reason: "leadId required" };
          break;
        }
        await db
          .update(leads)
          .set({
            ...(typeof fields.status === "string" ? { status: fields.status } : {}),
            ...(typeof fields.score === "number" ? { score: fields.score } : {}),
            ...(typeof fields.notes === "string" ? { notes: fields.notes } : {}),
            updatedAt: new Date(),
          })
          .where(eq(leads.id, leadId));
        output = { updated: true, leadId };
        break;
      }
      case "get_entity": {
        const leadId = typeof params.payload.leadId === "number" ? params.payload.leadId : null;
        if (!leadId) {
          output = { entity: null };
          break;
        }
        const lead = await db.query.leads.findFirst({ where: eq(leads.id, leadId) });
        output = { entity: lead ?? null };
        break;
      }
      case "attach_document": {
        output = { attached: true };
        break;
      }
      default: {
        output = { ok: false, error: "Unknown tool" };
      }
    }

    await logAgentAuditEvent({
      jobId: params.jobId,
      agentId: params.policy.agentId,
      actionType: "tool_call",
      status: "ok",
      inputs: { name: params.name, payload: params.payload },
      outputs: output,
      latencyMs: Date.now() - startedAt,
    });

    return output;
  } catch (error) {
    await logAgentAuditEvent({
      jobId: params.jobId,
      agentId: params.policy.agentId,
      actionType: "tool_call",
      status: "error",
      inputs: { name: params.name, payload: params.payload },
      error: error instanceof Error ? error.message : String(error),
      latencyMs: Date.now() - startedAt,
    });
    throw error;
  }
}
