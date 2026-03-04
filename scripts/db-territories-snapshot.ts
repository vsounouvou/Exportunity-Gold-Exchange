import "../env";
import { db } from "@db";
import { tenants } from "@db/schema";
import { geoTerritories } from "@db/schema/territories";
import { desc, eq, sql } from "drizzle-orm";

async function main() {
  const allTenants = await db.query.tenants.findMany({ orderBy: desc(tenants.id) });
  for (const tenant of allTenants) {
    const [{ count }] =
      (await db
        .select({ count: sql<number>`count(*)` })
        .from(geoTerritories)
        .where(eq(geoTerritories.tenantId, tenant.id))) ?? [];

    console.log(`tenant ${tenant.key} (id=${tenant.id}): territories=${Number(count || 0)}`);
  }

  console.log("");

  const bdo = await db.query.tenants.findFirst({ where: eq(tenants.key, "bdo") });
  if (!bdo) return;

  const rows = await db.query.geoTerritories.findMany({
    where: eq(geoTerritories.tenantId, bdo.id),
    orderBy: desc(geoTerritories.createdAt),
    limit: 20,
  });
  console.log("Latest BDO territories:");
  for (const row of rows) {
    console.log(
      `- #${row.id} ${row.territoryType} ${row.name} (${row.countryCode}) parent=${row.parentTerritoryId ?? "-"}`,
    );
  }
}

main().catch((err) => {
  console.error("[db-territories-snapshot] Failed:", err);
  process.exit(1);
});

