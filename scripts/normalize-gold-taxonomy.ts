import "../env";
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { productCategories, sellerProducts, tenants } from "../db/schema";

function getArgValue(flag: string) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

function truthyEnv(value: unknown) {
  return ["1", "true", "yes", "y", "on"].includes(String(value || "").trim().toLowerCase());
}

function normalizeForMatch(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
}

function coerceTags(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map((t) => String(t));
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed.map((t) => String(t));
    } catch {
      // ignore
    }
    return trimmed.split(/[,]+/g).map((t) => t.trim());
  }
  return [];
}

function inferGoldCategorySlug(input: { name?: unknown; description?: unknown; tags?: unknown; currentSlug?: unknown }) {
  const current = String(input.currentSlug || "").trim().toLowerCase();
  if (current === "dore" || current === "stamped" || current === "jewelry" || current === "gold-art") return current;

  const name = normalizeForMatch(input.name);
  const description = normalizeForMatch(input.description);
  const tags = coerceTags(input.tags).map(normalizeForMatch).filter(Boolean);
  const text = `${name} ${description} ${tags.join(" ")}`;

  const isJewelry =
    text.includes("jewel") ||
    text.includes("ring") ||
    text.includes("bracelet") ||
    text.includes("chain") ||
    text.includes("pendant") ||
    text.includes("earring") ||
    tags.some((t) => ["jewelry", "bijou", "ring", "bracelet", "chain", "pendentif"].includes(t));

  const isGoldArt =
    text.includes("bust") ||
    text.includes("medallion") ||
    text.includes("relief") ||
    text.includes("ceremonial") ||
    text.includes("sculpt") ||
    text.includes("statue") ||
    text.includes("artifact") ||
    text.includes("object") ||
    tags.some((t) => ["bust", "medallion", "relief", "ceremonial", "sculpture", "statue", "object"].includes(t));

  if (isGoldArt) return "gold-art";
  if (isJewelry) return "jewelry";

  const isStamped =
    text.includes("stamp") ||
    text.includes("bar") ||
    text.includes("ingot") ||
    text.includes("lingot") ||
    tags.some((t) => ["stamped", "bar", "ingot", "lingot"].includes(t));
  if (isStamped) return "stamped";

  const isDore = text.includes("dore") || tags.includes("dore");
  if (isDore) return "dore";

  return "stamped";
}

function normalizeTagSet(tags: string[], primarySlug: string) {
  const normalizedPrimary = normalizeForMatch(primarySlug);
  const blocked = new Set(
    [
      normalizedPrimary,
      "dore",
      "stamped",
      "jewelry",
      "gold-art",
      ...(normalizedPrimary === "gold-art" ? ["art"] : []),
    ].filter(Boolean),
  );

  const seen = new Set<string>();
  const cleaned: string[] = [];
  for (const tag of tags) {
    const raw = String(tag || "").trim();
    if (!raw) continue;
    const key = normalizeForMatch(raw);
    if (!key) continue;
    if (key.length <= 1) continue;
    if (/^[a-z]{2}$/.test(key)) continue;
    if (blocked.has(key)) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    cleaned.push(raw);
  }
  return cleaned;
}

async function ensureCategory(tenantId: number, input: { slug: string; name: string; description: string; icon: string; color: string; sortOrder: number }) {
  const existing = await db.query.productCategories.findFirst({
    where: and(eq(productCategories.tenantId, tenantId), eq(productCategories.slug, input.slug)),
  });
  if (existing) return existing;

  const [created] = await db
    .insert(productCategories)
    .values({
      tenantId,
      slug: input.slug,
      name: input.name,
      description: input.description,
      icon: input.icon,
      color: input.color,
      sortOrder: input.sortOrder,
      isActive: true,
    })
    .returning();
  return created;
}

async function main() {
  const tenantKey = String(getArgValue("--tenant-key") || process.env.TENANT_KEY || "bdo")
    .trim()
    .toLowerCase();
  const apply = process.argv.includes("--apply");

  if (apply && !truthyEnv(process.env.ALLOW_TAXONOMY_NORMALIZE)) {
    console.error("[normalize-gold-taxonomy] Refusing to run with --apply. Set ALLOW_TAXONOMY_NORMALIZE=true to proceed.");
    process.exit(1);
  }

  const tenant = await db.query.tenants.findFirst({ where: eq(tenants.key, tenantKey) });
  if (!tenant) throw new Error(`Tenant not found for key: ${tenantKey}`);

  const [doreCategory, stampedCategory, jewelryCategory, goldArtCategory] = await Promise.all([
    ensureCategory(tenant.id, {
      slug: "dore",
      name: "Doré Lots",
      description: "Wholesale doré lots sourced from licensed suppliers",
      icon: "dore",
      color: "#EA580C",
      sortOrder: 1,
    }),
    ensureCategory(tenant.id, {
      slug: "stamped",
      name: "Stamped Gold",
      description: "Stamped refined gold pieces (10g+)",
      icon: "stamped",
      color: "#10B981",
      sortOrder: 2,
    }),
    ensureCategory(tenant.id, {
      slug: "jewelry",
      name: "Jewelry",
      description: "Curated jewelry pieces from verified manufacturers",
      icon: "jewelry",
      color: "#A855F7",
      sortOrder: 3,
    }),
    ensureCategory(tenant.id, {
      slug: "gold-art",
      name: "Gold Art",
      description: "Curated gold art objects from verified manufacturers",
      icon: "art",
      color: "#EAB308",
      sortOrder: 4,
    }),
  ]);

  const categoryBySlug: Record<string, number> = {
    dore: doreCategory.id,
    stamped: stampedCategory.id,
    jewelry: jewelryCategory.id,
    "gold-art": goldArtCategory.id,
  };

  const products = await db
    .select({
      id: sellerProducts.id,
      name: sellerProducts.name,
      description: sellerProducts.description,
      tags: sellerProducts.tags,
      categoryId: sellerProducts.categoryId,
      categorySlug: productCategories.slug,
    })
    .from(sellerProducts)
    .leftJoin(productCategories, eq(sellerProducts.categoryId, productCategories.id))
    .where(eq(sellerProducts.tenantId, tenant.id));

  let categoryFixes = 0;
  let tagFixes = 0;

  for (const p of products) {
    const currentSlug = p.categorySlug ? String(p.categorySlug) : "";
    const desiredSlug = inferGoldCategorySlug({
      name: p.name,
      description: p.description,
      tags: p.tags,
      currentSlug,
    });

    const desiredCategoryId = categoryBySlug[desiredSlug];
    const needsCategory = !p.categoryId || Number(p.categoryId) !== desiredCategoryId;

    const currentTags = coerceTags(p.tags);
    const nextTags = normalizeTagSet(currentTags, desiredSlug);
    const needsTags = JSON.stringify(currentTags) !== JSON.stringify(nextTags);

    if (!needsCategory && !needsTags) continue;

    if (!apply) {
      if (needsCategory) categoryFixes++;
      if (needsTags) tagFixes++;
      continue;
    }

    const next: any = { updatedAt: new Date() };
    if (needsCategory) {
      next.categoryId = desiredCategoryId;
      categoryFixes++;
    }
    if (needsTags) {
      next.tags = nextTags;
      tagFixes++;
    }

    await db.update(sellerProducts).set(next).where(eq(sellerProducts.id, p.id));
  }

  console.log("[normalize-gold-taxonomy] Done.");
  console.log(`- tenant: ${tenant.key} (#${tenant.id})`);
  console.log(`- ${apply ? "category fixes" : "would-fix category assignments"}: ${categoryFixes}`);
  console.log(`- ${apply ? "tag fixes" : "would-fix tag sets"}: ${tagFixes}`);
  console.log(`- mode: ${apply ? "applied" : "dry-run"}`);
}

main().catch((err) => {
  console.error("normalize-gold-taxonomy failed:", err);
  process.exitCode = 1;
});
