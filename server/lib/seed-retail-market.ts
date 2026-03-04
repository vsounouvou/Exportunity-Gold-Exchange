import { nanoid } from "nanoid";
import { asc, eq } from "drizzle-orm";
import { db } from "@db";
import { productCategories, sellerProducts, sellers, tenants, users } from "@db/schema";

type SeedCity = {
  countryCode: string;
  countryName: string;
  city: string;
  lat: number;
  lng: number;
};

async function resolveSeedTenantId(preferredKey: string = "bdo") {
  const preferred = await db.query.tenants.findFirst({
    where: eq(tenants.key, preferredKey),
  });
  if (preferred?.id) return preferred.id;

  const anyTenant = await db.query.tenants.findFirst({
    orderBy: asc(tenants.id),
  });
  if (anyTenant?.id) return anyTenant.id;

  throw new Error("No tenants found. Seed tenants first.");
}

const WEST_AFRICA_CITIES: SeedCity[] = [
  { countryCode: "CI", countryName: "Côte d'Ivoire", city: "Abidjan", lat: 5.3600, lng: -4.0083 },
  { countryCode: "CI", countryName: "Côte d'Ivoire", city: "Yamoussoukro", lat: 6.8206, lng: -5.2764 },
  { countryCode: "BJ", countryName: "Benin", city: "Cotonou", lat: 6.3703, lng: 2.3912 },
  { countryCode: "TG", countryName: "Togo", city: "Lomé", lat: 6.1725, lng: 1.2314 },
  { countryCode: "GH", countryName: "Ghana", city: "Accra", lat: 5.6037, lng: -0.1870 },
  { countryCode: "GH", countryName: "Ghana", city: "Kumasi", lat: 6.6666, lng: -1.6163 },
  { countryCode: "SN", countryName: "Senegal", city: "Dakar", lat: 14.7167, lng: -17.4677 },
  { countryCode: "GN", countryName: "Guinea", city: "Conakry", lat: 9.6412, lng: -13.5784 },
  { countryCode: "ML", countryName: "Mali", city: "Bamako", lat: 12.6392, lng: -8.0029 },
  { countryCode: "BF", countryName: "Burkina Faso", city: "Ouagadougou", lat: 12.3714, lng: -1.5197 },
];

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

function randomPhone(countryCode: string) {
  const digits = Math.floor(Math.random() * 90000000) + 10000000;
  if (countryCode === "GH") return `+233 ${digits}`;
  if (countryCode === "BJ") return `+229 ${digits}`;
  if (countryCode === "TG") return `+228 ${digits}`;
  if (countryCode === "SN") return `+221 ${digits}`;
  if (countryCode === "GN") return `+224 ${digits}`;
  if (countryCode === "ML") return `+223 ${digits}`;
  if (countryCode === "BF") return `+226 ${digits}`;
  return `+225 ${digits}`;
}

async function ensureSystemUser() {
  const existing = await db.query.users.findFirst({
    where: eq(users.email, "system@exportunity.com"),
  });
  if (existing) return existing;

  const [created] = await db
    .insert(users)
    .values({
      email: "system@exportunity.com",
      displayName: "Exportunity System",
      role: "admin",
      accountType: "System",
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();
  return created;
}

async function ensureProductCategory(tenantId: number, options: {
  slug: string;
  name: string;
  description: string;
  icon: string;
  sortOrder: number;
  color?: string;
}) {
  const existing = await db.query.productCategories.findFirst({
    where: eq(productCategories.slug, options.slug),
  });
  if (existing) return existing;

  const [created] = await db
    .insert(productCategories)
    .values({
      tenantId,
      name: options.name,
      slug: options.slug,
      description: options.description,
      icon: options.icon,
      color: options.color,
      sortOrder: options.sortOrder,
      isActive: true,
    })
    .returning();
  return created;
}

const RETAIL_GOLD_TEMPLATES = [
  {
    name: "Stamped Gold Piece - 10g (18K)",
    purity: "18K (750)",
    karat: 18,
    weightGrams: 10,
    description:
      "Stamped 18K gold piece (10g) with certification. Retail-friendly format for savings, gifting, and secure delivery.",
  },
  {
    name: "Stamped Gold Piece - 20g (18K)",
    purity: "18K (750)",
    karat: 18,
    weightGrams: 20,
    description:
      "Stamped 18K gold piece (20g) with serial + certification. Popular retail denomination across West Africa.",
  },
  {
    name: "Stamped Gold Piece - 20g (22K)",
    purity: "22K (916.7)",
    karat: 22,
    weightGrams: 20,
    description:
      "Stamped 22K gold piece (20g). Hallmarked and certified. Common retail format for gifting and secure custody.",
  },
  {
    name: "Stamped Gold Piece - 50g (22K)",
    purity: "22K (916.7)",
    karat: 22,
    weightGrams: 50,
    description:
      "Stamped 22K gold piece (50g) with certification. Retail-ready for delivery and secure custody.",
  },
] as const;

async function getReferenceXofPerGram() {
  const TROY_OZ_TO_GRAM = 31.1034768;
  try {
    const [fx, spot] = await Promise.all([
      fetch("https://open.er-api.com/v6/latest/USD").then((r) => r.json()),
      fetch("https://data-asg.goldprice.org/dbXRates/USD").then((r) => r.json()),
    ]);

    const usdToXof = Number(fx?.rates?.XOF) || 615.5;
    const usdPerOz = Number(spot?.items?.[0]?.xauPrice);
    if (!Number.isFinite(usdPerOz) || usdPerOz <= 0) throw new Error("bad spot");

    const purePerGramXof = (usdPerOz / TROY_OZ_TO_GRAM) * usdToXof;
    return {
      pure: purePerGramXof,
      k22: purePerGramXof * 0.9167,
      k18: purePerGramXof * 0.75,
    };
  } catch {
    const fallbackPure = 85000;
    return {
      pure: fallbackPure,
      k22: fallbackPure * 0.9167,
      k18: fallbackPure * 0.75,
    };
  }
}

const GOLD_ART_TEMPLATES = [
  {
    name: "Gold Portrait Bust - Limited Edition",
    weightGrams: 180.0,
    priceXof: 5200000,
    description: "Museum-grade gold portrait bust, handcrafted by a verified jewelry manufacturer. Delivered in a premium case with certification.",
    tags: ["heritage", "limited", "collector"],
    images: ["/product-images/art-bust.png"],
  },
  {
    name: "Gold Relief Medallion - Heritage Series",
    weightGrams: 85.0,
    priceXof: 2600000,
    description: "Sculptural gold relief medallion with contemporary finish. Produced in limited runs with hallmark and certificate.",
    tags: ["medallion", "heritage", "limited"],
    images: ["/product-images/art-medallion.png"],
  },
  {
    name: "Gold Ceremonial Object - Contemporary Form",
    weightGrams: 140.0,
    priceXof: 4100000,
    description: "Contemporary ceremonial form in gold, refined detailing and museum-grade presentation. Includes documentation and secure delivery.",
    tags: ["object", "heritage", "limited"],
    images: ["/product-images/art-ceremonial.png"],
  },
] as const;

const JEWELRY_TEMPLATES = [
  {
    name: "Heritage Signet Ring - Limited",
    weightGrams: 9.2,
    priceXof: 420000,
    description: "Limited-run signet ring from a verified manufacturer. Hallmarked, boxed, and accompanied by certification.",
    tags: ["ring", "heritage", "limited"],
    images: ["/product-images/custom-ring.png"],
  },
  {
    name: "Textured Gold Cuff - Limited",
    weightGrams: 22.0,
    priceXof: 980000,
    description: "Limited cuff with textured finish, made by a verified workshop. Hallmarked with certificate and premium packaging.",
    tags: ["cuff", "heritage", "limited"],
    images: ["/product-images/jewelry-bracelet.png"],
  },
  {
    name: "Gold Chain - Heritage Finish",
    weightGrams: 18.5,
    priceXof: 760000,
    description: "Heritage-finish chain crafted by a verified workshop. Hallmarked and delivered in premium packaging.",
    tags: ["chain", "heritage"],
    images: ["/product-images/jewelry-chain.png"],
  },
  {
    name: "Gold Pendant - Adinkra Symbol",
    weightGrams: 12.3,
    priceXof: 540000,
    description: "Symbolic pendant with Adinkra-inspired motif. Hallmarked, boxed, and accompanied by certification.",
    tags: ["pendant", "symbol", "heritage"],
    images: ["/product-images/jewelry-pendant.png"],
  },
] as const;

export async function seedRetailGoldSellersAsSellers() {
  const tenantId = await resolveSeedTenantId();
  const stampedCategory = await ensureProductCategory(tenantId, {
    name: "Stamped Gold",
    slug: "stamped",
    description: "Small stamped refined gold pieces (10g+) for retail buyers",
    icon: "stamped",
    color: "#10B981",
    sortOrder: 2,
  });

  const systemUser = await ensureSystemUser();

  const brandPrefixes = ["Akwa", "Sahel", "Lagoon", "Baobab", "Eburnie", "Gold Coast", "Adinkra", "Kora"];
  const brandSuffixes = ["Gold", "Precious", "Bullion", "Trading", "Retail", "Exchange", "Boutique"];

  let sellersCreated = 0;
  let productsCreated = 0;
  const reference = await getReferenceXofPerGram();

  for (const city of WEST_AFRICA_CITIES) {
    const name = `${brandPrefixes[Math.floor(Math.random() * brandPrefixes.length)]} ${brandSuffixes[Math.floor(Math.random() * brandSuffixes.length)]} (${city.city})`;
    const slug = `${slugify(name)}-${city.countryCode.toLowerCase()}-${nanoid(4)}`;

    const existingSeller = await db.query.sellers.findFirst({
      where: eq(sellers.slug, slug),
    });
    if (existingSeller) continue;

    const { lat, lng } = jitterLatLng(city.lat, city.lng, 6);

    const [seller] = await db
      .insert(sellers)
      .values({
        tenantId,
        userId: systemUser.id,
        shopName: name,
        slug,
        description: `Approved retail gold seller in ${city.city}, ${city.countryName}. Stamped pieces (10g+) with assay certification and secure delivery options.`,
        latitude: String(lat),
        longitude: String(lng),
        streetAddress: `${city.city}, ${city.countryName}`,
        phoneNumber: randomPhone(city.countryCode),
        status: "approved",
        isProducer: false,
        productionType: "gold_retail",
        rating: String((4.2 + Math.random() * 0.7).toFixed(2)),
        isDemo: true,
        approvedAt: new Date(),
        verifiedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    sellersCreated++;

    const selectedProducts = [...RETAIL_GOLD_TEMPLATES]
      .sort(() => Math.random() - 0.5)
      .slice(0, 4);

    for (const template of selectedProducts) {
      const perGram =
        template.karat === 22 ? reference.k22 : template.karat === 18 ? reference.k18 : reference.k22;
      const price = Math.round(perGram);
      const pieces = 15 + Math.floor(Math.random() * 160); // units

      await db.insert(sellerProducts).values({
        tenantId,
        sellerId: seller.id,
        categoryId: stampedCategory.id,
        name: template.name,
        slug: `${slugify(template.name)}-${seller.id}-${nanoid(6)}`,
        description: template.description,
        shortDescription: `${template.purity} | ${template.weightGrams}g unit | ${city.city}`,
        price: String(price),
        currency: "XOF",
        stockQuantity: pieces,
        weight: String(template.weightGrams),
        weightUnit: "g",
        isHandmade: false,
        status: "active",
        images: [],
        tags: ["gold", "retail", city.countryCode.toLowerCase(), city.city.toLowerCase(), template.purity.toLowerCase()],
        certifications: ["Assay Certificate Included", "Retail Hallmarked", "Secure Custody & Delivery"],
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      productsCreated++;
    }
  }

  return { sellersCreated, productsCreated };
}

export async function seedJewelryStoresAsSellers() {
  const tenantId = await resolveSeedTenantId();
  const jewelryCategory = await ensureProductCategory(tenantId, {
    name: "Jewelry",
    slug: "jewelry",
    description: "Curated jewelry pieces from verified manufacturers",
    icon: "jewelry",
    color: "#A855F7",
    sortOrder: 3,
  });
  const goldArtCategory = await ensureProductCategory(tenantId, {
    name: "Gold Art",
    slug: "gold-art",
    description: "Curated gold art objects from verified manufacturers",
    icon: "art",
    color: "#EAB308",
    sortOrder: 4,
  });

  const systemUser = await ensureSystemUser();

  const brandPrefixes = ["Maison", "Atelier", "Manufacture", "Studio", "Foundry", "Workshop", "Heritage"];
  const brandSuffixes = ["Or", "Gold", "Heritage", "Atelier", "Manufacturing", "Collections", "Works"];

  let sellersCreated = 0;
  let productsCreated = 0;

  for (const city of WEST_AFRICA_CITIES) {
    // Jewelry stores are more common in coastal/capital cities; sample ~60%
    if (Math.random() < 0.4) continue;

    const name = `${brandPrefixes[Math.floor(Math.random() * brandPrefixes.length)]} ${brandSuffixes[Math.floor(Math.random() * brandSuffixes.length)]} (${city.city})`;
    const slug = `${slugify(name)}-${city.countryCode.toLowerCase()}-${nanoid(4)}`;

    const existingSeller = await db.query.sellers.findFirst({
      where: eq(sellers.slug, slug),
    });
    if (existingSeller) continue;

    const { lat, lng } = jitterLatLng(city.lat, city.lng, 4);

    const [seller] = await db
      .insert(sellers)
      .values({
        tenantId,
        userId: systemUser.id,
        shopName: name,
        slug,
        description: `Verified jewelry manufacturer in ${city.city}, ${city.countryName}. Curated gold art objects and limited heritage pieces with hallmarking and certification.`,
        latitude: String(lat),
        longitude: String(lng),
        streetAddress: `${city.city}, ${city.countryName}`,
        phoneNumber: randomPhone(city.countryCode),
        sellerType: "jeweler",
        status: "approved",
        isProducer: true,
        productionType: "jewelry_manufacturing",
        rating: String((4.3 + Math.random() * 0.6).toFixed(2)),
        isDemo: true,
        approvedAt: new Date(),
        verifiedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    sellersCreated++;

    const selectedJewelry = [...JEWELRY_TEMPLATES].sort(() => Math.random() - 0.5).slice(0, 4);
    const selectedArt = [...GOLD_ART_TEMPLATES].sort(() => Math.random() - 0.5).slice(0, 2);

    for (const template of selectedJewelry) {
      const priceVariation = 0.95 + Math.random() * 0.12;
      const price = Math.round(template.priceXof * priceVariation);
      const qty = 2 + Math.floor(Math.random() * 18);

      await db.insert(sellerProducts).values({
        tenantId,
        sellerId: seller.id,
        categoryId: jewelryCategory.id,
        name: template.name,
        slug: `${slugify(template.name)}-${seller.id}-${nanoid(6)}`,
        description: template.description,
        shortDescription: `Verified maker | ${city.city}`,
        price: String(price),
        currency: "XOF",
        stockQuantity: qty,
        weight: String(template.weightGrams),
        weightUnit: "g",
        isHandmade: true,
        status: "active",
        images: [...template.images],
        tags: ["manufacturer", ...template.tags, city.countryCode.toLowerCase(), city.city.toLowerCase()],
        certifications: ["Verified Manufacturer", "Hallmarked", "Certificate Included", "Secure Delivery"],
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      productsCreated++;
    }

    for (const template of selectedArt) {
      const priceVariation = 0.95 + Math.random() * 0.12;
      const price = Math.round(template.priceXof * priceVariation);
      const qty = 1 + Math.floor(Math.random() * 6);

      await db.insert(sellerProducts).values({
        tenantId,
        sellerId: seller.id,
        categoryId: goldArtCategory.id,
        name: template.name,
        slug: `${slugify(template.name)}-${seller.id}-${nanoid(6)}`,
        description: template.description,
        shortDescription: `Curated gold art | ${city.city}`,
        price: String(price),
        currency: "XOF",
        stockQuantity: qty,
        weight: String(template.weightGrams),
        weightUnit: "g",
        isHandmade: true,
        status: "active",
        images: [...template.images],
        tags: ["manufacturer", ...template.tags, city.countryCode.toLowerCase(), city.city.toLowerCase()],
        certifications: ["Verified Manufacturer", "Hallmarked", "Certificate Included", "Secure Delivery"],
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      productsCreated++;
    }
  }

  return { sellersCreated, productsCreated };
}
