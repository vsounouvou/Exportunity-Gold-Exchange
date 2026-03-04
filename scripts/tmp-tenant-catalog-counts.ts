import "../env";
import { sql } from "drizzle-orm";
import { db } from "../db";

async function main() {
  const out = await db.execute(sql`
    select
      t.key as tenant_key,
      t.id as tenant_id,
      (select count(*) from product_categories pc where pc.tenant_id = t.id and pc.is_active = true) as active_categories,
      (select count(*) from sellers s where s.tenant_id = t.id and s.status in ('approved','verified')) as active_sellers,
      (select count(*) from seller_products sp where sp.tenant_id = t.id and sp.status = 'active') as active_products
    from tenants t
    where t.key in ('bdo','exportunity','hoz','met','mindbase','vs','zogueland','rayon1km')
    order by t.key asc
  `);
  console.log(JSON.stringify((out as any)?.rows || [], null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
