import fs from "fs";
import path from "path";
import { nanoid } from "nanoid";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@db";
import { productCategories, sellerProducts, sellers, tenants, users } from "@db/schema";

export type GoldMinePoint = {
  name: string;
  region: string;
  country: string;
  lat: string;
  lng: string;
};

const DEFAULT_GOLD_MINES: GoldMinePoint[] = [
  { name: "DIABY Lassina", region: "Boundiali", country: "Côte d'Ivoire", lat: "9.5200", lng: "-6.4800" },
  { name: "KONE Siaka", region: "Korhogo", country: "Côte d'Ivoire", lat: "9.4580", lng: "-5.6294" },
  { name: "OUATTARA Moussa", region: "Ferkessédougou", country: "Côte d'Ivoire", lat: "9.5933", lng: "-5.1944" },
  { name: "COULIBALY Amadou", region: "Odienné", country: "Côte d'Ivoire", lat: "9.5000", lng: "-7.5667" },
  { name: "TRAORE Ibrahim", region: "Tengréla", country: "Côte d'Ivoire", lat: "10.4833", lng: "-6.4000" },
  { name: "SANGARE Bakary", region: "Séguéla", country: "Côte d'Ivoire", lat: "7.9614", lng: "-6.6731" },
  { name: "KONATE Drissa", region: "Touba", country: "Côte d'Ivoire", lat: "8.2833", lng: "-7.6833" },
  { name: "BAMBA Seydou", region: "Mankono", country: "Côte d'Ivoire", lat: "8.0583", lng: "-6.1900" },
  { name: "FOFANA Lacina", region: "Dabakala", country: "Côte d'Ivoire", lat: "8.3667", lng: "-4.4333" },
  { name: "SYLLA Mamadou", region: "Katiola", country: "Côte d'Ivoire", lat: "8.1381", lng: "-5.1019" },
  { name: "Ghana Gold Corp", region: "Ashanti", country: "Ghana", lat: "6.6885", lng: "-1.6244" },
  { name: "Obuasi Mining Ltd", region: "Obuasi", country: "Ghana", lat: "6.2050", lng: "-1.6590" },
  { name: "Tarkwa Gold Fields", region: "Western", country: "Ghana", lat: "5.3053", lng: "-1.9950" },
  { name: "Prestea Resources", region: "Prestea", country: "Ghana", lat: "5.4333", lng: "-2.1500" },
  { name: "Mali Gold SARL", region: "Kayes", country: "Mali", lat: "14.4469", lng: "-11.4356" },
  { name: "Syama Mining Co", region: "Sikasso", country: "Mali", lat: "11.3188", lng: "-5.6897" },
  { name: "Loulo Gold Operations", region: "Kayes", country: "Mali", lat: "14.1833", lng: "-11.6333" },
  { name: "Burkina Gold SARL", region: "Centre-Nord", country: "Burkina Faso", lat: "13.5833", lng: "-0.9667" },
  { name: "Essakane Mining", region: "Sahel", country: "Burkina Faso", lat: "14.3833", lng: "-0.5333" },
  { name: "Senegal Minerals", region: "Kédougou", country: "Senegal", lat: "12.5500", lng: "-12.1833" },
  { name: "Sabodala Gold", region: "Tambacounda", country: "Senegal", lat: "13.0333", lng: "-12.0500" },
  { name: "Guinea Gold Corp", region: "Siguiri", country: "Guinea", lat: "11.4167", lng: "-9.1667" },
  { name: "Lefa Mining", region: "Lélouma", country: "Guinea", lat: "11.0333", lng: "-10.4833" },
  { name: "Niger Gold Ltd", region: "Tillabéri", country: "Niger", lat: "14.2128", lng: "1.4536" },
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

type CsvRow = Record<string, string | undefined>;

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

function parseCsv(content: string): CsvRow[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  const pushCell = () => {
    row.push(cell);
    cell = "";
  };

  const pushRow = () => {
    if (row.length === 1 && row[0].trim() === "") return;
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < content.length; i++) {
    const ch = content[i];

    if (inQuotes) {
      if (ch === '"') {
        const next = content[i + 1];
        if (next === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }

    if (ch === ",") {
      pushCell();
      continue;
    }

    if (ch === "\n") {
      pushCell();
      pushRow();
      continue;
    }

    if (ch === "\r") continue;
    cell += ch;
  }

  pushCell();
  pushRow();

  if (rows.length === 0) return [];

  const header = rows[0].map((h) => h.trim());
  const dataRows = rows.slice(1);
  return dataRows.map((r) => {
    const obj: CsvRow = {};
    for (let i = 0; i < header.length; i++) obj[header[i]] = r[i];
    return obj;
  });
}

function loadGoldMinePoints(filePath?: string): GoldMinePoint[] {
  if (!filePath) return DEFAULT_GOLD_MINES;

  const resolved = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(resolved)) return DEFAULT_GOLD_MINES;

  const ext = path.extname(resolved).toLowerCase();
  const raw = fs.readFileSync(resolved, "utf8");

  if (ext === ".json") {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_GOLD_MINES;
    return parsed as GoldMinePoint[];
  }

  const csv = parseCsv(raw);
  const mapped = csv
    .map((r) => ({
      name: (r.name || r.shopName || r.seller || "").trim(),
      region: (r.region || r.city || "").trim(),
      country: (r.country || r.countryCode || "").trim(),
      lat: (r.lat || r.latitude || "").trim(),
      lng: (r.lng || r.longitude || "").trim(),
    }))
    .filter((p) => p.name && p.lat && p.lng)
    .map((p) => ({
      ...p,
      country: p.country || "Côte d'Ivoire",
      region: p.region || "Unknown",
    }));

  return mapped.length > 0 ? mapped : DEFAULT_GOLD_MINES;
}

async function ensureDoreCategory(tenantId: number) {
  const existing = await db.query.productCategories.findFirst({
    where: eq(productCategories.slug, "dore"),
  });
  if (existing) return existing;

  const [created] = await db
    .insert(productCategories)
    .values({
      tenantId,
      name: "Dore",
      slug: "dore",
      description: "Raw gold dore lots from licensed suppliers",
      icon: "dore",
      color: "#EA580C",
      sortOrder: 1,
      isActive: true,
    })
    .returning();
  return created;
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

export async function seedGoldMinesAsSellers(options?: { pointsFile?: string }) {
  const tenantId = await resolveSeedTenantId();
  const points = loadGoldMinePoints(options?.pointsFile);
  const doreCategory = await ensureDoreCategory(tenantId);
  const systemUser = await ensureSystemUser();

  let sellersCreated = 0;
  let sellersUpdated = 0;
  let productsCreated = 0;

  type ProductTemplateUnit = "gram" | "kg";
  type ProductTemplate = { name: string; price: string; desc: string; unit: ProductTemplateUnit };

  const productTemplates: ProductTemplate[] = [
    { name: "Gold Dore Lot - Standard Grade", price: "68000", desc: "Unrefined gold dore lot from licensed site. Typical purity 85-92%. Chain-of-custody documentation included.", unit: "gram" },
    { name: "Gold Dore Lot - High Grade", price: "75000", desc: "Higher-purity dore lot (92-96%). Sourced from licensed operations with traceability documentation.", unit: "gram" },
    { name: "Gold Nuggets Parcel", price: "78000", desc: "Natural gold nuggets (unrefined). Assay and origin documents available for export workflows.", unit: "gram" },
    { name: "Gold Dust Batch", price: "70000", desc: "Fine gold dust batch (unrefined). Intended for refining and B2B trading with verification.", unit: "gram" },
  ];

  for (const mine of points) {
    const existingSeller = await db.query.sellers.findFirst({
      where: and(eq(sellers.tenantId, tenantId), eq(sellers.shopName, mine.name)),
    });

    let seller = existingSeller;
    if (!seller) {
      const slug = `${slugify(mine.name)}-${nanoid(4)}`;
      const [created] = await db
        .insert(sellers)
        .values({
          tenantId,
          userId: systemUser.id,
          shopName: mine.name,
          slug,
          description: `Licensed gold mining operation in ${mine.region}, ${mine.country}. Authorized semi-industrial gold extraction with full government compliance.`,
          latitude: mine.lat,
          longitude: mine.lng,
          streetAddress: `${mine.region}, ${mine.country}`,
          phoneNumber: `+225 ${Math.floor(Math.random() * 9_000_000_000) + 1_000_000_000}`.slice(0, 15),
          isProducer: true,
          productionType: "gold_mining",
          status: "approved",
          verifiedAt: new Date(),
          approvedAt: new Date(),
          isDemo: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      seller = created;
      sellersCreated++;
    } else {
      if (!seller.isDemo) {
        await db
          .update(sellers)
          .set({ isDemo: true, updatedAt: new Date() })
          .where(eq(sellers.id, seller.id));
        sellersUpdated++;
      }
    }

    if (!seller) continue;

    const existingProducts = await db.query.sellerProducts.findMany({
      where: and(eq(sellerProducts.sellerId, seller.id), eq(sellerProducts.status, "active")),
    });
    const existingNames = new Set(existingProducts.map((p) => p.name));

    for (const template of productTemplates) {
      if (existingNames.has(template.name)) continue;

      const productSlug = `${slugify(template.name)}-${seller.id}-${nanoid(6)}`;
      const stock =
        template.unit === "kg"
          ? (Math.floor(Math.random() * 40) + 10) * 1000
          : Math.floor(Math.random() * 2000) + 200;

      await db.insert(sellerProducts).values({
        tenantId,
        sellerId: seller.id,
        categoryId: doreCategory.id,
        name: template.name,
        slug: productSlug,
        description: template.desc,
        shortDescription: template.desc,
        price: template.price,
        currency: "XOF",
        stockQuantity: stock,
        status: "active",
        isHandmade: false,
        images: [],
        tags: ["gold", "dore", "mining", mine.country.toLowerCase(), mine.region.toLowerCase()],
        certifications: ["Government Licensed", "National Assayer Verified"],
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      productsCreated++;
    }
  }

  return { sellersCreated, sellersUpdated, productsCreated };
}
