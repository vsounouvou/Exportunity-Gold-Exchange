import { Router } from "express";
import { sql } from "drizzle-orm";

import { db } from "@db";
import { getTenantConfigByKey } from "../../tenants/index";

const router = Router();

router.get("/tenant-summary", async (req: any, res) => {
  try {
    const tenant = req?.tenant;
    const tenantId = Number(tenant?.id || 0);
    if (!Number.isFinite(tenantId) || tenantId <= 0) {
      return res.status(500).json({ ok: false, message: "Tenant not resolved" });
    }

    const tenantKey = String(tenant?.key || "");
    const config = getTenantConfigByKey(tenantKey);
    const counts = await db.execute(sql`
      select
        (select count(*)::int from product_categories where tenant_id = ${tenantId}) as categories,
        (select count(*)::int from seller_products where tenant_id = ${tenantId}) as products
    `);
    const row = (counts as any)?.rows?.[0] || {};

    return res.json({
      ok: true,
      tenantSlug: tenantKey,
      tenantId,
      brandName: config?.brandName || tenant?.name || tenantKey,
      homeMode: config?.homeMode || "platform",
      homeRedirectTo: config?.homeRedirectTo || "/store",
      storefrontMarketType: config?.storefrontMarketType || "ALL",
      modulesEnabled: config?.modulesEnabled || [],
      modulesDisabled: config?.modulesDisabled || [],
      productCount: Number(row.products || 0),
      collectionCount: Number(row.categories || 0),
    });
  } catch (error: any) {
    return res.status(500).json({ ok: false, message: error?.message || "Failed to load tenant summary" });
  }
});

export default router;
