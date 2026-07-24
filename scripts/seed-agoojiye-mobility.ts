import "../env";

import { eq } from "drizzle-orm";

import { db } from "@db";
import { tenants } from "@db/schema";
import { seedAgoojiyeMobility } from "../server/routes/agoojye-mobility";

async function main() {
  const [tenant] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.key, "agoojye")).limit(1);
  if (!tenant) throw new Error("Tenant agoojye not found. Create the tenant before seeding mobility data.");
  await seedAgoojiyeMobility(tenant.id);
  console.log(`[seed:agoojye:mobility] tenant=${tenant.id} complete`);
}

main().then(() => process.exit(0)).catch((error) => {
  console.error("[seed:agoojye:mobility] failed", error instanceof Error ? error.message : error);
  process.exit(1);
});
