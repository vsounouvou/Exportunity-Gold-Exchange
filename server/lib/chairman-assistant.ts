import { db } from "@db";
import { agents, companies, tenants } from "@db/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import { getChairmanAssistantIdentity, type ChairmanAssistantIdentity } from "./chairman-assistant-identity";

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

async function resolveDefaultCompanyId(tenantId: number) {
  const company = await db.query.companies.findFirst({
    where: eq(companies.tenantId, tenantId),
    orderBy: [desc(companies.createdAt)],
    columns: { id: true },
  });
  return company?.id ?? null;
}

async function resolveTenantIdentity(tenantId: number) {
  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.id, tenantId),
    columns: { key: true },
  });
  return getChairmanAssistantIdentity(tenant?.key);
}

function agentMetadata(agent: any): Record<string, unknown> {
  return agent?.metadata && typeof agent.metadata === "object" && !Array.isArray(agent.metadata)
    ? agent.metadata
    : {};
}

function isDedicatedChairmanAssistant(agent: any) {
  return normalizeLabel(agentMetadata(agent).systemKey) === "chairman assistant";
}

function isPublicExportunityConcierge(agent: any) {
  return normalizeLabel(agentMetadata(agent).organizationKey) === "tassi";
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

async function ensureAssistantIdentity(agent: any, identity: ChairmanAssistantIdentity) {
  const normalizedName = normalizeLabel(agent?.displayName || agent?.name);
  const shouldRename =
    isDedicatedChairmanAssistant(agent) ||
    isChairmanAssistantRole(agent?.role) ||
    (normalizedName && LEGACY_ASSISTANT_NAME_ALIASES.has(normalizedName));
  const alreadyTarget =
    normalizeLabel(agent?.name) === normalizeLabel(identity.name) &&
    normalizeLabel(agent?.displayName) === normalizeLabel(identity.name) &&
    normalizeLabel(agent?.role) === normalizeLabel(identity.role) &&
    isDedicatedChairmanAssistant(agent);
  if (!shouldRename || alreadyTarget) return agent;

  const metadata = agentMetadata(agent);

  const [updated] = await db
    .update(agents)
    .set({
      name: identity.name,
      displayName: identity.name,
      role: identity.role,
      capabilities: identity.capabilities,
      metadata: {
        ...metadata,
        systemKey: "chairman-assistant",
        organizationKey: identity.organizationKey,
        assistantScope: identity.organizationKey === "fenou" ? "operations" : "executive",
        externalActions: "approval_required",
        backgroundConversations: "disabled",
      },
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

  const identity = await resolveTenantIdentity(tenantId);
  const tenantAgents = await db.query.agents.findMany({
    where: eq(agents.tenantId, tenantId),
    orderBy: [desc(agents.updatedAt)],
  });

  const dedicated = tenantAgents.find(
    (agent) =>
      isDedicatedChairmanAssistant(agent) &&
      !(identity.organizationKey === "fenou" && isPublicExportunityConcierge(agent)),
  );
  if (dedicated?.id) {
    const defaultAgent = await markTerminalDefault(tenantId, Number(dedicated.id));
    return ensureAssistantIdentity(defaultAgent, identity);
  }

  const existingDefault = tenantAgents.find((agent) => agent.isTerminalDefault);
  const existingDefaultIsEligible =
    existingDefault &&
    !(identity.organizationKey === "fenou" && isPublicExportunityConcierge(existingDefault));
  if (existingDefaultIsEligible) {
    return ensureAssistantIdentity(existingDefault, identity);
  }

  const fallback = tenantAgents.find(
    (agent) => isChairmanAssistantRole(agent.role) && !isPublicExportunityConcierge(agent),
  );
  if (fallback?.id) {
    const defaultAgent = await markTerminalDefault(tenantId, Number(fallback.id));
    return ensureAssistantIdentity(defaultAgent, identity);
  }

  const companyId = await resolveDefaultCompanyId(tenantId);
  const executiveManager = tenantAgents.find((agent) => {
    const metadata = agentMetadata(agent);
    return normalizeLabel(metadata.organizationKey) === "ceo" || normalizeLabel(agent.role).includes("chief executive");
  });
  await clearTerminalDefault(tenantId);
  const [created] = await db
    .insert(agents)
    .values({
      tenantId,
      companyId,
      managerId: executiveManager?.id ?? null,
      name: identity.name,
      displayName: identity.name,
      role: identity.role,
      status: "active",
      isTerminalDefault: true,
      capabilities: identity.capabilities,
      metadata: {
        systemKey: "chairman-assistant",
        organizationKey: identity.organizationKey,
        assistantScope: identity.organizationKey === "fenou" ? "operations" : "executive",
        externalActions: "approval_required",
        backgroundConversations: "disabled",
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
