import bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";
import { db } from "@db";
import {
  eceUsers,
  metBlogPosts,
  metPlans,
  metProjectMedia,
  metProjects,
  metProducts,
  metSettings,
  tenants,
  userTenantRoles,
} from "@db/schema";

const MET_TENANT_KEY = "met";
const MET_TENANT_NAME = "Maison en Terre";
const MET_DOMAINS = [
  "maisonenterre.com",
  "www.maisonenterre.com",
  "maisonsenterre.com",
  "www.maisonsenterre.com",
];

function now() {
  return new Date();
}

async function ensureMetTenant() {
  const existing = await db.query.tenants.findFirst({ where: eq(tenants.key, MET_TENANT_KEY as any) });
  if (existing) {
    const currentDomains = Array.isArray((existing as any).domains)
      ? ((existing as any).domains as unknown[]).map((v) => String(v || "").trim().toLowerCase()).filter(Boolean)
      : [];
    const mergedDomains = Array.from(new Set([...MET_DOMAINS, ...currentDomains]));

    const [updated] = await db
      .update(tenants)
      .set({
        name: MET_TENANT_NAME,
        domains: mergedDomains as any,
        themeConfig: { brand: "met", tenantSlug: "maisonenterre" } as any,
        featureFlags: {
          goldOnly: false,
          multiProduct: true,
          "feature.maison_en_terre": true,
          "feature.met.bricks": true,
          "feature.met.estimates": true,
        } as any,
        updatedAt: now(),
      })
      .where(eq(tenants.id, existing.id))
      .returning();
    return updated ?? existing;
  }

  const [created] = await db
    .insert(tenants)
    .values({
      key: MET_TENANT_KEY as any,
      name: MET_TENANT_NAME,
      domains: MET_DOMAINS,
      themeConfig: { brand: "met", tenantSlug: "maisonenterre" } as any,
      featureFlags: {
        goldOnly: false,
        multiProduct: true,
        "feature.maison_en_terre": true,
        "feature.met.bricks": true,
        "feature.met.estimates": true,
      } as any,
      createdAt: now(),
      updatedAt: now(),
    })
    .returning();
  return created;
}

async function ensureAdminUser(email: string, password: string) {
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized || !password) return null;

  const existing = await db.query.eceUsers.findFirst({ where: eq(eceUsers.email, normalized) });
  const passwordHash = await bcrypt.hash(password, 10);
  if (existing) {
    const roles = Array.isArray((existing as any).roles) ? (existing as any).roles : [];
    const permissions = Array.isArray((existing as any).permissions) ? (existing as any).permissions : [];
    const metadata = (existing as any).metadata && typeof (existing as any).metadata === "object" ? (existing as any).metadata : {};
    await db
      .update(eceUsers)
      .set({
        passwordHash,
        role: "admin" as any,
        roles: Array.from(new Set(["admin", ...roles])) as any,
        permissions: Array.from(new Set(["*", ...permissions])) as any,
        currentMode: "admin" as any,
        isActive: true,
        emailVerified: true,
        metadata: { ...metadata, seeded: true },
        updatedAt: now(),
      })
      .where(eq(eceUsers.id, existing.id));
    return { ...existing, id: existing.id };
  }

  const [created] = await db
    .insert(eceUsers)
    .values({
      email: normalized,
      passwordHash,
      displayName: "Maison Admin",
      role: "admin" as any,
      roles: ["admin"] as any,
      permissions: ["*"] as any,
      currentMode: "admin" as any,
      buyerType: "retail" as any,
      isActive: true,
      emailVerified: true,
      metadata: { seeded: true },
      createdAt: now(),
      updatedAt: now(),
    })
    .returning();
  return created;
}

async function ensureMetTenantAdminRole(tenantId: number, userId: number) {
  const existing = await db.query.userTenantRoles.findFirst({
    where: and(
      eq(userTenantRoles.tenantId, tenantId),
      eq(userTenantRoles.userId, userId),
      eq(userTenantRoles.role, "TENANT_ADMIN"),
    ),
  });
  if (existing) return;

  await db.insert(userTenantRoles).values({
    tenantId,
    userId,
    role: "TENANT_ADMIN",
    createdAt: now(),
  });
}

async function ensureMetSeedProducts(tenantId: number) {
  const existing = await db.query.metProducts.findFirst({ where: eq(metProducts.tenantId, tenantId) });
  if (existing) return;

  const products = [
    {
      name: "Brique BTC 29x14x9",
      sku: "BTC-291409",
      description: "Brique en terre compressee stabilisee pour murs porteurs.",
      dimensionsMm: { length: 290, width: 140, height: 90 },
      compressiveStrengthMpa: "3.50",
      priceCfa: 450,
      unit: "PIECE" as const,
      piecesPerPallet: 300,
    },
    {
      name: "Brique BTC 30x15x10",
      sku: "BTC-301510",
      description: "Format premium pour murs exterieurs avec meilleure inertie.",
      dimensionsMm: { length: 300, width: 150, height: 100 },
      compressiveStrengthMpa: "4.10",
      priceCfa: 600,
      unit: "PIECE" as const,
      piecesPerPallet: 260,
    },
    {
      name: "Palette BTC Standard",
      sku: "BTC-PAL-STD",
      description: "Palette precomposee pour chantiers residentiels.",
      dimensionsMm: { length: 1200, width: 1000, height: 1100 },
      compressiveStrengthMpa: null,
      priceCfa: 120000,
      unit: "PALLET" as const,
      piecesPerPallet: 300,
    },
    {
      name: "Brique Cloison CEB",
      sku: "CEB-CLOISON-20105",
      description: "Brique legere pour cloisons interieures.",
      dimensionsMm: { length: 200, width: 100, height: 50 },
      compressiveStrengthMpa: "2.20",
      priceCfa: 250,
      unit: "PIECE" as const,
      piecesPerPallet: 500,
    },
  ];

  await db.insert(metProducts).values(
    products.map((item) => ({
      tenantId,
      tenantKey: MET_TENANT_KEY,
      name: item.name,
      sku: item.sku,
      description: item.description,
      dimensionsMm: item.dimensionsMm,
      compressiveStrengthMpa: item.compressiveStrengthMpa,
      priceCfa: item.priceCfa,
      unit: item.unit,
      piecesPerPallet: item.piecesPerPallet,
      isActive: true,
      createdAt: now(),
      updatedAt: now(),
    })),
  );
}

async function ensureMetSeedBlog(tenantId: number) {
  const existing = await db.query.metBlogPosts.findFirst({ where: eq(metBlogPosts.tenantId, tenantId) });
  if (existing) return;

  await db.insert(metBlogPosts).values({
    tenantId,
    tenantKey: MET_TENANT_KEY,
    slug: "pourquoi-construire-en-terre-aujourdhui",
    title: "Pourquoi construire en terre aujourd'hui",
    excerpt: "La terre stabilisee permet de construire durable, confortable et economique.",
    contentMarkdown:
      "La construction en terre compressee (BTC/CEB) reduit l'empreinte carbone, ameliore le confort thermique et reste accessible. Notre equipe accompagne votre projet du plan au chantier.",
    coverImageUrl: "/assets/met/blog/terre-durable.jpg",
    publishedAt: now(),
    createdAt: now(),
    updatedAt: now(),
  });
}

async function ensureMetSeedPlan(tenantId: number) {
  const existing = await db.query.metPlans.findFirst({ where: eq(metPlans.tenantId, tenantId) });
  if (existing) return;

  await db.insert(metPlans).values({
    tenantId,
    tenantKey: MET_TENANT_KEY,
    title: "Plan Maison T3 Compacte",
    slug: "plan-maison-t3-compacte",
    description: "Plan type T3 optimise pour 120 m2 avec ventilation naturelle.",
    bedrooms: 3,
    bathrooms: 2,
    floors: 1,
    areaM2: "120.00",
    tags: ["t3", "compact", "terre"],
    thumbnailUrl: "/assets/met/plans/t3-compacte.jpg",
    fileUrl: null,
    isActive: true,
    createdAt: now(),
    updatedAt: now(),
  });
}

async function ensureMetSeedProjects(tenantId: number) {
  const existing = await db.query.metProjects.findFirst({ where: eq(metProjects.tenantId, tenantId) });
  if (existing) return;

  const nowValue = now();
  const [project] = await db
    .insert(metProjects)
    .values({
      tenantId,
      tenantKey: MET_TENANT_KEY,
      title: "Maison modele pilote",
      slug: "maison-modele-pilote",
      summary: "Projet reference pour valider les performances thermiques des BTC/CEB.",
      description:
        "Maison modele completee avec suivi gros oeuvre et finitions. Utilisee pour visites techniques et validation client avant demarrage chantier.",
      location: "Cotonou",
      status: "PUBLISHED",
      isFeatured: true,
      createdAt: nowValue,
      updatedAt: nowValue,
    })
    .returning({ id: metProjects.id });

  await db.insert(metProjectMedia).values([
    {
      tenantId,
      tenantKey: MET_TENANT_KEY,
      projectId: project.id,
      assetUrl: "/assets/met/projects/modele-facade.jpg",
      caption: "Facade principale de la maison modele",
      sortOrder: 1,
      createdAt: now(),
      updatedAt: now(),
    },
    {
      tenantId,
      tenantKey: MET_TENANT_KEY,
      projectId: project.id,
      assetUrl: "/assets/met/projects/modele-salon.jpg",
      caption: "Salon interieur et confort thermique",
      sortOrder: 2,
      createdAt: now(),
      updatedAt: now(),
    },
  ]);
}

async function ensureMetSeedSettings(tenantId: number) {
  const existing = await db.query.metSettings.findFirst({
    where: and(eq(metSettings.tenantId, tenantId), eq(metSettings.key, "homepage.hero")),
  });
  if (existing) return;

  await db.insert(metSettings).values([
    {
      tenantId,
      tenantKey: MET_TENANT_KEY,
      key: "homepage.hero",
      value: {
        title: "Construisez en terre, durablement.",
        subtitle: "Maison modele, briques BTC/CEB et accompagnement devis.",
        ctaPrimary: "Commander des briques",
        ctaSecondary: "Obtenir un devis (plan)",
        ctaThird: "Visiter la maison modele",
      },
      createdAt: now(),
      updatedAt: now(),
    },
    {
      tenantId,
      tenantKey: MET_TENANT_KEY,
      key: "pricing.rules",
      value: {
        defaultDeliveryFeeCfa: 25000,
        includedRadiusKm: 15,
        extraFeePerKmCfa: 1200,
        bricksPerM2Reference: 50,
      },
      createdAt: now(),
      updatedAt: now(),
    },
  ]);
}

export async function seedMetTenantData() {
  const tenant = await ensureMetTenant();
  const tenantId = Number(tenant.id);

  const adminEmail = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const adminSeedPassword = String(process.env.ADMIN_SEED_PASSWORD || "").trim();
  const adminUser = await ensureAdminUser(adminEmail, adminSeedPassword);
  if (adminUser?.id) {
    await ensureMetTenantAdminRole(tenantId, Number(adminUser.id));
  }

  await ensureMetSeedProducts(tenantId);
  await ensureMetSeedBlog(tenantId);
  await ensureMetSeedPlan(tenantId);
  await ensureMetSeedProjects(tenantId);
  await ensureMetSeedSettings(tenantId);

  return {
    tenantId,
    tenantKey: MET_TENANT_KEY,
    adminSeeded: Boolean(adminUser?.id),
  };
}
