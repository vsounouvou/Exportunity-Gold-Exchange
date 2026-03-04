import { Router } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@db";
import { chatEvents, chatLeads, chatMessages } from "@db/schema";
import { getContactNotificationConfig, sendContactNotification } from "../lib/contact/notifier";
import { ensureTalkTables } from "../lib/contact/ensureTalkTables";

const router = Router();

type TalkIntent = "demo" | "invest" | "run_business" | "gold" | "partnership" | "support" | "other";

function ensureTenant(req: any, res: any) {
  const tenant = req.tenant;
  if (!tenant) {
    res.status(500).json({ message: "Tenant not resolved" });
    return null;
  }
  return tenant;
}

function normalizeIntent(raw: unknown): TalkIntent {
  const value = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (value === "demo") return "demo";
  if (value === "invest") return "invest";
  if (value === "run_business" || value === "run-business" || value === "business") return "run_business";
  if (value === "gold" || value === "commodities") return "gold";
  if (value === "partnership" || value === "partner") return "partnership";
  if (value === "support") return "support";
  if (value) return "other";
  return "other";
}

function normalizeEmail(value: unknown) {
  const email = String(value ?? "").trim().toLowerCase();
  if (!email) return null;
  if (email.length > 254) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

function extractEmail(text: string) {
  const m = String(text || "").match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return normalizeEmail(m?.[0] || "");
}

function extractPhone(text: string) {
  const raw = String(text || "");
  const m = raw.match(/(?:\+?\d[\d\s().-]{7,}\d)/);
  if (!m?.[0]) return null;
  const cleaned = m[0].replace(/[^\d+]/g, "");
  if (!cleaned) return null;
  // Keep as-is; E.164 normalization is handled elsewhere in the platform.
  return cleaned.length > 4 ? cleaned : null;
}

function getClientIp(req: any) {
  return String(req.headers["x-forwarded-for"] || req.ip || "")
    .split(",")[0]
    ?.trim() || null;
}

function buildFirstAssistantMessage(intent: TalkIntent) {
  const openPlatform = "/platform";
  const investLink = "/invest/opportunities";
  const goldLink = "/platform/gold";

  if (intent === "invest") {
    return `Understood. Quick question: what are you looking to invest in (SME, machinery, farm, gold/commodities), and what ticket size? You can also browse ${investLink}.`;
  }
  if (intent === "gold") {
    return `Understood. Quick question: what role are you (mine, buying office, exporter, buyer), and which country? Proof and flows: ${goldLink}.`;
  }
  if (intent === "run_business") {
    return `Understood. Quick question: what do you sell or operate, and which country/currency? Platform overview: ${openPlatform}.`;
  }
  if (intent === "demo") {
    return `Understood. Quick question: what should we demo first (platform, agents, contracts, wallet, gold)? Start here: ${openPlatform}.`;
  }
  if (intent === "partnership") {
    return `Understood. Quick question: what partnership type (distribution, payments, compliance, data, operations)? Share one paragraph and we will route it.`;
  }
  if (intent === "support") {
    return `Understood. Quick question: what is blocked right now (login, OTP, actions, emails, WhatsApp, performance)? Include any error text and the page URL.`;
  }
  return `Understood. Quick question: what are you trying to achieve, and in which country? Start here: ${openPlatform}.`;
}

function buildFollowupAssistantMessage(params: {
  intent: TalkIntent;
  hasContact: boolean;
  needsContact: boolean;
}) {
  const openPlatform = "/platform";
  const talkLink = "/talk";
  const investLink = "/invest/opportunities";

  if (params.needsContact) {
    return "What is the best WhatsApp number or email to reach you? (We will reply with a concrete next step.)";
  }

  if (params.intent === "invest") {
    return `Thanks. Next step: browse ${investLink} and tell us which opportunity type you prefer. If you want a call, reply with your timezone and preferred time window.`;
  }

  if (params.intent === "gold") {
    return `Thanks. Next step: share your volume (monthly), origin route, and compliance requirements. You can also review the workflow here: ${openPlatform}.`;
  }

  if (params.intent === "support") {
    return `Thanks. Next step: paste the exact error message (or a screenshot), plus the time it happened. We will reproduce and respond with a fix path.`;
  }

  if (!params.hasContact) {
    return `Next step: share your WhatsApp or email so we can send a demo link and a short execution plan. You can continue here: ${talkLink}.`;
  }

  return `Thanks. Next step: open ${openPlatform} and tell us which module you want to start with. We will route you to the right operator flow.`;
}

async function maybeNotifyLead(tenant: any, leadId: string) {
  const cfg = getContactNotificationConfig();
  if (!cfg.enabled || !cfg.from) {
    await db
      .update(chatLeads)
      .set({ notifyStatus: "skipped", notifyError: "contact_notify_not_configured" })
      .where(and(eq(chatLeads.tenantId, tenant.id), eq(chatLeads.id, leadId)));
    return { status: "skipped" as const };
  }

  const lead = await db.query.chatLeads.findFirst({
    where: and(eq(chatLeads.tenantId, tenant.id), eq(chatLeads.id, leadId)),
  });
  if (!lead) return { status: "failed" as const, error: "lead_not_found" };

  const messages = await db
    .select()
    .from(chatMessages)
    .where(and(eq(chatMessages.tenantId, tenant.id), eq(chatMessages.leadId, leadId)))
    .orderBy(desc(chatMessages.createdAt))
    .limit(20);
  const ordered = [...messages].reverse();

  const subject = `${cfg.subjectPrefix} Website lead (${tenant.key}) intent=${lead.intent}`;
  const lines = [
    `New website chat lead (tenant=${tenant.key})`,
    "",
    `Intent: ${lead.intent}`,
    lead.name ? `Name: ${lead.name}` : null,
    lead.email ? `Email: ${lead.email}` : null,
    lead.phone ? `Phone: ${lead.phone}` : null,
    lead.country ? `Country: ${lead.country}` : null,
    lead.sourceUrl ? `Source URL: ${lead.sourceUrl}` : null,
    "",
    "Transcript:",
    ...ordered.map((m) => `[${String(m.role).toUpperCase()}] ${m.content}`),
    "",
    `Lead ID: ${lead.id}`,
  ].filter(Boolean) as string[];

  try {
    await sendContactNotification({ to: cfg.to, from: cfg.from, subject, text: lines.join("\n") });
    await db
      .update(chatLeads)
      .set({ notifyStatus: "sent", notifiedAt: new Date(), notifyError: null, updatedAt: new Date() })
      .where(and(eq(chatLeads.tenantId, tenant.id), eq(chatLeads.id, leadId)));
    await db.insert(chatEvents).values({
      tenantId: tenant.id,
      leadId,
      eventType: "handoff",
      payload: { channel: "email", to: cfg.to },
      createdAt: new Date(),
    });
    return { status: "sent" as const };
  } catch (err: any) {
    await db
      .update(chatLeads)
      .set({ notifyStatus: "failed", notifyError: String(err?.message || "notify_failed"), updatedAt: new Date() })
      .where(and(eq(chatLeads.tenantId, tenant.id), eq(chatLeads.id, leadId)));
    return { status: "failed" as const, error: String(err?.message || "notify_failed") };
  }
}

router.post("/api/talk/start", async (req: any, res) => {
  try {
    await ensureTalkTables();
    const tenant = ensureTenant(req, res);
    if (!tenant) return;

    const intent = normalizeIntent(req.body?.intent);
    const now = new Date();
    const sourceUrl = String(req.body?.sourceUrl || req.headers?.referer || "").trim() || null;
    const userAgent = String(req.headers["user-agent"] || "").trim() || null;
    const ip = getClientIp(req);

    const [lead] = await db
      .insert(chatLeads)
      .values({
        tenantId: tenant.id,
        intent,
        status: "new",
        sourceUrl,
        userAgent,
        ip,
        notifyStatus: "pending",
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    const assistantText = buildFirstAssistantMessage(intent);
    const [assistant] = await db
      .insert(chatMessages)
      .values({
        tenantId: tenant.id,
        leadId: lead.id,
        role: "assistant",
        content: assistantText,
        createdAt: now,
      })
      .returning();

    res.status(201).json({
      ok: true,
      leadId: lead.id,
      messages: [{ role: assistant.role, content: assistant.content, createdAt: assistant.createdAt }],
    });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to start talk session" });
  }
});

router.post("/api/talk/message", async (req: any, res) => {
  try {
    await ensureTalkTables();
    const tenant = ensureTenant(req, res);
    if (!tenant) return;

    const leadId = String(req.body?.leadId || "").trim();
    const message = String(req.body?.message || "").trim();
    const name = String(req.body?.name || "").trim() || null;
    const email = normalizeEmail(req.body?.email) || null;
    const phone = String(req.body?.phone || "").trim() || null;
    const intentOverride = normalizeIntent(req.body?.intent);

    if (!leadId) return res.status(400).json({ message: "leadId is required" });
    if (!message) return res.status(400).json({ message: "message is required" });

    const lead = await db.query.chatLeads.findFirst({
      where: and(eq(chatLeads.tenantId, tenant.id), eq(chatLeads.id, leadId)),
    });
    if (!lead) return res.status(404).json({ message: "Lead not found" });

    const inferredEmail = extractEmail(message);
    const inferredPhone = extractPhone(message);
    const nextEmail = email || inferredEmail || lead.email || null;
    const nextPhone = phone || inferredPhone || lead.phone || null;
    const nextName = name || lead.name || null;

    const now = new Date();
    await db.insert(chatMessages).values({
      tenantId: tenant.id,
      leadId,
      role: "user",
      content: message,
      createdAt: now,
    });

    const nextIntent = (lead.intent ? normalizeIntent(lead.intent) : "other") as TalkIntent;
    const intent = (intentOverride !== "other" ? intentOverride : nextIntent) as TalkIntent;

    const hadContact = Boolean(lead.email || lead.phone);
    const hasContact = Boolean(nextEmail || nextPhone);
    const needsContact = !hasContact && (lead.notifyStatus === "pending" || lead.notifyStatus === "failed");

    const assistantText = buildFollowupAssistantMessage({ intent, hasContact, needsContact });

    const [assistant] = await db
      .insert(chatMessages)
      .values({
        tenantId: tenant.id,
        leadId,
        role: "assistant",
        content: assistantText,
        createdAt: new Date(),
      })
      .returning();

    const shouldNotify = hasContact && lead.notifyStatus === "pending";
    await db
      .update(chatLeads)
      .set({
        intent,
        name: nextName,
        email: nextEmail,
        phone: nextPhone,
        status: hasContact ? "triaged" : lead.status,
        updatedAt: new Date(),
      })
      .where(and(eq(chatLeads.tenantId, tenant.id), eq(chatLeads.id, leadId)));

    let notify: any = null;
    if (shouldNotify) notify = await maybeNotifyLead(tenant, leadId);

    res.json({
      ok: true,
      leadId,
      messages: [{ role: assistant.role, content: assistant.content, createdAt: assistant.createdAt }],
      notify,
      lead: { intent, hasContact, hadContact },
    });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to send message" });
  }
});

router.get("/api/talk/health", (req: any, res) => {
  const tenant = req.tenant ? { id: req.tenant.id, key: req.tenant.key } : null;
  res.json({ ok: true, tenant });
});

router.get("/api/talk/leads/:id", async (req: any, res) => {
  try {
    await ensureTalkTables();
    const tenant = ensureTenant(req, res);
    if (!tenant) return;

    const leadId = String(req.params?.id || "").trim();
    if (!leadId) return res.status(400).json({ message: "lead id required" });

    const lead = await db.query.chatLeads.findFirst({
      where: and(eq(chatLeads.tenantId, tenant.id), eq(chatLeads.id, leadId)),
    });
    if (!lead) return res.status(404).json({ message: "Lead not found" });

    const limit = Math.min(Math.max(parseInt(String(req.query?.limit || "80"), 10) || 80, 1), 200);
    const rows = await db
      .select()
      .from(chatMessages)
      .where(and(eq(chatMessages.tenantId, tenant.id), eq(chatMessages.leadId, leadId)))
      .orderBy(desc(chatMessages.createdAt))
      .limit(limit);

    const messages = [...rows]
      .reverse()
      .map((m) => ({ role: m.role, content: m.content, createdAt: m.createdAt }));

    res.json({
      ok: true,
      lead: {
        id: lead.id,
        intent: lead.intent,
        name: lead.name,
        email: lead.email,
        phone: lead.phone,
        status: lead.status,
        createdAt: lead.createdAt,
        updatedAt: lead.updatedAt,
      },
      messages,
    });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to load lead" });
  }
});

export default router;
