import "../env";

import { and, eq } from "drizzle-orm";

import { db } from "../db";
import { productCategories, sellerProducts, tenants } from "@db/schema";

type TenantKey = "bdo" | "exportunity" | "zone" | "mindbase" | "met" | "vs" | "hoz" | "zogueland" | "rayon1km";

type TenantImagePool = {
  default: string[];
  byCategory: Record<string, string[]>;
};

const TENANT_POOLS: Record<TenantKey, TenantImagePool> = {
  bdo: {
    default: ["/tenants/bdo/placeholder-product.svg", "/product-images/stamped-bar-01.png", "/product-images/gold-card.png"],
    byCategory: {
      dore: ["/product-images/dore-nuggets-01.png", "/product-images/dore-lot-01.png", "/product-images/dore-dust-01.png"],
      stamped: ["/product-images/stamped-bar-01.png", "/product-images/stamped-bar-02.png", "/product-images/stamped-piece-01.png"],
    },
  },
  exportunity: {
    default: ["/tenants/exportunity/placeholder-product.svg", "/tenants/exportunity/hero-1.svg"],
    byCategory: {
      agriculture: ["/tenants/exportunity/placeholder-product.svg"],
      textiles: ["/tenants/exportunity/placeholder-product.svg"],
      minerals: ["/tenants/exportunity/placeholder-product.svg"],
    },
  },
  zone: {
    default: ["/tenants/zone/placeholder-product.svg", "/tenants/zone/hero-1.svg"],
    byCategory: {},
  },
  mindbase: {
    default: ["/tenants/mindbase/placeholder-product.svg", "/tenants/mindbase/hero-1.svg"],
    byCategory: {
      agents: ["/tenants/mindbase/placeholder-product.svg"],
      templates: ["/tenants/mindbase/placeholder-product.svg"],
      "knowledge-kits": ["/tenants/mindbase/placeholder-product.svg"],
    },
  },
  met: {
    default: ["/tenants/met/placeholder-product.svg", "/tenants/met/hero-1.svg"],
    byCategory: {
      "earth-bricks": ["/tenants/met/placeholder-product.svg"],
      "house-plans": ["/tenants/met/placeholder-product.svg"],
      "contractor-services": ["/tenants/met/placeholder-product.svg"],
    },
  },
  vs: {
    default: ["/tenants/vs/placeholder-product.svg", "/tenants/vs/hero-1.svg"],
    byCategory: {
      books: ["/tenants/vs/placeholder-product.svg"],
      courses: ["/tenants/vs/placeholder-product.svg"],
      speaking: ["/tenants/vs/placeholder-product.svg"],
      consulting: ["/tenants/vs/placeholder-product.svg"],
    },
  },
  hoz: {
    default: ["/tenants/hoz/placeholder-product.svg", "/tenants/hoz/hero-1.svg"],
    byCategory: {
      jewelry: ["/product-images/jewelry-chain.png", "/product-images/jewelry-bracelet.png", "/product-images/jewelry-pendant.png"],
      "gold-art": ["/product-images/art-bust.png", "/product-images/art-medallion.png", "/product-images/art-ceremonial.png"],
    },
  },
  zogueland: {
    default: ["/tenants/zogueland/placeholder-product.svg", "/tenants/zogueland/hero-1.svg"],
    byCategory: {
      stories: ["/tenants/zogueland/placeholder-product.svg"],
      audio: ["/tenants/zogueland/placeholder-product.svg"],
      "learning-games": ["/tenants/zogueland/placeholder-product.svg"],
    },
  },
  rayon1km: {
    default: ["/tenants/rayon1km/placeholder-product.svg", "/tenants/rayon1km/hero-1.svg"],
    byCategory: {
      groceries: ["/tenants/rayon1km/placeholder-product.svg"],
      services: ["/tenants/rayon1km/placeholder-product.svg"],
      restaurants: ["/tenants/rayon1km/placeholder-product.svg"],
    },
  },
};

function getArgValue(name: string) {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  return process.argv[index + 1] || null;
}

function isEmptyImages(images: unknown) {
  return !Array.isArray(images) || images.length === 0;
}

function pickImages(pool: string[], seed: number, minCount = 2) {
  if (!pool.length) return [];
  const selected: string[] = [];
  let offset = Math.abs(seed) % pool.length;
  while (selected.length < Math.min(minCount, pool.length)) {
    const image = pool[offset % pool.length];
    if (!selected.includes(image)) selected.push(image);
    offset += 1;
  }
  return selected;
}

async function main() {
  const tenantArg = String(getArgValue("--tenant") || "").trim().toLowerCase() as TenantKey;
  if (!tenantArg) {
    throw new Error("Missing --tenant <slug>");
  }
  if (!Object.prototype.hasOwnProperty.call(TENANT_POOLS, tenantArg)) {
    throw new Error(`Unsupported tenant: ${tenantArg}`);
  }

  const force = process.argv.includes("--force");
  const apply = process.argv.includes("--apply");

  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.key, tenantArg),
    columns: { id: true, key: true, name: true },
  });

  if (!tenant) {
    throw new Error(`Tenant not found: ${tenantArg}`);
  }

  const pool = TENANT_POOLS[tenantArg];

  const products = await db
    .select({
      id: sellerProducts.id,
      name: sellerProducts.name,
      images: sellerProducts.images,
      categoryId: sellerProducts.categoryId,
      categorySlug: productCategories.slug,
    })
    .from(sellerProducts)
    .leftJoin(productCategories, eq(productCategories.id, sellerProducts.categoryId))
    .where(and(eq(sellerProducts.tenantId, tenant.id), eq(sellerProducts.status, "active")));

  const target = force ? products : products.filter((entry) => isEmptyImages(entry.images));
  let updates = 0;

  for (const product of target) {
    const categorySlug = String(product.categorySlug || "").trim().toLowerCase();
    const categoryPool = pool.byCategory[categorySlug] || pool.default;
    const images = pickImages(categoryPool, Number(product.id), 3);
    if (!images.length) continue;

    if (apply) {
      await db
        .update(sellerProducts)
        .set({
          images,
          updatedAt: new Date(),
        })
        .where(eq(sellerProducts.id, product.id));
    }
    updates += 1;
  }

  console.log(
    JSON.stringify(
      {
        tenant: tenantArg,
        tenantId: tenant.id,
        mode: apply ? "apply" : "dry-run",
        force,
        activeProducts: products.length,
        touchedProducts: target.length,
        updatedProducts: updates,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error("[backfill-tenant-product-images] Failed", error);
  process.exitCode = 1;
});
