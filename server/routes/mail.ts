import { Router } from "express";
import fs from "fs/promises";
import { simpleParser } from "mailparser";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@db";
import {
  agentMailboxes,
  agents,
  emailAssistantAgentPolicies,
  emailAttachmentsMeta,
  emailMessages,
  emailThreadInsights,
  emailThreads,
  emailWorkOrders,
} from "@db/schema";
import { ensureTenantStaff, isChairmanAssistantUser } from "./utils/auth";
import { createActionRequest } from "../lib/actions/ActionRouter";
import { generateText } from "../lib/agent-os/llm-gateway";
import { getAgentPolicy } from "../lib/agent-os/registry";
import { normalizeAgentKey } from "../lib/mail/agentSlugs";
import { normalizeEmailSubject } from "../lib/mail/threading";

const router = Router();
router.use(ensureTenantStaff);

function parseIntSafe(value: unknown) {
  const n = typeof value === "number" ? value : parseInt(String(value ?? ""), 10);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function parseLimit(value: unknown, fallback: number, max: number) {
  const n = parseIntSafe(value);
  if (!n) return fallback;
  return Math.min(Math.max(n, 1), max);
}

function parseStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v || "").trim()).filter(Boolean);
  if (typeof value === "string") return value.split(",").map((v) => v.trim()).filter(Boolean);
  return [];
}

function isAdminUser(user: any) {
  if (!user) return false;
  const currentMode = (user as any).currentMode;
  const roles = Array.isArray((user as any).roles) ? (user as any).roles : [];
  const perms = Array.isArray((user as any).permissions) ? (user as any).permissions : [];
  return currentMode === "admin" || roles.includes("admin") || perms.includes("*") || isChairmanAssistantUser(user);
}

async function resolveMailbox(req: any) {
  const tenant = req.tenant;
  if (!tenant) throw new Error("tenant required");

  const rawAgentKey =
    String(req.query?.agentKey ?? req.query?.agent_key ?? req.body?.agentKey ?? req.body?.agent_key ?? "").trim() ||
    String(process.env.MAIL_DEFAULT_AGENT_KEY || "support").trim();
  const agentKey = normalizeAgentKey(rawAgentKey) || "support";

  const mailbox = await db.query.agentMailboxes.findFirst({
    where: and(eq(agentMailboxes.tenantId, tenant.id), eq(agentMailboxes.agentKey, agentKey)),
  });
  if (!mailbox) {
    const err = new Error("Mailbox not provisioned for this agent");
    (err as any).status = 404;
    throw err;
  }
  if (!mailbox.isEnabled) {
    const err = new Error("Mailbox disabled");
    (err as any).status = 423;
    throw err;
  }

  return { tenant, agentKey, mailbox };
}

type AssistantReadScope = "subject_only" | "full_thread";
type AssistantSendMode = "never" | "approval" | "autonomous";
type EffectiveAssistantPolicy = {
  agentId: number;
  isEnabled: boolean;
  readScope: AssistantReadScope;
  canSuggestDrafts: boolean;
  canSuggestSummaries: boolean;
  canSuggestFollowups: boolean;
  sendMode: AssistantSendMode;
  isDefault: boolean;
};

const DEFAULT_ASSISTANT_POLICY: Omit<EffectiveAssistantPolicy, "agentId"> = {
  isEnabled: true,
  readScope: "full_thread",
  canSuggestDrafts: true,
  canSuggestSummaries: true,
  canSuggestFollowups: true,
  sendMode: "never",
  isDefault: true,
};

async function getEffectiveAssistantPolicyForTenant(tenantId: number, agentId: number): Promise<EffectiveAssistantPolicy> {
  const row = await db.query.emailAssistantAgentPolicies.findFirst({
    where: and(eq(emailAssistantAgentPolicies.tenantId, tenantId), eq(emailAssistantAgentPolicies.agentId, agentId)),
  });

  if (!row) return { agentId, ...DEFAULT_ASSISTANT_POLICY };

  const readScope: AssistantReadScope = row.readScope === "subject_only" ? "subject_only" : "full_thread";
  const sendMode: AssistantSendMode =
    row.sendMode === "autonomous" ? "autonomous" : row.sendMode === "approval" ? "approval" : "never";

  return {
    agentId,
    isEnabled: !!row.isEnabled,
    readScope,
    canSuggestDrafts: !!row.canSuggestDrafts,
    canSuggestSummaries: !!row.canSuggestSummaries,
    canSuggestFollowups: !!row.canSuggestFollowups,
    sendMode,
    isDefault: false,
  };
}

function parseBool(value: unknown, fallback: boolean) {
  if (typeof value === "boolean") return value;
  const v = String(value ?? "").trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(v)) return true;
  if (["0", "false", "no", "n", "off"].includes(v)) return false;
  return fallback;
}

function safeText(value: unknown) {
  return String(value ?? "").replace(/\r\n/g, "\n").trim();
}

function truncateText(value: string, maxChars: number) {
  const text = safeText(value);
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars - 1) + "…";
}

function extractJsonObject(text: string) {
  const match = String(text || "").match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

function normalizeAssistAction(value: unknown) {
  const v = String(value || "").trim().toLowerCase();
  if (v === "reply") return "reply" as const;
  if (v === "follow_up" || v === "followup" || v === "follow-up") return "follow_up" as const;
  if (v === "ask_clarification" || v === "clarify" || v === "ask_for_clarification") return "ask_clarification" as const;
  if (v === "send_document" || v === "send_doc" || v === "send_attachment") return "send_document" as const;
  if (v === "improve_tone") return "improve_tone" as const;
  if (v === "shorter" || v === "make_it_shorter") return "shorter" as const;
  if (v === "formal" || v === "more_formal") return "formal" as const;
  if (v === "translate") return "translate" as const;
  return "suggest_draft" as const;
}

function normalizeLanguage(value: unknown): "en" | "fr" {
  const v = String(value || "").trim().toLowerCase();
  return v.startsWith("fr") ? "fr" : "en";
}

function buildToneGuidelines(params: { useToneGuidelines: boolean }) {
  if (!params.useToneGuidelines) return "";
  return [
    "- Keep tone calm, executive, and practical.",
    "- Avoid hype, exaggeration, or marketing fluff.",
    "- Do not mention 'AI', 'LLM', 'model', or internal systems.",
    "- Be concise and action-oriented.",
  ].join("\n");
}

function formatThreadForPrompt(params: {
  subject: string | null;
  messages: Array<{ direction: string; fromEmail: string; toJson: string[]; createdAt: Date; textBody: string | null }>;
  readScope: AssistantReadScope;
}) {
  const lines: string[] = [];
  lines.push(`Subject: ${params.subject || "(no subject)"}`);
  lines.push("");

  const maxMessages = 12;
  const selected = params.messages.slice(-maxMessages);

  for (const m of selected) {
    const head =
      m.direction === "outbound"
        ? `OUTBOUND to ${(m.toJson || []).join(", ")}`
        : `INBOUND from ${m.fromEmail}`;
    lines.push(`${head} — ${new Date(m.createdAt).toISOString()}`);
    if (params.readScope === "full_thread") {
      const body = m.textBody ? truncateText(m.textBody, 900) : "(no indexed text)";
      lines.push(body);
    } else {
      lines.push("(body hidden)");
    }
    lines.push("");
  }

  return lines.join("\n").trim();
}

router.get("/work-orders", async (req: any, res) => {
  try {
    const { tenant, mailbox } = await resolveMailbox(req);
    const limit = parseLimit(req.query?.limit, 200, 2000);

    const rows = await db
      .select({
        workOrder: emailWorkOrders,
        thread: {
          id: emailThreads.id,
          subject: emailThreads.subject,
          lastMessageAt: emailThreads.lastMessageAt,
        },
      })
      .from(emailWorkOrders)
      .leftJoin(emailThreads, and(eq(emailWorkOrders.threadId, emailThreads.id), eq(emailThreads.tenantId, tenant.id)))
      .where(and(eq(emailWorkOrders.tenantId, tenant.id), eq(emailWorkOrders.mailboxId, mailbox.id), sql`${emailWorkOrders.status} <> 'replied'`))
      .orderBy(asc(emailWorkOrders.dueAt))
      .limit(limit);

    res.json({ ok: true, items: rows });
  } catch (err: any) {
    res.status(err?.status || 500).json({ message: err?.message || "Failed to list work orders" });
  }
});

router.get("/threads", async (req: any, res) => {
  try {
    const { tenant, mailbox } = await resolveMailbox(req);
    const limit = parseLimit(req.query?.limit, 50, 200);
    const offset = Math.max(parseIntSafe(req.query?.offset) ?? 0, 0);
    const q = String(req.query?.q || "").trim().slice(0, 160);

    const whereParts: any[] = [eq(emailThreads.tenantId, tenant.id), eq(emailThreads.mailboxId, mailbox.id)];
    if (q) {
      whereParts.push(sql`(${emailThreads.subject} ILIKE ${"%" + q + "%"} OR ${emailThreads.subjectNorm} ILIKE ${"%" + q + "%"})`);
    }

    const items = await db.query.emailThreads.findMany({
      where: and(...whereParts),
      orderBy: [desc(emailThreads.lastMessageAt)],
      limit,
      offset,
    });

    res.json({ ok: true, items });
  } catch (err: any) {
    res.status(err?.status || 500).json({ message: err?.message || "Failed to list threads" });
  }
});

router.get("/threads/:threadId/messages", async (req: any, res) => {
  try {
    const { tenant, mailbox } = await resolveMailbox(req);
    const threadId = parseIntSafe(req.params?.threadId);
    if (!threadId) return res.status(400).json({ message: "Invalid threadId" });

    const thread = await db.query.emailThreads.findFirst({
      where: and(eq(emailThreads.id, threadId), eq(emailThreads.tenantId, tenant.id), eq(emailThreads.mailboxId, mailbox.id)),
      columns: { id: true },
    });
    if (!thread) return res.status(404).json({ message: "Thread not found" });

    const limit = parseLimit(req.query?.limit, 500, 1000);
    const offset = Math.max(parseIntSafe(req.query?.offset) ?? 0, 0);

    const items = await db.query.emailMessages.findMany({
      where: and(eq(emailMessages.threadId, threadId), eq(emailMessages.tenantId, tenant.id), eq(emailMessages.mailboxId, mailbox.id)),
      orderBy: [asc(emailMessages.createdAt)],
      limit,
      offset,
    });

    res.json({ ok: true, items });
  } catch (err: any) {
    res.status(err?.status || 500).json({ message: err?.message || "Failed to list messages" });
  }
});

router.get("/sent", async (req: any, res) => {
  try {
    const { tenant, mailbox } = await resolveMailbox(req);
    const limit = parseLimit(req.query?.limit, 100, 500);
    const offset = Math.max(parseIntSafe(req.query?.offset) ?? 0, 0);

    const items = await db.query.emailMessages.findMany({
      where: and(eq(emailMessages.tenantId, tenant.id), eq(emailMessages.mailboxId, mailbox.id), eq(emailMessages.direction, "outbound")),
      orderBy: [desc(emailMessages.createdAt)],
      limit,
      offset,
    });

    res.json({ ok: true, items });
  } catch (err: any) {
    res.status(err?.status || 500).json({ message: err?.message || "Failed to list sent messages" });
  }
});

router.get("/drafts", async (req: any, res) => {
  try {
    const { tenant, mailbox } = await resolveMailbox(req);
    const limit = parseLimit(req.query?.limit, 100, 500);
    const offset = Math.max(parseIntSafe(req.query?.offset) ?? 0, 0);

    const items = await db.query.emailMessages.findMany({
      where: and(eq(emailMessages.tenantId, tenant.id), eq(emailMessages.mailboxId, mailbox.id), eq(emailMessages.status, "draft")),
      orderBy: [desc(emailMessages.createdAt)],
      limit,
      offset,
    });

    res.json({ ok: true, items });
  } catch (err: any) {
    res.status(err?.status || 500).json({ message: err?.message || "Failed to list drafts" });
  }
});

router.get("/message/:id", async (req: any, res) => {
  try {
    const { tenant, mailbox } = await resolveMailbox(req);
    const id = parseIntSafe(req.params?.id);
    if (!id) return res.status(400).json({ message: "Invalid id" });

    const msg = await db.query.emailMessages.findFirst({
      where: and(eq(emailMessages.id, id), eq(emailMessages.tenantId, tenant.id), eq(emailMessages.mailboxId, mailbox.id)),
    });
    if (!msg) return res.status(404).json({ message: "Message not found" });

    const attachments = await db.query.emailAttachmentsMeta.findMany({
      where: and(eq(emailAttachmentsMeta.tenantId, tenant.id), eq(emailAttachmentsMeta.messageId, msg.id)),
      orderBy: [asc(emailAttachmentsMeta.id)],
      limit: 200,
    });

    res.json({ ok: true, message: msg, attachments });
  } catch (err: any) {
    res.status(err?.status || 500).json({ message: err?.message || "Failed to load message" });
  }
});

router.post("/draft", async (req: any, res) => {
  try {
    const { tenant, agentKey, mailbox } = await resolveMailbox(req);
    const staffUser = req.staffUser;

    const to = parseStringArray(req.body?.to);
    const subject = String(req.body?.subject || "").trim();
    const text = req.body?.body?.text ?? req.body?.text ?? null;
    const html = req.body?.body?.html ?? req.body?.html ?? null;
    const textBody = typeof text === "string" ? text : null;
    const htmlBody = typeof html === "string" ? html : null;
    if (!to.length) return res.status(400).json({ message: "to[] required" });
    if (!subject) return res.status(400).json({ message: "subject required" });
    if (!textBody && !htmlBody) return res.status(400).json({ message: "body.text or body.html required" });

    const now = new Date();
    const subjectNorm = normalizeEmailSubject(subject);
    const [thread] = await db
      .insert(emailThreads)
      .values({
        tenantId: tenant.id,
        agentKey,
        mailboxId: mailbox.id,
        subjectNorm,
        subject,
        lastMessageAt: now,
        createdAt: now,
      })
      .onConflictDoUpdate({
        target: [emailThreads.mailboxId, emailThreads.subjectNorm],
        set: { lastMessageAt: now },
      })
      .returning();

    const [draft] = await db
      .insert(emailMessages)
      .values({
        tenantId: tenant.id,
        agentKey,
        mailboxId: mailbox.id,
        threadId: thread.id,
        actionRequestId: null,
        direction: "outbound",
        status: "draft",
        fromEmail: mailbox.email,
        toJson: to,
        ccJson: [],
        subject,
        textBody,
        htmlBody,
        messageId: null,
        inReplyTo: null,
        referencesJson: [],
        maildirPath: null,
        metadata: { draft: true, requestedBy: staffUser?.id ?? null },
        createdAt: now,
      })
      .returning();

    res.status(201).json({ ok: true, draft });
  } catch (err: any) {
    res.status(err?.status || 500).json({ message: err?.message || "Failed to save draft" });
  }
});

router.post("/send", async (req: any, res) => {
  try {
    const { tenant, agentKey } = await resolveMailbox(req);
    const staffUser = req.staffUser;

    const to = parseStringArray(req.body?.to);
    if (!to.length) return res.status(400).json({ message: "to[] required" });

    const subject = String(req.body?.subject || "").trim();
    if (!subject) return res.status(400).json({ message: "subject required" });

    const text = req.body?.body?.text ?? req.body?.text ?? null;
    const html = req.body?.body?.html ?? req.body?.html ?? null;
    const textBody = typeof text === "string" ? text : null;
    const htmlBody = typeof html === "string" ? html : null;
    if (!textBody && !htmlBody) return res.status(400).json({ message: "body.text or body.html required" });

    const bypassApproval = isAdminUser(staffUser);

    const actionRequest = await createActionRequest({
      tenantId: tenant.id,
      requestedByUserId: staffUser?.id ?? null,
      requestedByAgentKey: agentKey,
      actionType: "SEND_EMAIL",
      payload: {
        agentKey,
        to,
        subject,
        body: { text: textBody, html: htmlBody },
        source: "api.mail.send",
      },
      priority: 0,
      idempotencyKey: null,
      relatedConversationId: null,
      relatedThreadId: null,
      isAdmin: bypassApproval,
    });

    res.status(201).json({
      ok: true,
      actionRequest,
      queued: actionRequest.status === "QUEUED",
      requiresApproval: actionRequest.status === "REQUIRES_APPROVAL",
    });
  } catch (err: any) {
    const msg = err?.message || "Failed to send email";
    const status = err?.status || (msg.includes("Approval required") ? 403 : msg.includes("Daily send limit") ? 429 : 500);
    res.status(status).json({ message: msg });
  }
});

router.post("/message/:id/reply", async (req: any, res) => {
  try {
    const { tenant, agentKey, mailbox } = await resolveMailbox(req);
    const staffUser = req.staffUser;
    const messageId = parseIntSafe(req.params?.id);
    if (!messageId) return res.status(400).json({ message: "Invalid id" });

    const original = await db.query.emailMessages.findFirst({
      where: and(eq(emailMessages.id, messageId), eq(emailMessages.tenantId, tenant.id), eq(emailMessages.mailboxId, mailbox.id)),
    });
    if (!original) return res.status(404).json({ message: "Message not found" });

    const to = [original.fromEmail];
    const subject = String(original.subject || "").trim() || "(no subject)";
    const replySubject = /^\s*re\s*:/i.test(subject) ? subject : `Re: ${subject}`;

    const text = req.body?.body?.text ?? req.body?.text ?? null;
    const html = req.body?.body?.html ?? req.body?.html ?? null;
    const textBody = typeof text === "string" ? text : null;
    const htmlBody = typeof html === "string" ? html : null;
    if (!textBody && !htmlBody) return res.status(400).json({ message: "body.text or body.html required" });

    const bypassApproval = isAdminUser(staffUser);

    const actionRequest = await createActionRequest({
      tenantId: tenant.id,
      requestedByUserId: staffUser?.id ?? null,
      requestedByAgentKey: agentKey,
      actionType: "SEND_EMAIL",
      payload: {
        agentKey,
        to,
        subject: replySubject,
        body: { text: textBody, html: htmlBody },
        source: "api.mail.reply",
      },
      priority: 0,
      idempotencyKey: null,
      relatedConversationId: null,
      relatedThreadId: original.threadId ?? null,
      isAdmin: bypassApproval,
    });

    res.status(201).json({ ok: true, actionRequest });
  } catch (err: any) {
    const msg = err?.message || "Failed to reply";
    res.status(err?.status || 500).json({ message: msg });
  }
});

router.post("/message/:id/forward", async (req: any, res) => {
  try {
    const { tenant, agentKey, mailbox } = await resolveMailbox(req);
    const staffUser = req.staffUser;
    const messageId = parseIntSafe(req.params?.id);
    if (!messageId) return res.status(400).json({ message: "Invalid id" });

    const original = await db.query.emailMessages.findFirst({
      where: and(eq(emailMessages.id, messageId), eq(emailMessages.tenantId, tenant.id), eq(emailMessages.mailboxId, mailbox.id)),
    });
    if (!original) return res.status(404).json({ message: "Message not found" });

    const to = parseStringArray(req.body?.to);
    if (!to.length) return res.status(400).json({ message: "to[] required" });

    const subject = String(original.subject || "").trim() || "(no subject)";
    const forwardSubject = /^\s*fwd\s*:/i.test(subject) ? subject : `Fwd: ${subject}`;

    const textBody = typeof original.textBody === "string" ? original.textBody : null;
    const htmlBody = typeof original.htmlBody === "string" ? original.htmlBody : null;
    if (!textBody && !htmlBody) return res.status(400).json({ message: "Original message has no body to forward" });

    const bypassApproval = isAdminUser(staffUser);

    const actionRequest = await createActionRequest({
      tenantId: tenant.id,
      requestedByUserId: staffUser?.id ?? null,
      requestedByAgentKey: agentKey,
      actionType: "SEND_EMAIL",
      payload: {
        agentKey,
        to,
        subject: forwardSubject,
        body: { text: textBody, html: htmlBody },
        source: "api.mail.forward",
      },
      priority: 0,
      idempotencyKey: null,
      relatedConversationId: null,
      relatedThreadId: original.threadId ?? null,
      isAdmin: bypassApproval,
    });

    res.status(201).json({ ok: true, actionRequest });
  } catch (err: any) {
    const msg = err?.message || "Failed to forward";
    res.status(err?.status || 500).json({ message: msg });
  }
});

router.delete("/message/:id", async (req: any, res) => {
  try {
    const { tenant, mailbox } = await resolveMailbox(req);
    const id = parseIntSafe(req.params?.id);
    if (!id) return res.status(400).json({ message: "Invalid id" });

    const msg = await db.query.emailMessages.findFirst({
      where: and(eq(emailMessages.id, id), eq(emailMessages.tenantId, tenant.id), eq(emailMessages.mailboxId, mailbox.id)),
      columns: { id: true, metadata: true },
    });
    if (!msg) return res.status(404).json({ message: "Message not found" });

    const nowIso = new Date().toISOString();
    const meta = (msg.metadata && typeof msg.metadata === "object" ? msg.metadata : {}) as any;
    meta.trashedAt = nowIso;

    await db.update(emailMessages).set({ metadata: meta }).where(eq(emailMessages.id, id));
    res.json({ ok: true });
  } catch (err: any) {
    res.status(err?.status || 500).json({ message: err?.message || "Failed to delete message" });
  }
});

router.get("/attachments/:id/download", async (req: any, res) => {
  try {
    const { tenant } = await resolveMailbox(req);
    const id = parseIntSafe(req.params?.id);
    if (!id) return res.status(400).json({ message: "Invalid id" });

    const att = await db.query.emailAttachmentsMeta.findFirst({
      where: and(eq(emailAttachmentsMeta.id, id), eq(emailAttachmentsMeta.tenantId, tenant.id)),
    });
    if (!att) return res.status(404).json({ message: "Attachment not found" });

    const mailPath = att.maildirPath ? String(att.maildirPath) : null;
    if (!mailPath) return res.status(404).json({ message: "Attachment source missing" });

    const raw = await fs.readFile(mailPath);
    const parsed = await simpleParser(raw);

    const targetFilename = String(att.filename || "").trim();
    const targetMime = String(att.mimeType || "").trim();
    const targetSize = Number(att.sizeBytes || 0);

    const match =
      (parsed.attachments || []).find((a: any) => {
        const fn = String(a.filename || "").trim();
        const mt = String(a.contentType || "").trim();
        const size = a.size != null ? Number(a.size) : a.content ? Number((a.content as any).length || 0) : 0;
        if (targetFilename && fn !== targetFilename) return false;
        if (targetMime && mt !== targetMime) return false;
        if (targetSize && size && targetSize !== size) return false;
        return true;
      }) || null;

    if (!match || !match.content) return res.status(404).json({ message: "Attachment content not found" });

    res.setHeader("Content-Type", match.contentType || "application/octet-stream");
    const safeName = targetFilename || "attachment";
    res.setHeader("Content-Disposition", `attachment; filename="${safeName.replace(/\"/g, "")}"`);
    res.send(match.content);
  } catch (err: any) {
    res.status(err?.status || 500).json({ message: err?.message || "Failed to download attachment" });
  }
});

// =========================
// Email assistant UX (drafts + summaries; user-triggered only)
// =========================

router.get("/assistant/agents", async (req: any, res) => {
  try {
    const tenant = req.tenant;
    if (!tenant) return res.status(400).json({ message: "tenant required" });

    const policies = await db.query.emailAssistantAgentPolicies.findMany({
      where: eq(emailAssistantAgentPolicies.tenantId, tenant.id),
      limit: 2000,
    });

    const policyByAgentId = new Map<number, typeof emailAssistantAgentPolicies.$inferSelect>();
    for (const p of policies) policyByAgentId.set(p.agentId, p);

    const agentRows = await db.query.agents.findMany({
      where: eq(agents.status, "active"),
      orderBy: (t, { asc }) => [asc(t.name)],
      limit: 800,
    });

    const items = agentRows
      .filter((a) => {
        const perms = (a.permissions as any) ?? {};
        const hasEmailPerm = !!perms.email;
        const isAssistant = String(a.role || "").toLowerCase().includes("assistant");
        const hasPolicy = policyByAgentId.has(a.id);
        return hasPolicy || hasEmailPerm || isAssistant;
      })
      .map((a) => {
        const row = policyByAgentId.get(a.id) ?? null;
        const effective = row
          ? {
              isEnabled: !!row.isEnabled,
              readScope: row.readScope === "subject_only" ? "subject_only" : "full_thread",
              canSuggestDrafts: !!row.canSuggestDrafts,
              canSuggestSummaries: !!row.canSuggestSummaries,
              canSuggestFollowups: !!row.canSuggestFollowups,
              sendMode: row.sendMode === "autonomous" ? "autonomous" : row.sendMode === "approval" ? "approval" : "never",
              isDefault: false,
            }
          : DEFAULT_ASSISTANT_POLICY;

        return {
          id: a.id,
          name: a.name,
          role: a.role,
          policy: effective,
        };
      })
      .filter((a) => a.policy.isEnabled);

    res.json({ ok: true, items });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to list assistants" });
  }
});

router.post("/assistant/draft", async (req: any, res) => {
  try {
    const tenant = req.tenant;
    if (!tenant) return res.status(400).json({ message: "tenant required" });

    const staffUser = req.staffUser ?? null;
    const { agentKey, mailbox } = await resolveMailbox(req);

    const assistantAgentId = parseIntSafe(req.body?.assistantAgentId ?? req.body?.assistant_agent_id);
    if (!assistantAgentId) return res.status(400).json({ message: "assistantAgentId required" });

    const effective = await getEffectiveAssistantPolicyForTenant(tenant.id, assistantAgentId);
    if (!effective.isEnabled) return res.status(403).json({ message: "Assistant is disabled" });
    if (!effective.canSuggestDrafts) return res.status(403).json({ message: "Assistant cannot suggest drafts" });

    const assistantAgent = await db.query.agents.findFirst({ where: eq(agents.id, assistantAgentId) });
    if (!assistantAgent || assistantAgent.status !== "active") return res.status(404).json({ message: "Assistant not found" });

    const action = normalizeAssistAction(req.body?.action ?? req.body?.mode);
    const targetLanguage = normalizeLanguage(req.body?.targetLanguage ?? req.body?.language ?? "en");

    const useThreadContext = parseBool(req.body?.useThreadContext ?? req.body?.use_thread_context, true);
    const useRoleContext = parseBool(req.body?.useRoleContext ?? req.body?.use_role_context, true);
    const useToneGuidelines = parseBool(req.body?.useToneGuidelines ?? req.body?.use_tone_guidelines, true);

    const to = Array.isArray(req.body?.to) ? req.body.to : parseStringArray(req.body?.to);
    const subject = safeText(req.body?.subject ?? "");
    const body = safeText(req.body?.body ?? req.body?.text ?? "");
    const contextText = safeText(req.body?.contextText ?? req.body?.context_text ?? req.body?.context ?? "");

    const threadId = parseIntSafe(req.body?.threadId ?? req.body?.thread_id);
    let threadContext = "";
    if (useThreadContext && threadId) {
      const thread = await db.query.emailThreads.findFirst({
        where: and(eq(emailThreads.id, threadId), eq(emailThreads.tenantId, tenant.id), eq(emailThreads.mailboxId, mailbox.id)),
      });
      if (thread) {
        const messages = await db.query.emailMessages.findMany({
          where: and(eq(emailMessages.tenantId, tenant.id), eq(emailMessages.mailboxId, mailbox.id), eq(emailMessages.threadId, thread.id)),
          orderBy: [asc(emailMessages.createdAt)],
          limit: 80,
        });

        threadContext = formatThreadForPrompt({
          subject: thread.subject,
          readScope: effective.readScope,
          messages: messages.map((m) => ({
            direction: m.direction,
            fromEmail: m.fromEmail,
            toJson: m.toJson as any,
            createdAt: m.createdAt as any,
            textBody: (typeof m.textBody === "string" ? m.textBody : null) as any,
          })),
        });
      }
    }
    if (useThreadContext && contextText) {
      const extra = truncateText(contextText, 3500);
      threadContext = threadContext ? `${threadContext}\n\n---\n\nAdditional context provided by user:\n${extra}` : extra;
    }

    const actorLabel = staffUser?.displayName ? String(staffUser.displayName) : "a teammate";
    const roleLabel = useRoleContext ? (Array.isArray(staffUser?.roles) ? staffUser.roles.join(", ") : "") : "";
    const toneGuidelines = buildToneGuidelines({ useToneGuidelines });

    const system = [
      `You are a writing assistant (${assistantAgent.name} — ${assistantAgent.role}).`,
      "You help draft business emails. You never send emails and you never claim actions were executed.",
      "Return ONLY valid JSON. No markdown, no extra text.",
      "",
      "Output schema:",
      `{ "subject": string, "body": string }`,
    ].join("\n");

    const intentLines: string[] = [];
    intentLines.push(`Tenant: ${tenant.name}`);
    intentLines.push(`Mailbox: ${mailbox.email} (agentKey=${agentKey})`);
    intentLines.push(`Writing for: ${actorLabel}${roleLabel ? ` (roles: ${roleLabel})` : ""}`);
    intentLines.push("");

    if (toneGuidelines) {
      intentLines.push("Tone guidelines:");
      intentLines.push(toneGuidelines);
      intentLines.push("");
    }

    if (threadContext) {
      intentLines.push("Thread context (latest messages):");
      intentLines.push(threadContext);
      intentLines.push("");
    }

    intentLines.push("Current draft:");
    intentLines.push(`To: ${(to || []).join(", ") || "(missing)"}`);
    intentLines.push(`Subject: ${subject || "(missing)"}`);
    intentLines.push(`Body:\n${body || "(empty)"}`);
    intentLines.push("");

    const instructionByAction: Record<string, string> = {
      suggest_draft:
        "Write the best next email draft. Keep it practical and respectful. If subject is missing, propose one. If body is empty, draft from scratch using context.",
      reply:
        "Write the best reply email to the context. Be concise, practical, and respectful. If something is missing, ask the minimum clarifying questions. If subject is missing, propose one.",
      follow_up:
        "Write a short follow-up email referencing the prior context. Be calm and professional. Ask for a status update and propose a next step. If subject is missing, propose one.",
      ask_clarification:
        "Write an email asking for clarification on missing details. Keep it short. Use bullet questions. If subject is missing, propose one.",
      send_document:
        "Write an email that accompanies a document/attachment. Do not invent file names. Refer to it generically as 'the attached document' and ask the recipient to confirm receipt. If subject is missing, propose one.",
      improve_tone: "Rewrite the body to be clearer, calmer, and more professional. Preserve meaning. Keep roughly the same length.",
      shorter: "Rewrite the body to be significantly shorter (about 40-60% shorter) while preserving meaning and key asks.",
      formal: "Rewrite the body to be more formal and executive, while staying warm and clear.",
      translate: `Translate the body to ${targetLanguage === "fr" ? "French" : "English"}. Preserve meaning. Keep names, numbers, and email addresses unchanged.`,
    };

    const userPrompt = [
      instructionByAction[action] ?? instructionByAction.suggest_draft,
      "",
      "Return JSON only:",
      `{"subject":"...","body":"..."}`,
    ].join("\n");

    const jobId = `mail_assist_draft_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const agentPolicy = await getAgentPolicy(assistantAgentId);

    const result = await generateText({
      jobId,
      policy: agentPolicy,
      messages: [
        { role: "system", content: system },
        { role: "user", content: intentLines.join("\n") + "\n\n" + userPrompt },
      ],
      maxTokens: 700,
      temperature: 0.3,
      purpose: "mail.assistant.draft",
    });

    const parsed = extractJsonObject(result.text);
    const nextSubject = safeText(parsed?.subject ?? subject);
    const nextBody = safeText(parsed?.body ?? body);

    res.json({
      ok: true,
      suggestedBy: { agentId: assistantAgent.id, name: assistantAgent.name, role: assistantAgent.role },
      action,
      draft: { subject: nextSubject, body: nextBody },
    });
  } catch (err: any) {
    const status = err?.status || 500;
    const payload: any = { message: err?.message || "Assistant request failed" };
    if (err?.name === "AiConsentRequiredError" && err?.plan) payload.plan = err.plan;
    res.status(status).json(payload);
  }
});

router.post("/assistant/context-insights", async (req: any, res) => {
  try {
    const tenant = req.tenant;
    if (!tenant) return res.status(400).json({ message: "tenant required" });

    const assistantAgentId = parseIntSafe(req.body?.assistantAgentId ?? req.body?.assistant_agent_id);
    if (!assistantAgentId) return res.status(400).json({ message: "assistantAgentId required" });

    const effective = await getEffectiveAssistantPolicyForTenant(tenant.id, assistantAgentId);
    if (!effective.isEnabled) return res.status(403).json({ message: "Assistant is disabled" });
    if (!effective.canSuggestSummaries && !effective.canSuggestFollowups) {
      return res.status(403).json({ message: "Assistant cannot summarize or suggest next actions" });
    }

    const assistantAgent = await db.query.agents.findFirst({ where: eq(agents.id, assistantAgentId) });
    if (!assistantAgent || assistantAgent.status !== "active") return res.status(404).json({ message: "Assistant not found" });

    const subject = safeText(req.body?.subject ?? "");
    const contextText = safeText(req.body?.contextText ?? req.body?.context_text ?? req.body?.context ?? "");
    if (!contextText.trim()) return res.status(400).json({ message: "contextText required" });

    const system = [
      `You are a writing assistant (${assistantAgent.name} â€” ${assistantAgent.role}).`,
      "You help a human understand an email context and propose next actions.",
      "You never send emails. You only propose.",
      "Never mention AI, LLMs, models, or internal systems.",
      "Return ONLY valid JSON. No markdown, no extra text.",
    ].join("\n");

    const userPrompt = [
      "Task:",
      "- Summarize the context in 2-5 concise bullets.",
      "- Suggest 2-4 next actions.",
      "- Actions must use ONLY these keys: reply, follow_up, ask_clarification, send_document.",
      "",
      "Return JSON only with this shape:",
      `{"summary":["..."],"suggestedActions":[{"key":"reply","label":"Reply","description":"..."}]}`,
      "",
      `Subject: ${subject || "(none)"}`,
      "",
      "Context:",
      truncateText(contextText, 5000),
    ].join("\n");

    const jobId = `mail_assist_insights_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const agentPolicy = await getAgentPolicy(assistantAgentId);
    const result = await generateText({
      jobId,
      policy: agentPolicy,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userPrompt },
      ],
      maxTokens: 650,
      temperature: 0.2,
      purpose: "mail.assistant.context_insights",
    });

    const parsed = extractJsonObject(result.text) ?? {};
    const summaryRaw = Array.isArray((parsed as any).summary) ? (parsed as any).summary : [];
    const summary = summaryRaw.map((s: any) => safeText(s)).filter(Boolean).slice(0, 8);

    const actionsRaw = Array.isArray((parsed as any).suggestedActions) ? (parsed as any).suggestedActions : [];
    const allowed = new Set(["reply", "follow_up", "ask_clarification", "send_document"]);
    const suggestedActions = actionsRaw
      .map((a: any) => ({
        key: safeText(a?.key),
        label: safeText(a?.label) || safeText(a?.key),
        description: safeText(a?.description || ""),
      }))
      .filter((a: any) => a.key && allowed.has(a.key))
      .slice(0, 6);

    res.json({
      ok: true,
      suggestedBy: { agentId: assistantAgent.id, name: assistantAgent.name, role: assistantAgent.role },
      summary,
      suggestedActions,
    });
  } catch (err: any) {
    const status = err?.status || 500;
    res.status(status).json({ message: err?.message || "Assistant request failed" });
  }
});

router.post("/assistant/thread-insights", async (req: any, res) => {
  try {
    const tenant = req.tenant;
    if (!tenant) return res.status(400).json({ message: "tenant required" });

    const { mailbox } = await resolveMailbox(req);

    const threadId = parseIntSafe(req.body?.threadId ?? req.body?.thread_id);
    if (!threadId) return res.status(400).json({ message: "threadId required" });

    const assistantAgentId = parseIntSafe(req.body?.assistantAgentId ?? req.body?.assistant_agent_id);
    if (!assistantAgentId) return res.status(400).json({ message: "assistantAgentId required" });

    const effective = await getEffectiveAssistantPolicyForTenant(tenant.id, assistantAgentId);
    if (!effective.isEnabled) return res.status(403).json({ message: "Assistant is disabled" });
    if (!effective.canSuggestSummaries) return res.status(403).json({ message: "Assistant cannot summarize threads" });

    const assistantAgent = await db.query.agents.findFirst({ where: eq(agents.id, assistantAgentId) });
    if (!assistantAgent || assistantAgent.status !== "active") return res.status(404).json({ message: "Assistant not found" });

    const thread = await db.query.emailThreads.findFirst({
      where: and(eq(emailThreads.id, threadId), eq(emailThreads.tenantId, tenant.id), eq(emailThreads.mailboxId, mailbox.id)),
    });
    if (!thread) return res.status(404).json({ message: "Thread not found" });

    const existing = await db.query.emailThreadInsights.findFirst({
      where: and(eq(emailThreadInsights.tenantId, tenant.id), eq(emailThreadInsights.threadId, thread.id)),
    });

    const threadLast = thread.lastMessageAt ? new Date(thread.lastMessageAt as any) : null;
    const existingLast = existing?.sourceLastMessageAt ? new Date(existing.sourceLastMessageAt as any) : null;

    const isFresh = !!existing && !!threadLast && !!existingLast && existingLast.getTime() >= threadLast.getTime();
    if (isFresh) {
      return res.json({
        ok: true,
        threadId: thread.id,
        summary: (existing.summaryJson as any) ?? {},
        nextActions: (existing.nextActionsJson as any) ?? [],
        cached: true,
      });
    }

    const messages = await db.query.emailMessages.findMany({
      where: and(eq(emailMessages.tenantId, tenant.id), eq(emailMessages.mailboxId, mailbox.id), eq(emailMessages.threadId, thread.id)),
      orderBy: [asc(emailMessages.createdAt)],
      limit: 120,
    });

    const threadContext = formatThreadForPrompt({
      subject: thread.subject,
      readScope: effective.readScope,
      messages: messages.map((m) => ({
        direction: m.direction,
        fromEmail: m.fromEmail,
        toJson: m.toJson as any,
        createdAt: m.createdAt as any,
        textBody: (typeof m.textBody === "string" ? m.textBody : null) as any,
      })),
    });

    const system = [
      `You are a writing assistant (${assistantAgent.name} — ${assistantAgent.role}).`,
      "You help a human understand an email thread and draft next steps.",
      "You never send emails. You only propose.",
      "Return ONLY valid JSON. No markdown, no extra text.",
      "",
      "Output schema:",
      `{ "summaryBullets": string[], "nextActions": Array<{ "title": string, "description": string, "draft": { "subject": string, "body": string } }> }`,
    ].join("\n");

    const userPrompt = [
      `Tenant: ${tenant.name}`,
      "",
      "Thread context:",
      threadContext,
      "",
      "Task:",
      "- Write 3-5 concise summary bullets.",
      "- Suggest up to 3 next actions with short titles.",
      "- For each next action, include a proposed email reply draft (subject + body).",
      "- Keep tone calm and executive. No hype. No mention of AI or internal systems.",
      "",
      "Return JSON only.",
    ].join("\n");

    const jobId = `mail_assist_insights_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const agentPolicy = await getAgentPolicy(assistantAgentId);
    const result = await generateText({
      jobId,
      policy: agentPolicy,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userPrompt },
      ],
      maxTokens: 900,
      temperature: 0.2,
      purpose: "mail.assistant.thread_insights",
    });

    const parsed = extractJsonObject(result.text) ?? {};
    const summaryBullets = Array.isArray(parsed.summaryBullets)
      ? parsed.summaryBullets.filter((s: any) => typeof s === "string").slice(0, 6)
      : [];
    const nextActions = Array.isArray(parsed.nextActions) ? parsed.nextActions.slice(0, 5) : [];

    const summaryJson = { summaryBullets, generatedAt: new Date().toISOString() };
    const now = new Date();

    const [upserted] = await db
      .insert(emailThreadInsights)
      .values({
        tenantId: tenant.id,
        mailboxId: mailbox.id,
        threadId: thread.id,
        sourceLastMessageAt: thread.lastMessageAt as any,
        summaryJson: summaryJson as any,
        nextActionsJson: nextActions as any,
        generatedByAgentId: assistantAgentId,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [emailThreadInsights.threadId],
        set: {
          sourceLastMessageAt: thread.lastMessageAt as any,
          summaryJson: summaryJson as any,
          nextActionsJson: nextActions as any,
          generatedByAgentId: assistantAgentId,
          updatedAt: now,
        },
      })
      .returning();

    res.json({
      ok: true,
      threadId: thread.id,
      summary: upserted.summaryJson ?? summaryJson,
      nextActions: upserted.nextActionsJson ?? nextActions,
      cached: false,
    });
  } catch (err: any) {
    const status = err?.status || 500;
    const payload: any = { message: err?.message || "Assistant request failed" };
    if (err?.name === "AiConsentRequiredError" && err?.plan) payload.plan = err.plan;
    res.status(status).json(payload);
  }
});

export default router;
