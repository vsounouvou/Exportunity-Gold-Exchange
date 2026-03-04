import { db } from "@db";
import { commsMessages, commsThreads, tenants } from "@db/schema";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { generateAgentResponse } from "../ai-provider";
import { assertAiBackgroundEnabled } from "../ai-consent";
import { stripAgentActionMarkers } from "../actions/agentActionIntents";
import { ensureDefaultOpsThreads } from "./threads";

let intervalId: ReturnType<typeof setInterval> | null = null;
let stopTimeoutId: ReturnType<typeof setTimeout> | null = null;
let isExecuting = false;

let lastCycleAt: string | null = null;
let lastError: string | null = null;
let lastCycleStats: Record<string, unknown> | null = null;

const DEFAULT_INTERVAL_MS = 6 * 60_000;
const DEFAULT_THREAD_COOLDOWN_MS = 25 * 60_000;

function nowIso() {
  return new Date().toISOString();
}

function clampInt(value: unknown, fallback: number, min: number, max: number) {
  const n = typeof value === "number" ? value : Number(String(value ?? ""));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

export function pickOpsCommsAutopilotSenderKey(threadName: string) {
  const name = String(threadName || "").trim().toLowerCase();
  if (!name) return "coordinator";
  if (name.includes("#board")) return "chairman_assistant";
  if (name.includes("compliance")) return "compliance";
  if (name.includes("finance")) return "wallet";
  if (name.includes("growth")) return "marketing";
  if (name.includes("platform")) return "data";
  if (name.includes("operations")) return "ops";
  if (name.includes("#execution")) return "coordinator";
  return "coordinator";
}

function roleForAgentKey(agentKey: string) {
  const key = String(agentKey || "").trim().toLowerCase();
  if (key === "chairman_assistant") return "Executive Assistant";
  if (key === "coordinator") return "Operations Coordinator";
  if (key === "ops") return "Operations Manager";
  if (key === "compliance") return "Compliance Officer";
  if (key === "wallet") return "Treasury & Payments Controller";
  if (key === "accounting") return "Accounting Lead";
  if (key === "data") return "Platform Lead";
  if (key === "marketing") return "Growth Lead";
  if (key === "client_hunter") return "Business Development Lead";
  if (key === "seo_autopilot") return "SEO Lead";
  if (key === "media") return "Media Lead";
  return "Operations Coordinator";
}

export function shouldAutopostThread(lastAutopostAt: Date | null, nowMs: number, cooldownMs: number) {
  if (!lastAutopostAt) return true;
  const lastMs = lastAutopostAt.getTime();
  if (!Number.isFinite(lastMs)) return true;
  return nowMs - lastMs >= cooldownMs;
}

async function getThreadTargets(tenantId: number) {
  const preferredNames = ["#execution", "#ops-general", "#dept-operations", "#dept-compliance", "#dept-finance"];
  const rows = await db
    .select()
    .from(commsThreads)
    .where(and(eq(commsThreads.tenantId, tenantId), inArray(commsThreads.name, preferredNames)))
    .orderBy(asc(commsThreads.createdAt));
  return rows;
}

async function lastAutopilotMessageAt(tenantId: number, threadId: number): Promise<Date | null> {
  const row = await db.query.commsMessages.findFirst({
    where: and(
      eq(commsMessages.tenantId, tenantId),
      eq(commsMessages.threadId, threadId),
      sql`coalesce(${commsMessages.metadata}->>'autopilot','false') = 'true'`,
    ),
    orderBy: [desc(commsMessages.createdAt)],
  });
  if (!row?.createdAt) return null;
  return new Date(row.createdAt as any);
}

async function buildThreadContext(tenantId: number, threadId: number) {
  const recent = await db.query.commsMessages.findMany({
    where: and(eq(commsMessages.tenantId, tenantId), eq(commsMessages.threadId, threadId)),
    orderBy: [desc(commsMessages.createdAt)],
    limit: 8,
  });
  return recent
    .slice()
    .reverse()
    .map((m) => {
      const sender = m.senderType === "SYSTEM" ? "System" : m.senderAgentKey ? `@${m.senderAgentKey}` : "Agent";
      const text = String(m.contentText || "").trim() || "[no text]";
      return `${sender}: ${text}`;
    })
    .join("\n");
}

async function postAutopilotUpdate(tenantId: number, tenantName: string, thread: any) {
  const intervalMs = clampInt(process.env.AI_OPS_COMMS_INTERVAL_MS, DEFAULT_INTERVAL_MS, 60_000, 60 * 60_000);
  const cooldownMs = clampInt(process.env.AI_OPS_COMMS_THREAD_COOLDOWN_MS, DEFAULT_THREAD_COOLDOWN_MS, 60_000, 6 * 60 * 60_000);

  const lastAutoAt = await lastAutopilotMessageAt(tenantId, thread.id);
  if (!shouldAutopostThread(lastAutoAt, Date.now(), cooldownMs)) return { posted: false as const, reason: "cooldown" as const };

  const agentKey = pickOpsCommsAutopilotSenderKey(String(thread.name || ""));
  const role = roleForAgentKey(agentKey);
  const history = await buildThreadContext(tenantId, thread.id);

  const prompt = `You are an internal staff agent posting a short operational update in a private company coordination thread.

Tenant: ${tenantName}
Thread: ${String(thread.name || "")}
Your role: ${role}

Recent thread context (newest last):
${history || "[no recent messages]"}

Write a status update that is professional and rational.
Rules:
- 2 to 4 lines maximum.
- Use this exact structure:
Update: ...
Risks: ...
Next: ...
- If you lack data, write "Need:" as the Next line and ask 1 precise question. Do not invent facts.
- No greetings, no signatures, no logs, no JSON, no metadata.
`;

  const ai = await generateAgentResponse(prompt, {
    role,
    context: {
      recentMessages: [],
      roomName: String(thread.name || ""),
      roomType: "ops-comms",
    },
  });

  const raw = String(ai.response || "").trim();
  const cleaned = (stripAgentActionMarkers(raw) || raw).trim();
  if (!cleaned) return { posted: false as const, reason: "empty" as const };

  const now = new Date();
  const [msg] = await db
    .insert(commsMessages)
    .values({
      tenantId,
      threadId: thread.id,
      senderType: "AGENT" as any,
      senderAgentKey: agentKey,
      messageType: "STATUS_UPDATE" as any,
      contentText: cleaned,
      contentJson: {},
      priority: "NORMAL" as any,
      requiresAck: false,
      ackByAgentKeys: [],
      metadata: { autopilot: true, intervalMs, cooldownMs },
      createdAt: now,
    })
    .returning();

  await db
    .update(commsThreads)
    .set({ updatedAt: now })
    .where(and(eq(commsThreads.tenantId, tenantId), eq(commsThreads.id, thread.id)));

  return { posted: true as const, messageId: msg.id, agentKey };
}

export function getOpsCommsAutopilotStatus() {
  return {
    running: !!intervalId,
    lastCycleAt,
    lastError,
    lastCycleStats,
    intervalMs: clampInt(process.env.AI_OPS_COMMS_INTERVAL_MS, DEFAULT_INTERVAL_MS, 60_000, 60 * 60_000),
    threadCooldownMs: clampInt(process.env.AI_OPS_COMMS_THREAD_COOLDOWN_MS, DEFAULT_THREAD_COOLDOWN_MS, 60_000, 6 * 60 * 60_000),
  };
}

async function executeOpsCommsCycle() {
  if (isExecuting) return;
  isExecuting = true;
  try {
    lastCycleAt = nowIso();
    lastError = null;
    lastCycleStats = null;

    const tenantRows = await db.select().from(tenants).orderBy(asc(tenants.id));
    let tenantsProcessed = 0;
    let postsAttempted = 0;
    let postsCreated = 0;

    for (const tenant of tenantRows) {
      tenantsProcessed += 1;
      await ensureDefaultOpsThreads(tenant.id);

      const targets = await getThreadTargets(tenant.id);
      for (const thread of targets.slice(0, 3)) {
        postsAttempted += 1;
        const out = await postAutopilotUpdate(tenant.id, tenant.name, thread);
        if ((out as any).posted) postsCreated += 1;
      }
    }

    lastCycleStats = { tenantsProcessed, postsAttempted, postsCreated };
  } catch (error) {
    lastError = error instanceof Error ? error.message : String(error);
  } finally {
    isExecuting = false;
  }
}

export function startOpsCommsAutopilot(options?: { durationMs?: number }) {
  assertAiBackgroundEnabled({
    what: "Start internal ops comms autopilot",
    why: "Posts brief internal coordination updates into Ops Center threads.",
    forHowLong: options?.durationMs ? `For ${Math.round(options.durationMs / 60000)} minutes.` : "Until explicitly stopped.",
    resources: ["External AI API calls", "Database reads/writes", "Background timers"],
    howToAuthorize: ["Use the explicit AI background start endpoint with confirmation"],
    howToStop: ["Stop the AI background session"],
  });

  if (intervalId) return;
  void executeOpsCommsCycle();

  const intervalMs = clampInt(process.env.AI_OPS_COMMS_INTERVAL_MS, DEFAULT_INTERVAL_MS, 60_000, 60 * 60_000);
  intervalId = setInterval(() => void executeOpsCommsCycle(), intervalMs);

  if (options?.durationMs) {
    if (stopTimeoutId) clearTimeout(stopTimeoutId);
    stopTimeoutId = setTimeout(() => stopOpsCommsAutopilot(), options.durationMs);
  }
}

export function stopOpsCommsAutopilot() {
  if (intervalId) clearInterval(intervalId);
  intervalId = null;
  if (stopTimeoutId) clearTimeout(stopTimeoutId);
  stopTimeoutId = null;
}
