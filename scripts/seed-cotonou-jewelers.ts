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
  const tenant = await db.query.tenants.findFirst({ where: eq(tenants.key, preferredKey) });
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
  slug: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  sortOrder: number;
  apply: boolean;
}) {
  const existing = await db.query.productCategories.findFirst({
    where: and(eq(productCategories.tenantId, args.tenantId), eq(productCategories.slug, args.slug)),
  });
  if (existing) return existing;

  if (!args.apply) {
    console.log(`[dry-run] would create category: ${args.slug} (tenantId=${args.tenantId})`);
    return null;
  }

  try {
    const [created] = await db
      .insert(productCategories)
      .values({
        tenantId: args.tenantId,
        name: args.name,
        slug: args.slug,
        description: args.description,
        icon: args.icon,
        color: args.color,
        sortOrder: args.sortOrder,
        isActive: true,
        createdAt: new Date(),
      } as any)
      .returning();
    return created;
  } catch (err: any) {
    const slugOwner = await db.query.productCategories.findFirst({
      where: eq(productCategories.slug, args.slug),
      columns: { id: true, tenantId: true, slug: true, name: true },
    });
    if (slugOwner) {
      throw new Error(
        `Cannot create category '${args.slug}' for tenantId=${args.tenantId}: slug is already used by tenantId=${slugOwner.tenantId} (category id=${slugOwner.id}).`,
      );
    }
    throw err;
  }
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

const BASE_LAT = 6.3703;
const BASE_LNG = 2.3912;

const COTONOU_NEIGHBORHOODS = ["Fidjrossè", "Cadjèhoun", "Ganhi", "Akpakpa", "Zongo", "Houéyiho", "Agla", "Tokpa"];

const PRODUCT_TEMPLATES: ProductTemplate[] = [
  {
    name: "Heritage Signet Ring - Dahomey Motif",
    category: "jewelry",
    priceXof: 420000,
    weightGrams: 9.2,
    description: "Heritage-inspired signet ring with hallmarking and secure packaging. Designed for daily wear and gifting.",
    tags: ["ring", "heritage", "limited"],
    images: ["/product-images/custom-ring.png"],
  },
  {
    name: "Gold Pendant - Adinkra Symbol",
    category: "jewelry",
    priceXof: 540000,
    weightGrams: 12.3,
    description: "Symbolic pendant with Adinkra-inspired motif. Hallmarked, boxed, and accompanied by certification.",
    tags: ["pendant", "symbol", "heritage"],
    images: ["/product-images/jewelry-pendant.png"],
  },
  {
    name: "Textured Gold Cuff - Heritage Finish",
    category: "jewelry",
    priceXof: 980000,
    weightGrams: 22.0,
    description: "Hand-finished cuff with heritage texture. Hallmarked and delivered in premium packaging.",
    tags: ["cuff", "heritage", "limited"],
    images: ["/product-images/jewelry-bracelet.png"],
  },
  {
    name: "Gold Chain - Classic Link",
    category: "jewelry",
    priceXof: 760000,
    weightGrams: 18.5,
    description: "Classic-link gold chain crafted by a workshop. Hallmarked and delivered in secure packaging.",
    tags: ["chain", "classic"],
    images: ["/product-images/jewelry-chain.png"],
  },
  {
    name: "Gold Earrings - Minimal Pair",
    category: "jewelry",
    priceXof: 280000,
    weightGrams: 6.4,
    description: "Minimalist gold earrings for everyday wear. Hallmarked and boxed.",
    tags: ["earrings", "minimal"],
    images: ["/product-images/jewelry-earrings.png"],
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

async function ensureJewelerSeller(args: {
  tenantId: number;
  userId: number;
  index: number;
  apply: boolean;
}) {
  const neighborhood = COTONOU_NEIGHBORHOODS[args.index % COTONOU_NEIGHBORHOODS.length];
  const shopName = `Atelier Cotonou Gold ${String(args.index + 1).padStart(2, "0")}`;
  const slug = `cotonou-jeweler-${String(args.index + 1).padStart(2, "0")}`;

  const existing = await db.query.sellers.findFirst({
    where: and(eq(sellers.tenantId, args.tenantId), eq(sellers.slug, slug)),
  });
  if (existing) return { seller: existing, created: false };

  const { lat, lng } = jitterLatLng(BASE_LAT, BASE_LNG, 6);
  const now = new Date();
  const payload = {
    tenantId: args.tenantId,
    userId: args.userId,
    shopName,
    slug,
    description: `Synthetic jeweler profile for UX testing (Cotonou, ${neighborhood}). Heritage-inspired jewelry and curated gold art objects with hallmarking and secure delivery.`,
    latitude: lat.toFixed(7),
    longitude: lng.toFixed(7),
    streetAddress: `${neighborhood}, Cotonou, Benin`,
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
  slug: string;
  template: ProductTemplate;
  apply: boolean;
}) {
  const existing = await db.query.sellerProducts.findFirst({
    where: and(eq(sellerProducts.tenantId, args.tenantId), eq(sellerProducts.sellerId, args.sellerId), eq(sellerProducts.slug, args.slug)),
  });
  if (existing) return { created: false };

  const now = new Date();
  const priceVariation = 0.95 + Math.random() * 0.12;
  const price = Math.round(args.template.priceXof * priceVariation);
  const stockQuantity = args.template.category === "gold-art" ? 1 + Math.floor(Math.random() * 4) : 2 + Math.floor(Math.random() * 14);

  const payload = {
    tenantId: args.tenantId,
    sellerId: args.sellerId,
    categoryId: args.categoryId,
    name: args.template.name,
    slug: args.slug,
    description: args.template.description,
    shortDescription: "Cotonou maker | Hallmarked | Secure delivery",
    price: String(price),
    currency: "XOF",
    stockQuantity,
    weight: String(args.template.weightGrams),
    weightUnit: "g",
    isHandmade: true,
    status: "active",
    images: [...args.template.images],
    tags: [...args.template.tags, "cotonou", "benin", "gold"],
    certifications: ["Hallmarked", "Certificate Included", "Secure Delivery"],
    attributes: { seed: true, seedTag: "cotonou_jewelers_v1" },
    createdAt: now,
    updatedAt: now,
  } as any;

  if (!args.apply) {
    console.log(`[dry-run] would create product: ${args.slug} (sellerId=${args.sellerId})`);
    return { created: false };
  }

  await db.insert(sellerProducts).values(payload);
  return { created: true };
}

async function main() {
  const apply = process.argv.includes("--apply");
  if (apply && !truthy(process.env.ALLOW_COTONOU_JEWELERS_SEED)) {
    console.error(
      "[seed-cotonou-jewelers] Refusing to run in apply mode. Set ALLOW_COTONOU_JEWELERS_SEED=true to proceed.",
    );
    process.exit(1);
  }

  const isProd = String(process.env.NODE_ENV || "").trim().toLowerCase() === "production";
  const allowProd = process.argv.includes("--allow-production");
  if (apply && isProd && !allowProd) {
    console.error(
      "[seed-cotonou-jewelers] Refusing to run with NODE_ENV=production. Add --allow-production if you really intend this.",
    );
    process.exit(1);
  }

  const tenantKey = String(getArgValue("--tenant") || process.env.SEED_TENANT_KEY || "hoz")
    .trim()
    .toLowerCase();
  const sellerCount = Number.parseInt(String(getArgValue("--sellers") || process.env.SEED_SELLERS || "10"), 10);
  const productsPerSeller = Number.parseInt(String(getArgValue("--products-per-seller") || process.env.SEED_PRODUCTS_PER_SELLER || "5"), 10);

  if (!Number.isFinite(sellerCount) || sellerCount <= 0) throw new Error("Invalid --sellers");
  if (!Number.isFinite(productsPerSeller) || productsPerSeller <= 0) throw new Error("Invalid --products-per-seller");

  const tenant = await resolveTenant(tenantKey);
  const systemUser = await ensureSystemUser(apply);
  if (apply && !systemUser) throw new Error("Missing system user");

  const jewelryCategory = await ensureCategoryForTenant({
    tenantId: tenant.id,
    slug: "jewelry",
    name: "Jewelry",
    description: "Curated jewelry pieces from verified manufacturers",
    icon: "jewelry",
    color: "#A855F7",
    sortOrder: 3,
    apply,
  });

  const goldArtCategory = await ensureCategoryForTenant({
    tenantId: tenant.id,
    slug: "gold-art",
    name: "Gold Art",
    description: "Curated gold art objects from verified manufacturers",
    icon: "art",
    color: "#EAB308",
    sortOrder: 4,
    apply,
  });

  if (apply && (!jewelryCategory || !goldArtCategory)) {
    throw new Error("Missing required categories (jewelry, gold-art)");
  }

  const jewelryTemplates = PRODUCT_TEMPLATES.filter((t) => t.category === "jewelry");
  const artTemplates = PRODUCT_TEMPLATES.filter((t) => t.category === "gold-art");

  const planForSeller = (index: number) => {
    const artCount = productsPerSeller >= 5 ? 1 : 0;
    const jewelryCount = Math.max(0, productsPerSeller - artCount);
    const planned: Array<{ slot: string; template: ProductTemplate }> = [];

    for (let j = 0; j < jewelryCount; j++) {
      const template = jewelryTemplates[(index + j) % jewelryTemplates.length];
      planned.push({ slot: `j${String(j + 1).padStart(2, "0")}`, template });
    }
    for (let a = 0; a < artCount; a++) {
      const template = artTemplates[(index + a) % artTemplates.length];
      planned.push({ slot: `a${String(a + 1).padStart(2, "0")}`, template });
    }

    return planned;
  };

  let createdSellers = 0;
  let createdProducts = 0;
  let wouldCreateSellers = 0;
  let wouldCreateProducts = 0;

  for (let i = 0; i < sellerCount; i++) {
    const planned = planForSeller(i);

    if (!apply) {
      const sellerSlug = `cotonou-jeweler-${String(i + 1).padStart(2, "0")}`;
      const existingSeller = await db.query.sellers.findFirst({
        where: and(eq(sellers.tenantId, tenant.id), eq(sellers.slug, sellerSlug)),
        columns: { id: true, slug: true },
      });

      if (!existingSeller) {
        console.log(`[dry-run] would create seller: ${sellerSlug}`);
        wouldCreateSellers++;
        wouldCreateProducts += planned.length;
        continue;
      }

      console.log(`[dry-run] seller exists: ${sellerSlug} (id=${existingSeller.id})`);
      for (const item of planned) {
        const slug = `${sellerSlug}-${item.slot}-${slugify(item.template.name)}`.slice(0, 190);
        const existingProduct = await db.query.sellerProducts.findFirst({
          where: and(
            eq(sellerProducts.tenantId, tenant.id),
            eq(sellerProducts.sellerId, existingSeller.id),
            eq(sellerProducts.slug, slug),
          ),
          columns: { id: true },
        });
        if (!existingProduct) {
          console.log(`[dry-run] would create product: ${slug}`);
          wouldCreateProducts++;
        }
      }
      continue;
    }

    const sellerResult = await ensureJewelerSeller({ tenantId: tenant.id, userId: systemUser.id, index: i, apply });
    if (!sellerResult) continue;
    if (sellerResult.created) createdSellers++;

    const seller = sellerResult.seller;
    const sellerSlug = String(seller.slug || "");
    for (const item of planned) {
      const slug = `${sellerSlug}-${item.slot}-${slugify(item.template.name)}`.slice(0, 190);
      const categoryId = item.template.category === "gold-art" ? goldArtCategory!.id : jewelryCategory!.id;
      const res = await ensureProduct({
        tenantId: tenant.id,
        sellerId: seller.id,
        categoryId,
        slug,
        template: item.template,
        apply,
      });
      if (res.created) createdProducts++;
    }
  }

  console.log(
    [
      "",
      "[seed-cotonou-jewelers] Done.",
      `- mode: ${apply ? "apply" : "dry-run"}`,
      `- tenant: ${tenant.key} (id=${tenant.id})`,
      apply
        ? `- created sellers: ${createdSellers}`
        : `- would create sellers: ${wouldCreateSellers}`,
      apply
        ? `- created products: ${createdProducts}`
        : `- would create products: ${wouldCreateProducts}`,
      `- target: ${sellerCount} sellers, ${sellerCount * productsPerSeller} products`,
      "",
      apply
        ? "Tip: Re-run with --apply to add more inventory, or adjust --sellers/--products-per-seller."
        : "To apply: set ALLOW_COTONOU_JEWELERS_SEED=true and re-run with --apply.",
      "",
    ].join("\n"),
  );
}

main().catch((err) => {
  console.error("[seed-cotonou-jewelers] Failed:", err);
  process.exit(1);
});
