import { Router } from "express";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@db";
import {
  commsMessages,
  commsParticipants,
  commsThreads,
} from "@db/schema";
import { ensureTenantStaff, isChairmanAssistantUser } from "./utils/auth";
import { normalizeAgentKey } from "../lib/mail/agentSlugs";
import { normalizeE164 } from "../lib/communications/twilio";
import { sendCommunicationAsStaff } from "../lib/communications/sendAsStaff";
import { ensureDefaultOpsThreads } from "../lib/ops-comms/threads";

const router = Router();
router.use(ensureTenantStaff);

function parseIntSafe(value: unknown) {
  const n = typeof value === "number" ? value : parseInt(String(value ?? ""), 10);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function isAdminUser(user: any) {
  if (!user) return false;
  const currentMode = (user as any).currentMode;
  const roles = Array.isArray((user as any).roles) ? (user as any).roles : [];
  const perms = Array.isArray((user as any).permissions) ? (user as any).permissions : [];
  return currentMode === "admin" || roles.includes("admin") || perms.includes("*") || isChairmanAssistantUser(user);
}

function parseStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v ?? "").trim()).filter(Boolean);
  if (typeof value === "string") return value.split(",").map((v) => v.trim()).filter(Boolean);
  return [];
}

function parseContentVariables(value: unknown): Record<string, string> | null {
  if (!value) return null;
  if (typeof value === "object" && !Array.isArray(value)) {
    return Object.fromEntries(Object.entries(value as any).slice(0, 25).map(([k, v]) => [String(k), String(v)]));
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return Object.fromEntries(Object.entries(parsed as any).slice(0, 25).map(([k, v]) => [String(k), String(v)]));
      }
    } catch {
      return null;
    }
  }
  return null;
}

const ALLOWED_MESSAGE_TYPES = new Set([
  "STATUS_UPDATE",
  "REQUEST",
  "DECISION",
  "HANDOFF",
  "ALERT",
  "ACTION_TRIGGER",
  // Backward-compat with earlier drafts / existing data
  "ACTION_CARD",
  "ESCALATION",
  "FYI",
]);

const ALLOWED_PRIORITIES = new Set(["LOW", "NORMAL", "HIGH", "URGENT"]);

// External communications send API (Twilio SMS/WhatsApp).
router.post("/send", async (req: any, res) => {
  try {
    const tenant = req.tenant;
    if (!tenant) return res.status(400).json({ message: "tenant required" });

    const staffUser = req.staffUser;
    const admin = isAdminUser(staffUser);

    const channel = String(req.body?.channel ?? req.body?.type ?? "whatsapp").trim().toLowerCase();
    if (channel !== "sms" && channel !== "whatsapp") return res.status(400).json({ message: "channel must be sms|whatsapp" });

    const agentKey = normalizeAgentKey(String(req.body?.agentKey ?? req.body?.agent_id ?? req.body?.agent ?? ""));
    if (!agentKey) return res.status(400).json({ message: "agentKey required" });

    const toE164 = normalizeE164(req.body?.toE164 ?? req.body?.to_e164 ?? req.body?.to);
    if (!toE164) return res.status(400).json({ message: "toE164 (E.164) required" });

    const mode = String(req.body?.mode || (req.body?.contentSid ? "template" : "text")).trim().toLowerCase();
    if (mode !== "text" && mode !== "template") return res.status(400).json({ message: "mode must be text|template" });
    if (mode === "template" && channel !== "whatsapp") {
      return res.status(400).json({ message: "template mode is only supported for WhatsApp" });
    }

    const body = String(req.body?.body ?? req.body?.message ?? "").trim();
    const contentSid = mode === "template" ? String(req.body?.contentSid ?? req.body?.content_sid ?? "").trim() || null : null;
    const contentVariables = mode === "template" ? parseContentVariables(req.body?.contentVariables ?? req.body?.content_variables) : null;
    const clientMessageId = String(req.body?.clientMessageId ?? req.body?.client_message_id ?? "").trim() || null;

    if (mode === "text" && !body) return res.status(400).json({ message: "body required" });
    if (mode === "template" && !contentSid) return res.status(400).json({ message: "contentSid required for template mode" });

    const mediaUrls = parseStringArray(req.body?.mediaUrls ?? req.body?.media_urls);

    const out = await sendCommunicationAsStaff({
      tenantId: tenant.id,
      agentKey,
      channel,
      toE164,
      mode,
      body,
      ...(contentSid ? { contentSid, contentVariables } : {}),
      clientMessageId,
      mediaUrls: mediaUrls.length ? mediaUrls : null,
      requestedByUserId: staffUser?.id ?? null,
      admin,
      source: "api.comms.send",
      ackOnly: false,
    });

    if (!out.ok) return res.status(503).json({ ok: false, message: out.errorMessage || "Send failed" });

    res.status(201).json({ ok: true, result: out });
  } catch (err: any) {
    const status = typeof err?.status === "number" ? err.status : 500;
    if (status === 429) res.setHeader("Retry-After", String(err?.retryAfterSec || 60));
    res.status(status).json({ message: err?.message || "Failed to send message" });
  }
});



router.get("/threads", async (req: any, res) => {
  try {
    const tenant = req.tenant;
    if (!tenant) return res.status(400).json({ message: "tenant required" });

    // Seed core coordination threads (Board / Execution / Depts / Ops General).
    await ensureDefaultOpsThreads(tenant.id);

    const limit = Math.min(Math.max(parseIntSafe(req.query?.limit) ?? 50, 1), 500);
    const type = String(req.query?.type || "").trim();

    const conditions = [eq(commsThreads.tenantId, tenant.id)];
    if (type) conditions.push(eq(commsThreads.type, type as any));

    let threads = await db
      .select()
      .from(commsThreads)
      .where(conditions.length === 1 ? conditions[0] : and(...conditions))
      .orderBy(desc(commsThreads.createdAt))
      .limit(limit);

    const threadIds = threads.map((t) => t.id);
    const participants = threadIds.length
      ? await db
          .select()
          .from(commsParticipants)
          .where(and(eq(commsParticipants.tenantId, tenant.id), inArray(commsParticipants.threadId, threadIds)))
      : [];

    const byThread = new Map<number, typeof participants>();
    for (const p of participants) {
      const list = byThread.get(p.threadId) || [];
      list.push(p);
      byThread.set(p.threadId, list);
    }

    res.json({
      ok: true,
      threads: threads.map((t) => ({ ...t, participants: byThread.get(t.id) || [] })),
    });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to list threads" });
  }
});

router.post("/threads", async (req: any, res) => {
  try {
    const tenant = req.tenant;
    if (!tenant) return res.status(400).json({ message: "tenant required" });

    const staffUser = req.staffUser;
    if (!isAdminUser(staffUser)) return res.status(403).json({ message: "Admin required" });

    const type = String(req.body?.type || "").trim();
    if (!type) return res.status(400).json({ message: "type required" });

    const name = typeof req.body?.name === "string" ? req.body.name.trim() : null;
    const visibilityPolicy = typeof req.body?.visibilityPolicy === "string" ? req.body.visibilityPolicy.trim() : null;

    const participantsRaw = Array.isArray(req.body?.participants) ? req.body.participants : [];
    const participants = participantsRaw.map((v: any) => normalizeAgentKey(v)).filter(Boolean);

    const now = new Date();
    const [thread] = await db
      .insert(commsThreads)
      .values({
        tenantId: tenant.id,
        type: type as any,
        name,
        visibilityPolicy: (visibilityPolicy as any) || ("TENANT_INTERNAL" as any),
        createdByAgentKey: "admin",
        metadata: req.body?.metadata && typeof req.body.metadata === "object" ? req.body.metadata : {},
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    for (const agentKey of participants) {
      await db
        .insert(commsParticipants)
        .values({
          tenantId: tenant.id,
          threadId: thread.id,
          agentKey,
          roleInThread: "MEMBER" as any,
          createdAt: now,
        })
        .onConflictDoNothing();
    }

    res.status(201).json({ ok: true, thread });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to create thread" });
  }
});

router.get("/threads/:threadId/messages", async (req: any, res) => {
  try {
    const tenant = req.tenant;
    if (!tenant) return res.status(400).json({ message: "tenant required" });

    const threadId = parseIntSafe(req.params?.threadId);
    if (!threadId) return res.status(400).json({ message: "Invalid threadId" });

    const limit = Math.min(Math.max(parseIntSafe(req.query?.limit) ?? 200, 1), 2000);

    const messages = await db
      .select()
      .from(commsMessages)
      .where(and(eq(commsMessages.tenantId, tenant.id), eq(commsMessages.threadId, threadId)))
      .orderBy(asc(commsMessages.createdAt))
      .limit(limit);

    res.json({ ok: true, messages });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to list messages" });
  }
});

router.post("/threads/:threadId/messages", async (req: any, res) => {
  try {
    const tenant = req.tenant;
    if (!tenant) return res.status(400).json({ message: "tenant required" });

    const staffUser = req.staffUser;
    if (!isAdminUser(staffUser)) return res.status(403).json({ message: "Admin required" });

    const threadId = parseIntSafe(req.params?.threadId);
    if (!threadId) return res.status(400).json({ message: "Invalid threadId" });

    const senderAgentKey = normalizeAgentKey(req.body?.senderAgentKey ?? req.body?.sender_agent_key ?? "");
    const senderType = String(req.body?.senderType ?? req.body?.sender_type ?? "AGENT").trim();
    const messageType = String(req.body?.messageType ?? req.body?.message_type ?? "STATUS_UPDATE").trim().toUpperCase();
    const priority = String(req.body?.priority ?? "NORMAL").trim().toUpperCase();

    if (!ALLOWED_MESSAGE_TYPES.has(messageType)) {
      return res.status(400).json({ message: `Invalid messageType. Allowed: ${Array.from(ALLOWED_MESSAGE_TYPES).join(", ")}` });
    }

    if (!ALLOWED_PRIORITIES.has(priority)) {
      return res.status(400).json({ message: `Invalid priority. Allowed: ${Array.from(ALLOWED_PRIORITIES).join(", ")}` });
    }

    const contentText = typeof req.body?.contentText === "string" ? req.body.contentText : typeof req.body?.content_text === "string" ? req.body.content_text : null;
    const contentJson = req.body?.contentJson && typeof req.body.contentJson === "object" ? req.body.contentJson : req.body?.content_json && typeof req.body.content_json === "object" ? req.body.content_json : {};

    const now = new Date();
    const [msg] = await db
      .insert(commsMessages)
      .values({
        tenantId: tenant.id,
        threadId,
        senderType: senderType as any,
        senderAgentKey: senderAgentKey || null,
        messageType: messageType as any,
        contentText,
        contentJson,
        priority: priority as any,
        requiresAck: Boolean(req.body?.requiresAck ?? req.body?.requires_ack ?? false),
        ackByAgentKeys: [],
        metadata: {},
        createdAt: now,
      })
      .returning();

    await db
      .update(commsThreads)
      .set({ updatedAt: now })
      .where(and(eq(commsThreads.tenantId, tenant.id), eq(commsThreads.id, threadId)));

    res.status(201).json({ ok: true, message: msg });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to post message" });
  }
});

router.get("/supervisor-feed", async (req: any, res) => {
  try {
    const tenant = req.tenant;
    if (!tenant) return res.status(400).json({ message: "tenant required" });

    const staffUser = req.staffUser;
    if (!isAdminUser(staffUser)) return res.status(403).json({ message: "Admin required" });

    const limit = Math.min(Math.max(parseIntSafe(req.query?.limit) ?? 200, 1), 2000);

    const rows = await db
      .select()
      .from(commsMessages)
      .where(
        and(
          eq(commsMessages.tenantId, tenant.id),
          sql`${commsMessages.priority} in ('HIGH','URGENT') or ${commsMessages.requiresAck} = true or ${commsMessages.messageType} in ('REQUEST','DECISION','ALERT','ACTION_CARD')`,
        ),
      )
      .orderBy(desc(commsMessages.createdAt))
      .limit(limit);

    res.json({ ok: true, messages: rows });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to fetch supervisor feed" });
  }
});

export default router;
