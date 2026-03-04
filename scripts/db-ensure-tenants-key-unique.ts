import "../env";
import { db } from "@db";
import { tenants } from "@db/schema";
import { sql } from "drizzle-orm";

async function main() {
  const dupes = await db
    .select({
      key: tenants.key,
      count: sql<number>`count(*)`,
    })
    .from(tenants)
    .groupBy(tenants.key)
    .having(sql`count(*) > 1`);

  if (dupes.length > 0) {
    console.error("[db-ensure-tenants-key-unique] Duplicate tenant keys detected:");
    for (const row of dupes) {
      console.error(`- ${row.key}: ${Number(row.count || 0)}`);
    }
    process.exit(1);
  }

  await db.execute(sql`
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tenants_key_unique'
  ) THEN
    ALTER TABLE tenants ADD CONSTRAINT tenants_key_unique UNIQUE ("key");
  END IF;
END $$;
  `);

  console.log("[db-ensure-tenants-key-unique] OK");
}

main().catch((err) => {
  console.error("[db-ensure-tenants-key-unique] Failed:", err);
  process.exit(1);
});

