import { db } from "@db";
import {
  geoTerritories,
  territoryBudgets,
  territoryKpis,
  territoryLeaderboards,
  referrerProfiles,
} from "@db/schema/territories";
import { and, desc, eq, inArray, isNull, lt, or } from "drizzle-orm";

export function formatMonth(date: Date = new Date()): string {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + 1;
  return `${y}-${String(m).padStart(2, "0")}`;
}

export function haversineDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const R = 6371e3; // meters
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δφ = toRad(lat2 - lat1);
  const Δλ = toRad(lon2 - lon1);

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) *
    Math.sin(Δλ / 2) * Math.sin(Δλ / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export async function findNearestTerritory(
  lat: number,
  lng: number,
  tenantId: number
) {
  const rows = await db.query.geoTerritories.findMany({
    where: and(eq(geoTerritories.tenantId, tenantId), eq(geoTerritories.status, "active")),
  });

  let best: any = null;
  for (const row of rows) {
    const rowLat = Number((row as any).centerLat);
    const rowLng = Number((row as any).centerLng);
    const radius = Number((row as any).radiusMeters);
    if (!Number.isFinite(rowLat) || !Number.isFinite(rowLng) || !Number.isFinite(radius)) continue;

    const distance = haversineDistanceMeters(lat, lng, rowLat, rowLng);
    if (distance <= radius && (!best || distance < best.distance)) {
      best = { ...row, distance };
    }
  }

  return best;
}

export async function expireInactiveReferrers(days = 90): Promise<number> {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const updates = await db
    .update(referrerProfiles)
    .set({ status: "inactive" })
    .where(
      and(
        orStatus(referrerProfiles.status, ["active"]),
        or(lt(referrerProfiles.lastCheckinAt, cutoff), isNull(referrerProfiles.lastCheckinAt))
      )
    )
    .returning({ id: referrerProfiles.id });

  return updates.length;
}

// Helper to build OR condition for status arrays (drizzle lacks easy helper for enums)
function orStatus(column: any, statuses: string[]) {
  return inArray(column, statuses);
}

export async function upsertTerritoryBudget(territoryId: number, month: string, values: {
  fundedAmount?: number;
  spentAmount?: number;
  budgetCap?: number;
  mode?: "low_power" | "funded";
}) {
  const payload = {
    territoryId,
    month,
    fundedAmount: values.fundedAmount ?? 0,
    spentAmount: values.spentAmount ?? 0,
    budgetCap: values.budgetCap ?? values.fundedAmount ?? 0,
    mode: values.mode ?? "low_power",
    updatedAt: new Date(),
  };

    await db.insert(territoryBudgets)
      .values({ ...payload, createdAt: new Date() })
    .onConflictDoUpdate({
      target: [territoryBudgets.territoryId, territoryBudgets.month],
      set: payload,
    });
}

export async function upsertTerritoryKpi(territoryId: number, month: string, values?: Partial<{
  gmv: number;
  platformFees: number;
  ordersCount: number;
  activeBuyers: number;
  activeSellers: number;
  avgDeliveryTime: number | null;
  disputeRate: number | null;
}>) {
  const disputeRate = values?.disputeRate ?? null;
  const payload = {
    gmv: values?.gmv ?? 0,
    platformFees: values?.platformFees ?? 0,
    ordersCount: values?.ordersCount ?? 0,
    activeBuyers: values?.activeBuyers ?? 0,
    activeSellers: values?.activeSellers ?? 0,
    avgDeliveryTime: values?.avgDeliveryTime ?? null,
    disputeRate: disputeRate === null ? null : disputeRate.toFixed(2),
    updatedAt: new Date(),
  };

  await db.insert(territoryKpis)
    .values({
      territoryId,
      month,
      ...payload,
      createdAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [territoryKpis.territoryId, territoryKpis.month],
      set: payload,
    });
}

export async function computeLeaderboards(month: string, territoryIds: number[]) {
  if (!territoryIds.length) return;
  // Placeholder: pick the most recently active referrer per territory (if any)
  const referrers = await db.query.referrerProfiles.findMany({
    where: inArray(referrerProfiles.territoryId, territoryIds),
    orderBy: [referrerProfiles.territoryId, desc(referrerProfiles.lastCheckinAt)],
  });

  for (const territoryId of territoryIds) {
    const winner = referrers.find((r) => r.territoryId === territoryId);
    await db.insert(territoryLeaderboards)
      .values({
        territoryId,
        month,
        winnerUserId: winner?.userId ?? null,
        winningMetricValue: 0,
        metricType: "platform_fees",
        computedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [territoryLeaderboards.territoryId, territoryLeaderboards.month],
        set: {
          winnerUserId: winner?.userId ?? null,
          winningMetricValue: 0,
          computedAt: new Date(),
        },
      });
  }
}

export async function rollupTerritoryMonth(month: string) {
  const allTerritories = await db.query.geoTerritories.findMany();
  const territoryIds = allTerritories.map((t) => t.id);

  for (const territory of allTerritories) {
    await upsertTerritoryBudget(territory.id, month, {
      mode: (territory as any).status === "active" ? "funded" : "low_power",
    });
    await upsertTerritoryKpi(territory.id, month, {});
  }

  await computeLeaderboards(month, territoryIds);
}

export function startTerritoryJobs() {
  const DAY_MS = 24 * 60 * 60 * 1000;

  // Daily referrer inactivity sweep
  setInterval(() => {
    expireInactiveReferrers().catch((err) =>
      console.warn("[Territories] Referrer expiry failed:", err instanceof Error ? err.message : err)
    );
  }, DAY_MS);

  // Monthly rollup (run daily to keep numbers fresh)
  setInterval(() => {
    const month = formatMonth(new Date());
    rollupTerritoryMonth(month).catch((err) =>
      console.warn("[Territories] Monthly rollup failed:", err instanceof Error ? err.message : err)
    );
  }, DAY_MS);

  // Kick off immediately once at startup to avoid waiting for timers.
  expireInactiveReferrers().catch(() => {});
  rollupTerritoryMonth(formatMonth(new Date())).catch(() => {});
}
