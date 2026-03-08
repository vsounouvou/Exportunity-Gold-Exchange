import { Router } from "express";
import { and, asc, desc, eq, gte, ilike, lte } from "drizzle-orm";
import { db } from "@db";
import {
  agentSenderProfiles,
  agentsProduction,
  communicationsAgentControls,
  communicationsEvents,
  communicationsMessages,
  communicationsRoutingMap,
  communicationsWorkOrders,
  tenantCommunicationProfiles,
} from "@db/schema";
import { ensureTenantAdmin } from "./utils/auth";
import { normalizeAgentKey } from "../lib/mail/agentSlugs";
import { getTwilioConfig, normalizeE164, normalizeTwilioAddress, sendTenantMessage } from "../lib/communications/twilio";
import { resolveAgentIdentityForTenant, seedTenantCommunicationProfiles } from "../lib/communications/sender-resolution";

const router = Router();
router.use(ensureTenantAdmin);

function parseIntSafe(value: unknown) {
  const n = typeof value === "number" ? value : parseInt(String(value ?? ""), 10);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function parseLimit(value: unknown, fallback: number, max: number) {
  const n = parseIntSafe(value);
  if (!n) return fallback;
  return Math.min(Math.max(n, 1), max);
}

function parseNonNegativeInt(value: unknown, fallback: number) {
  const n = parseIntSafe(value);
  if (n == null) return fallback;
  return Math.max(0, n);
}

function parseBool(value: unknown, fallback: boolean) {
  if (typeof value === "boolean") return value;
  const v = String(value ?? "").trim().toLowerCase();
  if (!v) return fallback;
  if (["1", "true", "yes", "y", "on"].includes(v)) return true;
  if (["0", "false", "no", "n", "off"].includes(v)) return false;
  return fallback;
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

function parseJsonObject(value: unknown) {
  if (!value) return null;
  if (typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function parseAllowedChannels(value: unknown) {
  const raw = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value
          .split(",")
          .map((entry) => entry.trim())
          .filter(Boolean)
      : [];
  const allowed = raw
    .map((entry) => String(entry || "").trim().toLowerCase())
    .filter((entry) => ["sms", "whatsapp", "verify_sms", "verify_whatsapp"].includes(entry));
  return allowed.length ? allowed : ["sms", "whatsapp"];
}

function parseDefaultChannel(value: unknown) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "sms" || normalized === "whatsapp" || normalized === "verify_sms" || normalized === "verify_whatsapp") {
    return normalized;
  }
  return "sms";
}

async function getTenantProfileOrSeed(tenantId: number) {
  let profile = await db.query.tenantCommunicationProfiles.findFirst({
    where: eq(tenantCommunicationProfiles.tenantId, tenantId),
  });
  if (profile) return profile;
  await seedTenantCommunicationProfiles();
  profile = await db.query.tenantCommunicationProfiles.findFirst({
    where: eq(tenantCommunicationProfiles.tenantId, tenantId),
  });
  return profile || null;
}

router.get("/twilio/status", async (_req: any, res) => {
  const cfg = getTwilioConfig();
  res.json({
    ok: true,
    twilio: {
      accountSidPresent: !!cfg.accountSid,
      accountSidLooksValid: cfg.accountSidLooksValid,
      authTokenPresent: cfg.authTokenPresent,
      authTokenLength: cfg.authTokenLength,
      authTokenLooksValid: cfg.authTokenLooksValid,
      whatsappFromPresent: !!cfg.whatsappFrom,
      smsFromPresent: !!cfg.smsFrom,
      messagingServiceSidPresent: !!cfg.messagingServiceSid,
      voiceFromPresent: !!cfg.voiceFrom,
      verifyServiceSidPresent: cfg.verifyServiceSidPresent,
      publicBaseUrlPresent: !!cfg.publicBaseUrl,
      statusCallbackBaseUrlPresent: !!(cfg as any).statusCallbackBaseUrl,
      webhookPathPresent: !!(cfg as any).webhookPath,
      sandboxMode: Boolean((cfg as any).sandboxMode),
      whatsappFrom: cfg.whatsappFrom,
      smsFrom: cfg.smsFrom,
      messagingServiceSid: cfg.messagingServiceSid,
      voiceFrom: cfg.voiceFrom,
      webhookPath: (cfg as any).webhookPath ?? null,
    },
  });
});

router.get("/twilio/profile", async (req: any, res) => {
  try {
    const tenant = req.tenant;
    if (!tenant) return res.status(400).json({ message: "tenant required" });

    const profile = await getTenantProfileOrSeed(tenant.id);
    res.json({
      ok: true,
      item: profile,
      fallback: getTwilioConfig(),
    });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to load tenant messaging profile" });
  }
});

router.put("/twilio/profile", async (req: any, res) => {
  try {
    const tenant = req.tenant;
    if (!tenant) return res.status(400).json({ message: "tenant required" });

    const now = new Date();
    const values = {
      tenantId: tenant.id,
      isActive: parseBool(req.body?.isActive ?? req.body?.is_active, true),
      defaultChannel: parseDefaultChannel(req.body?.defaultChannel ?? req.body?.default_channel) as any,
      smsFrom: normalizeE164(req.body?.smsFrom ?? req.body?.sms_from) || null,
      whatsappFrom:
        (() => {
          const raw = String((req.body?.whatsappFrom ?? req.body?.whatsapp_from) || "").trim();
          if (!raw) return null;
          const parsed = normalizeTwilioAddress(raw.startsWith("whatsapp:") ? raw : `whatsapp:${raw}`);
          return parsed?.channel === "whatsapp" ? `whatsapp:${parsed.addressE164}` : null;
        })(),
      verifyServiceSid: String((req.body?.verifyServiceSid ?? req.body?.verify_service_sid) || "").trim() || null,
      senderLabel: String((req.body?.senderLabel ?? req.body?.sender_label) || "").trim() || null,
      defaultSignature: String((req.body?.defaultSignature ?? req.body?.default_signature) || "").trim() || null,
      messagingServiceSid: String((req.body?.messagingServiceSid ?? req.body?.messaging_service_sid) || "").trim() || null,
      whatsappSenderStatus: String((req.body?.whatsappSenderStatus ?? req.body?.whatsapp_sender_status) || "").trim() || null,
      useSandboxForDev: parseBool(req.body?.useSandboxForDev ?? req.body?.use_sandbox_for_dev, false),
      metadata: parseJsonObject(req.body?.metadata) ?? {},
      updatedAt: now,
    };

    const [row] = await db
      .insert(tenantCommunicationProfiles)
      .values({
        ...values,
        createdAt: now,
      })
      .onConflictDoUpdate({
        target: [tenantCommunicationProfiles.tenantId],
        set: values,
      })
      .returning();

    res.status(201).json({ ok: true, item: row });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to save tenant messaging profile" });
  }
});

router.get("/twilio/agent-senders", async (req: any, res) => {
  try {
    const tenant = req.tenant;
    if (!tenant) return res.status(400).json({ message: "tenant required" });

    const items = await db
      .select({
        id: agentSenderProfiles.id,
        tenantId: agentSenderProfiles.tenantId,
        agentId: agentSenderProfiles.agentId,
        isActive: agentSenderProfiles.isActive,
        displayName: agentSenderProfiles.displayName,
        signature: agentSenderProfiles.signature,
        allowedChannels: agentSenderProfiles.allowedChannels,
        smsFrom: agentSenderProfiles.smsFrom,
        whatsappFrom: agentSenderProfiles.whatsappFrom,
        fallbackToTenantDefault: agentSenderProfiles.fallbackToTenantDefault,
        metadata: agentSenderProfiles.metadata,
        createdAt: agentSenderProfiles.createdAt,
        updatedAt: agentSenderProfiles.updatedAt,
        agentKey: agentsProduction.agentKey,
        productionDisplayName: agentsProduction.displayName,
      })
      .from(agentSenderProfiles)
      .leftJoin(
        agentsProduction,
        and(eq(agentsProduction.agentId, agentSenderProfiles.agentId), eq(agentsProduction.tenantId, agentSenderProfiles.tenantId)),
      )
      .where(eq(agentSenderProfiles.tenantId, tenant.id))
      .orderBy(asc(agentsProduction.agentKey), asc(agentSenderProfiles.agentId));

    res.json({ ok: true, items });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to load agent sender profiles" });
  }
});

router.put("/twilio/agent-senders", async (req: any, res) => {
  try {
    const tenant = req.tenant;
    if (!tenant) return res.status(400).json({ message: "tenant required" });

    const agentIdentity = await resolveAgentIdentityForTenant({
      tenantId: tenant.id,
      agentId: req.body?.agentId ?? req.body?.agent_id ?? null,
      agentKey: req.body?.agentKey ?? req.body?.agent_key ?? null,
    });
    if (!agentIdentity.agentId) {
      return res.status(404).json({ message: "Agent not found in the tenant production allowlist" });
    }

    const now = new Date();
    const values = {
      tenantId: tenant.id,
      agentId: agentIdentity.agentId,
      isActive: parseBool(req.body?.isActive ?? req.body?.is_active, true),
      displayName: String((req.body?.displayName ?? req.body?.display_name) || "").trim() || null,
      signature: String(req.body?.signature || "").trim() || null,
      allowedChannels: parseAllowedChannels(req.body?.allowedChannels ?? req.body?.allowed_channels) as any,
      smsFrom: normalizeE164(req.body?.smsFrom ?? req.body?.sms_from) || null,
      whatsappFrom:
        (() => {
          const raw = String((req.body?.whatsappFrom ?? req.body?.whatsapp_from) || "").trim();
          if (!raw) return null;
          const parsed = normalizeTwilioAddress(raw.startsWith("whatsapp:") ? raw : `whatsapp:${raw}`);
          return parsed?.channel === "whatsapp" ? `whatsapp:${parsed.addressE164}` : null;
        })(),
      fallbackToTenantDefault: parseBool(req.body?.fallbackToTenantDefault ?? req.body?.fallback_to_tenant_default, true),
      metadata: parseJsonObject(req.body?.metadata) ?? {},
      updatedAt: now,
    };

    const [row] = await db
      .insert(agentSenderProfiles)
      .values({
        ...values,
        createdAt: now,
      })
      .onConflictDoUpdate({
        target: [agentSenderProfiles.tenantId, agentSenderProfiles.agentId],
        set: values,
      })
      .returning();

    res.status(201).json({ ok: true, item: { ...row, agentKey: agentIdentity.agentKey } });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to save agent sender profile" });
  }
});

router.get("/twilio/events", async (req: any, res) => {
  try {
    const tenant = req.tenant;
    if (!tenant) return res.status(400).json({ message: "tenant required" });

    const limit = parseLimit(req.query?.limit, 20, 200);

    const items = await db.query.communicationsEvents.findMany({
      where: and(eq(communicationsEvents.tenantId, tenant.id), eq(communicationsEvents.provider, "twilio")),
      orderBy: [desc(communicationsEvents.eventAt)],
      limit,
    });

    res.json({ ok: true, items });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to list events" });
  }
});

router.get("/twilio/messages", async (req: any, res) => {
  try {
    const tenant = req.tenant;
    if (!tenant) return res.status(400).json({ message: "tenant required" });

    const limit = parseLimit(req.query?.limit, 50, 200);
    const offset = parseNonNegativeInt(req.query?.offset, 0);

    const channel = String(req.query?.channel || "").trim().toLowerCase();
    if (channel && channel !== "sms" && channel !== "whatsapp" && channel !== "voice") {
      return res.status(400).json({ message: "channel must be sms|whatsapp|voice" });
    }

    const direction = String(req.query?.direction || "").trim().toLowerCase();
    if (direction && direction !== "inbound" && direction !== "outbound") {
      return res.status(400).json({ message: "direction must be inbound|outbound" });
    }

    const status = String(req.query?.status || "").trim().toLowerCase();
    const to = String(req.query?.to || req.query?.phone || "").trim();

    const dateFromRaw = String(req.query?.dateFrom || req.query?.from || "").trim();
    const dateToRaw = String(req.query?.dateTo || req.query?.toDate || "").trim();

    const conditions: any[] = [eq(communicationsMessages.tenantId, tenant.id), eq(communicationsMessages.provider, "twilio")];
    if (channel) conditions.push(eq(communicationsMessages.channel, channel as any));
    if (direction) conditions.push(eq(communicationsMessages.direction, direction as any));
    if (status) conditions.push(eq(communicationsMessages.status, status));
    if (to) {
      const digits = to.replace(/[^\d+]/g, "");
      const needle = digits ? digits.replace(/\s+/g, "") : to;
      conditions.push(ilike(communicationsMessages.toAddress, `%${needle}%`));
    }

    if (dateFromRaw) {
      const dateFrom = new Date(dateFromRaw);
      if (!Number.isNaN(dateFrom.getTime())) {
        conditions.push(gte(communicationsMessages.createdAt, dateFrom));
      }
    }
    if (dateToRaw) {
      const dateTo = new Date(dateToRaw);
      if (!Number.isNaN(dateTo.getTime())) {
        conditions.push(lte(communicationsMessages.createdAt, dateTo));
      }
    }

    const items = await db
      .select()
      .from(communicationsMessages)
      .where(conditions.length === 1 ? conditions[0] : and(...conditions))
      .orderBy(desc(communicationsMessages.createdAt))
      .limit(limit)
      .offset(offset);

    res.json({ ok: true, items, limit, offset, hasMore: items.length === limit });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to list messages" });
  }
});

router.get("/twilio/routing", async (req: any, res) => {
  try {
    const tenant = req.tenant;
    if (!tenant) return res.status(400).json({ message: "tenant required" });

    const items = await db.query.communicationsRoutingMap.findMany({
      where: and(eq(communicationsRoutingMap.tenantId, tenant.id), eq(communicationsRoutingMap.provider, "twilio")),
      orderBy: [asc(communicationsRoutingMap.channel), asc(communicationsRoutingMap.toAddress)],
    });

    res.json({ ok: true, items });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to list routing rules" });
  }
});

router.post("/twilio/routing", async (req: any, res) => {
  try {
    const tenant = req.tenant;
    if (!tenant) return res.status(400).json({ message: "tenant required" });

    const channel = String(req.body?.channel || "").trim().toLowerCase();
    if (channel !== "sms" && channel !== "whatsapp" && channel !== "voice") return res.status(400).json({ message: "channel must be sms|whatsapp|voice" });

    const toInput = String(req.body?.toAddress || req.body?.to || "").trim();
    if (!toInput) return res.status(400).json({ message: "toAddress required" });

    const parsed = normalizeTwilioAddress(toInput);
    const toE164 = parsed?.addressE164 ?? normalizeE164(toInput);
    if (!toE164) return res.status(400).json({ message: "Invalid toAddress (E.164 required)" });

    const agentKey = normalizeAgentKey(String(req.body?.agentKey || req.body?.agent_id || req.body?.agent || "")) || null;
    if (!agentKey) return res.status(400).json({ message: "agentKey required" });

    const dialToE164 =
      channel === "voice" ? normalizeE164(req.body?.dialToE164 ?? req.body?.dial_to_e164 ?? req.body?.dialTo) : null;

    const now = new Date();

    const [row] = await db
      .insert(communicationsRoutingMap)
      .values({
        tenantId: tenant.id,
        provider: "twilio",
        channel,
        toAddress: toE164,
        agentKey,
        isEnabled: true,
        metadata: dialToE164 ? ({ dialToE164 } as any) : {},
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          communicationsRoutingMap.tenantId,
          communicationsRoutingMap.provider,
          communicationsRoutingMap.channel,
          communicationsRoutingMap.toAddress,
        ],
        set: { agentKey, isEnabled: true, updatedAt: now },
      })
      .returning();

    res.status(201).json({ ok: true, item: row });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to upsert routing rule" });
  }
});

router.get("/twilio/agent-controls", async (req: any, res) => {
  try {
    const tenant = req.tenant;
    if (!tenant) return res.status(400).json({ message: "tenant required" });

    const items = await db.query.communicationsAgentControls.findMany({
      where: eq(communicationsAgentControls.tenantId, tenant.id),
      orderBy: [asc(communicationsAgentControls.agentKey)],
    });

    res.json({ ok: true, items });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to list agent controls" });
  }
});

router.post("/twilio/agent-controls", async (req: any, res) => {
  try {
    const tenant = req.tenant;
    if (!tenant) return res.status(400).json({ message: "tenant required" });

    const agentKey = normalizeAgentKey(String(req.body?.agentKey || req.body?.agent_id || req.body?.agent || "")) || null;
    if (!agentKey) return res.status(400).json({ message: "agentKey required" });

    const smsEnabled = parseBool(req.body?.smsEnabled ?? req.body?.sms_enabled, true);
    const whatsappEnabled = parseBool(req.body?.whatsappEnabled ?? req.body?.whatsapp_enabled, true);
    const voiceEnabled = parseBool(req.body?.voiceEnabled ?? req.body?.voice_enabled, true);
    const smsDailyOutboundLimit = parseNonNegativeInt(req.body?.smsDailyOutboundLimit ?? req.body?.sms_daily_outbound_limit, 0);
    const whatsappDailyOutboundLimit = parseNonNegativeInt(
      req.body?.whatsappDailyOutboundLimit ?? req.body?.whatsapp_daily_outbound_limit,
      0,
    );
    const voiceDailyOutboundLimit = parseNonNegativeInt(req.body?.voiceDailyOutboundLimit ?? req.body?.voice_daily_outbound_limit, 0);
    const voiceDialToE164 = normalizeE164(req.body?.voiceDialToE164 ?? req.body?.voice_dial_to_e164) || null;

    const now = new Date();

    const [row] = await db
      .insert(communicationsAgentControls)
      .values({
        tenantId: tenant.id,
        agentKey,
        smsEnabled,
        whatsappEnabled,
        voiceEnabled,
        smsDailyOutboundLimit,
        whatsappDailyOutboundLimit,
        voiceDailyOutboundLimit,
        voiceDialToE164,
        metadata: {},
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [communicationsAgentControls.tenantId, communicationsAgentControls.agentKey],
        set: {
          smsEnabled,
          whatsappEnabled,
          voiceEnabled,
          smsDailyOutboundLimit,
          whatsappDailyOutboundLimit,
          voiceDailyOutboundLimit,
          voiceDialToE164,
          updatedAt: now,
        },
      })
      .returning();

    res.status(201).json({ ok: true, item: row });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to upsert agent controls" });
  }
});

router.post("/twilio/send-test", async (req: any, res) => {
  try {
    const tenant = req.tenant;
    if (!tenant) return res.status(400).json({ message: "tenant required" });

    const channel = String(req.body?.channel || "whatsapp").trim().toLowerCase();
    if (channel !== "sms" && channel !== "whatsapp") return res.status(400).json({ message: "channel must be sms|whatsapp" });

    const toE164 = normalizeE164(req.body?.to || req.body?.toE164);
    if (!toE164) return res.status(400).json({ message: "to (E.164) required" });

    const mode = String(req.body?.mode || "text").trim().toLowerCase();
    if (mode !== "text" && mode !== "template") return res.status(400).json({ message: "mode must be text|template" });
    if (mode === "template" && channel !== "whatsapp") {
      return res.status(400).json({ message: "template mode is only supported for WhatsApp" });
    }

    const agentKey = normalizeAgentKey(String(req.body?.agentKey || "support")) || "support";
    const agentIdentity = await resolveAgentIdentityForTenant({
      tenantId: tenant.id,
      agentId: req.body?.agentId ?? req.body?.agent_id ?? null,
      agentKey,
    });
    const messageRaw = String(req.body?.message || req.body?.body || "").trim();
    const message = mode === "template" ? messageRaw : messageRaw || `Test ${channel.toUpperCase()} from ${agentKey} (tenant=${tenant.key})`;
    const contentSid = mode === "template" ? String(req.body?.contentSid || req.body?.content_sid || "").trim() || null : null;
    const contentVariables = mode === "template" ? parseContentVariables(req.body?.contentVariables ?? req.body?.content_variables) : null;
    const clientMessageId = String(req.body?.clientMessageId || req.body?.client_message_id || "").trim() || null;
    if (mode === "template" && !contentSid) return res.status(400).json({ message: "contentSid required for template mode" });

    const out = await sendTenantMessage({
      tenantId: tenant.id,
      agentId: agentIdentity.agentId,
      agentKey: agentIdentity.agentKey || agentKey,
      to: toE164,
      channel,
      body: message,
      templateName: contentSid,
      templatePayload: contentSid
        ? {
            contentSid,
            ...(contentVariables ? { contentVariables } : {}),
          }
        : null,
      metadata: { test: true, mode, clientMessageId },
    });

    if (!out.ok) {
      return res.status(503).json({
        ok: false,
        code: (out as any).errorCode || null,
        message: out.errorMessage || "Send failed",
      });
    }

    res.status(201).json({ ok: true, result: out });
  } catch (err: any) {
    res.status(Number(err?.status) || 500).json({ message: err?.message || "Failed to send test message", code: err?.code || null });
  }
});

router.get("/twilio/work-orders", async (req: any, res) => {
  try {
    const tenant = req.tenant;
    if (!tenant) return res.status(400).json({ message: "tenant required" });

    const limit = parseLimit(req.query?.limit, 200, 2000);

    const items = await db.query.communicationsWorkOrders.findMany({
      where: and(eq(communicationsWorkOrders.tenantId, tenant.id), eq(communicationsWorkOrders.status, "open")),
      orderBy: [asc(communicationsWorkOrders.dueAt)],
      limit,
    });

    res.json({ ok: true, items });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to list work orders" });
  }
});

export default router;
