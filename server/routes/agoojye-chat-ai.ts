import { createHash } from "node:crypto";

import { Router } from "express";
import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@db";
import {
  agoojyeAuditLogs,
  agoojyeOsAiConversationContexts,
  agoojyeOsAiConversations,
  agoojyeOsAiMessageActions,
  agoojyeOsAiMessages,
  agoojyeOsProjectMembers,
  agoojyeOsProjects,
  agoojyeTasks,
} from "@db/schema";

import { ensureTenantUser } from "./utils/auth";
import { requireWorkosMember } from "./agoojye-workos";
import { runAgoojiyeChatAssistant } from "../lib/agoojye/chatAssistant";
import { isMeaningfulAgoojiyeTaskTitle } from "../lib/agoojye/chatLogic";
import { canAccessAgoojiyeDataClass } from "../lib/agoojye/osPolicy";

const router = Router();
const clean = (value: unknown) => String(value ?? "").trim();
const buckets = new Map<string, { count: number; resetAt: number }>();

function consumeAssistantLimit(tenantId: number, memberId: number, res: any) {
  const key = `${tenantId}:${memberId}`;
  const now = Date.now();
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + 5 * 60_000 });
    return true;
  }
  if (current.count >= 30) {
    res.setHeader("Retry-After", String(Math.ceil((current.resetAt - now) / 1000)));
    res.status(429).json({
      message: "Vous avez envoyé plusieurs demandes rapidement. Réessayez dans quelques minutes.",
    });
    return false;
  }
  current.count += 1;
  return true;
}

async function audit(
  tenantId: number,
  member: any,
  action: string,
  entityType: string,
  metadata: Record<string, unknown>,
) {
  await db.insert(agoojyeAuditLogs).values({
    tenantId,
    actor: clean(member.email || member.displayName || member.id),
    action,
    entityType,
    metadata: { ...metadata, actorMemberId: Number(member.id) },
  });
}

router.use(ensureTenantUser);
router.use(requireWorkosMember);

router.get("/contexts", async (req: any, res) => {
  const tenantId = Number(req.workosTenantId);
  const member = req.workosMember;
  const memberships = await db.query.agoojyeOsProjectMembers.findMany({
    where: and(
      eq(agoojyeOsProjectMembers.tenantId, tenantId),
      eq(agoojyeOsProjectMembers.userId, Number(member.id)),
    ),
  });
  const projects = await db.query.agoojyeOsProjects.findMany({
    where: eq(agoojyeOsProjects.tenantId, tenantId),
    orderBy: [asc(agoojyeOsProjects.name)],
    limit: 100,
  });
  const projectMembershipIds = new Set(
    memberships.map((entry) => Number(entry.projectId)),
  );
  const contexts: Array<any> = [
    {
      type: "personal",
      id: null,
      label: "Espace personnel",
      description: "Vos tâches, réunions et documents autorisés",
    },
  ];
  if (Number(member.teamId || 0)) {
    contexts.push({
      type: "department",
      id: String(member.teamId),
      label: "Mon département",
      description: "Contexte de votre équipe",
    });
  }
  if (
    Array.isArray(member.permissions) &&
    (member.permissions.includes("mobility") || member.permissions.includes("*"))
  ) {
    contexts.push({
      type: "mobility",
      id: null,
      label: "Opérations mobilité",
      description: "Exploitation, billets et demandes commerciales",
    });
  }
  if (Number(member.accessLevel || 0) >= 6) {
    contexts.push({
      type: "direction",
      id: null,
      label: "Direction",
      description: "Synthèse de direction selon vos autorisations",
    });
  }
  for (const project of projects) {
    if (
      canAccessAgoojiyeDataClass({
        member,
        classification: project.confidentialityClass,
        resourceTeamId: project.teamId,
        resourceProjectId: Number(project.id),
        projectMembershipIds,
      })
    ) {
      contexts.push({
        type: "project",
        id: String(project.id),
        label: project.name,
        description: project.objective,
      });
    }
  }
  return res.json({ ok: true, items: contexts });
});

router.get("/conversations", async (req: any, res) => {
  const items = await db.query.agoojyeOsAiConversations.findMany({
    where: and(
      eq(agoojyeOsAiConversations.tenantId, Number(req.workosTenantId)),
      eq(agoojyeOsAiConversations.userId, Number(req.workosMember.id)),
    ),
    orderBy: [
      desc(agoojyeOsAiConversations.pinned),
      desc(agoojyeOsAiConversations.updatedAt),
    ],
    limit: 100,
  });
  return res.json({ ok: true, items });
});

const conversationSchema = z.object({
  title: z.string().trim().min(1).max(120).default("Nouvelle conversation"),
  contextType: z
    .enum(["personal", "department", "project", "mobility", "direction"])
    .default("personal"),
  contextId: z.string().trim().max(120).nullable().optional(),
  contextLabel: z.string().trim().min(1).max(180).default("Espace personnel"),
});

router.post("/conversations", async (req: any, res) => {
  const parsed = conversationSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Contexte invalide." });
  const tenantId = Number(req.workosTenantId);
  const member = req.workosMember;
  if (parsed.data.contextType === "direction" && Number(member.accessLevel || 0) < 6) {
    return res.status(403).json({ message: "Le contexte Direction n'est pas autorisé." });
  }
  const [item] = await db
    .insert(agoojyeOsAiConversations)
    .values({
      tenantId,
      userId: Number(member.id),
      title: parsed.data.title,
      contextType: parsed.data.contextType,
      contextId: parsed.data.contextId || null,
      contextLabel: parsed.data.contextLabel,
    })
    .returning();
  await db.insert(agoojyeOsAiConversationContexts).values({
    tenantId,
    conversationId: item.id,
    contextType: parsed.data.contextType,
    contextId: parsed.data.contextId || null,
    label: parsed.data.contextLabel,
  });
  return res.status(201).json({ ok: true, item });
});

async function ownConversation(tenantId: number, memberId: number, id: string) {
  return db.query.agoojyeOsAiConversations.findFirst({
    where: and(
      eq(agoojyeOsAiConversations.id, id),
      eq(agoojyeOsAiConversations.tenantId, tenantId),
      eq(agoojyeOsAiConversations.userId, memberId),
    ),
  });
}

router.get("/conversations/:id/messages", async (req: any, res) => {
  const tenantId = Number(req.workosTenantId);
  const memberId = Number(req.workosMember.id);
  const conversation = await ownConversation(tenantId, memberId, clean(req.params.id));
  if (!conversation) return res.status(404).json({ message: "Conversation introuvable." });
  const items = await db.query.agoojyeOsAiMessages.findMany({
    where: and(
      eq(agoojyeOsAiMessages.tenantId, tenantId),
      eq(agoojyeOsAiMessages.conversationId, conversation.id),
    ),
    orderBy: [asc(agoojyeOsAiMessages.createdAt)],
    limit: 500,
  });
  const actions = await db.query.agoojyeOsAiMessageActions.findMany({
    where: and(
      eq(agoojyeOsAiMessageActions.tenantId, tenantId),
      eq(agoojyeOsAiMessageActions.conversationId, conversation.id),
    ),
    orderBy: [asc(agoojyeOsAiMessageActions.createdAt)],
  });
  const actionsByMessage = new Map<string, any[]>();
  for (const action of actions) {
    const list = actionsByMessage.get(String(action.messageId)) || [];
    list.push(action);
    actionsByMessage.set(String(action.messageId), list);
  }
  return res.json({
    ok: true,
    conversation,
    items: items.map((item) => ({
      ...item,
      proposedActions: actionsByMessage.get(String(item.id)) || [],
    })),
  });
});

router.patch("/conversations/:id", async (req: any, res) => {
  const parsed = z
    .object({
      title: z.string().trim().min(1).max(120).optional(),
      pinned: z.boolean().optional(),
      status: z.enum(["active", "archived"]).optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Modification invalide." });
  const tenantId = Number(req.workosTenantId);
  const memberId = Number(req.workosMember.id);
  const conversation = await ownConversation(tenantId, memberId, clean(req.params.id));
  if (!conversation) return res.status(404).json({ message: "Conversation introuvable." });
  const [item] = await db
    .update(agoojyeOsAiConversations)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(agoojyeOsAiConversations.id, conversation.id))
    .returning();
  return res.json({ ok: true, item });
});

const promptSchema = z.object({
  query: z.string().trim().min(2).max(4000),
  parentMessageId: z.string().uuid().nullable().optional(),
});

async function processPrompt(req: any, res: any, stream: boolean) {
  const parsed = promptSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Posez une question plus précise." });
  const tenantId = Number(req.workosTenantId);
  const member = req.workosMember;
  if (!consumeAssistantLimit(tenantId, Number(member.id), res)) return;
  const conversation = await ownConversation(
    tenantId,
    Number(member.id),
    clean(req.params.id),
  );
  if (!conversation) return res.status(404).json({ message: "Conversation introuvable." });
  const now = new Date();
  const [userMessage] = await db
    .insert(agoojyeOsAiMessages)
    .values({
      tenantId,
      conversationId: conversation.id,
      role: "user",
      content: parsed.data.query,
      parentMessageId: parsed.data.parentMessageId || null,
    })
    .returning();
  const currentTitle = clean(conversation.title);
  const title =
    currentTitle === "Nouvelle conversation"
      ? parsed.data.query.replace(/\s+/g, " ").slice(0, 72)
      : currentTitle;
  await db
    .update(agoojyeOsAiConversations)
    .set({ title, lastMessageAt: now, updatedAt: now })
    .where(eq(agoojyeOsAiConversations.id, conversation.id));

  if (stream) {
    res.status(200);
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();
    res.write(`event: user_message\ndata: ${JSON.stringify({ item: userMessage, title })}\n\n`);
    res.write(`event: status\ndata: ${JSON.stringify({ status: "thinking" })}\n\n`);
  }

  const result = await runAgoojiyeChatAssistant({
    tenantId,
    member,
    query: parsed.data.query,
    contextType: conversation.contextType,
    contextId: conversation.contextId,
    contextLabel: conversation.contextLabel,
  });
  const [assistantMessage] = await db
    .insert(agoojyeOsAiMessages)
    .values({
      tenantId,
      conversationId: conversation.id,
      role: "assistant",
      content: result.answer,
      parentMessageId: userMessage.id,
      sources: result.matches,
      provider: result.generation.provider,
      model: result.generation.model,
      inputTokens: result.generation.inputTokens,
      outputTokens: result.generation.outputTokens,
      actions: result.proposedActions,
    })
    .returning();
  const proposedActions = result.proposedActions.length
    ? await db
        .insert(agoojyeOsAiMessageActions)
        .values(
          result.proposedActions.map((action) => ({
            tenantId,
            conversationId: conversation.id,
            messageId: assistantMessage.id,
            requestedBy: Number(member.id),
            actionType: action.type,
            label: action.label,
            payload: action.payload,
            riskLevel: action.riskLevel,
            status: "proposed",
            requiresApproval: true,
          })),
        )
        .returning()
    : [];
  await db
    .update(agoojyeOsAiConversations)
    .set({ lastMessageAt: new Date(), updatedAt: new Date() })
    .where(eq(agoojyeOsAiConversations.id, conversation.id));
  await audit(tenantId, member, "ai_visible_conversation_message", "assistant", {
    conversationId: conversation.id,
    queryHash: createHash("sha256").update(parsed.data.query).digest("hex"),
    answerHash: createHash("sha256").update(result.answer).digest("hex"),
    contextType: conversation.contextType,
    contextId: conversation.contextId,
    recordsAccessed: result.recordsAccessed,
    generationMode: result.generation.mode,
    provider: result.generation.provider,
    model: result.generation.model,
    inputTokens: result.generation.inputTokens,
    outputTokens: result.generation.outputTokens,
    failureCode: result.generation.failureCode || null,
    proposedActionIds: proposedActions.map((action) => action.id),
  });

  const item = { ...assistantMessage, proposedActions };
  if (!stream) {
    return res.status(201).json({
      ok: true,
      userMessage,
      item,
      title,
      generation: result.generation,
    });
  }
  const chunkSize = 48;
  for (let index = 0; index < result.answer.length; index += chunkSize) {
    if (res.destroyed || req.aborted) return;
    res.write(
      `event: delta\ndata: ${JSON.stringify({
        text: result.answer.slice(index, index + chunkSize),
      })}\n\n`,
    );
  }
  res.write(
    `event: complete\ndata: ${JSON.stringify({
      item,
      title,
      generation: result.generation,
    })}\n\n`,
  );
  return res.end();
}

router.post("/conversations/:id/messages", (req: any, res) =>
  processPrompt(req, res, false),
);
router.post("/conversations/:id/stream", (req: any, res) =>
  processPrompt(req, res, true),
);

router.patch("/messages/:id/feedback", async (req: any, res) => {
  const parsed = z.object({ feedback: z.enum(["positive", "negative", "none"]) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Avis invalide." });
  const tenantId = Number(req.workosTenantId);
  const memberId = Number(req.workosMember.id);
  const message = await db.query.agoojyeOsAiMessages.findFirst({
    where: and(
      eq(agoojyeOsAiMessages.tenantId, tenantId),
      eq(agoojyeOsAiMessages.id, clean(req.params.id)),
    ),
  });
  if (!message) return res.status(404).json({ message: "Réponse introuvable." });
  const conversation = await ownConversation(tenantId, memberId, String(message.conversationId));
  if (!conversation) return res.status(404).json({ message: "Réponse introuvable." });
  await db
    .update(agoojyeOsAiMessages)
    .set({
      feedback: parsed.data.feedback === "none" ? null : parsed.data.feedback,
      updatedAt: new Date(),
    })
    .where(eq(agoojyeOsAiMessages.id, message.id));
  return res.json({ ok: true });
});

router.post("/actions/:id/approve", async (req: any, res) => {
  const tenantId = Number(req.workosTenantId);
  const member = req.workosMember;
  const action = await db.query.agoojyeOsAiMessageActions.findFirst({
    where: and(
      eq(agoojyeOsAiMessageActions.tenantId, tenantId),
      eq(agoojyeOsAiMessageActions.id, clean(req.params.id)),
      eq(agoojyeOsAiMessageActions.status, "proposed"),
    ),
  });
  if (!action) return res.status(404).json({ message: "Action introuvable ou déjà traitée." });
  const conversation = await ownConversation(
    tenantId,
    Number(member.id),
    String(action.conversationId),
  );
  if (!conversation) return res.status(404).json({ message: "Action introuvable." });
  if (action.actionType !== "create_task") {
    return res.status(409).json({ message: "Cette action n'est pas encore exécutable." });
  }
  const payload = (action.payload || {}) as Record<string, unknown>;
  const taskTitle = clean(payload.title).replace(/\s+/g, " ").slice(0, 240);
  if (!isMeaningfulAgoojiyeTaskTitle(taskTitle)) {
    return res.status(422).json({
      message: "Cette proposition ne contient pas un intitulé de tâche exploitable.",
    });
  }
  const [task] = await db
    .insert(agoojyeTasks)
    .values({
      tenantId,
      teamId: Number(member.teamId || 0) || null,
      assignedTo: Number(member.id),
      createdBy: Number(member.id),
      title: taskTitle,
      description: clean(payload.description).slice(0, 5000) || null,
      priority: ["low", "medium", "high", "critical"].includes(clean(payload.priority))
        ? clean(payload.priority)
        : "medium",
      status: "todo",
      metadata: {
        source: "agoojiye_assistant",
        assistantConversationId: conversation.id,
        assistantActionId: action.id,
      },
    })
    .returning();
  await db
    .update(agoojyeOsAiMessageActions)
    .set({
      status: "completed",
      payload: { ...payload, resultTaskId: Number(task.id) },
      updatedAt: new Date(),
    })
    .where(eq(agoojyeOsAiMessageActions.id, action.id));
  await audit(tenantId, member, "ai_action_approved", "task", {
    actionId: action.id,
    taskId: Number(task.id),
    conversationId: conversation.id,
  });
  return res.status(201).json({ ok: true, item: task });
});

router.post("/actions/:id/reject", async (req: any, res) => {
  const tenantId = Number(req.workosTenantId);
  const member = req.workosMember;
  const action = await db.query.agoojyeOsAiMessageActions.findFirst({
    where: and(
      eq(agoojyeOsAiMessageActions.tenantId, tenantId),
      eq(agoojyeOsAiMessageActions.id, clean(req.params.id)),
      eq(agoojyeOsAiMessageActions.status, "proposed"),
    ),
  });
  if (!action) return res.status(404).json({ message: "Action introuvable ou déjà traitée." });
  const conversation = await ownConversation(
    tenantId,
    Number(member.id),
    String(action.conversationId),
  );
  if (!conversation) return res.status(404).json({ message: "Action introuvable." });
  await db
    .update(agoojyeOsAiMessageActions)
    .set({ status: "rejected", updatedAt: new Date() })
    .where(eq(agoojyeOsAiMessageActions.id, action.id));
  await audit(tenantId, member, "ai_action_rejected", "assistant_action", {
    actionId: action.id,
    conversationId: conversation.id,
  });
  return res.json({ ok: true });
});

export default router;
