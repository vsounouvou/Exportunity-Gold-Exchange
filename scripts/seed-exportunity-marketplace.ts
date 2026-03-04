import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@db";
import { productCategories, sellers, sellerProducts, tenants, users } from "@db/schema";

type CategorySeed = {
  slug: string;
  name: string;
  color?: string;
  description?: string;
  sortOrder: number;
};

type ProductSeed = {
  name: string;
  categorySlug: string;
  price: number;
  stockQuantity: number;
  shortDescription?: string;
};

type SellerSeed = {
  shopName: string;
  description: string;
  streetAddress: string;
  latitude: number;
  longitude: number;
  products: ProductSeed[];
};

const CATEGORY_SEED: CategorySeed[] = [
  {
    slug: "food-produce",
    name: "Food & Produce / Alimentation & Produits frais",
    color: "#22c55e",
    sortOrder: 10,
  },
  {
    slug: "ready-meals",
    name: "Ready Meals / Plats prepares",
    color: "#f97316",
    sortOrder: 20,
  },
  {
    slug: "bakery",
    name: "Bakery & Pastries / Boulangerie & Patisserie",
    color: "#f59e0b",
    sortOrder: 30,
  },
  {
    slug: "beverages",
    name: "Beverages / Boissons",
    color: "#dc2626",
    sortOrder: 40,
  },
  {
    slug: "textiles-clothing",
    name: "Fashion & Clothing / Mode & Vetements",
    color: "#8b5cf6",
    sortOrder: 50,
  },
  {
    slug: "beauty-cosmetics",
    name: "Beauty & Cosmetics / Beaute & Cosmetiques",
    color: "#ec4899",
    sortOrder: 60,
  },
  {
    slug: "pharmacy-wellness",
    name: "Pharmacy & Wellness / Pharmacie & Bien-etre",
    color: "#14b8a6",
    sortOrder: 70,
  },
  {
    slug: "electronics",
    name: "Electronics & Phones / Electronique & Telephonie",
    color: "#0ea5e9",
    sortOrder: 80,
  },
  {
    slug: "home-decor",
    name: "Home & Decor / Maison & Decoration",
    color: "#3b82f6",
    sortOrder: 90,
  },
  {
    slug: "hardware-tools",
    name: "Hardware & Tools / Quincaillerie & Outils",
    color: "#64748b",
    sortOrder: 100,
  },
  {
    slug: "services-repairs",
    name: "Services & Repairs / Services & Reparations",
    color: "#facc15",
    sortOrder: 110,
  },
  {
    slug: "stationery",
    name: "Stationery & Office / Papeterie & Bureau",
    color: "#a855f7",
    sortOrder: 120,
  },
  {
    slug: "agriculture",
    name: "Agriculture Inputs / Intrants agricoles",
    color: "#84cc16",
    sortOrder: 130,
  },
  {
    slug: "transport",
    name: "Mobility & Transport / Mobilite & Transport",
    color: "#0f766e",
    sortOrder: 140,
  },
];

const SELLER_SEED: SellerSeed[] = [
  {
    shopName: "Cocody Fresh Market / Marche Cocody",
    description: "Daily produce and local staples near Cocody.",
    streetAddress: "Cocody, Abidjan",
    latitude: 5.356,
    longitude: -3.986,
    products: [
      { name: "Fresh Tomatoes / Tomates fraiches", categorySlug: "food-produce", price: 1500, stockQuantity: 55 },
      { name: "Plantain Bunch / Regime de plantain", categorySlug: "food-produce", price: 2500, stockQuantity: 40 },
      { name: "Avocados / Avocats", categorySlug: "food-produce", price: 3000, stockQuantity: 30 },
    ],
  },
  {
    shopName: "Plateau Quick Meals / Plats Express Plateau",
    description: "Quick lunch options for offices in Plateau.",
    streetAddress: "Plateau, Abidjan",
    latitude: 5.322,
    longitude: -4.017,
    products: [
      { name: "Jollof Rice Plate / Riz jollof", categorySlug: "ready-meals", price: 3500, stockQuantity: 35 },
      { name: "Grilled Chicken / Poulet braise", categorySlug: "ready-meals", price: 5000, stockQuantity: 25 },
    ],
  },
  {
    shopName: "Treichville Bakery / Boulangerie Treichville",
    description: "Fresh baked goods every morning.",
    streetAddress: "Treichville, Abidjan",
    latitude: 5.312,
    longitude: -4.012,
    products: [
      { name: "Baguette / Baguette", categorySlug: "bakery", price: 400, stockQuantity: 80 },
      { name: "Butter Croissant / Croissant", categorySlug: "bakery", price: 700, stockQuantity: 60 },
    ],
  },
  {
    shopName: "Marcory Beauty Lab / Beaute Marcory",
    description: "Natural cosmetics and body care.",
    streetAddress: "Marcory, Abidjan",
    latitude: 5.309,
    longitude: -3.986,
    products: [
      { name: "Shea Butter / Beurre de karite", categorySlug: "beauty-cosmetics", price: 3000, stockQuantity: 45 },
      { name: "Natural Soap / Savon naturel", categorySlug: "beauty-cosmetics", price: 1500, stockQuantity: 70 },
    ],
  },
  {
    shopName: "Yopougon Tech Hub / Tech Yopougon",
    description: "Phones and accessories for everyday use.",
    streetAddress: "Yopougon, Abidjan",
    latitude: 5.335,
    longitude: -4.09,
    products: [
      { name: "Phone Charger / Chargeur", categorySlug: "electronics", price: 5000, stockQuantity: 50 },
      { name: "Power Bank 10k / Batterie externe 10k", categorySlug: "electronics", price: 12000, stockQuantity: 30 },
    ],
  },
  {
    shopName: "Abobo Home & Decor / Maison Abobo",
    description: "Home decor essentials with local flair.",
    streetAddress: "Abobo, Abidjan",
    latitude: 5.431,
    longitude: -4.056,
    products: [
      { name: "Bamboo Lamp / Lampe bambou", categorySlug: "home-decor", price: 9000, stockQuantity: 18 },
      { name: "Decor Cushion / Coussin deco", categorySlug: "home-decor", price: 5000, stockQuantity: 28 },
    ],
  },
  {
    shopName: "Koumassi Hardware / Quincaillerie Koumassi",
    description: "Tools, repairs, and quick fixes.",
    streetAddress: "Koumassi, Abidjan",
    latitude: 5.292,
    longitude: -3.958,
    products: [
      { name: "Tool Kit / Kit outils", categorySlug: "hardware-tools", price: 15000, stockQuantity: 15 },
      { name: "LED Bulb / Ampoule LED", categorySlug: "hardware-tools", price: 1200, stockQuantity: 120 },
      { name: "Small Repairs / Petites reparations", categorySlug: "services-repairs", price: 4000, stockQuantity: 40 },
    ],
  },
  {
    shopName: "Bingerville Pharmacie / Pharmacie Bingerville",
    description: "Wellness essentials and daily health items.",
    streetAddress: "Bingerville, Abidjan",
    latitude: 5.356,
    longitude: -3.899,
    products: [
      { name: "Multivitamins / Multivitamines", categorySlug: "pharmacy-wellness", price: 6000, stockQuantity: 35 },
      { name: "Cough Syrup / Sirop contre la toux", categorySlug: "pharmacy-wellness", price: 4500, stockQuantity: 25 },
    ],
  },
  {
    shopName: "Adjame Textiles / Textiles Adjame",
    description: "Wax fabrics and tailored clothing.",
    streetAddress: "Adjame, Abidjan",
    latitude: 5.364,
    longitude: -4.025,
    products: [
      { name: "Wax Fabric / Tissu wax", categorySlug: "textiles-clothing", price: 7000, stockQuantity: 40 },
      { name: "Tailored Shirt / Chemise sur mesure", categorySlug: "textiles-clothing", price: 12000, stockQuantity: 18 },
    ],
  },
  {
    shopName: "Port-Bouet Mobility / Mobilite Port-Bouet",
    description: "Local mobility and transport services.",
    streetAddress: "Port-Bouet, Abidjan",
    latitude: 5.256,
    longitude: -3.917,
    products: [
      { name: "Bicycle Service / Service velo", categorySlug: "transport", price: 4000, stockQuantity: 22 },
      { name: "Helmet / Casque", categorySlug: "transport", price: 8000, stockQuantity: 20 },
    ],
  },
  {
    shopName: "Anyama Agro Supply / Intrants Anyama",
    description: "Seeds, fertilizers, and farm inputs.",
    streetAddress: "Anyama, Abidjan",
    latitude: 5.494,
    longitude: -4.051,
    products: [
      { name: "NPK Fertilizer / Engrais NPK", categorySlug: "agriculture", price: 12000, stockQuantity: 30 },
      { name: "Seed Pack / Sachet de semences", categorySlug: "agriculture", price: 2500, stockQuantity: 60 },
    ],
  },
  {
    shopName: "Plateau Stationery / Papeterie Plateau",
    description: "Office and school supplies for daily work.",
    streetAddress: "Plateau, Abidjan",
    latitude: 5.319,
    longitude: -4.019,
    products: [
      { name: "Notebook A5 / Cahier A5", categorySlug: "stationery", price: 1000, stockQuantity: 90 },
      { name: "Ballpoint Pens / Stylos", categorySlug: "stationery", price: 1500, stockQuantity: 120 },
    ],
  },
];

function truthy(value: unknown) {
  return ["1", "true", "yes", "y", "on"].includes(String(value || "").trim().toLowerCase());
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function buildFallbackEmail(shopName: string) {
  const base = slugify(shopName).slice(0, 40);
  return `demo-${base || "seller"}@exportunity.local`;
}

async function ensureTenant() {
  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.key, "exportunity"),
  });
  if (!tenant) {
    throw new Error("Tenant 'exportunity' not found. Run tenant migrations first.");
  }
  return tenant;
}

async function ensureUser(email: string, displayName: string) {
  const existing = await db.query.users.findFirst({
    where: eq(users.email, email),
  });
  if (existing) return existing;

  const [created] = await db
    .insert(users)
    .values({
      displayName,
      email,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any)
    .returning();

  return created;
}

async function upsertCategories(tenantId: number) {
  const out = new Map<string, number>();

  for (const category of CATEGORY_SEED) {
    const existing = await db.query.productCategories.findFirst({
      where: eq(productCategories.slug, category.slug),
    });

    if (existing && existing.tenantId !== tenantId) {
      console.warn(
        `[seed-exportunity-marketplace] Skipping category slug '${category.slug}' (belongs to tenant ${existing.tenantId}).`,
      );
      continue;
    }

    if (existing) {
      await db
        .update(productCategories)
        .set({
          name: category.name,
          description: category.description ?? existing.description,
          color: category.color ?? existing.color,
          sortOrder: category.sortOrder,
          isActive: true,
        })
        .where(eq(productCategories.id, existing.id));
      out.set(category.slug, existing.id);
      continue;
    }

    const [created] = await db
      .insert(productCategories)
      .values({
        tenantId,
        name: category.name,
        slug: category.slug,
        description: category.description ?? null,
        color: category.color ?? null,
        sortOrder: category.sortOrder,
        isActive: true,
        createdAt: new Date(),
      })
      .returning();

    if (created?.id) out.set(category.slug, created.id);
  }

  return out;
}

async function ensureSeller(seed: SellerSeed, tenantId: number) {
  const existing = await db.query.sellers.findFirst({
    where: and(eq(sellers.tenantId, tenantId), eq(sellers.shopName, seed.shopName)),
  });
  if (existing) return existing;

  const ownerEmail = buildFallbackEmail(seed.shopName);
  const owner = await ensureUser(ownerEmail, seed.shopName);
  const slug = `${slugify(seed.shopName)}-${nanoid(6)}`;
  const now = new Date();

  const [created] = await db
    .insert(sellers)
    .values({
      tenantId,
      userId: owner.id,
      shopName: seed.shopName,
      slug,
      description: seed.description,
      streetAddress: seed.streetAddress,
      latitude: seed.latitude.toString(),
      longitude: seed.longitude.toString(),
      status: "approved",
      verifiedAt: now,
      approvedAt: now,
      isProducer: true,
      isDemo: true,
      createdAt: now,
      updatedAt: now,
    } as any)
    .returning();

  return created;
}

async function ensureProduct(args: {
  tenantId: number;
  sellerId: number;
  categoryId: number;
  seed: ProductSeed;
}) {
  const existing = await db.query.sellerProducts.findFirst({
    where: and(
      eq(sellerProducts.tenantId, args.tenantId),
      eq(sellerProducts.sellerId, args.sellerId),
      eq(sellerProducts.name, args.seed.name),
    ),
  });
  if (existing) return existing;

  const now = new Date();
  const slug = `${slugify(args.seed.name)}-${nanoid(6)}`;

  const [created] = await db
    .insert(sellerProducts)
    .values({
      tenantId: args.tenantId,
      sellerId: args.sellerId,
      categoryId: args.categoryId,
      name: args.seed.name,
      slug,
      description: args.seed.shortDescription ?? null,
      shortDescription: args.seed.shortDescription ?? null,
      price: args.seed.price.toFixed(2),
      currency: "XOF",
      stockQuantity: args.seed.stockQuantity,
      status: "active",
      images: [],
      attributes: { seed: true, seedTag: "exportunity_seed_v1", marketType: "EXPORT_READY", exportReady: true },
      createdAt: now,
      updatedAt: now,
    } as any)
    .returning();

  return created;
}

async function main() {
  if (!truthy(process.env.ALLOW_EXPORTUNITY_SEED)) {
    console.error(
      "[seed-exportunity-marketplace] Refusing to run. Set ALLOW_EXPORTUNITY_SEED=true to proceed.",
    );
    process.exit(1);
  }

  const isProd = String(process.env.NODE_ENV || "").trim().toLowerCase() === "production";
  const allowProd = process.argv.includes("--allow-production");
  if (isProd && !allowProd) {
    console.error(
      "[seed-exportunity-marketplace] Refusing to run with NODE_ENV=production. Add --allow-production to override.",
    );
    process.exit(1);
  }

  const tenant = await ensureTenant();
  const categoryIds = await upsertCategories(tenant.id);

  for (const sellerSeed of SELLER_SEED) {
    const seller = await ensureSeller(sellerSeed, tenant.id);
    if (!seller?.id) continue;

    for (const product of sellerSeed.products) {
      const categoryId = categoryIds.get(product.categorySlug);
      if (!categoryId) {
        console.warn(
          `[seed-exportunity-marketplace] Missing category '${product.categorySlug}' for product '${product.name}'.`,
        );
        continue;
      }
      await ensureProduct({
        tenantId: tenant.id,
        sellerId: seller.id,
        categoryId,
        seed: product,
      });
    }
  }

  console.log(
    [
      "",
      "[seed-exportunity-marketplace] Done.",
      `- tenant: ${tenant.key} (id=${tenant.id})`,
      `- categories: ${CATEGORY_SEED.length}`,
      `- sellers: ${SELLER_SEED.length}`,
      "",
    ].join("\n"),
  );
}

main().catch((err) => {
  console.error("[seed-exportunity-marketplace] Failed:", err);
  process.exit(1);
});
