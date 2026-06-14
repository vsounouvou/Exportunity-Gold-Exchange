import { db } from "@db";
import { lbmaPriceCache } from "@db/schema";
import { desc, sql } from "drizzle-orm";

type LbmaPriceCacheInsert = typeof lbmaPriceCache.$inferInsert;

function getDbErrorCode(error: unknown) {
  const value = error as { code?: unknown; cause?: { code?: unknown } };
  return String(value?.code || value?.cause?.code || "");
}

async function getLatestLbmaPriceCacheRow() {
  return db.query.lbmaPriceCache.findFirst({
    orderBy: desc(lbmaPriceCache.fetchedAt),
  });
}

async function syncLbmaPriceCacheSequence() {
  await db.execute(sql`
    SELECT setval(
      pg_get_serial_sequence('lbma_price_cache', 'id'),
      GREATEST(COALESCE((SELECT MAX(id) FROM lbma_price_cache), 0) + 1, 1),
      false
    )
  `);
}

export async function insertLbmaPriceCacheRow(values: LbmaPriceCacheInsert) {
  try {
    const [row] = await db.insert(lbmaPriceCache).values(values).returning();
    return row ?? null;
  } catch (error) {
    if (getDbErrorCode(error) !== "23505") throw error;

    await syncLbmaPriceCacheSequence();

    try {
      const [row] = await db.insert(lbmaPriceCache).values(values).returning();
      return row ?? null;
    } catch (retryError) {
      if (getDbErrorCode(retryError) !== "23505") throw retryError;
      return getLatestLbmaPriceCacheRow();
    }
  }
}
