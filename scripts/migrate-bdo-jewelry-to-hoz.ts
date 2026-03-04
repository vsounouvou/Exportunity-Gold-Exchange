import "../env";

import { sql } from "drizzle-orm";

import { db } from "../db";

type TenantRow = { id: number; key: string };
type CategoryRow = { id: number; slug: string; name: string | null };
type ProductRow = {
  id: number;
  seller_id: number;
  category_id: number | null;
  name: string;
  slug: string;
  status: string;
};
type SellerRow = {
  id: number;
  user_id: number;
  shop_name: string;
  slug: string;
  description: string | null;
  logo: string | null;
  cover_image: string | null;
  seller_type: string;
  phone_number: string | null;
  email: string | null;
  website: string | null;
  status: string | null;
  is_producer: boolean | null;
  production_type: string | null;
  is_demo: boolean | null;
};

type MigrationReport = {
  dryRun: boolean;
  sourceTenant: string;
  targetTenant: string;
  categoriesMoved: number;
  productsInspected: number;
  productsMoved: number;
  productsCloned: number;
  productsArchived: number;
  sellersCloned: number;
  skipped: number;
};

const SOURCE_TENANT_KEY = "bdo";
const TARGET_TENANT_KEY = "hoz";
const CATEGORY_SLUGS = ["jewelry", "gold-art"] as const;

function hasFlag(name: string) {
  return process.argv.includes(name);
}

async function findTenantByKey(key: string) {
  const result = await db.execute(sql`
    select id, key
    from tenants
    where key = ${key}
    limit 1
  `);
  return ((result as any)?.rows?.[0] || null) as TenantRow | null;
}

async function resolveUniqueSellerSlug(baseSlug: string) {
  const base = String(baseSlug || "seller").trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-") || "seller";
  let candidate = `${base}-hoz`;
  let counter = 1;
  while (true) {
    const result = await db.execute(sql`select 1 from sellers where slug = ${candidate} limit 1`);
    if (!((result as any)?.rows?.length)) return candidate;
    counter += 1;
    candidate = `${base}-hoz-${counter}`;
  }
}

async function ensureHozSellerClone(args: {
  sourceSellerId: number;
  sourceTenantId: number;
  targetTenantId: number;
  dryRun: boolean;
  cache: Map<number, number>;
  report: MigrationReport;
}) {
  const cached = args.cache.get(args.sourceSellerId);
  if (cached) return cached;

  const existing = await db.execute(sql`
    select id
    from sellers
    where tenant_id = ${args.targetTenantId}
      and external_seed_id = ${`migrated:bdo-seller:${args.sourceSellerId}`}
    limit 1
  `);
  const existingId = Number((existing as any)?.rows?.[0]?.id || 0);
  if (existingId > 0) {
    args.cache.set(args.sourceSellerId, existingId);
    return existingId;
  }

  const sourceSellerResult = await db.execute(sql`
    select
      id,
      user_id,
      shop_name,
      slug,
      description,
      logo,
      cover_image,
      seller_type,
      phone_number,
      email,
      website,
      status,
      is_producer,
      production_type,
      is_demo
    from sellers
    where id = ${args.sourceSellerId}
      and tenant_id = ${args.sourceTenantId}
    limit 1
  `);
  const sourceSeller = ((sourceSellerResult as any)?.rows?.[0] || null) as SellerRow | null;
  if (!sourceSeller) return 0;

  const newSlug = await resolveUniqueSellerSlug(sourceSeller.slug);

  if (args.dryRun) {
    const synthetic = -Math.abs(args.sourceSellerId);
    args.cache.set(args.sourceSellerId, synthetic);
    args.report.sellersCloned += 1;
    return synthetic;
  }

  const inserted = await db.execute(sql`
    insert into sellers (
      tenant_id,
      user_id,
      shop_name,
      slug,
      description,
      logo,
      cover_image,
      seller_type,
      phone_number,
      email,
      website,
      status,
      is_producer,
      production_type,
      is_demo,
      external_seed_id,
      created_at,
      updated_at
    )
    values (
      ${args.targetTenantId},
      ${sourceSeller.user_id},
      ${sourceSeller.shop_name},
      ${newSlug},
      ${sourceSeller.description},
      ${sourceSeller.logo},
      ${sourceSeller.cover_image},
      ${sourceSeller.seller_type},
      ${sourceSeller.phone_number},
      ${sourceSeller.email},
      ${sourceSeller.website},
      ${sourceSeller.status || "approved"},
      ${sourceSeller.is_producer ?? true},
      ${sourceSeller.production_type},
      ${sourceSeller.is_demo ?? false},
      ${`migrated:bdo-seller:${args.sourceSellerId}`},
      now(),
      now()
    )
    returning id
  `);

  const newId = Number((inserted as any)?.rows?.[0]?.id || 0);
  if (newId > 0) {
    args.cache.set(args.sourceSellerId, newId);
    args.report.sellersCloned += 1;
  }
  return newId;
}

async function main() {
  const dryRun = !hasFlag("--apply");
  const report: MigrationReport = {
    dryRun,
    sourceTenant: SOURCE_TENANT_KEY,
    targetTenant: TARGET_TENANT_KEY,
    categoriesMoved: 0,
    productsInspected: 0,
    productsMoved: 0,
    productsCloned: 0,
    productsArchived: 0,
    sellersCloned: 0,
    skipped: 0,
  };

  const [sourceTenant, targetTenant] = await Promise.all([
    findTenantByKey(SOURCE_TENANT_KEY),
    findTenantByKey(TARGET_TENANT_KEY),
  ]);

  if (!sourceTenant || !targetTenant) {
    throw new Error(`Missing tenant rows. source=${Boolean(sourceTenant)} target=${Boolean(targetTenant)}`);
  }

  const categoriesResult = await db.execute(sql`
    select id, slug, name
    from product_categories
    where tenant_id = ${sourceTenant.id}
      and slug in (${sql.join(CATEGORY_SLUGS.map((slug) => sql`${slug}`), sql`, `)})
    order by id asc
  `);
  const categories = (((categoriesResult as any)?.rows || []) as CategoryRow[]).filter(Boolean);

  const categoryIds = categories.map((entry) => Number(entry.id)).filter((id) => Number.isFinite(id) && id > 0);
  if (!categoryIds.length) {
    console.log("[migrate-bdo-jewelry-to-hoz] No source categories found. Nothing to migrate.");
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  report.categoriesMoved = categoryIds.length;

  if (!dryRun) {
    await db.execute(sql`
      update product_categories
      set tenant_id = ${targetTenant.id}
      where id in (${sql.join(categoryIds.map((id) => sql`${id}`), sql`, `)})
    `);
  }

  const productsResult = await db.execute(sql`
    select id, seller_id, category_id, name, slug, status
    from seller_products
    where tenant_id = ${sourceTenant.id}
      and status = 'active'
      and category_id in (${sql.join(categoryIds.map((id) => sql`${id}`), sql`, `)})
    order by id asc
  `);

  const products = (((productsResult as any)?.rows || []) as ProductRow[]).filter(Boolean);
  report.productsInspected = products.length;

  const sellerCache = new Map<number, number>();

  for (const product of products) {
    const sourceSellerId = Number(product.seller_id || 0);
    if (!sourceSellerId) {
      report.skipped += 1;
      continue;
    }

    const targetSellerId = await ensureHozSellerClone({
      sourceSellerId,
      sourceTenantId: sourceTenant.id,
      targetTenantId: targetTenant.id,
      dryRun,
      cache: sellerCache,
      report,
    });

    if (!targetSellerId) {
      report.skipped += 1;
      continue;
    }

    const historyResult = await db.execute(sql`
      select count(*)::int as count
      from marketplace_order_items
      where product_id = ${product.id}
    `);
    const orderHistoryCount = Number((historyResult as any)?.rows?.[0]?.count || 0);
    const hasHistory = orderHistoryCount > 0;

    if (hasHistory) {
      report.productsArchived += 1;
      report.productsCloned += 1;

      if (dryRun) continue;

      await db.execute(sql`
        update seller_products
        set status = 'discontinued', updated_at = now()
        where id = ${product.id}
      `);

      await db.execute(sql`
        insert into seller_products (
          tenant_id,
          seller_id,
          category_id,
          name,
          slug,
          description,
          short_description,
          price,
          compare_at_price,
          cost_price,
          currency,
          sku,
          barcode,
          stock_quantity,
          low_stock_threshold,
          track_inventory,
          allow_backorder,
          weight,
          weight_unit,
          dimensions,
          images,
          is_handmade,
          production_time,
          ingredients,
          allergens,
          certifications,
          tags,
          attributes,
          status,
          total_sold,
          view_count,
          created_at,
          updated_at
        )
        select
          ${targetTenant.id},
          ${targetSellerId},
          category_id,
          name,
          concat(slug, '-hoz-', id),
          description,
          short_description,
          price,
          compare_at_price,
          cost_price,
          currency,
          sku,
          barcode,
          stock_quantity,
          low_stock_threshold,
          track_inventory,
          allow_backorder,
          weight,
          weight_unit,
          dimensions,
          images,
          is_handmade,
          production_time,
          ingredients,
          allergens,
          certifications,
          tags,
          attributes,
          'active',
          total_sold,
          view_count,
          now(),
          now()
        from seller_products
        where id = ${product.id}
      `);

      continue;
    }

    report.productsMoved += 1;

    if (dryRun) continue;

    await db.execute(sql`
      update seller_products
      set tenant_id = ${targetTenant.id},
          seller_id = ${targetSellerId},
          updated_at = now()
      where id = ${product.id}
    `);
  }

  console.log("[migrate-bdo-jewelry-to-hoz] Completed.");
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error("[migrate-bdo-jewelry-to-hoz] Failed", error);
  process.exitCode = 1;
});
