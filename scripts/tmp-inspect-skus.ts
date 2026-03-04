import { db } from "@db";
import { sql } from "drizzle-orm";
const r = await db.execute(sql`select id, tenant_id, product_id, sku_code, weight_grams, karat, is_active, created_at from stamped_gold_skus where tenant_id=1 order by created_at desc limit 10`);
console.log(JSON.stringify((r as any).rows, null, 2));
process.exit(0);
