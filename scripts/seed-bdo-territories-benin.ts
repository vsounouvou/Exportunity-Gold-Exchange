import { and, eq } from "drizzle-orm";
import { db } from "@db";
import { geoTerritories, territoryBudgets, territoryKpis } from "@db/schema/territories";
import { tenants } from "@db/schema";

function truthyEnv(value: unknown) {
  return ["1", "true", "yes", "y", "on"].includes(String(value || "").trim().toLowerCase());
}

function getArgValue(flag: string) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

function formatMonth(date: Date = new Date()): string {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + 1;
  return `${y}-${String(m).padStart(2, "0")}`;
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJsonWithTimeout(url: string, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "ExportunityTerritorySeed/1.0 (seed-benin-bdo)",
        "Accept-Language": "en",
      },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status} ${text}`.trim());
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

function pickByTerritoryType(items: any[], territoryType: "country" | "region" | "city") {
  const addresstypeFor = (type: string) => {
    if (type === "country") return ["country"];
    if (type === "region") return ["state", "region", "province", "state_district", "department"];
    if (type === "city") return ["city", "town"];
    return [];
  };

  const desired = new Set(addresstypeFor(territoryType));
  const match = items.find((x) => desired.has(String(x?.addresstype || "").toLowerCase()));
  return match ?? items[0] ?? null;
}

async function nominatimLookup(osmRef: string) {
  const url = new URL("https://nominatim.openstreetmap.org/lookup");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("osm_ids", osmRef);
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("polygon_geojson", "1");
  url.searchParams.set("extratags", "1");
  const data = (await fetchJsonWithTimeout(url.toString(), 20_000)) as any[];
  return Array.isArray(data) ? data[0] : null;
}

async function nominatimSearch(args: { q: string; countryCode?: string; territoryType: "country" | "region" | "city" }) {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("q", args.q);
  url.searchParams.set("limit", "10");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("polygon_geojson", "1");
  url.searchParams.set("extratags", "1");
  if (args.countryCode) url.searchParams.set("countrycodes", args.countryCode.toLowerCase());

  const data = (await fetchJsonWithTimeout(url.toString(), 20_000)) as any[];
  const items = Array.isArray(data) ? data : [];
  const picked = pickByTerritoryType(items, args.territoryType);
  if (!picked) {
    throw new Error(`Nominatim returned 0 results for query: ${args.q}`);
  }

  const prefix = osmPrefixForType(picked?.osm_type);
  const osmId = Number(picked?.osm_id);
  const osmRef = prefix && Number.isFinite(osmId) ? `${prefix}${Math.trunc(osmId)}` : null;
  if (!osmRef) throw new Error(`Unable to determine OSM ref for query: ${args.q}`);

  const lookedUp = await nominatimLookup(osmRef);
  if (!lookedUp) throw new Error(`Nominatim lookup returned 0 results for ${osmRef} (${args.q})`);

  const bbox = bboxFromNominatim(lookedUp?.boundingbox ?? picked?.boundingbox);
  const center = {
    lat: Number(lookedUp?.lat ?? picked?.lat),
    lng: Number(lookedUp?.lon ?? picked?.lon),
  };
  if (!Number.isFinite(center.lat) || !Number.isFinite(center.lng)) {
    throw new Error(`Invalid center from Nominatim for query: ${args.q}`);
  }

  const radiusMeters = estimateRadiusMetersFromBbox(bbox, center);
  const geometry = lookedUp?.geojson;
  const geometryType = String(geometry?.type || "");
  if (geometryType !== "Polygon" && geometryType !== "MultiPolygon") {
    throw new Error(`Nominatim did not return a polygon for ${args.q} (${osmRef})`);
  }

  const name =
    typeof picked?.name === "string" && picked.name.trim()
      ? picked.name.trim()
      : typeof picked?.display_name === "string" && picked.display_name.trim()
        ? picked.display_name.split(",")[0].trim()
        : args.q;

  return {
    osmRef,
    bbox,
    center,
    radiusMeters,
    geometry,
    name,
    addressCountryCode:
      typeof lookedUp?.address?.country_code === "string" ? lookedUp.address.country_code.toUpperCase() : null,
  };
}

async function resolveTenantId(tenantKey: string) {
  const tenant = await db.query.tenants.findFirst({ where: eq(tenants.key, tenantKey) });
  if (!tenant) throw new Error(`Tenant not found: ${tenantKey}`);
  return tenant.id;
}

async function upsertTerritory(args: {
  tenantId: number;
  territoryType: "country" | "region" | "city" | "neighborhood";
  name: string;
  countryCode: string;
  city: string | null;
  parentTerritoryId: number | null;
  geometryGeojson: any;
  bbox: [number, number, number, number] | null;
  center: { lat: number; lng: number };
  radiusMeters: number;
  source: string;
  sourceRef: string;
  apply: boolean;
}) {
  const existing = await db.query.geoTerritories.findFirst({
    where: and(eq(geoTerritories.tenantId, args.tenantId), eq(geoTerritories.source, args.source), eq(geoTerritories.sourceRef, args.sourceRef)),
  });

  const now = new Date();
  const payload: Record<string, any> = {
    tenantId: args.tenantId,
    parentTerritoryId: args.parentTerritoryId,
    name: args.name,
    countryCode: args.countryCode,
    city: args.city,
    territoryType: args.territoryType,
    geometryType: String(args.geometryGeojson?.type || "Polygon"),
    geometryGeojson: args.geometryGeojson,
    bbox: args.bbox,
    source: args.source,
    sourceRef: args.sourceRef,
    sourceVersion: now.toISOString().slice(0, 10),
    confidence: args.source === "OSM" ? 80 : 60,
    centerLat: String(args.center.lat),
    centerLng: String(args.center.lng),
    radiusMeters: args.radiusMeters,
    currency: "XOF",
    language: "fr",
    status: "active",
    updatedAt: now,
  };

  if (!args.apply) {
    console.log(`[dry-run] would upsert territory: ${args.territoryType} ${args.name} (${args.sourceRef})`);
    return { id: existing?.id ?? -1, created: false };
  }

  if (existing) {
    const [updated] = await db.update(geoTerritories).set(payload).where(eq(geoTerritories.id, existing.id)).returning();
    return { id: updated?.id ?? existing.id, created: false };
  }

  const [created] = await db
    .insert(geoTerritories)
    .values({
      ...(payload as any),
      createdAt: now,
    })
    .returning();
  return { id: created?.id ?? null, created: true };
}

async function ensureMonthRows(territoryId: number, month: string, apply: boolean) {
  if (!apply) return;

  await db
    .insert(territoryBudgets)
    .values({
      territoryId,
      month,
      fundedAmount: 0,
      spentAmount: 0,
      budgetCap: 0,
      mode: "low_power",
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoNothing();

  await db
    .insert(territoryKpis)
    .values({
      territoryId,
      month,
      gmv: 0,
      platformFees: 0,
      ordersCount: 0,
      activeBuyers: 0,
      activeSellers: 0,
      avgDeliveryTime: null,
      disputeRate: null,
      createdAt: new Date(),
    })
    .onConflictDoNothing();
}

async function main() {
  const apply = process.argv.includes("--apply");
  if (apply && !truthyEnv(process.env.ALLOW_TERRITORY_SEED)) {
    console.error("[seed-bdo-territories-benin] Refusing to run in apply mode. Set ALLOW_TERRITORY_SEED=true to proceed.");
    process.exit(1);
  }

  const isProd = String(process.env.NODE_ENV || "").trim().toLowerCase() === "production";
  const allowProd = process.argv.includes("--allow-production");
  if (apply && isProd && !allowProd) {
    console.error("[seed-bdo-territories-benin] Refusing to run with NODE_ENV=production. Add --allow-production if you really intend this.");
    process.exit(1);
  }

  const tenantKey = String(getArgValue("--tenant") || process.env.SEED_TENANT_KEY || "bdo")
    .trim()
    .toLowerCase();
  const tenantId = await resolveTenantId(tenantKey);

  const month = formatMonth(new Date());

  // Remove legacy synthetic/circle neighborhoods from older seeds (no longer allowed).
  const legacySeedWhere = and(
    eq(geoTerritories.tenantId, tenantId),
    eq(geoTerritories.source, "SEED"),
    eq(geoTerritories.countryCode, "BJ"),
    eq(geoTerritories.city, "Cotonou"),
    eq(geoTerritories.territoryType, "neighborhood" as any),
  );
  const legacySeeded = await db.query.geoTerritories.findMany({ where: legacySeedWhere });
  if (legacySeeded.length) {
    console.log(
      `[seed-bdo-territories-benin] Found ${legacySeeded.length} legacy seeded neighborhoods (source=SEED). ${apply ? "Deleting..." : "Dry-run: not deleting."}`,
    );
    if (apply) {
      await db.delete(geoTerritories).where(legacySeedWhere);
    }
  }

  // 1) OSM administrative boundaries (country/region/city)
  console.log(`[seed-bdo-territories-benin] Nominatim: importing admin boundaries for tenant '${tenantKey}'...`);

  const benin = await nominatimSearch({ q: "Benin", territoryType: "country" });
  if (benin.addressCountryCode && benin.addressCountryCode !== "BJ") {
    console.warn(`[seed-bdo-territories-benin] Warning: expected BJ, got ${benin.addressCountryCode} for Benin boundary.`);
  }

  const beninRes = await upsertTerritory({
    tenantId,
    territoryType: "country",
    name: "Benin",
    countryCode: "BJ",
    city: null,
    parentTerritoryId: null,
    geometryGeojson: benin.geometry,
    bbox: benin.bbox,
    center: benin.center,
    radiusMeters: Math.max(benin.radiusMeters, 50_000),
    source: "OSM",
    sourceRef: benin.osmRef,
    apply,
  });
  if (!beninRes.id) throw new Error("Failed to upsert Benin territory");
  await ensureMonthRows(beninRes.id, month, apply);
  await sleep(1000);

  const littoral = await nominatimSearch({
    q: "Littoral Department, Benin",
    countryCode: "BJ",
    territoryType: "region",
  });

  const littoralRes = await upsertTerritory({
    tenantId,
    territoryType: "region",
    name: "Littoral",
    countryCode: "BJ",
    city: null,
    parentTerritoryId: beninRes.id,
    geometryGeojson: littoral.geometry,
    bbox: littoral.bbox,
    center: littoral.center,
    radiusMeters: Math.max(littoral.radiusMeters, 15_000),
    source: "OSM",
    sourceRef: littoral.osmRef,
    apply,
  });
  if (!littoralRes.id) throw new Error("Failed to upsert Littoral territory");
  await ensureMonthRows(littoralRes.id, month, apply);
  await sleep(1000);

  const cotonou = await nominatimSearch({
    q: "Cotonou, Benin",
    countryCode: "BJ",
    territoryType: "city",
  });

  const cotonouRadius = Math.max(cotonou.radiusMeters, 12_000);
  const cotonouRes = await upsertTerritory({
    tenantId,
    territoryType: "city",
    name: "Cotonou",
    countryCode: "BJ",
    city: "Cotonou",
    parentTerritoryId: littoralRes.id,
    geometryGeojson: cotonou.geometry,
    bbox: cotonou.bbox,
    center: cotonou.center,
    radiusMeters: cotonouRadius,
    source: "OSM",
    sourceRef: cotonou.osmRef,
    apply,
  });
  if (!cotonouRes.id) throw new Error("Failed to upsert Cotonou territory");
  await ensureMonthRows(cotonouRes.id, month, apply);

  console.log(
    [
      "",
      "[seed-bdo-territories-benin] Done.",
      `- mode: ${apply ? "apply" : "dry-run"}`,
      `- tenant: ${tenantKey} (id=${tenantId})`,
      "",
      apply ? "Open /territories and click Benin → Littoral → Cotonou." : "Re-run with --apply to write to DB.",
      "",
    ].join("\n"),
  );
}

main().catch((err) => {
  console.error("[seed-bdo-territories-benin] Failed:", err);
  process.exit(1);
});
