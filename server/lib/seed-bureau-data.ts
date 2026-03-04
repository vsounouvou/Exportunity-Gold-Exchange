import { db } from "@db";
import { bureauDAchat, sellers, sellerProducts, productCategories, tenants, users } from "@db/schema";
import { asc, eq } from "drizzle-orm";

const bureauData = [
  {"id": 1, "name": "ARDA MINING SARL", "authorization_number": "00015/MMG/DGMG", "attribution_date": "2020-02-10", "expiration_date": "2023-02-09", "city": "Yamoussoukro", "location_detail": "Quartier résidentiel", "managers": ["TRAORE MANHAN"], "phones": ["07 07 99 06 06"]},
  {"id": 2, "name": "LEGENDE GOLD SARLU", "authorization_number": "00081/MMG/DGMG", "attribution_date": "2020-06-17", "expiration_date": "2023-06-16", "city": "Abidjan", "location_detail": "Marcory", "managers": ["SACKO LASSINA"], "phones": ["07 08 88 31 96"]},
  {"id": 3, "name": "COOP CA-TA (Société Coopérative des Orpailleurs de Tagban)", "authorization_number": "00164/MMG/DGMG", "attribution_date": "2020-11-24", "expiration_date": "2023-11-23", "city": "M'Bengué", "location_detail": "Quartier résidentiel", "managers": ["SILUE N'GOLO", "SILUE BEH ADAMA"], "phones": ["07 09 25 85 90", "07 49 81 47 50"]},
  {"id": 4, "name": "HYPOLITE N'GUESSAN KOUAKOU GOLD SARLU (HNK GOLD SARLU)", "authorization_number": "00173/MMG/DGMG", "attribution_date": "2020-12-16", "expiration_date": "2023-12-15", "city": "Bouaflé", "location_detail": "Quartier Kôkô, îlot n°01, lot n°01, Immeuble Duncan Kacou Mathieu, 1er étage, appartement n°2", "managers": ["KOUAKOU N'GUESSAN HYPOLITE"], "phones": ["01 51 52 98 77", "05 45 41 19 12"]},
  {"id": 5, "name": "SOCIETE IVOIRIENNE D'ACHAT D'OR (SIADOR) SARL", "authorization_number": "00031/MMG/DGMG", "attribution_date": "2021-03-11", "expiration_date": "2024-03-10", "city": "Abidjan", "location_detail": "Cocody", "managers": ["IBRAHIM ABDOU SAFIANOU"], "phones": ["05 44 04 58 93"]},
  {"id": 6, "name": "SOCIETE IVOIRIENNE DE COMMERCE SARL (SICOM)", "authorization_number": "00042/MMG/DGMG", "attribution_date": "2021-03-24", "expiration_date": "2024-03-23", "city": "Dabakala", "location_detail": "Quartier Bamarasso", "managers": ["FOFANA FADOUGA SYLVESTRE"], "phones": ["07 09 76 97 10"]},
  {"id": 7, "name": "SMART GOLD SARL", "authorization_number": "073/MMPE/DGMG", "attribution_date": "2021-05-04", "expiration_date": "2024-05-03", "city": "Yamoussoukro", "location_detail": "Kokrenou", "managers": ["DIARRA YACOUBA", "KANGA KOUASSI SYLVAIN"], "phones": ["05 05 40 45 22", "07 57 86 16 77"]},
  {"id": 8, "name": "VEENEM MINERAL RESSOURCES SARL", "authorization_number": "091/MMPE/DGMG", "attribution_date": "2021-06-02", "expiration_date": "2024-06-01", "city": "Abidjan", "location_detail": "Angré", "managers": ["KINDO HAROUNA"], "phones": ["07 08 73 54 37", "05 05 73 49 67"]},
  {"id": 9, "name": "BLANCA TRADING SARL", "authorization_number": "092/MMPE/DGMG", "attribution_date": "2021-06-02", "expiration_date": "2024-06-01", "city": "Abidjan", "location_detail": "Treichville Belle ville, 22 BP 864 Abidjan 22", "managers": ["N'GUESSAN KOUASSI N'DA ARON"], "phones": ["07 07 38 17 77"]},
  {"id": 10, "name": "DAYELA RESOURCES SARL", "authorization_number": "093/MMPE/DGMG", "attribution_date": "2021-06-02", "expiration_date": "2024-06-01", "city": "Abidjan", "location_detail": "Treichville, SICOGI Arras 9, 9 Treichville Placard, 08 BP 1516 Abidjan 08", "managers": ["KOFFI Amoin", "BOUA BI", "LOGBOSSI Christine"], "phones": ["05 04 04 76 75", "07 48 61 42 99", "07 09 31 36 99"]},
  {"id": 11, "name": "ORIV-INTER SARL", "authorization_number": "094/MMPE/DGMG", "attribution_date": "2021-06-02", "expiration_date": "2024-06-01", "city": "Bonoua", "location_detail": "Quartier résidentiel, lot n°1007, îlot n°131", "managers": ["N'GUESSAN Adélaïde Frédelia"], "phones": ["07 57 33 67 68"]},
  {"id": 12, "name": "EMEL 2020-CI SARL", "authorization_number": "139/MMPE/DGMG", "attribution_date": "2021-07-15", "expiration_date": "2024-07-14", "city": "Abidjan", "location_detail": "Port-Bouët, non loin de la SODECI, Section LN, lot n°116, parcelle n°287, 22 BP 729 Abidjan 22", "managers": ["GBOGBO Ruffin"], "phones": ["07 48 58 77 04"]},
  {"id": 13, "name": "LE COMPTOIR RAZAN SARL", "authorization_number": "140/MMPE/DGMG", "attribution_date": "2021-07-15", "expiration_date": "2024-07-14", "city": "Bouaflé", "location_detail": "04 BP 2891 Abidjan 04", "managers": ["HUSSEIN Ahmad", "AMEDE DJE"], "phones": ["07 67 77 77 72", "07 77 49 99 99", "07 99 86 98", "45 97 77 77"]},
  {"id": 14, "name": "GULF MIN/TECH TRADING SARL", "authorization_number": "140/MMPE/DGMG", "attribution_date": "2021-07-15", "expiration_date": "2024-07-14", "city": "Abidjan", "location_detail": "Marcory, petite zone portuaire, section cadastrale CS, titre foncier n°113961, 21 BP 2949 Abidjan 21", "managers": ["ZAZA Sous Nader"], "phones": ["+34 629 61 98 10"]},
  {"id": 15, "name": "BLUE LINE MINING SARL", "authorization_number": "160/MMPE/DGMG", "attribution_date": "2021-07-19", "expiration_date": "2024-07-18", "city": "Abidjan", "location_detail": "Koumassi", "managers": ["TANOE Bilé Vivien"], "phones": ["05 85 12 72 02"]},
  {"id": 16, "name": "AMCO SARL", "authorization_number": "209/MMPE/DGMG", "attribution_date": "2021-10-01", "expiration_date": "2024-09-30", "city": "Abidjan", "location_detail": "Cocody, Riviera 3, Bonoumin, Cité Emeraude, Abri 2000, lot n°36, îlot n°4, 01 BP 2199 Abidjan 01", "managers": ["AMION ETIENNE ACOU"], "phones": ["07 88 37 82 85"]},
  {"id": 17, "name": "COMPTOIR INTERNATIONAL DE RESSOURCES MINIERES", "authorization_number": "014/MMPE/DGMG", "attribution_date": "2022-01-07", "expiration_date": "2025-01-06", "city": "Oumé", "location_detail": "Quartier Kouamé N'Guessan, 06 BP 6441 Abidjan 06", "managers": ["TRAORE TIEMOKO"], "phones": ["07 08 46 79 03"]},
  {"id": 18, "name": "ENTREPRISE GENERALE MINE SARL", "authorization_number": "023/MMPE/DGMG", "attribution_date": "2022-01-18", "expiration_date": "2025-01-17", "city": "Abidjan", "location_detail": "Yopougon – Kenya, lot n°83/85 îlot n°5, 20 BP 185 Abidjan 20", "managers": ["OUATTARA DRAMANE", "SIDIBE AMARA"], "phones": ["07 77 11 75 11", "07 08 41 77 06"]},
  {"id": 19, "name": "SOCIETE IVOIRIENNE DE VENTE D'OR BRUT SARL (SIVOB SARL)", "authorization_number": "025/MMPE/DGMG", "attribution_date": "2022-01-18", "expiration_date": "2025-01-17", "city": "Katiola", "location_detail": "", "managers": ["SORO SIONGNAN LACINA"], "phones": ["07 07 48 17 13"]},
  {"id": 20, "name": "SOCIETE COOPERATIVE TAKAPI GOLD DE KANAKONO", "authorization_number": "063/MMPE/DGMG", "attribution_date": "2022-02-07", "expiration_date": "2025-02-06", "city": "Tengrela", "location_detail": "Kanakono", "managers": ["DAGNOGO ZIE"], "phones": ["07 49 31 00 71"]},
  {"id": 21, "name": "DDC-METAL SARL", "authorization_number": "095/MMPE/DGMG", "attribution_date": "2022-03-01", "expiration_date": "2025-02-28", "city": "Abidjan", "location_detail": "", "managers": ["DOUMBIA DRAMANE"], "phones": ["07 07 33 32 78"]},
  {"id": 22, "name": "VICTORIUOS MINING COAST IVORY SARL", "authorization_number": "158/MMPE/DGMG", "attribution_date": "2022-05-25", "expiration_date": "2025-05-24", "city": "Abidjan", "location_detail": "", "managers": ["BONKOUNGOU ADJARA"], "phones": ["07 48 26 88 56"]},
  {"id": 23, "name": "DIVINE GOLD NEGOCE SAS", "authorization_number": "212/MMPE/DGMG", "attribution_date": "2022-07-06", "expiration_date": "2025-07-05", "city": "Abidjan", "location_detail": "Treichville, 29 BP 396 Abidjan 29", "managers": ["KOUAME YAO CHRISTOPHE"], "phones": ["07 58 74 32 54"]},
  {"id": 24, "name": "MOSA GOLD INTERNATIONAL SARL", "authorization_number": "330/MMPE/DGMG/DSRMG", "attribution_date": "2022-12-09", "expiration_date": "2025-12-08", "city": "Abidjan", "location_detail": "Marcory Résidentiel, 28 BP 97 Abidjan 28", "managers": ["SANGARE MOULAYE"], "phones": ["07 07 70 42 56"]},
  {"id": 25, "name": "ETABLISSEMENTS SAKANRA GOLD SARL", "authorization_number": "116/MMPE/DGMG", "attribution_date": "2023-04-03", "expiration_date": "2026-04-02", "city": "Grand-Bassam", "location_detail": "Moossou Extension, lot n°489, îlot n°55, 03 BP 862 Abidjan 03", "managers": ["SANKARA Issouf"], "phones": ["07 08 56 23 87"]},
  {"id": 26, "name": "IVOIRE OR SARLU", "authorization_number": "119/MMPE/DGMG", "attribution_date": "2023-04-03", "expiration_date": "2026-04-02", "city": "Abidjan", "location_detail": "Cocody, Angré-Dokui, face à la paroisse Catholique Sainte Monique, lot 1, îlot 295", "managers": ["BAKAYOKO Zoumana"], "phones": ["07 47 47 94 30"]},
  {"id": 27, "name": "FINAVALOR INTERNATIONAL SA", "authorization_number": "129/MMPE/DGMG", "attribution_date": "2023-04-13", "expiration_date": "2026-04-12", "city": "Abidjan", "location_detail": "Marcory, Boulevard Giscard d'Estaing, contre-allée CI-Telecom, immeuble Western Union, 10 BP 991 Abidjan 10", "managers": ["TEHUA MARINA", "CELIKALAY Armagan Gunes"], "phones": ["07 08 20 13 81", "+41 79 843 24 47"]},
  {"id": 28, "name": "ZS LOGISTICS SARL", "authorization_number": "133/MMPE/DGMG", "attribution_date": "2023-04-13", "expiration_date": "2026-04-12", "city": "Abidjan", "location_detail": "Marcory, Zone 4 (1er renouvellement)", "managers": ["KONAN GILBERT", "ZEIN BAALBAKI"], "phones": ["07 08 66 88 98", "05 44 99 60 88"]},
  {"id": 29, "name": "PROSPERIS INTERNATIONAL SARL", "authorization_number": "143/MMPE/DGMG", "attribution_date": "2023-04-19", "expiration_date": "2026-04-18", "city": "Abidjan", "location_detail": "Marcory, Boulevard Giscard d'Estaing, lot 109 Zone 4C", "managers": ["TEHUA MARINA"], "phones": ["07 08 20 13 81"]},
  {"id": 30, "name": "EDEN HAVILA MAX SARL", "authorization_number": "147/MMPE/DGMG", "attribution_date": "2023-05-02", "expiration_date": "2026-05-01", "city": "Bonoua", "location_detail": "Quartier Koumassi, 01 BP 771 Bonoua 01", "managers": ["KONAN STEPHANE ADJOUA"], "phones": ["07 07 88 48 82"]},
  {"id": 31, "name": "MYA GOLD SARL", "authorization_number": "159/MMPE/DGMG", "attribution_date": "2023-05-02", "expiration_date": "2026-05-01", "city": "Abidjan", "location_detail": "Cocody, 9ème tranche, 28 BP 935 Abidjan 28", "managers": ["YAO Ahou Michelle Epouse Avenie"], "phones": ["07 07 30 49 16"]},
  {"id": 32, "name": "BIJOUTERIE IVOIRE LINGOT SARL", "authorization_number": "166/MMPE/DGMG", "attribution_date": "2023-05-10", "expiration_date": "2026-05-09", "city": "Abidjan", "location_detail": "Treichville, avenue 13, rue 14 barrée, lot 335 A, 01 BP 746 Abidjan 01", "managers": ["BAKAYOKO Ouamr"], "phones": ["07 08 71 08 59"]},
  {"id": 33, "name": "RISCLES SANOU GNOUMAN", "authorization_number": "177/MMPE/DGMG", "attribution_date": "2023-05-23", "expiration_date": "2026-05-22", "city": "Abidjan", "location_detail": "Plateau", "managers": ["JOEL MAURICE RISCLES"], "phones": ["05 06 87 77 77"]},
  {"id": 34, "name": "ENTREPRISE LE LINGOT D'OR SARLU", "authorization_number": "186/MMPE/DGMG", "attribution_date": "2023-06-02", "expiration_date": "2026-06-01", "city": "Abidjan", "location_detail": "Cocody, II Plateaux, Aghien", "managers": ["LAGOU ADJOUA HENRIETTE"], "phones": ["07 47 44 44 60"]},
  {"id": 35, "name": "SOCIETE D'ACHAT ET VENTE D'OR BRUT DE CÔTE D'IVOIRE SARL (SAVOCI)", "authorization_number": "190/MMPE/DGMG", "attribution_date": "2023-06-02", "expiration_date": "2026-06-01", "city": "Abidjan", "location_detail": "Cocody, Djorobité 1, Lot 386 B îlot 47, 19 BP 1300 Abidjan 19", "managers": ["KONE SEIDOU"], "phones": ["05 05 90 36 86"]},
  {"id": 36, "name": "OLAGMA SARL", "authorization_number": "205/MMPE/DGMG", "attribution_date": "2023-06-15", "expiration_date": "2026-06-14", "city": "Abidjan", "location_detail": "Plateau, Immeuble le Mali, 3ème étage, 05 BP 431 Abidjan 05", "managers": ["KONATE ALIMA"], "phones": ["07 09 09 22 21"]},
  {"id": 37, "name": "SOCIETE IVOIRIENNE D'INTERMEDIATION ET DE DISTRIBUTION (S2ID) SARL", "authorization_number": "272/MMPE/DGMG", "attribution_date": "2023-08-17", "expiration_date": "2026-08-16", "city": "Abidjan", "location_detail": "Cocody Corniche, Immeuble Peniel, 3ème étage, porte à droite", "managers": ["CHIRARA Issa"], "phones": ["07 09 91 21 01"]},
  {"id": 38, "name": "VORTEX AFRICA SARL", "authorization_number": "356/MMPE/DGMG", "attribution_date": "2023-10-27", "expiration_date": "2026-10-26", "city": "Abidjan", "location_detail": "Cocody, 8ème tranche, carrefour SICOMEX, 30 BP 534 Abidjan 30", "managers": ["FAYE BACHIROU"], "phones": []},
  {"id": 39, "name": "SOCIETE BINKELEMAN SARL", "authorization_number": "430/MMPE/DGMG", "attribution_date": "2023-12-27", "expiration_date": "2026-12-26", "city": "Tengrela", "location_detail": "Zanikaha", "managers": ["KONE KELEKAMA"], "phones": ["07 48 99 56 90"]},
  {"id": 40, "name": "SANGO MINING BANK SARL", "authorization_number": "427/MMPE/DGMG", "attribution_date": "2023-12-27", "expiration_date": "2026-12-26", "city": "Abidjan", "location_detail": "Anyama", "managers": ["SANGARE SOULEYMANE"], "phones": ["07 57 40 83 74"]},
  {"id": 41, "name": "SPINTEX TRADING SARLU", "authorization_number": "026/MMPE/DGMG", "attribution_date": "2024-01-30", "expiration_date": "2027-01-29", "city": "Abidjan", "location_detail": "Treichville, Avenue 21, lot 501", "managers": ["VALIYAKATH ASHKAR"], "phones": ["01 41 58 32 56", "01 42 51 11 11"]},
  {"id": 42, "name": "GOLDWINNER SARLU", "authorization_number": "027/MMPE/DGMG", "attribution_date": "2024-01-30", "expiration_date": "2027-01-29", "city": "Abidjan", "location_detail": "Treichville, rond-point du CHU", "managers": ["KONAN KONAN JEAN MAUREL LOÏC"], "phones": ["07 07 07 48 94"]},
  {"id": 43, "name": "AFRICA MINE IMPORT–EXPORT SARL", "authorization_number": "028/MMPE/DGMG", "attribution_date": "2024-01-30", "expiration_date": "2027-01-29", "city": "Abidjan", "location_detail": "Abobo, Plateau Dokui", "managers": ["BAMABA MOUSSA"], "phones": ["07 09 77 75 99"]},
  {"id": 44, "name": "MANDIANOR GOLD SASU", "authorization_number": "029/MMPE/DGMG", "attribution_date": "2024-01-30", "expiration_date": "2027-01-29", "city": "Abidjan", "location_detail": "Bietry, boulevard de Marseille, en face du Collège Notre Dame d'Afrique", "managers": ["FOFANA ABOU BAKR BEN IBRAHIM"], "phones": ["05 74 15 10 10"]},
  {"id": 45, "name": "SOCIETE COOPERATIVE SIMPLIFIEE OR IVOIRE (SCOOPS OR IVOIRE)", "authorization_number": "097/MMPE/DGMG", "attribution_date": "2024-03-15", "expiration_date": "2027-03-14", "city": "Tengrela", "location_detail": "Kanakono", "managers": ["TRAORE N'GOLO Mamadou", "BRAHIMA SOUMAHORO"], "phones": ["07 07 00 79 86", "07 07 07 57 27"]}
];

const cityCoordinates: Record<string, { lat: number; lng: number }> = {
  "Abidjan": { lat: 5.3600, lng: -4.0083 },
  "Yamoussoukro": { lat: 6.8206, lng: -5.2764 },
  "Bouaflé": { lat: 6.9906, lng: -5.7461 },
  "Dabakala": { lat: 8.3667, lng: -4.4333 },
  "M'Bengué": { lat: 10.0000, lng: -5.9000 },
  "Bonoua": { lat: 5.2728, lng: -3.5961 },
  "Oumé": { lat: 6.3833, lng: -5.4167 },
  "Katiola": { lat: 8.1333, lng: -5.1000 },
  "Tengrela": { lat: 10.4833, lng: -6.4000 },
  "Grand-Bassam": { lat: 5.2028, lng: -3.7383 }
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

async function ensureProductCategory(tenantId: number, options: {
  slug: string;
  name: string;
  description: string;
  icon: string;
  sortOrder: number;
  color?: string;
}) {
  const existing = await db.query.productCategories.findFirst({
    where: eq(productCategories.slug, options.slug)
  });

  if (existing) return existing;

  const [created] = await db.insert(productCategories).values({
    tenantId,
    name: options.name,
    slug: options.slug,
    description: options.description,
    icon: options.icon,
    color: options.color,
    isActive: true,
    sortOrder: options.sortOrder
  }).returning();

  return created;
}

export async function seedBureauDAchat() {
  console.log("Seeding Bureau d'Achat data...");
  const tenantId = await resolveSeedTenantId();
  
  for (const bureau of bureauData) {
    const coords = cityCoordinates[bureau.city] || { lat: 5.3600 + (Math.random() - 0.5) * 2, lng: -4.0083 + (Math.random() - 0.5) * 2 };
    
    const latOffset = (Math.random() - 0.5) * 0.1;
    const lngOffset = (Math.random() - 0.5) * 0.1;
    
    await db.insert(bureauDAchat).values({
      tenantId,
      legalName: bureau.name,
      licenseNumber: bureau.authorization_number,
      licenseStatus: "authorized",
      region: bureau.city,
      contactPhone: bureau.phones?.[0] || null,
      email: null,
      services: ["buying"],
      publicVisible: true,
      name: bureau.name,
      authorizationNumber: bureau.authorization_number,
      attributionDate: new Date(bureau.attribution_date),
      expirationDate: new Date(bureau.expiration_date),
      country: "CI",
      city: bureau.city,
      locationDetail: bureau.location_detail || null,
      latitude: String(coords.lat + latOffset),
      longitude: String(coords.lng + lngOffset),
      managers: bureau.managers,
      phones: bureau.phones,
      isActive: true,
      isVerified: true,
      rating: "4.50",
      totalSalesKg: String(Math.floor(Math.random() * 500)),
      completedOrders: Math.floor(Math.random() * 50),
      metadata: {
        certifications: ["Government Licensed", "LBMA Approved Supplier"],
        operationalHours: "8:00 AM - 6:00 PM",
        specializations: ["Artisanal Gold", "Semi-Industrial"]
      }
    }).onConflictDoNothing();
  }
  
  console.log(`Seeded ${bureauData.length} Bureau d'Achat entries`);
}

const goldProductTemplates = [
  { 
    name: "Gold Doré Lot - Standard Grade", 
    description: "Unrefined gold doré lot from artisanal mining. Typical purity 85-92%. Requires refining before export. Chain-of-custody documentation included.",
    purity: "85-92%",
    pricePerGram: 68000,
    type: "dore"
  },
  { 
    name: "Gold Doré Lot - High Grade", 
    description: "Premium unrefined gold doré with higher purity. Typical purity 92-96%. Sourced from licensed artisanal operations. Full traceability documentation.",
    purity: "92-96%",
    pricePerGram: 75000,
    type: "dore"
  }
];

export async function seedBureauxAsSellers() {
  console.log("Seeding Bureau d'Achat as sellers...");
  
  const tenantId = await resolveSeedTenantId();
  const doreCategory = await ensureProductCategory(tenantId, {
    name: "Doré",
    slug: "dore",
    description: "Raw gold doré lots from licensed suppliers",
    icon: "dore",
    color: "#EA580C",
    sortOrder: 1
  });
  
  let systemUser = await db.query.users.findFirst({
    where: eq(users.email, "system@exportunity.com")
  });
  
  if (!systemUser) {
    const [newUser] = await db.insert(users).values({
      email: "system@exportunity.com",
      displayName: "Exportunity System",
      createdAt: new Date(),
      updatedAt: new Date()
    }).returning();
    systemUser = newUser;
    console.log("Created system user");
  }
  
  let sellersCreated = 0;
  let productsCreated = 0;

  const drawRealisticLotKg = () => {
    const r = Math.random();
    const raw =
      r < 0.6
        ? 0.2 + Math.random() * 0.6 // 0.2–0.8
        : r < 0.9
          ? 0.8 + Math.random() * 1.2 // 0.8–2.0
          : 2.0 + Math.random() * 3.0; // 2.0–5.0 (rare)

    return Math.max(0.1, Math.round(raw * 10) / 10); // snap to 0.1kg
  };
  
  for (const bureau of bureauData) {
    const coords = cityCoordinates[bureau.city] || { lat: 5.3600 + (Math.random() - 0.5) * 2, lng: -4.0083 + (Math.random() - 0.5) * 2 };
    const latOffset = (Math.random() - 0.5) * 0.1;
    const lngOffset = (Math.random() - 0.5) * 0.1;
    
    const slug = bureau.name.toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, '-')
      .substring(0, 50) + '-' + bureau.id;
    
    const existingSeller = await db.query.sellers.findFirst({
      where: eq(sellers.slug, slug)
    });
    
    if (existingSeller) {
      if (!existingSeller.isDemo) {
        await db.update(sellers)
          .set({ isDemo: true, updatedAt: new Date() })
          .where(eq(sellers.id, existingSeller.id));
      }
      console.log(`Seller ${bureau.name} already exists, skipping...`);
      continue;
    }
    
    const [seller] = await db.insert(sellers).values({
      tenantId,
      userId: systemUser.id,
      shopName: bureau.name,
      slug,
      description: `Licensed Bureau d'Achat (Gold Buying Office) - Authorization: ${bureau.authorization_number}. Located in ${bureau.city}, Côte d'Ivoire. Government-licensed gold purchasing and export operation.`,
      latitude: String(coords.lat + latOffset),
      longitude: String(coords.lng + lngOffset),
      streetAddress: bureau.location_detail || bureau.city,
      phoneNumber: bureau.phones[0] || null,
      status: "approved",
      isProducer: true,
      productionType: "gold_mining",
      mineType: "artisanal",
      avgWeeklyOutputKg: "1.500",
      estWeeklyOutputKg: "1.500",
      estWeeklyOutputRangeMinKg: "1.000",
      estWeeklyOutputRangeMaxKg: "2.000",
      estWeeklyOutputConfidence: "med",
      estWeeklyOutputUpdatedAt: new Date(),
      estWeeklyOutputUpdatedBy: "seed:bureaux",
      rating: "4.50",
      isDemo: true,
      approvedAt: new Date(),
      verifiedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date()
    }).returning();
    
    sellersCreated++;
    
    const numProducts = 1 + Math.floor(Math.random() * 3);
    const selectedProducts = [...goldProductTemplates]
      .sort(() => Math.random() - 0.5)
      .slice(0, numProducts);
    
    for (const template of selectedProducts) {
      const priceVariation = 0.9 + Math.random() * 0.2;
      const price = Math.round(template.pricePerGram * priceVariation);
      const stockKg = drawRealisticLotKg();
      const stockGrams = Math.max(1, Math.round(stockKg * 1000));
      
      const productSlug = `${template.name.toLowerCase().replace(/\s+/g, '-')}-${seller.id}-${Date.now()}`;
      const productType = template.type === 'dore' ? 'Gold Doré' : 'Refined Karat Gold';
      
      await db.insert(sellerProducts).values({
        tenantId,
        sellerId: seller.id,
        categoryId: doreCategory.id,
        name: template.name,
        slug: productSlug,
        description: template.description,
        shortDescription: `${productType} | ${template.purity} purity | ${bureau.city}`,
        price: String(price),
        currency: "XOF",
        stockQuantity: stockGrams,
        weight: String(stockKg),
        weightUnit: "kg",
        isHandmade: false,
        status: "active",
        images: [],
        tags: ["gold", template.type, "export", "LBMA", bureau.city.toLowerCase(), template.purity.toLowerCase()],
        certifications: ["Government Licensed", "Bureau d'Achat Certified", "National Assayer Verified"],
        createdAt: new Date(),
        updatedAt: new Date()
      });
      
      productsCreated++;
    }
  }
  
  console.log(`Created ${sellersCreated} sellers and ${productsCreated} gold products`);
}

// Dubai Gold Dealers - Refined 24K Bullion Specialists
const dubaiDealerData = [
  {
    id: 101,
    name: "Emirates Gold DMCC",
    license_number: "DMCC-4872",
    location_detail: "DMCC Free Zone, JLT Cluster Q, Office 2401",
    city: "Dubai",
    managers: ["Ahmed Al Rashid", "Salim Hassan"],
    phones: ["+971 4 362 1888", "+971 50 123 4567"],
    website: "emiratesgolddmcc.ae",
    specialization: "LBMA Good Delivery Refinery"
  },
  {
    id: 102,
    name: "Gulf Refinery & Bullion",
    license_number: "DMCC-5291",
    location_detail: "Dubai Gold & Diamond Park, Building 5",
    city: "Dubai",
    managers: ["Mohammed Al Farooq"],
    phones: ["+971 4 347 2200"],
    website: "gulfrefinery.ae",
    specialization: "24K Investment Bars"
  },
  {
    id: 103,
    name: "Al Etihad Gold Refinery",
    license_number: "DMCC-3156",
    location_detail: "DMCC Free Zone, JLT Cluster Y, Tower 3",
    city: "Dubai",
    managers: ["Khalid Al Maktoum", "Fatima Al Sayed"],
    phones: ["+971 4 432 5500", "+971 55 789 0123"],
    website: "aletihadgold.ae",
    specialization: "LBMA Certified Refinery"
  },
  {
    id: 104,
    name: "Deira Gold Souk Trading",
    license_number: "DED-78234",
    location_detail: "Gold Souk, Shop 142, Sikkat Al Khail Road",
    city: "Dubai",
    managers: ["Rajesh Gupta", "Vikram Patel"],
    phones: ["+971 4 226 3344"],
    website: null,
    specialization: "Retail & Wholesale 24K"
  },
  {
    id: 105,
    name: "Kaloti Precious Metals",
    license_number: "DMCC-2845",
    location_detail: "DMCC Free Zone, Almas Tower",
    city: "Dubai",
    managers: ["Marwan Shakarchi"],
    phones: ["+971 4 368 6200", "+971 4 368 6201"],
    website: "kaloti.com",
    specialization: "LBMA Accredited, Large Volume Trading"
  },
  {
    id: 106,
    name: "Royal Gold International",
    license_number: "DMCC-6103",
    location_detail: "Dubai Gold & Diamond Park, Building 3, Unit 12",
    city: "Dubai",
    managers: ["Abdullah Al Suwaidi", "Hassan Jaber"],
    phones: ["+971 4 341 7700"],
    website: "royalgolduae.com",
    specialization: "24K Kilobars & Bullion"
  },
  {
    id: 107,
    name: "Malabar Gold & Diamonds DMCC",
    license_number: "DMCC-4521",
    location_detail: "DMCC Free Zone, One JLT, Floor 18",
    city: "Dubai",
    managers: ["M.P. Ahammed", "Abdul Salam K.P."],
    phones: ["+971 4 375 1100"],
    website: "malabargoldanddiamonds.com",
    specialization: "Retail to Wholesale, 22K-24K"
  },
  {
    id: 108,
    name: "Dubai Gold Tower Trading",
    license_number: "DED-89102",
    location_detail: "Naif Road, Gold Tower Building",
    city: "Dubai",
    managers: ["Sanjay Mehta"],
    phones: ["+971 4 223 8899", "+971 52 888 7766"],
    website: null,
    specialization: "Wholesale 24K Bars"
  },
  {
    id: 109,
    name: "Precious Metals Arabia",
    license_number: "DMCC-5678",
    location_detail: "DMCC Free Zone, JLT Cluster F",
    city: "Dubai",
    managers: ["Omar Al Shamsi", "Tariq Rahman"],
    phones: ["+971 4 399 2288"],
    website: "pmaarabia.ae",
    specialization: "Investment Grade 999.9 Fine Gold"
  },
  {
    id: 110,
    name: "Joyalukkas Gold Trading DMCC",
    license_number: "DMCC-3890",
    location_detail: "DMCC Free Zone, Gold Tower",
    city: "Dubai",
    managers: ["Joy Alukkas", "John Paul Alukkas"],
    phones: ["+971 4 366 6600"],
    website: "joyalukkas.com",
    specialization: "Retail & B2B Gold Trading"
  }
];

const dubaiCoordinates = {
  "DMCC Free Zone": { lat: 25.0657, lng: 55.1478 },
  "Gold Souk": { lat: 25.2697, lng: 55.3027 },
  "Dubai Gold & Diamond Park": { lat: 25.0489, lng: 55.1869 },
  "Naif Road": { lat: 25.2715, lng: 55.3095 }
};

const dubaiGoldProducts = [
  {
    name: "Stamped Gold Piece - 10g (24K)",
    description: "Small stamped 999.9 gold piece (10g). Individually sealed with assay certificate. Retail-friendly size for personal savings and gifting.",
    purity: "24K (999.9)",
    pricePerGramAed: 290,
    type: "stamped24k",
    weightGrams: 10
  },
  {
    name: "Stamped Gold Piece - 20g (24K)",
    description: "Stamped 999.9 gold piece (20g) with serial and assay card. Common retail format for secure custody and delivery.",
    purity: "24K (999.9)",
    pricePerGramAed: 289,
    type: "stamped24k",
    weightGrams: 20
  },
  {
    name: "Stamped Gold Piece - 50g (24K)",
    description: "Stamped 999.9 gold piece (50g) suitable for retail buyers. Sealed packaging with traceable assay documentation.",
    purity: "24K (999.9)",
    pricePerGramAed: 287,
    type: "stamped24k",
    weightGrams: 50
  },
  {
    name: "Stamped Gold Piece - 100g (24K)",
    description: "Stamped 999.9 gold piece (100g). Retail/investment format with serial number and assay certificate.",
    purity: "24K (999.9)",
    pricePerGramAed: 286,
    type: "stamped24k",
    weightGrams: 100
  },
  {
    name: "Stamped Gold Piece - 20g (22K)",
    description: "Stamped 22K gold piece (20g, 916.7). Common retail format used for jewelry gifting and savings. Includes assay certificate.",
    purity: "22K (916.7)",
    pricePerGramAed: 265,
    type: "stamped22k",
    weightGrams: 20
  },
  {
    name: "Stamped Gold Piece - 50g (22K)",
    description: "Stamped 22K gold piece (50g, 916.7). Hallmarked and certified for retail sale and delivery.",
    purity: "22K (916.7)",
    pricePerGramAed: 263,
    type: "stamped22k",
    weightGrams: 50
  }
];

export async function seedDubaiDealers() {
  console.log("Seeding Dubai Gold Dealers...");
  const tenantId = await resolveSeedTenantId();
  
  for (const dealer of dubaiDealerData) {
    let coords: { lat: number; lng: number };
    
    if (dealer.location_detail.includes("DMCC")) {
      coords = dubaiCoordinates["DMCC Free Zone"];
    } else if (dealer.location_detail.includes("Gold Souk")) {
      coords = dubaiCoordinates["Gold Souk"];
    } else if (dealer.location_detail.includes("Gold & Diamond Park")) {
      coords = dubaiCoordinates["Dubai Gold & Diamond Park"];
    } else if (dealer.location_detail.includes("Naif")) {
      coords = dubaiCoordinates["Naif Road"];
    } else {
      coords = { lat: 25.2048, lng: 55.2708 };
    }
    
    const latOffset = (Math.random() - 0.5) * 0.02;
    const lngOffset = (Math.random() - 0.5) * 0.02;
    
    await db.insert(bureauDAchat).values({
      tenantId,
      legalName: dealer.name,
      licenseNumber: dealer.license_number,
      licenseStatus: "authorized",
      region: dealer.city,
      contactPhone: dealer.phones?.[0] || null,
      email: null,
      services: ["buying", "exporting", "testing", "logistics"],
      publicVisible: true,
      name: dealer.name,
      authorizationNumber: dealer.license_number,
      attributionDate: new Date("2023-01-01"),
      expirationDate: new Date("2028-12-31"),
      country: "AE",
      city: dealer.city,
      locationDetail: dealer.location_detail,
      latitude: String(coords.lat + latOffset),
      longitude: String(coords.lng + lngOffset),
      managers: dealer.managers,
      phones: dealer.phones,
      isActive: true,
      isVerified: true,
      rating: String((4.5 + Math.random() * 0.5).toFixed(2)),
      totalSalesKg: String(Math.floor(Math.random() * 2000 + 500)),
      completedOrders: Math.floor(Math.random() * 200 + 50),
      metadata: {
        certifications: ["DMCC Licensed", "LBMA Accredited", "Dubai Good Delivery"],
        operationalHours: "9:00 AM - 6:00 PM (Sat-Thu)",
        specializations: [dealer.specialization, "24K Bullion", "Investment Gold"],
        website: dealer.website ?? undefined,
        photos: []
      }
    }).onConflictDoNothing();
  }
  
  console.log(`Seeded ${dubaiDealerData.length} Dubai Gold Dealers`);
}

export async function seedDubaiDealersAsSellers() {
  console.log("Seeding Dubai Gold Dealers as sellers...");
  
  const tenantId = await resolveSeedTenantId();
  const stampedCategory = await ensureProductCategory(tenantId, {
    name: "Stamped Gold",
    slug: "stamped",
    description: "Small stamped refined gold pieces (10g+) for retail buyers",
    icon: "stamped",
    color: "#10B981",
    sortOrder: 2
  });
  
  let systemUser = await db.query.users.findFirst({
    where: eq(users.email, "system@exportunity.com")
  });
  
  if (!systemUser) {
    const [newUser] = await db.insert(users).values({
      email: "system@exportunity.com",
      displayName: "Exportunity System",
      createdAt: new Date(),
      updatedAt: new Date()
    }).returning();
    systemUser = newUser;
  }
  
  let sellersCreated = 0;
  let productsCreated = 0;
  
  for (const dealer of dubaiDealerData) {
    let coords: { lat: number; lng: number };
    
    if (dealer.location_detail.includes("DMCC")) {
      coords = dubaiCoordinates["DMCC Free Zone"];
    } else if (dealer.location_detail.includes("Gold Souk")) {
      coords = dubaiCoordinates["Gold Souk"];
    } else if (dealer.location_detail.includes("Gold & Diamond Park")) {
      coords = dubaiCoordinates["Dubai Gold & Diamond Park"];
    } else if (dealer.location_detail.includes("Naif")) {
      coords = dubaiCoordinates["Naif Road"];
    } else {
      coords = { lat: 25.2048, lng: 55.2708 };
    }
    
    const latOffset = (Math.random() - 0.5) * 0.02;
    const lngOffset = (Math.random() - 0.5) * 0.02;
    
    const slug = dealer.name.toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, '-')
      .substring(0, 50) + '-dubai-' + dealer.id;
    
    const existingSeller = await db.query.sellers.findFirst({
      where: eq(sellers.slug, slug)
    });
    
    if (existingSeller) {
      if (!existingSeller.isDemo) {
        await db.update(sellers)
          .set({ isDemo: true, updatedAt: new Date() })
          .where(eq(sellers.id, existingSeller.id));
      }
      console.log(`Dubai dealer ${dealer.name} already exists, skipping...`);
      continue;
    }
    
    const [seller] = await db.insert(sellers).values({
      tenantId,
      userId: systemUser.id,
      shopName: dealer.name,
      slug,
      description: `Licensed Dubai Gold Dealer - License: ${dealer.license_number}. Located in ${dealer.location_detail}. Specializing in ${dealer.specialization}. DMCC/DED registered gold trading company.`,
      latitude: String(coords.lat + latOffset),
      longitude: String(coords.lng + lngOffset),
      streetAddress: dealer.location_detail,
      phoneNumber: dealer.phones[0] || null,
      website: dealer.website || undefined,
      status: "approved",
      isProducer: true,
      productionType: "gold_refinery",
      rating: String((4.5 + Math.random() * 0.5).toFixed(2)),
      isDemo: true,
      approvedAt: new Date(),
      verifiedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date()
    }).returning();
    
    sellersCreated++;
    
    const numProducts = 3 + Math.floor(Math.random() * 4);
    const selectedProducts = [...dubaiGoldProducts]
      .sort(() => Math.random() - 0.5)
      .slice(0, numProducts);
    
    for (const template of selectedProducts) {
      const priceVariation = 0.98 + Math.random() * 0.04;
      const priceAed = Math.round(template.pricePerGramAed * priceVariation * 100) / 100;
      const pieces = 20 + Math.floor(Math.random() * 220); // 20..239 pieces
      
      const productSlug = `${template.name.toLowerCase().replace(/\s+/g, '-')}-${seller.id}-${Date.now()}`;
      
      await db.insert(sellerProducts).values({
        tenantId,
        sellerId: seller.id,
        categoryId: stampedCategory.id,
        name: template.name,
        slug: productSlug,
        description: template.description,
        shortDescription: `${template.purity} purity | Dubai | ${template.weightGrams}g unit | ${pieces} pcs`,
        price: String(priceAed),
        currency: "AED",
        stockQuantity: pieces,
        weight: String(template.weightGrams),
        weightUnit: "g",
        isHandmade: false,
        status: "active",
        images: [],
        tags: ["gold", "stamped", "dubai", "retail", "assay", template.purity.toLowerCase()],
        certifications: ["DMCC Certified", "LBMA Good Delivery", "Dubai Assay Office Verified"],
        createdAt: new Date(),
        updatedAt: new Date()
      });
      
      productsCreated++;
    }
  }
  
  console.log(`Created ${sellersCreated} Dubai dealers and ${productsCreated} refined gold products`);
}
