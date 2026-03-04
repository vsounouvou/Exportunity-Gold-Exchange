import { Router } from "express";
import { and, asc, desc, eq, ilike, sql } from "drizzle-orm";

import { db } from "@db";
import { productCategories, sellerProducts } from "@db/schema";
import { getTenantConfigByKey } from "../../tenants/index";

const router = Router();

function requireTenant(req: any, res: any) {
  const tenantId = Number(req?.tenant?.id || 0);
  if (!Number.isFinite(tenantId) || tenantId <= 0) {
    res.status(500).json({ message: "Tenant not resolved" });
    return null;
  }
  return tenantId;
}

function toStringArray(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry || "").trim()).filter(Boolean);
  }
  return [];
}

function mapProductDto(row: any) {
  return {
    id: row.id,
    title: row.name,
    subtitle: row.shortDescription || "",
    description: row.description || "",
    price: Number(row.price || 0),
    currency: String(row.currency || "XOF"),
    media: toStringArray(row.images),
    badges: [String(row.status || "").toUpperCase()].filter(Boolean),
    collectionId: row.categoryId || null,
    creatorId: row.sellerId || null,
    tags: toStringArray(row.tags),
    metadata: (row.attributes && typeof row.attributes === "object" ? row.attributes : {}) as Record<string, unknown>,
    tenantId: row.tenantId,
    status: row.status,
    slug: row.slug,
  };
}

function resolveMarketTypeFilterSql(tenantKey: string | undefined | null) {
  const marketType = getTenantConfigByKey(tenantKey)?.storefrontMarketType || "ALL";
  if (marketType === "ALL") return undefined;
  return sql`upper(coalesce(seller_products.attributes->>'marketType', seller_products.attributes->>'market_type', '')) = ${marketType}`;
}

router.get("/products", async (req: any, res) => {
  try {
    const tenantId = requireTenant(req, res);
    if (!tenantId) return;

    const limitRaw = Number(req.query?.limit || 60);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(200, Math.trunc(limitRaw))) : 60;
    const q = String(req.query?.q || "").trim();
    const marketTypeFilter = resolveMarketTypeFilterSql(req?.tenant?.key);

    const where = and(
      eq(sellerProducts.tenantId, tenantId),
      eq(sellerProducts.status, "active" as any),
      q ? ilike(sellerProducts.name, `%${q}%`) : undefined,
      marketTypeFilter,
    );

    const rows = await db
      .select()
      .from(sellerProducts)
      .where(where)
      .orderBy(desc(sellerProducts.updatedAt), desc(sellerProducts.id))
      .limit(limit);

    res.json({
      ok: true,
      tenantId,
      items: rows.map(mapProductDto),
    });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to load products" });
  }
});

router.get("/product/:slug", async (req: any, res) => {
  try {
    const tenantId = requireTenant(req, res);
    if (!tenantId) return;

    const slug = String(req.params?.slug || "").trim();
    if (!slug) return res.status(400).json({ message: "slug is required" });
    const marketTypeFilter = resolveMarketTypeFilterSql(req?.tenant?.key);

    const row = await db.query.sellerProducts.findFirst({
      where: and(eq(sellerProducts.tenantId, tenantId), eq(sellerProducts.slug, slug), marketTypeFilter),
    });

    if (!row) return res.status(404).json({ message: "Product not found" });

    return res.json({ ok: true, item: mapProductDto(row) });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to load product" });
  }
});

router.get("/collections", async (req: any, res) => {
  try {
    const tenantId = requireTenant(req, res);
    if (!tenantId) return;

    const rows = await db
      .select({
        id: productCategories.id,
        name: productCategories.name,
        slug: productCategories.slug,
        description: productCategories.description,
        sortOrder: productCategories.sortOrder,
      })
      .from(productCategories)
      .where(and(eq(productCategories.tenantId, tenantId), eq(productCategories.isActive, true)))
      .orderBy(asc(productCategories.sortOrder), asc(productCategories.name));

    res.json({ ok: true, tenantId, items: rows });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to load collections" });
  }
});

router.get("/collections/:slug", async (req: any, res) => {
  try {
    const tenantId = requireTenant(req, res);
    if (!tenantId) return;

    const slug = String(req.params?.slug || "").trim();
    if (!slug) return res.status(400).json({ message: "slug is required" });
    const marketTypeFilter = resolveMarketTypeFilterSql(req?.tenant?.key);

    const category = await db.query.productCategories.findFirst({
      where: and(eq(productCategories.tenantId, tenantId), eq(productCategories.slug, slug)),
    });

    if (!category) return res.status(404).json({ message: "Collection not found" });

    const products = await db
      .select()
      .from(sellerProducts)
      .where(
        and(
          eq(sellerProducts.tenantId, tenantId),
          eq(sellerProducts.categoryId, category.id),
          eq(sellerProducts.status, "active" as any),
          marketTypeFilter,
        ),
      )
      .orderBy(desc(sellerProducts.updatedAt), desc(sellerProducts.id))
      .limit(120);

    return res.json({
      ok: true,
      collection: {
        id: category.id,
        name: category.name,
        slug: category.slug,
        description: category.description,
      },
      items: products.map(mapProductDto),
    });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to load collection" });
  }
});

router.get("/health", async (req: any, res) => {
  try {
    const tenantId = requireTenant(req, res);
    if (!tenantId) return;

    const counters = await db.execute(sql`
      select
        (select count(*)::int from product_categories where tenant_id = ${tenantId}) as categories,
        (select count(*)::int from seller_products where tenant_id = ${tenantId}) as products
    `);

    const row = (counters as any)?.rows?.[0] || { categories: 0, products: 0 };
    res.json({ ok: true, tenantId, categories: Number(row.categories || 0), products: Number(row.products || 0) });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Store health failed" });
  }
});

export default router;
