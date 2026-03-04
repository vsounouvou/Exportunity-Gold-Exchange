import "../env";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { productCategories, sellerProducts } from "@db/schema";

type GoldCategorySlug = "dore" | "stamped" | "jewelry";

const IMAGE_POOLS: Record<GoldCategorySlug, string[]> = {
  dore: [
    "/product-images/dore-nuggets-01.png",
    "/product-images/dore-nuggets-02.png",
    "/product-images/dore-lot-01.png",
    "/product-images/dore-dust-01.png",
  ],
  stamped: [
    "/product-images/stamped-bar-01.png",
    "/product-images/stamped-bar-02.png",
    "/product-images/stamped-piece-01.png",
    "/product-images/gold-card.png",
    "/product-images/gold-coin.png",
  ],
  jewelry: [
    "/product-images/jewelry-chain.png",
    "/product-images/jewelry-chain-02.png",
    "/product-images/jewelry-bracelet.png",
    "/product-images/jewelry-bracelet-02.png",
    "/product-images/jewelry-earrings.png",
    "/product-images/jewelry-pendant.png",
    "/product-images/custom-ring.png",
    "/product-images/custom-ring-02.png",
    "/product-images/art-bust.png",
    "/product-images/art-bust-02.png",
    "/product-images/art-medallion.png",
    "/product-images/art-medallion-02.png",
    "/product-images/art-ceremonial.png",
    "/product-images/art-medallion.png",
  ],
};

function pickImagesForProduct(args: { id: number; name: string; categorySlug: GoldCategorySlug }, minCount = 3) {
  const lower = args.name.toLowerCase();
  const pool = IMAGE_POOLS[args.categorySlug] ?? [];

  const preferred =
    args.categorySlug === "dore"
      ? lower.includes("dust")
        ? "/product-images/dore-dust-01.png"
        : lower.includes("nugget")
          ? "/product-images/dore-nuggets-01.png"
          : lower.includes("lot")
            ? "/product-images/dore-lot-01.png"
            : null
      : args.categorySlug === "stamped"
        ? lower.includes("coin")
          ? "/product-images/gold-coin.png"
          : lower.includes("card")
            ? "/product-images/gold-card.png"
            : lower.includes("bar") || lower.includes("stamped")
              ? "/product-images/stamped-bar-01.png"
              : null
        : lower.includes("earring")
          ? "/product-images/jewelry-earrings.png"
          : lower.includes("bracelet")
            ? "/product-images/jewelry-bracelet.png"
            : lower.includes("pendant")
              ? "/product-images/jewelry-pendant.png"
              : lower.includes("chain")
                ? "/product-images/jewelry-chain.png"
                : lower.includes("ring")
                  ? "/product-images/custom-ring.png"
                  : lower.includes("medallion")
                    ? "/product-images/art-medallion.png"
                    : lower.includes("ceremonial") || lower.includes("object")
                      ? "/product-images/art-ceremonial.png"
                      : "/product-images/art-bust.png";

  const selected: string[] = [];
  if (preferred) selected.push(preferred);

  const start = pool.length ? Math.abs(args.id) % pool.length : 0;
  for (let i = 0; selected.length < minCount && i < pool.length; i++) {
    const candidate = pool[(start + i) % pool.length];
    if (!selected.includes(candidate)) selected.push(candidate);
  }

  return selected.slice(0, Math.max(minCount, selected.length));
}

function isEmptyImages(images: unknown) {
  if (images == null) return true;
  if (Array.isArray(images)) return images.length === 0;
  return false;
}

async function main() {
  const force = process.argv.includes("--force");
  const minCountArg = (() => {
    const idx = process.argv.indexOf("--min");
    if (idx === -1) return null;
    const raw = process.argv[idx + 1];
    const parsed = Number.parseInt(String(raw), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  })();
  const minCount = minCountArg ?? 3;

  const slugArg = (() => {
    const idx = process.argv.indexOf("--category");
    if (idx === -1) return null;
    const raw = String(process.argv[idx + 1] || "").trim().toLowerCase();
    return raw === "dore" || raw === "stamped" || raw === "jewelry" ? (raw as GoldCategorySlug) : null;
  })();

  const slugs: GoldCategorySlug[] = slugArg ? [slugArg] : ["dore", "stamped", "jewelry"];

  const categories = await db.query.productCategories.findMany({
    where: inArray(productCategories.slug, slugs),
    columns: { id: true, slug: true },
  });

  if (!categories.length) {
    console.log(`No product categories found for: ${slugs.join(", ")}; nothing to backfill.`);
    return;
  }

  const slugById = new Map<number, GoldCategorySlug>();
  for (const c of categories) {
    const slug = String(c.slug);
    if (slug === "dore" || slug === "stamped" || slug === "jewelry") slugById.set(c.id, slug);
  }

  const candidates = await db.query.sellerProducts.findMany({
    where: and(inArray(sellerProducts.categoryId, categories.map((c) => c.id)), eq(sellerProducts.status, "active")),
    columns: { id: true, name: true, images: true, categoryId: true },
  });

  const toUpdate = force ? candidates : candidates.filter((p) => isEmptyImages(p.images));
  if (!toUpdate.length) {
    console.log(force ? "No active products found." : "No active products with empty images found.");
    return;
  }

  let updated = 0;
  for (const p of toUpdate) {
    const slug = p.categoryId ? slugById.get(p.categoryId) : null;
    if (!slug) continue;
    const images = pickImagesForProduct({ id: p.id, name: p.name, categorySlug: slug }, minCount);
    await db
      .update(sellerProducts)
      .set({
        images,
        updatedAt: new Date(),
      })
      .where(eq(sellerProducts.id, p.id));
    updated++;
  }

  console.log(`Updated ${updated} products.${force ? " (force)" : ""}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
