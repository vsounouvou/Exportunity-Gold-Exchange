import { Router } from "express";
import { and, desc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@db";
import { agents, chatRooms, meetings, messages, roomMemberships, tasks } from "@db/schema";

import { generateAgentResponse } from "../lib/ai-provider";
import { dispatchAgentActionIntents, renderActionDispatchFeedback, stripAgentActionMarkers } from "../lib/actions/agentActionIntents";
import { ensureTenantStaff, isChairmanAssistantUser } from "./utils/auth";

type BrainstormStatus = "running" | "stopped" | "done" | "failed";

type BrainstormSettings = {
  agents_talk_to_each_other: boolean;
  summarize_at_end: boolean;
  create_tasks: boolean;
  allow_actions: boolean;
  max_tokens: number;
  max_messages: number;
};

type RunningSessionState = {
  stopRequested: boolean;
};

const router = Router();
const runningSessions = new Map<string, RunningSessionState>();

const DEFAULT_DURATION_SEC = 60;
const DEFAULT_MAX_DURATION_SEC = 600;
const DEFAULT_MAX_TOKENS = 12_000;
const DEFAULT_MAX_MESSAGES_PER_MIN = 14;
let participantsColumnKindCache: "jsonb" | "array" | null = null;

function parsePositiveInt(value: unknown, fallback: number) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.trunc(parsed);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getRows(result: any): any[] {
  if (Array.isArray(result?.rows)) return result.rows;
  if (Array.isArray(result)) return result;
  return [];
}

function sanitizeTopic(rawTopic: unknown) {
  const value = String(rawTopic ?? "").trim();
  return value.length ? value.slice(0, 2_000) : "Brainstorm session";
}

function parseParticipantIds(input: unknown): number[] {
  if (Array.isArray(input)) {
    return Array.from(
      new Set(
        input
          .map((value) => {
            if (typeof value === "number") return value;
            if (typeof value === "string") return Number(value);
            if (value && typeof value === "object") {
              const maybeId =
                (value as any).id ??
                (value as any).agentId ??
                (value as any).agent_id ??
                (value as any).value;
              return Number(maybeId);
            }
            return Number.NaN;
          })
          .filter((value) => Number.isFinite(value) && value > 0)
          .map((value) => Math.trunc(value)),
      ),
    );
  }

  if (typeof input === "string") {
    const raw = input.trim();
    if (!raw) return [];

    if (raw.startsWith("{") && raw.endsWith("}")) {
      const body = raw.slice(1, -1).trim();
      if (!body) return [];
      return parseParticipantIds(
        body
          .split(",")
          .map((token) => token.trim().replace(/^"|"$/g, ""))
          .filter(Boolean),
      );
    }

    if ((raw.startsWith("[") && raw.endsWith("]")) || (raw.startsWith("\"[") && raw.endsWith("]\""))) {
      try {
        const parsed = JSON.parse(raw);
        return parseParticipantIds(parsed);
      } catch {
        return [];
      }
    }

    return parseParticipantIds([raw]);
  }

  return Array.from(
    new Set(
      [input]
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && value > 0)
        .map((value) => Math.trunc(value)),
    ),
  );
}

function toPgIntArrayLiteral(values: number[]) {
  const safe = values
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0)
    .map((value) => Math.trunc(value));
  return `{${safe.join(",")}}`;
}

function toPgIntArraySql(values: number[]) {
  const safe = values
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0)
    .map((value) => Math.trunc(value));
  if (!safe.length) return sql`array[]::int[]`;
  return sql`array[${sql.join(safe.map((value) => sql`${value}`), sql`, `)}]::int[]`;
}

async function getParticipantsColumnKind(): Promise<"jsonb" | "array"> {
  if (participantsColumnKindCache) return participantsColumnKindCache;

  const rows = getRows(
    await db.execute(sql`
      select data_type, udt_name
      from information_schema.columns
      where table_schema = current_schema()
        and table_name = 'brainstorm_sessions'
        and column_name = 'participants_agent_ids'
      limit 1
    `),
  );

  const row = rows[0] || {};
  const dataType = String((row as any).data_type || "").toLowerCase();
  const udtName = String((row as any).udt_name || "").toLowerCase();

  participantsColumnKindCache = dataType === "array" || udtName.startsWith("_") ? "array" : "jsonb";
  return participantsColumnKindCache;
}

function normalizeSettings(input: unknown, durationSec: number): BrainstormSettings {
  const source = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const maxMessagesDefault = clamp(Math.ceil((durationSec / 60) * DEFAULT_MAX_MESSAGES_PER_MIN), 6, 320);
  return {
    agents_talk_to_each_other: source.agents_talk_to_each_other !== false,
    summarize_at_end: source.summarize_at_end !== false,
    create_tasks: source.create_tasks !== false,
    allow_actions: source.allow_actions === true,
    max_tokens: clamp(parsePositiveInt(source.max_tokens, DEFAULT_MAX_TOKENS), 500, 100_000),
    max_messages: clamp(parsePositiveInt(source.max_messages, maxMessagesDefault), 2, 500),
  };
}

function estimateTokensApprox(text: string) {
  const normalized = String(text || "").trim();
  if (!normalized) return 0;
  return Math.ceil(normalized.length / 4);
}

function isPrivilegedStaff(staffUser: any) {
  if (!staffUser) return false;
  const mode = String(staffUser.currentMode || "").toLowerCase();
  const rolesRaw = Array.isArray(staffUser.roles) ? staffUser.roles : [];
  const perms = Array.isArray(staffUser.permissions) ? staffUser.permissions : [];
  const roles = rolesRaw
    .map((value: any) => String(value || "").toLowerCase().replace(/[_-]+/g, " ").trim())
    .filter(Boolean);

  return (
    mode === "admin" ||
    perms.includes("*") ||
    perms.includes("admin:*") ||
    roles.includes("admin") ||
    roles.includes("owner") ||
    roles.includes("chairman") ||
    roles.includes("super admin") ||
    roles.includes("platform admin") ||
    isChairmanAssistantUser(staffUser)
  );
}

function inferLabel(text: string): "IDEA" | "QUESTION" | "DECISION" | "TASK" {
  const value = String(text || "").toLowerCase();
  if (/\btask\b|\baction item\b|\bowner\b/.test(value)) return "TASK";
  if (/\bdecision\b|\bdecide\b|\bapprove\b/.test(value)) return "DECISION";
  if (/\?$/.test(value.trim()) || /\bquestion\b|\bclarify\b/.test(value)) return "QUESTION";
  return "IDEA";
}

function parseTaskCandidates(text: string) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const tasks: Array<{ title: string; description: string }> = [];
  for (const line of lines) {
    const taskMatch =
      line.match(/^(?:[-*]\s*)?(?:task|action(?: item)?)\s*[:\-]\s*(.+)$/i) ||
      line.match(/^\[task\]\s*(.+)$/i);
    if (!taskMatch) continue;
    const title = String(taskMatch[1] || "").trim().slice(0, 220);
    if (!title) continue;
    tasks.push({
      title,
      description: title,
    });
  }

  return tasks.slice(0, 8);
}

async function getSessionById(sessionId: string, tenantId?: number) {
  if (tenantId) {
    const rows = getRows(
      await db.execute(sql`select * from brainstorm_sessions where id = ${sessionId} and tenant_id = ${tenantId} limit 1`),
    );
    return rows[0] ?? null;
  }
  const rows = getRows(await db.execute(sql`select * from brainstorm_sessions where id = ${sessionId} limit 1`));
  return rows[0] ?? null;
}

async function getConversationRoom(conversationId: string) {
  return db.query.chatRooms.findFirst({
    where: eq(chatRooms.conversationId, conversationId),
  });
}

async function listActiveRoomAgentIds(roomId: number) {
  const memberships = await db.query.roomMemberships.findMany({
    where: and(eq(roomMemberships.roomId, roomId), eq(roomMemberships.isActive, true)),
    columns: {
      agentId: true,
    },
  });

  return Array.from(
    new Set(
      memberships
        .map((membership: any) => Number(membership.agentId))
        .filter((value: number) => Number.isFinite(value) && value > 0)
        .map((value: number) => Math.trunc(value)),
    ),
  );
}

async function pushBrainstormMessage(input: {
  conversationId: string;
  content: string;
  fromAgentId: number | null;
  sessionId: string;
  label: string;
  metadata?: Record<string, unknown>;
}) {
  const [inserted] = await db
    .insert(messages)
    .values({
      content: input.content,
      fromAgentId: input.fromAgentId,
      toAgentId: null,
      type: "chat",
      status: "sent",
      deliveredAt: new Date(),
      conversationId: input.conversationId,
      metadata: {
        contextTags: ["brainstorm"],
        brainstorm: {
          sessionId: input.sessionId,
          label: input.label,
        },
        ...(input.metadata || {}),
      },
      createdAt: new Date(),
    } as any)
    .returning();

  return inserted;
}

async function createBrainstormTasks(input: {
  candidates: Array<{ title: string; description: string }>;
  companyId: number | null;
  agentId: number | null;
  meetingId: number | null;
  sourceMessageId: number | null;
}) {
  if (!input.candidates.length) return [];

  const created = [];
  for (const candidate of input.candidates.slice(0, 6)) {
    const [task] = await db
      .insert(tasks)
      .values({
        agentId: input.agentId,
        companyId: input.companyId,
        title: candidate.title,
        description: candidate.description || candidate.title,
        priority: "medium",
        status: "backlog",
        isAutomated: true,
        sourceMeetingId: input.meetingId,
        sourceMessageId: input.sourceMessageId,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any)
      .returning();

    created.push(task);
  }
  return created;
}

async function runBrainstormSession(sessionId: string) {
  const state = runningSessions.get(sessionId);
  if (!state) return;

  let session = await getSessionById(sessionId);
  if (!session) {
    runningSessions.delete(sessionId);
    return;
  }

  const startedAtMs = new Date(session.started_at || Date.now()).getTime();
  let durationSec = parsePositiveInt(session.duration_sec, DEFAULT_DURATION_SEC);
  let settings = normalizeSettings(session.settings_json, durationSec);
  let messageCount = parsePositiveInt(session.message_count, 0);
  let tokenUsage = parsePositiveInt(session.token_usage, 0);
  let speakerCursor = 0;
  let summaryMessageId: number | null = null;
  let finishStatus: BrainstormStatus = "done";
  let finishError: string | null = null;
  let budgetReached = false;

  const participantIds = parseParticipantIds(session.participants_agent_ids);
  const participants = await db.query.agents.findMany({
    where: participantIds.length ? inArray(agents.id, participantIds) : sql`false`,
    columns: {
      id: true,
      name: true,
      role: true,
      companyId: true,
      status: true,
    },
  });

  if (!participants.length || !session.conversation_id) {
    finishStatus = "failed";
    finishError = "No active participants or conversation for brainstorm session.";
  } else {
    const conversationId = String(session.conversation_id);
    const room = await getConversationRoom(conversationId);
    const companyId =
      Number.isFinite(Number(session.company_id)) && Number(session.company_id) > 0
        ? Number(session.company_id)
        : Number.isFinite(Number((room as any)?.metadata?.companyId)) && Number((room as any)?.metadata?.companyId) > 0
          ? Number((room as any)?.metadata?.companyId)
          : null;

    while (true) {
      if (state.stopRequested) {
        finishStatus = "stopped";
        break;
      }

      session = await getSessionById(sessionId);
      if (!session) {
        finishStatus = "failed";
        finishError = "Session lost during execution.";
        break;
      }

      const status = String(session.status || "").toLowerCase();
      if (status !== "running") {
        finishStatus = status === "stopped" ? "stopped" : "done";
        break;
      }

      durationSec = clamp(parsePositiveInt(session.duration_sec, durationSec), 30, 3_600);
      settings = normalizeSettings(session.settings_json, durationSec);
      const endAtMs = startedAtMs + durationSec * 1000;
      if (Date.now() >= endAtMs) break;

      if (messageCount >= settings.max_messages) {
        break;
      }
      if (tokenUsage >= settings.max_tokens) {
        budgetReached = true;
        break;
      }

      const speaker = participants[speakerCursor % participants.length];
      speakerCursor += 1;
      if (!speaker) break;

      const recentRows = await db.query.messages.findMany({
        where: eq(messages.conversationId, conversationId),
        orderBy: [desc(messages.createdAt)],
        limit: 30,
        with: {
          fromAgent: true,
        },
      });

      const recentMessages = recentRows
        .slice()
        .reverse()
        .map((row: any) => ({
          content: String(row.content || ""),
          fromAgent: {
            name: row.fromAgent?.name || "User",
            role: row.fromAgent?.role || (row.fromAgentId ? "Agent" : "User"),
          },
          timestamp: row.createdAt || new Date(),
        }));

      const turnInstruction = [
        `Brainstorm topic: ${String(session.topic || "General strategy")}`,
        "Rules:",
        "- Be concise and practical.",
        "- Build on previous messages.",
        "- End with one label: IDEA / QUESTION / DECISION / TASK.",
        settings.create_tasks ? "- Include explicit TASK lines when relevant." : "",
        settings.allow_actions ? "- Actions may be proposed." : "- Do not execute external actions.",
      ]
        .filter(Boolean)
        .join("\n");

      let responseText = "";
      let analysis = "";
      try {
        const generated = await generateAgentResponse(turnInstruction, {
          role: speaker.role || "assistant",
          agentId: speaker.id,
          companyId: companyId ?? speaker.companyId ?? null,
          context: {
            recentMessages,
            exchanges: recentMessages.length,
            roomName: room?.name || "Brainstorm",
            roomType: room?.type || "chat",
            sentiment: { score: 0 },
            activeAgents: participants.map((participant: any) => String(participant.name || "").trim()).filter(Boolean),
            participants: participants.map((participant: any) => ({
              name: String(participant.name || "").trim() || `Agent ${participant.id}`,
              role: String(participant.role || "").trim() || "agent",
            })),
          },
        });

        responseText = String(generated.response || "").trim();
        analysis = String(generated.analysis || "").trim();
      } catch (error: any) {
        const fallbackLabel = inferLabel(String(session.topic || ""));
        responseText = `${String(speaker.name || "Agent")} acknowledges the topic and proposes next steps.\n\n${fallbackLabel}: Continue with concrete options and owners.`;
        analysis = `fallback:${String(error?.message || error || "ai_unavailable")}`;
      }

      const strippedResponse = stripAgentActionMarkers(responseText).trim();
      const visibleResponse = settings.allow_actions ? (strippedResponse || responseText) : strippedResponse || responseText;
      if (!visibleResponse.trim()) {
        await sleep(700);
        continue;
      }

      const label = inferLabel(visibleResponse);
      const postedMessage = await pushBrainstormMessage({
        conversationId,
        content: visibleResponse,
        fromAgentId: speaker.id,
        sessionId,
        label,
        metadata: {
          brainstormTurn: messageCount + 1,
          analysis: analysis || null,
          brainstormTopic: session.topic,
        },
      });

      messageCount += 1;
      tokenUsage += estimateTokensApprox(turnInstruction) + estimateTokensApprox(visibleResponse);

      await db.execute(sql`
        update brainstorm_sessions
        set message_count = ${messageCount},
            token_usage = ${tokenUsage},
            updated_at = now()
        where id = ${sessionId}
      `);

      if (settings.create_tasks) {
        const candidates = parseTaskCandidates(visibleResponse);
        if (candidates.length) {
          await createBrainstormTasks({
            candidates,
            companyId,
            agentId: speaker.id,
            meetingId: Number.isFinite(Number(session.meeting_id)) ? Number(session.meeting_id) : null,
            sourceMessageId: Number.isFinite(Number(postedMessage.id)) ? Number(postedMessage.id) : null,
          });
        }
      }

      if (settings.allow_actions) {
        const dispatch = await dispatchAgentActionIntents({
          text: responseText,
          tenantId: Number(session.tenant_id),
          conversationId,
          source: "brainstorm.session",
          companyId,
          channelId: room?.type || "chat",
          requestedByUserId: Number.isFinite(Number(session.created_by_user_id))
            ? Number(session.created_by_user_id)
            : null,
          isAdmin: true,
          agent: {
            id: speaker.id,
            name: speaker.name || null,
            role: speaker.role || null,
          },
        });

        if (dispatch.created.length || dispatch.blocked.length) {
          await pushBrainstormMessage({
            conversationId,
            content: renderActionDispatchFeedback(dispatch),
            fromAgentId: null,
            sessionId,
            label: "TASK",
            metadata: {
              contextTags: ["action-feedback"],
              dispatch,
            },
          });
        }
      }

      await sleep(settings.agents_talk_to_each_other ? 900 : 1500);
    }

    if (budgetReached) {
      finishStatus = "done";
      finishError = "Budget cap reached.";
    }

    if (settings.summarize_at_end && finishStatus !== "failed") {
      const transcriptRows = await db.query.messages.findMany({
        where: eq(messages.conversationId, conversationId),
        orderBy: [desc(messages.createdAt)],
        limit: 40,
        with: {
          fromAgent: true,
        },
      });

      const transcript = transcriptRows
        .slice()
        .reverse()
        .map((row: any) => {
          const speakerName = row.fromAgent?.name || "User";
          return `${speakerName}: ${String(row.content || "").trim()}`;
        })
        .filter(Boolean)
        .join("\n");

      const moderator = participants[0];
      if (moderator) {
        const summaryPrompt = [
          `Summarize brainstorm topic: ${String(session.topic || "General strategy")}`,
          "Return sections: Summary, Decisions, Tasks.",
          "Tasks should include owner role and due-date hint if inferable.",
          "",
          transcript.slice(-12_000),
        ].join("\n");

        try {
          const summary = await generateAgentResponse(summaryPrompt, {
            role: moderator.role || "coordinator",
            agentId: moderator.id,
            companyId: companyId ?? moderator.companyId ?? null,
            context: {
              recentMessages: transcriptRows
                .slice()
                .reverse()
                .map((row: any) => ({
                  content: String(row.content || ""),
                  fromAgent: {
                    name: row.fromAgent?.name || "User",
                    role: row.fromAgent?.role || "user",
                  },
                  timestamp: row.createdAt || new Date(),
                })),
              exchanges: transcriptRows.length,
              roomName: room?.name || "Brainstorm",
              roomType: room?.type || "chat",
              sentiment: { score: 0 },
              activeAgents: participants.map((participant: any) => String(participant.name || "").trim()).filter(Boolean),
              participants: participants.map((participant: any) => ({
                name: String(participant.name || "").trim() || `Agent ${participant.id}`,
                role: String(participant.role || "").trim() || "agent",
              })),
            },
          });

          const summaryMessage = await pushBrainstormMessage({
            conversationId,
            content: String(summary.response || "").trim() || "Brainstorm session completed.",
            fromAgentId: moderator.id,
            sessionId,
            label: "DECISION",
            metadata: {
              brainstormSummary: true,
            },
          });

          summaryMessageId = Number.isFinite(Number(summaryMessage.id)) ? Number(summaryMessage.id) : null;

          if (settings.create_tasks) {
            const summaryTasks = parseTaskCandidates(String(summary.response || ""));
            if (summaryTasks.length) {
              await createBrainstormTasks({
                candidates: summaryTasks,
                companyId,
                agentId: moderator.id,
                meetingId: Number.isFinite(Number(session.meeting_id)) ? Number(session.meeting_id) : null,
                sourceMessageId: summaryMessageId,
              });
            }
          }
        } catch (error: any) {
          finishError = finishError || `Summary generation failed: ${String(error?.message || error || "unknown_error")}`;
        }
      }
    }
  }

  await db.execute(sql`
    update brainstorm_sessions
    set status = ${finishStatus},
        ended_at = coalesce(ended_at, now()),
        summary_message_id = ${summaryMessageId},
        message_count = ${messageCount},
        token_usage = ${tokenUsage},
        error = ${finishError},
        updated_at = now()
    where id = ${sessionId}
  `);

  runningSessions.delete(sessionId);
}

router.use(ensureTenantStaff);

router.post("/start", async (req: any, res) => {
  try {
    const tenant = req.tenant;
    if (!tenant) return res.status(500).json({ message: "Tenant not resolved" });

    const staffUser = req.staffUser;
    const maxDurationSec = clamp(
      parsePositiveInt(process.env.BRAINSTORM_MAX_DURATION_SEC, DEFAULT_MAX_DURATION_SEC),
      30,
      3600,
    );
    const longDurationLimitSec = clamp(
      parsePositiveInt(process.env.BRAINSTORM_LONG_DURATION_LIMIT_SEC, 300),
      60,
      maxDurationSec,
    );

    const body = req.body && typeof req.body === "object" ? req.body : {};
    const meetingId =
      Number.isFinite(Number(body.meeting_id ?? body.meetingId)) && Number(body.meeting_id ?? body.meetingId) > 0
        ? Math.trunc(Number(body.meeting_id ?? body.meetingId))
        : null;

    let conversationId = String(body.conversation_id ?? body.conversationId ?? "").trim();
    let companyId =
      Number.isFinite(Number(body.company_id ?? body.companyId)) && Number(body.company_id ?? body.companyId) > 0
        ? Math.trunc(Number(body.company_id ?? body.companyId))
        : null;

    let linkedMeeting: any = null;
    if (meetingId) {
      linkedMeeting = await db.query.meetings.findFirst({
        where: and(eq(meetings.id, meetingId), eq(meetings.tenantId, tenant.id)),
        columns: {
          id: true,
          conversationId: true,
          companyId: true,
        },
      });
      if (!linkedMeeting) {
        return res.status(404).json({ message: "Meeting not found for this tenant" });
      }
      if (!conversationId && linkedMeeting.conversationId) conversationId = String(linkedMeeting.conversationId);
      if (!companyId && Number.isFinite(Number(linkedMeeting.companyId)) && Number(linkedMeeting.companyId) > 0) {
        companyId = Math.trunc(Number(linkedMeeting.companyId));
      }
    }

    if (!conversationId) {
      return res.status(400).json({ message: "conversation_id (or meeting_id) is required" });
    }

    const requestedDurationSec = parsePositiveInt(body.duration_sec ?? body.durationSec, DEFAULT_DURATION_SEC);
    const durationSec = clamp(requestedDurationSec, 30, maxDurationSec);
    if (durationSec > longDurationLimitSec && !isPrivilegedStaff(staffUser)) {
      return res.status(403).json({
        message: `Only owner/admin can run brainstorm longer than ${Math.floor(longDurationLimitSec / 60)} minutes`,
      });
    }

    const room = await getConversationRoom(conversationId);
    if (!companyId && Number.isFinite(Number((room as any)?.metadata?.companyId)) && Number((room as any)?.metadata?.companyId) > 0) {
      companyId = Math.trunc(Number((room as any).metadata.companyId));
    }
    if (!companyId) {
      const channelCompanyMatch = conversationId.match(/^channel:(\d+):/i);
      if (channelCompanyMatch?.[1]) companyId = Math.trunc(Number(channelCompanyMatch[1]));
    }

    let participants = parseParticipantIds(body.participants ?? body.participants_agent_ids);
    if (!participants.length && room?.id) {
      participants = await listActiveRoomAgentIds(room.id);
    }
    if (!participants.length && companyId) {
      const fallbackAgents = await db.query.agents.findMany({
        where: and(eq(agents.companyId, companyId), eq(agents.status, "active" as any)),
        columns: { id: true },
        limit: 4,
      });
      participants = fallbackAgents.map((agent: any) => Number(agent.id)).filter((id: number) => Number.isFinite(id) && id > 0);
    }

    if (participants.length < 1) {
      return res.status(400).json({ message: "At least one participant agent is required" });
    }

    const settings = normalizeSettings(body.settings, durationSec);
    const topic = sanitizeTopic(body.topic || body.prompt || "Brainstorm session");

    const existingRunningRows = getRows(
      await db.execute(sql`
        select id
        from brainstorm_sessions
        where tenant_id = ${tenant.id}
          and conversation_id = ${conversationId}
          and status = 'running'
      `),
    );
    for (const row of existingRunningRows) {
      const existingId = String(row?.id || "").trim();
      if (!existingId) continue;
      const existingState = runningSessions.get(existingId);
      if (existingState) existingState.stopRequested = true;
      await db.execute(sql`
        update brainstorm_sessions
        set status = 'stopped',
            ended_at = now(),
            updated_at = now()
        where id = ${existingId}
      `);
    }

    const sessionId = `brainstorm_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
    const createdByUserId = Number.isFinite(Number(staffUser?.id)) ? Math.trunc(Number(staffUser.id)) : null;

    const settingsJson = JSON.stringify(settings || {});
    const participantArray = participants
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value > 0)
      .map((value) => Math.trunc(value));
    const participantsJson = JSON.stringify(participantArray);
    const participantsColumnKind = await getParticipantsColumnKind();

    if (participantsColumnKind === "array") {
      await db.execute(sql`
        insert into brainstorm_sessions (
          id,
          tenant_id,
          conversation_id,
          meeting_id,
          company_id,
          created_by_user_id,
          topic,
          duration_sec,
          status,
          settings_json,
          participants_agent_ids,
          max_tokens,
          started_at,
          created_at,
          updated_at
        ) values (
          ${sessionId},
          ${tenant.id},
          ${conversationId},
          ${meetingId},
          ${companyId},
          ${createdByUserId},
          ${topic},
          ${durationSec},
          'running',
          ${settingsJson}::jsonb,
          ${toPgIntArraySql(participantArray)},
          ${settings.max_tokens},
          now(),
          now(),
          now()
        )
      `);
    } else {
      await db.execute(sql`
        insert into brainstorm_sessions (
          id,
          tenant_id,
          conversation_id,
          meeting_id,
          company_id,
          created_by_user_id,
          topic,
          duration_sec,
          status,
          settings_json,
          participants_agent_ids,
          max_tokens,
          started_at,
          created_at,
          updated_at
        ) values (
          ${sessionId},
          ${tenant.id},
          ${conversationId},
          ${meetingId},
          ${companyId},
          ${createdByUserId},
          ${topic},
          ${durationSec},
          'running',
          ${settingsJson}::jsonb,
          ${participantsJson}::jsonb,
          ${settings.max_tokens},
          now(),
          now(),
          now()
        )
      `);
    }

    runningSessions.set(sessionId, { stopRequested: false });
    void runBrainstormSession(sessionId).catch(async (error: any) => {
      const message = String(error?.message || error || "brainstorm_failed");
      console.error(`[Brainstorm] session ${sessionId} failed:`, message);
      runningSessions.delete(sessionId);
      await db.execute(sql`
        update brainstorm_sessions
        set status = 'failed',
            ended_at = now(),
            error = ${message},
            updated_at = now()
        where id = ${sessionId}
      `);
    });

    const session = await getSessionById(sessionId, tenant.id);
    return res.status(201).json({
      ok: true,
      session,
    });
  } catch (error: any) {
    console.error("[Brainstorm] start failed:", error);
    return res.status(500).json({ message: error?.message || "Failed to start brainstorm session" });
  }
});

router.post("/extend", async (req: any, res) => {
  try {
    const tenant = req.tenant;
    if (!tenant) return res.status(500).json({ message: "Tenant not resolved" });

    const staffUser = req.staffUser;
    const maxDurationSec = clamp(
      parsePositiveInt(process.env.BRAINSTORM_MAX_DURATION_SEC, DEFAULT_MAX_DURATION_SEC),
      30,
      3600,
    );
    const longDurationLimitSec = clamp(
      parsePositiveInt(process.env.BRAINSTORM_LONG_DURATION_LIMIT_SEC, 300),
      60,
      maxDurationSec,
    );

    const body = req.body && typeof req.body === "object" ? req.body : {};
    const sessionId = String(body.session_id ?? body.sessionId ?? "").trim();
    if (!sessionId) return res.status(400).json({ message: "session_id is required" });

    const extendSec = clamp(parsePositiveInt(body.extend_sec ?? body.extendSec, 60), 30, 900);
    const session = await getSessionById(sessionId, tenant.id);
    if (!session) return res.status(404).json({ message: "Session not found" });
    if (String(session.status || "").toLowerCase() !== "running") {
      return res.status(400).json({ message: "Only running sessions can be extended" });
    }

    const currentDuration = clamp(parsePositiveInt(session.duration_sec, DEFAULT_DURATION_SEC), 30, maxDurationSec);
    const nextDuration = clamp(currentDuration + extendSec, 30, maxDurationSec);

    if (nextDuration > longDurationLimitSec && !isPrivilegedStaff(staffUser)) {
      return res.status(403).json({
        message: `Only owner/admin can run brainstorm longer than ${Math.floor(longDurationLimitSec / 60)} minutes`,
      });
    }

    await db.execute(sql`
      update brainstorm_sessions
      set duration_sec = ${nextDuration},
          updated_at = now()
      where id = ${sessionId}
        and tenant_id = ${tenant.id}
        and status = 'running'
    `);

    const updated = await getSessionById(sessionId, tenant.id);
    return res.json({ ok: true, session: updated });
  } catch (error: any) {
    console.error("[Brainstorm] extend failed:", error);
    return res.status(500).json({ message: error?.message || "Failed to extend brainstorm session" });
  }
});

router.post("/stop", async (req: any, res) => {
  try {
    const tenant = req.tenant;
    if (!tenant) return res.status(500).json({ message: "Tenant not resolved" });

    const body = req.body && typeof req.body === "object" ? req.body : {};
    const sessionId = String(body.session_id ?? body.sessionId ?? "").trim();
    if (!sessionId) return res.status(400).json({ message: "session_id is required" });

    const session = await getSessionById(sessionId, tenant.id);
    if (!session) return res.status(404).json({ message: "Session not found" });

    const state = runningSessions.get(sessionId);
    if (state) state.stopRequested = true;

    await db.execute(sql`
      update brainstorm_sessions
      set status = case when status = 'running' then 'stopped' else status end,
          ended_at = case when status = 'running' then now() else ended_at end,
          updated_at = now()
      where id = ${sessionId}
        and tenant_id = ${tenant.id}
    `);

    const updated = await getSessionById(sessionId, tenant.id);
    return res.json({ ok: true, session: updated });
  } catch (error: any) {
    console.error("[Brainstorm] stop failed:", error);
    return res.status(500).json({ message: error?.message || "Failed to stop brainstorm session" });
  }
});

router.get("/active", async (req: any, res) => {
  try {
    const tenant = req.tenant;
    if (!tenant) return res.status(500).json({ message: "Tenant not resolved" });

    const conversationId = String(req.query?.conversation_id ?? req.query?.conversationId ?? "").trim();
    const meetingIdRaw = Number(req.query?.meeting_id ?? req.query?.meetingId);
    const meetingId = Number.isFinite(meetingIdRaw) && meetingIdRaw > 0 ? Math.trunc(meetingIdRaw) : null;
    if (!conversationId && !meetingId) {
      return res.status(400).json({ message: "conversation_id or meeting_id is required" });
    }

    const rows = conversationId
      ? getRows(
          await db.execute(sql`
            select *
            from brainstorm_sessions
            where tenant_id = ${tenant.id}
              and conversation_id = ${conversationId}
              and status = 'running'
            order by started_at desc
            limit 1
          `),
        )
      : getRows(
          await db.execute(sql`
            select *
            from brainstorm_sessions
            where tenant_id = ${tenant.id}
              and meeting_id = ${meetingId}
              and status = 'running'
            order by started_at desc
            limit 1
          `),
        );

    return res.json({ ok: true, session: rows[0] ?? null });
  } catch (error: any) {
    console.error("[Brainstorm] active lookup failed:", error);
    return res.status(500).json({ message: error?.message || "Failed to fetch active brainstorm session" });
  }
});

router.get("/session", async (req: any, res) => {
  try {
    const tenant = req.tenant;
    if (!tenant) return res.status(500).json({ message: "Tenant not resolved" });

    const sessionId = String(req.query?.session_id ?? req.query?.sessionId ?? "").trim();
    if (!sessionId) return res.status(400).json({ message: "session_id is required" });

    const session = await getSessionById(sessionId, tenant.id);
    if (!session) return res.status(404).json({ message: "Session not found" });

    return res.json({ ok: true, session });
  } catch (error: any) {
    console.error("[Brainstorm] session lookup failed:", error);
    return res.status(500).json({ message: error?.message || "Failed to fetch brainstorm session" });
  }
});

router.get("/:id", async (req: any, res) => {
  try {
    const tenant = req.tenant;
    if (!tenant) return res.status(500).json({ message: "Tenant not resolved" });
    const sessionId = String(req.params.id || "").trim();
    if (!sessionId) return res.status(400).json({ message: "session id is required" });

    const session = await getSessionById(sessionId, tenant.id);
    if (!session) return res.status(404).json({ message: "Session not found" });

    return res.json({ ok: true, session });
  } catch (error: any) {
    console.error("[Brainstorm] status failed:", error);
    return res.status(500).json({ message: error?.message || "Failed to fetch brainstorm session" });
  }
});

export default router;
