import "../env";

import { and, eq } from "drizzle-orm";

import { db } from "@db";
import { productCategories, sellerProducts, sellers, tenants, users } from "@db/schema";

type SupportedTenant = "mindbase" | "met" | "vs";

type ProductSeed = {
  name: string;
  slug: string;
  price: number;
  tags: string[];
  shortDescription: string;
};

type CategorySeed = {
  slug: string;
  name: string;
  description: string;
  products: ProductSeed[];
};

type TenantSeedSpec = {
  ownerEmail: string;
  ownerDisplayName: string;
  sellerSlug: string;
  sellerName: string;
  sellerDescription: string;
  sellerAddress: string;
  sellerLat: string;
  sellerLng: string;
  placeholderImage: string;
  categories: CategorySeed[];
};

const SEED_VERSION = "tenant-identity-catalog-v1";

const SEED_SPECS: Record<SupportedTenant, TenantSeedSpec> = {
  mindbase: {
    ownerEmail: "seed.mindbase@exportunity.local",
    ownerDisplayName: "MindBase Seed Owner",
    sellerSlug: "mindbase-studio",
    sellerName: "MindBase Intelligence Studio",
    sellerDescription: "Deployable agents, prompt packs, knowledge kits, and workflow assets.",
    sellerAddress: "Plateau, Abidjan",
    sellerLat: "5.3319",
    sellerLng: "-4.0231",
    placeholderImage: "/tenants/mindbase/placeholder-product.svg",
    categories: [
      {
        slug: "featured-agents",
        name: "Featured Agents",
        description: "Deployable specialized intelligence products.",
        products: [
          {
            name: "Market Research Agent",
            slug: "market-research-agent",
            price: 35000,
            tags: ["agent", "research", "strategy"],
            shortDescription: "Research briefs and opportunity scans in one deployable agent pack.",
          },
          {
            name: "Territory Expansion Strategist",
            slug: "territory-expansion-strategist",
            price: 42000,
            tags: ["agent", "expansion", "strategy"],
            shortDescription: "Regional expansion planning with risk and execution checklists.",
          },
          {
            name: "Contract Analyzer Agent",
            slug: "contract-analyzer-agent",
            price: 39000,
            tags: ["agent", "legal", "contracts"],
            shortDescription: "Clause-by-clause review assistant for commercial contracts.",
          },
          {
            name: "Investment Intelligence Agent",
            slug: "investment-intelligence-agent",
            price: 46000,
            tags: ["agent", "finance", "investment"],
            shortDescription: "Scenario-ready investment memos and diligence summaries.",
          },
        ],
      },
      {
        slug: "prompt-packs",
        name: "Prompt Packs",
        description: "Production-ready cognitive templates.",
        products: [
          {
            name: "Startup Strategy Prompt Pack",
            slug: "startup-strategy-prompt-pack",
            price: 15000,
            tags: ["prompts", "startup", "strategy"],
            shortDescription: "Structured prompts for market sizing, positioning, and launch planning.",
          },
          {
            name: "Negotiation Playbook Prompts",
            slug: "negotiation-playbook-prompts",
            price: 14000,
            tags: ["prompts", "negotiation", "sales"],
            shortDescription: "Prompt flows for procurement and partner negotiation scenarios.",
          },
          {
            name: "Investor Brief Prompt Kit",
            slug: "investor-brief-prompt-kit",
            price: 16000,
            tags: ["prompts", "fundraising", "investors"],
            shortDescription: "Reusable prompts for concise investor updates and briefings.",
          },
        ],
      },
      {
        slug: "knowledge-kits",
        name: "Knowledge Kits",
        description: "Structured expertise bundles.",
        products: [
          {
            name: "SME Finance Knowledge Kit",
            slug: "sme-finance-knowledge-kit",
            price: 28000,
            tags: ["knowledge", "finance", "sme"],
            shortDescription: "Finance SOPs, controls, and templates for operating teams.",
          },
          {
            name: "Supply Chain Playbook Kit",
            slug: "supply-chain-playbook-kit",
            price: 30000,
            tags: ["knowledge", "supply-chain", "operations"],
            shortDescription: "Cross-border supply chain checklists and execution frameworks.",
          },
          {
            name: "Procurement Governance Kit",
            slug: "procurement-governance-kit",
            price: 26000,
            tags: ["knowledge", "procurement", "governance"],
            shortDescription: "Policy templates, approval matrices, and governance controls.",
          },
        ],
      },
      {
        slug: "workflows",
        name: "Automation Workflows",
        description: "Reusable action systems and orchestration templates.",
        products: [
          {
            name: "Automated Market Report Workflow",
            slug: "automated-market-report-workflow",
            price: 33000,
            tags: ["workflow", "reports", "automation"],
            shortDescription: "Daily market monitoring and report generation workflow.",
          },
          {
            name: "Investor Update Workflow",
            slug: "investor-update-workflow",
            price: 29000,
            tags: ["workflow", "investor", "communication"],
            shortDescription: "Recurring investor update workflow with action logging.",
          },
          {
            name: "Launch Operations Workflow",
            slug: "launch-operations-workflow",
            price: 31000,
            tags: ["workflow", "launch", "operations"],
            shortDescription: "Go-to-market workflow spanning planning, execution, and review.",
          },
        ],
      },
    ],
  },
  met: {
    ownerEmail: "seed.met@exportunity.local",
    ownerDisplayName: "Maison en Terre Seed Owner",
    sellerSlug: "met-materials-hub",
    sellerName: "Maison en Terre Materials Hub",
    sellerDescription: "Earth-first construction materials, plans, and contractor services.",
    sellerAddress: "Cocody, Abidjan",
    sellerLat: "5.3452",
    sellerLng: "-3.9841",
    placeholderImage: "/tenants/met/placeholder-product.svg",
    categories: [
      {
        slug: "earth-bricks",
        name: "Earth Bricks",
        description: "CSEB and BTC block inventory.",
        products: [
          {
            name: "CSEB Block 290x140x90",
            slug: "cseb-block-290x140x90",
            price: 450,
            tags: ["materials", "cseb", "earth-bricks"],
            shortDescription: "Stabilized compressed earth block for structural wall systems.",
          },
          {
            name: "BTC Block Premium 300x150x100",
            slug: "btc-block-premium-300x150x100",
            price: 620,
            tags: ["materials", "btc", "earth-bricks"],
            shortDescription: "Premium compressed earth block for higher thermal inertia.",
          },
          {
            name: "Interlocking Earth Block",
            slug: "interlocking-earth-block",
            price: 700,
            tags: ["materials", "earth-bricks", "interlocking"],
            shortDescription: "Interlocking earth block reducing mortar consumption on site.",
          },
        ],
      },
      {
        slug: "house-plans",
        name: "House Plans",
        description: "Model home plans and implementation guides.",
        products: [
          {
            name: "Eco House Plan T2 Compact",
            slug: "eco-house-plan-t2-compact",
            price: 55000,
            tags: ["plans", "housing", "eco"],
            shortDescription: "Compact T2 plan optimized for natural ventilation and cooling.",
          },
          {
            name: "Eco House Plan T3 Family",
            slug: "eco-house-plan-t3-family",
            price: 78000,
            tags: ["plans", "housing", "family"],
            shortDescription: "T3 family plan with modular expansion options.",
          },
          {
            name: "Community Housing Unit Plan",
            slug: "community-housing-unit-plan",
            price: 92000,
            tags: ["plans", "community", "construction"],
            shortDescription: "Replicable plan bundle for clustered community housing units.",
          },
        ],
      },
      {
        slug: "contractors",
        name: "Contractor Network",
        description: "Verified builders and execution partners.",
        products: [
          {
            name: "Foundation & Site Team",
            slug: "foundation-site-team",
            price: 145000,
            tags: ["services", "contractors", "foundation"],
            shortDescription: "On-site crew for foundation preparation and first-stage execution.",
          },
          {
            name: "Earth Wall Assembly Crew",
            slug: "earth-wall-assembly-crew",
            price: 175000,
            tags: ["services", "contractors", "walls"],
            shortDescription: "Certified assembly team for compressed earth wall installations.",
          },
          {
            name: "Finish & Plaster Crew",
            slug: "finish-plaster-crew",
            price: 160000,
            tags: ["services", "contractors", "plaster"],
            shortDescription: "Finishing team specialized in clay and lime plaster systems.",
          },
        ],
      },
      {
        slug: "tools",
        name: "Tools & Equipment",
        description: "Build kits and equipment bundles.",
        products: [
          {
            name: "CSEB Starter Tool Kit",
            slug: "cseb-starter-tool-kit",
            price: 48000,
            tags: ["tools", "construction", "cseb"],
            shortDescription: "Starter tool bundle for earth block preparation and installation.",
          },
          {
            name: "Clay Plaster Application Kit",
            slug: "clay-plaster-application-kit",
            price: 36000,
            tags: ["tools", "plaster", "finishing"],
            shortDescription: "Application toolkit for clay plaster surfaces and detailing.",
          },
          {
            name: "Solar Lighting Build Kit",
            slug: "solar-lighting-build-kit",
            price: 64000,
            tags: ["tools", "solar", "electrical"],
            shortDescription: "Entry-level solar lighting kit for earth-home installations.",
          },
        ],
      },
    ],
  },
  vs: {
    ownerEmail: "seed.vs@exportunity.local",
    ownerDisplayName: "Vital Sounouvou Seed Owner",
    sellerSlug: "vs-studio",
    sellerName: "Vital Sounouvou Studio",
    sellerDescription: "Books, courses, talks, and strategic digital assets.",
    sellerAddress: "Plateau, Abidjan",
    sellerLat: "5.3328",
    sellerLng: "-4.0285",
    placeholderImage: "/tenants/vs/placeholder-product.svg",
    categories: [
      {
        slug: "books",
        name: "Books",
        description: "Editorial books and long-form publications.",
        products: [
          {
            name: "Controlled Digital Civilization",
            slug: "controlled-digital-civilization-book",
            price: 19500,
            tags: ["books", "governance", "strategy"],
            shortDescription: "Frameworks for authority, hierarchy, and deterministic execution.",
          },
          {
            name: "AI Command Structure",
            slug: "ai-command-structure-book",
            price: 17500,
            tags: ["books", "ai", "operations"],
            shortDescription: "Operational doctrine for scaling AI-run organizations.",
          },
          {
            name: "Strategic Systems Notebook",
            slug: "strategic-systems-notebook-book",
            price: 14000,
            tags: ["books", "systems", "leadership"],
            shortDescription: "Practical notebooks for strategic planning and execution review.",
          },
        ],
      },
      {
        slug: "courses",
        name: "Courses",
        description: "Structured learning programs and classes.",
        products: [
          {
            name: "AI Governance Masterclass",
            slug: "ai-governance-masterclass-course",
            price: 65000,
            tags: ["courses", "ai", "governance"],
            shortDescription: "Command-layer training for governed AI organizations.",
          },
          {
            name: "Operational Discipline Intensive",
            slug: "operational-discipline-intensive-course",
            price: 52000,
            tags: ["courses", "operations", "discipline"],
            shortDescription: "Execution-focused systems for managerial and ops teams.",
          },
          {
            name: "Strategic Communication Program",
            slug: "strategic-communication-program-course",
            price: 47000,
            tags: ["courses", "communication", "leadership"],
            shortDescription: "Narrative and authority-building communication curriculum.",
          },
        ],
      },
      {
        slug: "talks",
        name: "Talks",
        description: "Conference and keynote content assets.",
        products: [
          {
            name: "Chairman Keynote Package",
            slug: "chairman-keynote-package-talk",
            price: 90000,
            tags: ["talks", "keynote", "leadership"],
            shortDescription: "Keynote package for leadership and innovation conferences.",
          },
          {
            name: "AI-Run Company Lecture",
            slug: "ai-run-company-lecture-talk",
            price: 78000,
            tags: ["talks", "ai", "operations"],
            shortDescription: "Lecture module on building deterministic AI operating structures.",
          },
          {
            name: "Governance and Scale Panel Kit",
            slug: "governance-scale-panel-kit-talk",
            price: 68000,
            tags: ["talks", "governance", "scale"],
            shortDescription: "Panel-ready content kit covering governance and organizational scale.",
          },
        ],
      },
      {
        slug: "digital-assets",
        name: "Digital Assets",
        description: "Playbooks, templates, and operating kits.",
        products: [
          {
            name: "AI Command Playbook PDF",
            slug: "ai-command-playbook-pdf-asset",
            price: 12000,
            tags: ["assets", "playbook", "ai"],
            shortDescription: "Digital playbook for implementing an AI command structure.",
          },
          {
            name: "PR Governance Templates",
            slug: "pr-governance-templates-asset",
            price: 9500,
            tags: ["assets", "templates", "pr"],
            shortDescription: "Template bundle for reputation and media governance workflows.",
          },
          {
            name: "Execution Dashboard Bundle",
            slug: "execution-dashboard-bundle-asset",
            price: 14500,
            tags: ["assets", "dashboards", "operations"],
            shortDescription: "Operational dashboard components for disciplined execution teams.",
          },
        ],
      },
      {
        slug: "insights",
        name: "Insights",
        description: "Strategic essays and field-note releases.",
        products: [
          {
            name: "Weekly Field Notes Subscription",
            slug: "weekly-field-notes-subscription-insights",
            price: 7000,
            tags: ["insights", "newsletter", "strategy"],
            shortDescription: "Weekly strategic insights and operating notes.",
          },
          {
            name: "Monthly Civilization Brief",
            slug: "monthly-civilization-brief-insights",
            price: 9000,
            tags: ["insights", "brief", "leadership"],
            shortDescription: "Monthly briefing on AI governance and civilization-scale systems.",
          },
          {
            name: "Executive Insight Archive",
            slug: "executive-insight-archive-insights",
            price: 15000,
            tags: ["insights", "archive", "executive"],
            shortDescription: "Archive access to prior strategic essays and executive memos.",
          },
        ],
      },
    ],
  },
};

function getArg(name: string) {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  return String(process.argv[index + 1] || "").trim() || null;
}

function supportsTenant(value: string): value is SupportedTenant {
  return value === "mindbase" || value === "met" || value === "vs";
}

function slugify(input: string) {
  return String(input || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

async function ensureOwnerUser(input: { email: string; displayName: string; apply: boolean }) {
  const existing = await db.query.users.findFirst({ where: eq(users.email, input.email as any) });
  if (existing || !input.apply) return existing || null;

  const [created] = await db
    .insert(users)
    .values({
      displayName: input.displayName,
      email: input.email,
      role: "admin",
      accountType: "Platform",
      language: "en",
      timezone: "UTC",
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any)
    .returning();
  return created || null;
}

async function ensureSeller(input: {
  tenantId: number;
  ownerUserId: number;
  spec: TenantSeedSpec;
  apply: boolean;
}) {
  const existing = await db.query.sellers.findFirst({
    where: and(eq(sellers.tenantId, input.tenantId), eq(sellers.slug, input.spec.sellerSlug)),
  });
  if (existing || !input.apply) return existing || null;

  const [created] = await db
    .insert(sellers)
    .values({
      tenantId: input.tenantId,
      userId: input.ownerUserId,
      shopName: input.spec.sellerName,
      slug: input.spec.sellerSlug,
      description: input.spec.sellerDescription,
      streetAddress: input.spec.sellerAddress,
      latitude: input.spec.sellerLat,
      longitude: input.spec.sellerLng,
      sellerType: "retail_shop",
      status: "approved",
      isProducer: true,
      isDemo: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any)
    .returning();
  return created || null;
}

async function ensureCategory(input: {
  tenantId: number;
  seed: CategorySeed;
  sortOrder: number;
  apply: boolean;
}) {
  const existing = await db.query.productCategories.findFirst({
    where: and(eq(productCategories.tenantId, input.tenantId), eq(productCategories.slug, input.seed.slug)),
  });
  if (existing) return existing;
  if (!input.apply) return null;

  const [created] = await db
    .insert(productCategories)
    .values({
      tenantId: input.tenantId,
      slug: input.seed.slug,
      name: input.seed.name,
      description: input.seed.description,
      isActive: true,
      sortOrder: input.sortOrder,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any)
    .returning();
  return created || null;
}

async function ensureProduct(input: {
  tenantId: number;
  sellerId: number;
  categoryId: number | null;
  placeholderImage: string;
  seed: ProductSeed;
  apply: boolean;
}) {
  const baseSlug = `${input.seed.slug}-${input.tenantId}`;
  const existing = await db.query.sellerProducts.findFirst({
    where: and(eq(sellerProducts.tenantId, input.tenantId), eq(sellerProducts.slug, baseSlug)),
  });
  if (existing) {
    if (!input.apply) return false;
    await db
      .update(sellerProducts)
      .set({
        sellerId: input.sellerId,
        categoryId: input.categoryId,
        name: input.seed.name,
        description: input.seed.shortDescription,
        shortDescription: input.seed.shortDescription,
        price: String(input.seed.price),
        currency: "XOF",
        stockQuantity: 250,
        status: "active",
        images: [input.placeholderImage],
        tags: input.seed.tags,
        attributes: {
          isPlatformSeed: true,
          seedVersion: SEED_VERSION,
        },
        updatedAt: new Date(),
      } as any)
      .where(eq(sellerProducts.id, existing.id));
    return false;
  }

  if (!input.apply) return true;

  await db.insert(sellerProducts).values({
    tenantId: input.tenantId,
    sellerId: input.sellerId,
    categoryId: input.categoryId,
    name: input.seed.name,
    slug: baseSlug,
    description: input.seed.shortDescription,
    shortDescription: input.seed.shortDescription,
    price: String(input.seed.price),
    currency: "XOF",
    stockQuantity: 250,
    status: "active",
    images: [input.placeholderImage],
    tags: input.seed.tags,
    attributes: {
      isPlatformSeed: true,
      seedVersion: SEED_VERSION,
    },
    sku: `SEED-${slugify(input.seed.slug).toUpperCase().slice(0, 18)}-${input.tenantId}`,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as any);

  return true;
}

async function main() {
  const tenantKeyArg = String(getArg("--tenant") || "").toLowerCase();
  if (!supportsTenant(tenantKeyArg)) {
    throw new Error("Missing or unsupported --tenant. Supported: mindbase, met, vs");
  }

  const apply = process.argv.includes("--apply");
  if (apply && String(process.env.ALLOW_UX_SEED || "").trim().toLowerCase() !== "true") {
    throw new Error("Refusing apply mode. Set ALLOW_UX_SEED=true.");
  }

  const spec = SEED_SPECS[tenantKeyArg];
  const tenant = await db.query.tenants.findFirst({ where: eq(tenants.key, tenantKeyArg as any) });
  if (!tenant) throw new Error(`Tenant not found: ${tenantKeyArg}`);

  const owner = await ensureOwnerUser({
    email: spec.ownerEmail,
    displayName: spec.ownerDisplayName,
    apply,
  });
  if (!owner && apply) throw new Error("Failed to resolve/create seed owner user.");

  const resolvedOwnerId = owner?.id || 1;
  const seller = await ensureSeller({
    tenantId: tenant.id,
    ownerUserId: resolvedOwnerId,
    spec,
    apply,
  });
  const resolvedSellerId = seller?.id || 0;

  const summary = {
    tenant: tenantKeyArg,
    tenantId: tenant.id,
    mode: apply ? "apply" : "dry-run",
    categoriesPlanned: spec.categories.length,
    categoriesCreated: 0,
    productsPlanned: 0,
    productsCreated: 0,
    productsUpdated: 0,
  };

  for (let i = 0; i < spec.categories.length; i += 1) {
    const categorySeed = spec.categories[i];
    const category = await ensureCategory({
      tenantId: tenant.id,
      seed: categorySeed,
      sortOrder: i + 1,
      apply,
    });
    if (category && apply) summary.categoriesCreated += 1;

    for (const productSeed of categorySeed.products) {
      summary.productsPlanned += 1;
      const created = await ensureProduct({
        tenantId: tenant.id,
        sellerId: resolvedSellerId,
        categoryId: category?.id || null,
        placeholderImage: spec.placeholderImage,
        seed: productSeed,
        apply,
      });
      if (created) {
        summary.productsCreated += 1;
      } else {
        summary.productsUpdated += 1;
      }
    }
  }

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error("[seed-tenant-identity-catalog] failed", error);
  process.exitCode = 1;
});
