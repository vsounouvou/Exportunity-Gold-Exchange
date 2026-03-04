import { Router } from "express";
import { z } from "zod";
import crypto from "crypto";
import { db } from "@db";
import { telemetryEvents, telemetrySessions, tenantSites } from "@db/schema";
import { sql } from "drizzle-orm";

const router = Router();

type DeviceClass = "mobile" | "tablet" | "desktop" | "unknown";

const TelemetryEventSchema = z.object({
  type: z.string().min(1).max(64),
  ts: z.number().int().positive().optional(),
  occurredAt: z.string().optional(),
  path: z.string().min(1).max(2048),
  canonicalUrl: z.string().max(2048).optional().nullable(),
  referrer: z.string().max(2048).optional().nullable(),
  lastRoute: z.string().max(2048).optional().nullable(),
  session: z.object({
    id: z.string().min(8).max(128),
    startedAt: z.number().int().positive().optional(),
  }),
  anonId: z.string().min(8).max(256),
  userId: z.union([z.string(), z.number()]).optional().nullable(),
  locale: z.string().max(32).optional().nullable(),
  deviceClass: z.enum(["mobile", "tablet", "desktop", "unknown"]).optional().nullable(),
  territoryId: z.union([z.string(), z.number()]).optional().nullable(),
  botHints: z
    .object({
      webdriver: z.boolean().optional(),
      userAgent: z.string().max(512).optional(),
    })
    .optional()
    .nullable(),
  payload: z.record(z.any()).optional().nullable(),
});

const TelemetryBatchSchema = z.object({
  events: z.array(TelemetryEventSchema).min(1).max(200),
});

function getRuntimeEnv() {
  const env = String(process.env.APP_ENV || process.env.NODE_ENV || "prod").trim().toLowerCase();
  if (env === "production") return "prod";
  if (env === "staging") return "staging";
  if (env === "development" || env === "dev") return "dev";
  return env || "prod";
}

function normalizeHost(host: unknown): string {
  if (typeof host !== "string") return "";
  return host.split(",")[0]?.split(":")[0]?.trim().toLowerCase() || "";
}

function defaultCanonicalHost(domain: string) {
  const d = domain.trim().toLowerCase();
  if (d.startsWith("www.")) return d.slice("www.".length);
  return d;
}

function sha256Hex(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function hashId(input: { tenantId: number; value: string }) {
  const salt = String(process.env.TELEMETRY_HASH_SALT || "telemetry-dev-salt");
  return sha256Hex(`${salt}|${input.tenantId}|${input.value}`);
}

function isLikelyBot(ua: string) {
  const v = String(ua || "").toLowerCase();
  if (!v) return false;
  return /(bot|crawler|spider|slurp|facebookexternalhit|embedly|quora link preview|discordbot|whatsapp)/i.test(v);
}

function classifyDevice(ua: string): DeviceClass {
  const v = String(ua || "").toLowerCase();
  if (!v) return "unknown";
  if (/ipad|tablet|kindle|silk/.test(v)) return "tablet";
  if (/mobi|android|iphone|ipod/.test(v)) return "mobile";
  return "desktop";
}

function redactPotentialPii(value: unknown): unknown {
  if (typeof value === "string") {
    let v = value;
    v = v.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]");
    v = v.replace(/\+?\d[\d\s().-]{7,}\d/g, "[redacted-phone]");
    return v.length > 800 ? v.slice(0, 800) + "…" : v;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 50).map(redactPotentialPii);
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const blockedKeys = new Set(["email", "phone", "phoneNumber", "name", "firstName", "lastName"]);
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (blockedKeys.has(k)) continue;
      out[k] = redactPotentialPii(v);
    }
    return out;
  }
  return value;
}

const rateBuckets = new Map<string, { count: number; resetAt: number }>();
function rateLimitAllow(key: string, maxPerMinute: number) {
  const now = Date.now();
  const bucket = rateBuckets.get(key);
  if (!bucket || now > bucket.resetAt) {
    rateBuckets.set(key, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (bucket.count >= maxPerMinute) return false;
  bucket.count += 1;
  return true;
}

const siteIdCache = new Map<string, number>();
async function resolveSiteId(input: { tenantId: number; env: string; domain: string }) {
  const domain = input.domain.trim().toLowerCase();
  const key = `${input.tenantId}:${input.env}:${domain}`;
  const cached = siteIdCache.get(key);
  if (cached) return cached;

  const canonicalHost = defaultCanonicalHost(domain);
  const now = new Date();
  const [row] = await db
    .insert(tenantSites)
    .values({
      tenantId: input.tenantId,
      env: input.env,
      domain,
      canonicalHost,
      defaultLocale: "en",
      urlPatterns: {},
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [tenantSites.tenantId, tenantSites.env, tenantSites.domain],
      set: { canonicalHost, updatedAt: now },
    })
    .returning({ id: tenantSites.id });

  const resolvedId = Number(row?.id);
  if (Number.isFinite(resolvedId) && resolvedId > 0) {
    siteIdCache.set(key, resolvedId);
    return resolvedId;
  }

  const found = await db.query.tenantSites.findFirst({
    where: (t, { and, eq }) => and(eq(t.tenantId, input.tenantId), eq(t.env, input.env), eq(t.domain, domain)),
    columns: { id: true },
  });
  const fallbackId = Number(found?.id);
  if (Number.isFinite(fallbackId) && fallbackId > 0) {
    siteIdCache.set(key, fallbackId);
    return fallbackId;
  }
  return null;
}

router.post("/events", async (req: any, res) => {
  try {
    const tenant = req.tenant;
    if (!tenant) return res.status(400).json({ ok: false, message: "tenant required" });

    const env = getRuntimeEnv();
    const host = normalizeHost(req.headers["x-forwarded-host"] || req.headers.host);
    const siteId = host ? await resolveSiteId({ tenantId: tenant.id, env, domain: host }) : null;

    const rateKey = `${tenant.id}:${host || "unknown"}`;
    if (!rateLimitAllow(rateKey, 120)) {
      return res.status(429).json({ ok: false, message: "rate_limited" });
    }

    const parsed = TelemetryBatchSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ ok: false, message: "invalid_payload", issues: parsed.error.flatten() });
    }

    const ua = String(req.headers["user-agent"] || "");
    const acceptLang = String(req.headers["accept-language"] || "");

    const now = new Date();
    const rows: Array<typeof telemetryEvents.$inferInsert> = [];
    const sessionAgg = new Map<
      string,
      {
        anonIdHash: string;
        userIdHash: string | null;
        startedAt: Date;
        lastSeenAt: Date;
        entryPath: string | null;
        exitPath: string | null;
        referrer: string | null;
        deviceClass: string | null;
        locale: string | null;
        botScore: number;
        isBot: boolean;
        eventCount: number;
        pageViews: number;
        errors: number;
        scrollMax: number;
      }
    >();

    const baseDevice = classifyDevice(ua);
    const baseBot = isLikelyBot(ua);

    for (const ev of parsed.data.events) {
      const occurredAt = ev.ts ? new Date(ev.ts) : ev.occurredAt ? new Date(ev.occurredAt) : now;
      if (!Number.isFinite(occurredAt.getTime())) continue;

      const territoryIdRaw = ev.territoryId;
      const territoryId =
        typeof territoryIdRaw === "number"
          ? Math.trunc(territoryIdRaw)
          : typeof territoryIdRaw === "string" && territoryIdRaw.trim()
            ? Math.trunc(Number(territoryIdRaw))
            : null;

      const anonIdHash = hashId({ tenantId: tenant.id, value: String(ev.anonId) });
      const userIdHash = ev.userId != null ? hashId({ tenantId: tenant.id, value: String(ev.userId) }) : null;

      const hintedUa = ev.botHints?.userAgent ? String(ev.botHints.userAgent) : "";
      const effectiveUa = hintedUa || ua;
      const hintedBot = ev.botHints?.webdriver ? true : false;
      const isBot = baseBot || hintedBot || isLikelyBot(effectiveUa);
      const botScore = isBot ? (hintedBot ? 90 : 70) : 0;

      const locale =
        (ev.locale && String(ev.locale)) ||
        (acceptLang ? acceptLang.split(",")[0]?.trim() : "") ||
        null;

      const deviceClass = (ev.deviceClass as DeviceClass | null | undefined) || baseDevice;

      const payload = ev.payload ? (redactPotentialPii(ev.payload) as any) : {};

      rows.push({
        tenantId: tenant.id,
        siteId,
        env,
        territoryId: territoryId && territoryId > 0 ? territoryId : null,
        eventType: ev.type,
        occurredAt,
        receivedAt: now,
        path: ev.path,
        canonicalUrl: ev.canonicalUrl || null,
        referrer: ev.referrer || null,
        lastRoute: ev.lastRoute || null,
        sessionId: ev.session.id,
        anonIdHash,
        userIdHash,
        deviceClass,
        locale,
        botScore,
        isBot,
        payload,
      });

      const sessionKey = ev.session.id;
      const existing = sessionAgg.get(sessionKey);
      const startedAt = ev.session.startedAt ? new Date(ev.session.startedAt) : occurredAt;

      const isPageView = ev.type === "page_view";
      const isError = ev.type === "api_error" || ev.type === "js_error";
      const scrollMax =
        ev.type === "scroll_depth" && typeof (payload as any)?.percent === "number"
          ? Math.max(0, Math.min(100, Math.trunc((payload as any).percent)))
          : 0;

      if (!existing) {
        sessionAgg.set(sessionKey, {
          anonIdHash,
          userIdHash,
          startedAt,
          lastSeenAt: occurredAt,
          entryPath: ev.path,
          exitPath: ev.path,
          referrer: ev.referrer || null,
          deviceClass,
          locale,
          botScore,
          isBot,
          eventCount: 1,
          pageViews: isPageView ? 1 : 0,
          errors: isError ? 1 : 0,
          scrollMax,
        });
      } else {
        existing.userIdHash = existing.userIdHash ?? userIdHash;
        existing.startedAt = existing.startedAt < startedAt ? existing.startedAt : startedAt;
        existing.lastSeenAt = existing.lastSeenAt > occurredAt ? existing.lastSeenAt : occurredAt;
        existing.exitPath = ev.path || existing.exitPath;
        existing.eventCount += 1;
        existing.pageViews += isPageView ? 1 : 0;
        existing.errors += isError ? 1 : 0;
        existing.scrollMax = Math.max(existing.scrollMax, scrollMax);
        existing.botScore = Math.max(existing.botScore, botScore);
        existing.isBot = existing.isBot || isBot;
      }
    }

    if (rows.length === 0) {
      return res.status(400).json({ ok: false, message: "no_valid_events" });
    }

    await db.insert(telemetryEvents).values(rows);

    for (const [sessionId, s] of sessionAgg.entries()) {
      await db
        .insert(telemetrySessions)
        .values({
          tenantId: tenant.id,
          siteId,
          env,
          sessionId,
          anonIdHash: s.anonIdHash,
          userIdHash: s.userIdHash,
          startedAt: s.startedAt,
          lastSeenAt: s.lastSeenAt,
          entryPath: s.entryPath,
          exitPath: s.exitPath,
          referrer: s.referrer,
          deviceClass: s.deviceClass,
          locale: s.locale,
          botScore: s.botScore,
          isBot: s.isBot,
          eventCount: s.eventCount,
          pageViews: s.pageViews,
          errors: s.errors,
          scrollMax: s.scrollMax,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [telemetrySessions.tenantId, telemetrySessions.sessionId],
          set: {
            userIdHash: sql`coalesce(${telemetrySessions.userIdHash}, ${s.userIdHash})`,
            startedAt: sql`least(${telemetrySessions.startedAt}, ${s.startedAt})`,
            lastSeenAt: sql`greatest(${telemetrySessions.lastSeenAt}, ${s.lastSeenAt})`,
            entryPath: sql`coalesce(${telemetrySessions.entryPath}, ${s.entryPath})`,
            exitPath: s.exitPath,
            referrer: sql`coalesce(${telemetrySessions.referrer}, ${s.referrer})`,
            deviceClass: sql`coalesce(${telemetrySessions.deviceClass}, ${s.deviceClass})`,
            locale: sql`coalesce(${telemetrySessions.locale}, ${s.locale})`,
            botScore: sql`greatest(${telemetrySessions.botScore}, ${s.botScore})`,
            isBot: sql`${telemetrySessions.isBot} OR ${s.isBot}`,
            eventCount: sql`${telemetrySessions.eventCount} + ${s.eventCount}`,
            pageViews: sql`${telemetrySessions.pageViews} + ${s.pageViews}`,
            errors: sql`${telemetrySessions.errors} + ${s.errors}`,
            scrollMax: sql`greatest(${telemetrySessions.scrollMax}, ${s.scrollMax})`,
            updatedAt: now,
          },
        });
    }

    res.status(201).json({ ok: true, received: rows.length, sessions: sessionAgg.size });
  } catch (err: any) {
    res.status(500).json({ ok: false, message: err?.message || "telemetry_failed" });
  }
});

export default router;

