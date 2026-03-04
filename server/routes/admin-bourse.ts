import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { db } from "@db";
import { productCategories, sellerProducts, sellers } from "@db/schema";
import { ensureTenantAdmin } from "./utils/auth";
import {
  computeAvailableThisWeekKg,
  computeDefaultAvgWeeklyOutputKg,
  ensureMineQuantityColumns,
  inferMineTypeFromText,
  type MineType,
} from "../lib/bdo/mine-quantities";

const router = Router();

router.use(ensureTenantAdmin);

function toNumber(value: unknown): number | null {
  const n = typeof value === "number" ? value : parseFloat(String(value ?? ""));
  return Number.isFinite(n) ? n : null;
}

router.post("/mines/backfill-realistic-quantities", async (req: any, res) => {
  try {
    const tenant = req.tenant;
    if (!tenant) return res.status(400).json({ message: "tenant required" });
    const tenantId = tenant.id;

    await ensureMineQuantityColumns();

    const doreCategory = await db.query.productCategories.findFirst({
      where: and(eq(productCategories.tenantId, tenantId), eq(productCategories.slug, "dore")),
    });

    const mineSellers = await db
      .select()
      .from(sellers)
      .where(and(eq(sellers.tenantId, tenantId), eq(sellers.productionType, "gold_mining")));

    let sellersUpdated = 0;
    let productsUpdated = 0;

    for (const mine of mineSellers) {
      const mineType: MineType = (mine.mineType as MineType) || inferMineTypeFromText(mine.description);
      const existingAvg = toNumber(mine.avgWeeklyOutputKg);
      const avgWeeklyOutputKg = existingAvg ?? computeDefaultAvgWeeklyOutputKg(Number(mine.id), mineType);

      const existingAvail = toNumber(mine.availableThisWeekKg);
      const availableThisWeekKg = existingAvail ?? computeAvailableThisWeekKg(Number(mine.id) + 1337, mineType, avgWeeklyOutputKg);

      const needsSellerUpdate =
        !mine.mineType ||
        mine.avgWeeklyOutputKg == null ||
        mine.availableThisWeekKg == null ||
        mine.mineLastUpdatedAt == null;

      if (needsSellerUpdate) {
        await db
          .update(sellers)
          .set({
            mineType,
            avgWeeklyOutputKg: avgWeeklyOutputKg.toFixed(3),
            availableThisWeekKg: availableThisWeekKg.toFixed(3),
            mineLastUpdatedAt: new Date(),
            updatedAt: new Date(),
          } as any)
          .where(eq(sellers.id, mine.id));
        sellersUpdated += 1;
      }

      if (!doreCategory) continue;

      const products = await db
        .select({ id: sellerProducts.id, stockQuantity: sellerProducts.stockQuantity })
        .from(sellerProducts)
        .where(
          and(
            eq(sellerProducts.tenantId, tenantId),
            eq(sellerProducts.sellerId, mine.id),
            eq(sellerProducts.status, "active"),
            eq(sellerProducts.categoryId, doreCategory.id),
          ),
        );

      if (!products.length) continue;

      const totalStockG = products.reduce((sum, p) => sum + (p.stockQuantity || 0), 0);
      if (totalStockG <= 5000) continue;

      const targetTotalG = Math.max(0, Math.round(availableThisWeekKg * 1000));
      const per = Math.floor(targetTotalG / products.length);
      let remainder = targetTotalG - per * products.length;

      for (const p of products) {
        const next = per + (remainder > 0 ? 1 : 0);
        remainder = Math.max(0, remainder - 1);
        await db
          .update(sellerProducts)
          .set({ stockQuantity: next, updatedAt: new Date() })
          .where(and(eq(sellerProducts.id, p.id), eq(sellerProducts.tenantId, tenantId)));
        productsUpdated += 1;
      }
    }

    return res.json({
      ok: true,
      tenantKey: tenant.key,
      scanned: mineSellers.length,
      sellersUpdated,
      productsUpdated,
    });
  } catch (err: any) {
    return res.status(500).json({ message: err?.message || "backfill failed" });
  }
});

export default router;

