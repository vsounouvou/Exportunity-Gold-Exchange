import { db } from "@db";
import { and, eq } from "drizzle-orm";
import {
  partnerJewellers,
  productCategories,
  sellerProducts,
  sellers,
  stampedGoldSkus,
  tenants,
  users,
} from "@db/schema";
import { sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { ensureStampedGoldTables } from "../server/lib/stamped-gold/ensureTables";

function argValue(name: string, fallback: string) {
  const pref = `--${name}=`;
  const hit = process.argv.find((value) => value.startsWith(pref));
  return hit ? hit.slice(pref.length) : fallback;
}

function toInt(value: string, fallback: number) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.trunc(parsed));
}

function purityForKarat(karat: number) {
  if (karat >= 24) return "999.9";
  if (karat >= 22) return "916.7";
  if (karat >= 18) return "750.0";
  return "585.0";
}

async function ensureSeedSeller(tenantId: number, tenantKey: string) {
  const existingSeller = await db.query.sellers.findFirst({
    where: eq(sellers.tenantId, tenantId),
    orderBy: (table, { asc }) => [asc(table.createdAt)],
  });
  if (existingSeller) return existingSeller;

  let ownerUser = await db.query.users.findFirst({
    orderBy: (table, { asc }) => [asc(table.createdAt)],
  });
  if (!ownerUser) {
    [ownerUser] = await db
      .insert(users)
      .values({
        displayName: "Stamped Gold Seed Owner",
        email: `seed-owner+${tenantKey}@exportunity.local`,
        role: "admin",
        accountType: "Chairman",
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
  }

  const slug = `stamped-seed-${tenantKey}-${Date.now().toString(36)}`.slice(0, 180);
  const [createdSeller] = await db
    .insert(sellers)
    .values({
      tenantId,
      userId: ownerUser.id,
      shopName: "Stamped Gold Seed Shop",
      slug,
      description: "Synthetic seller used to seed stamped gold SKUs.",
      sellerType: "jeweler",
      phoneNumber: "+22900000000",
      email: `seed-shop+${tenantKey}@exportunity.local`,
      status: "approved",
      isProducer: true,
      isDemo: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  return createdSeller;
}

async function ensureStampedCategory(tenantId: number) {
  let category = await db.query.productCategories.findFirst({
    where: and(eq(productCategories.tenantId, tenantId), eq(productCategories.slug, "stamped")),
  });
  if (category) return category;

  const slugConflict = await db.query.productCategories.findFirst({
    where: eq(productCategories.slug, "stamped"),
  });
  if (slugConflict && Number(slugConflict.tenantId) !== tenantId) {
    throw new Error(
      `Category slug 'stamped' is bound to tenant ${slugConflict.tenantId}. Create/migrate tenant category before seeding.`,
    );
  }

  [category] = await db
    .insert(productCategories)
    .values({
      tenantId,
      name: "Stamped Gold",
      slug: "stamped",
      icon: "Shield",
      color: "#D4AF37",
      description: "Serialized stamped gold bars and coins.",
      sortOrder: 10,
      isActive: true,
      createdAt: new Date(),
    })
    .returning();

  return category;
}

async function ensureProduct(input: {
  tenantId: number;
  sellerId: number;
  categoryId: number;
  name: string;
  weightGrams: number;
  karat: number;
}) {
  const existing = await db.query.sellerProducts.findFirst({
    where: and(eq(sellerProducts.tenantId, input.tenantId), eq(sellerProducts.sellerId, input.sellerId), eq(sellerProducts.name, input.name)),
  });
  if (existing) return existing;

  const slug = `${input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now().toString(36)}-${nanoid(4).toLowerCase()}`.slice(
    0,
    190,
  );
  const price = input.weightGrams * (input.karat >= 24 ? 55_000 : input.karat >= 22 ? 50_000 : 45_000);
  const [created] = await db
    .insert(sellerProducts)
    .values({
      tenantId: input.tenantId,
      sellerId: input.sellerId,
      categoryId: input.categoryId,
      name: input.name,
      slug,
      description: `${input.weightGrams}g stamped gold (${input.karat}K) with serial and QR verification.`,
      price: String(price),
      currency: "XOF",
      stockQuantity: 0,
      trackInventory: true,
      allowBackorder: false,
      weight: String(input.weightGrams),
      weightUnit: "g",
      status: "active",
      tags: ["stamped", "gold", `${input.weightGrams}g`, `${input.karat}k`],
      images: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();
  return created;
}

async function ensureSku(input: {
  tenantId: number;
  productId: number;
  weightGrams: number;
  karat: number;
}) {
  const existing = await db.query.stampedGoldSkus.findFirst({
    where: and(eq(stampedGoldSkus.tenantId, input.tenantId), eq(stampedGoldSkus.productId, input.productId)),
  });
  if (existing) return existing;

  const skuCode = `BDO-BAR-${input.weightGrams}G-${input.karat}K-${nanoid(6).toUpperCase()}`;
  const [created] = await db
    .insert(stampedGoldSkus)
    .values({
      tenantId: input.tenantId,
      productId: input.productId,
      stampedType: "BAR",
      weightGrams: input.weightGrams,
      purity: purityForKarat(input.karat),
      karat: input.karat,
      metal: "FINE GOLD",
      brandText: "BOURSE DE L'OR",
      serialPrefix: "BDO",
      hallmarkText: `BDO-${input.karat}K`,
      year: new Date().getUTCFullYear(),
      requiresLegalStamp: true,
      skuCode,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any)
    .returning();
  return created;
}

async function ensurePartnerJeweller(tenantId: number, name: string) {
  const existing = await db.query.partnerJewellers.findFirst({
    where: and(eq(partnerJewellers.tenantId, tenantId), eq(partnerJewellers.name, name)),
  });
  if (existing) return existing;

  const [created] = await db
    .insert(partnerJewellers)
    .values({
      tenantId,
      name,
      address: "Seed Vault / Pickup Point",
      phone: "+22900000001",
      stockMode: "JUST_IN_TIME",
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();
  return created;
}

async function seedItems(input: {
  tenantId: number;
  partnerJewellerId: string;
  totalItems: number;
  skus: Array<{ id: string; serialPrefix: string; stampedType: "COIN" | "BAR"; weightGrams: number; year: number | null }>;
}) {
  let created = 0;
  const perSkuBase = Math.floor(input.totalItems / input.skus.length);
  let remainder = input.totalItems % input.skus.length;

  for (const sku of input.skus) {
    const target = perSkuBase + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder -= 1;
    let insertedForSku = 0;
    let attempts = 0;

    while (insertedForSku < target && attempts < target * 6) {
      attempts += 1;
      const year = sku.year || new Date().getUTCFullYear();
      const serial = `${sku.serialPrefix || "BDO"}-${year}-${sku.stampedType}-${sku.weightGrams}G-${nanoid(8).toUpperCase()}`;
      const result = await db.execute(sql`
        insert into stamped_gold_items (
          tenant_id,
          sku_id,
          serial_code,
          serial,
          status,
          current_location_type,
          current_location_id,
          partner_jeweller_id,
          qr_token,
          minted_at,
          created_at,
          updated_at
        ) values (
          ${input.tenantId},
          ${sku.id},
          ${serial},
          ${serial},
          'CREATED'::stamped_gold_item_status,
          'JEWELLER_PARTNER'::stamped_gold_location_type,
          ${input.partnerJewellerId},
          ${input.partnerJewellerId},
          substr(md5(${serial} || random()::text || clock_timestamp()::text), 1, 32),
          now(),
          now(),
          now()
        )
        on conflict (tenant_id, serial_code) do nothing
        returning id
      `);
      const rows = Array.isArray((result as any)?.rows) ? (result as any).rows : [];
      if (rows.length) {
        created += 1;
        insertedForSku += 1;
      }
    }
  }

  return created;
}

async function main() {
  const tenantKey = argValue("tenant", process.env.SEED_TENANT_KEY || "bdo");
  const totalItems = toInt(argValue("items", "50"), 50);
  const partnerName = argValue("partner", "Seed Partner Jeweller");

  await ensureStampedGoldTables();
  const tenant = await db.query.tenants.findFirst({ where: eq(tenants.key, tenantKey) });
  if (!tenant) throw new Error(`Tenant '${tenantKey}' not found`);

  const seller = await ensureSeedSeller(tenant.id, tenant.key);
  const category = await ensureStampedCategory(tenant.id);

  const skuPlans = [
    { name: "Stamped Gold Bar - 10g (24K)", weightGrams: 10, karat: 24 },
    { name: "Stamped Gold Bar - 20g (22K)", weightGrams: 20, karat: 22 },
    { name: "Stamped Gold Bar - 50g (22K)", weightGrams: 50, karat: 22 },
  ];

  const skus = [];
  for (const plan of skuPlans) {
    const product = await ensureProduct({
      tenantId: tenant.id,
      sellerId: seller.id,
      categoryId: category.id,
      name: plan.name,
      weightGrams: plan.weightGrams,
      karat: plan.karat,
    });
    const sku = await ensureSku({
      tenantId: tenant.id,
      productId: product.id,
      weightGrams: plan.weightGrams,
      karat: plan.karat,
    });
    skus.push(sku);
  }

  const partner = await ensurePartnerJeweller(tenant.id, partnerName);
  const generatedItems = await seedItems({
    tenantId: tenant.id,
    partnerJewellerId: partner.id,
    totalItems,
    skus: skus.map((sku: any) => ({
      id: String(sku.id),
      serialPrefix: String(sku.serialPrefix || "BDO"),
      stampedType: String(sku.stampedType || "BAR") as "COIN" | "BAR",
      weightGrams: Number(sku.weightGrams || 0),
      year: sku.year == null ? null : Number(sku.year),
    })),
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        tenant: { id: tenant.id, key: tenant.key, name: tenant.name },
        seeded: {
          skus: skus.length,
          partnerJeweller: partner.name,
          generatedItems,
        },
      },
      null,
      2,
    ),
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("[seed-stamped-gold-pass] failed:", error?.message || error);
    process.exit(1);
  });

