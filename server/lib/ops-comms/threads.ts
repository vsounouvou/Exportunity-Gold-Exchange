import { db } from "@db";
import { commsParticipants, commsThreads } from "@db/schema";
import { and, eq } from "drizzle-orm";
import { AGENT_KEYS } from "../../agents";
import { normalizeAgentKey } from "../mail/agentSlugs";

function normalizeThreadName(value: unknown) {
  const name = typeof value === "string" ? value.trim() : "";
  return name || null;
}

export async function ensureThread(opts: {
  tenantId: number;
  type: string;
  name: string;
  visibilityPolicy: string;
  createdByAgentKey: string;
  participants: Array<{ agentKey: string; roleInThread?: string }>;
  metadata?: Record<string, unknown>;
}) {
  const existing = await db.query.commsThreads.findFirst({
    where: and(
      eq(commsThreads.tenantId, opts.tenantId),
      eq(commsThreads.type, opts.type as any),
      eq(commsThreads.name, opts.name),
    ),
  });
  if (existing) return existing;

  const now = new Date();
  const [thread] = await db
    .insert(commsThreads)
    .values({
      tenantId: opts.tenantId,
      type: opts.type as any,
      name: normalizeThreadName(opts.name),
      visibilityPolicy: opts.visibilityPolicy as any,
      createdByAgentKey: opts.createdByAgentKey,
      metadata: { ...(opts.metadata ?? {}), seeded: true },
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  for (const p of opts.participants) {
    const agentKey = normalizeAgentKey(p.agentKey);
    if (!agentKey) continue;
    await db
      .insert(commsParticipants)
      .values({
        tenantId: opts.tenantId,
        threadId: thread.id,
        agentKey,
        roleInThread: (p.roleInThread as any) || ("MEMBER" as any),
        createdAt: now,
      })
      .onConflictDoNothing();
  }

  return thread;
}

export async function ensureDefaultOpsThreads(tenantId: number) {
  const coreAgentKeys = ["coordinator", ...AGENT_KEYS];
  const coreParticipants = coreAgentKeys.map((k) => ({
    agentKey: String(k),
    roleInThread: k === "coordinator" ? "SUPERVISOR" : "MEMBER",
  }));

  const chairmanParticipants = [
    { agentKey: "chairman_assistant", roleInThread: "SUPERVISOR" },
    { agentKey: "coordinator", roleInThread: "SUPERVISOR" },
  ];

  await ensureThread({
    tenantId,
    type: "CHANNEL",
    name: "#board",
    visibilityPolicy: "PRIVATE",
    createdByAgentKey: "system",
    participants: chairmanParticipants,
    metadata: { category: "BOARD_THREAD" },
  });

  await ensureThread({
    tenantId,
    type: "CHANNEL",
    name: "#execution",
    visibilityPolicy: "DEPT",
    createdByAgentKey: "system",
    participants: [...chairmanParticipants, ...coreParticipants],
    metadata: { category: "EXECUTION_THREAD" },
  });

  await ensureThread({
    tenantId,
    type: "CHANNEL",
    name: "#ops-general",
    visibilityPolicy: "TENANT_INTERNAL",
    createdByAgentKey: "system",
    participants: coreParticipants,
    metadata: { category: "OPS_GENERAL" },
  });

  await ensureThread({
    tenantId,
    type: "CHANNEL",
    name: "#dept-operations",
    visibilityPolicy: "DEPT",
    createdByAgentKey: "system",
    participants: [{ agentKey: "coordinator", roleInThread: "SUPERVISOR" }, { agentKey: "ops" }],
    metadata: { category: "DEPARTMENT_THREAD", department: "operations" },
  });

  await ensureThread({
    tenantId,
    type: "CHANNEL",
    name: "#dept-compliance",
    visibilityPolicy: "DEPT",
    createdByAgentKey: "system",
    participants: [{ agentKey: "coordinator", roleInThread: "SUPERVISOR" }, { agentKey: "compliance" }],
    metadata: { category: "DEPARTMENT_THREAD", department: "compliance" },
  });

  await ensureThread({
    tenantId,
    type: "CHANNEL",
    name: "#dept-growth",
    visibilityPolicy: "DEPT",
    createdByAgentKey: "system",
    participants: [
      { agentKey: "coordinator", roleInThread: "SUPERVISOR" },
      { agentKey: "marketing" },
      { agentKey: "client_hunter" },
      { agentKey: "seo_autopilot" },
      { agentKey: "media" },
    ],
    metadata: { category: "DEPARTMENT_THREAD", department: "growth" },
  });

  await ensureThread({
    tenantId,
    type: "CHANNEL",
    name: "#dept-platform",
    visibilityPolicy: "DEPT",
    createdByAgentKey: "system",
    participants: [{ agentKey: "coordinator", roleInThread: "SUPERVISOR" }, { agentKey: "data" }],
    metadata: { category: "DEPARTMENT_THREAD", department: "platform" },
  });

  await ensureThread({
    tenantId,
    type: "CHANNEL",
    name: "#dept-finance",
    visibilityPolicy: "DEPT",
    createdByAgentKey: "system",
    participants: [
      { agentKey: "coordinator", roleInThread: "SUPERVISOR" },
      { agentKey: "wallet" },
      { agentKey: "accounting" },
    ],
    metadata: { category: "DEPARTMENT_THREAD", department: "finance" },
  });
}
