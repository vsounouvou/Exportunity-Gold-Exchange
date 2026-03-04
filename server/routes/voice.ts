import { Router } from "express";
import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@db";
import {
  auditLogs,
  communicationsAgentControls,
  communicationsEvents,
  communicationsMessages,
  communicationsThreads,
  communicationsWorkOrders,
} from "@db/schema";
import { ensureTenantStaff, isChairmanAssistantUser } from "./utils/auth";
import { normalizeAgentKey } from "../lib/mail/agentSlugs";
import { getTwilioConfig, normalizeE164 } from "../lib/communications/twilio";
import { createTwilioCall } from "../lib/communications/twilioVoice";
import multer from "multer";
import path from "path";
import { mkdir, unlink, writeFile } from "fs/promises";
import { isVoiceTranscriptionConfigured, transcribeAudioFile } from "../lib/voice/transcriber";

const router = Router();
router.use(ensureTenantStaff);

const transcribeUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024,
    files: 1,
  },
});

function parseIntSafe(value: unknown) {
  const n = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function parseBool(value: unknown, fallback: boolean) {
  if (typeof value === "boolean") return value;
  const v = String(value ?? "").trim().toLowerCase();
  if (!v) return fallback;
  if (["1", "true", "yes", "y", "on"].includes(v)) return true;
  if (["0", "false", "no", "n", "off"].includes(v)) return false;
  return fallback;
}

function isAdminUser(user: any) {
  if (!user) return false;
  const currentMode = (user as any).currentMode;
  const roles = Array.isArray((user as any).roles) ? (user as any).roles : [];
  const perms = Array.isArray((user as any).permissions) ? (user as any).permissions : [];
  return currentMode === "admin" || roles.includes("admin") || perms.includes("*") || perms.includes("admin:*") || isChairmanAssistantUser(user);
}

function inferAudioExt(mimeType: string, originalName: string) {
  const mime = String(mimeType || "").toLowerCase();
  if (mime.includes("webm")) return ".webm";
  if (mime.includes("wav")) return ".wav";
  if (mime.includes("mpeg") || mime.includes("mp3")) return ".mp3";
  if (mime.includes("mp4") || mime.includes("m4a")) return ".m4a";
  if (mime.includes("ogg")) return ".ogg";
  const ext = path.extname(originalName || "");
  return ext && ext.length <= 10 ? ext : ".webm";
}

router.post("/transcribe", transcribeUpload.single("file"), async (req: any, res) => {
  try {
    if (!isVoiceTranscriptionConfigured()) {
      return res.status(503).json({
        ok: false,
        message: "Transcription not configured (set WHISPER_SERVICE_URL; OpenAI only if OPENAI_TRANSCRIPTION_ENABLED=true).",
        code: "transcription_not_configured",
      });
    }

    const file = req.file as Express.Multer.File | undefined;
    if (!file) return res.status(400).json({ ok: false, message: "Upload one file under multipart field `file`." });

    const language = typeof req.body?.language === "string" ? String(req.body.language).trim() : "";
    const prompt = typeof req.body?.prompt === "string" ? String(req.body.prompt).trim() : "";

    const ext = inferAudioExt(file.mimetype, file.originalname);
    const tmpDir = path.join(process.cwd(), ".tmp_uploads", "voice");
    await mkdir(tmpDir, { recursive: true });
    const tmpPath = path.join(tmpDir, `voice-${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext}`);
    await writeFile(tmpPath, file.buffer);

    try {
      const result = await transcribeAudioFile({
        filePath: tmpPath,
        fileName: file.originalname || path.basename(tmpPath),
        mimeType: file.mimetype || "audio/webm",
        ...(language ? { language } : {}),
        ...(prompt ? { prompt } : {}),
      });

      res.setHeader("Cache-Control", "no-store");
      return res.json({
        ok: true,
        text: result.text,
        model: result.model,
        provider: result.provider,
        language: result.language,
      });
    } finally {
      await unlink(tmpPath).catch(() => null);
    }
  } catch (error: any) {
    console.error("[Voice] Transcription failed:", error);
    return res.status(500).json({ ok: false, message: error?.message || "Transcription failed" });
  }
});

async function getOrCreateAgentControls(opts: { tenantId: number; agentKey: string }) {
  const existing = await db.query.communicationsAgentControls.findFirst({
    where: and(eq(communicationsAgentControls.tenantId, opts.tenantId), eq(communicationsAgentControls.agentKey, opts.agentKey)),
  });
  if (existing) return existing;

  const now = new Date();
  const created = await db
    .insert(communicationsAgentControls)
    .values({
      tenantId: opts.tenantId,
      agentKey: opts.agentKey,
      smsEnabled: true,
      whatsappEnabled: true,
      voiceEnabled: true,
      smsDailyOutboundLimit: 0,
      whatsappDailyOutboundLimit: 0,
      voiceDailyOutboundLimit: 0,
      voiceDialToE164: null,
      metadata: { seeded: true },
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing()
    .returning();

  return (
    created[0] ||
    (await db.query.communicationsAgentControls.findFirst({
      where: and(eq(communicationsAgentControls.tenantId, opts.tenantId), eq(communicationsAgentControls.agentKey, opts.agentKey)),
    }))
  );
}

async function assertDailyCallLimit(opts: { tenantId: number; agentKey: string; limit: number }) {
  if (!opts.limit || opts.limit <= 0) return;

  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);

  const rows = await db
    .select({ count: sql<number>`count(*)` })
    .from(communicationsMessages)
    .where(
      and(
        eq(communicationsMessages.tenantId, opts.tenantId),
        eq(communicationsMessages.agentKey, opts.agentKey),
        eq(communicationsMessages.channel, "voice" as any),
        eq(communicationsMessages.direction, "outbound"),
        gte(communicationsMessages.createdAt, start),
        sql`${communicationsMessages.status} <> 'failed'`,
      ),
    );

  const sentToday = Number(rows[0]?.count || 0);
  if (sentToday >= opts.limit) {
    const err = new Error(`Daily voice call limit reached (${opts.limit})`);
    (err as any).status = 429;
    throw err;
  }
}

router.post("/call", async (req: any, res) => {
  try {
    const tenant = req.tenant;
    if (!tenant) return res.status(400).json({ message: "tenant required" });
    const staffUser = req.staffUser;
    const admin = isAdminUser(staffUser);

    const agentKey = normalizeAgentKey(String(req.body?.agentKey ?? req.body?.agent_id ?? req.body?.agent ?? ""));
    if (!agentKey) return res.status(400).json({ message: "agentKey required" });

    const toE164 = normalizeE164(req.body?.toE164 ?? req.body?.to_e164 ?? req.body?.to);
    if (!toE164) return res.status(400).json({ message: "toE164 (E.164) required" });

    const record = parseBool(req.body?.record ?? req.body?.recording ?? false, false);

    const controls = await getOrCreateAgentControls({ tenantId: tenant.id, agentKey });
    if (!admin && !controls?.voiceEnabled) return res.status(403).json({ message: "Voice is disabled for this agent" });

    if (!admin) {
      await assertDailyCallLimit({ tenantId: tenant.id, agentKey, limit: Number(controls?.voiceDailyOutboundLimit || 0) });
    }

    const cfg = getTwilioConfig();
    const voiceFrom = normalizeE164(cfg.voiceFrom);
    if (!voiceFrom) return res.status(503).json({ message: "Voice calling disabled (set TWILIO_VOICE_FROM)" });

    const dialToE164 =
      normalizeE164(controls?.voiceDialToE164) || normalizeE164(process.env.TWILIO_VOICE_FORWARD_TO || process.env.TWILIO_VOICE_DIAL_TO) || null;
    if (!dialToE164) {
      return res.status(409).json({
        message: "Missing agent voice destination. Set voiceDialToE164 in agent controls or TWILIO_VOICE_FORWARD_TO.",
      });
    }

    const publicBaseUrl = String(cfg.publicBaseUrl || "").trim();
    if (!publicBaseUrl) return res.status(503).json({ message: "PUBLIC_BASE_URL (or TWILIO_APP_BASE_URL) required for voice calls" });

    const now = new Date();

    const [thread] = await db
      .insert(communicationsThreads)
      .values({
        tenantId: tenant.id,
        agentKey,
        channel: "voice" as any,
        peerAddress: toE164,
        lastMessageAt: now,
        metadata: { lastTo: toE164 },
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [communicationsThreads.tenantId, communicationsThreads.agentKey, communicationsThreads.channel, communicationsThreads.peerAddress],
        set: { lastMessageAt: now, updatedAt: now, metadata: { lastTo: toE164 } as any },
      })
      .returning();

    const [queued] = await db
      .insert(communicationsMessages)
      .values({
        tenantId: tenant.id,
        agentKey,
        threadId: thread.id,
        direction: "outbound",
        status: "initiated",
        provider: "twilio",
        channel: "voice" as any,
        fromAddress: voiceFrom,
        toAddress: toE164,
        body: null,
        providerMessageId: null,
        errorCode: null,
        errorMessage: null,
        metadata: { voiceDialToE164: dialToE164, record, requestedByUserId: staffUser?.id ?? null },
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    const twimlUrl = new URL(`/api/webhooks/twilio/voice/outbound?messageId=${queued.id}`, publicBaseUrl).toString();
    const statusCallbackUrl = new URL(`/api/webhooks/twilio/voice/status?messageId=${queued.id}`, publicBaseUrl).toString();

    const callResult = await createTwilioCall({
      toE164,
      fromE164: voiceFrom,
      twimlUrl,
      statusCallbackUrl,
      statusCallbackEvents: ["initiated", "ringing", "answered", "completed"],
    });

    const status = callResult.ok ? String(callResult.status || "initiated").toLowerCase() : "failed";

    await db
      .update(communicationsMessages)
      .set({
        status,
        providerMessageId: callResult.providerCallId,
        errorCode: callResult.errorCode,
        errorMessage: callResult.errorMessage,
        metadata: {
          ...(queued.metadata && typeof queued.metadata === "object" ? (queued.metadata as any) : {}),
          ...(callResult.raw ? { twilio: callResult.raw } : {}),
        },
        updatedAt: new Date(),
      })
      .where(eq(communicationsMessages.id, queued.id));

    if (callResult.ok) {
      await db
        .update(communicationsWorkOrders)
        .set({ ackSentAt: now, updatedAt: now })
        .where(and(eq(communicationsWorkOrders.tenantId, tenant.id), eq(communicationsWorkOrders.threadId, thread.id)));
    }

    // Best-effort audit log
    try {
      await db.insert(auditLogs).values({
        tenantId: tenant.id,
        userId: staffUser?.id ?? null,
        userRole: (staffUser as any)?.currentMode || "staff",
        action: "voice.call.requested",
        entityType: "communications_message",
        entityId: queued.id,
        metadata: { agentKey, toE164, voiceFrom, dialToE164, record, ok: callResult.ok, providerCallId: callResult.providerCallId },
        createdAt: now,
      });
    } catch {
      // ignore
    }

    try {
      await db.insert(communicationsEvents).values({
        tenantId: tenant.id,
        provider: "twilio",
        eventType: "twilio.voice.outbound",
        eventAt: now,
        data: { agentKey, toE164, voiceFrom, ok: callResult.ok, providerCallId: callResult.providerCallId },
        createdAt: now,
      });
    } catch {
      // ignore
    }

    if (!callResult.ok) {
      return res.status(503).json({ ok: false, message: callResult.errorMessage || "Call failed" });
    }

    res.status(201).json({
      ok: true,
      threadId: thread.id,
      messageId: queued.id,
      providerCallId: callResult.providerCallId,
      status,
    });
  } catch (err: any) {
    const status = typeof err?.status === "number" ? err.status : err?.message?.includes("Daily voice call limit") ? 429 : 500;
    if (status === 429) res.setHeader("Retry-After", "60");
    res.status(status).json({ message: err?.message || "Failed to place call" });
  }
});

export default router;
