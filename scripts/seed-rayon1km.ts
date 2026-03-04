import { and, eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";

import { db } from "@db";
import { productCategories, sellerProducts, sellers, tenants, users } from "@db/schema";

const TARGET_TENANT_KEY = "rayon1km";
const SOURCE_TENANT_KEY = "exportunity";
const MAX_PRODUCTS = 40;

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "")
    .slice(0, 120);
}

async function ensureTenant(key: string) {
  const tenant = await db.query.tenants.findFirst({ where: eq(tenants.key, key as any) });
  if (!tenant) throw new Error(`Tenant ${key} not found`);
  return tenant;
}

async function ensureOwnerUser() {
  const email = "admin@rayon1km.com";
  const existing = await db.query.users.findFirst({ where: eq(users.email, email as any) });
  if (existing) return existing;
  const inserted = await db
    .insert(users)
    .values({
      displayName: "Rayon 1km Admin",
      email,
      role: "admin",
      accountType: "Platform",
      language: "fr",
      timezone: "UTC",
    } as any)
    .returning();
  return inserted[0];
}

async function upsertCategories(input: { targetTenantId: number; sourceTenantId: number }) {
  const sourceRows = await db.query.productCategories.findMany({
    where: eq(productCategories.tenantId, input.sourceTenantId),
    orderBy: (table, { asc }) => [asc(table.sortOrder), asc(table.id)],
  });

  const fallback = [
    { name: "Nearby Groceries", slug: "nearby-groceries" },
    { name: "Nearby Services", slug: "nearby-services" },
    { name: "Nearby Beauty", slug: "nearby-beauty" },
    { name: "Nearby Home", slug: "nearby-home" },
    { name: "Nearby Mobility", slug: "nearby-mobility" },
  ];

  const sourceLike =
    sourceRows.length > 0
      ? sourceRows.map((row) => ({
          sourceId: row.id,
          name: row.name,
          slug: row.slug,
          description: row.description || "",
          sortOrder: Number(row.sortOrder || 0),
        }))
      : fallback.map((row, idx) => ({
          sourceId: 0,
          name: row.name,
          slug: row.slug,
          description: `${row.name} category for Rayon 1km`,
          sortOrder: idx,
        }));

  const categoryMap = new Map<number, number>();

  for (const item of sourceLike) {
    const slug = `rayon1km-${slugify(item.slug || item.name)}`.slice(0, 100);
    const existing = await db.query.productCategories.findFirst({
      where: and(eq(productCategories.tenantId, input.targetTenantId), eq(productCategories.slug, slug)),
    });

    if (existing) {
      categoryMap.set(item.sourceId, existing.id);
      continue;
    }

    const inserted = await db
      .insert(productCategories)
      .values({
        tenantId: input.targetTenantId,
        name: item.name,
        slug,
        description: item.description || `${item.name} category for Rayon 1km`,
        sortOrder: item.sortOrder,
        isActive: true,
      } as any)
      .returning();

    categoryMap.set(item.sourceId, inserted[0].id);
  }

  return categoryMap;
}

async function cloneSellers(input: {
  sourceTenantId: number;
  targetTenantId: number;
  ownerUserId: number;
  sourceSellerIds: number[];
}) {
  if (input.sourceSellerIds.length === 0) return new Map<number, number>();

  const sourceRows = await db.query.sellers.findMany({
    where: and(eq(sellers.tenantId, input.sourceTenantId), inArray(sellers.id, input.sourceSellerIds)),
  });

  const map = new Map<number, number>();

  for (const source of sourceRows) {
    const cloneSlug = `rayon1km-${slugify(source.slug || source.shopName || `seller-${source.id}`)}`.slice(0, 190);
    const existing = await db.query.sellers.findFirst({
      where: and(eq(sellers.tenantId, input.targetTenantId), eq(sellers.slug, cloneSlug)),
    });
    if (existing) {
      map.set(source.id, existing.id);
      continue;
    }

    const inserted = await db
      .insert(sellers)
      .values({
        tenantId: input.targetTenantId,
        userId: input.ownerUserId,
        shopName: source.shopName,
        slug: cloneSlug,
        description: source.description,
        sellerType: source.sellerType,
        streetAddress: source.streetAddress,
        latitude: source.latitude,
        longitude: source.longitude,
        status: "approved",
        isProducer: true,
        isDemo: true,
      } as any)
      .returning();

    map.set(source.id, inserted[0].id);
  }

  return map;
}

async function cloneProducts(input: {
  sourceTenantId: number;
  targetTenantId: number;
  sellerMap: Map<number, number>;
  categoryMap: Map<number, number>;
}) {
  const sourceRows = await db.query.sellerProducts.findMany({
    where: and(eq(sellerProducts.tenantId, input.sourceTenantId), eq(sellerProducts.status, "active" as any)),
    orderBy: (table, { desc }) => [desc(table.updatedAt), desc(table.id)],
    limit: MAX_PRODUCTS,
  });

  let created = 0;
  let skipped = 0;

  for (const source of sourceRows) {
    const sellerId = input.sellerMap.get(Number(source.sellerId || 0));
    if (!sellerId) {
      skipped += 1;
      continue;
    }

    const baseSlug = `rayon1km-${slugify(source.slug || source.name)}`.slice(0, 180);
    const existing = await db.query.sellerProducts.findFirst({
      where: and(eq(sellerProducts.tenantId, input.targetTenantId), eq(sellerProducts.slug, baseSlug)),
    });
    if (existing) {
      skipped += 1;
      continue;
    }

    const categoryId = input.categoryMap.get(Number(source.categoryId || 0)) ?? null;
    const sourceAttributes =
      source.attributes && typeof source.attributes === "object" && !Array.isArray(source.attributes)
        ? (source.attributes as Record<string, unknown>)
        : {};

    await db.insert(sellerProducts).values({
      tenantId: input.targetTenantId,
      sellerId,
      categoryId,
      name: source.name,
      slug: baseSlug,
      description: source.description,
      shortDescription: source.shortDescription,
      price: source.price,
      currency: source.currency || "XOF",
      stockQuantity: Math.max(100, Number(source.stockQuantity || 0)),
      status: "active",
      images: Array.isArray(source.images) ? source.images : [],
      tags: Array.isArray(source.tags) ? source.tags : [],
      attributes: {
        ...sourceAttributes,
        marketType: "PROXIMITY",
        sourceTenantKey: SOURCE_TENANT_KEY,
        sourceProductId: source.id,
        isPlatformSeed: true,
      },
      isHandmade: source.isHandmade,
      trackInventory: true,
      allowBackorder: true,
      sku: source.sku ? `${source.sku}-R1KM-${nanoid(4)}` : null,
    } as any);

    created += 1;
  }

  return { created, skipped, totalSource: sourceRows.length };
}

async function main() {
  const targetTenant = await ensureTenant(TARGET_TENANT_KEY);
  const sourceTenant = await ensureTenant(SOURCE_TENANT_KEY);
  const ownerUser = await ensureOwnerUser();

  const categoryMap = await upsertCategories({
    targetTenantId: targetTenant.id,
    sourceTenantId: sourceTenant.id,
  });

  const sourceProducts = await db.query.sellerProducts.findMany({
    where: and(eq(sellerProducts.tenantId, sourceTenant.id), eq(sellerProducts.status, "active" as any)),
    columns: { sellerId: true },
    limit: MAX_PRODUCTS,
  });
  const sourceSellerIds = [...new Set(sourceProducts.map((row) => Number(row.sellerId || 0)).filter((id) => id > 0))];
  const sellerMap = await cloneSellers({
    sourceTenantId: sourceTenant.id,
    targetTenantId: targetTenant.id,
    ownerUserId: ownerUser.id,
    sourceSellerIds,
  });

  const products = await cloneProducts({
    sourceTenantId: sourceTenant.id,
    targetTenantId: targetTenant.id,
    sellerMap,
    categoryMap,
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        tenantKey: TARGET_TENANT_KEY,
        sourceTenantKey: SOURCE_TENANT_KEY,
        targetTenantId: targetTenant.id,
        sourceTenantId: sourceTenant.id,
        sellerCount: sellerMap.size,
        categoryCount: categoryMap.size,
        products,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error("[seed-rayon1km] failed", error);
  process.exitCode = 1;
});
