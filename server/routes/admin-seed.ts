import { Router } from "express";
import { nanoid } from "nanoid";
import { and, eq } from "drizzle-orm";
import { db } from "@db";
import { productCategories, sellerProducts, sellers, users } from "@db/schema";
import { ensureTenantAdmin } from "./utils/auth";

type SeedCity = {
  countryCode: string;
  countryName: string;
  city: string;
  lat: number;
  lng: number;
};

const WEST_AFRICA_CITIES: SeedCity[] = [
  { countryCode: "CI", countryName: "Cote d'Ivoire", city: "Abidjan", lat: 5.36, lng: -4.0083 },
  { countryCode: "CI", countryName: "Cote d'Ivoire", city: "Yamoussoukro", lat: 6.8206, lng: -5.2764 },
  { countryCode: "BJ", countryName: "Benin", city: "Cotonou", lat: 6.3703, lng: 2.3912 },
  { countryCode: "TG", countryName: "Togo", city: "Lome", lat: 6.1725, lng: 1.2314 },
  { countryCode: "GH", countryName: "Ghana", city: "Accra", lat: 5.6037, lng: -0.187 },
  { countryCode: "GH", countryName: "Ghana", city: "Kumasi", lat: 6.6666, lng: -1.6163 },
  { countryCode: "SN", countryName: "Senegal", city: "Dakar", lat: 14.7167, lng: -17.4677 },
  { countryCode: "GN", countryName: "Guinea", city: "Conakry", lat: 9.6412, lng: -13.5784 },
  { countryCode: "ML", countryName: "Mali", city: "Bamako", lat: 12.6392, lng: -8.0029 },
  { countryCode: "BF", countryName: "Burkina Faso", city: "Ouagadougou", lat: 12.3714, lng: -1.5197 },
];

function slugify(input: string): string {
  return String(input || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 140);
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

async function ensureSystemUser() {
  const existing = await db.query.users.findFirst({
    where: eq(users.email, "system@seed.local"),
  });
  if (existing) return existing;

  const [created] = await db
    .insert(users)
    .values({
      email: "system@seed.local",
      displayName: "Synthetic Seed System",
      role: "admin",
      accountType: "System",
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  return created;
}

async function ensureJewelryCategory(input: { tenantId: number }) {
  const existing = await db.query.productCategories.findFirst({
    where: and(eq(productCategories.tenantId, input.tenantId), eq(productCategories.slug, "jewelry")),
  });
  if (existing) return existing;

  const [created] = await db
    .insert(productCategories)
    .values({
      tenantId: input.tenantId,
      name: "Gold Art & Heritage",
      slug: "jewelry",
      description: "Curated gold art objects and limited heritage jewelry from verified manufacturers",
      icon: "heritage",
      color: "#EAB308",
      sortOrder: 3,
      isActive: true,
      createdAt: new Date(),
    })
    .returning();

  return created;
}

async function ensureGoldArtCategory(input: { tenantId: number }) {
  const existing = await db.query.productCategories.findFirst({
    where: and(eq(productCategories.tenantId, input.tenantId), eq(productCategories.slug, "gold-art")),
  });
  if (existing) return existing;

  const [created] = await db
    .insert(productCategories)
    .values({
      tenantId: input.tenantId,
      name: "Gold Art",
      slug: "gold-art",
      description: "Collector pieces and gold heritage objects from verified makers",
      icon: "heritage",
      color: "#EAB308",
      sortOrder: 4,
      isActive: true,
      createdAt: new Date(),
    })
    .returning();

  return created;
}

const STYLE_TAGS = ["heritage", "modern", "minimalist"] as const;
type StyleTag = (typeof STYLE_TAGS)[number];

const PRODUCT_TYPES = ["ring", "bracelet", "chain", "pendant", "earrings", "medallion", "bust", "ceremonial"] as const;
type ProductType = (typeof PRODUCT_TYPES)[number];

function pick<T>(arr: readonly T[]) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randInt(min: number, max: number) {
  return Math.floor(min + Math.random() * (max - min + 1));
}

function randFloat(min: number, max: number, decimals = 1) {
  const raw = min + Math.random() * (max - min);
  const p = Math.pow(10, decimals);
  return Math.round(raw * p) / p;
}

function appendQuery(url: string, query: Record<string, string>) {
  const sep = url.includes("?") ? "&" : "?";
  const qs = Object.entries(query)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
  return `${url}${sep}${qs}`;
}

function buildSyntheticAngleImages(base: {
  primary: string;
  variants: string[];
  desiredTotal: number;
}) {
  const angles = ["front", "three-quarter", "side", "back", "close-up", "packaging", "on-body"];
  const total = Math.max(4, Math.min(7, base.desiredTotal));
  const variants = base.variants.length ? base.variants : [base.primary];
  const images = [base.primary];
  for (let idx = 1; idx < total; idx++) {
    const candidate = variants[(idx - 1) % variants.length];
    images.push(
      appendQuery(candidate, {
        angle: angles[(idx - 1) % angles.length] || "angle",
        v: nanoid(6),
      }),
    );
  }
  return images;
}

function imageBaseForType(type: ProductType) {
  if (type === "ring") return { primary: "/product-images/custom-ring.png", variants: ["/product-images/custom-ring-02.png", "/product-images/custom-ring.svg"] };
  if (type === "bracelet") return { primary: "/product-images/jewelry-bracelet.png", variants: ["/product-images/jewelry-bracelet-02.png", "/product-images/jewelry-bracelet.svg"] };
  if (type === "chain") return { primary: "/product-images/jewelry-chain.png", variants: ["/product-images/jewelry-chain-02.png", "/product-images/jewelry-chain.svg"] };
  if (type === "pendant") return { primary: "/product-images/jewelry-pendant.png", variants: ["/product-images/jewelry-pendant.svg"] };
  if (type === "earrings") return { primary: "/product-images/jewelry-earrings.png", variants: ["/product-images/jewelry-earrings.svg"] };
  if (type === "medallion") return { primary: "/product-images/art-medallion.png", variants: ["/product-images/art-medallion-02.png", "/product-images/art-medallion.svg"] };
  if (type === "bust") return { primary: "/product-images/art-bust.png", variants: ["/product-images/art-bust-02.png", "/product-images/art-bust.svg"] };
  return { primary: "/product-images/art-ceremonial.png", variants: ["/product-images/art-ceremonial.svg"] };
}

function productName(style: StyleTag, type: ProductType) {
  const heritage = ["Adinkra", "Heritage", "Ancestral", "Kente", "Mask", "Dynasty", "Legacy"];
  const modern = ["Modern", "Contour", "Arc", "Studio", "Gallery", "Prism", "Nova"];
  const minimalist = ["Minimal", "Slim", "Line", "Pure", "Quiet", "Essential", "Mono"];

  const prefix = style === "heritage" ? pick(heritage) : style === "modern" ? pick(modern) : pick(minimalist);
  const suffix =
    type === "ring"
      ? "Signet Ring"
      : type === "bracelet"
        ? "Cuff Bracelet"
        : type === "chain"
          ? "Gold Chain"
          : type === "pendant"
            ? "Pendant"
            : type === "earrings"
              ? "Earrings"
              : type === "medallion"
                ? "Relief Medallion"
                : type === "bust"
                  ? "Portrait Bust"
                  : "Ceremonial Object";

  const edition = randInt(1, 99);
  return `${prefix} ${suffix} — Edition ${edition}`;
}

function productDescription(style: StyleTag, type: ProductType, city: SeedCity) {
  const tone =
    style === "heritage"
      ? "Heritage-inspired gold piece with hallmarking and certificate. Synthetic catalog item (fictional maker)."
      : style === "modern"
        ? "Modern gold design with clean geometry. Hallmarked and delivered in premium packaging. Synthetic catalog item (fictional maker)."
        : "Minimalist gold piece focused on material and finish. Hallmarked with certificate. Synthetic catalog item (fictional maker).";

  const typeHint =
    type === "ring"
      ? "Ring sizing on request."
      : type === "bracelet"
        ? "Comfort-fit cuff profile."
        : type === "chain"
          ? "Secure clasp and polished finish."
          : type === "pendant"
            ? "Includes chain option."
            : type === "earrings"
              ? "Lightweight wear with secure backs."
              : type === "medallion"
                ? "Sculptural relief detailing."
                : type === "bust"
                  ? "Museum-grade presentation case."
                  : "Documented provenance notes included.";

  return `${tone} ${typeHint} City tag: ${city.city}.`;
}

async function seedSyntheticJewelers(input: { tenantId: number; count: number }) {
  const [jewelryCategory, goldArtCategory] = await Promise.all([
    ensureJewelryCategory({ tenantId: input.tenantId }),
    ensureGoldArtCategory({ tenantId: input.tenantId }),
  ]);
  const systemUser = await ensureSystemUser();

  const count = Math.max(10, Math.min(30, Math.trunc(input.count)));
  const createdAt = new Date();

  const namePrefixes = ["Atelier", "Maison", "Studio", "Manufacture", "Workshop", "Foundry", "Heritage"];
  const nameTokens = ["Or", "Gold", "Heritage", "Collections", "Works", "Craft", "Edition"];

  let sellersCreated = 0;
  let productsCreated = 0;

  for (let i = 0; i < count; i++) {
    const city = pick(WEST_AFRICA_CITIES);
    const style: StyleTag = pick(STYLE_TAGS);
    const name = `${pick(namePrefixes)} ${pick(nameTokens)} (${city.city})`;
    const slug = `${slugify(name)}-${city.countryCode.toLowerCase()}-${nanoid(6)}`;

    const { lat, lng } = jitterLatLng(city.lat, city.lng, 7);

    const [seller] = await db
      .insert(sellers)
      .values({
        tenantId: input.tenantId,
        userId: systemUser.id,
        shopName: name,
        slug,
        description: `Fictional jeweler studio in ${city.city}, ${city.countryName}. Style: ${style}. Synthetic seed seller (no real address/phone).`,
        sellerType: "jeweler",
        status: "approved",
        isProducer: true,
        productionType: "jewelry_manufacturing",
        productionProof: {
          synthetic: true,
          cityTags: [city.city],
          styleTags: [style],
          countryCode: city.countryCode,
        },
        // No real addresses or phone numbers
        streetAddress: null,
        phoneNumber: null,
        email: null,
        website: null,
        latitude: String(lat),
        longitude: String(lng),
        isDemo: true,
        verifiedAt: createdAt,
        approvedAt: createdAt,
        createdAt,
        updatedAt: createdAt,
      } as any)
      .returning();

    sellersCreated += 1;

    const productCount = randInt(15, 30);
    for (let p = 0; p < productCount; p++) {
      const type: ProductType = pick(PRODUCT_TYPES);
      const name = productName(style, type);
      const category =
        type === "bust" || type === "medallion" || type === "ceremonial" ? goldArtCategory : jewelryCategory;

      const weightGrams =
        type === "bust" ? randFloat(120, 240, 1) : type === "medallion" ? randFloat(35, 110, 1) : randFloat(4.5, 28, 1);
      const baseXofPerGram = style === "heritage" ? 16000 : style === "modern" ? 15000 : 14000;
      const craftsmanship = type === "bust" ? 2.6 : type === "medallion" ? 2.2 : 1.7;
      const price = Math.round(weightGrams * baseXofPerGram * craftsmanship);

      const desiredImageCount = randInt(4, 7);
      const base = imageBaseForType(type);
      const images = buildSyntheticAngleImages({
        primary: base.primary,
        variants: [base.primary, ...base.variants],
        desiredTotal: desiredImageCount,
      });

      await db.insert(sellerProducts).values({
        tenantId: input.tenantId,
        sellerId: seller.id,
        categoryId: category.id,
        name,
        slug: `${slugify(name)}-${seller.id}-${nanoid(6)}`,
        description: productDescription(style, type, city),
        shortDescription: `Made by ${seller.shopName} • ${style}`,
        price: String(price),
        currency: "XOF",
        stockQuantity: randInt(2, 18),
        weight: String(weightGrams),
        weightUnit: "g",
        isHandmade: true,
        status: "active",
        images,
        tags: [style, "synthetic", String(category.slug), city.city.toLowerCase(), city.countryCode.toLowerCase(), type],
        attributes: {
          synthetic: true,
          madeBySellerId: seller.id,
          style,
          type,
          angles: images.map((url) => ({ url })),
        },
        createdAt,
        updatedAt: createdAt,
      } as any);

      productsCreated += 1;
    }
  }

  return { sellersCreated, productsCreated };
}

const router = Router();

router.use(ensureTenantAdmin);

router.post("/jewelers", async (req: any, res) => {
  try {
    const tenant = req.tenant;
    if (!tenant) return res.status(400).json({ ok: false, message: "tenant required" });
    const count = Number(req.body?.count ?? req.body?.sellers ?? 20);
    const result = await seedSyntheticJewelers({ tenantId: tenant.id, count: Number.isFinite(count) ? count : 20 });
    res.status(201).json({ ok: true, tenantKey: tenant.key, ...result });
  } catch (err: any) {
    res.status(500).json({ ok: false, message: err?.message || "seed failed" });
  }
});

export default router;
