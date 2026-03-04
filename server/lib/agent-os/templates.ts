import { and, desc, eq } from "drizzle-orm";
import { db } from "@db";
import { templates } from "@db/schema";
import type { AgentPolicy } from "./registry";
import { TemplateRenderError } from "./errors";
import { logAgentAuditEvent } from "./audit";

type TemplateRow = typeof templates.$inferSelect;

function extractVars(text: string): string[] {
  const vars = new Set<string>();
  const re = /\{([a-zA-Z0-9_]+)\}/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    vars.add(match[1]);
  }
  return Array.from(vars);
}

function renderString(template: string, vars: Record<string, unknown>) {
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_m, key: string) => {
    const value = vars[key];
    return value === undefined || value === null ? "" : String(value);
  });
}

export async function findApprovedTemplate(params: {
  companyId?: number | null;
  useCase: string;
  channel: TemplateRow["channel"];
  language: string;
}): Promise<TemplateRow | null> {
  const rows = await db
    .select()
    .from(templates)
    .where(
      and(
        eq(templates.useCase, params.useCase),
        eq(templates.channel, params.channel),
        eq(templates.language, params.language),
        eq(templates.approved, true),
        params.companyId ? eq(templates.companyId, params.companyId) : undefined,
      ),
    )
    .orderBy(desc(templates.createdAt))
    .limit(1);

  return rows[0] ?? null;
}

export async function renderTemplate(params: {
  jobId: string;
  policy: AgentPolicy;
  template: TemplateRow;
  vars: Record<string, unknown>;
}): Promise<{ subject?: string; body: string }> {
  const startedAt = Date.now();
  const required = Array.isArray(params.template.requiredVars) ? (params.template.requiredVars as any as string[]) : [];
  const inferred = extractVars(`${params.template.subject ?? ""}\n${params.template.body}`);
  const requiredAll = Array.from(new Set([...required, ...inferred]));

  const missing = requiredAll.filter((k) => params.vars[k] === undefined || params.vars[k] === null);
  if (missing.length) {
    const err = new TemplateRenderError(`Missing template variables: ${missing.join(", ")}`, missing);
    await logAgentAuditEvent({
      jobId: params.jobId,
      agentId: params.policy.agentId,
      actionType: "template_render",
      status: "error",
      inputs: { templateId: params.template.templateId, missing },
      error: err.message,
      latencyMs: Date.now() - startedAt,
    });
    throw err;
  }

  const subject = params.template.subject ? renderString(params.template.subject, params.vars) : undefined;
  const body = renderString(params.template.body, params.vars);

  await logAgentAuditEvent({
    jobId: params.jobId,
    agentId: params.policy.agentId,
    actionType: "template_render",
    status: "ok",
    inputs: { templateId: params.template.templateId },
    outputs: { subjectLength: subject?.length ?? 0, bodyLength: body.length },
    latencyMs: Date.now() - startedAt,
  });

  return { subject, body };
}

