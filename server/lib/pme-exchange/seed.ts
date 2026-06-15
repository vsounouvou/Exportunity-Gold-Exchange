export type PmeSeedLead = {
  id: string;
  source: "seeded";
  name: string;
  normalizedName: string;
  description: string;
  category: string;
  primaryType: string;
  types: string[];
  address: string;
  city: "Abidjan" | "Cotonou";
  country: "CI" | "BJ";
  district: string;
  latitude: number;
  longitude: number;
  phone: string;
  whatsappPhone: string;
  website: string | null;
  googleMapsUrl: string | null;
  rating: number;
  reviewCount: number;
  businessStatus: string;
  openingHours: Record<string, unknown>;
  leadStatus: string;
  qualificationScore: number;
  investmentPotentialScore: number;
  revenueVisibilityScore: number;
  verificationStatus: string;
  contactStatus: string;
  kind: "marketplace" | "wholesale";
  moq?: string;
  leadTime?: string;
};

const abidjanDistricts = [
  ["Cocody", 5.3707, -3.9861],
  ["Plateau", 5.3197, -4.0267],
  ["Marcory", 5.2948, -3.9876],
  ["Treichville", 5.2937, -4.0083],
  ["Yopougon", 5.3368, -4.0894],
  ["Adjame", 5.3658, -4.0232],
  ["Riviera", 5.3824, -3.9556],
  ["Bingerville", 5.3558, -3.8851],
] as const;

const cotonouDistricts = [
  ["Ganhi", 6.3607, 2.4311],
  ["Akpakpa", 6.3771, 2.4657],
  ["Cadjehoun", 6.3569, 2.3905],
  ["Fidjrosse", 6.3534, 2.3528],
  ["Dantokpa", 6.3732, 2.4203],
  ["Godomey", 6.3817, 2.3386],
  ["Haie Vive", 6.3544, 2.3889],
  ["Zogbo", 6.381, 2.3937],
] as const;

const marketplaceCategories = [
  ["Bakery", "bakery", ["bakery", "food_store"], ["Le Pain", "Maison du Pain", "Boulangerie Awa", "Fournil Soleil"]],
  ["Cafe", "cafe", ["cafe", "restaurant"], ["Cafe Terrasse", "Kiosque Cafe", "Maison Cafe", "Pause Matin"]],
  ["Restaurant", "restaurant", ["restaurant", "meal_takeaway"], ["Chez Awa", "Table Locale", "Maquis Lumiere", "Cuisine du Quartier"]],
  ["Grocery", "grocery_store", ["grocery_store", "supermarket"], ["Epicerie Soleil", "Marche Frais", "Panier Local", "Boutique Familiale"]],
  ["Organic Products", "organic_store", ["store", "food_store"], ["Bio Quartier", "Jardin Local", "Nature & Marche", "Terroir Frais"]],
  ["Pharmacy", "pharmacy", ["pharmacy", "health"], ["Pharmacie Proximite", "Sante Plus", "Pharma Quartier", "Point Sante"]],
  ["Electronics", "electronics_store", ["electronics_store", "store"], ["Tech Mobile", "Electronique Service", "Maison Connectee", "Digital Shop"]],
  ["Fashion", "clothing_store", ["clothing_store", "store"], ["Atelier Mode", "Tailleur Moderne", "Style Local", "Boutique Nana"]],
  ["Gift Shop", "gift_shop", ["gift_shop", "store"], ["Cadeaux d'Ici", "Maison Souvenir", "Art & Cadeau", "Petit Present"]],
  ["Home Goods", "home_goods_store", ["home_goods_store", "store"], ["Maison Pratique", "Deco Locale", "Home Services", "Tout Maison"]],
  ["Building Materials Retail", "hardware_store", ["hardware_store", "home_goods_store"], ["Quincaillerie Pro", "Depot Chantier", "Materiaux Express", "Maison BTP"]],
] as const;

const wholesaleCategories = [
  ["Building Materials Supplier", "building_materials_supplier", ["building_materials_store", "warehouse"], ["Depot Materiaux", "Ciments & Fer", "BTP Distribution", "Chantier Pro"]],
  ["Food Ingredients Distributor", "food_distributor", ["food_store", "warehouse"], ["Ingredients Pro", "Vivres Gros", "Agro Distribution", "Sacs & Cereales"]],
  ["Packaging Supplier", "packaging_supplier", ["store", "warehouse"], ["Emballages Pro", "Cartons Plus", "Pack Industrie", "Sachet & Carton"]],
  ["Machinery Supplier", "machinery_supplier", ["industrial_equipment_supplier", "store"], ["Machines Afrique", "Atelier Equipements", "Pro Machines", "Meca Supply"]],
  ["Textile Supplier", "textile_supplier", ["clothing_store", "warehouse"], ["Textile Gros", "Tissus Marche", "Atelier Tissus", "Fils & Textiles"]],
  ["Agricultural Inputs", "agricultural_supply", ["store", "warehouse"], ["Agri Intrants", "Semences Pro", "Ferme Supply", "Engrais Plus"]],
  ["Logistics Company", "logistics_company", ["moving_company", "storage"], ["Route Express", "Logistique Locale", "Cargo Pro", "Transit Hub"]],
  ["Cold Storage", "cold_storage", ["storage", "warehouse"], ["Froid Express", "Chaine Froide", "Stockage Frais", "Depot Froid"]],
  ["Manufacturer", "manufacturer", ["factory", "establishment"], ["Fabrique Locale", "Atelier Industrie", "Production Moderne", "Manufacture Sud"]],
  ["Distributor", "distributor", ["warehouse", "store"], ["Distribution Centrale", "Gros Marche", "Depot Import", "Reseau Pro"]],
] as const;

function normalize(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function offsetCoord(base: number, index: number, salt: number) {
  const wave = Math.sin((index + 1) * (salt + 3)) * 0.0065;
  const step = ((index % 7) - 3) * 0.0026;
  return Number((base + wave + step).toFixed(7));
}

function phone(country: "CI" | "BJ", index: number) {
  const suffix = String(10000000 + index * 7919).slice(-8);
  return country === "CI" ? `+22507${suffix}` : `+22901${suffix}`;
}

function buildCitySeeds(city: "Abidjan" | "Cotonou", kind: "marketplace" | "wholesale", count: number): PmeSeedLead[] {
  const districts = city === "Abidjan" ? abidjanDistricts : cotonouDistricts;
  const country = city === "Abidjan" ? "CI" : "BJ";
  const categories = kind === "marketplace" ? marketplaceCategories : wholesaleCategories;
  const rows: PmeSeedLead[] = [];

  for (let i = 0; i < count; i += 1) {
    const district = districts[i % districts.length];
    const category = categories[i % categories.length];
    const nameBase = category[3][Math.floor(i / categories.length) % category[3].length];
    const name = `${nameBase} ${district[0]}`;
    const rating = Number((3.8 + ((i * 17) % 14) / 10).toFixed(1));
    const reviews = 18 + ((i * 31) % 240);
    const leadScore = Math.min(96, 48 + Math.round(rating * 8) + (reviews > 80 ? 8 : 0) + (kind === "wholesale" ? 4 : 0));

    rows.push({
      id: `${kind}-${country.toLowerCase()}-${String(i + 1).padStart(2, "0")}`,
      source: "seeded",
      name,
      normalizedName: normalize(`${name} ${district[0]} ${city}`),
      description:
        kind === "wholesale"
          ? `${category[0]} in ${district[0]} with quote-first sourcing, contact verification, and logistics notes.`
          : `${category[0]} in ${district[0]} serving nearby buyers through product-first neighbourhood commerce.`,
      category: category[0],
      primaryType: category[1],
      types: [...category[2]],
      address: `${district[0]}, ${city}`,
      city,
      country,
      district: district[0],
      latitude: offsetCoord(district[1], i, kind === "marketplace" ? 4 : 9),
      longitude: offsetCoord(district[2], i, kind === "marketplace" ? 7 : 13),
      phone: phone(country, i + (kind === "wholesale" ? 600 : 100)),
      whatsappPhone: phone(country, i + (kind === "wholesale" ? 800 : 300)),
      website: i % 4 === 0 ? `https://example.${country.toLowerCase()}/${normalize(name).replace(/\s+/g, "-")}` : null,
      googleMapsUrl: null,
      rating,
      reviewCount: reviews,
      businessStatus: "OPERATIONAL",
      openingHours: { openNow: i % 6 !== 0, weekdayText: ["Mon-Sat 08:00-18:30"] },
      leadStatus: leadScore >= 78 ? "qualified" : leadScore >= 68 ? "enriched" : "new",
      qualificationScore: leadScore,
      investmentPotentialScore: kind === "wholesale" ? Math.min(90, leadScore - 6) : Math.min(82, leadScore - 14),
      revenueVisibilityScore: 35 + ((i * 11) % 48),
      verificationStatus: leadScore >= 78 ? "review_ready" : "unverified",
      contactStatus: i % 5 === 0 ? "contact_required" : "not_contacted",
      kind,
      moq: kind === "wholesale" ? ["50 bags", "100 units", "1 pallet", "By quote"][i % 4] : undefined,
      leadTime: kind === "wholesale" ? ["Same day", "1-2 days", "3-5 days", "1 week"][i % 4] : undefined,
    });
  }

  return rows;
}

export function getSeedPmeLeads() {
  return [
    ...buildCitySeeds("Abidjan", "marketplace", 50),
    ...buildCitySeeds("Cotonou", "marketplace", 50),
    ...buildCitySeeds("Abidjan", "wholesale", 50),
    ...buildCitySeeds("Cotonou", "wholesale", 50),
  ];
}

export function filterSeedPmeLeads(input?: { city?: string; kind?: string; query?: string; limit?: number }) {
  const city = String(input?.city || "").trim().toLowerCase();
  const kind = String(input?.kind || "").trim().toLowerCase();
  const query = normalize(String(input?.query || ""));
  const limit = Math.min(Math.max(Number(input?.limit || 80), 1), 200);

  return getSeedPmeLeads()
    .filter((lead) => (!city || lead.city.toLowerCase() === city))
    .filter((lead) => (!kind || lead.kind === kind || (kind === "supplier" && lead.kind === "wholesale")))
    .filter((lead) => {
      if (!query) return true;
      const haystack = normalize([lead.name, lead.category, lead.primaryType, lead.city, lead.district, lead.description].join(" "));
      return query.split(" ").every((part) => haystack.includes(part));
    })
    .slice(0, limit);
}
