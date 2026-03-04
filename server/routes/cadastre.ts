import crypto from "node:crypto";
import { Router } from "express";
import { and, desc, eq, gt, isNull, or, sql } from "drizzle-orm";
import { db } from "@db";
import { cadastreSyncRuns, demoLinks } from "@db/schema";

import { runCiCadastreSync, getCadastreMapRows } from "../lib/cadastre/ciCadastreAdapter";
import { ensureCadastreTables } from "../lib/cadastre/ensureCadastreTables";
import { ensureTenantAdmin, ensureTenantStaff } from "./utils/auth";
import { getContactNotificationConfig, sendContactNotification } from "../lib/contact/notifier";

const router = Router();

const DEMO_RATE_LIMIT_WINDOW_MS = 60_000;
const DEMO_RATE_LIMIT_MAX = 180;
const demoRateBuckets = new Map<string, { startedAt: number; count: number }>();

function asText(value: unknown) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function toInt(value: unknown, fallback: number) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.trunc(parsed);
}

function requireTenant(req: any, res: any) {
  const tenantId = Number(req?.tenant?.id || 0);
  if (!Number.isFinite(tenantId) || tenantId <= 0) {
    res.status(500).json({ ok: false, message: "Tenant not resolved" });
    return null;
  }
  return {
    id: tenantId,
    key: String(req.tenant?.key || "").trim() || "tenant",
  };
}

function sha256(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function buildPublicBaseUrl(req: any) {
  const proto = String(req.headers["x-forwarded-proto"] || req.protocol || "https")
    .split(",")[0]
    .trim();
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "")
    .split(",")[0]
    .trim();
  return `${proto}://${host}`;
}

function extractDemoToken(req: any) {
  const queryToken = asText(req.query?.token);
  if (queryToken) return queryToken;
  const header = asText(req.headers?.authorization);
  if (header && /^bearer\s+/i.test(header)) {
    return asText(header.replace(/^bearer\s+/i, ""));
  }
  return null;
}

function enforceDemoRateLimit(req: any, res: any) {
  const key = String(req.headers["x-forwarded-for"] || req.ip || "unknown")
    .split(",")[0]
    .trim();
  const now = Date.now();
  const current = demoRateBuckets.get(key);
  if (!current || now - current.startedAt > DEMO_RATE_LIMIT_WINDOW_MS) {
    demoRateBuckets.set(key, { startedAt: now, count: 1 });
    return true;
  }
  current.count += 1;
  if (current.count > DEMO_RATE_LIMIT_MAX) {
    res.status(429).json({ ok: false, message: "Too many requests" });
    return false;
  }
  return true;
}

async function validateDemoToken(req: any, res: any) {
  if (!enforceDemoRateLimit(req, res)) return null;
  const tenant = requireTenant(req, res);
  if (!tenant) return null;
  const rawToken = extractDemoToken(req);
  if (!rawToken) {
    res.status(401).json({ ok: false, message: "Demo token required" });
    return null;
  }

  const tokenHash = sha256(rawToken);
  await ensureCadastreTables();
  const link = await db.query.demoLinks.findFirst({
    where: and(
      eq(demoLinks.tenantId, tenant.id),
      eq(demoLinks.tokenHash, tokenHash),
      isNull(demoLinks.revokedAt),
      gt(demoLinks.expiresAt, new Date()),
    ),
  });
  if (!link) {
    res.status(403).json({ ok: false, message: "Invalid or expired demo token" });
    return null;
  }

  return link;
}

function mapCadastreMapResponse(rows: Array<any>) {
  return rows.map((row) => ({
    id: row.id,
    cadastre_name: row.cadastreName,
    permit_number: row.permitNumber,
    region: row.region,
    status: row.status,
    site_type: row.siteType,
    risk_level: row.riskLevel,
    lat: row.lat,
    lng: row.lng,
    geometry: row.geometry,
    source_ref: row.sourceRef,
    production_30d_g: row.production30dG,
    last_report_date: row.lastReportDate,
  }));
}

function mapOpportunityResponse(rows: Array<any>) {
  return rows.map((row) => {
    const monthlyCapacity = Math.max(0, Number(row.production30dG || 0));
    const annualized = monthlyCapacity * 12;
    const durationMonths = monthlyCapacity > 0 ? Math.max(4, Math.min(18, Math.round(900 / (monthlyCapacity + 1)))) : 9;
    const capitalRequired = Math.max(75_000, Math.round(monthlyCapacity * 850 + 85_000));
    return {
      id: row.id,
      cadastre_name: row.cadastreName,
      permit_number: row.permitNumber,
      region: row.region,
      status: row.status,
      site_type: row.siteType,
      risk_level: row.riskLevel,
      opportunity_title: row.cadastreName,
      current_capacity_kg_month: monthlyCapacity || null,
      annualized_capacity_kg: annualized || null,
      capital_required_usd: capitalRequired,
      duration_months: durationMonths,
      production_30d_g: row.production30dG,
      last_report_date: row.lastReportDate,
      lat: row.lat,
      lng: row.lng,
    };
  });
}

router.get("/api/transcription/health", ensureTenantStaff, async (req: any, res) => {
  const whisperUrl = String(process.env.WHISPER_SERVICE_URL || "").trim();
  const openaiEnabled = String(process.env.OPENAI_TRANSCRIPTION_ENABLED || "false").trim().toLowerCase() === "true";

  let whisperReachable = false;
  let whisperStatus = "not-configured";
  let latencyMs: number | null = null;

  if (whisperUrl) {
    const startedAt = Date.now();
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3000);
      const response = await fetch(whisperUrl, { method: "OPTIONS", signal: controller.signal }).catch(() => null as any);
      clearTimeout(timer);
      latencyMs = Date.now() - startedAt;
      whisperReachable = Boolean(response && response.status < 500);
      whisperStatus = whisperReachable ? "reachable" : "unreachable";
    } catch {
      whisperReachable = false;
      whisperStatus = "unreachable";
    }
  }

  res.json({
    ok: true,
    provider_primary: process.env.TRANSCRIPTION_PROVIDER_PRIMARY || "whisper_service",
    provider_secondary: process.env.TRANSCRIPTION_PROVIDER_SECONDARY || "browser_speech",
    provider_tertiary: process.env.TRANSCRIPTION_PROVIDER_TERTIARY || "openai",
    openai_transcription_enabled: openaiEnabled,
    whisper_service_url: whisperUrl || null,
    whisper_service_status: whisperStatus,
    whisper_service_reachable: whisperReachable,
    whisper_service_latency_ms: latencyMs,
  });
});

router.get("/api/cadastre/map", ensureTenantStaff, async (req: any, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;

    const rows = await getCadastreMapRows({
      tenantId: tenant.id,
      country: asText(req.query?.country) || "CI",
      region: asText(req.query?.region),
      q: asText(req.query?.q),
      statuses: asText(req.query?.status),
      limit: toInt(req.query?.limit, 800),
    });

    res.json({
      ok: true,
      total: rows.length,
      items: mapCadastreMapResponse(rows),
    });
  } catch (error: any) {
    res.status(500).json({ ok: false, message: error?.message || "Failed to load cadastre map data" });
  }
});

router.get("/api/cadastre/opportunities", ensureTenantStaff, async (req: any, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;

    const rows = await getCadastreMapRows({
      tenantId: tenant.id,
      country: asText(req.query?.country) || "CI",
      region: asText(req.query?.region),
      q: asText(req.query?.q),
      statuses: asText(req.query?.status) || "VERIFIED,PENDING",
      limit: toInt(req.query?.limit, 120),
    });

    res.json({
      ok: true,
      total: rows.length,
      items: mapOpportunityResponse(rows),
    });
  } catch (error: any) {
    res.status(500).json({ ok: false, message: error?.message || "Failed to load cadastre opportunities" });
  }
});

router.post("/api/admin/cadastre/sync", ensureTenantAdmin, async (req: any, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;

    const sourceModeRaw = String(req.body?.source_mode || req.body?.sourceMode || process.env.CI_CADASTRE_SOURCE_MODE || "api")
      .trim()
      .toLowerCase();
    const sourceMode = sourceModeRaw === "manual_import" || sourceModeRaw === "scrape" ? sourceModeRaw : "api";
    const maxLayers = Math.max(1, Math.min(toInt(req.body?.max_layers ?? req.body?.maxLayers, 8), 16));

    const result = await runCiCadastreSync({
      tenantId: tenant.id,
      sourceMode: sourceMode as any,
      maxLayers,
    });

    return res.status(200).json({ ok: true, ...result });
  } catch (error: any) {
    return res.status(500).json({ ok: false, message: error?.message || "Cadastre sync failed" });
  }
});

router.get("/api/admin/cadastre/sync-runs", ensureTenantAdmin, async (req: any, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    await ensureCadastreTables();

    const runs = await db.query.cadastreSyncRuns.findMany({
      where: eq(cadastreSyncRuns.tenantId, tenant.id),
      orderBy: [desc(cadastreSyncRuns.startedAt)],
      limit: Math.max(1, Math.min(toInt(req.query?.limit, 20), 100)),
    });
    res.json({ ok: true, items: runs });
  } catch (error: any) {
    res.status(500).json({ ok: false, message: error?.message || "Failed to list sync runs" });
  }
});

router.post("/api/admin/demo-links", ensureTenantAdmin, async (req: any, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    await ensureCadastreTables();

    const label = asText(req.body?.label) || `Cadastre demo ${new Date().toISOString().slice(0, 10)}`;
    const expiresInHours = Math.max(1, Math.min(toInt(req.body?.expires_in_hours ?? req.body?.expiresInHours, 48), 24 * 14));
    const scopes = Array.isArray(req.body?.scopes)
      ? req.body.scopes.map((entry: unknown) => String(entry || "").trim()).filter(Boolean)
      : ["cadastre:read", "opportunities:read"];
    const sendTo = asText(req.body?.send_to || req.body?.sendTo) || "vs@exportunity.com";
    const shouldEmail = String(req.body?.email ?? "true").trim().toLowerCase() !== "false";

    const rawToken = crypto.randomBytes(24).toString("hex");
    const tokenHash = sha256(rawToken);
    const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);

    const [link] = await db
      .insert(demoLinks)
      .values({
        tenantId: tenant.id,
        tokenHash,
        label,
        scopes,
        expiresAt,
        createdByUserId: Number(req.adminUser?.id || 0) || null,
      })
      .returning({
        id: demoLinks.id,
        expiresAt: demoLinks.expiresAt,
        label: demoLinks.label,
      });

    const url = `${buildPublicBaseUrl(req)}/public/demo/cadastre?token=${rawToken}`;
    let emailResult: { status: "sent" | "skipped" | "failed"; reason?: string } = { status: "skipped" };

    if (shouldEmail) {
      const cfg = getContactNotificationConfig();
      if (!cfg.enabled || !cfg.from) {
        emailResult = { status: "skipped", reason: "smtp_not_configured" };
      } else {
        try {
          await sendContactNotification({
            to: [sendTo],
            from: cfg.from,
            subject: `[Cadastre Demo Link] ${label}`,
            text: [
              `Tenant: ${tenant.key}`,
              `Demo label: ${label}`,
              `Expires at: ${link?.expiresAt ? new Date(link.expiresAt).toISOString() : expiresAt.toISOString()}`,
              "",
              `Open: ${url}`,
            ].join("\n"),
          });
          emailResult = { status: "sent" };
        } catch (error: any) {
          emailResult = { status: "failed", reason: String(error?.message || error || "mail_failed") };
        }
      }
    }

    res.status(201).json({
      ok: true,
      id: link?.id,
      label: link?.label || label,
      url,
      expires_at: link?.expiresAt || expiresAt,
      email: emailResult,
    });
  } catch (error: any) {
    res.status(500).json({ ok: false, message: error?.message || "Failed to create demo link" });
  }
});

router.get("/api/admin/demo-links", ensureTenantAdmin, async (req: any, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    await ensureCadastreTables();

    const links = await db.query.demoLinks.findMany({
      where: eq(demoLinks.tenantId, tenant.id),
      orderBy: [desc(demoLinks.createdAt)],
      limit: Math.max(1, Math.min(toInt(req.query?.limit, 25), 200)),
    });
    res.json({ ok: true, items: links });
  } catch (error: any) {
    res.status(500).json({ ok: false, message: error?.message || "Failed to list demo links" });
  }
});

router.post("/api/admin/demo-links/:id/revoke", ensureTenantAdmin, async (req: any, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    await ensureCadastreTables();
    const id = asText(req.params?.id);
    if (!id) return res.status(400).json({ ok: false, message: "id required" });

    await db
      .update(demoLinks)
      .set({ revokedAt: new Date() })
      .where(and(eq(demoLinks.id, id), eq(demoLinks.tenantId, tenant.id), isNull(demoLinks.revokedAt)));

    res.json({ ok: true, id });
  } catch (error: any) {
    res.status(500).json({ ok: false, message: error?.message || "Failed to revoke demo link" });
  }
});

router.get("/api/demo/cadastre/map", async (req: any, res) => {
  try {
    const link = await validateDemoToken(req, res);
    if (!link) return;

    const rows = await getCadastreMapRows({
      tenantId: Number(link.tenantId),
      country: asText(req.query?.country) || "CI",
      region: asText(req.query?.region),
      q: asText(req.query?.q),
      statuses: asText(req.query?.status),
      limit: toInt(req.query?.limit, 800),
    });

    res.json({
      ok: true,
      demo: true,
      total: rows.length,
      items: mapCadastreMapResponse(rows),
    });
  } catch (error: any) {
    res.status(500).json({ ok: false, message: error?.message || "Failed to load demo cadastre map" });
  }
});

router.get("/api/demo/cadastre/opportunities", async (req: any, res) => {
  try {
    const link = await validateDemoToken(req, res);
    if (!link) return;

    const rows = await getCadastreMapRows({
      tenantId: Number(link.tenantId),
      country: asText(req.query?.country) || "CI",
      region: asText(req.query?.region),
      q: asText(req.query?.q),
      statuses: asText(req.query?.status) || "VERIFIED,PENDING",
      limit: toInt(req.query?.limit, 120),
    });

    res.json({
      ok: true,
      demo: true,
      total: rows.length,
      items: mapOpportunityResponse(rows),
    });
  } catch (error: any) {
    res.status(500).json({ ok: false, message: error?.message || "Failed to load demo cadastre opportunities" });
  }
});

export default router;

