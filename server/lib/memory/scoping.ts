export type AgentMemoryScope = "CONVERSATION" | "TENANT" | "GLOBAL";

export type AgentMemoryIdentity = {
  name?: string | null;
  displayName?: string | null;
  role?: string | null;
  tenantId?: number | null;
  metadata?: Record<string, unknown> | null;
};

export function isTassiGlobalAgent(identity: AgentMemoryIdentity) {
  const name = String(identity?.name || identity?.displayName || "").trim().toLowerCase();
  const role = String(identity?.role || "").trim().toLowerCase();
  const metadata =
    identity?.metadata && typeof identity.metadata === "object"
      ? (identity.metadata as Record<string, unknown>)
      : {};
  const agentKey = String(
    (metadata as any).agentKey ??
    (metadata as any).agent_key ??
    (metadata as any).slug ??
    "",
  )
    .trim()
    .toLowerCase();

  return (
    name.includes("tassi") ||
    role.includes("chairman assistant") ||
    agentKey === "tassi" ||
    agentKey === "chairman_assistant" ||
    agentKey === "chairman-assistant"
  );
}

export function deriveAgentMemoryAccessPolicy(input: {
  tenantId: number | null;
  agentTenantId: number | null;
  isTassi: boolean;
  conversationId?: string | null;
  includeTenantMemory?: boolean;
}) {
  const tenantId = Number(input.tenantId || 0);
  const agentTenantId = Number(input.agentTenantId || 0);
  const conversationId = String(input.conversationId || "").trim();
  const includeTenantMemory = Boolean(input.includeTenantMemory);
  const isTassi = Boolean(input.isTassi);

  if (!tenantId || tenantId <= 0) {
    return {
      valid: false as const,
      reason: "tenant_required",
      allowedScopes: [] as AgentMemoryScope[],
    };
  }

  if (!isTassi && (!agentTenantId || agentTenantId !== tenantId)) {
    return {
      valid: false as const,
      reason: "agent_outside_tenant_scope",
      allowedScopes: [] as AgentMemoryScope[],
    };
  }

  const allowedScopes: AgentMemoryScope[] = [];
  if (conversationId) allowedScopes.push("CONVERSATION");
  if (!isTassi && includeTenantMemory) allowedScopes.push("TENANT");
  if (isTassi) allowedScopes.push("GLOBAL");

  return {
    valid: true as const,
    reason: null,
    allowedScopes,
    conversationId: conversationId || null,
    includeTenantMemory: !isTassi && includeTenantMemory,
    allowGlobal: isTassi,
  };
}

