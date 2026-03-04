import { Router } from "express";
import multer from "multer";
import path from "path";
import { mkdir, unlink, writeFile } from "fs/promises";
import { db } from "@db";
import { auditLogs, tenants } from "@db/schema";
import { eq, sql } from "drizzle-orm";

import { ensureTenantAdmin, ensureTenantStaff } from "./utils/auth";
import { resolveQuickSession, resolveQuickSessionAnyTenant } from "../lib/chairman-quick-tokens";
import {
  getTranscriptionProviderHealth,
  isVoiceTranscriptionConfigured,
  transcribeAudioFileDetailed,
} from "../lib/voice/transcriber";

const router = Router();

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_DURATION_MS = 2 * 60 * 1000;
const PRIMARY_TIMEOUT_MS = 25_000;
const FALLBACK_TIMEOUT_MS = 20_000;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_BYTES,
    files: 1,
  },
});

const ALLOWED_CLIENT_EVENTS = new Set([
  "VOICE_RECORD_STARTED",
  "VOICE_RECORD_STOPPED",
  "VOICE_UPLOAD_FAILED",
  "VOICE_TRANSCRIBE_FAILED",
  "VOICE_TRANSCRIBE_SUCCESS",
]);

function sqlRows<T = Record<string, any>>(result: any): T[] {
  if (!result) return [];
  if (Array.isArray(result?.rows)) return result.rows as T[];
  if (Array.isArray(result)) return result as T[];
  return [];
}

function parseBooleanLike(value: unknown, fallback: boolean) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return fallback;
  if (["1", "true", "yes", "y", "on"].includes(raw)) return true;
  if (["0", "false", "no", "n", "off"].includes(raw)) return false;
  return fallback;
}

function isFeatureEnabled(req: any, key: string, defaultValue: boolean) {
  const tenantFlag = req?.tenant?.featureFlags?.[key];
  if (typeof tenantFlag === "boolean") return tenantFlag;
  return parseBooleanLike(process.env[key], defaultValue);
}

async function ensureTranscriptionActor(req: any, res: any, next: any) {
  const quickSession = String(req.headers?.["x-chairman-quick-session"] || "").trim();
  let tenantId = Number(req?.tenant?.id || 0);
  if (!(tenantId > 0)) {
    const tenantKey = String(req?.headers?.["x-tenant-key"] || "").trim().toLowerCase();
    if (tenantKey) {
      const tenant = await db.query.tenants.findFirst({
        where: eq(tenants.key, tenantKey),
        columns: { id: true, key: true },
      });
      if (tenant?.id) {
        tenantId = Number(tenant.id);
        req.tenant = { ...(req.tenant || {}), id: tenant.id, key: tenant.key };
      }
    }
  }

  if (quickSession) {
    if (tenantId > 0) {
      const resolved = await resolveQuickSession({ tenantId, sessionToken: quickSession });
      if (!resolved) return res.status(401).json({ message: "Quick session invalid" });
      req.staffUser = resolved.user;
      req.transcriptionAuth = { via: "quick" };
      return next();
    }

    const resolvedAnyTenant = await resolveQuickSessionAnyTenant({ sessionToken: quickSession });
    if (!resolvedAnyTenant) return res.status(401).json({ message: "Quick session invalid" });
    req.staffUser = resolvedAnyTenant.user;
    req.tenant = { ...(req.tenant || {}), id: resolvedAnyTenant.tenantId };
    req.transcriptionAuth = { via: "quick" };
    return next();
  }

  return ensureTenantStaff(req, res, next);
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

function classifyErrorCode(error: unknown) {
  const message = String((error as any)?.message || error || "").toLowerCase();
  if (!message) return "TRANSCRIPTION_FAILED";
  if (message.includes("not_configured") || message.includes("not configured")) return "TRANSCRIPTION_NOT_CONFIGURED";
  if (message.includes("timeout") || message.includes("timed out")) return "TRANSCRIPTION_TIMEOUT";
  if (message.includes("audio_file_empty")) return "AUDIO_FILE_EMPTY";
  if (message.includes("file too large")) return "FILE_TOO_LARGE";
  return "TRANSCRIPTION_FAILED";
}

async function persistJob(input: {
  tenantId: number;
  userId: number | null;
  status: "SUCCESS" | "FAILED";
  provider: string | null;
  durationMs: number;
  errorCode: string | null;
}) {
  await db.execute(sql`
    insert into transcription_jobs (
      tenant_id,
      user_id,
      status,
      provider,
      duration_ms,
      error_code,
      created_at
    ) values (
      ${input.tenantId},
      ${input.userId},
      ${input.status},
      ${input.provider},
      ${Math.max(0, Math.trunc(input.durationMs || 0))},
      ${input.errorCode},
      now()
    )
  `);
}

router.post("/transcription", ensureTranscriptionActor, (req, res) => {
  upload.single("file")(req as any, res as any, async (uploadError: any) => {
    const tenant = (req as any)?.tenant ?? null;
    const staffUser = (req as any)?.staffUser ?? null;
    const startedAt = Date.now();

    if (!tenant?.id) {
      return res.status(400).json({ ok: false, code: "TENANT_REQUIRED", message: "tenant required" });
    }

    if (!isFeatureEnabled(req, "FEATURE_VOICE_INPUT", true)) {
      return res.status(404).json({ ok: false, code: "VOICE_INPUT_DISABLED", message: "Voice input is disabled." });
    }

    if (uploadError) {
      const isSizeError = uploadError instanceof multer.MulterError && uploadError.code === "LIMIT_FILE_SIZE";
      const errorCode = isSizeError ? "FILE_TOO_LARGE" : "UPLOAD_FAILED";
      await persistJob({
        tenantId: tenant.id,
        userId: Number.isInteger(staffUser?.id) ? Number(staffUser.id) : null,
        status: "FAILED",
        provider: null,
        durationMs: Date.now() - startedAt,
        errorCode,
      }).catch(() => null);
      return res.status(isSizeError ? 413 : 400).json({
        ok: false,
        code: errorCode,
        message: isSizeError ? `Audio file too large. Max ${Math.floor(MAX_FILE_BYTES / (1024 * 1024))}MB.` : "Upload failed.",
      });
    }

    try {
      const file = (req as any).file as Express.Multer.File | undefined;
      if (!file) return res.status(400).json({ ok: false, code: "FILE_REQUIRED", message: "Upload one file under field `file`." });

      const durationHintRaw = Number(req.body?.durationMs ?? req.body?.duration_ms ?? 0);
      if (Number.isFinite(durationHintRaw) && durationHintRaw > MAX_DURATION_MS) {
        await persistJob({
          tenantId: tenant.id,
          userId: Number.isInteger(staffUser?.id) ? Number(staffUser.id) : null,
          status: "FAILED",
          provider: null,
          durationMs: Date.now() - startedAt,
          errorCode: "AUDIO_TOO_LONG",
        }).catch(() => null);
        return res.status(413).json({
          ok: false,
          code: "AUDIO_TOO_LONG",
          message: "Audio duration exceeds the 2 minute limit.",
        });
      }

      const ext = inferAudioExt(file.mimetype, file.originalname);
      const tmpDir = path.join(process.cwd(), ".tmp_uploads", "voice");
      await mkdir(tmpDir, { recursive: true });
      const tmpPath = path.join(tmpDir, `voice-${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext}`);
      await writeFile(tmpPath, file.buffer);

      const useFallback = isFeatureEnabled(req, "FEATURE_TRANSCRIPTION_FALLBACK", true);
      try {
        const detailed = await transcribeAudioFileDetailed(
          {
            filePath: tmpPath,
            fileName: file.originalname || path.basename(tmpPath),
            mimeType: file.mimetype || "audio/webm",
            language: typeof req.body?.language === "string" ? req.body.language : null,
            prompt: typeof req.body?.prompt === "string" ? req.body.prompt : null,
          },
          {
            allowFallback: useFallback,
            primaryTimeoutMs: PRIMARY_TIMEOUT_MS,
            fallbackTimeoutMs: FALLBACK_TIMEOUT_MS,
          },
        );

        await persistJob({
          tenantId: tenant.id,
          userId: Number.isInteger(staffUser?.id) ? Number(staffUser.id) : null,
          status: "SUCCESS",
          provider: detailed.provider,
          durationMs: detailed.durationMs,
          errorCode: null,
        }).catch(() => null);

        console.log(
          JSON.stringify({
            scope: "transcription",
            event: "TRANSCRIBE_SUCCESS",
            tenantId: tenant.id,
            userId: Number.isInteger(staffUser?.id) ? Number(staffUser.id) : null,
            provider: detailed.provider,
            durationMs: detailed.durationMs,
            providerAttempts: detailed.attempts,
          }),
        );

        res.setHeader("Cache-Control", "no-store");
        return res.json({
          text: detailed.text,
          provider: detailed.provider,
          confidence: typeof detailed.confidence === "number" ? detailed.confidence : undefined,
          durationMs: detailed.durationMs,
        });
      } catch (error: any) {
        const code = classifyErrorCode(error);
        await persistJob({
          tenantId: tenant.id,
          userId: Number.isInteger(staffUser?.id) ? Number(staffUser.id) : null,
          status: "FAILED",
          provider: null,
          durationMs: Date.now() - startedAt,
          errorCode: code,
        }).catch(() => null);

        console.error(
          JSON.stringify({
            scope: "transcription",
            event: "TRANSCRIBE_FAILED",
            tenantId: tenant.id,
            userId: Number.isInteger(staffUser?.id) ? Number(staffUser.id) : null,
            code,
            message: String(error?.message || error || "transcription_failed"),
            providerAttempts: Array.isArray((error as any)?.attempts) ? (error as any).attempts : [],
          }),
        );

        const statusCode = code === "TRANSCRIPTION_NOT_CONFIGURED" ? 503 : code === "FILE_TOO_LARGE" ? 413 : 502;
        return res.status(statusCode).json({
          ok: false,
          code: "TRANSCRIPTION_FAILED",
          message: "Transcription failed.",
        });
      } finally {
        await unlink(tmpPath).catch(() => null);
      }
    } catch (error: any) {
      const code = classifyErrorCode(error);
      await persistJob({
        tenantId: tenant.id,
        userId: Number.isInteger(staffUser?.id) ? Number(staffUser.id) : null,
        status: "FAILED",
        provider: null,
        durationMs: Date.now() - startedAt,
        errorCode: code,
      }).catch(() => null);

      const statusCode = code === "FILE_TOO_LARGE" ? 413 : 500;
      return res.status(statusCode).json({
        ok: false,
        code,
        message: error?.message || "Transcription failed.",
      });
    }
  });
});

router.get("/transcription/health", ensureTranscriptionActor, async (_req, res) => {
  try {
    const providerHealth = await getTranscriptionProviderHealth();
    const whisper = providerHealth.providers.whisperService;

    const statusCode = whisper.configured
      ? whisper.reachable
        ? 200
        : 503
      : isVoiceTranscriptionConfigured()
        ? 200
        : 503;

    return res.status(statusCode).json({
      ok: whisper.reachable || isVoiceTranscriptionConfigured(),
      providerStatus: providerHealth,
    });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      code: "TRANSCRIPTION_HEALTH_FAILED",
      message: String(error?.message || "Failed to evaluate transcription health"),
    });
  }
});

router.post("/transcription/events", ensureTranscriptionActor, async (req, res) => {
  try {
    const tenant = (req as any)?.tenant ?? null;
    const staffUser = (req as any)?.staffUser ?? null;
    if (!tenant?.id) return res.status(400).json({ ok: false, message: "tenant required" });

    const eventType = String(req.body?.eventType || "").trim().toUpperCase();
    if (!ALLOWED_CLIENT_EVENTS.has(eventType)) {
      return res.status(400).json({ ok: false, message: "eventType is not allowed" });
    }

    await db.insert(auditLogs).values({
      tenantId: tenant.id,
      userId: Number.isInteger(staffUser?.id) ? Number(staffUser.id) : null,
      userRole: String((staffUser as any)?.currentMode || "staff"),
      action: "voice.transcription.client_event",
      entityType: "transcription",
      metadata: {
        eventType,
        conversationId: req.body?.conversationId ?? null,
        durationMs: Number(req.body?.durationMs ?? 0) || null,
        chars: Number(req.body?.chars ?? 0) || null,
        provider: req.body?.provider ?? null,
        errorCode: req.body?.errorCode ?? null,
      },
      createdAt: new Date(),
    } as any);

    return res.json({ ok: true });
  } catch (error: any) {
    return res.status(500).json({ ok: false, message: error?.message || "failed to persist event" });
  }
});

router.get("/admin/transcription-jobs", ensureTenantAdmin, async (req, res) => {
  try {
    const tenant = (req as any)?.tenant ?? null;
    if (!tenant?.id) return res.status(400).json({ ok: false, message: "tenant required" });

    const limitRaw = Number(req.query?.limit ?? 20);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(100, Math.trunc(limitRaw))) : 20;

    const result = await db.execute(sql`
      select
        j.id,
        j.tenant_id,
        j.user_id,
        j.status,
        j.provider,
        j.duration_ms,
        j.error_code,
        j.created_at,
        u.display_name as user_name
      from transcription_jobs j
      left join ece_users u on u.id = j.user_id
      where j.tenant_id = ${tenant.id}
      order by j.created_at desc
      limit ${limit}
    `);

    const jobs = sqlRows(result).map((row: any) => ({
      id: Number(row.id),
      tenantId: Number(row.tenant_id),
      userId: row.user_id == null ? null : Number(row.user_id),
      userName: row.user_name ? String(row.user_name) : null,
      status: String(row.status || "").toUpperCase(),
      provider: row.provider ? String(row.provider) : null,
      durationMs: Number(row.duration_ms ?? 0),
      errorCode: row.error_code ? String(row.error_code) : null,
      createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    }));

    return res.json({ jobs });
  } catch (error: any) {
    return res.status(500).json({ ok: false, message: error?.message || "Failed to load transcription jobs" });
  }
});

export default router;
