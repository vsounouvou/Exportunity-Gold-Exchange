import { and, eq } from "drizzle-orm";
import { db } from "@db";
import { productCategories, sellerProducts, sellers, tenants, users } from "@db/schema";

function truthy(value: unknown) {
  return ["1", "true", "yes", "y", "on"].includes(String(value || "").trim().toLowerCase());
}

function getArgValue(flag: string) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function jitterLatLng(lat: number, lng: number, radiusKm: number) {
  const r = radiusKm / 111; // ~degrees latitude per km
  const u = Math.random();
  const v = Math.random();
  const w = r * Math.sqrt(u);
  const t = 2 * Math.PI * v;
  const dLat = w * Math.cos(t);
  const dLng = (w * Math.sin(t)) / Math.cos((lat * Math.PI) / 180);
  return { lat: lat + dLat, lng: lng + dLng };
}

async function resolveTenant(preferredKey: string) {
  const tenant = await db.query.tenants.findFirst({ where: eq(tenants.key, preferredKey as any) });
  if (!tenant) throw new Error(`Tenant not found: ${preferredKey}`);
  return tenant;
}

async function ensureSystemUser(apply: boolean) {
  const existing = await db.query.users.findFirst({
    where: eq(users.email, "system@exportunity.com"),
  });
  if (existing) return existing;

  if (!apply) {
    console.log("[dry-run] would create system user: system@exportunity.com");
    return null;
  }

  const now = new Date();
  const [created] = await db
    .insert(users)
    .values({
      email: "system@exportunity.com",
      displayName: "Exportunity System",
      role: "admin",
      accountType: "System",
      createdAt: now,
      updatedAt: now,
    } as any)
    .returning();
  return created;
}

async function ensureCategoryForTenant(args: {
  tenantId: number;
  tenantKey: string;
  slug: string;
  apply: boolean;
}) {
  const existing = await db.query.productCategories.findFirst({
    where: and(eq(productCategories.tenantId, args.tenantId), eq(productCategories.slug, args.slug)),
  });
  if (existing) return existing;

  const slugOwner = await db.query.productCategories.findFirst({
    where: eq(productCategories.slug, args.slug),
    columns: { id: true, tenantId: true, slug: true, name: true },
  });
  const fallbackSlug = `${String(args.tenantKey || "tenant").toLowerCase()}-${args.slug}`.replace(/[^a-z0-9-]+/g, "-");
  const existingFallback = await db.query.productCategories.findFirst({
    where: and(eq(productCategories.tenantId, args.tenantId), eq(productCategories.slug, fallbackSlug)),
  });
  if (existingFallback) return existingFallback;

  const categoryName = args.slug === "gold-art" ? "Gold Art" : "Jewelry";
  const targetSlug = slugOwner ? fallbackSlug : args.slug;
  if (!args.apply) {
    return {
      id: -Math.floor(Math.random() * 1000000) - 1,
      tenantId: args.tenantId,
      slug: targetSlug,
      name: categoryName,
      description: null,
      icon: null,
      color: null,
      mapMarkerKey: null,
      parentId: null,
      sortOrder: args.slug === "gold-art" ? 60 : 50,
      isActive: true,
      createdAt: new Date(),
    } as any;
  }

  const [created] = await db
    .insert(productCategories)
    .values({
      tenantId: args.tenantId,
      name: categoryName,
      slug: targetSlug,
      description: `${categoryName} catalog seeded for ${args.tenantKey.toUpperCase()}.`,
      sortOrder: args.slug === "gold-art" ? 60 : 50,
      isActive: true,
      color: args.slug === "gold-art" ? "#f59e0b" : "#a855f7",
      icon: args.slug === "gold-art" ? "palette" : "gem",
    } as any)
    .returning();

  return created;
}

type ProductTemplate = {
  name: string;
  category: "jewelry" | "gold-art";
  priceXof: number;
  weightGrams: number;
  description: string;
  tags: string[];
  images: string[];
};

const BASE_LAT = 5.3600;
const BASE_LNG = -4.0083;

const ABIDJAN_NEIGHBORHOODS = [
  "Cocody",
  "Plateau",
  "Treichville",
  "Marcory",
  "Yopougon",
  "Abobo",
  "Koumassi",
  "Port-Bouët",
  "Adjamé",
  "Bingerville",
  "Anyama",
];

const PRODUCT_TEMPLATES: ProductTemplate[] = [
  {
    name: "Heritage Signet Ring - Abidjan Edition",
    category: "jewelry",
    priceXof: 420000,
    weightGrams: 9.2,
    description: "Heritage-inspired signet ring with hallmarking and secure packaging. Designed for daily wear and gifting.",
    tags: ["ring", "heritage", "limited"],
    images: ["/product-images/custom-ring.png"],
  },
  {
    name: "Gold Bracelet - Classic Link",
    category: "jewelry",
    priceXof: 740000,
    weightGrams: 18.0,
    description: "Classic link bracelet crafted by a verified workshop. Hallmarked and delivered in secure packaging.",
    tags: ["bracelet", "classic"],
    images: ["/product-images/jewelry-bracelet.png"],
  },
  {
    name: "Gold Pendant - Heritage Symbol",
    category: "jewelry",
    priceXof: 540000,
    weightGrams: 12.3,
    description: "Symbolic pendant with heritage motif. Hallmarked, boxed, and accompanied by certification.",
    tags: ["pendant", "symbol", "heritage"],
    images: ["/product-images/jewelry-pendant.png"],
  },
  {
    name: "Gold Relief Medallion - Heritage Series",
    category: "gold-art",
    priceXof: 2600000,
    weightGrams: 85.0,
    description: "Sculptural gold relief medallion with contemporary finish. Produced in limited runs with hallmark and certificate.",
    tags: ["medallion", "heritage", "collector", "limited"],
    images: ["/product-images/art-medallion.png"],
  },
  {
    name: "Gold Portrait Bust - Limited Edition",
    category: "gold-art",
    priceXof: 5200000,
    weightGrams: 180.0,
    description: "Museum-grade gold portrait bust, handcrafted and delivered in a premium case with documentation.",
    tags: ["bust", "collector", "limited"],
    images: ["/product-images/art-bust.png"],
  },
  {
    name: "Gold Ceremonial Object - Contemporary Form",
    category: "gold-art",
    priceXof: 4100000,
    weightGrams: 140.0,
    description: "Contemporary ceremonial form in gold with refined detailing and museum-grade presentation.",
    tags: ["object", "heritage", "collector"],
    images: ["/product-images/art-ceremonial.png"],
  },
];

async function ensureJewelerSeller(args: { tenantId: number; tenantKey: string; userId: number; index: number; apply: boolean }) {
  const neighborhood = ABIDJAN_NEIGHBORHOODS[args.index % ABIDJAN_NEIGHBORHOODS.length];
  const shopName = `Atelier Abidjan Gold ${String(args.index + 1).padStart(2, "0")}`;
  const slug = `${String(args.tenantKey || "tenant").toLowerCase()}-abidjan-jeweler-${String(args.index + 1).padStart(2, "0")}`.slice(0, 190);

  const existing = await db.query.sellers.findFirst({
    where: and(eq(sellers.tenantId, args.tenantId), eq(sellers.slug, slug)),
  });
  if (existing) return { seller: existing, created: false };

  const { lat, lng } = jitterLatLng(BASE_LAT, BASE_LNG, 7);
  const now = new Date();
  const payload = {
    tenantId: args.tenantId,
    userId: args.userId,
    shopName,
    slug,
    description: `Verified jewelry manufacturer (Abidjan, ${neighborhood}). Heritage-inspired jewelry and curated gold art objects with hallmarking and secure delivery.`,
    latitude: lat.toFixed(7),
    longitude: lng.toFixed(7),
    streetAddress: `${neighborhood}, Abidjan, Côte d'Ivoire`,
    phoneNumber: null,
    sellerType: "jeweler",
    status: "approved",
    isProducer: true,
    productionType: "jewelry_manufacturing",
    rating: (4.2 + Math.random() * 0.7).toFixed(2),
    isDemo: false,
    approvedAt: now,
    verifiedAt: null,
    createdAt: now,
    updatedAt: now,
  } as any;

  if (!args.apply) {
    console.log(`[dry-run] would create seller: ${slug} (${shopName}) @ ${payload.latitude},${payload.longitude}`);
    return null;
  }

  const [created] = await db.insert(sellers).values(payload).returning();
  return { seller: created, created: true };
}

async function ensureProduct(args: {
  tenantId: number;
  sellerId: number;
  categoryId: number;
  template: ProductTemplate;
  apply: boolean;
}) {
  const baseSlug = `${slugify(args.template.name)}-${args.sellerId}`.slice(0, 190);

  const existing = await db.query.sellerProducts.findFirst({
    where: and(eq(sellerProducts.tenantId, args.tenantId), eq(sellerProducts.sellerId, args.sellerId), eq(sellerProducts.slug, baseSlug)),
    columns: { id: true },
  });
  if (existing) return { created: false };

  if (!args.apply) {
    console.log(`[dry-run] would create product: ${baseSlug} (sellerId=${args.sellerId})`);
    return { created: false };
  }

  const now = new Date();
  await db.insert(sellerProducts).values({
    tenantId: args.tenantId,
    sellerId: args.sellerId,
    categoryId: args.categoryId,
    name: args.template.name,
    slug: baseSlug,
    description: args.template.description,
    shortDescription: `Curated maker | Abidjan`,
    price: String(args.template.priceXof),
    currency: "XOF",
    stockQuantity: args.template.category === "gold-art" ? 2 : 6,
    weight: String(args.template.weightGrams),
    weightUnit: "g",
    isHandmade: true,
    status: "active",
    images: [...args.template.images],
    tags: ["manufacturer", ...args.template.tags, "ci", "abidjan"],
    certifications: ["Verified Manufacturer", "Hallmarked", "Certificate Included", "Secure Delivery"],
    createdAt: now,
    updatedAt: now,
  } as any);

  return { created: true };
}

async function main() {
  const tenantKey = String(getArgValue("--tenant") || process.env.SEED_TENANT_KEY || "hoz").trim();
  const apply = truthy(getArgValue("--apply") || process.env.APPLY_SEED);
  const count = Math.min(Math.max(parseInt(String(getArgValue("--count") || process.env.SEED_COUNT || "6"), 10) || 6, 1), 20);

  if (apply && !truthy(process.env.ALLOW_UX_SEED)) {
    console.error("[seed-abidjan-jewelers] Refusing to apply changes. Set ALLOW_UX_SEED=true and re-run with --apply.");
    process.exit(1);
  }

  const tenant = await resolveTenant(tenantKey);
  const systemUser = await ensureSystemUser(apply);
  if (!systemUser) {
    console.log("[seed-abidjan-jewelers] Dry run: no system user created.");
    return;
  }

  const jewelryCategory = await ensureCategoryForTenant({ tenantId: tenant.id, tenantKey, slug: "jewelry", apply });
  const goldArtCategory = await ensureCategoryForTenant({ tenantId: tenant.id, tenantKey, slug: "gold-art", apply });

  let sellersCreated = 0;
  let productsCreated = 0;

  for (let i = 0; i < count; i++) {
    // eslint-disable-next-line no-await-in-loop
    const result = await ensureJewelerSeller({ tenantId: tenant.id, tenantKey, userId: systemUser.id, index: i, apply });
    if (!result) continue;
    if (result.created) sellersCreated += 1;

    const sellerId = (result.seller as any).id as number;
    for (const template of PRODUCT_TEMPLATES) {
      const categoryId = template.category === "gold-art" ? (goldArtCategory as any).id : (jewelryCategory as any).id;
      // eslint-disable-next-line no-await-in-loop
      const p = await ensureProduct({ tenantId: tenant.id, sellerId, categoryId, template, apply });
      if (p.created) productsCreated += 1;
    }
  }

  console.log(
    `[seed-abidjan-jewelers] Done. sellersCreated=${sellersCreated} productsCreated=${productsCreated} (tenant=${tenant.key})`,
  );
}

main().catch((err) => {
  console.error("[seed-abidjan-jewelers] Failed:", err);
  process.exit(1);
});
