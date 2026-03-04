import { db } from "@db";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { generatedImages, imageAssets, productCategories, productImages, sellerProducts, tenants } from "@db/schema";
import { getProductPrimaryAssetKey } from "./productPrompt";

export type ProductImageRole = "primary" | "angle" | "detail" | "lifestyle";

export type ProductImageSlotDescriptor = {
  role: ProductImageRole;
  label: string;
  slotKey: string;
  angle?: string;
  position: number;
};

function slugify(value: string): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

export function parseProductAssetKey(assetKey: string): { tenantKey: string; categorySlug: string; productId: number } | null {
  const parts = String(assetKey || "").split("/").filter(Boolean);
  if (parts.length < 4) return null;
  const tenantKey = parts[0] || "";
  const categorySlug = parts[1] || "";
  const productId = parseInt(parts[2] || "", 10);
  if (!tenantKey || !categorySlug || !Number.isFinite(productId) || productId <= 0) return null;
  return { tenantKey, categorySlug, productId };
}

export function buildAnglePreset(preset: "gold" | "jewelry" | "produce" | "generic", count = 8): ProductImageSlotDescriptor[] {
  const base: Array<{ role: ProductImageRole; label: string; slotKey: string; angle?: string }> =
    preset === "jewelry"
      ? [
          { role: "primary", label: "Front", slotKey: "primary", angle: "front" },
          { role: "angle", label: "3/4", slotKey: "angle_three_quarter", angle: "three-quarter" },
          { role: "angle", label: "Side", slotKey: "angle_side", angle: "side" },
          { role: "detail", label: "Close-up", slotKey: "detail_close_up", angle: "close-up" },
          { role: "lifestyle", label: "On-body", slotKey: "lifestyle_on_body", angle: "on-body" },
          { role: "lifestyle", label: "Lifestyle", slotKey: "lifestyle_neutral", angle: "lifestyle" },
          { role: "detail", label: "Texture", slotKey: "detail_texture", angle: "macro detail" },
          { role: "angle", label: "Back", slotKey: "angle_back", angle: "back" },
        ]
      : preset === "produce"
        ? [
            { role: "primary", label: "Front", slotKey: "primary", angle: "front" },
            { role: "angle", label: "Top", slotKey: "angle_top", angle: "top-down" },
            { role: "detail", label: "Close-up", slotKey: "detail_close_up", angle: "close-up" },
            { role: "lifestyle", label: "In-hand", slotKey: "lifestyle_in_hand", angle: "in-hand" },
            { role: "lifestyle", label: "Kitchen", slotKey: "lifestyle_kitchen", angle: "kitchen counter" },
            { role: "detail", label: "Packaging", slotKey: "detail_packaging", angle: "packaging" },
          ]
        : preset === "gold"
          ? [
              { role: "primary", label: "Front", slotKey: "primary", angle: "front" },
              { role: "angle", label: "3/4", slotKey: "angle_three_quarter", angle: "three-quarter" },
              { role: "angle", label: "Side", slotKey: "angle_side", angle: "side" },
              { role: "detail", label: "Close-up", slotKey: "detail_close_up", angle: "close-up" },
              { role: "detail", label: "Packaging", slotKey: "detail_packaging", angle: "tamper-evident sealed bag" },
              { role: "detail", label: "Scale", slotKey: "detail_scale", angle: "calibrated scale context" },
              { role: "lifestyle", label: "Desk", slotKey: "lifestyle_desk", angle: "institutional desk context" },
              { role: "angle", label: "Overhead", slotKey: "angle_overhead", angle: "top-down overhead" },
            ]
          : [
              { role: "primary", label: "Front", slotKey: "primary", angle: "front" },
              { role: "angle", label: "3/4", slotKey: "angle_three_quarter", angle: "three-quarter" },
              { role: "detail", label: "Close-up", slotKey: "detail_close_up", angle: "close-up" },
              { role: "lifestyle", label: "Lifestyle", slotKey: "lifestyle_neutral", angle: "lifestyle" },
              { role: "angle", label: "Top", slotKey: "angle_top", angle: "top-down" },
              { role: "angle", label: "Side", slotKey: "angle_side", angle: "side" },
            ];

  return base.slice(0, Math.max(1, Math.min(count, base.length))).map((d, idx) => ({ ...d, position: idx }));
}

export async function ensureProductSlots(input: {
  tenantId: number;
  tenantKey: string;
  productId: number;
  categorySlug: string;
  desired?: ProductImageSlotDescriptor[];
}) {
  const desired = input.desired;

  const existing = await db
    .select()
    .from(productImages)
    .where(and(eq(productImages.tenantId, input.tenantId), eq(productImages.productId, input.productId), isNull(productImages.deletedAt)))
    .orderBy(asc(productImages.position));

  const primaryAssetKey = getProductPrimaryAssetKey({
    tenantKey: input.tenantKey,
    categorySlug: input.categorySlug,
    productId: input.productId,
  });

  const byAssetKey = new Map(existing.map((row) => [row.assetKey, row]));

  const ensureOne = async (slot: ProductImageSlotDescriptor) => {
    const assetKey = slot.slotKey === "primary" ? primaryAssetKey : `${input.tenantKey}/${input.categorySlug}/${input.productId}/${slugify(slot.slotKey)}`;
    const found = byAssetKey.get(assetKey);
    if (found) return found;

    const [created] = await db
      .insert(productImages)
      .values({
        tenantId: input.tenantId,
        productId: input.productId,
        role: slot.role,
        position: slot.position,
        label: slot.label,
        assetNamespace: "products",
        assetKey,
        metadata: slot.angle ? { angle: slot.angle } : {},
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    byAssetKey.set(assetKey, created);
    return created;
  };

  if (!desired || desired.length === 0) {
    if (existing.length) return { primaryAssetKey, slots: existing };
    const [created] = await db
      .insert(productImages)
      .values({
        tenantId: input.tenantId,
        productId: input.productId,
        role: "primary",
        position: 0,
        label: "Primary",
        assetNamespace: "products",
        assetKey: primaryAssetKey,
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    return { primaryAssetKey, slots: [created] };
  }

  const createdSlots = await Promise.all(desired.map((slot) => ensureOne(slot)));

  for (const slot of desired) {
    const assetKey = slot.slotKey === "primary" ? primaryAssetKey : `${input.tenantKey}/${input.categorySlug}/${input.productId}/${slugify(slot.slotKey)}`;
    await db
      .update(productImages)
      .set({ position: slot.position, role: slot.role, label: slot.label, updatedAt: new Date() })
      .where(and(eq(productImages.tenantId, input.tenantId), eq(productImages.productId, input.productId), eq(productImages.assetKey, assetKey)));
  }

  const refreshed = await db
    .select()
    .from(productImages)
    .where(and(eq(productImages.tenantId, input.tenantId), eq(productImages.productId, input.productId), isNull(productImages.deletedAt)))
    .orderBy(asc(productImages.position));

  return { primaryAssetKey, slots: refreshed.length ? refreshed : createdSlots };
}

export async function resolveSlotActives(input: { slots: Array<{ assetNamespace: string; assetKey: string }> }) {
  const keys = input.slots.map((s) => s.assetKey);
  const assets = keys.length
    ? await db
        .select()
        .from(imageAssets)
        .where(and(eq(imageAssets.namespace, "products"), eq(imageAssets.variant, "default"), inArray(imageAssets.assetKey, keys)))
    : [];

  const assetsByKey = new Map(assets.map((a) => [a.assetKey, a]));
  const activeIds = assets.map((a) => a.activeImageId).filter(Boolean) as string[];

  const images = activeIds.length
    ? await db
        .select({ id: generatedImages.id, storedUrl: generatedImages.storedUrl })
        .from(generatedImages)
        .where(inArray(generatedImages.id, activeIds))
    : [];

  const imagesById = new Map(images.map((img) => [img.id, img]));

  const resolved = new Map<string, { url: string | null; updatedAt: number | null; activeImageId: string | null }>();
  for (const key of keys) {
    const asset = assetsByKey.get(key);
    const activeImageId = asset?.activeImageId ?? null;
    const updatedAt = asset?.updatedAt ? asset.updatedAt.getTime() : null;
    const storedUrl = activeImageId ? imagesById.get(activeImageId)?.storedUrl ?? null : null;
    resolved.set(key, { url: storedUrl ? (updatedAt ? `${storedUrl}?v=${encodeURIComponent(String(updatedAt))}` : storedUrl) : null, updatedAt, activeImageId });
  }

  return resolved;
}

export async function syncProductImagesArray(input: { tenantId: number; tenantKey: string; productId: number; categorySlug: string }) {
  const { slots, primaryAssetKey } = await ensureProductSlots({
    tenantId: input.tenantId,
    tenantKey: input.tenantKey,
    productId: input.productId,
    categorySlug: input.categorySlug,
  });

  const resolved = await resolveSlotActives({
    slots: slots.map((s) => ({ assetNamespace: String(s.assetNamespace), assetKey: String(s.assetKey) })),
  });

  const orderedUrls = slots
    .map((slot) => resolved.get(String(slot.assetKey))?.url ?? null)
    .filter((u): u is string => typeof u === "string" && !!u);

  const [existing] = await db
    .select({ attributes: sellerProducts.attributes })
    .from(sellerProducts)
    .where(and(eq(sellerProducts.tenantId, input.tenantId), eq(sellerProducts.id, input.productId)));

  const baseAttrs =
    existing?.attributes && typeof existing.attributes === "object" && !Array.isArray(existing.attributes)
      ? (existing.attributes as any)
      : {};

  const nextAttrs = {
    ...baseAttrs,
    primaryImageAsset: { namespace: "products", assetKey: primaryAssetKey },
    imageSlots: slots.map((slot) => ({
      id: slot.id,
      role: slot.role,
      position: slot.position,
      label: slot.label,
      assetKey: slot.assetKey,
    })),
  };

  await db
    .update(sellerProducts)
    .set({ images: orderedUrls, attributes: nextAttrs, updatedAt: new Date() })
    .where(and(eq(sellerProducts.tenantId, input.tenantId), eq(sellerProducts.id, input.productId)));

  return { primaryAssetKey, images: orderedUrls };
}

export async function trySyncFromAssetKey(input: { currentTenantKey: string; namespace: string; assetKey: string }) {
  if (input.namespace !== "products") return false;
  const parsed = parseProductAssetKey(input.assetKey);
  if (!parsed) return false;
  if (parsed.tenantKey !== input.currentTenantKey) return false;

  const tenant = await db.query.tenants.findFirst({ where: eq(tenants.key, parsed.tenantKey) });
  if (!tenant) return false;

  const [product] = await db
    .select({ id: sellerProducts.id, categoryId: sellerProducts.categoryId })
    .from(sellerProducts)
    .where(and(eq(sellerProducts.tenantId, tenant.id), eq(sellerProducts.id, parsed.productId)));
  if (!product) return false;

  const category =
    product.categoryId != null
      ? await db.query.productCategories.findFirst({
          where: and(eq(productCategories.tenantId, tenant.id), eq(productCategories.id, Number(product.categoryId))),
        })
      : null;

  await syncProductImagesArray({
    tenantId: tenant.id,
    tenantKey: tenant.key,
    productId: parsed.productId,
    categorySlug: category?.slug || parsed.categorySlug || "general",
  });

  return true;
}
