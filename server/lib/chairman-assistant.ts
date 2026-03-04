import { db } from "@db";
import { agents, companies } from "@db/schema";
import { and, desc, eq, sql } from "drizzle-orm";

const DEFAULT_ASSISTANT_NAME = "Tassi Hangbé";
const DEFAULT_ASSISTANT_ROLE = "CHAIRMAN_ASSISTANT";
const LEGACY_ASSISTANT_NAME_ALIASES = new Set(["awa bamba", "chloe adjovi", "chloe"]);

function normalizeLabel(value: unknown) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isChairmanAssistantRole(value: unknown) {
  const normalized = normalizeLabel(value);
  if (!normalized) return false;
  if (normalized === "chairman assistant" || normalized === "chairman_assistant") return true;
  if (normalized.includes("chairman assistant")) return true;
  if (normalized.includes("terminal assistant")) return true;
  return false;
}

function rows<T = any>(result: unknown): T[] {
  const candidate = (result as any)?.rows;
  return Array.isArray(candidate) ? (candidate as T[]) : [];
}

async function resolveDefaultCompanyId(tenantId: number) {
  const company = await db.query.companies.findFirst({
    where: eq(companies.tenantId, tenantId),
    orderBy: [desc(companies.createdAt)],
    columns: { id: true },
  });
  return company?.id ?? null;
}

async function clearTerminalDefault(tenantId: number, keepId?: number | null) {
  if (!Number.isFinite(tenantId) || tenantId <= 0) return;
  if (keepId && Number.isFinite(keepId)) {
    await db.execute(sql`
      update agents
      set is_terminal_default = false, updated_at = now()
      where tenant_id = ${tenantId} and id <> ${keepId}
    `);
    return;
  }
  await db.execute(sql`
    update agents
    set is_terminal_default = false, updated_at = now()
    where tenant_id = ${tenantId}
  `);
}

async function markTerminalDefault(tenantId: number, agentId: number) {
  await clearTerminalDefault(tenantId, agentId);
  const [updated] = await db
    .update(agents)
    .set({ isTerminalDefault: true, updatedAt: new Date() })
    .where(and(eq(agents.tenantId, tenantId), eq(agents.id, agentId)))
    .returning();
  return updated;
}

async function ensureAssistantIdentity(agent: any) {
  const normalizedName = normalizeLabel(agent?.displayName || agent?.name);
  const shouldRename = normalizedName && LEGACY_ASSISTANT_NAME_ALIASES.has(normalizedName);
  const alreadyTarget =
    normalizeLabel(agent?.name) === normalizeLabel(DEFAULT_ASSISTANT_NAME) &&
    normalizeLabel(agent?.displayName) === normalizeLabel(DEFAULT_ASSISTANT_NAME);
  if (!shouldRename || alreadyTarget) return agent;

  const [updated] = await db
    .update(agents)
    .set({
      name: DEFAULT_ASSISTANT_NAME,
      displayName: DEFAULT_ASSISTANT_NAME,
      updatedAt: new Date(),
    })
    .where(eq(agents.id, Number(agent.id)))
    .returning();

  return updated ?? agent;
}

export async function resolveChairmanAssistant(tenantId: number) {
  if (!Number.isFinite(tenantId) || tenantId <= 0) {
    throw new Error("tenantId is required to resolve chairman assistant");
  }

  const existingDefault = await db.query.agents.findFirst({
    where: and(eq(agents.tenantId, tenantId), eq(agents.isTerminalDefault, true)),
    orderBy: [desc(agents.updatedAt)],
  });
  if (existingDefault) return ensureAssistantIdentity(existingDefault);

  const fallback = await db.execute(sql`
    select *
    from agents
    where tenant_id = ${tenantId}
      and (
        lower(role) = 'chairman_assistant'
        or lower(role) = 'chairman assistant'
        or lower(role) like '%chairman%assistant%'
        or lower(role) like '%terminal%assistant%'
      )
    order by updated_at desc nulls last, id desc
    limit 1
  `);
  const candidates = rows<any>(fallback);
  if (candidates.length) {
    const candidate = candidates[0];
    const agentId = Number(candidate.id);
    if (Number.isFinite(agentId) && agentId > 0) {
      const defaultAgent = await markTerminalDefault(tenantId, agentId);
      return ensureAssistantIdentity(defaultAgent);
    }
  }

  const companyId = await resolveDefaultCompanyId(tenantId);
  await clearTerminalDefault(tenantId);
  const [created] = await db
    .insert(agents)
    .values({
      tenantId,
      companyId,
      name: DEFAULT_ASSISTANT_NAME,
      displayName: DEFAULT_ASSISTANT_NAME,
      role: DEFAULT_ASSISTANT_ROLE,
      status: "active",
      isTerminalDefault: true,
      capabilities: ["chairman_console", "assistant"],
      metadata: {
        systemKey: "chairman-assistant",
        seeded: true,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  return created;
}

export async function ensureChairmanAssistants() {
  const tenantRows = await db.query.tenants.findMany({ columns: { id: true } });
  for (const tenant of tenantRows) {
    const tenantId = Number(tenant.id);
    if (!Number.isFinite(tenantId) || tenantId <= 0) continue;
    await resolveChairmanAssistant(tenantId);
  }
}

export function isChairmanAssistantAgent(agent: any) {
  if (!agent) return false;
  return Boolean(agent.isTerminalDefault || isChairmanAssistantRole(agent.role));
}
