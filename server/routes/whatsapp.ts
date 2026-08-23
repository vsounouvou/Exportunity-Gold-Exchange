import { Router, type Request, type Response, type NextFunction } from "express";
import { db } from "@db";
import {
  agentActionLogs,
  assistantActionsLog,
  eceSessions,
  eceUsers,
  userWhatsappChannels,
  whatsappConversations,
  whatsappLinkTokens,
  whatsappMedia,
  whatsappMessages,
} from "@db/schema";
import { and, desc, eq, gte, ilike, isNull, lte } from "drizzle-orm";
import { downloadWhatsAppMedia } from "../lib/whatsapp/media";
import { processIncomingWhatsAppMessage } from "../lib/whatsapp/orchestrator";
import { getWhatsAppProvider } from "../lib/whatsapp/provider";
import { normalizeWaPhoneE164, hashOtp } from "../lib/whatsapp/waGateway";
import { canRunLegacyWhatsAppAutomation } from "../lib/communications/inbound-auto-reply-policy";
import {
  metaWebhookSecurityStatus,
  verifyMetaWebhookChallenge,
  verifyMetaWebhookSignature,
} from "../lib/integrations/metaWebhookSecurity";
import { isChairmanAssistantUser } from "./utils/auth";
import { AGENT_KEYS } from "../agents";

type AuthedRequest = Request & { user?: any; rawBody?: Buffer };

async function verifySession(token: string | undefined) {
  if (!token) return null;
  const session = await db.query.eceSessions.findFirst({ where: eq(eceSessions.token, token) });
  if (!session || new Date(session.expiresAt) < new Date()) return null;
  return await db.query.eceUsers.findFirst({ where: eq(eceUsers.id, session.userId) });
}

async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  const user = await verifySession(token);
  if (!user) return res.status(401).json({ error: "Authentication required" });
  req.user = user;
  next();
}

function requireEceAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  const roles = Array.isArray(req.user?.roles) ? req.user.roles : [];
  if (req.user?.role === "admin" || roles.includes("admin") || isChairmanAssistantUser(req.user)) return next();
  return res.status(403).json({ error: "Admin access required" });
}

function requireEceStaff(req: AuthedRequest, res: Response, next: NextFunction) {
  const role = typeof req.user?.role === "string" ? req.user.role : "";
  const roles = Array.isArray(req.user?.roles) ? req.user.roles : [];
  const perms = Array.isArray(req.user?.permissions) ? req.user.permissions : [];
  const currentMode = (req.user as any)?.currentMode;
  const labels = [role, ...roles].filter(Boolean).map((r) => String(r).toLowerCase());
  const isStaff =
    currentMode === "admin" ||
    perms.includes("*") ||
    isChairmanAssistantUser(req.user) ||
    labels.includes("admin") ||
    labels.includes("staff") ||
    labels.includes("agent");
  if (isStaff) return next();
  return res.status(403).json({ error: "Staff access required" });
}

export const whatsappApiRouter = Router();
const provider = getWhatsAppProvider();

const SESSION_WINDOW_MS = 24 * 60 * 60 * 1000;

const sendBuckets = new Map<string, { count: number; resetAt: number }>();

function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const row = sendBuckets.get(key);
  if (!row || row.resetAt <= now) {
    sendBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  if (row.count >= limit) {
    const retryAfterSec = Math.max(1, Math.ceil((row.resetAt - now) / 1000));
    const err = new Error("Rate limit exceeded");
    (err as any).status = 429;
    (err as any).retryAfterSec = retryAfterSec;
    throw err;
  }
  row.count += 1;
}

function parseAgentKey(value: unknown) {
  const raw = String(value ?? "").trim();
  if (AGENT_KEYS.includes(raw as any)) return raw;
  return "ops";
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

// Public status (non-sensitive): lets clients decide whether to surface WhatsApp actions.
whatsappApiRouter.get("/status", async (_req: Request, res: Response) => {
  res.json({ ok: true, status: provider.getStatus() });
});

async function upsertConversation(input: {
  tenantId: number;
  conversationId: string;
  waPhoneE164: string;
  lastInboundAt?: Date | null;
  lastOutboundAt?: Date | null;
}) {
  const now = new Date();
  const set: any = { waPhoneE164: input.waPhoneE164, updatedAt: now };
  if (input.lastInboundAt) set.lastInboundAt = input.lastInboundAt;
  if (input.lastOutboundAt) set.lastOutboundAt = input.lastOutboundAt;
  await db
    .insert(whatsappConversations)
    .values({
      tenantId: input.tenantId,
      conversationId: input.conversationId,
      waPhoneE164: input.waPhoneE164,
      status: "open",
      lastInboundAt: input.lastInboundAt ?? null,
      lastOutboundAt: input.lastOutboundAt ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [whatsappConversations.tenantId, whatsappConversations.conversationId],
      set,
    });
}

// UI helper: instruct user to initiate linking from WhatsApp (preferred OTP flow).
whatsappApiRouter.post("/link/start", requireAuth, async (_req: AuthedRequest, res) => {
  res.json({
    ok: true,
    instructions: "Open WhatsApp and send START to the platform number. You'll receive a 6-digit code to enter here.",
  });
});

// Confirm OTP entered in platform UI: binds WhatsApp phone to the authenticated user.
whatsappApiRouter.post("/link/confirm", requireAuth, async (req: AuthedRequest, res) => {
  const otp = String(req.body?.otp || "").trim();
  if (!/^\d{6}$/.test(otp)) return res.status(400).json({ error: "Invalid OTP" });

  const otpHash = hashOtp(otp);
  const tokenRow = await db.query.whatsappLinkTokens.findFirst({
    where: and(eq(whatsappLinkTokens.otpHash, otpHash), isNull(whatsappLinkTokens.usedAt)),
    orderBy: desc(whatsappLinkTokens.createdAt),
  });

  if (!tokenRow || new Date(tokenRow.expiresAt).getTime() < Date.now()) {
    return res.status(400).json({ error: "OTP expired or invalid" });
  }

  // Phone ownership is identity. Don't allow reuse.
  const existing = await db.query.userWhatsappChannels.findFirst({
    where: eq(userWhatsappChannels.waPhoneE164, tokenRow.waPhoneE164),
  });
  if (existing && existing.userId !== req.user!.id) {
    return res.status(409).json({ error: "This WhatsApp number is already linked to another account" });
  }

  await db
    .insert(userWhatsappChannels)
    .values({
      userId: req.user!.id,
      waPhoneE164: tokenRow.waPhoneE164,
      verifiedAt: new Date(),
      status: "active",
      lastSeenAt: new Date(),
      waDisplayName: null,
    })
    .onConflictDoNothing();

  await db.update(whatsappLinkTokens).set({ usedAt: new Date() }).where(eq(whatsappLinkTokens.id, tokenRow.id));
  res.json({ ok: true, waPhoneE164: tokenRow.waPhoneE164 });
});

whatsappApiRouter.get("/me", requireAuth, async (req: AuthedRequest, res) => {
  const channel = await db.query.userWhatsappChannels.findFirst({ where: eq(userWhatsappChannels.userId, req.user!.id) });
  res.json({ linked: !!channel, channel });
});

whatsappApiRouter.get("/admin/conversations", requireAuth, requireEceAdmin, async (_req: AuthedRequest, res) => {
  try {
    const tenantId = (_req as any)?.tenant?.id as number | undefined;
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });

    const conversations = await db.query.whatsappConversations.findMany({
      where: eq(whatsappConversations.tenantId, tenantId),
      orderBy: desc(whatsappConversations.updatedAt),
      limit: 200,
    });

    const latest = await db.query.whatsappMessages.findMany({
      where: eq(whatsappMessages.tenantId, tenantId),
      orderBy: desc(whatsappMessages.createdAt),
      limit: 500,
    });

    const lastByConversation = new Map<string, any>();
    for (const m of latest) {
      const key = m.conversationId || `wa:${m.waPhoneE164}`;
      if (!lastByConversation.has(key)) lastByConversation.set(key, m);
    }

    return res.json(
      conversations.map((c) => ({
        conversationId: c.conversationId,
        phone: c.waPhoneE164,
        lastMessage: lastByConversation.get(c.conversationId) ?? null,
        lastInboundAt: c.lastInboundAt ?? null,
        lastOutboundAt: c.lastOutboundAt ?? null,
        status: c.status,
        updatedAt: c.updatedAt ?? null,
      }))
    );
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "Failed to list conversations" });
  }
});

whatsappApiRouter.get("/admin/conversations/:conversationId/messages", requireAuth, requireEceAdmin, async (req: AuthedRequest, res) => {
  try {
    const tenantId = (req as any)?.tenant?.id as number | undefined;
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
    const conversationId = req.params.conversationId;
    const messages = await db.query.whatsappMessages.findMany({
      where: and(eq(whatsappMessages.tenantId, tenantId), eq(whatsappMessages.conversationId, conversationId)),
      orderBy: desc(whatsappMessages.createdAt),
      limit: 200,
    });
    return res.json(messages.reverse());
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "Failed to list conversation messages" });
  }
});

whatsappApiRouter.get("/admin/status", requireAuth, requireEceAdmin, async (req: AuthedRequest, res) => {
  const tenant = (req as any)?.tenant || null;
  res.json({ ok: true, tenantKey: tenant?.key ?? null, status: provider.getStatus() });
});

whatsappApiRouter.get("/admin/templates", requireAuth, requireEceAdmin, async (_req: AuthedRequest, res) => {
  const templates = await provider.listTemplates().catch(() => []);
  res.json({ ok: true, templates });
});

whatsappApiRouter.get("/admin/logs", requireAuth, requireEceAdmin, async (req: AuthedRequest, res) => {
  try {
    const tenantId = (req as any)?.tenant?.id as number | undefined;
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });

    const limitRaw = parseInt(String(req.query?.limit ?? "50"), 10);
    const offsetRaw = parseInt(String(req.query?.offset ?? "0"), 10);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 50;
    const offset = Number.isFinite(offsetRaw) ? Math.max(offsetRaw, 0) : 0;

    const phone = String(req.query?.phone || "").trim();
    const status = String(req.query?.status || "").trim();
    const direction = String(req.query?.direction || "").trim();
    const errorCode = String(req.query?.errorCode || "").trim();
    const dateFromRaw = String(req.query?.dateFrom || req.query?.from || "").trim();
    const dateToRaw = String(req.query?.dateTo || req.query?.to || "").trim();

    const conditions: any[] = [eq(whatsappMessages.tenantId, tenantId)];
    if (phone) {
      const digits = phone.replace(/[^\d]/g, "");
      if (digits) conditions.push(ilike(whatsappMessages.waPhoneE164, `%${digits}%`));
    }
    if (direction) conditions.push(eq(whatsappMessages.direction, direction as any));
    if (status) conditions.push(eq(whatsappMessages.deliveryStatus, status as any));
    if (errorCode) conditions.push(eq(whatsappMessages.errorCode, errorCode));

    if (dateFromRaw) {
      const dateFrom = new Date(dateFromRaw);
      if (!Number.isNaN(dateFrom.getTime())) {
        conditions.push(gte(whatsappMessages.createdAt, dateFrom));
      }
    }
    if (dateToRaw) {
      const dateTo = new Date(dateToRaw);
      if (!Number.isNaN(dateTo.getTime())) {
        conditions.push(lte(whatsappMessages.createdAt, dateTo));
      }
    }

    const items = await db
      .select()
      .from(whatsappMessages)
      .where(conditions.length === 1 ? conditions[0] : and(...conditions))
      .orderBy(desc(whatsappMessages.createdAt))
      .limit(limit)
      .offset(offset);

    res.json({ ok: true, items, limit, offset, hasMore: items.length === limit });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to list logs" });
  }
});

whatsappApiRouter.post("/send", requireAuth, requireEceStaff, async (req: AuthedRequest, res) => {
  try {
    const tenantId = (req as any)?.tenant?.id as number | undefined;
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });

    const to = normalizeWaPhoneE164(String(req.body?.to || req.body?.waPhoneE164 || "").trim());
    if (!to) return res.status(400).json({ error: "to is required" });

    const conversationId = String(req.body?.conversationId || `wa:${to}`);
    const clientMessageIdRaw = String(req.body?.clientMessageId || req.body?.client_message_id || "").trim();
    const clientMessageId = clientMessageIdRaw ? clientMessageIdRaw : null;
    if (clientMessageId && !isUuid(clientMessageId)) {
      return res.status(400).json({ error: "clientMessageId must be a UUID" });
    }

    if (clientMessageId) {
      const existing = await db.query.whatsappMessages.findFirst({
        where: and(
          eq(whatsappMessages.tenantId, tenantId),
          eq(whatsappMessages.direction, "out"),
          eq(whatsappMessages.clientMessageId, clientMessageId),
        ),
      });
      if (existing) {
        const existingPayload = (existing as any)?.payloadJson as any;
        return res.json({
          ok: true,
          idempotent: true,
          sendType: existingPayload?.type || (existing.messageType === "template" ? "template" : "text"),
          withinSession: null,
          estimatedCostUsd: existingPayload?.estimatedCostUsd ?? null,
          sendResult: existingPayload?.sendResult ?? { ok: true, waMessageId: existing.waMessageId },
          message: existing,
        });
      }
    }

    const dryRunRequested = Boolean(req.body?.dryRun);
    const status = provider.getStatus();
    const dryRunAllowed = Boolean(status?.dryRunAllowed);
    if (dryRunRequested && !dryRunAllowed) {
      return res.status(400).json({ error: "Dry-run is disabled on this server" });
    }
    const dryRun = dryRunRequested && dryRunAllowed;

    // Basic rate limits (in-memory, per-process).
    rateLimit(`tenant:${tenantId}`, 30, 60_000);
    rateLimit(`phone:${tenantId}:${to}`, 6, 60_000);

    const agent = parseAgentKey(req.body?.agent);
    const taskId = typeof req.body?.taskId === "number" ? req.body.taskId : null;

    const templateName = String(req.body?.templateName || "").trim();
    const languageCode = String(req.body?.languageCode || req.body?.templateLanguage || "en_US").trim();
    const message = String(req.body?.message || req.body?.text || "").trim();

    const [lastInbound] = await db
      .select()
      .from(whatsappMessages)
      .where(and(eq(whatsappMessages.tenantId, tenantId), eq(whatsappMessages.conversationId, conversationId), eq(whatsappMessages.direction, "in")))
      .orderBy(desc(whatsappMessages.createdAt))
      .limit(1);

    const lastInboundAt = lastInbound?.createdAt ? new Date(lastInbound.createdAt) : null;
    const withinSession = lastInboundAt ? Date.now() - lastInboundAt.getTime() <= SESSION_WINDOW_MS : false;

    const sendType = templateName ? "template" : "text";
    if (sendType === "text" && !withinSession) {
      return res.status(428).json({
        error: "Template required outside 24h session window",
        required: "template",
        hint: "Send a template message for first contact or after 24h inactivity.",
      });
    }
    if (sendType === "text" && !message) return res.status(400).json({ error: "message is required for text sends" });
    if (sendType === "template" && !templateName) return res.status(400).json({ error: "templateName is required for template sends" });

    const sendResult =
      dryRun
        ? { ok: true as const, waMessageId: `dry_${Date.now()}`, dryRun: true, debug: { notes: ["dry_run"] } }
        : sendType === "template"
          ? await provider.sendTemplate(to, templateName, languageCode)
          : await provider.sendText(to, message);

    const estimatedCostUsd = sendType === "template" ? 0.005 : 0.0;

    const now = new Date();
    await upsertConversation({
      tenantId,
      conversationId,
      waPhoneE164: to,
      lastOutboundAt: now,
    });

    await db.insert(whatsappMessages).values({
      tenantId,
      direction: "out",
      waMessageId: sendResult.ok ? sendResult.waMessageId : `fail_${Date.now()}`,
      clientMessageId,
      userId: req.user?.id ?? null,
      waPhoneE164: to,
      timestamp: now,
      messageType: sendType === "template" ? "template" : "text",
      textBody: sendType === "text" ? message : null,
      payloadJson: { type: sendType, templateName: templateName || null, languageCode, message, sendResult, estimatedCostUsd },
      conversationId,
      deliveryStatus: sendResult.ok ? "sent" : "failed",
      errorCode: sendResult.ok ? null : sendResult.errorCode || null,
      errorMessage: sendResult.ok ? null : sendResult.error,
      createdAt: now,
    });

    await db.insert(agentActionLogs).values({
      tenantId,
      agent: agent as any,
      taskId,
      action: "whatsapp.send",
      estimatedCostUsd: estimatedCostUsd.toFixed(4),
      status: sendResult.ok ? "ok" : "error",
      outputSummary: sendResult.ok ? `Sent ${sendType} to ${to}` : `Send failed: ${sendResult.error}`,
      metadata: { to, conversationId, sendType, templateName: templateName || null, languageCode, dryRun, sendResult },
      createdAt: now,
    });

    if (!sendResult.ok) {
      return res.status(502).json({ error: sendResult.error, errorCode: sendResult.errorCode || null, sendType, withinSession, estimatedCostUsd, sendResult });
    }

    res.json({ ok: true, sendType, withinSession, estimatedCostUsd, sendResult });
  } catch (err: any) {
    const status = typeof err?.status === "number" ? err.status : 500;
    if (status === 429) {
      res.setHeader("Retry-After", String(err?.retryAfterSec || 60));
    }
    res.status(status).json({ error: err?.message || "Send failed" });
  }
});

export async function whatsappWebhookVerify(req: Request, res: Response) {
  const verification = verifyMetaWebhookChallenge({
    purpose: "whatsapp",
    mode: req.query["hub.mode"],
    verifyToken: req.query["hub.verify_token"],
    challenge: req.query["hub.challenge"],
  });
  if (verification.ok) {
    return res.status(200).type("text/plain").send(verification.challenge);
  }
  if (!metaWebhookSecurityStatus("whatsapp").verifyTokenConfigured) {
    return res.status(503).json({ error: "Meta webhook verification is not configured" });
  }
  return res.sendStatus(403);
}

export async function whatsappWebhook(req: AuthedRequest, res: Response) {
  const signature = req.headers["x-hub-signature-256"] as string | undefined;
  const verification = verifyMetaWebhookSignature({
    purpose: "whatsapp",
    rawBody: req.rawBody,
    signatureHeader: signature,
  });
  if (!verification.ok) {
    if (verification.reason === "signing_secret_not_configured") {
      return res.status(503).json({ error: "Meta webhook signature verification is not configured" });
    }
    return res.status(401).json({ error: "Invalid signature" });
  }

  const payload = req.body;
  const tenantId = (req as any)?.tenant?.id as number | undefined;
  const tenantKey = String((req as any)?.tenant?.key || "").trim().toLowerCase();

  // Status updates (delivery receipts)
  const statuses = payload?.entry?.flatMap((e: any) => e?.changes?.flatMap((c: any) => c?.value?.statuses || []) || []) || [];
  for (const st of statuses) {
    const id = st?.id;
    const status = st?.status;
    if (!id || !status) continue;
    await db.update(whatsappMessages).set({ deliveryStatus: status }).where(eq(whatsappMessages.waMessageId, id));
  }

  const messages = payload?.entry?.flatMap((e: any) => e?.changes?.flatMap((c: any) => c?.value?.messages || []) || []) || [];
  if (!messages.length) return res.sendStatus(200);

  for (const m of messages) {
    const waMessageId = m?.id;
    const from = normalizeWaPhoneE164(m?.from || "");
    if (!waMessageId || !from) continue;
    const conversationId = `wa:${from}`;

    // Idempotency: skip if already recorded.
    const inserted = await db
      .insert(whatsappMessages)
      .values({
        tenantId: tenantId ?? null,
        direction: "in",
        waMessageId,
        userId: null,
        waPhoneE164: from,
        timestamp: m?.timestamp ? new Date(parseInt(m.timestamp, 10) * 1000) : new Date(),
        messageType: (m?.type || "text") as any,
        textBody: m?.text?.body || null,
        payloadJson: payload,
        conversationId,
        deliveryStatus: "sent",
      })
      .onConflictDoNothing()
      .returning();
    if (!inserted.length) continue;

    let mediaDbId: number | null = null;
    const waMediaId = m?.image?.id || m?.video?.id || m?.document?.id || m?.audio?.id;
    if (waMediaId) {
      const downloaded = await downloadWhatsAppMedia(waMediaId);
      if (downloaded) {
        const [mediaRow] = await db
          .insert(whatsappMedia)
          .values({
            waMediaId,
            userId: null,
            mimeType: downloaded.mimeType || null,
            sha256: downloaded.sha256,
            storageUrl: downloaded.storageUrl,
            sizeBytes: downloaded.sizeBytes,
          })
          .onConflictDoNothing()
          .returning();
        mediaDbId = mediaRow?.id || null;
      }
    }

    // Update lastSeenAt if linked.
    const linked = await db.query.userWhatsappChannels.findFirst({ where: eq(userWhatsappChannels.waPhoneE164, from) });
    if (linked) {
      await db.update(userWhatsappChannels).set({ lastSeenAt: new Date(), updatedAt: new Date() }).where(eq(userWhatsappChannels.id, linked.id));
      await db.update(whatsappMessages).set({ userId: linked.userId }).where(eq(whatsappMessages.waMessageId, waMessageId));
    }

    if (tenantId) {
      await upsertConversation({
        tenantId,
        conversationId,
        waPhoneE164: from,
        lastInboundAt: new Date(),
      });
    }

    if (!canRunLegacyWhatsAppAutomation({
      tenantKey,
      enabled: process.env.WHATSAPP_LEGACY_AUTOMATION_ENABLED,
    })) {
      continue;
    }

    await processIncomingWhatsAppMessage({
      waMessageId,
      waPhoneE164: from,
      messageType: (m?.type || "text") as any,
      textBody: m?.text?.body || null,
      timestamp: m?.timestamp ? new Date(parseInt(m.timestamp, 10) * 1000) : new Date(),
      payloadJson: payload,
      mediaDbId,
      tenantId: tenantId ?? null,
    });
  }

  res.sendStatus(200);
}
