import { Router } from "express";
import { db } from "@db";
import { assistantMessages, assistantThreads } from "@db/schema";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import multer from "multer";
import { resolveChairmanAssistant } from "../lib/chairman-assistant";
import { generateAgentResponse } from "../lib/ai-provider";
import {
  dispatchAgentActionIntents,
  renderActionDispatchFeedback,
  stripAgentActionMarkers,
} from "../lib/actions/agentActionIntents";
import { createActionRun } from "../lib/actions/actionRuns";
import { createActionRequest, isKnownActionType, type ActionType } from "../lib/actions/ActionRouter";
import { resolveChairmanConsoleActor } from "./utils/chairman-console-auth";
import { persistChatAttachment } from "../lib/uploads/chatAttachments";

const router = Router();
const assistantAttachmentMaxBytesRaw = Number(process.env.CHAT_ATTACHMENT_MAX_BYTES || 20 * 1024 * 1024);
const assistantAttachmentMaxBytes = Number.isFinite(assistantAttachmentMaxBytesRaw)
  ? Math.max(1 * 1024 * 1024, Math.min(50 * 1024 * 1024, Math.trunc(assistantAttachmentMaxBytesRaw)))
  : 20 * 1024 * 1024;
const assistantAttachmentUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: assistantAttachmentMaxBytes,
    files: 1,
  },
});

function parseIntSafe(value: unknown) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

function toObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  return {};
}

function rows<T = any>(result: unknown): T[] {
  const candidate = (result as any)?.rows;
  return Array.isArray(candidate) ? (candidate as T[]) : [];
}

function toAttachment(entry: any, index: number) {
  const name = typeof entry?.name === "string" ? entry.name.trim() : "";
  if (!name) return null;
  const type = typeof entry?.type === "string" ? entry.type.trim() : "";
  const urlRaw = typeof entry?.url === "string" ? entry.url.trim() : "";
  const url = urlRaw && (/^https?:\/\//i.test(urlRaw) || urlRaw.startsWith("/")) ? urlRaw : null;
  const sizeRaw = Number(entry?.size ?? 0);
  const size = Number.isFinite(sizeRaw) && sizeRaw >= 0 ? Math.trunc(sizeRaw) : 0;
  const textPreviewRaw = typeof entry?.textPreview === "string" ? entry.textPreview : "";
  const textPreview = textPreviewRaw.trim().slice(0, 2000);
  const versionRaw = Number(entry?.version ?? 1);
  const version = Number.isFinite(versionRaw) && versionRaw > 0 ? Math.trunc(versionRaw) : 1;
  return {
    id: typeof entry?.id === "string" && entry.id.trim() ? entry.id.trim() : `att-${index + 1}`,
    name: name.slice(0, 180),
    type: type.slice(0, 120),
    size,
    version,
    ...(url ? { url } : {}),
    ...(textPreview ? { textPreview } : {}),
  };
}

async function getThreadOrCreate(input: {
  tenantId: number;
  userId: number;
  assistant: any;
  threadId?: number | null;
  forceNew?: boolean;
}) {
  if (input.threadId) {
    const existing = await db.query.assistantThreads.findFirst({
      where: and(
        eq(assistantThreads.id, input.threadId),
        eq(assistantThreads.tenantId, input.tenantId),
        eq(assistantThreads.userId, input.userId),
      ),
    });
    if (existing) return existing;
  }

  if (!input.forceNew) {
    const existing = await db.query.assistantThreads.findFirst({
      where: and(
        eq(assistantThreads.tenantId, input.tenantId),
        eq(assistantThreads.userId, input.userId),
        eq(assistantThreads.assistantAgentId, input.assistant.id),
      ),
      orderBy: [desc(assistantThreads.updatedAt)],
    });
    if (existing) return existing;
  }

  const [created] = await db
    .insert(assistantThreads)
    .values({
      tenantId: input.tenantId,
      userId: input.userId,
      assistantAgentId: input.assistant.id,
      assistantDisplayName: input.assistant.displayName ?? input.assistant.name,
      assistantRole: input.assistant.role,
      status: "active",
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();
  return created;
}

async function fetchRecentMessages(threadId: number, limit = 12) {
  return db.query.assistantMessages.findMany({
    where: eq(assistantMessages.threadId, threadId),
    orderBy: [desc(assistantMessages.createdAt)],
    limit,
  });
}

function buildRecentContext(messages: any[], assistant: any, user: any) {
  const ordered = [...messages].reverse();
  return ordered.map((message) => ({
    content: message.content,
    fromAgent: {
      name:
        message.senderType === "assistant"
          ? assistant.displayName ?? assistant.name
          : message.senderName ?? user.displayName ?? "Chairman",
      role: message.senderType === "assistant" ? assistant.role ?? "assistant" : "chairman",
    },
    timestamp: new Date(message.createdAt ?? Date.now()),
  }));
}

function extractGenericActionMarkers(text: string) {
  const results: Array<{ actionKey: string; payload: Record<string, unknown> }> = [];
  const matcher = /\[\[\s*ACTION\s*:\s*([A-Z0-9_]+)\s*([\s\S]*?)\]\]/gi;
  let match: RegExpExecArray | null = null;
  while ((match = matcher.exec(text)) !== null) {
    const actionKey = String(match[1] || "").trim();
    if (!actionKey) continue;
    const payloadText = String(match[2] || "").trim();
    let payload: Record<string, unknown> = {};
    if (payloadText.startsWith("{")) {
      try {
        const parsed = JSON.parse(payloadText);
        payload = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
      } catch {
        payload = {};
      }
    }
    results.push({ actionKey, payload });
  }
  return results;
}

function looksLikeActionRequest(text: string) {
  const normalized = String(text || "").trim().toLowerCase();
  if (!normalized) return false;
  return /\b(send|sms|whatsapp|email|schedule|meeting|invite|create|open|navigate|assign|task|goal|objective|remind|book|call)\b/i.test(
    normalized,
  );
}

async function queueAssistantAction(input: {
  tenantId: number;
  userId: number;
  assistantId: number | null;
  threadId: number | null;
  messageId: number | null;
  actionType: string;
  payload?: Record<string, unknown>;
  requestedByAgentKey?: string | null;
  idempotencyKey?: string | null;
  correlationId?: string | null;
  relatedConversationId?: string | null;
}) {
  const actionType = String(input.actionType || "").trim().toUpperCase();
  const payload = toObject(input.payload ?? {});
  const relatedConversationId =
    typeof input.relatedConversationId === "string" && input.relatedConversationId.trim()
      ? input.relatedConversationId.trim()
      : input.threadId
        ? `assistant-thread:${input.threadId}`
        : null;

  if (isKnownActionType(actionType)) {
    const row = await createActionRequest({
      tenantId: input.tenantId,
      requestedByUserId: input.userId,
      requestedByAgentKey: input.requestedByAgentKey ?? null,
      actionType: actionType as ActionType,
      payload,
      priority: 8,
      idempotencyKey: input.idempotencyKey ?? null,
      relatedConversationId,
      relatedThreadId: input.threadId ?? null,
      correlationId: input.correlationId ?? null,
      mode: "REAL",
      isAdmin: true,
    });
    return {
      id: Number(row.id),
      status: String(row.status || "QUEUED"),
      state: String((row as any).state || (row as any).lifecycleState || "").trim() || null,
      publicActionId: String((row as any).publicActionId || (row as any).public_action_id || "").trim() || null,
      correlationId: String((row as any).correlationId || (row as any).correlation_id || "").trim() || null,
      label: String((row as any).publicActionId || (row as any).public_action_id || "").trim() || `ACT-${String(row.id).padStart(6, "0")}`,
      source: "legacy" as const,
    };
  }

  const run = await createActionRun({
    tenantId: input.tenantId,
    actionKey: actionType,
    payload,
    requestedByUserId: input.userId,
    requestedByAgentId: input.assistantId,
    threadId: input.threadId,
    messageId: input.messageId,
    correlationId: input.correlationId ?? null,
  });

  return {
    id: Number(run.id),
    status: String(run.status || "PENDING"),
    state: String((run as any).status || "").trim() || null,
    publicActionId: null,
    correlationId: String((run as any).correlationId || (run as any).correlation_id || "").trim() || null,
    label: `RUN-${String(run.id)}`,
    source: "chairman" as const,
  };
}

router.post("/thread", async (req, res) => {
  const auth = await resolveChairmanConsoleActor(req, { allowAdminOverride: true });
  if (!auth.ok) return res.status(auth.status).json({ message: auth.message });
  const tenantId = Number(req.tenant?.id);
  if (!Number.isFinite(tenantId) || tenantId <= 0) {
    return res.status(400).json({ message: "Tenant not resolved" });
  }

  const assistant = await resolveChairmanAssistant(tenantId);
  const thread = await getThreadOrCreate({
    tenantId,
    userId: Number(auth.user.id),
    assistant,
    threadId: parseIntSafe(req.body?.threadId ?? req.body?.thread_id) ?? null,
    forceNew: Boolean(req.body?.forceNew ?? req.body?.force_new),
  });

  res.json({ thread, assistant });
});

router.get("/threads", async (req, res) => {
  const auth = await resolveChairmanConsoleActor(req, { allowAdminOverride: true });
  if (!auth.ok) return res.status(auth.status).json({ message: auth.message });
  const tenantId = Number(req.tenant?.id);
  if (!Number.isFinite(tenantId) || tenantId <= 0) {
    return res.status(400).json({ message: "Tenant not resolved" });
  }

  const limit = Math.max(1, Math.min(50, Number(req.query?.limit || 10)));
  const threads = await db.query.assistantThreads.findMany({
    where: and(eq(assistantThreads.tenantId, tenantId), eq(assistantThreads.userId, Number(auth.user.id))),
    orderBy: [desc(assistantThreads.updatedAt)],
    limit,
  });

  const threadIds = threads.map((thread) => Number(thread.id)).filter((id) => Number.isFinite(id) && id > 0);
  const threadIdsSql = sql.join(
    threadIds.map((id) => sql`${id}`),
    sql`, `,
  );
  const latestMessages =
    threadIds.length > 0
      ? await db.execute(sql`
          select distinct on (thread_id)
            thread_id,
            content,
            created_at
          from assistant_messages
          where thread_id in (${threadIdsSql})
          order by thread_id, created_at desc
        `)
      : { rows: [] };
  const lastMessageByThread = new Map<number, any>();
  for (const row of rows<any>(latestMessages)) {
    lastMessageByThread.set(Number(row.thread_id), row);
  }

  res.json({
    threads: threads.map((thread) => ({
      ...thread,
      lastMessage: lastMessageByThread.get(Number(thread.id)) ?? null,
    })),
  });
});

router.get("/thread/:id/messages", async (req, res) => {
  const auth = await resolveChairmanConsoleActor(req, { allowAdminOverride: true });
  if (!auth.ok) return res.status(auth.status).json({ message: auth.message });
  const tenantId = Number(req.tenant?.id);
  if (!Number.isFinite(tenantId) || tenantId <= 0) {
    return res.status(400).json({ message: "Tenant not resolved" });
  }

  const threadId = parseIntSafe(req.params.id);
  if (!threadId) return res.status(400).json({ message: "Invalid thread id" });

  const thread = await db.query.assistantThreads.findFirst({
    where: and(
      eq(assistantThreads.id, threadId),
      eq(assistantThreads.tenantId, tenantId),
      eq(assistantThreads.userId, Number(auth.user.id)),
    ),
  });
  if (!thread) return res.status(404).json({ message: "Thread not found" });

  const limit = Math.max(1, Math.min(200, Number(req.query?.limit || 50)));
  const messages = await db.query.assistantMessages.findMany({
    where: eq(assistantMessages.threadId, threadId),
    orderBy: [asc(assistantMessages.createdAt)],
    limit,
  });

  res.json({ thread, messages });
});

router.post("/thread/:id/attachments", (req, res) => {
  assistantAttachmentUpload.single("file")(req as any, res as any, async (uploadError: any) => {
    if (uploadError) {
      const status = uploadError?.code === "LIMIT_FILE_SIZE" ? 413 : 400;
      return res.status(status).json({ message: uploadError?.message || "Attachment upload failed" });
    }

    try {
      const auth = await resolveChairmanConsoleActor(req, { allowAdminOverride: true });
      if (!auth.ok) return res.status(auth.status).json({ message: auth.message });
      const tenantId = Number(req.tenant?.id);
      if (!Number.isFinite(tenantId) || tenantId <= 0) {
        return res.status(400).json({ message: "Tenant not resolved" });
      }

      const threadId = parseIntSafe(req.params.id);
      if (!threadId) return res.status(400).json({ message: "Invalid thread id" });
      const thread = await db.query.assistantThreads.findFirst({
        where: and(
          eq(assistantThreads.id, threadId),
          eq(assistantThreads.tenantId, tenantId),
          eq(assistantThreads.userId, Number(auth.user.id)),
        ),
      });
      if (!thread) return res.status(404).json({ message: "Thread not found" });

      const file = (req as any).file as Express.Multer.File | undefined;
      if (!file) return res.status(400).json({ message: "Upload one file under multipart field `file`." });

      const persisted = await persistChatAttachment({ tenantKey: String(req.tenant?.key || "tenant"), file });
      const attachmentId = String(req.body?.id || "").trim() || `sha256:${persisted.sha256}`;
      const originalName = String(file.originalname || "attachment").trim() || "attachment";
      const mimeType = String(file.mimetype || "application/octet-stream").trim() || "application/octet-stream";
      const sizeRaw = Number(file.size || 0);
      const size = Number.isFinite(sizeRaw) && sizeRaw >= 0 ? Math.trunc(sizeRaw) : 0;
      const versionRaw = Number(req.body?.version ?? 1);
      const version = Number.isFinite(versionRaw) && versionRaw > 0 ? Math.trunc(versionRaw) : 1;

      const forwardedProto = String(req.headers["x-forwarded-proto"] || "").split(",")[0]?.trim();
      const forwardedHost = String(req.headers["x-forwarded-host"] || "").split(",")[0]?.trim();
      const proto = forwardedProto || req.protocol;
      const host = forwardedHost || req.get("host");
      const origin = proto && host ? `${proto}://${host}` : null;
      const publicUrl = origin && persisted.fileUrl.startsWith("/") ? `${origin}${persisted.fileUrl}` : persisted.fileUrl;

      res.json({
        ok: true,
        threadId,
        attachment: {
          id: attachmentId,
          name: originalName.slice(0, 180),
          type: mimeType.slice(0, 120),
          size,
          version,
          url: publicUrl,
        },
      });
    } catch (error: any) {
      console.error("[Assistant] attachment upload failed:", error);
      res.status(500).json({ message: error?.message || "Attachment upload failed" });
    }
  });
});

router.post("/message", async (req, res) => {
  const auth = await resolveChairmanConsoleActor(req, { allowAdminOverride: true });
  if (!auth.ok) return res.status(auth.status).json({ message: auth.message });
  const tenantId = Number(req.tenant?.id);
  if (!Number.isFinite(tenantId) || tenantId <= 0) {
    return res.status(400).json({ message: "Tenant not resolved" });
  }

  const content = String(req.body?.content || req.body?.message || "").trim();
  const rawAttachments = Array.isArray(req.body?.attachments) ? req.body.attachments : [];
  const attachments = rawAttachments.map((entry: any, index: number) => toAttachment(entry, index)).filter(Boolean);
  if (!content && attachments.length === 0) return res.status(400).json({ message: "Message content is required" });
  const effectiveContent = content || `Shared ${attachments.length} attachment(s). Please review.`;
  const userMetadata = toObject(req.body?.metadata ?? {});
  if (attachments.length) {
    (userMetadata as any).attachments = attachments;
  }

  const assistant = await resolveChairmanAssistant(tenantId);
  const thread = await getThreadOrCreate({
    tenantId,
    userId: Number(auth.user.id),
    assistant,
    threadId: parseIntSafe(req.body?.threadId ?? req.body?.thread_id) ?? null,
  });

  const [userMessage] = await db
    .insert(assistantMessages)
    .values({
      tenantId,
      threadId: thread.id,
      senderType: "user",
      senderUserId: auth.user.id,
      senderName: auth.user.displayName ?? "Chairman",
      content: effectiveContent,
      metadata: userMetadata,
      createdAt: new Date(),
    })
    .returning();

  await db
    .update(assistantThreads)
    .set({ updatedAt: new Date() })
    .where(eq(assistantThreads.id, thread.id));

  const recentMessages = await fetchRecentMessages(thread.id, 12);
  const contextMessages = buildRecentContext(recentMessages, assistant, auth.user);

  try {
    const aiResult = await generateAgentResponse(effectiveContent, {
      role: assistant.role,
      agentId: assistant.id,
      companyId: Number(req.body?.companyId ?? req.body?.company_id) || null,
      context: {
        recentMessages: contextMessages,
        roomName: "Chairman Assistant",
        roomType: "assistant-thread",
      },
    });

    const visibleResponse = stripAgentActionMarkers(aiResult.response) || aiResult.response;

    const [assistantMessage] = await db
      .insert(assistantMessages)
      .values({
        tenantId,
        threadId: thread.id,
        senderType: "assistant",
        senderAgentId: assistant.id,
        senderName: assistant.displayName ?? assistant.name,
        content: visibleResponse,
        metadata: {
          analysis: aiResult.analysis ?? null,
          rawResponse: aiResult.response,
        },
        createdAt: new Date(),
      })
      .returning();

    await db
      .update(assistantThreads)
      .set({ updatedAt: new Date() })
      .where(eq(assistantThreads.id, thread.id));

    const createdRunIds: number[] = [];
    const createdRunLabelsById = new Map<number, string>();
    const userRequestedBulkAgents =
      /\b(create|add|hire|onboard|recruit|setup|set up)\b/i.test(effectiveContent) &&
      /\b(?:\d{1,3}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred)(?:[\s-]+(?:one|two|three|four|five|six|seven|eight|nine))?(?:\s+[a-z][a-z0-9_-]{1,30}){0,3}\s+(?:agents?|assistants?)\b/i.test(
        effectiveContent,
      );
    const dispatchText = userRequestedBulkAgents ? `${aiResult.response}\n${effectiveContent}` : aiResult.response;

    const assistantDispatch = await dispatchAgentActionIntents(
      {
        text: dispatchText,
        tenantId,
        conversationId: `assistant-thread:${thread.id}`,
        source: "assistant.message",
        companyId: Number(req.body?.companyId ?? req.body?.company_id) || null,
        requestedByUserId: auth.user.id,
        agent: {
          id: assistant.id,
          name: assistant.displayName ?? assistant.name,
          role: assistant.role,
        },
      },
      {
        createActionRequest: async (input) => {
          const queued = await queueAssistantAction({
            tenantId,
            userId: Number(auth.user.id),
            assistantId: Number(assistant.id) || null,
            threadId: Number(thread.id) || null,
            messageId: Number(assistantMessage.id) || null,
            actionType: input.actionType,
            payload: input.payload,
            requestedByAgentKey: input.requestedByAgentKey ?? null,
            idempotencyKey: input.idempotencyKey ?? null,
            correlationId: input.idempotencyKey ?? null,
            relatedConversationId: input.relatedConversationId ?? null,
          });
          createdRunIds.push(Number(queued.id));
          createdRunLabelsById.set(Number(queued.id), String(queued.label || `ACT-${String(queued.id).padStart(6, "0")}`));
          return {
            id: Number(queued.id),
            status: String(queued.status || "QUEUED"),
            state: String((queued as any).state || "").trim() || null,
            publicActionId: String((queued as any).publicActionId || "").trim() || null,
          };
        },
      },
    );

    let dispatch = assistantDispatch;
    if (!assistantDispatch.created.length) {
      const userFallbackDispatch = await dispatchAgentActionIntents(
        {
          text: effectiveContent,
          tenantId,
          conversationId: `assistant-thread:${thread.id}`,
          source: "assistant.message.user_fallback",
          companyId: Number(req.body?.companyId ?? req.body?.company_id) || null,
          requestedByUserId: auth.user.id,
          agent: {
            id: assistant.id,
            name: assistant.displayName ?? assistant.name,
            role: assistant.role,
          },
        },
        {
          createActionRequest: async (input) => {
            const queued = await queueAssistantAction({
              tenantId,
              userId: Number(auth.user.id),
              assistantId: Number(assistant.id) || null,
              threadId: Number(thread.id) || null,
              messageId: Number(assistantMessage.id) || null,
              actionType: input.actionType,
              payload: input.payload,
              requestedByAgentKey: input.requestedByAgentKey ?? null,
              idempotencyKey: input.idempotencyKey ?? null,
              correlationId: input.idempotencyKey ?? null,
              relatedConversationId: input.relatedConversationId ?? null,
            });
            createdRunIds.push(Number(queued.id));
            createdRunLabelsById.set(Number(queued.id), String(queued.label || `ACT-${String(queued.id).padStart(6, "0")}`));
            return {
              id: Number(queued.id),
              status: String(queued.status || "QUEUED"),
              state: String((queued as any).state || "").trim() || null,
              publicActionId: String((queued as any).publicActionId || "").trim() || null,
            };
          },
        },
      );

      dispatch = {
        intentsDetected: assistantDispatch.intentsDetected + userFallbackDispatch.intentsDetected,
        created: [...assistantDispatch.created, ...userFallbackDispatch.created],
        blocked: Array.from(
          new Set(
            [...assistantDispatch.blocked, ...userFallbackDispatch.blocked]
              .map((entry) => String(entry || "").trim())
              .filter(Boolean),
          ),
        ),
      };
    }

    const genericActions = extractGenericActionMarkers(aiResult.response);
    for (const action of genericActions) {
      if (!action.actionKey) continue;
      if (dispatch.created.some((created) => created.actionType === action.actionKey)) continue;
      try {
        const queued = await queueAssistantAction({
          tenantId,
          userId: Number(auth.user.id),
          assistantId: Number(assistant.id) || null,
          threadId: Number(thread.id) || null,
          messageId: Number(assistantMessage.id) || null,
          actionType: action.actionKey,
          payload: action.payload,
          relatedConversationId: `assistant-thread:${thread.id}`,
        });
        createdRunIds.push(Number(queued.id));
        createdRunLabelsById.set(Number(queued.id), String(queued.label || `RUN-${String(queued.id)}`));
      } catch {
        // ignore invalid actions
      }
    }

    const blocked = Array.isArray(dispatch.blocked) ? [...dispatch.blocked] : [];
    if (!dispatch.created.length && looksLikeActionRequest(effectiveContent)) {
      blocked.push("No executable action was queued. Add explicit details (who, what, destination, and timing).");
    }

    const genericOnlyRunIds = createdRunIds.filter((id) => !dispatch.created.some((created) => Number(created.id) === Number(id)));
    const genericOnlyLabels = genericOnlyRunIds.map((id) => createdRunLabelsById.get(Number(id)) || `RUN-${String(id)}`);
    const genericFallbackFeedback = genericOnlyRunIds.length
      ? `Additional action run${genericOnlyRunIds.length > 1 ? "s" : ""} queued: ${genericOnlyLabels.join(", ")}.`
      : "";

    const actionFeedbackText = [renderActionDispatchFeedback({ ...dispatch, blocked }).trim(), genericFallbackFeedback]
      .filter((entry) => String(entry || "").trim().length > 0)
      .join("\n")
      .trim();
    let finalAssistantMessage = assistantMessage;
    if (actionFeedbackText) {
      const [updatedAssistantMessage] = await db
        .update(assistantMessages)
        .set({
          content: `${visibleResponse}\n\n${actionFeedbackText}`.trim(),
        })
        .where(eq(assistantMessages.id, assistantMessage.id))
        .returning();
      if (updatedAssistantMessage) finalAssistantMessage = updatedAssistantMessage;
    }

    res.json({
      thread,
      userMessage,
      assistantMessage: finalAssistantMessage,
      actionRuns: {
        created: dispatch.created,
        blocked,
        runIds: createdRunIds,
        runLabels: createdRunIds.map((id) => createdRunLabelsById.get(Number(id)) || `RUN-${String(id)}`),
      },
    });
  } catch (error: any) {
    if (error?.name === "AiConsentRequiredError" && error?.status && error?.plan) {
      return res.status(error.status).json({
        message: error.message,
        requiresConsent: true,
        plan: error.plan,
        thread,
        userMessage,
      });
    }

    console.error("[Assistant] Failed to generate response:", error);
    res.status(500).json({ message: "Failed to generate assistant response", error: error?.message });
  }
});

export default router;
