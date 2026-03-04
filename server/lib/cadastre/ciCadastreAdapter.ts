import { db } from "@db";
import { and, desc, eq, gte, ilike, inArray, sql } from "drizzle-orm";
import { cadastreSyncRuns, miningSiteReports, miningSites } from "@db/schema";

import { CadastreClient, defaultCiCadastreServiceUrl } from "./cadastreClient";
import { ensureCadastreTables } from "./ensureCadastreTables";
import { normalizeCiCadastreFeature } from "./normalize";

const SUPPORTED_STATUS = ["VERIFIED", "PENDING", "INACTIVE"] as const;
const SUPPORTED_SITE_TYPE = ["ARTISANAL", "SEMI_INDUSTRIAL", "INDUSTRIAL", "UNKNOWN"] as const;
const SUPPORTED_RISK = ["LOW", "MEDIUM", "HIGH"] as const;

function parseNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asText(value: unknown) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function normalizeStatusFilter(raw: string | null | undefined) {
  const values = String(raw || "")
    .split(",")
    .map((entry) => entry.trim().toUpperCase())
    .filter(Boolean);
  const allowed = values.filter((entry) => (SUPPORTED_STATUS as readonly string[]).includes(entry));
  return allowed.length ? (allowed as Array<(typeof SUPPORTED_STATUS)[number]>) : null;
}

function normalizeLayerName(name: string) {
  return String(name || "").toLowerCase();
}

function isMiningLayer(name: string) {
  const normalized = normalizeLayerName(name);
  if (!normalized) return false;
  if (normalized.includes("demande")) return false;
  if (normalized.includes("administration")) return false;
  if (normalized.includes("frontière")) return false;
  return (
    normalized.includes("licence") ||
    normalized.includes("permis") ||
    normalized.includes("concess") ||
    normalized.includes("autorisation") ||
    normalized.includes("ap") ||
    normalized.includes("pr") ||
    normalized.includes("pe") ||
    normalized.includes("ae")
  );
}

export async function runCiCadastreSync(input: {
  tenantId: number;
  sourceMode?: "scrape" | "api" | "manual_import";
  maxLayers?: number;
}) {
  await ensureCadastreTables();

  const sourceMode = input.sourceMode || (String(process.env.CI_CADASTRE_SOURCE_MODE || "api").trim().toLowerCase() as any) || "api";
  const startedAt = new Date();
  const [run] = await db
    .insert(cadastreSyncRuns)
    .values({
      tenantId: input.tenantId,
      sourceMode,
      status: "FAILED",
      recordsFetched: 0,
      recordsUpserted: 0,
      startedAt,
      createdAt: startedAt,
    })
    .returning({ id: cadastreSyncRuns.id });

  if (!run?.id) {
    throw new Error("Failed to create cadastre sync run");
  }

  let recordsFetched = 0;
  let recordsUpserted = 0;
  let errorMessage: string | null = null;
  let runStatus: "SUCCESS" | "PARTIAL" | "FAILED" = "FAILED";

  try {
    if (sourceMode === "manual_import") {
      runStatus = "PARTIAL";
    } else {
      const client = new CadastreClient({
        baseUrl: defaultCiCadastreServiceUrl(),
        apiKey: process.env.CI_CADASTRE_API_KEY || null,
        connectTimeoutMs: 3_000,
        totalTimeoutMs: 25_000,
      });

      const layers = (await client.getLayers())
        .filter((layer) => isMiningLayer(layer.name))
        .sort((left, right) => left.id - right.id)
        .slice(0, Math.max(1, Math.min(input.maxLayers ?? 8, 16)));

      for (const layer of layers) {
        // eslint-disable-next-line no-await-in-loop
        const features = await client.queryLayerFeatures(layer.id, { where: "1=1", resultRecordCount: 2000 });
        recordsFetched += features.length;

        for (const feature of features) {
          const normalized = normalizeCiCadastreFeature({ layerId: layer.id, feature });
          if (!normalized) continue;

          // eslint-disable-next-line no-await-in-loop
          await db.execute(sql`
            insert into mining_sites (
              tenant_id,
              country,
              cadastre_name,
              permit_number,
              region,
              department,
              commune,
              holder_name,
              site_type,
              status,
              risk_level,
              lat,
              lng,
              geometry_json,
              source,
              source_ref,
              updated_at
            )
            values (
              ${input.tenantId},
              'CI',
              ${normalized.cadastreName},
              ${normalized.permitNumber},
              ${normalized.region},
              ${normalized.department},
              ${normalized.commune},
              ${normalized.holderName},
              ${normalized.siteType},
              ${normalized.status},
              ${normalized.riskLevel},
              ${normalized.lat},
              ${normalized.lng},
              ${normalized.geometryJson ? JSON.stringify(normalized.geometryJson) : null}::jsonb,
              'OFFICIAL_CADASTRE',
              ${normalized.sourceRef},
              now()
            )
            on conflict (tenant_id, country, permit_number)
            do update set
              cadastre_name = excluded.cadastre_name,
              region = excluded.region,
              department = excluded.department,
              commune = excluded.commune,
              holder_name = excluded.holder_name,
              site_type = excluded.site_type,
              status = excluded.status,
              risk_level = excluded.risk_level,
              lat = excluded.lat,
              lng = excluded.lng,
              geometry_json = excluded.geometry_json,
              source = excluded.source,
              source_ref = excluded.source_ref,
              updated_at = now();
          `);
          recordsUpserted += 1;
        }
      }

      runStatus = recordsUpserted > 0 ? "SUCCESS" : "PARTIAL";
    }
  } catch (error: any) {
    errorMessage = String(error?.message || error || "cadastre_sync_failed").slice(0, 1000);
    runStatus = recordsUpserted > 0 ? "PARTIAL" : "FAILED";
  }

  await db
    .update(cadastreSyncRuns)
    .set({
      status: runStatus,
      recordsFetched,
      recordsUpserted,
      errorMessage,
      finishedAt: new Date(),
    })
    .where(eq(cadastreSyncRuns.id, run.id));

  return {
    runId: run.id,
    status: runStatus,
    recordsFetched,
    recordsUpserted,
    errorMessage,
  };
}

export async function getCadastreMapRows(input: {
  tenantId: number;
  country?: string;
  region?: string | null;
  q?: string | null;
  statuses?: string | null;
  limit?: number;
}) {
  await ensureCadastreTables();
  const country = String(input.country || "CI").trim() || "CI";
  const region = asText(input.region);
  const q = asText(input.q);
  const statusFilter = normalizeStatusFilter(input.statuses);
  const limit = Math.max(1, Math.min(Number(input.limit || 500), 2000));

  const conditions: any[] = [eq(miningSites.tenantId, input.tenantId), eq(miningSites.country, country)];
  if (region) conditions.push(ilike(miningSites.region, `%${region}%`) as any);
  if (q) {
    conditions.push(
      sql`(${miningSites.cadastreName} ilike ${`%${q}%`} or coalesce(${miningSites.permitNumber}, '') ilike ${`%${q}%`})`,
    );
  }
  if (statusFilter?.length) {
    conditions.push(inArray(miningSites.status, statusFilter as any));
  }

  const productionWindow = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({
      id: miningSites.id,
      cadastreName: miningSites.cadastreName,
      permitNumber: miningSites.permitNumber,
      region: miningSites.region,
      status: miningSites.status,
      siteType: miningSites.siteType,
      riskLevel: miningSites.riskLevel,
      lat: miningSites.lat,
      lng: miningSites.lng,
      geometryJson: miningSites.geometryJson,
      sourceRef: miningSites.sourceRef,
      production30dG: sql<string>`coalesce(sum(case when ${miningSiteReports.reportDate} >= ${productionWindow} then ${miningSiteReports.productionG} else 0 end), 0)::text`,
      lastReportDate: sql<string | null>`max(${miningSiteReports.reportDate})`,
    })
    .from(miningSites)
    .leftJoin(
      miningSiteReports,
      and(eq(miningSiteReports.miningSiteId, miningSites.id), eq(miningSiteReports.tenantId, input.tenantId)),
    )
    .where(and(...conditions))
    .groupBy(miningSites.id)
    .orderBy(desc(miningSites.updatedAt), miningSites.cadastreName)
    .limit(limit);

  return rows.map((row) => ({
    id: row.id,
    cadastreName: row.cadastreName,
    permitNumber: row.permitNumber,
    region: row.region,
    status: row.status,
    siteType: row.siteType,
    riskLevel: row.riskLevel,
    lat: parseNumber(row.lat),
    lng: parseNumber(row.lng),
    geometry: row.geometryJson,
    sourceRef: row.sourceRef,
    production30dG: parseNumber(row.production30dG),
    lastReportDate: row.lastReportDate,
  }));
}

