import { Router } from "express";
import { db } from "@db";
import { chatRooms, goals, meetings, messages, tenants } from "@db/schema";
import { asc, desc, eq, sql } from "drizzle-orm";
import {
  getBackgroundConversationEngineStatus,
  startBackgroundConversationEngine,
  stopBackgroundConversationEngine,
} from "../lib/backgroundConversationEngine";
import {
  getOpsCommsAutopilotStatus,
  startOpsCommsAutopilot,
  stopOpsCommsAutopilot,
} from "../lib/ops-comms/autopilot";
import { getCFOAgentStatus, initializeCFOAgent, stopCFOAgent } from "../lib/cfo-agent-service";
import { getActionsWorkerStatus } from "../lib/actions/scheduler";
import {
  AiConsentRequiredError,
  assertAiBackgroundEnabled,
  assertCfoAgentEnabled,
  enableAiBackgroundRuntime,
  disableAiBackgroundRuntime,
  getAiBackgroundRuntimeOverride,
  isAiBackgroundEnabled,
  isAiEnabled,
  isCfoAgentEnabled,
} from "../lib/ai-consent";
import { getSetting, setSetting } from "../lib/settings";

function parseBool(value: unknown) {
  if (value === true) return true;
  if (value === false) return false;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "y", "on"].includes(normalized)) return true;
    if (["0", "false", "no", "n", "off"].includes(normalized)) return false;
  }
  return false;
}

function parseDurationMs(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  const minutes = typeof value === "string" ? Number(value) : (value as number);
  if (!Number.isFinite(minutes)) return undefined;
  if (minutes <= 0) return undefined;
  return Math.round(minutes * 60 * 1000);
}

function parsePositiveInt(value: unknown, fallback: number) {
  const num = typeof value === "string" ? Number(value) : Number(value);
  if (!Number.isFinite(num) || num <= 0) return fallback;
  return Math.trunc(num);
}

function toPositiveIntOrNull(value: unknown) {
  const num = typeof value === "string" ? Number(value) : Number(value);
  if (!Number.isFinite(num) || num <= 0) return null;
  return Math.trunc(num);
}

function asPositiveIntArray(value: unknown) {
  if (!Array.isArray(value)) return [] as number[];
  return Array.from(
    new Set(
      value
        .map((entry) => toPositiveIntOrNull(entry))
        .filter((entry): entry is number => typeof entry === "number" && entry > 0),
    ),
  );
}

async function resolveSettingsTenantId() {
  const preferredTenantKey = String(process.env.DEFAULT_TENANT_KEY || "bdo").trim().toLowerCase();
  if (preferredTenantKey) {
    const preferred = await db.query.tenants.findFirst({
      where: eq(tenants.key, preferredTenantKey as any),
      columns: { id: true },
    });
    if (preferred?.id) return Number(preferred.id);
  }

  const fallbackRows = await db.select({ id: tenants.id }).from(tenants).orderBy(asc(tenants.id)).limit(1);
  const fallbackId = fallbackRows[0]?.id ? Number(fallbackRows[0].id) : null;
  return fallbackId && fallbackId > 0 ? fallbackId : null;
}

async function readRecurringMeetingConfig() {
  const tenantId = await resolveSettingsTenantId();
  if (!tenantId) return { tenantId: null, config: null };

  const scope = `tenant:${tenantId}:ops.background`;
  const raw = await getSetting<any>(scope, "recurring_meeting", null);
  const config =
    raw && typeof raw === "object"
      ? {
          enabled:
            typeof raw.enabled === "boolean"
              ? raw.enabled
              : String(raw.enabled ?? "false").trim().toLowerCase() === "true",
          intervalMinutes: parsePositiveInt(raw.intervalMinutes ?? raw.interval_minutes, 30),
          topic: typeof raw.topic === "string" && raw.topic.trim() ? raw.topic.trim() : null,
          companyId: toPositiveIntOrNull(raw.companyId ?? raw.company_id),
          participantAgentIds: asPositiveIntArray(raw.participantAgentIds ?? raw.participant_agent_ids),
          objectiveId: toPositiveIntOrNull(raw.objectiveId ?? raw.objective_id ?? raw.goalId ?? raw.goal_id),
          agendaEventId: toPositiveIntOrNull(raw.agendaEventId ?? raw.agenda_event_id),
          updatedAt: raw.updatedAt ?? null,
          actionRequestId: toPositiveIntOrNull(raw.actionRequestId ?? raw.action_request_id),
        }
      : null;
  return { tenantId, config };
}

type BackgroundSessionStatus = "RUNNING" | "PAUSED" | "STOPPED" | "COMPLETED";
type BackgroundSession = {
  id: string;
  status: BackgroundSessionStatus;
  createdAt: string;
  startedAt: string;
  lastResumedAt: string;
  stoppedAt: string | null;
  durationSec: number;
  tokenBudget: number;
  tokenSpendEstimate: number;
  goalText: string;
  objectiveId: number;
  agendaEventId: number;
  companyId: number | null;
  participantAgentIds: number[];
  allowedProviders: string[];
  visibility: "internal" | "admin" | "public";
  hardStopAt: string | null;
  stopReason: string | null;
};

const TOKEN_ESTIMATE_PER_SEC = parsePositiveInt(process.env.AI_BACKGROUND_TOKENS_PER_SEC, 4);
const MAX_TRACKED_SESSIONS = 100;
const sessionStore = new Map<string, BackgroundSession>();
const sessionTimers = new Map<string, ReturnType<typeof setTimeout>>();
let activeSessionId: string | null = null;

function nowIso() {
  return new Date().toISOString();
}

function getSession(sessionId: string | null | undefined) {
  if (!sessionId) return null;
  return sessionStore.get(sessionId) || null;
}

function refreshSessionEstimate(session: BackgroundSession) {
  if (session.status !== "RUNNING") return session;
  const lastResumed = new Date(session.lastResumedAt).getTime();
  if (!Number.isFinite(lastResumed)) return session;
  const elapsedSec = Math.max(0, Math.floor((Date.now() - lastResumed) / 1000));
  const estimated = Math.min(session.tokenBudget, session.tokenSpendEstimate + elapsedSec * TOKEN_ESTIMATE_PER_SEC);
  session.tokenSpendEstimate = estimated;
  session.lastResumedAt = nowIso();
  return session;
}

function remainingSessionRunMs(session: BackgroundSession) {
  const remainingBudgetTokens = Math.max(0, session.tokenBudget - session.tokenSpendEstimate);
  const budgetSec = remainingBudgetTokens / Math.max(1, TOKEN_ESTIMATE_PER_SEC);
  const elapsedTotalSec = Math.max(0, Math.floor((Date.now() - new Date(session.startedAt).getTime()) / 1000));
  const durationRemainingSec = Math.max(0, session.durationSec - elapsedTotalSec);
  return Math.max(0, Math.floor(Math.min(durationRemainingSec, budgetSec) * 1000));
}

function clearSessionTimer(sessionId: string) {
  const timer = sessionTimers.get(sessionId);
  if (timer) clearTimeout(timer);
  sessionTimers.delete(sessionId);
}

function trimSessions() {
  if (sessionStore.size <= MAX_TRACKED_SESSIONS) return;
  const sessions = Array.from(sessionStore.values()).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const toDelete = sessions.slice(0, sessionStore.size - MAX_TRACKED_SESSIONS);
  for (const session of toDelete) {
    if (session.id === activeSessionId) continue;
    clearSessionTimer(session.id);
    sessionStore.delete(session.id);
  }
}

function markSessionStopped(session: BackgroundSession, status: "STOPPED" | "COMPLETED", reason: string) {
  refreshSessionEstimate(session);
  session.status = status;
  session.stoppedAt = nowIso();
  session.hardStopAt = null;
  session.stopReason = reason;
  clearSessionTimer(session.id);
  if (activeSessionId === session.id) {
    activeSessionId = null;
    stopBackgroundConversationEngine();
    stopOpsCommsAutopilot();
  }
}

function scheduleHardStop(session: BackgroundSession, runMs: number) {
  clearSessionTimer(session.id);
  session.hardStopAt = new Date(Date.now() + runMs).toISOString();
  const timer = setTimeout(() => {
    const latest = getSession(session.id);
    if (!latest || latest.status !== "RUNNING") return;
    markSessionStopped(latest, "COMPLETED", "duration_or_budget_exhausted");
  }, runMs);
  sessionTimers.set(session.id, timer);
}

function startSessionRuntime(session: BackgroundSession) {
  const runMs = remainingSessionRunMs(session);
  if (runMs <= 0) {
    markSessionStopped(session, "COMPLETED", "duration_or_budget_exhausted");
    return session;
  }

  if (activeSessionId && activeSessionId !== session.id) {
    const active = getSession(activeSessionId);
    if (active && active.status === "RUNNING") {
      markSessionStopped(active, "STOPPED", "superseded_by_new_session");
    }
  }

  session.status = "RUNNING";
  session.lastResumedAt = nowIso();
  activeSessionId = session.id;
  startBackgroundConversationEngine({ durationMs: runMs });
  startOpsCommsAutopilot({ durationMs: runMs });
  scheduleHardStop(session, runMs);
  return session;
}

function serializeSessions() {
  return Array.from(sessionStore.values())
    .map((session) => ({ ...refreshSessionEstimate(session) }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 25);
}

const router = Router();

router.get("/status", async (_req, res) => {
  const recurring = await readRecurringMeetingConfig();
  res.json({
    config: {
      aiEnabled: isAiEnabled(),
      aiBackgroundEnabled: isAiBackgroundEnabled(),
      aiBackgroundRuntimeOverride: getAiBackgroundRuntimeOverride(),
      cfoAgentEnabled: isCfoAgentEnabled(),
      aiBackgroundAutoStart: process.env.AI_BACKGROUND_AUTO_START === "true",
      cfoAgentAutoStart: process.env.AI_CFO_AGENT_AUTO_START === "true",
      actionsWorkerEnabled: ["1", "true", "yes", "y", "on"].includes(
        String(process.env.ACTIONS_WORKER_ENABLED || "").trim().toLowerCase(),
      ),
      recurringMeeting: recurring.config,
    },
    processes: {
      backgroundConversations: getBackgroundConversationEngineStatus(),
      opsCommsAutopilot: getOpsCommsAutopilotStatus(),
      cfoAgent: getCFOAgentStatus(),
      actionsRunner: getActionsWorkerStatus(),
    },
    backgroundSessions: {
      activeSessionId,
      tokenEstimatePerSec: TOKEN_ESTIMATE_PER_SEC,
      items: serializeSessions(),
    },
  });
});

router.get("/background/config", async (_req, res) => {
  const recurring = await readRecurringMeetingConfig();
  res.json({
    ok: true,
    tenantId: recurring.tenantId,
    recurringMeeting: recurring.config,
  });
});

router.post("/background/config", async (req, res) => {
  const tenantId = await resolveSettingsTenantId();
  if (!tenantId) return res.status(400).json({ message: "tenant required" });

  const enabled =
    typeof req.body?.enabled === "boolean"
      ? req.body.enabled
      : String(req.body?.enabled ?? "true").trim().toLowerCase() !== "false";
  const intervalMinutes = Math.min(24 * 60, Math.max(1, parsePositiveInt(req.body?.intervalMinutes, 30)));
  const topic = typeof req.body?.topic === "string" && req.body.topic.trim() ? req.body.topic.trim() : null;
  const companyId = toPositiveIntOrNull(req.body?.companyId);
  const participantAgentIds = asPositiveIntArray(req.body?.participantAgentIds);
  const objectiveId = toPositiveIntOrNull(req.body?.objectiveId ?? req.body?.objective_id ?? req.body?.goalId ?? req.body?.goal_id);
  const agendaEventId = toPositiveIntOrNull(req.body?.agendaEventId ?? req.body?.agenda_event_id);

  const scope = `tenant:${tenantId}:ops.background`;
  const value = {
    enabled,
    intervalMinutes,
    topic,
    companyId,
    participantAgentIds,
    objectiveId,
    agendaEventId,
    updatedAt: new Date().toISOString(),
  };

  await setSetting(scope, "recurring_meeting", value, "ops-center");

  res.json({
    ok: true,
    tenantId,
    recurringMeeting: value,
  });
});

router.post("/background/start", async (req, res, next) => {
  const durationMs = parseDurationMs(req.body?.durationMinutes);
  const durationSec = parsePositiveInt(req.body?.durationSec, Math.max(60, Math.floor((durationMs ?? 10 * 60_000) / 1000)));
  const tokenBudget = parsePositiveInt(req.body?.tokenBudget, 4000);
  const goalText = typeof req.body?.goalText === "string" ? req.body.goalText.trim() : "";
  const objectiveId = toPositiveIntOrNull(
    req.body?.objectiveId ?? req.body?.objective_id ?? req.body?.goalId ?? req.body?.goal_id,
  );
  const agendaEventId = toPositiveIntOrNull(req.body?.agendaEventId ?? req.body?.agenda_event_id);
  const companyId = toPositiveIntOrNull(req.body?.companyId);
  const participantAgentIds = asPositiveIntArray(req.body?.participantAgentIds);
  const allowedProviders = Array.isArray(req.body?.allowedProviders)
    ? req.body.allowedProviders.map((value: any) => String(value || "").trim()).filter(Boolean)
    : [];
  const visibilityRaw = String(req.body?.visibility || "internal").trim().toLowerCase();
  const visibility = visibilityRaw === "public" || visibilityRaw === "admin" ? visibilityRaw : "internal";
  const confirm = parseBool(req.body?.confirm);

  if (!goalText) {
    return res.status(400).json({ message: "goalText (agenda/objective) required" });
  }
  if (!objectiveId) {
    return res.status(400).json({ message: "objectiveId required before starting background conversations" });
  }
  if (!agendaEventId) {
    return res.status(400).json({ message: "agendaEventId required before starting background conversations" });
  }
  if (!companyId) {
    return res.status(400).json({ message: "companyId required" });
  }
  if (!participantAgentIds.length || participantAgentIds.length < 2) {
    return res.status(400).json({ message: "participantAgentIds must include at least 2 agent ids" });
  }

  const plan = {
    what: "Start background AI conversations between agents",
    why: "Runs agenda-driven agent-to-agent conversations and summaries without direct user prompts.",
    forHowLong: durationMs ? `For ${Math.round(durationMs / 60000)} minutes.` : "Until explicitly stopped.",
    resources: ["External AI API calls", "Database reads/writes", "Background timers"],
    howToAuthorize: [
      "Send this request again with `{ \"confirm\": true }`",
      "And ensure `AI_ENABLED=true` and `AI_BACKGROUND_ENABLED=true` in your environment",
    ],
    howToStop: ["Call `POST /api/ai/background/stop`"],
    visibility: "Use `GET /api/ai/status` to confirm what is running.",
  } as const;

  if (!confirm) {
    return res.status(428).json({ message: "Confirmation required", requiresConsent: true, plan });
  }

  try {
    const tenantId = toPositiveIntOrNull((req as any)?.tenant?.id) ?? (await resolveSettingsTenantId());
    const agenda = await db.query.meetings.findFirst({
      where:
        tenantId && tenantId > 0
          ? sql`${meetings.id} = ${agendaEventId} and coalesce(${meetings.tenantId}, ${tenantId}) = ${tenantId}`
          : eq(meetings.id, agendaEventId),
      columns: {
        id: true,
        companyId: true,
        metadata: true,
      },
    });
    if (!agenda) {
      return res.status(404).json({ message: "Agenda event not found" });
    }

    const agendaCompanyId = toPositiveIntOrNull(agenda.companyId);
    if (agendaCompanyId && agendaCompanyId !== companyId) {
      return res.status(422).json({ message: "agendaEventId does not belong to selected company" });
    }

    const agendaObjectiveId = toPositiveIntOrNull((agenda.metadata as any)?.objectiveId ?? (agenda.metadata as any)?.goalId);
    if (!agendaObjectiveId || agendaObjectiveId !== objectiveId) {
      return res.status(422).json({
        message: "agendaEventId must be linked to the same objectiveId",
      });
    }

    const objective = await db.query.goals.findFirst({
      where: eq(goals.id, objectiveId),
      columns: { id: true, companyId: true },
    });
    if (!objective) {
      return res.status(404).json({ message: "Objective not found" });
    }
    if (objective.companyId !== companyId) {
      return res.status(422).json({ message: "Objective must belong to selected company" });
    }

    // Allow explicit, time-bound background run without requiring an env flag change.
    // This override is visible in `/api/ai/status` and is cleared on stop/restart.
    const overrideMs = Math.max(60_000, durationSec * 1000);
    enableAiBackgroundRuntime(overrideMs + 30_000);

    assertAiBackgroundEnabled(plan);
    const session: BackgroundSession = {
      id: `bgs_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      status: "RUNNING",
      createdAt: nowIso(),
      startedAt: nowIso(),
      lastResumedAt: nowIso(),
      stoppedAt: null,
      durationSec,
      tokenBudget,
      tokenSpendEstimate: 0,
      goalText,
      objectiveId,
      agendaEventId,
      companyId,
      participantAgentIds,
      allowedProviders,
      visibility,
      hardStopAt: null,
      stopReason: null,
    };

    sessionStore.set(session.id, session);
    trimSessions();
    startSessionRuntime(session);

    return res.json({
      ok: true,
      session,
      status: getBackgroundConversationEngineStatus(),
      sessions: { activeSessionId, items: serializeSessions() },
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/background/sessions", (_req, res) => {
  res.json({
    ok: true,
    activeSessionId,
    items: serializeSessions(),
  });
});

router.get("/background/live", async (req, res) => {
  const companyId = Number(req.query?.companyId);
  const hasCompanyFilter = Number.isFinite(companyId) && companyId > 0;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  let closed = false;
  const sendSnapshot = async () => {
    if (closed) return;
    try {
      const rooms = await db.query.chatRooms.findMany({
        where: hasCompanyFilter
          ? sql`${chatRooms.metadata}->>'isBackgroundConversation' = 'true' and coalesce(${chatRooms.metadata}->>'companyId', ${chatRooms.metadata}->'context'->>'companyId', '') = ${String(companyId)}`
          : sql`${chatRooms.metadata}->>'isBackgroundConversation' = 'true'`,
        orderBy: [desc(chatRooms.createdAt)],
        limit: 20,
      });

      const recentMessages = await db.query.messages.findMany({
        where: sql`coalesce(${messages.metadata}->>'isBackgroundMessage','false') = 'true'`,
        orderBy: [desc(messages.createdAt)],
        limit: 120,
        with: {
          fromAgent: true,
        },
      });

      const payload = {
        ts: nowIso(),
        activeSessionId,
        sessions: serializeSessions(),
        rooms,
        messages: recentMessages.map((message: any) => ({
          id: message.id,
          conversationId: message.conversationId,
          content: message.content,
          createdAt: message.createdAt,
          metadata: message.metadata,
          fromAgent: message.fromAgent
            ? { id: message.fromAgent.id, name: message.fromAgent.name, role: message.fromAgent.role }
            : null,
        })),
      };

      res.write(`event: background_snapshot\ndata: ${JSON.stringify(payload)}\n\n`);
    } catch (error: any) {
      res.write(
        `event: background_error\ndata: ${JSON.stringify({
          ts: nowIso(),
          error: String(error?.message || error || "snapshot_failed"),
        })}\n\n`,
      );
    }
  };

  await sendSnapshot();
  const timer = setInterval(() => void sendSnapshot(), 2000);
  req.on("close", () => {
    closed = true;
    clearInterval(timer);
    res.end();
  });
});

router.post("/background/sessions/:sessionId/pause", (req, res) => {
  const session = getSession(req.params.sessionId);
  if (!session) return res.status(404).json({ message: "Session not found" });
  if (session.status !== "RUNNING") {
    return res.status(409).json({ message: `Cannot pause session in state ${session.status}` });
  }
  refreshSessionEstimate(session);
  session.status = "PAUSED";
  session.hardStopAt = null;
  clearSessionTimer(session.id);
  if (activeSessionId === session.id) {
    activeSessionId = null;
    stopBackgroundConversationEngine();
    stopOpsCommsAutopilot();
  }
  return res.json({ ok: true, session });
});

router.post("/background/sessions/:sessionId/resume", (req, res, next) => {
  const session = getSession(req.params.sessionId);
  if (!session) return res.status(404).json({ message: "Session not found" });
  if (session.status !== "PAUSED") {
    return res.status(409).json({ message: `Cannot resume session in state ${session.status}` });
  }

  try {
    assertAiBackgroundEnabled({
      what: "Resume background AI conversations",
      why: "Continue an already-created background session.",
      forHowLong: "Until remaining duration or token budget is exhausted.",
      resources: ["External AI API calls", "Database reads/writes", "Background timers"],
      howToAuthorize: ["Ensure AI feature flags are enabled"],
      howToStop: ["Call pause or stop on the session"],
    });
    startSessionRuntime(session);
    return res.json({ ok: true, session });
  } catch (error) {
    return next(error);
  }
});

router.post("/background/sessions/:sessionId/stop", (req, res) => {
  const session = getSession(req.params.sessionId);
  if (!session) return res.status(404).json({ message: "Session not found" });
  markSessionStopped(session, "STOPPED", "stopped_by_admin");
  disableAiBackgroundRuntime();
  return res.json({ ok: true, session });
});

router.post("/background/stop", (req, res) => {
  const requestedSessionId = typeof req.body?.sessionId === "string" ? req.body.sessionId.trim() : "";
  const session = requestedSessionId ? getSession(requestedSessionId) : getSession(activeSessionId);
  if (session) {
    markSessionStopped(session, "STOPPED", "stopped_by_admin");
  } else {
    stopBackgroundConversationEngine();
    stopOpsCommsAutopilot();
    activeSessionId = null;
  }
  disableAiBackgroundRuntime();
  res.json({ ok: true, status: getBackgroundConversationEngineStatus(), sessions: { activeSessionId, items: serializeSessions() } });
});

router.post("/cfo/start", (req, res, next) => {
  const durationMs = parseDurationMs(req.body?.durationMinutes);
  const confirm = parseBool(req.body?.confirm);

  const plan = {
    what: "Start the CFO monitoring loop",
    why: "Runs periodic monitoring and automation tasks in the background.",
    forHowLong: durationMs ? `For ${Math.round(durationMs / 60000)} minutes.` : "Until explicitly stopped.",
    resources: ["Database reads/writes", "Background timers"],
    howToAuthorize: [
      "Send this request again with `{ \"confirm\": true }`",
      "And ensure `AI_CFO_AGENT_ENABLED=true` in your environment",
    ],
    howToStop: ["Call `POST /api/ai/cfo/stop`"],
    visibility: "Use `GET /api/ai/status` to confirm what is running.",
  } as const;

  if (!confirm) {
    return res.status(428).json({ message: "Confirmation required", requiresConsent: true, plan });
  }

  try {
    assertCfoAgentEnabled(plan);
    initializeCFOAgent({ durationMs });
    return res.json({ ok: true, status: getCFOAgentStatus() });
  } catch (error) {
    if (error instanceof AiConsentRequiredError) return next(error);
    return next(error);
  }
});

router.post("/cfo/stop", (_req, res) => {
  stopCFOAgent();
  res.json({ ok: true, status: getCFOAgentStatus() });
});

export default router;
