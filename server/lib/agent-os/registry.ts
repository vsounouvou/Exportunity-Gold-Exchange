import { db } from "@db";
import { agentRegistry, agents } from "@db/schema";
import { eq } from "drizzle-orm";
import { PermissionDeniedError } from "./errors";

export type AgentOsScope = "personal" | "department" | "company" | "entity";

export type AgentOsOpenAiPolicy = {
  allowedModels: string[];
  maxTokens: number;
  temperature: number;
  timeoutMs: number;
};

export type AgentOsAnthropicPolicy = {
  allowedModels: string[];
  maxTokens: number;
  temperature: number;
  timeoutMs: number;
};

export type AgentPolicy = {
  agentId: number;
  companyId: number | null;
  departmentId: number | null;
  role: string;
  roleLevel: number | null;
  decisionAuthority: string | null;
  contextWindowTokens: number | null;
  permissions: string[];
  openaiPolicy: AgentOsOpenAiPolicy;
  anthropicPolicy: AgentOsAnthropicPolicy;
  memoryScopes: AgentOsScope[];
  defaultPlaybooks: string[];
  handoffRules: Record<string, unknown>;
};

const DEFAULT_ALLOWED_MODELS = [
  "gpt-4o-mini",
  "gpt-4.1-mini",
  "gpt-4o",
  "gpt-4.1",
  "gpt-4",
  "gpt-3.5-turbo",
  "text-embedding-3-small",
  "text-embedding-3-large",
];

function defaultAnthropicAllowedModels() {
  const fromEnv = [
    process.env.AI_INTEGRATIONS_ANTHROPIC_MODEL,
    process.env.ANTHROPIC_MODEL_FAST,
    process.env.ANTHROPIC_MODEL_BALANCED,
    process.env.ANTHROPIC_MODEL_QUALITY,
    process.env.ANTHROPIC_MODEL,
  ]
    .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    .map((v) => v.trim());

  const defaults = ["claude-sonnet-4-5"];
  return Array.from(new Set([...fromEnv, ...defaults]));
}

function deriveToolPermissions(agent: typeof agents.$inferSelect): string[] {
  const perms = (agent.permissions as any) ?? {};
  const allowed = new Set<string>();

  allowed.add("log_event");
  allowed.add("create_job");

  if (perms.email) allowed.add("send_message");
  if (perms.webResearch) allowed.add("search_web");
  if (perms.crm) {
    allowed.add("create_lead");
    allowed.add("update_crm");
  }
  if (perms.knowledge) allowed.add("kb_search");
  if (perms.payments) allowed.add("payments");
  if (perms.calendar) allowed.add("calendar");

  return Array.from(allowed);
}

export async function getAgentPolicy(agentId: number): Promise<AgentPolicy> {
  const agent = await db.query.agents.findFirst({
    where: eq(agents.id, agentId),
  });
  if (!agent) throw new PermissionDeniedError(`Unknown agent ${agentId}`);

  const existing = await db.query.agentRegistry.findFirst({
    where: eq(agentRegistry.agentId, agentId),
  });

  if (!existing) {
    const permissions = deriveToolPermissions(agent);
    const maxTokens = agent.contextWindowTokens ? Math.min(agent.contextWindowTokens, 1200) : 800;
    const openaiPolicy: AgentOsOpenAiPolicy = {
      allowedModels: DEFAULT_ALLOWED_MODELS,
      maxTokens,
      temperature: 0.3,
      timeoutMs: 25_000,
    };

    await db
      .insert(agentRegistry)
      .values({
        agentId,
        companyId: agent.companyId ?? null,
        departmentId: agent.departmentId ?? null,
        role: agent.role,
        permissions,
        openaiPolicy,
        memoryScopes: ["personal", "department", "company", "entity"],
        defaultPlaybooks: [],
        handoffRules: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoNothing();
  }

  const row = existing
    ? existing
    : await db.query.agentRegistry.findFirst({
        where: eq(agentRegistry.agentId, agentId),
      });

  const openaiPolicyRaw = (row?.openaiPolicy as any) ?? {};
  const openaiPolicy: AgentOsOpenAiPolicy = {
    allowedModels: Array.isArray(openaiPolicyRaw.allowedModels) ? openaiPolicyRaw.allowedModels : DEFAULT_ALLOWED_MODELS,
    maxTokens:
      typeof openaiPolicyRaw.maxTokens === "number" && Number.isFinite(openaiPolicyRaw.maxTokens)
        ? openaiPolicyRaw.maxTokens
        : 800,
    temperature:
      typeof openaiPolicyRaw.temperature === "number" && Number.isFinite(openaiPolicyRaw.temperature)
        ? openaiPolicyRaw.temperature
        : 0.3,
    timeoutMs:
      typeof openaiPolicyRaw.timeoutMs === "number" && Number.isFinite(openaiPolicyRaw.timeoutMs)
        ? openaiPolicyRaw.timeoutMs
        : 25_000,
  };

  const anthropicPolicy: AgentOsAnthropicPolicy = {
    allowedModels: defaultAnthropicAllowedModels(),
    maxTokens: agent.contextWindowTokens ? Math.min(agent.contextWindowTokens, 1200) : 800,
    temperature: 0.3,
    timeoutMs: 25_000,
  };

  return {
    agentId,
    companyId: agent.companyId ?? null,
    departmentId: agent.departmentId ?? null,
    role: agent.role,
    roleLevel: agent.roleLevel ?? null,
    decisionAuthority: (agent.decisionAuthority as any) ?? null,
    contextWindowTokens: agent.contextWindowTokens ?? null,
    permissions: Array.isArray(row?.permissions) ? (row?.permissions as any) : deriveToolPermissions(agent),
    openaiPolicy,
    anthropicPolicy,
    memoryScopes: Array.isArray(row?.memoryScopes) ? (row?.memoryScopes as any) : ["personal", "department", "company", "entity"],
    defaultPlaybooks: Array.isArray(row?.defaultPlaybooks) ? (row?.defaultPlaybooks as any) : [],
    handoffRules: (row?.handoffRules as any) ?? {},
  };
}

export function assertToolAllowed(policy: AgentPolicy, toolName: string) {
  if (policy.permissions.includes(toolName)) return;
  throw new PermissionDeniedError(`Agent ${policy.agentId} cannot use tool: ${toolName}`);
}
