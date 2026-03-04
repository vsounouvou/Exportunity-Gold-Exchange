import { and, eq } from "drizzle-orm";

import { db } from "@db";
import { productCategories, sellerProducts, sellers, tenants, users } from "@db/schema";

type SeedItem = {
  category: string;
  name: string;
  slug: string;
  price: string;
  tags: string[];
};

const TENANT_KEY = "zogueland";
const SELLER_SLUG = "zogueland-studio";

const CATEGORY_NAMES = [
  "Stories",
  "Audiobooks",
  "Printable Books",
  "STEM Kits",
  "Educational Toys",
  "Art Packs",
  "Character Avatars",
  "Wall Art",
  "Clothing",
  "Learning Tools",
];

const ITEMS: SeedItem[] = [
  { category: "Stories", name: "Zogue and the River of Light", slug: "zogueland-story-river-of-light", price: "3500", tags: ["story", "kids"] },
  { category: "Stories", name: "The Forest of Curious Robots", slug: "zogueland-story-curious-robots", price: "3500", tags: ["story", "stem"] },
  { category: "Stories", name: "Nina Builds a Solar Kite", slug: "zogueland-story-solar-kite", price: "3500", tags: ["story", "solar"] },
  { category: "Stories", name: "Grandma's Market Adventure", slug: "zogueland-story-market-adventure", price: "3000", tags: ["story", "culture"] },
  { category: "Stories", name: "The Day the Baobab Spoke", slug: "zogueland-story-baobab-spoke", price: "3200", tags: ["story", "folklore"] },
  { category: "Stories", name: "Moonlight Drummers", slug: "zogueland-story-moonlight-drummers", price: "3200", tags: ["story", "music"] },
  { category: "Stories", name: "Ama and the Hidden Workshop", slug: "zogueland-story-hidden-workshop", price: "3500", tags: ["story", "maker"] },
  { category: "Stories", name: "Little Engineers of Cotonou", slug: "zogueland-story-engineers-cotonou", price: "3500", tags: ["story", "stem"] },
  { category: "Stories", name: "The Compass of Kindness", slug: "zogueland-story-compass-kindness", price: "3000", tags: ["story", "values"] },
  { category: "Stories", name: "Festival of Colors", slug: "zogueland-story-festival-colors", price: "3200", tags: ["story", "art"] },

  { category: "Audiobooks", name: "River of Light (Audio)", slug: "zogueland-audio-river-of-light", price: "4500", tags: ["audio", "story"] },
  { category: "Audiobooks", name: "Curious Robots (Audio)", slug: "zogueland-audio-curious-robots", price: "4500", tags: ["audio", "stem"] },
  { category: "Audiobooks", name: "Solar Kite (Audio)", slug: "zogueland-audio-solar-kite", price: "4500", tags: ["audio", "solar"] },
  { category: "Audiobooks", name: "Moonlight Drummers (Audio)", slug: "zogueland-audio-moonlight-drummers", price: "4300", tags: ["audio", "music"] },
  { category: "Audiobooks", name: "Festival of Colors (Audio)", slug: "zogueland-audio-festival-colors", price: "4300", tags: ["audio", "art"] },

  { category: "Printable Books", name: "Printable STEM Quest Pack", slug: "zogueland-printable-stem-quest", price: "5500", tags: ["printable", "stem"] },
  { category: "Printable Books", name: "Printable Coloring Atlas", slug: "zogueland-printable-coloring-atlas", price: "5000", tags: ["printable", "art"] },
  { category: "Printable Books", name: "Printable Story Theater", slug: "zogueland-printable-story-theater", price: "5200", tags: ["printable", "story"] },
  { category: "Printable Books", name: "Printable Math Mission", slug: "zogueland-printable-math-mission", price: "5000", tags: ["printable", "math"] },
  { category: "Printable Books", name: "Printable Science Lab", slug: "zogueland-printable-science-lab", price: "5500", tags: ["printable", "science"] },

  { category: "Character Avatars", name: "Avatar Template: Explorer Zia", slug: "zogueland-avatar-zia", price: "6000", tags: ["avatar", "template"] },
  { category: "Character Avatars", name: "Avatar Template: Builder Kofi", slug: "zogueland-avatar-kofi", price: "6000", tags: ["avatar", "template"] },
  { category: "Character Avatars", name: "Avatar Template: Inventor Lila", slug: "zogueland-avatar-lila", price: "6000", tags: ["avatar", "template"] },
];

function slugify(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

async function ensureTenant() {
  const tenant = await db.query.tenants.findFirst({ where: eq(tenants.key, TENANT_KEY as any) });
  if (!tenant) throw new Error(`Tenant ${TENANT_KEY} not found. Run migrations first.`);
  return tenant;
}

async function ensureOwnerUser() {
  const existing = await db.query.users.findFirst({ where: eq(users.email, "admin@zogueland.com" as any) });
  if (existing) return existing;

  const inserted = await db
    .insert(users)
    .values({
      displayName: "Zogueland Admin",
      email: "admin@zogueland.com",
      role: "admin",
      accountType: "Platform",
      language: "en",
      timezone: "UTC",
    } as any)
    .returning();

  return inserted[0];
}

async function ensureCategories(tenantId: number) {
  const map = new Map<string, number>();

  for (const name of CATEGORY_NAMES) {
    const slug = `zogueland-${slugify(name)}`;
    const existing = await db.query.productCategories.findFirst({
      where: and(eq(productCategories.tenantId, tenantId), eq(productCategories.slug, slug)),
    });

    if (existing) {
      map.set(name, existing.id);
      continue;
    }

    const inserted = await db
      .insert(productCategories)
      .values({
        tenantId,
        name,
        slug,
        description: `${name} category for Zogueland platform seed`,
        isActive: true,
        sortOrder: CATEGORY_NAMES.indexOf(name),
      } as any)
      .returning();

    map.set(name, inserted[0].id);
  }

  return map;
}

async function ensureSeller(tenantId: number, ownerUserId: number) {
  const existing = await db.query.sellers.findFirst({
    where: and(eq(sellers.tenantId, tenantId), eq(sellers.slug, SELLER_SLUG)),
  });
  if (existing) return existing;

  const inserted = await db
    .insert(sellers)
    .values({
      tenantId,
      userId: ownerUserId,
      shopName: "Zogueland Studio",
      slug: SELLER_SLUG,
      description: "Platform seed studio for Zogueland stories, audio, and printable products.",
      sellerType: "retail_shop",
      status: "approved",
      isDemo: true,
      isProducer: true,
    } as any)
    .returning();

  return inserted[0];
}

async function ensureProducts(tenantId: number, sellerId: number, categoryByName: Map<string, number>) {
  let created = 0;
  let skipped = 0;

  for (const item of ITEMS) {
    const existing = await db.query.sellerProducts.findFirst({
      where: and(eq(sellerProducts.tenantId, tenantId), eq(sellerProducts.slug, item.slug)),
    });
    if (existing) {
      skipped += 1;
      continue;
    }

    const categoryId = categoryByName.get(item.category) || null;

    await db.insert(sellerProducts).values({
      tenantId,
      sellerId,
      categoryId,
      name: item.name,
      slug: item.slug,
      description: `${item.name} — platform demo seed for Zogueland`,
      shortDescription: item.name,
      price: item.price,
      currency: "XOF",
      stockQuantity: 500,
      status: "active",
      tags: item.tags,
      attributes: {
        isPlatformSeed: true,
        seedFamily: item.category,
      },
      isHandmade: false,
      trackInventory: true,
      allowBackorder: true,
    } as any);

    created += 1;
  }

  return { created, skipped };
}

async function main() {
  const tenant = await ensureTenant();
  const owner = await ensureOwnerUser();
  const categories = await ensureCategories(tenant.id);
  const seller = await ensureSeller(tenant.id, owner.id);
  const products = await ensureProducts(tenant.id, seller.id, categories);

  console.log(
    JSON.stringify(
      {
        ok: true,
        tenantKey: TENANT_KEY,
        tenantId: tenant.id,
        sellerId: seller.id,
        categoriesSeeded: CATEGORY_NAMES.length,
        products,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error("[seed-zogueland] failed", error);
  process.exitCode = 1;
});
