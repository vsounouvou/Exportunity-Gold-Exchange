import { db } from "@db";
import { agents } from "@db/schema";
import { eq, sql } from "drizzle-orm";

function toPositiveInt(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return null;
  const normalized = Math.trunc(parsed);
  return normalized > 0 ? normalized : null;
}

function getRows<T = any>(result: any): T[] {
  if (Array.isArray(result?.rows)) return result.rows as T[];
  if (Array.isArray(result)) return result as T[];
  return [];
}

export async function resolveRuntimeAgentId(input: {
  agentId: number;
  tenantId?: number | null;
}): Promise<number | null> {
  const candidateId = toPositiveInt(input.agentId);
  if (!candidateId) return null;

  const direct = await db.query.agents.findFirst({
    where: eq(agents.id, candidateId),
    columns: { id: true },
  });
  if (direct?.id) return candidateId;

  const tenantId = toPositiveInt(input.tenantId);
  const runTemplateLookup = async (withTenant: boolean) => {
    if (withTenant && !tenantId) return null;
    const rows = getRows<{
      template_id: number;
      tenant_id: number | null;
      title: string | null;
      role_title: string | null;
      approval_policy: Record<string, unknown> | null;
      runtime_agent_id: number | null;
    }>(
      await db.execute(sql`
        select
          id as template_id,
          tenant_id,
          title,
          role_title,
          approval_policy,
          case
            when coalesce(approval_policy->>'runtimeAgentId', approval_policy->>'runtime_agent_id', '') ~ '^[0-9]+$'
              then coalesce(approval_policy->>'runtimeAgentId', approval_policy->>'runtime_agent_id')::int
            else null
          end as runtime_agent_id
        from ece_agent_templates
        where id = ${candidateId}
          ${withTenant ? sql`and tenant_id = ${tenantId}` : sql``}
        limit 1
      `),
    );
    return rows[0] ?? null;
  };

  const template =
    (await runTemplateLookup(true)) ||
    (await runTemplateLookup(false));
  if (!template) return null;

  const runtimeAgentId = toPositiveInt(template.runtime_agent_id ?? null);
  if (runtimeAgentId) {
    const runtimeAgent = await db.query.agents.findFirst({
      where: eq(agents.id, runtimeAgentId),
      columns: { id: true },
    });
    if (runtimeAgent?.id) return runtimeAgentId;
  }

  const title = String(template.title || "").trim();
  if (!title) return null;

  const inferredRows = getRows<{ id: number }>(
    await db.execute(sql`
      select id
      from agents
      where lower(name) = lower(${title})
      order by id asc
      limit 1
    `),
  );

  const inferredRuntimeAgentId = toPositiveInt(inferredRows[0]?.id ?? null);
  if (!inferredRuntimeAgentId) return null;

  const nextPolicy =
    template.approval_policy && typeof template.approval_policy === "object"
      ? {
          ...template.approval_policy,
          runtimeAgentId: inferredRuntimeAgentId,
          syncedAt: new Date().toISOString(),
        }
      : {
          runtimeAgentId: inferredRuntimeAgentId,
          syncedAt: new Date().toISOString(),
        };

  await db.execute(sql`
    update ece_agent_templates
    set approval_policy = ${JSON.stringify(nextPolicy)}::jsonb, updated_at = now()
    where id = ${template.template_id}
  `);

  return inferredRuntimeAgentId;
}
