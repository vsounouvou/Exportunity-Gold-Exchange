import { promises as fs } from "node:fs";
import path from "node:path";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@db";
import {
  geoCities,
  geoContinents,
  geoCountries,
  geoRegions,
  productCategories,
  sellerProducts,
  sellers,
  tenants,
  users,
} from "@db/schema";
import { ensureMarketplaceMapTables } from "../server/lib/marketplace/ensureTables";
import { normalizeMarkerStyleKey, upsertDefaultMapMarkerStyles } from "../server/lib/marketplace/mapMarkers";

const SEED_VERSION = "rayon-retail-seed-v1";
const SEED_SKU_PREFIX = "RRSV1";
const DEFAULT_TENANT_KEY = String(process.env.SEED_TENANT_KEY || "exportunity").trim().toLowerCase();

type CanonicalCategory =
  | "groceries"
  | "restaurants"
  | "fashion"
  | "beauty"
  | "electronics"
  | "phones"
  | "home"
  | "pharmacy"
  | "building"
  | "auto";

type SeedCity = {
  id: "CI-ABJ" | "BJ-COO";
  countryCode2: "CI" | "BJ";
  countryCode3: "CIV" | "BEN";
  countryName: string;
  city: string;
  region: string;
  lat: number;
  lng: number;
  phonePrefix: string;
  timezone: string;
};

type CategoryPlan = {
  id: number;
  slug: string;
  name: string;
  canonical: CanonicalCategory;
  mapMarkerKey: string;
};

type SeedShop = {
  seedId: string;
  name: string;
  cityId: SeedCity["id"];
  type: "anchor" | "sme";
  markerKey: CanonicalCategory | "shop_default";
  vertical: string;
  address: string;
  tags: string[];
};

type UpsertedShop = {
  id: number;
  shopName: string;
  slug: string;
  cityId: SeedCity["id"];
  markerKey: string;
};

const CITIES: SeedCity[] = [
  {
    id: "CI-ABJ",
    countryCode2: "CI",
    countryCode3: "CIV",
    countryName: "Cote d'Ivoire",
    city: "Abidjan",
    region: "Abidjan District",
    lat: 5.3364,
    lng: -4.0267,
    phonePrefix: "+225",
    timezone: "Africa/Abidjan",
  },
  {
    id: "BJ-COO",
    countryCode2: "BJ",
    countryCode3: "BEN",
    countryName: "Benin",
    city: "Cotonou",
    region: "Littoral Department",
    lat: 6.3703,
    lng: 2.3912,
    phonePrefix: "+229",
    timezone: "Africa/Porto-Novo",
  },
];

const FALLBACK_CATEGORIES: Array<{ slug: CanonicalCategory; name: string; mapMarkerKey: CanonicalCategory }> = [
  { slug: "groceries", name: "Epicerie", mapMarkerKey: "groceries" },
  { slug: "restaurants", name: "Restauration", mapMarkerKey: "restaurants" },
  { slug: "fashion", name: "Mode", mapMarkerKey: "fashion" },
  { slug: "beauty", name: "Beaute & Cosmetiques", mapMarkerKey: "beauty" },
  { slug: "electronics", name: "Electronique", mapMarkerKey: "electronics" },
  { slug: "phones", name: "Telephonie", mapMarkerKey: "phones" },
  { slug: "home", name: "Maison & Deco", mapMarkerKey: "home" },
  { slug: "pharmacy", name: "Parapharmacie", mapMarkerKey: "pharmacy" },
  { slug: "building", name: "Bricolage & Materiaux", mapMarkerKey: "building" },
  { slug: "auto", name: "Auto & Moto", mapMarkerKey: "auto" },
];

const CATEGORY_PRICE_RANGES: Record<CanonicalCategory, [number, number]> = {
  groceries: [500, 25000],
  restaurants: [1500, 15000],
  fashion: [5000, 75000],
  beauty: [1500, 35000],
  electronics: [5000, 350000],
  phones: [1000, 250000],
  home: [3000, 200000],
  pharmacy: [1000, 40000],
  building: [2000, 150000],
  auto: [2000, 400000],
};

function parseLines(block: string) {
  return block
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

const CATEGORY_PRODUCTS: Record<CanonicalCategory, string[]> = {
  groceries: parseLines(`
Riz local premium 5kg
Huile vegetale 1L
Tomate concentree (boite) x6
Sucre 1kg
Cafe moulu 250g
The gingembre-citron (20 sachets)
Spaghetti 500g x3
Farine de mais 2kg
Haricots rouges 1kg
Piment sec (sachet)
Lait en poudre 400g
Eau minerale pack 6
Jus bissap naturel 1L
Miel local 250g
Beurre d'arachide 500g
Biscuits enfants (pack)
Sel iode 1kg
Oignons 2kg
Pommes de terre 2kg
Kit Cuisine rapide (assortiment)
`),
  restaurants: parseLines(`
Attiéké poisson braisé
Poulet braise + alloco
Garba thon + piment
Sauce graine + riz
Kedjenou poulet
Foutou banane + sauce arachide
Akassa + sauce tomate pimentee
Pate rouge + poisson fume
Ailes de poulet epicees
Brochettes boeuf (x6)
Burger afro-fusion
Salade avocat-crevettes
Jus de gingembre maison 50cl
Jus de tamarin 50cl
Smoothie mangue 50cl
Box dejeuner bureau
Box famille
Dessert tapioca coco
Dessert banane plantain caramelisee
Menu Street food decouverte
`),
  fashion: parseLines(`
Chemise wax homme
Robe wax femme
Ensemble boubou moderne
Pantalon lin leger
Polo premium
T-shirt coton Africa forward
Sandales artisanales cuir
Sneakers daily
Sac cabas wax
Ceinture cuir
Casquette brodee
Veste legere
Jupe midi
Chemisier soie synthetique
Tenue enfant wax
Pack couple wax (2 tenues)
Echarpe / foulard
Accessoire boutons manchette
Pack bureau (chemise + pantalon)
Costume traditionnel sur mesure (service)
`),
  beauty: parseLines(`
Beurre de karité brut 250g
Huile de coco 200ml
Huile de ricin 100ml
Savon noir africain
Creme hydratante peaux melaninees
Gel aloe vera
Shampooing doux
Apres-shampooing nourrissant
Masque cheveux
Lait corporel parfume
Parfum roll-on
Kit manucure
Rouge a levres longue tenue
Palette maquillage nude
Fond de teint teintes foncees
Brosse + peigne afro
Gel coiffant
Kit routine peau (3 produits)
Kit routine cheveux (3 produits)
Service tresses + soin (prestation)
`),
  electronics: parseLines(`
TV LED 32"
TV LED 43"
Barre de son
Casque Bluetooth
Ecouteurs TWS
Enceinte portable
Routeur 4G
Cle USB 64GB
Disque dur 1TB
Laptop i5 reconditionne
Laptop entree de gamme
Imprimante Wi-Fi
Onduleur 1200VA
Multiprise parafoudre
Camera IP Wi-Fi
Dispositif GPS tracker
Lampe solaire rechargeable
Power station mini
Ventilateur silencieux
Service reparation laptop diagnostic
`),
  phones: parseLines(`
Smartphone budget 64GB
Smartphone mid-range 128GB
Smartphone premium
Telephone feature phone
Powerbank 10,000mAh
Powerbank 20,000mAh
Chargeur rapide
Cable USB-C
Cable iPhone
Coque anti-choc
Verre trempe
Support voiture
Kit mains libres
Montre connectee
Bracelet connecte
Ring light mini
Trepied smartphone
Micro cravate
Service remplacement ecran
Service deblocage / parametrage
`),
  home: parseLines(`
Rideaux salon
Tapis 2m
Parure de lit
Oreillers x2
Set vaisselle 18 pieces
Set verres 6
Poele antiadhesive
Marmite 8L
Bouilloire electrique
Mixeur
Machine a cafe simple
Diffuseur parfum
Bougies parfumees
Etagere murale
Table basse
Chaise design (unite)
Moustiquaire premium
Ventilateur colonne
Kit rangement cuisine
Service decoration interieure conseil
`),
  pharmacy: parseLines(`
Thermometre digital
Tensiometre
Gel hydroalcoolique
Vitamine C
Zinc + magnesium
Spray gorge
Sirop toux (OTC)
Creme anti-moustiques
Creme brulures legeres
Pansements + compresses
Antiseptique
Serum physiologique
Protection solaire
Creme bebe
Lingettes bebe
Savon dermato
Shampooing anti-pelliculaire
Baume levres
Kit trousse premiers soins
Service conseil parapharmacie
`),
  building: parseLines(`
Sac ciment 50kg
Peinture blanche 20L
Peinture couleur 10L
Vernis bois 5L
Carrelage 1m2 (pack)
Robinetterie set
Douchette + flexible
Ampoules LED x10
Cable electrique 50m
Prises + interrupteurs (pack)
Scie + marteau kit
Perceuse (entree de gamme)
Disques meuleuse
Colle carrelage
Sable (service livraison)
Gravier (service livraison)
Porte interieure
Fenetre aluminium (sur commande)
Service devis renovation
Service installation plomberie
`),
  auto: parseLines(`
Batterie voiture
Huile moteur 5L
Filtre a huile
Filtre a air
Plaquettes frein
Liquide refroidissement
Balais essuie-glace
Ampoules voiture
Pneu (unite)
Compresseur mini
Chargeur batterie
Casque moto
Gants moto
Huile moto
Chaine moto
Bougie moteur
Kit outils voiture
Tapis voiture
Service vidange
Service diagnostic moteur
`),
};

const ANCHOR_SHOPS: SeedShop[] = [
  {
    seedId: "CI-ABJ-CARREFOUR",
    name: "Carrefour Cote d'Ivoire (Abidjan)",
    cityId: "CI-ABJ",
    type: "anchor",
    markerKey: "groceries",
    vertical: "retail_chain",
    address: "Marcory Zone 4, Abidjan",
    tags: ["anchor", "chain", "groceries"],
  },
  {
    seedId: "CI-ABJ-PLAYCE",
    name: "PlaYce Marcory Retail Hub",
    cityId: "CI-ABJ",
    type: "anchor",
    markerKey: "home",
    vertical: "retail_hub",
    address: "Boulevard Valery Giscard d'Estaing, Marcory",
    tags: ["anchor", "mall", "retail"],
  },
  {
    seedId: "CI-ABJ-PROSUMA",
    name: "Groupe Prosuma Supermarket Network",
    cityId: "CI-ABJ",
    type: "anchor",
    markerKey: "groceries",
    vertical: "supermarket",
    address: "Cocody Deux Plateaux, Abidjan",
    tags: ["anchor", "supermarket", "groceries"],
  },
  {
    seedId: "CI-ABJ-CFAO-TOYOTA",
    name: "CFAO Mobility Toyota Cote d'Ivoire",
    cityId: "CI-ABJ",
    type: "anchor",
    markerKey: "auto",
    vertical: "automotive",
    address: "Zone Industrielle, Vridi, Abidjan",
    tags: ["anchor", "auto", "mobility"],
  },
  {
    seedId: "BJ-COO-EREVAN-SUPERU",
    name: "Erevan Super U Cotonou",
    cityId: "BJ-COO",
    type: "anchor",
    markerKey: "groceries",
    vertical: "supermarket",
    address: "Ganhi, Cotonou",
    tags: ["anchor", "supermarket", "groceries"],
  },
];

const SME_NAME_BY_CITY: Record<SeedCity["id"], string[]> = {
  "CI-ABJ": [
    "Nouchi Market Marcory",
    "Cocody Tech Corner",
    "Yopougon Beauty Lab",
    "Adjame Fashion Studio",
    "Treichville Home Atelier",
    "Abobo Phone Spot",
    "Koumassi Build Depot",
    "Riviera Pharma Plus",
    "Port-Bouet Auto Parts Hub",
    "Plateau Lunch Box",
  ],
  "BJ-COO": [
    "Dantokpa Select",
    "Cadjehoun Tech",
    "Ganhi Maison",
    "Akpakpa Beauty Point",
    "Fidjrosse Style House",
    "Haie Vive Grocery Link",
    "Ste Rita Phone Market",
    "Tokpa Build Center",
    "Missebo Auto Moto Supply",
    "Cocotomey Food Corner",
  ],
};

const SME_VERTICAL_SEQUENCE: CanonicalCategory[] = [
  "groceries",
  "restaurants",
  "fashion",
  "beauty",
  "phones",
  "electronics",
  "home",
  "pharmacy",
  "building",
  "auto",
];

const BRAND_POOL = ["Savana", "Lagoon", "Monarch", "BlueLine", "Kora", "Dantokpa", "Akan"];
function truthy(value: unknown) {
  return ["1", "true", "yes", "y", "on"].includes(String(value || "").trim().toLowerCase());
}

function parseArg(flag: string): string | null {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return null;
  return process.argv[idx + 1] || null;
}

function slugify(value: string) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function hash32(input: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), t | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function randomInt(seed: string, min: number, max: number) {
  const rand = mulberry32(hash32(seed))();
  return Math.round(min + rand * (max - min));
}

function randomFloat(seed: string, min: number, max: number, decimals = 1) {
  const rand = mulberry32(hash32(seed))();
  const value = min + rand * (max - min);
  return Number(value.toFixed(decimals));
}

function randomPhone(seedCity: SeedCity, seed: string) {
  const n = randomInt(seed, 10_000_000, 99_999_999);
  return `${seedCity.phonePrefix} ${String(n)}`;
}

function offsetCoordinates(baseLat: number, baseLng: number, seed: string, minKm = 2, maxKm = 8) {
  const rng = mulberry32(hash32(seed));
  const radiusKm = minKm + rng() * (maxKm - minKm);
  const angle = rng() * Math.PI * 2;
  const latOffset = (radiusKm * Math.cos(angle)) / 111;
  const lngOffset = (radiusKm * Math.sin(angle)) / (111 * Math.cos((baseLat * Math.PI) / 180));
  return {
    lat: Number((baseLat + latOffset).toFixed(7)),
    lng: Number((baseLng + lngOffset).toFixed(7)),
  };
}

function normalizeCategoryText(value: unknown) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function inferCanonicalCategory(slug: string, name: string): CanonicalCategory | null {
  const text = `${normalizeCategoryText(slug)} ${normalizeCategoryText(name)}`;
  const contains = (...terms: string[]) => terms.some((term) => text.includes(term));

  if (contains("grocer", "epicer", "aliment", "food", "bakery", "boulanger", "patis", "beverage", "boisson", "drink"))
    return "groceries";
  if (contains("restaur", "street food", "meal", "cuisine", "plat", "ready meal")) return "restaurants";
  if (contains("fashion", "mode", "textile", "cloth", "vetement", "wear", "style")) return "fashion";
  if (contains("beaut", "cosmet", "salon", "karite")) return "beauty";
  if (contains("electronic", "tv", "laptop", "router", "repair", "repar", "service")) return "electronics";
  if (contains("phone", "telephon", "smartphone", "mobile")) return "phones";
  if (contains("home", "deco", "maison", "interieur", "furniture", "stationery", "papeter", "office", "bureau"))
    return "home";
  if (contains("pharma", "para", "medical", "health")) return "pharmacy";
  if (contains("build", "materiau", "quinca", "construction", "cement", "agric", "intrant", "farm")) return "building";
  if (contains("auto", "moto", "vehicle", "car", "mobility", "transport", "logistic")) return "auto";
  return null;
}

function fullDescription(input: {
  title: string;
  categoryName: string;
  city: string;
  country: string;
  shopName: string;
  etaMinutes: number;
}): string {
  return [
    `${input.title} by ${input.shopName} in ${input.city}, ${input.country}.`,
    `- Category: ${input.categoryName}`,
    `- Quality check completed before listing; demo-ready catalog content.`,
    `- Delivery ETA in-city: about ${input.etaMinutes} minutes depending on traffic.`,
    `- Pickup available at the store counter during opening hours.`,
    `- Returns: demo policy with 24h issue reporting and replacement support.`,
    `- Support: chat assistance available for substitutions and order tracking.`,
  ].join("\n");
}

async function resolveTenant(tenantKey: string) {
  const tenant = await db.query.tenants.findFirst({ where: eq(tenants.key, tenantKey) });
  if (!tenant) throw new Error(`Tenant not found for key '${tenantKey}'.`);
  return tenant;
}

async function ensureSeedUser() {
  const seedEmail = "seed.retail@exportunity.local";
  const existing = await db.query.users.findFirst({ where: eq(users.email, seedEmail) });
  if (existing) return existing;

  const [created] = await db
    .insert(users)
    .values({
      displayName: "Retail Seed Bot",
      email: seedEmail,
      role: "admin",
      accountType: "System",
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any)
    .returning();

  return created;
}

async function ensureContinentAfrica() {
  const existing = await db.query.geoContinents.findFirst({ where: eq(geoContinents.code, "AF") });
  if (existing) return existing;
  const [created] = await db.insert(geoContinents).values({ code: "AF", name: "Africa", createdAt: new Date() }).returning();
  return created;
}

async function ensureCountry(input: {
  continentId: number;
  code3: string;
  name: string;
  currency: string;
  phoneCode: string;
}) {
  const all = await db.select().from(geoCountries);
  const existing =
    all.find((country: any) => String(country.code || "").toUpperCase() === input.code3.toUpperCase()) ||
    all.find((country: any) => normalizeCategoryText(country.name) === normalizeCategoryText(input.name));
  if (existing) return existing;

  const [created] = await db
    .insert(geoCountries)
    .values({
      continentId: input.continentId,
      code: input.code3.toUpperCase(),
      name: input.name,
      currency: input.currency,
      phoneCode: input.phoneCode,
      isActive: true,
      tier: 1,
      createdAt: new Date(),
    })
    .returning();
  return created;
}

async function ensureRegion(input: { countryId: number; name: string; code: string }) {
  const existing = await db.query.geoRegions.findFirst({
    where: and(eq(geoRegions.countryId, input.countryId), eq(geoRegions.name, input.name)),
  });
  if (existing) return existing;

  const [created] = await db
    .insert(geoRegions)
    .values({
      countryId: input.countryId,
      name: input.name,
      code: input.code,
      createdAt: new Date(),
    })
    .returning();
  return created;
}

async function ensureCity(input: { regionId: number; name: string; lat: number; lng: number; timezone: string }) {
  const existing = await db.query.geoCities.findFirst({
    where: and(eq(geoCities.regionId, input.regionId), eq(geoCities.name, input.name)),
  });
  if (existing) {
    await db
      .update(geoCities)
      .set({
        latitude: input.lat.toFixed(7),
        longitude: input.lng.toFixed(7),
        timezone: input.timezone,
      } as any)
      .where(eq(geoCities.id, existing.id));
    return existing;
  }

  const [created] = await db
    .insert(geoCities)
    .values({
      regionId: input.regionId,
      name: input.name,
      latitude: input.lat.toFixed(7),
      longitude: input.lng.toFixed(7),
      timezone: input.timezone,
      createdAt: new Date(),
    })
    .returning();
  return created;
}

async function ensureGeoData() {
  const continent = await ensureContinentAfrica();
  const cityRefs: Record<SeedCity["id"], { countryId: number; regionId: number; cityId: number }> = {
    "CI-ABJ": { countryId: 0, regionId: 0, cityId: 0 },
    "BJ-COO": { countryId: 0, regionId: 0, cityId: 0 },
  };

  for (const city of CITIES) {
    const country = await ensureCountry({
      continentId: continent.id,
      code3: city.countryCode3,
      name: city.countryName,
      currency: "XOF",
      phoneCode: city.phonePrefix,
    });
    const region = await ensureRegion({
      countryId: country.id,
      name: city.region,
      code: slugify(city.region).toUpperCase().slice(0, 12),
    });
    const cityRow = await ensureCity({
      regionId: region.id,
      name: city.city,
      lat: city.lat,
      lng: city.lng,
      timezone: city.timezone,
    });
    cityRefs[city.id] = { countryId: country.id, regionId: region.id, cityId: cityRow.id };
  }

  return cityRefs;
}

function buildSmeShops(): SeedShop[] {
  const list: SeedShop[] = [];
  for (const city of CITIES) {
    const names = SME_NAME_BY_CITY[city.id];
    names.forEach((name, index) => {
      const markerKey = SME_VERTICAL_SEQUENCE[index % SME_VERTICAL_SEQUENCE.length];
      list.push({
        seedId: `${city.id}-SME-${String(index + 1).padStart(2, "0")}`,
        name,
        cityId: city.id,
        type: "sme",
        markerKey,
        vertical: markerKey,
        address: `${city.city} ${index + 1}, ${city.countryName}`,
        tags: ["sme", city.city.toLowerCase(), markerKey],
      });
    });
  }
  return list;
}

async function ensureCategories(tenantId: number, tenantKey: string): Promise<CategoryPlan[]> {
  const existing = await db
    .select()
    .from(productCategories)
    .where(eq(productCategories.tenantId, tenantId))
    .orderBy(asc(productCategories.sortOrder), asc(productCategories.name));

  const canonicalKeys = FALLBACK_CATEGORIES.map((c) => c.slug);

  if (!existing.length) {
    const plans: CategoryPlan[] = [];
    for (let i = 0; i < FALLBACK_CATEGORIES.length; i += 1) {
      const fallback = FALLBACK_CATEGORIES[i];
      let chosenSlug = fallback.slug;
      let row = await db.query.productCategories.findFirst({ where: eq(productCategories.slug, chosenSlug) });
      if (row && row.tenantId !== tenantId) {
        chosenSlug = `${fallback.slug}-${tenantKey}`;
        row = await db.query.productCategories.findFirst({ where: eq(productCategories.slug, chosenSlug) });
      }

      if (row && row.tenantId === tenantId) {
        await db
          .update(productCategories)
          .set({ name: fallback.name, mapMarkerKey: fallback.mapMarkerKey, isActive: true, sortOrder: i + 1 } as any)
          .where(eq(productCategories.id, row.id));
      } else if (!row) {
        const [created] = await db
          .insert(productCategories)
          .values({
            tenantId,
            name: fallback.name,
            slug: chosenSlug,
            mapMarkerKey: fallback.mapMarkerKey,
            description: `Retail category seeded by ${SEED_VERSION}`,
            sortOrder: i + 1,
            isActive: true,
            createdAt: new Date(),
          } as any)
          .returning();
        row = created;
      }

      if (!row) continue;
      plans.push({
        id: row.id,
        slug: row.slug,
        name: row.name,
        canonical: fallback.slug,
        mapMarkerKey: fallback.mapMarkerKey,
      });
    }
    return plans;
  }

  const plans: CategoryPlan[] = [];
  for (let i = 0; i < existing.length; i += 1) {
    const category = existing[i] as any;
    const inferred = inferCanonicalCategory(category.slug, category.name) || canonicalKeys[i % canonicalKeys.length];
    const mapMarkerKey = normalizeMarkerStyleKey(category.mapMarkerKey) || inferred;
    if (mapMarkerKey !== category.mapMarkerKey) {
      await db
        .update(productCategories)
        .set({ mapMarkerKey } as any)
        .where(eq(productCategories.id, category.id));
    }
    plans.push({
      id: category.id,
      slug: category.slug,
      name: category.name,
      canonical: inferred,
      mapMarkerKey,
    });
  }
  return plans;
}

async function upsertShop(input: {
  tenantId: number;
  ownerUserId: number;
  seedShop: SeedShop;
  city: SeedCity;
  geo: { countryId: number; regionId: number; cityId: number };
}) {
  const slug = slugify(`${input.seedShop.name}-${input.city.city}`);
  const coords = offsetCoordinates(input.city.lat, input.city.lng, input.seedShop.seedId);
  const rating = randomFloat(`${input.seedShop.seedId}:rating`, 3.8, 4.9, 1);
  const reviewCount = randomInt(`${input.seedShop.seedId}:reviews`, 5, 220);

  const values = {
    tenantId: input.tenantId,
    userId: input.ownerUserId,
    shopName: input.seedShop.name,
    slug,
    description: `${input.seedShop.vertical} seller in ${input.city.city}. Seeded by ${SEED_VERSION} for demo catalog coverage.`,
    sellerType: "retail_shop",
    countryId: input.geo.countryId,
    regionId: input.geo.regionId,
    cityId: input.geo.cityId,
    streetAddress: input.seedShop.address,
    latitude: coords.lat.toFixed(7),
    longitude: coords.lng.toFixed(7),
    phoneNumber: randomPhone(input.city, `${input.seedShop.seedId}:phone`),
    openingHours: {
      timezone: input.city.timezone,
      daily: "08:00-21:00",
      recurringMeetingsAllowed: true,
      authorizationPath: "chairman_or_delegate",
    },
    tags: [...input.seedShop.tags, input.seedShop.type, input.seedShop.markerKey, "seed", SEED_VERSION],
    mapMarkerKey: input.seedShop.markerKey,
    externalSeedId: input.seedShop.seedId,
    rating: rating.toFixed(2),
    reviewCount,
    status: "approved",
    isProducer: false,
    isDemo: true,
    verifiedAt: new Date(),
    approvedAt: new Date(),
    updatedAt: new Date(),
  };

  const existing =
    (await db.query.sellers.findFirst({
      where: and(eq(sellers.tenantId, input.tenantId), eq((sellers as any).externalSeedId, input.seedShop.seedId as any)),
    })) ||
    (await db.query.sellers.findFirst({
      where: and(eq(sellers.tenantId, input.tenantId), eq(sellers.slug, slug)),
    }));

  if (existing) {
    const [updated] = await db
      .update(sellers)
      .set(values as any)
      .where(eq(sellers.id, existing.id))
      .returning();
    return updated || existing;
  }

  const [created] = await db
    .insert(sellers)
    .values({
      ...values,
      createdAt: new Date(),
    } as any)
    .returning();
  return created;
}

function chooseBrand(seed: string) {
  return BRAND_POOL[randomInt(`${seed}:brand`, 0, BRAND_POOL.length - 1)];
}

function buildSearchKeywords(title: string, canonical: CanonicalCategory, city: SeedCity) {
  const tokens = title
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const extras = [canonical, city.city.toLowerCase(), city.countryName.toLowerCase(), "marketplace", "demo"];
  return Array.from(new Set([...tokens, ...extras])).slice(0, 14);
}
async function upsertProduct(input: {
  tenantId: number;
  category: CategoryPlan;
  shop: UpsertedShop;
  city: SeedCity;
  slot: number;
  title: string;
}) {
  const [minPrice, maxPrice] = CATEGORY_PRICE_RANGES[input.category.canonical];
  const seedKey = `${input.category.id}:${input.shop.id}:${input.slot}:${input.title}`;
  const eta = randomInt(`${seedKey}:eta`, 15, 90);
  const rating = randomFloat(`${seedKey}:rating`, 3.8, 4.9, 1);
  const reviewsCount = randomInt(`${seedKey}:reviews`, 5, 220);
  const stock = randomInt(`${seedKey}:stock`, 10, 200);
  const price = randomInt(`${seedKey}:price`, minPrice, maxPrice);
  const brand = chooseBrand(seedKey);

  const categoryCode = input.category.canonical.toUpperCase().slice(0, 4);
  const cityCode = input.city.id === "CI-ABJ" ? "ABJ" : "COO";
  const sku = `${SEED_SKU_PREFIX}-${categoryCode}-${input.category.id}-${cityCode}-${String(input.slot + 1).padStart(2, "0")}`;
  const slug = slugify(`${input.title}-${sku}`);
  const shortDescription = `${input.title} available from ${input.shop.shopName} in ${input.city.city}.`;
  const description = fullDescription({
    title: input.title,
    categoryName: input.category.name,
    city: input.city.city,
    country: input.city.countryName,
    shopName: input.shop.shopName,
    etaMinutes: eta,
  });

  const searchKeywords = buildSearchKeywords(input.title, input.category.canonical, input.city);
  const tags = Array.from(
    new Set([
      input.category.canonical,
      input.city.city.toLowerCase(),
      input.city.countryCode2.toLowerCase(),
      ...searchKeywords.slice(0, 6),
    ]),
  );

  const attributes = {
    seedVersion: SEED_VERSION,
    seedTag: SEED_VERSION,
    canonicalCategory: input.category.canonical,
    city: input.city.city,
    countryCode: input.city.countryCode2,
    delivery_eta_minutes: eta,
    pickup_available: true,
    delivery_available: true,
    rating,
    reviews_count: reviewsCount,
    brand,
    search_keywords: searchKeywords,
    full_description: description,
  };

  const values = {
    tenantId: input.tenantId,
    sellerId: input.shop.id,
    categoryId: input.category.id,
    name: input.title,
    slug,
    shortDescription,
    description,
    price: String(price),
    currency: "XOF",
    stockQuantity: stock,
    sku,
    tags,
    attributes,
    images: [`/seed/placeholder/product-${sku.toLowerCase()}-1.jpg`],
    status: "active",
    updatedAt: new Date(),
  };

  const existing = await db.query.sellerProducts.findFirst({
    where: and(eq(sellerProducts.tenantId, input.tenantId), eq(sellerProducts.sku, sku)),
  });

  if (existing) {
    const [updated] = await db
      .update(sellerProducts)
      .set(values as any)
      .where(eq(sellerProducts.id, existing.id))
      .returning();
    return updated || existing;
  }

  const [created] = await db
    .insert(sellerProducts)
    .values({
      ...values,
      createdAt: new Date(),
    } as any)
    .returning();
  return created;
}

async function enforceSeedCategoryCardinality(tenantId: number, category: CategoryPlan, expectedSkus: string[]) {
  const expected = new Set(expectedSkus.map((sku) => String(sku)));
  const likePattern = `${SEED_SKU_PREFIX}-%-${category.id}-%`;

  const seeded = await db
    .select({ id: sellerProducts.id, sku: sellerProducts.sku, createdAt: sellerProducts.createdAt })
    .from(sellerProducts)
    .where(
      and(
        eq(sellerProducts.tenantId, tenantId),
        eq(sellerProducts.categoryId, category.id),
        sql`${sellerProducts.sku} like ${likePattern}`,
      ),
    )
    .orderBy(asc(sellerProducts.createdAt), asc(sellerProducts.id));

  const keepActive = seeded.filter((row) => expected.has(String(row.sku || ""))).map((row) => row.id);
  const setDraft = seeded.filter((row) => !expected.has(String(row.sku || ""))).map((row) => row.id);

  if (keepActive.length) {
    await db
      .update(sellerProducts)
      .set({ status: "active", updatedAt: new Date() } as any)
      .where(and(eq(sellerProducts.tenantId, tenantId), inArray(sellerProducts.id, keepActive as any)));
  }
  if (setDraft.length) {
    await db
      .update(sellerProducts)
      .set({ status: "draft", updatedAt: new Date() } as any)
      .where(and(eq(sellerProducts.tenantId, tenantId), inArray(sellerProducts.id, setDraft as any)));
  }

  return { totalSeeded: seeded.length, activeCount: keepActive.length };
}

function buildShopSeeds(): SeedShop[] {
  return [...ANCHOR_SHOPS, ...buildSmeShops()];
}

async function main() {
  const apply = !process.argv.includes("--dry-run");
  const allowProd = process.argv.includes("--allow-production");
  const tenantKey = String(parseArg("--tenant") || DEFAULT_TENANT_KEY).trim().toLowerCase();
  const isProd = String(process.env.NODE_ENV || "").trim().toLowerCase() === "production";

  if (apply && !truthy(process.env.ALLOW_RETAIL_SEED)) {
    throw new Error("Refusing to run in apply mode. Set ALLOW_RETAIL_SEED=true.");
  }
  if (apply && isProd && !allowProd) {
    throw new Error("Refusing to run in production. Pass --allow-production if intentional.");
  }
  if (!apply) {
    const tenant = await resolveTenant(tenantKey);
    const existingCategories = await db
      .select({ id: productCategories.id })
      .from(productCategories)
      .where(eq(productCategories.tenantId, tenant.id));

    const categoryCount = existingCategories.length || FALLBACK_CATEGORIES.length;
    const shopCount = buildShopSeeds().length;
    const productsPlanned = categoryCount * 20;

    console.log(
      [
        "",
        "[seed-retail-marketplace] dry-run",
        `- tenant: ${tenant.key} (id=${tenant.id})`,
        `- categories detected: ${existingCategories.length} (effective plan: ${categoryCount})`,
        `- shops planned: ${shopCount}`,
        `- products planned: ${productsPlanned} (20 per category)`,
        "- mode: read-only preview (no DB writes performed)",
        "",
      ].join("\n"),
    );
    return;
  }

  await ensureMarketplaceMapTables();

  const tenant = await resolveTenant(tenantKey);
  const ownerUser = await ensureSeedUser();
  const geoRefs = await ensureGeoData();
  await upsertDefaultMapMarkerStyles(tenant.id);

  const categoryPlans = await ensureCategories(tenant.id, tenant.key);
  if (!categoryPlans.length) throw new Error("No categories resolved for seeding.");

  const seedShops = buildShopSeeds();
  const upsertedShops: UpsertedShop[] = [];

  for (const seedShop of seedShops) {
    const city = CITIES.find((entry) => entry.id === seedShop.cityId);
    if (!city) continue;
    const geo = geoRefs[city.id];
    const row = await upsertShop({
      tenantId: tenant.id,
      ownerUserId: ownerUser.id,
      seedShop,
      city,
      geo,
    });

    upsertedShops.push({
      id: row.id,
      shopName: row.shopName,
      slug: row.slug,
      cityId: city.id,
      markerKey: normalizeMarkerStyleKey((row as any).mapMarkerKey) || "shop_default",
    });
  }

  const shopsByCity: Record<SeedCity["id"], UpsertedShop[]> = {
    "CI-ABJ": upsertedShops.filter((shop) => shop.cityId === "CI-ABJ"),
    "BJ-COO": upsertedShops.filter((shop) => shop.cityId === "BJ-COO"),
  };

  if (!shopsByCity["CI-ABJ"].length || !shopsByCity["BJ-COO"].length) {
    throw new Error("Shop seeding failed for one or more target cities.");
  }

  const perShopProductCounter = new Map<number, number>();
  const categorySummary: Array<Record<string, unknown>> = [];

  for (const category of categoryPlans) {
    const titles = CATEGORY_PRODUCTS[category.canonical].slice(0, 20);
    const citySplit: Array<SeedCity["id"]> = [...new Array(10).fill("CI-ABJ"), ...new Array(10).fill("BJ-COO")];
    const expectedSkus: string[] = [];

    for (let idx = 0; idx < titles.length; idx += 1) {
      const cityId = citySplit[idx];
      const city = CITIES.find((entry) => entry.id === cityId)!;
      const cityShops = shopsByCity[cityId];
      const shop = cityShops[idx % cityShops.length];

      const seededProduct = await upsertProduct({
        tenantId: tenant.id,
        category,
        shop,
        city,
        slot: idx,
        title: titles[idx],
      });
      expectedSkus.push(String((seededProduct as any)?.sku || ""));

      perShopProductCounter.set(shop.id, (perShopProductCounter.get(shop.id) || 0) + 1);
    }

    const cardinality = await enforceSeedCategoryCardinality(tenant.id, category, expectedSkus);

    categorySummary.push({
      categoryId: category.id,
      slug: category.slug,
      name: category.name,
      canonical: category.canonical,
      mapMarkerKey: category.mapMarkerKey,
      seededTotal: cardinality.totalSeeded,
      activeProducts: cardinality.activeCount,
      expectedActive: 20,
      citySplit: { Abidjan: 10, Cotonou: 10 },
    });
  }

  const report = {
    seed_version: SEED_VERSION,
    tenant: { id: tenant.id, key: tenant.key },
    generated_at: new Date().toISOString(),
    currency_default: "XOF",
    cities: CITIES.map((city) => ({
      id: city.id,
      country: city.countryCode2,
      city: city.city,
      lat: city.lat,
      lng: city.lng,
      shops_seeded: shopsByCity[city.id].length,
    })),
    categories: categorySummary,
    shops: upsertedShops.map((shop) => ({
      id: shop.id,
      slug: shop.slug,
      name: shop.shopName,
      city: shop.cityId,
      map_marker_key: shop.markerKey,
      seeded_products_assigned: perShopProductCounter.get(shop.id) || 0,
    })),
  };

  const reportPath = path.resolve(process.cwd(), "reports", "seed-report.json");
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");

  console.log(
    [
      "",
      "[seed-retail-marketplace] done",
      `- tenant: ${tenant.key} (id=${tenant.id})`,
      `- categories seeded: ${categorySummary.length}`,
      `- shops seeded: ${upsertedShops.length}`,
      `- report: ${reportPath}`,
      "",
    ].join("\n"),
  );
}

main().catch((error) => {
  console.error("[seed-retail-marketplace] failed:", error);
  process.exit(1);
});
