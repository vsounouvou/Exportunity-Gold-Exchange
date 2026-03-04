import { Router, type Request, type Response, type NextFunction } from "express";
import { db } from "@db";
import {
  geoTerritories,
  territoryBudgets,
  territoryKpis,
  territoryLeaderboards,
  territoryOperatorContracts,
  referrerProfiles,
} from "@db/schema/territories";
import { eceChatMessages, eceSessions, eceUsers, auditLogs, agents } from "@db/schema";
import { and, asc, desc, eq, ilike, inArray, isNull, or } from "drizzle-orm";
import {
  findNearestTerritory,
  formatMonth,
  upsertTerritoryBudget,
  upsertTerritoryKpi,
} from "../lib/territories";
import { isChairmanAssistantUser } from "./utils/auth";
import { generateAgentResponse } from "../lib/ai-provider";
import { isAiEnabled } from "../lib/ai-consent";

const router = Router();

// Territories are admin/ops pages; avoid stale data due to intermediary caches.
router.use((_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});

async function verifySession(token?: string) {
  if (!token) return null;
  const session = await db.query.eceSessions.findFirst({
    where: eq(eceSessions.token, token),
  });
  if (!session || new Date(session.expiresAt) < new Date()) {
    return null;
  }
  const user = await db.query.eceUsers.findFirst({
    where: eq(eceUsers.id, session.userId),
  });
  return user;
}

async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  const user = await verifySession(token);

  if (!user) {
    return res.status(401).json({ message: "Authentication required" });
  }

  const roles = Array.isArray((user as any).roles) ? (user as any).roles : [];
  const permissions = Array.isArray((user as any).permissions) ? (user as any).permissions : [];
  const currentMode = (user as any).currentMode;

  const isAdmin =
    currentMode === "admin" || permissions.includes("*") || roles.includes("admin") || isChairmanAssistantUser(user);
  if (!isAdmin) {
    return res.status(403).json({ message: "Admin access required" });
  }

  (req as any).adminUser = user;
  next();
}

function requireTenant(req: any, res: Response) {
  const tenant = req.tenant;
  if (!tenant) {
    res.status(500).json({ message: "Tenant not resolved" });
    return null;
  }
  return tenant;
}

function asNumber(value: any, fallback: number | null = null): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function extractFirstJsonObject(raw: string): any | null {
  const text = String(raw || "");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  const candidate = text.slice(start, end + 1);
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

function uniqueActions(list: Array<{ action: string; params?: Record<string, any> }>) {
  const seen = new Set<string>();
  const out: Array<{ action: string; params?: Record<string, any> }> = [];
  for (const item of list) {
    const action = String(item?.action || "").trim();
    if (!action) continue;
    const key = `${action}:${JSON.stringify(item?.params || {})}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ action, params: item?.params || {} });
  }
  return out;
}

function inferActionsFromText(text: string) {
  const t = String(text || "").toLowerCase();
  const actions: Array<{ action: string; params?: Record<string, any> }> = [];

  const wantsKpis = t.includes("kpi") || t.includes("gmv") || t.includes("audit kpi") || (t.includes("audit") && t.includes("kpi"));
  const wantsNav = t.includes("navigation") || t.includes("routes audit") || (t.includes("audit") && t.includes("navigation"));
  const wantsMarketing = (t.includes("marketing") && (t.includes("launch") || t.includes("campaign") || t.includes("ads"))) || t.includes("launch campaign");
  const wantsSeed = t.includes("seed") || t.includes("populate") || (t.includes("products") && t.includes("seed"));

  if (wantsKpis) actions.push({ action: "territory.audit.kpis" });
  if (wantsNav) actions.push({ action: "territory.audit.navigation" });
  if (wantsMarketing) actions.push({ action: "territory.marketing.launch" });
  if (wantsSeed) actions.push({ action: "territory.marketplace.seedProducts" });

  return actions;
}

async function logTerritoryAction(input: {
  tenantId: number;
  userId: number | null;
  action: string;
  territoryId: number;
  metadata?: Record<string, any>;
  req: any;
}) {
  try {
    await db.insert(auditLogs).values({
      tenantId: input.tenantId,
      userId: input.userId,
      userRole: "admin",
      action: input.action,
      entityType: "territory",
      entityId: input.territoryId,
      metadata: input.metadata ?? {},
      ipAddress: String(input.req?.ip || input.req?.headers?.["x-forwarded-for"] || ""),
      userAgent: String(input.req?.headers?.["user-agent"] || ""),
      createdAt: new Date(),
    });
  } catch {
    // ignore
  }
}

async function executeTerritoryAction(input: {
  tenantId: number;
  tenantKey: string;
  userId: number | null;
  territoryId: number;
  action: string;
  params?: Record<string, any>;
  req: any;
}) {
  const action = String(input.action || "").trim();
  const territory = await db.query.geoTerritories.findFirst({
    where: and(eq(geoTerritories.tenantId, input.tenantId), eq(geoTerritories.id, input.territoryId)),
  });
  if (!territory) {
    return { ok: false, action, message: "Territory not found" };
  }

  if (action === "territory.audit.kpis") {
    const [budget] = await db
      .select()
      .from(territoryBudgets)
      .where(eq(territoryBudgets.territoryId, input.territoryId))
      .orderBy(desc(territoryBudgets.month))
      .limit(1);

    const [kpi] = await db
      .select()
      .from(territoryKpis)
      .where(eq(territoryKpis.territoryId, input.territoryId))
      .orderBy(desc(territoryKpis.month))
      .limit(1);

    await logTerritoryAction({
      tenantId: input.tenantId,
      userId: input.userId,
      action,
      territoryId: input.territoryId,
      metadata: { budget: budget ?? null, kpi: kpi ?? null },
      req: input.req,
    });

    return { ok: true, action, territoryId: input.territoryId, territory, budget: budget ?? null, kpi: kpi ?? null };
  }

  if (action === "territory.audit.navigation") {
    await logTerritoryAction({
      tenantId: input.tenantId,
      userId: input.userId,
      action,
      territoryId: input.territoryId,
      metadata: { note: "navigation audit requested" },
      req: input.req,
    });

    return {
      ok: true,
      action,
      territoryId: input.territoryId,
      message:
        "Navigation audit logged. Next: enforce territoryId filters across modules (marketplace, ops, finance, marketing).",
    };
  }

  if (action === "territory.marketplace.seedProducts") {
    await logTerritoryAction({
      tenantId: input.tenantId,
      userId: input.userId,
      action,
      territoryId: input.territoryId,
      metadata: { preset: input.params?.preset ?? null, count: input.params?.count ?? null },
      req: input.req,
    });

    return {
      ok: true,
      action,
      territoryId: input.territoryId,
      message:
        "Seed request logged. Next: map territory->sellers, then generate localized products and tag territory metadata on listings.",
    };
  }

  if (action === "territory.marketing.launch") {
    await logTerritoryAction({
      tenantId: input.tenantId,
      userId: input.userId,
      action,
      territoryId: input.territoryId,
      metadata: { brief: input.params?.brief ?? null, channels: input.params?.channels ?? null },
      req: input.req,
    });

    return {
      ok: true,
      action,
      territoryId: input.territoryId,
      message:
        "Marketing launch logged. Next: create a Campaign record scoped to this territory and route it through the Marketing module.",
    };
  }

  await logTerritoryAction({
    tenantId: input.tenantId,
    userId: input.userId,
    action,
    territoryId: input.territoryId,
    metadata: { warning: "unknown_action", params: input.params ?? {} },
    req: input.req,
  });

  return { ok: false, action, message: "Unknown action" };
}

async function fetchJsonWithTimeout(url: string, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "ExportunityTerritoryHub/1.0 (admin boundary import)",
        "Accept-Language": "en",
      },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status} ${text}`);
    }
    return (await res.json()) as any;
  } finally {
    clearTimeout(timer);
  }
}

function osmPrefixForType(osmType: string): string | null {
  const raw = String(osmType || "").toLowerCase();
  if (raw === "relation" || raw === "r") return "R";
  if (raw === "way" || raw === "w") return "W";
  if (raw === "node" || raw === "n") return "N";
  return null;
}

function bboxFromNominatim(boundingbox: any): [number, number, number, number] | null {
  if (!Array.isArray(boundingbox) || boundingbox.length < 4) return null;
  const south = Number(boundingbox[0]);
  const north = Number(boundingbox[1]);
  const west = Number(boundingbox[2]);
  const east = Number(boundingbox[3]);
  if (![south, north, west, east].every((n) => Number.isFinite(n))) return null;
  return [west, south, east, north];
}

function inferTerritoryTypeFromNominatim(result: any): string {
  const addresstype = String(result?.addresstype || result?.type || "").toLowerCase();
  if (addresstype === "country") return "country";
  if (["state", "region", "province"].includes(addresstype)) return "region";
  if (["city", "town"].includes(addresstype)) return "city";
  if (["district", "county", "municipality", "department"].includes(addresstype)) return "district";
  if (["suburb", "neighbourhood", "neighborhood", "quarter", "ward"].includes(addresstype)) return "neighborhood";
  if (result?.class === "boundary" && result?.type === "administrative") {
    // Fall back to city/district when admin boundaries aren't labeled cleanly.
    const rank = Number(result?.place_rank);
    if (Number.isFinite(rank) && rank <= 4) return "country";
    if (Number.isFinite(rank) && rank <= 12) return "region";
    if (Number.isFinite(rank) && rank <= 16) return "city";
    return "district";
  }
  return "neighborhood";
}

function extractCityFromAddress(address: any): string | null {
  if (!address || typeof address !== "object") return null;
  const val =
    address.city ||
    address.town ||
    address.village ||
    address.municipality ||
    address.county ||
    address.state_district ||
    null;
  return typeof val === "string" && val.trim() ? val.trim() : null;
}

async function inferParentTerritoryId(input: {
  tenantId: number;
  countryCode: string;
  territoryType: string;
  cityName: string | null;
}) {
  const country = await db.query.geoTerritories.findFirst({
    where: and(
      eq(geoTerritories.tenantId, input.tenantId),
      eq(geoTerritories.countryCode, input.countryCode),
      eq(geoTerritories.territoryType, "country" as any),
    ),
  });

  if (input.territoryType === "country") return null;

  if ((input.territoryType === "district" || input.territoryType === "neighborhood") && input.cityName) {
    const city = await db.query.geoTerritories.findFirst({
      where: and(
        eq(geoTerritories.tenantId, input.tenantId),
        eq(geoTerritories.countryCode, input.countryCode),
        eq(geoTerritories.territoryType, "city" as any),
        or(ilike(geoTerritories.name, `%${input.cityName}%`), ilike(geoTerritories.city, `%${input.cityName}%`)),
      ),
    });
    if (city) return city.id;
  }

  if (input.territoryType === "city" && country) return country.id;
  if (input.territoryType === "region" && country) return country.id;
  return country?.id ?? null;
}

router.use((req, res, next) => {
  if (req.path === "/assign") return next();
  return requireAdmin(req, res, next);
});

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function estimateRadiusMetersFromBbox(bbox: [number, number, number, number] | null, center: { lat: number; lng: number }) {
  if (!bbox) return 0;
  const [minLng, minLat, maxLng, maxLat] = bbox;
  const corners: Array<[number, number]> = [
    [minLat, minLng],
    [minLat, maxLng],
    [maxLat, minLng],
    [maxLat, maxLng],
  ];
  const distances = corners.map(([lat, lng]) => haversineMeters(center.lat, center.lng, lat, lng));
  const max = distances.reduce((acc, v) => (v > acc ? v : acc), 0);
  return Math.max(0, Math.round(max));
}

router.get("/boundaries/search", async (req, res) => {
  const q = String(req.query.q || "").trim();
  if (q.length < 2) return res.json({ ok: true, items: [] });

  const countryCode = String(req.query.countryCode || "").trim().toLowerCase();
  const limit = Math.min(Math.max(Number(req.query.limit || 8) || 8, 1), 20);

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("q", q);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("polygon_geojson", "1");
  url.searchParams.set("extratags", "1");
  if (countryCode) url.searchParams.set("countrycodes", countryCode);

  try {
    const data = (await fetchJsonWithTimeout(url.toString(), 15000)) as any[];
    const items = (Array.isArray(data) ? data : []).map((row) => {
      const prefix = osmPrefixForType(row?.osm_type);
      const osmId = String(row?.osm_id || "");
      const osmRef = prefix && osmId ? `${prefix}${osmId}` : null;
      const bbox = bboxFromNominatim(row?.boundingbox);
      const center = {
        lat: asNumber(row?.lat, 0) ?? 0,
        lng: asNumber(row?.lon, 0) ?? 0,
      };
      const territoryType = inferTerritoryTypeFromNominatim(row);
      const country = typeof row?.address?.country_code === "string" ? row.address.country_code.toUpperCase() : null;
      const city = extractCityFromAddress(row?.address);
      const geometry = row?.geojson && (row.geojson.type === "Polygon" || row.geojson.type === "MultiPolygon") ? row.geojson : null;

      return {
        osmType: row?.osm_type ?? null,
        osmId: row?.osm_id ?? null,
        osmRef,
        name: row?.name ?? row?.display_name ?? "Boundary",
        displayName: row?.display_name ?? null,
        addresstype: row?.addresstype ?? null,
        class: row?.class ?? null,
        type: row?.type ?? null,
        territoryType,
        countryCode: country,
        city,
        bbox,
        center,
        geometry,
      };
    });

    res.json({ ok: true, items });
  } catch (err: any) {
    res.status(500).json({ ok: false, message: err?.message || "Boundary search failed" });
  }
});

router.post("/boundaries/import", async (req, res) => {
  const tenant = requireTenant(req as any, res);
  if (!tenant) return;

  const osmType = String(req.body?.osmType || req.body?.osm_type || "").trim();
  const osmIdRaw = String(req.body?.osmId || req.body?.osm_id || "").trim();
  const prefix = osmPrefixForType(osmType);
  const osmId = Number(osmIdRaw);
  if (!prefix || !Number.isFinite(osmId)) {
    return res.status(400).json({ message: "osmType and osmId required" });
  }

  const osmRef = `${prefix}${Math.trunc(osmId)}`;

  const url = new URL("https://nominatim.openstreetmap.org/lookup");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("osm_ids", osmRef);
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("polygon_geojson", "1");
  url.searchParams.set("extratags", "1");

  try {
    const data = (await fetchJsonWithTimeout(url.toString(), 20000)) as any[];
    const first = Array.isArray(data) ? data[0] : null;
    if (!first) return res.status(404).json({ message: "Boundary not found" });

    const geometry = first?.geojson;
    const geometryType = String(geometry?.type || "");
    if (geometryType !== "Polygon" && geometryType !== "MultiPolygon") {
      return res.status(400).json({ message: `Unsupported geometry type: ${geometryType || "unknown"}` });
    }

    const inferredType = inferTerritoryTypeFromNominatim(first);
    const territoryType = String(req.body?.territoryType || "").trim() || inferredType;
    const address = first?.address;
    const countryCodeRaw = String(req.body?.countryCode || address?.country_code || "").trim();
    if (!countryCodeRaw) return res.status(400).json({ message: "countryCode not found for this boundary" });
    const countryCode = countryCodeRaw.toUpperCase();
    const cityName = extractCityFromAddress(address);
    const name = String(req.body?.name || first?.name || first?.display_name || osmRef).trim();
    const bbox = bboxFromNominatim(first?.boundingbox);

    const center = {
      lat: asNumber(first?.lat, 0) ?? 0,
      lng: asNumber(first?.lon, 0) ?? 0,
    };

    const radiusMeters = estimateRadiusMetersFromBbox(bbox, center);

    const parentTerritoryId = await inferParentTerritoryId({
      tenantId: tenant.id,
      countryCode,
      territoryType,
      cityName,
    });

    const existing = await db.query.geoTerritories.findFirst({
      where: and(eq(geoTerritories.tenantId, tenant.id), eq(geoTerritories.source, "OSM"), eq(geoTerritories.sourceRef, osmRef)),
    });

    const now = new Date();
    const payload: Record<string, any> = {
      tenantId: tenant.id,
      parentTerritoryId,
      name,
      countryCode,
      city: cityName,
      territoryType,
      geometryType,
      geometryGeojson: geometry,
      bbox,
      source: "OSM",
      sourceRef: osmRef,
      sourceVersion: now.toISOString().slice(0, 10),
      confidence: 80,
      centerLat: String(center.lat),
      centerLng: String(center.lng),
      radiusMeters: radiusMeters || 0,
      currency: "XOF",
      language: "fr",
      status: "active",
      updatedAt: now,
    };

    let territoryRow: any;
    if (existing) {
      const [updated] = await db.update(geoTerritories).set(payload).where(eq(geoTerritories.id, existing.id)).returning();
      territoryRow = updated;
    } else {
      const [created] = await db
        .insert(geoTerritories)
        .values({
          ...(payload as any),
          createdAt: now,
        })
        .returning();
      territoryRow = created;
    }

    res.json({
      ok: true,
      territory: territoryRow,
      imported: {
        osmRef,
        territoryType,
        countryCode,
        city: cityName,
      },
    });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Import failed" });
  }
});

router.get("/", async (req, res) => {
  const tenant = requireTenant(req, res);
  if (!tenant) return;

  const rows = await db.query.geoTerritories.findMany({
    where: eq(geoTerritories.tenantId, tenant.id),
    orderBy: desc(geoTerritories.createdAt),
  });

  const ids = rows.map((t) => t.id);
  const [budgets, kpis] = await Promise.all([
    ids.length
      ? db
          .select()
          .from(territoryBudgets)
      .where(inArray(territoryBudgets.territoryId, ids))
      .orderBy(desc(territoryBudgets.month))
      : [],
    ids.length
      ? db
          .select()
          .from(territoryKpis)
      .where(inArray(territoryKpis.territoryId, ids))
      .orderBy(desc(territoryKpis.month))
      : [],
  ]);

  const latestBudget = new Map<number, any>();
  for (const budget of budgets) {
    if (!latestBudget.has(budget.territoryId)) {
      latestBudget.set(budget.territoryId, budget);
    }
  }

  const latestKpi = new Map<number, any>();
  for (const kpi of kpis) {
    if (!latestKpi.has(kpi.territoryId)) {
      latestKpi.set(kpi.territoryId, kpi);
    }
  }

  res.json({
    territories: rows.map((row) => ({
      ...row,
      latestBudget: latestBudget.get(row.id) ?? null,
      latestKpi: latestKpi.get(row.id) ?? null,
    })),
  });
});

router.post("/", async (req, res) => {
  const tenant = requireTenant(req, res);
  if (!tenant) return;

  const allowRadius = ["1", "true", "yes", "y", "on"].includes(
    String(process.env.ALLOW_TERRITORY_RADIUS_CREATE || "").trim().toLowerCase(),
  );
  if (!allowRadius) {
    return res.status(400).json({
      message: "Radius-based territories are disabled. Use boundary import (/api/territories/boundaries/*).",
    });
  }

  const {
    name,
    countryCode,
    city,
    territoryType = "neighborhood",
    centerLat,
    centerLng,
    radiusMeters,
    currency = "XOF",
    language = "fr",
    status = "active",
  } = req.body || {};

  const lat = asNumber(centerLat);
  const lng = asNumber(centerLng);
  const radius = asNumber(radiusMeters);

  if (!name || !countryCode || lat === null || lng === null || radius === null) {
    return res.status(400).json({ message: "name, countryCode, centerLat, centerLng, radiusMeters are required" });
  }

  const [created] = await db
    .insert(geoTerritories)
    .values({
      tenantId: tenant.id,
      name,
      countryCode,
      city,
      territoryType,
      centerLat: lat.toString(),
      centerLng: lng.toString(),
      radiusMeters: radius,
      currency,
      language,
      status,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  res.json({ territory: created });
});

router.get("/:id", async (req, res) => {
  const tenant = requireTenant(req, res);
  if (!tenant) return;

  const territoryId = Number(req.params.id);
  if (!Number.isFinite(territoryId)) {
    return res.status(400).json({ message: "Invalid id" });
  }

  const territory = await db.query.geoTerritories.findFirst({
    where: and(eq(geoTerritories.id, territoryId), eq(geoTerritories.tenantId, tenant.id)),
  });

  if (!territory) {
    return res.status(404).json({ message: "Territory not found" });
  }

  const [parent, children] = await Promise.all([
    territory.parentTerritoryId
      ? db.query.geoTerritories.findFirst({
          where: and(eq(geoTerritories.id, territory.parentTerritoryId), eq(geoTerritories.tenantId, tenant.id)),
        })
      : Promise.resolve(null),
    db.query.geoTerritories.findMany({
      where: and(eq(geoTerritories.parentTerritoryId, territoryId), eq(geoTerritories.tenantId, tenant.id)),
      orderBy: asc(geoTerritories.name),
    }),
  ]);

  const [budgets, kpis, leaderboards, referrers, activities, topAgents] = await Promise.all([
    db
      .select()
      .from(territoryBudgets)
      .where(eq(territoryBudgets.territoryId, territoryId))
      .orderBy(desc(territoryBudgets.month))
      .limit(24),
    db
      .select()
      .from(territoryKpis)
      .where(eq(territoryKpis.territoryId, territoryId))
      .orderBy(desc(territoryKpis.month))
      .limit(24),
    db
      .select()
      .from(territoryLeaderboards)
      .where(eq(territoryLeaderboards.territoryId, territoryId))
      .orderBy(desc(territoryLeaderboards.month))
      .limit(12),
    db
      .select()
      .from(referrerProfiles)
      .where(eq(referrerProfiles.territoryId, territoryId))
      .orderBy(desc(referrerProfiles.updatedAt), desc(referrerProfiles.createdAt))
      .limit(50),
    db
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.tenantId, tenant.id),
          eq(auditLogs.entityType, "territory"),
          eq(auditLogs.entityId, territoryId),
        ),
      )
      .orderBy(desc(auditLogs.createdAt))
      .limit(25),
    db
      .select()
      .from(agents)
      .orderBy(desc(agents.updatedAt ?? agents.createdAt))
      .limit(10),
  ]);

  res.json({
    territory,
    budgets,
    kpis,
    leaderboards,
    referrers,
    aiTeam: topAgents.map((a: any) => ({
      id: a.id,
      name: a.name,
      role: a.role,
      status: a.status,
      budget: (a as any).monthlyBudget ?? null,
      performanceScore: (a as any).kpiTargets ? Object.values((a as any).kpiTargets).reduce((acc: number, v: any) => acc + (Number(v) || 0), 0) : null,
    })),
    activity: activities.map((act: any) => ({
      id: act.id,
      action: act.action,
      entityType: act.entityType,
      createdAt: act.createdAt,
    })),
    hierarchy: {
      parent,
      children,
    },
  });
});

router.get("/:id/chat/messages", async (req, res) => {
  const tenant = requireTenant(req, res);
  if (!tenant) return;

  const territoryId = Number(req.params.id);
  if (!Number.isFinite(territoryId)) {
    return res.status(400).json({ message: "Invalid id" });
  }

  const admin = (req as any).adminUser;
  const userId = Number(admin?.id);
  if (!Number.isFinite(userId)) {
    return res.status(401).json({ message: "Authentication required" });
  }

  const limit = Math.min(Math.max(Number(req.query.limit || 60) || 60, 1), 200);

  const messages = await db
    .select()
    .from(eceChatMessages)
    .where(
      and(
        eq(eceChatMessages.tenantId, tenant.id),
        eq(eceChatMessages.userId, userId),
        eq(eceChatMessages.contextType, "territory"),
        eq(eceChatMessages.contextId, territoryId),
      ),
    )
    .orderBy(asc(eceChatMessages.createdAt))
    .limit(limit);

  res.json({
    ok: true,
    territoryId,
    messages: messages.map((m: any) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      createdAt: m.createdAt,
      metadata: m.metadata || {},
    })),
  });
});

router.post("/:id/chat/send", async (req, res) => {
  const tenant = requireTenant(req, res);
  if (!tenant) return;

  const territoryId = Number(req.params.id);
  if (!Number.isFinite(territoryId)) {
    return res.status(400).json({ message: "Invalid id" });
  }

  const admin = (req as any).adminUser;
  const userId = Number(admin?.id);
  if (!Number.isFinite(userId)) {
    return res.status(401).json({ message: "Authentication required" });
  }

  const text = String(req.body?.message || req.body?.content || "").trim();
  if (!text) return res.status(400).json({ message: "message required" });

  const now = new Date();

  const [userMessage] = await db
    .insert(eceChatMessages)
    .values({
      tenantId: tenant.id,
      userId,
      role: "user",
      content: text,
      contextType: "territory",
      contextId: territoryId,
      metadata: {
        requestedRole: "admin",
      },
      createdAt: now,
    })
    .returning();

  const recent = await db
    .select()
    .from(eceChatMessages)
    .where(
      and(
        eq(eceChatMessages.tenantId, tenant.id),
        eq(eceChatMessages.userId, userId),
        eq(eceChatMessages.contextType, "territory"),
        eq(eceChatMessages.contextId, territoryId),
      ),
    )
    .orderBy(desc(eceChatMessages.createdAt))
    .limit(12);

  let assistantText =
    "Territory assistant is offline (AI_DISABLED). Set `AI_ENABLED=true` and configure an AI provider to enable responses.";

  let requestedActions: Array<{ action: string; params?: Record<string, any> }> = inferActionsFromText(text);

  if (isAiEnabled()) {
    try {
      const territory = await db.query.geoTerritories.findFirst({
        where: and(eq(geoTerritories.id, territoryId), eq(geoTerritories.tenantId, tenant.id)),
      });

      const userLabel = admin?.displayName || admin?.email || `admin:${userId}`;
      const territoryLabel = territory?.name ? `${territory.name} (${territory.territoryType || "territory"})` : `Territory ${territoryId}`;

      const prompt = `You are the Chairman's Assistant embedded in the Territory Hub.\n\nTerritory: ${territoryLabel}\nRequest by: ${userLabel}\n\nUser message:\n${text}\n\nYou can propose actions to execute immediately.\n\nReturn JSON only, no Markdown, no extra keys:\n{\n  \"response\": \"<short plan + what you will do>\",\n  \"actions\": [\n    { \"action\": \"territory.audit.kpis\", \"params\": {} },\n    { \"action\": \"territory.audit.navigation\", \"params\": {} },\n    { \"action\": \"territory.marketing.launch\", \"params\": { \"brief\": \"...\" } },\n    { \"action\": \"territory.marketplace.seedProducts\", \"params\": { \"preset\": \"gold|jewelry|produce\", \"count\": 20 } }\n  ]\n}\n\nRules:\n- Only include actions that should run now.\n- Use at most 3 actions.\n- If no actions are needed, return an empty actions array.\n`;

      const ai = await generateAgentResponse(prompt, {
        role:
          "You are the Chairman's Assistant for Exportunity. You help admins operate territories by proposing clear next actions, KPIs, and playbooks.",
        context: {
          recentMessages: recent
            .slice()
            .reverse()
            .map((m: any) => ({
              content: m.content,
              fromAgent: {
                name: m.role === "user" ? userLabel : "Chairman's Assistant",
                role: m.role === "user" ? "admin" : "assistant",
              },
              timestamp: m.createdAt ? new Date(m.createdAt) : new Date(),
            })),
          roomName: territoryLabel,
          roomType: "territory-hub",
        },
      });

      const raw = String(ai?.response || "").trim();
      const parsed = extractFirstJsonObject(raw);
      const responseText = typeof parsed?.response === "string" && parsed.response.trim() ? parsed.response.trim() : raw;
      const aiActions = Array.isArray(parsed?.actions)
        ? parsed.actions
            .map((x: any) => ({ action: String(x?.action || ""), params: typeof x?.params === "object" && x?.params ? x.params : {} }))
            .filter((x: any) => x.action)
        : [];

      requestedActions = uniqueActions([...requestedActions, ...aiActions]).slice(0, 3);
      assistantText = responseText || assistantText;
    } catch (err: any) {
      assistantText = `Territory assistant failed: ${err?.message || "AI_FAILED"}`;
    }
  }

  const executed: any[] = [];
  if (requestedActions.length) {
    for (const item of requestedActions) {
      executed.push(
        await executeTerritoryAction({
          tenantId: tenant.id,
          tenantKey: tenant.key,
          userId: Number.isFinite(userId) ? userId : null,
          territoryId,
          action: item.action,
          params: item.params || {},
          req,
        }),
      );
    }

    const lines: string[] = [];
    lines.push("");
    lines.push("Executed actions:");
    for (const result of executed) {
      const ok = !!result?.ok;
      const label = ok ? "OK" : "FAILED";
      const msg = result?.message ? ` — ${String(result.message)}` : "";
      lines.push(`- ${String(result?.action || "action")}: ${label}${msg}`);
    }
    lines.push("");
    lines.push("Links:");
    lines.push(`- /territories/${territoryId}`);
    lines.push(`- /admin/agents?territoryId=${territoryId}`);

    assistantText = `${assistantText}${lines.join("\n")}`;
  }

  const [assistantMessage] = await db
    .insert(eceChatMessages)
    .values({
      tenantId: tenant.id,
      userId,
      role: "assistant",
      content: assistantText,
      contextType: "territory",
      contextId: territoryId,
      metadata: {
        aiModel: isAiEnabled() ? "auto" : "disabled",
        executedActions: executed,
      },
      createdAt: new Date(),
    })
    .returning();

  res.json({
    ok: true,
    userMessage,
    assistantMessage,
  });
});

router.patch("/:id", async (req, res) => {
  const tenant = requireTenant(req, res);
  if (!tenant) return;

  const territoryId = Number(req.params.id);
  if (!Number.isFinite(territoryId)) {
    return res.status(400).json({ message: "Invalid id" });
  }

  const existing = await db.query.geoTerritories.findFirst({
    where: and(eq(geoTerritories.id, territoryId), eq(geoTerritories.tenantId, tenant.id)),
  });
  if (!existing) {
    return res.status(404).json({ message: "Territory not found" });
  }

  const updates: Record<string, any> = {};
  const allowed = [
    "name",
    "city",
    "territoryType",
    "centerLat",
    "centerLng",
    "radiusMeters",
    "currency",
    "language",
    "status",
  ];

  for (const key of allowed) {
    if (key in (req.body || {})) {
      const val = (req.body as any)[key];
      if (key === "centerLat" || key === "centerLng" || key === "radiusMeters") {
        const num = asNumber(val);
        if (num !== null) updates[key] = num;
      } else if (typeof val === "string" || typeof val === "number") {
        updates[key] = val;
      }
    }
  }

  updates.updatedAt = new Date();

  const [updated] = await db.update(geoTerritories).set(updates).where(eq(geoTerritories.id, territoryId)).returning();
  res.json({ territory: updated });
});

router.post("/:id/budget", async (req, res) => {
  const tenant = requireTenant(req, res);
  if (!tenant) return;

  const territoryId = Number(req.params.id);
  if (!Number.isFinite(territoryId)) {
    return res.status(400).json({ message: "Invalid id" });
  }

  const territory = await db.query.geoTerritories.findFirst({
    where: and(eq(geoTerritories.id, territoryId), eq(geoTerritories.tenantId, tenant.id)),
  });
  if (!territory) {
    return res.status(404).json({ message: "Territory not found" });
  }

  const { month = formatMonth(), fundedAmount, budgetCap, spentAmount, mode } = req.body || {};
  await upsertTerritoryBudget(territoryId, month, {
    fundedAmount: asNumber(fundedAmount) ?? undefined,
    budgetCap: asNumber(budgetCap) ?? undefined,
    spentAmount: asNumber(spentAmount) ?? undefined,
    mode,
  });

  const latest = await db.query.territoryBudgets.findFirst({
    where: and(eq(territoryBudgets.territoryId, territoryId), eq(territoryBudgets.month, month)),
  });

  res.json({ budget: latest });
});

router.post("/:id/operator-contracts", async (req, res) => {
  const tenant = requireTenant(req, res);
  if (!tenant) return;

  const territoryId = Number(req.params.id);
  if (!Number.isFinite(territoryId)) {
    return res.status(400).json({ message: "Invalid id" });
  }

  const territory = await db.query.geoTerritories.findFirst({
    where: and(eq(geoTerritories.id, territoryId), eq(geoTerritories.tenantId, tenant.id)),
  });
  if (!territory) {
    return res.status(404).json({ message: "Territory not found" });
  }

  const {
    operatorUserId,
    month = formatMonth(),
    fundedAmount = 0,
    revenueSharePct = 0,
    disclaimerAcceptedAt = new Date(),
    status = "active",
  } = req.body || {};

  const [created] = await db
    .insert(territoryOperatorContracts)
    .values({
      territoryId,
      operatorUserId,
      month,
      fundedAmount,
      revenueSharePct,
      disclaimerAcceptedAt,
      status,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [territoryOperatorContracts.territoryId, territoryOperatorContracts.month],
      set: {
        operatorUserId,
        fundedAmount,
        revenueSharePct,
        disclaimerAcceptedAt,
        status,
        updatedAt: new Date(),
      },
    })
    .returning();

  res.json({ contract: created });
});

router.post("/assign", async (req, res) => {
  const tenant = requireTenant(req, res);
  if (!tenant) return;

  const { lat, lng, persist = true } = req.body || {};
  const numLat = asNumber(lat);
  const numLng = asNumber(lng);

  if (numLat === null || numLng === null) {
    return res.status(400).json({ message: "lat and lng are required" });
  }

  const nearest = await findNearestTerritory(numLat, numLng, tenant.id);
  const token = req.headers.authorization?.replace("Bearer ", "");
  const user = token ? await verifySession(token) : null;

  if (persist && user && nearest) {
    await db
      .update(eceUsers)
      .set({ primaryTerritoryId: nearest.id, updatedAt: new Date() })
      .where(eq(eceUsers.id, user.id));
  }

  res.json({
    territory: nearest,
    persisted: Boolean(persist && user && nearest),
  });
});

router.post("/recompute/:id?", async (req, res) => {
  const tenant = requireTenant(req, res);
  if (!tenant) return;

  const month = String(req.body?.month || formatMonth());
  const territoryId = req.params.id ? Number(req.params.id) : null;

  const targets = territoryId
    ? await db.query.geoTerritories.findMany({
        where: and(eq(geoTerritories.id, territoryId), eq(geoTerritories.tenantId, tenant.id)),
      })
    : await db.query.geoTerritories.findMany({ where: eq(geoTerritories.tenantId, tenant.id) });

  const ids = targets.map((t) => t.id);
  for (const id of ids) {
    await upsertTerritoryBudget(id, month, {});
    await upsertTerritoryKpi(id, month, {});
  }

  if (ids.length) {
    await db
      .insert(territoryLeaderboards)
      .values(
        ids.map((id) => ({
          territoryId: id,
          month,
          winnerUserId: null,
          winningMetricValue: 0,
          metricType: "platform_fees" as const,
          computedAt: new Date(),
          createdAt: new Date(),
        }))
      )
      .onConflictDoNothing();
  }

  res.json({ recomputed: ids.length, month });
});

export default router;
