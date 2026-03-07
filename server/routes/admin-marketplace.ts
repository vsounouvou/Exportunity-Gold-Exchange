import { Router } from "express";
import { db } from "@db";
import { and, asc, desc, eq, gte, ilike, inArray, lte, or } from "drizzle-orm";
import { ensureTenantAdmin } from "./utils/auth";
import { generatedImages, imageAssets, mapMarkerStyles, marketplaceOrders, payments, productCategories, sellerProducts, sellers, stampedGoldSkus, tenants } from "@db/schema";
import { buildProductPrompt, getProductPrimaryAssetKey } from "../lib/imageGen/productPrompt";
import { generateAndStoreImage, upsertAsset } from "../lib/imageGen/service";
import { ensureProductSlots, syncProductImagesArray } from "../lib/imageGen/productImages";
import { generateAgentResponse } from "../lib/ai-provider";
import { isAiEnabled } from "../lib/ai-consent";
import { getFlutterwaveKeys } from "../lib/flutterwave/config";
import { flutterwaveVerifyTransaction } from "../lib/flutterwave/service";
import { LEGACY_DEFAULT_MAP_MARKER_STYLE_KEYS, normalizeMarkerStyleKey, upsertDefaultMapMarkerStyles } from "../lib/marketplace/mapMarkers";
import { reverseTopupCredit } from "../lib/wallet/topups";
import type { TenantKey } from "../lib/tenants";
import { normalizeTenantKey } from "../../tenants/registry";

const router = Router();

router.use(ensureTenantAdmin);

function getRequestOrigin(req: any): string | null {
  const forwardedProto = String(req.headers?.["x-forwarded-proto"] || "")
    .split(",")[0]
    ?.trim();
  const forwardedHost = String(req.headers?.["x-forwarded-host"] || "")
    .split(",")[0]
    ?.trim();

  const proto = forwardedProto || req.protocol;
  const host = forwardedHost || req.get?.("host");
  if (!proto || !host) return null;
  return `${proto}://${host}`;
}

function toPublicUrl(req: any, url: string | null | undefined): string | null {
  if (!url) return null;
  const raw = String(url);
  if (/^https?:\/\//i.test(raw)) return raw;
  if (!raw.startsWith("/")) return raw;
  const origin = getRequestOrigin(req);
  return origin ? `${origin}${raw}` : raw;
}

function absolutizeImageArray(req: any, images: unknown) {
  if (!Array.isArray(images)) return images;
  return images.map((x) => {
    if (typeof x !== "string") return x;
    return toPublicUrl(req, x) ?? x;
  });
}

function toInt(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return null;
  return Math.trunc(parsed);
}

function parseDate(value: unknown): Date | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const dt = new Date(raw);
  return Number.isFinite(dt.getTime()) ? dt : null;
}

function pickFirstImage(images: unknown): string | null {
  if (!Array.isArray(images)) return null;
  const first = images.find((x) => typeof x === "string" && x.trim());
  return typeof first === "string" ? first : null;
}

function cleanModelText(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  return raw.replace(/^["'`]+/, "").replace(/["'`]+$/, "").trim();
}

function normalizePaymentStatusFilter(value: unknown): any | null {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return null;
  if (raw === "paid" || raw === "succeeded" || raw === "success") return "succeeded";
  if (raw === "failed" || raw === "fail") return "failed";
  if (raw === "cancelled" || raw === "canceled" || raw === "cancel") return "cancelled";
  if (raw === "refunded" || raw === "refund") return "refunded";
  if (raw === "processing" || raw === "process") return "processing";
  if (raw === "pending") return "pending";
  return null;
}

function normalizePaymentProviderFilter(value: unknown): string | null {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw || raw === "all") return null;
  if (raw === "kkiapay" || raw === "flutterwave") return raw;
  return null;
}

function normalizePaymentPurposeFilter(value: unknown): string | null {
  const raw = String(value ?? "").trim().toUpperCase();
  if (!raw || raw === "ALL") return null;
  if (raw === "WALLET_TOPUP") return "WALLET_TOPUP";
  if (raw === "ORDER_PAYMENT") return "ORDER_PAYMENT";
  return null;
}

function normalizeMarkerIconType(value: unknown): "lucide" | "emoji" | "svg" | "image_url" {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase();
  if (raw === "image") return "image_url";
  if (raw === "lucide" || raw === "emoji" || raw === "svg" || raw === "image_url") return raw;
  return "emoji";
}

function normalizeHexColor(value: unknown): string {
  const raw = String(value ?? "")
    .trim()
    .toUpperCase();
  if (/^#[0-9A-F]{6}$/.test(raw)) return raw;
  return "#111827";
}

function buildDefaultCategoryIconPrompt(categoryName: unknown, categorySlug?: unknown): string {
  const name = String(categoryName ?? "").trim() || "Marketplace";
  const slug = String(categorySlug ?? "").trim();
  const descriptor = slug ? `${name} (${slug})` : name;
  return `Professional marketplace map icon for ${descriptor} category, minimal vector pictogram, high contrast, transparent background, centered, no text, 1:1`;
}

async function resolveTenantScope(req: any): Promise<{ tenantId: number; tenantKey: string }> {
  const requestedKey = String(req.query.tenantKey || "").trim();
  if (requestedKey) {
    const adminUser = (req as any)?.adminUser;
    const roles = Array.isArray(adminUser?.roles) ? adminUser.roles : [];
    const currentMode = String(adminUser?.currentMode || "").trim().toLowerCase();
    const canCrossTenant =
      currentMode === "admin" &&
      roles.some((role: any) => {
        const normalized = String(role || "")
          .trim()
          .toLowerCase()
          .replace(/[_-]+/g, " ");
        return normalized.includes("super admin") || normalized.includes("platform admin");
      });
    if (canCrossTenant) {
      const row = await db.query.tenants.findFirst({ where: eq(tenants.key, requestedKey) });
      if (row) return { tenantId: row.id, tenantKey: row.key };
    }
  }
  const tenant = req.tenant;
  return { tenantId: tenant.id, tenantKey: tenant.key };
}

function rejectTenantOverride(req: any, res: any): boolean {
  const requestedKey = String(req.query?.tenantKey || "").trim();
  if (!requestedKey) return false;
  res.status(403).json({ message: "Cross-tenant override is not allowed on this endpoint." });
  return true;
}

function buildFallbackSuggestion(input: {
  field: string;
  tenantKey: string;
  product: any;
  category: any | null;
  seller: any | null;
}) {
  const categoryName = String(input.category?.name || "").trim();
  const categorySlug = String(input.category?.slug || "").trim();
  const shopName = String(input.seller?.shopName || "").trim();
  const name = String(input.product?.name || "").trim();
  const shortDescription = String(input.product?.shortDescription || "").trim();
  const description = String(input.product?.description || "").trim();
  const tags = Array.isArray(input.product?.tags) ? input.product.tags : [];

  if (input.field === "name") return name || (categoryName ? `${categoryName} (Draft)` : "Product (Draft)");
  if (input.field === "shortDescription") {
    return shortDescription || [name || categoryName || "Premium product", shopName ? `from ${shopName}` : null].filter(Boolean).join(" — ");
  }
  if (input.field === "description") {
    return (
      description ||
      [
        name || categoryName || "Premium product",
        categoryName || categorySlug ? `Category: ${categoryName || categorySlug}` : null,
        shopName ? `Seller: ${shopName}` : null,
      ]
        .filter(Boolean)
        .join("\n")
    );
  }
  if (input.field === "tags") {
    if (tags.length) return tags.join(", ");
    return [categorySlug, categoryName ? categoryName.toLowerCase().replace(/\s+/g, "-") : null, "premium", input.tenantKey]
      .filter(Boolean)
      .join(", ");
  }
  return "";
}

router.get("/payments", async (req, res) => {
  try {
    const { tenantId } = await resolveTenantScope(req);
    const limit = Math.min(200, Math.max(1, toInt(req.query.limit) ?? 50));
    const offset = Math.max(0, toInt(req.query.offset) ?? 0);
    const status = normalizePaymentStatusFilter(req.query.status);
    const provider = normalizePaymentProviderFilter(req.query.provider);
    const purpose = normalizePaymentPurposeFilter(req.query.type || req.query.purpose);
    const conditions: any[] = [eq(payments.tenantId, tenantId)];
    if (provider) conditions.push(eq(payments.provider, provider));
    if (purpose) conditions.push(eq(payments.purpose, purpose));
    if (status) conditions.push(eq(payments.status, status));

    const rows = await db
      .select({
        payment: payments,
        order: {
          id: marketplaceOrders.id,
          orderNumber: marketplaceOrders.orderNumber,
          status: marketplaceOrders.status,
          total: marketplaceOrders.total,
          createdAt: marketplaceOrders.createdAt,
        },
      })
      .from(payments)
      .leftJoin(marketplaceOrders, eq(payments.orderId, marketplaceOrders.id))
      .where(and(...conditions))
      .orderBy(desc(payments.createdAt))
      .limit(limit)
      .offset(offset);

    res.json({
      payments: rows.map((row) => ({
        ...row.payment,
        order: row.order?.id ? row.order : null,
      })),
    });
  } catch (error: any) {
    console.error("[Admin Marketplace] payments list error:", error);
    res.status(500).json({ message: "Failed to load payments", error: error.message });
  }
});

router.get("/payments/:paymentId", async (req, res) => {
  try {
    const { tenantId } = await resolveTenantScope(req);
    const paymentId = String(req.params.paymentId || "").trim();
    if (!paymentId) return res.status(400).json({ message: "paymentId is required" });

    const rows = await db
      .select({
        payment: payments,
        order: marketplaceOrders,
      })
      .from(payments)
      .leftJoin(marketplaceOrders, eq(payments.orderId, marketplaceOrders.id))
      .where(and(eq(payments.tenantId, tenantId), eq(payments.id, paymentId as any)))
      .limit(1);

    if (!rows.length) return res.status(404).json({ message: "Payment not found" });

    res.json({
      payment: rows[0].payment,
      order: rows[0].order?.id ? rows[0].order : null,
    });
  } catch (error: any) {
    console.error("[Admin Marketplace] payment detail error:", error);
    res.status(500).json({ message: "Failed to load payment", error: error.message });
  }
});

router.post("/payments/:paymentId/recheck", async (req, res) => {
  try {
    const { tenantId, tenantKey } = await resolveTenantScope(req);
    const paymentId = String(req.params.paymentId || "").trim();
    if (!paymentId) return res.status(400).json({ message: "paymentId is required" });

    const row = await db.query.payments.findFirst({
      where: and(eq(payments.tenantId, tenantId), eq(payments.id, paymentId as any)),
    });
    if (!row) return res.status(404).json({ message: "Payment not found" });

    if (String(row.provider || "").toLowerCase() === "flutterwave") {
      const keys = getFlutterwaveKeys((normalizeTenantKey(tenantKey) || "exportunity") as TenantKey);
      if (!keys.configured) {
        return res.status(503).json({ message: "Flutterwave is not configured for this tenant" });
      }

      const verified = await flutterwaveVerifyTransaction({
        mode: keys.mode,
        secretKey: keys.secretKey,
        transactionId: row.providerTransactionId,
        txRef: (row as any).providerTransactionRef,
      });

      const expectedAmount = Number(row.amount || 0);
      const amountOk = verified.amount === null || Number(verified.amount) === expectedAmount;
      const expectedCurrency = String(row.currency || "XOF").toUpperCase();
      const currencyOk = !verified.currency || String(verified.currency).toUpperCase() === expectedCurrency;
      const normalized = verified.normalizedStatus;
      const nextStatus =
        normalized === "succeeded"
          ? "succeeded"
          : normalized === "failed"
            ? "failed"
            : normalized === "cancelled"
              ? "cancelled"
              : normalized === "processing"
                ? "processing"
                : "pending";

      await db
        .update(payments)
        .set({
          status: amountOk && currencyOk ? (nextStatus as any) : "failed",
          providerTransactionId: verified.transactionId || row.providerTransactionId || null,
          providerTransactionRef: verified.txRef || (row as any).providerTransactionRef || null,
          providerPayload: verified.raw ?? row.providerPayload ?? null,
          metadata: {
            ...(typeof (row as any).metadata === "object" && (row as any).metadata ? (row as any).metadata : {}),
            reason: !amountOk ? "amount_mismatch" : !currencyOk ? "currency_mismatch" : undefined,
            recheckedAt: new Date().toISOString(),
          },
          updatedAt: new Date(),
        } as any)
        .where(and(eq(payments.tenantId, tenantId), eq(payments.id, row.id)));

      if (String((row as any).purpose || "").toUpperCase() === "ORDER_PAYMENT" && amountOk && currencyOk && nextStatus === "succeeded" && row.orderId) {
        await db
          .update(marketplaceOrders)
          .set({
            status: "confirmed",
            paidAt: new Date(),
            updatedAt: new Date(),
          })
          .where(and(eq(marketplaceOrders.id, row.orderId), eq(marketplaceOrders.tenantId, tenantId)));
      }
    }

    res.setHeader("Cache-Control", "no-store");
    const latest = await db.query.payments.findFirst({
      where: and(eq(payments.tenantId, tenantId), eq(payments.id, paymentId as any)),
    });
    res.json({ payment: latest ?? row });
  } catch (error: any) {
    console.error("[Admin Marketplace] payment recheck error:", error);
    res.status(500).json({ message: "Failed to recheck payment", error: error.message });
  }
});

router.post("/payments/:paymentId/refund", async (req, res) => {
  try {
    const { tenantId } = await resolveTenantScope(req);
    const paymentId = String(req.params.paymentId || "").trim();
    if (!paymentId) return res.status(400).json({ message: "paymentId is required" });

    const row = await db.query.payments.findFirst({
      where: and(eq(payments.tenantId, tenantId), eq(payments.id, paymentId as any)),
    });
    if (!row) return res.status(404).json({ message: "Payment not found" });

    const purpose = String((row as any).purpose || "").trim().toUpperCase();
    const reason = String(req.body?.reason || "manual_refund").trim() || "manual_refund";
    const adminUserId = (req as any)?.adminUser?.id != null ? String((req as any).adminUser.id) : null;

    const metadataBase =
      typeof (row as any).metadata === "object" && (row as any).metadata ? { ...(row as any).metadata } : {};

    // Idempotent path: if already refunded, just return the latest row.
    if (String((row as any).status || "").toLowerCase() === "refunded") {
      return res.json({ ok: true, payment: row, alreadyRefunded: true });
    }

    let refundLedgerEntryId: string | null = null;

    if (purpose === "WALLET_TOPUP") {
      const topupId = String((row as any).targetId || "").trim();
      if (!topupId) return res.status(400).json({ message: "Topup target is missing for WALLET_TOPUP payment" });

      const out = await reverseTopupCredit({
        topupId,
        reason,
        actorUserId: adminUserId,
        providerPayload: { source: "admin_manual_refund", paymentId: row.id },
      });
      refundLedgerEntryId = String((out as any)?.entry?.id || "") || null;
    }

    await db
      .update(payments)
      .set({
        status: "refunded",
        metadata: {
          ...metadataBase,
          refund: {
            reason,
            actorUserId: adminUserId,
            at: new Date().toISOString(),
            refundLedgerEntryId,
          },
        },
        updatedAt: new Date(),
      } as any)
      .where(and(eq(payments.tenantId, tenantId), eq(payments.id, row.id)));

    const latest = await db.query.payments.findFirst({
      where: and(eq(payments.tenantId, tenantId), eq(payments.id, row.id)),
    });

    return res.json({
      ok: true,
      payment: latest ?? row,
      refundLedgerEntryId,
    });
  } catch (error: any) {
    console.error("[Admin Marketplace] payment refund error:", error);
    return res.status(500).json({ message: "Failed to mark payment refunded", error: error.message });
  }
});

router.get("/products", async (req, res) => {
  try {
    const { tenantId, tenantKey } = await resolveTenantScope(req);

    const q = String(req.query.q || "").trim();
    const categoryId = toInt(req.query.categoryId);
    const sellerId = toInt(req.query.sellerId);
    const hasImage = String(req.query.hasImage || "").trim();
    const status = String(req.query.status || "").trim();
    const from = parseDate(req.query.from);
    const to = parseDate(req.query.to);

    const limit = Math.min(Math.max(toInt(req.query.limit) ?? 50, 1), 200);
    const offset = Math.max(toInt(req.query.offset) ?? 0, 0);

    const conditions: any[] = [eq(sellerProducts.tenantId, tenantId)];
    if (q) {
      conditions.push(
        or(
          ilike(sellerProducts.name, `%${q}%`),
          ilike(sellerProducts.description, `%${q}%`),
          ilike(sellerProducts.slug, `%${q}%`),
        ),
      );
    }
    if (categoryId != null) conditions.push(eq(sellerProducts.categoryId, categoryId));
    if (sellerId != null) conditions.push(eq(sellerProducts.sellerId, sellerId));
    if (status) conditions.push(eq(sellerProducts.status, status as any));
    if (from) conditions.push(gte(sellerProducts.createdAt, from));
    if (to) conditions.push(lte(sellerProducts.createdAt, to));

    const rows = await db
      .select({
        product: sellerProducts,
        seller: sellers,
        category: productCategories,
      })
      .from(sellerProducts)
      .leftJoin(sellers, eq(sellerProducts.sellerId, sellers.id))
      .leftJoin(productCategories, eq(sellerProducts.categoryId, productCategories.id))
      .where(and(...conditions))
      .orderBy(desc(sellerProducts.createdAt))
      .limit(limit)
      .offset(offset);

    const derived = rows.map((row) => {
      const categorySlug = row.category?.slug || "general";
      const assetKey = getProductPrimaryAssetKey({ tenantKey, categorySlug, productId: row.product.id });
      return {
        ...row,
        imageAsset: { namespace: "products", assetKey },
      };
    });

    const missingImageAssets = derived
      .filter((row) => !pickFirstImage(row.product.images))
      .map((row) => row.imageAsset.assetKey);

    const uniqueMissing = Array.from(new Set(missingImageAssets));
    const resolvedByAssetKey = new Map<string, { url: string | null; updatedAt: number | null }>();

    if (uniqueMissing.length) {
      const assets = await db
        .select()
        .from(imageAssets)
        .where(and(eq(imageAssets.namespace, "products"), inArray(imageAssets.assetKey, uniqueMissing)));

      const activeIds = assets.map((a) => a.activeImageId).filter(Boolean) as string[];
      const imagesById = new Map<string, { storedUrl: string | null }>();
      if (activeIds.length) {
        const imgs = await db
          .select({ id: generatedImages.id, storedUrl: generatedImages.storedUrl })
          .from(generatedImages)
          .where(inArray(generatedImages.id, activeIds));
        for (const img of imgs) imagesById.set(img.id, { storedUrl: img.storedUrl ?? null });
      }

      for (const asset of assets) {
        const img = asset.activeImageId ? imagesById.get(asset.activeImageId) : null;
        resolvedByAssetKey.set(asset.assetKey, {
          url: img?.storedUrl ?? null,
          updatedAt: asset.updatedAt ? asset.updatedAt.getTime() : null,
        });
      }
    }

    const items = derived
      .map((row) => {
        const normalizedImagesRaw = absolutizeImageArray(req, row.product.images);
        const normalizedImages = Array.isArray(normalizedImagesRaw) ? (normalizedImagesRaw as any) : [];
        const hasAnyImage = !!pickFirstImage(normalizedImages);
        const fallback = resolvedByAssetKey.get(row.imageAsset.assetKey) || null;
        const fallbackUrl = fallback?.url
          ? fallback.updatedAt
            ? `${fallback.url}?v=${encodeURIComponent(String(fallback.updatedAt))}`
            : fallback.url
          : null;
        const resolvedFallbackUrl = fallbackUrl ? (toPublicUrl(req, fallbackUrl) ?? fallbackUrl) : null;

        const nextProduct = {
          ...row.product,
          images: hasAnyImage ? normalizedImages : resolvedFallbackUrl ? [resolvedFallbackUrl] : normalizedImages,
        };

        return {
          product: nextProduct,
          seller: row.seller,
          category: row.category,
          imageAsset: row.imageAsset,
        };
      })
      .filter((row) => {
        if (hasImage === "true") return !!pickFirstImage(row.product.images);
        if (hasImage === "false") return !pickFirstImage(row.product.images);
        return true;
      });

    res.json({ tenantKey, tenantId, items, limit, offset });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to load products" });
  }
});

router.get("/products/:id", async (req, res) => {
  try {
    const { tenantId, tenantKey } = await resolveTenantScope(req);
    const productId = toInt(req.params.id);
    if (!productId) return res.status(400).json({ message: "Invalid product id" });

    const rows = await db
      .select({
        product: sellerProducts,
        seller: sellers,
        category: productCategories,
      })
      .from(sellerProducts)
      .leftJoin(sellers, eq(sellerProducts.sellerId, sellers.id))
      .leftJoin(productCategories, eq(sellerProducts.categoryId, productCategories.id))
      .where(and(eq(sellerProducts.tenantId, tenantId), eq(sellerProducts.id, productId)))
      .limit(1);

    if (!rows.length) return res.status(404).json({ message: "Product not found" });

    const row = rows[0];
    const categorySlug = row.category?.slug || "general";
    const assetKey = getProductPrimaryAssetKey({ tenantKey, categorySlug, productId: row.product.id });

    const normalizedImagesRaw = absolutizeImageArray(req, row.product.images);
    const normalizedImages = Array.isArray(normalizedImagesRaw) ? (normalizedImagesRaw as any) : [];
    const hasAnyImage = !!pickFirstImage(normalizedImages);

    let fallbackUrl: string | null = null;
    if (!hasAnyImage) {
      const assets = await db
        .select()
        .from(imageAssets)
        .where(and(eq(imageAssets.namespace, "products"), eq(imageAssets.assetKey, assetKey)))
        .limit(1);

      const asset = assets[0] || null;
      if (asset?.activeImageId) {
        const imgs = await db
          .select({ id: generatedImages.id, storedUrl: generatedImages.storedUrl })
          .from(generatedImages)
          .where(eq(generatedImages.id, asset.activeImageId))
          .limit(1);
        const storedUrl = imgs[0]?.storedUrl ?? null;
        if (storedUrl) {
          const withVersion = asset.updatedAt ? `${storedUrl}?v=${encodeURIComponent(String(asset.updatedAt.getTime()))}` : storedUrl;
          fallbackUrl = toPublicUrl(req, withVersion) ?? withVersion;
        }
      }
    }

    const nextProduct = {
      ...row.product,
      images: hasAnyImage ? normalizedImages : fallbackUrl ? [fallbackUrl] : normalizedImages,
    };

    res.json({
      item: {
        product: nextProduct,
        seller: row.seller,
        category: row.category,
        imageAsset: { namespace: "products", assetKey },
      },
    });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to load product" });
  }
});

router.post("/products/:id/regenerate-primary-image", async (req: any, res) => {
  try {
    const { tenantId, tenantKey } = await resolveTenantScope(req);
    const productId = toInt(req.params.id);
    if (!productId) return res.status(400).json({ message: "Invalid product id" });

    const [product] = await db
      .select()
      .from(sellerProducts)
      .where(and(eq(sellerProducts.id, productId), eq(sellerProducts.tenantId, tenantId)));
    if (!product) return res.status(404).json({ message: "Product not found" });

    const category =
      product.categoryId != null
        ? await db.query.productCategories.findFirst({
            where: and(eq(productCategories.id, Number(product.categoryId)), eq(productCategories.tenantId, tenantId)),
          })
        : null;

    const { prompt, negativePrompt, aspect, modelTier } = buildProductPrompt({
      tenantKey,
      product,
      category,
    });

    const categorySlug = category?.slug || "general";
    const { primaryAssetKey } = await ensureProductSlots({
      tenantId,
      tenantKey,
      productId: product.id,
      categorySlug,
    });

    const admin = req.adminUser;
    const generated = await generateAndStoreImage({
      namespace: "products",
      assetKey: primaryAssetKey,
      prompt,
      negativePrompt,
      mode: modelTier,
      input: { aspect_ratio: aspect, output_format: "png" },
      setActive: true,
      createdBy: admin?.id ? `admin:${admin.id}` : undefined,
    });

    await syncProductImagesArray({ tenantId, tenantKey, productId: product.id, categorySlug });

    res.json({ ok: true, assetKey: primaryAssetKey, image: generated });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Regenerate failed" });
  }
});

router.patch("/products/:id", async (req: any, res) => {
  try {
    const { tenantId } = await resolveTenantScope(req);
    const productId = toInt(req.params.id);
    if (!productId) return res.status(400).json({ message: "Invalid product id" });

    const next = { ...(req.body || {}), updatedAt: new Date() };
    delete (next as any).id;
    delete (next as any).tenantId;

    const existing = await db.query.sellerProducts.findFirst({
      where: and(eq(sellerProducts.id, productId), eq(sellerProducts.tenantId, tenantId)),
    });
    if (!existing) return res.status(404).json({ message: "Product not found" });

    const merged = { ...existing, ...next };
    const mergedCategoryId = merged.categoryId != null ? Number(merged.categoryId) : null;
    const mergedCategory =
      mergedCategoryId != null
        ? await db.query.productCategories.findFirst({
            where: and(eq(productCategories.id, mergedCategoryId), eq(productCategories.tenantId, tenantId)),
            columns: { slug: true, name: true },
          })
        : null;

    const nextStatus = typeof (merged as any).status === "string" ? String((merged as any).status) : "";
    const isStamped = String(mergedCategory?.slug || "") === "stamped";

    if (nextStatus === "active" && isStamped) {
      const sku = await db.query.stampedGoldSkus.findFirst({
        where: and(eq(stampedGoldSkus.tenantId, tenantId), eq(stampedGoldSkus.productId, productId)),
      });

      const missing: string[] = [];
      if (!sku) missing.push("stamped_gold_sku");
      else {
        const type = String((sku as any).stampedType || "").toUpperCase();
        const weightGrams = Number((sku as any).weightGrams || 0);
        const purity = String((sku as any).purity || "").trim();
        const metal = String((sku as any).metal || "").trim();
        const brandText = String((sku as any).brandText || "").trim();
        const serialPrefix = String((sku as any).serialPrefix || "").trim();
        const hallmarkText = String((sku as any).hallmarkText || "").trim();

        if (type !== "COIN" && type !== "BAR") missing.push("stamped_type");
        if (!Number.isFinite(weightGrams) || weightGrams <= 0) missing.push("weight_grams");
        if (!purity) missing.push("purity");
        if (!metal) missing.push("metal");
        if (!brandText) missing.push("brand_text");
        if (!serialPrefix) missing.push("serial_prefix");
        if (!hallmarkText) missing.push("hallmark_text");

        const coinWeights = new Set([1, 2, 5, 10, 20, 31]);
        const barWeights = new Set([5, 10, 20, 50, 100, 250, 500, 1000]);
        if (type === "COIN" && weightGrams && !coinWeights.has(weightGrams)) missing.push("coin_weight_invalid");
        if (type === "BAR" && weightGrams && !barWeights.has(weightGrams)) missing.push("bar_weight_invalid");
      }

      if (missing.length) {
        return res.status(400).json({
          message: "Stamped Gold products require legal stamp fields before publishing.",
          missing,
        });
      }
    }

    const [updated] = await db
      .update(sellerProducts)
      .set(next)
      .where(and(eq(sellerProducts.id, productId), eq(sellerProducts.tenantId, tenantId)))
      .returning();

    if (!updated) return res.status(404).json({ message: "Product not found" });
    res.json({ ok: true, product: updated });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Update failed" });
  }
});

router.post("/products/:id/suggest", async (req: any, res) => {
  const field = String(req.body?.field || "").trim();
  const allowed = new Set(["name", "shortDescription", "description", "tags"]);
  if (!allowed.has(field)) return res.status(400).json({ message: "Invalid field" });

  const draft = req.body?.draft && typeof req.body.draft === "object" && !Array.isArray(req.body.draft) ? req.body.draft : null;

  try {
    const { tenantId, tenantKey } = await resolveTenantScope(req);
    const productId = toInt(req.params.id);
    if (!productId) return res.status(400).json({ message: "Invalid product id" });

    const [product] = await db
      .select()
      .from(sellerProducts)
      .where(and(eq(sellerProducts.id, productId), eq(sellerProducts.tenantId, tenantId)));
    if (!product) return res.status(404).json({ message: "Product not found" });

    const mergedProduct = draft ? { ...product, ...draft } : product;

    const category =
      mergedProduct.categoryId != null
        ? await db.query.productCategories.findFirst({
            where: and(eq(productCategories.id, Number(mergedProduct.categoryId)), eq(productCategories.tenantId, tenantId)),
          })
        : null;
    const seller =
      mergedProduct.sellerId != null
        ? await db.query.sellers.findFirst({
            where: and(eq(sellers.id, Number(mergedProduct.sellerId)), eq(sellers.tenantId, tenantId)),
            columns: { shopName: true, sellerType: true, status: true },
          })
        : null;

    const fallback = buildFallbackSuggestion({ field, tenantKey, product: mergedProduct, category, seller });

    if (!isAiEnabled()) {
      return res.json({ ok: false, value: fallback, reason: "AI_DISABLED" });
    }

    const admin = (req as any).adminUser;
    const requester = admin?.displayName || admin?.email || `admin:${admin?.id ?? "anon"}`;

    const languageHint = String(req.body?.language || "").trim();

    const context = {
      tenantKey,
      requester,
      product: {
        id: mergedProduct.id,
        name: mergedProduct.name,
        slug: mergedProduct.slug,
        price: mergedProduct.price,
        currency: mergedProduct.currency,
        shortDescription: mergedProduct.shortDescription,
        description: mergedProduct.description,
        tags: mergedProduct.tags,
      },
      category: category ? { id: category.id, name: category.name, slug: category.slug } : null,
      seller: seller ? { shopName: seller.shopName, sellerType: seller.sellerType, status: seller.status } : null,
    };

    const message = `You are helping an admin write premium, compliant marketplace product content.

Task:
- Suggest ONLY the value for the field: ${field}
- Output MUST be plain text only (no markdown fences, no JSON, no quotes)
- Keep the language consistent with existing content; if unclear, default to French.
- Do not invent certifications, hallmarks, or provenance claims that are not provided.

Optional language hint: ${languageHint || "none"}

Context (JSON):
${JSON.stringify(context, null, 2)}

Constraints per field:
- name: concise, specific, no emoji
- shortDescription: 1 sentence, max ~160 chars
- description: 2–4 short paragraphs; can include a short bullet list using '-' lines
- tags: comma-separated, 6–12 tags, no '#'
`;

    try {
      const ai = await generateAgentResponse(message, {
        role: "You are a premium marketplace copywriter assisting an admin with product listing content.",
        context: {
          recentMessages: [],
          roomName: "Admin Product Suggestion",
          roomType: "admin-product-suggestion",
        },
      });

      const cleaned = cleanModelText(ai?.response);
      return res.json({ ok: true, value: cleaned || fallback });
    } catch (err: any) {
      return res.json({ ok: false, value: fallback, reason: err?.message || "AI_FAILED" });
    }
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Suggest failed" });
  }
});

router.get("/categories", async (req: any, res) => {
  try {
    if (rejectTenantOverride(req, res)) return;
    const { tenantId } = await resolveTenantScope(req);
    await upsertDefaultMapMarkerStyles(tenantId);
    const rows = await db
      .select()
      .from(productCategories)
      .where(eq(productCategories.tenantId, tenantId))
      .orderBy(asc(productCategories.sortOrder), asc(productCategories.name));
    const styles = await db
      .select()
      .from(mapMarkerStyles)
      .where(and(eq(mapMarkerStyles.tenantId, tenantId), eq(mapMarkerStyles.isActive, true)));
    const styleByKey = new Map(
      styles.map((style: any) => [normalizeMarkerStyleKey(style.key), style]),
    );

    res.json({
      ok: true,
      categories: rows.map((category: any) => {
        const key = normalizeMarkerStyleKey(category?.mapMarkerKey) || "shop_default";
        return {
          ...category,
          mapMarkerKey: key,
          mapMarkerStyle: styleByKey.get(key) || null,
        };
      }),
    });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to load categories" });
  }
});

router.get("/sellers", async (req: any, res) => {
  try {
    const { tenantId } = await resolveTenantScope(req);
    const rows = await db
      .select({ id: sellers.id, shopName: sellers.shopName })
      .from(sellers)
      .where(eq(sellers.tenantId, tenantId))
      .orderBy(asc(sellers.shopName));
    res.json({ ok: true, sellers: rows });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to load sellers" });
  }
});

router.get("/map-icons", async (req: any, res) => {
  try {
    if (rejectTenantOverride(req, res)) return;
    const { tenantId } = await resolveTenantScope(req);
    await upsertDefaultMapMarkerStyles(tenantId);

    const [styles, categories, sellersWithMarkers] = await Promise.all([
      db
        .select()
        .from(mapMarkerStyles)
        .where(eq(mapMarkerStyles.tenantId, tenantId))
        .orderBy(asc(mapMarkerStyles.zIndex), asc(mapMarkerStyles.label)),
      db
        .select()
        .from(productCategories)
        .where(eq(productCategories.tenantId, tenantId))
        .orderBy(asc(productCategories.sortOrder), asc(productCategories.name)),
      db
        .select({ mapMarkerKey: sellers.mapMarkerKey })
        .from(sellers)
        .where(eq(sellers.tenantId, tenantId)),
    ]);

    const usedKeys = new Set<string>(["shop_default"]);
    for (const category of categories as any[]) {
      const key = normalizeMarkerStyleKey((category as any)?.mapMarkerKey);
      if (key) usedKeys.add(key);
    }
    for (const sellerRow of sellersWithMarkers as any[]) {
      const key = normalizeMarkerStyleKey((sellerRow as any)?.mapMarkerKey);
      if (key) usedKeys.add(key);
    }

    const filteredStyles = (styles as any[]).filter((style) => {
      const key = normalizeMarkerStyleKey(style?.key);
      if (!key) return false;
      const isActive = style?.isActive !== false;
      if (!isActive && !usedKeys.has(key)) return false;
      if (usedKeys.has(key)) return true;
      if (style?.iconAssetId || style?.iconPrompt) return true;
      if (!LEGACY_DEFAULT_MAP_MARKER_STYLE_KEYS.has(key)) return true;
      return false;
    });

    res.json({
      ok: true,
      styles: filteredStyles,
      categories,
    });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to load map icon settings" });
  }
});

router.post("/map-icons", async (req: any, res) => {
  try {
    if (rejectTenantOverride(req, res)) return;
    const { tenantId } = await resolveTenantScope(req);
    const key = normalizeMarkerStyleKey(req.body?.key);
    if (!key) return res.status(400).json({ message: "key is required" });

    const label = String(req.body?.label || "").trim() || key;
    const iconType = normalizeMarkerIconType(req.body?.iconType);
    const iconValue = String(req.body?.iconValue || "").trim();
    if (!iconValue) return res.status(400).json({ message: "iconValue is required" });
    const iconPromptRaw = typeof req.body?.iconPrompt === "string" ? req.body.iconPrompt : req.body?.icon_prompt;
    const iconPrompt = typeof iconPromptRaw === "string" ? iconPromptRaw.trim() : "";
    const locked = Boolean(req.body?.locked);
    const color = normalizeHexColor(req.body?.color);
    const size = Math.max(14, Math.min(72, toInt(req.body?.size) ?? 28));
    const zIndex = Math.max(0, Math.min(999, toInt(req.body?.zIndex) ?? 10));
    const isActive = req.body?.isActive !== false;

    const existing = await db.query.mapMarkerStyles.findFirst({
      where: and(eq(mapMarkerStyles.tenantId, tenantId), eq(mapMarkerStyles.key, key)),
    });

    const nextPayload = {
      tenantId,
      key,
      label,
      iconType: iconType as any,
      iconValue,
      iconPrompt: iconPrompt || null,
      locked,
      color,
      size,
      zIndex,
      isActive,
      updatedAt: new Date(),
    };

    if (existing) {
      const [updated] = await db
        .update(mapMarkerStyles)
        .set(nextPayload as any)
        .where(eq(mapMarkerStyles.id, existing.id))
        .returning();
      return res.json({ ok: true, style: updated || existing, upserted: "updated" });
    }

    const [created] = await db
      .insert(mapMarkerStyles)
      .values({ ...nextPayload, createdAt: new Date() } as any)
      .returning();

    return res.status(201).json({ ok: true, style: created, upserted: "created" });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to save map icon" });
  }
});

router.patch("/map-icons/:key", async (req: any, res) => {
  try {
    if (rejectTenantOverride(req, res)) return;
    const { tenantId } = await resolveTenantScope(req);
    const key = normalizeMarkerStyleKey(req.params?.key);
    if (!key) return res.status(400).json({ message: "Invalid key" });

    const existing = await db.query.mapMarkerStyles.findFirst({
      where: and(eq(mapMarkerStyles.tenantId, tenantId), eq(mapMarkerStyles.key, key)),
    });
    if (!existing) return res.status(404).json({ message: "Style not found" });

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (req.body?.label !== undefined) patch.label = String(req.body.label || "").trim() || key;
    if (req.body?.iconType !== undefined) patch.iconType = normalizeMarkerIconType(req.body.iconType) as any;
    if (req.body?.iconValue !== undefined) patch.iconValue = String(req.body.iconValue || "").trim() || existing.iconValue;
    if (req.body?.iconPrompt !== undefined || req.body?.icon_prompt !== undefined) {
      const raw = req.body?.iconPrompt !== undefined ? req.body.iconPrompt : req.body.icon_prompt;
      const next = typeof raw === "string" ? raw.trim() : "";
      patch.iconPrompt = next || null;
    }
    if (req.body?.locked !== undefined) patch.locked = Boolean(req.body.locked);
    if (req.body?.iconAssetId !== undefined || req.body?.icon_asset_id !== undefined) {
      const raw = req.body?.iconAssetId !== undefined ? req.body.iconAssetId : req.body.icon_asset_id;
      patch.iconAssetId = typeof raw === "string" && raw.trim() ? raw.trim() : null;
    }
    if (req.body?.color !== undefined) patch.color = normalizeHexColor(req.body.color);
    if (req.body?.size !== undefined) patch.size = Math.max(14, Math.min(72, toInt(req.body.size) ?? Number(existing.size || 28)));
    if (req.body?.zIndex !== undefined) patch.zIndex = Math.max(0, Math.min(999, toInt(req.body.zIndex) ?? Number(existing.zIndex || 10)));
    if (req.body?.isActive !== undefined) patch.isActive = req.body.isActive !== false;

    const [updated] = await db
      .update(mapMarkerStyles)
      .set(patch as any)
      .where(eq(mapMarkerStyles.id, existing.id))
      .returning();

    res.json({ ok: true, style: updated || existing });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to update map icon" });
  }
});

router.post("/map-icons/:key/generate-image", async (req: any, res) => {
  try {
    if (rejectTenantOverride(req, res)) return;
    const { tenantId, tenantKey } = await resolveTenantScope(req);
    const key = normalizeMarkerStyleKey(req.params?.key);
    if (!key) return res.status(400).json({ message: "Invalid key" });

    const existing = await db.query.mapMarkerStyles.findFirst({
      where: and(eq(mapMarkerStyles.tenantId, tenantId), eq(mapMarkerStyles.key, key)),
    });
    if (!existing) return res.status(404).json({ message: "Style not found" });
    if ((existing as any).locked) return res.status(409).json({ message: "Style is locked. Unlock to regenerate." });

    const iconPromptRaw = typeof req.body?.prompt === "string" ? req.body.prompt : req.body?.iconPrompt ?? req.body?.icon_prompt;
    const prompt = typeof iconPromptRaw === "string" ? iconPromptRaw.trim() : "";
    const effectivePrompt = prompt || String((existing as any).iconPrompt || "").trim();
    if (!effectivePrompt) return res.status(400).json({ message: "prompt is required" });

    const admin = (req as any).adminUser;
    const assetKey = `${tenantKey}/${key}`;
    const asset = await upsertAsset("map-icons", assetKey, `map-icons/${tenantKey}/${key}`, "default");

    const record = await generateAndStoreImage({
      namespace: "map-icons",
      assetKey,
      variant: "default",
      prompt: effectivePrompt,
      mode: (req.body?.mode as any) || "quality",
      input: { aspect_ratio: "1:1", output_format: "png" },
      setActive: true,
      createdBy: admin?.id ? `admin:${admin.id}` : undefined,
    });

    const [updated] = await db
      .update(mapMarkerStyles)
      .set({
        iconType: "image_url" as any,
        iconValue: record.storedUrl || existing.iconValue,
        iconAssetId: asset.id,
        iconPrompt: effectivePrompt,
        updatedAt: new Date(),
      } as any)
      .where(eq(mapMarkerStyles.id, existing.id))
      .returning();

    return res.json({ ok: true, style: updated || existing, image: record, asset });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to generate map icon image" });
  }
});

router.post("/map-icons/categories/:categoryId/generate-image", async (req: any, res) => {
  try {
    if (rejectTenantOverride(req, res)) return;
    const { tenantId, tenantKey } = await resolveTenantScope(req);
    const categoryId = toInt(req.params?.categoryId);
    if (!categoryId) return res.status(400).json({ message: "Invalid category id" });

    const category = await db.query.productCategories.findFirst({
      where: and(eq(productCategories.tenantId, tenantId), eq(productCategories.id, categoryId)),
    });
    if (!category) return res.status(404).json({ message: "Category not found" });

    const styleKey =
      normalizeMarkerStyleKey(`cat_${(category as any).slug || (category as any).name || categoryId}`) || `cat_${categoryId}`;
    const requestedPromptRaw =
      typeof req.body?.prompt === "string"
        ? req.body.prompt
        : req.body?.iconPrompt !== undefined
          ? req.body.iconPrompt
          : req.body?.icon_prompt;
    const requestedPrompt = typeof requestedPromptRaw === "string" ? requestedPromptRaw.trim() : "";
    const shouldLock = req.body?.locked !== undefined ? Boolean(req.body.locked) : undefined;

    let style = await db.query.mapMarkerStyles.findFirst({
      where: and(eq(mapMarkerStyles.tenantId, tenantId), eq(mapMarkerStyles.key, styleKey)),
    });
    if ((style as any)?.locked) {
      return res.status(409).json({ message: "Style is locked. Unlock to regenerate." });
    }

    const effectivePrompt =
      requestedPrompt ||
      String((style as any)?.iconPrompt || "").trim() ||
      buildDefaultCategoryIconPrompt((category as any).name, (category as any).slug);
    if (!effectivePrompt) return res.status(400).json({ message: "prompt is required" });

    if (!style) {
      const [created] = await db
        .insert(mapMarkerStyles)
        .values({
          tenantId,
          key: styleKey,
          label: String((category as any).name || styleKey),
          iconType: "emoji" as any,
          iconValue: "📍",
          iconPrompt: effectivePrompt,
          locked: false,
          color: normalizeHexColor((category as any).color),
          size: 28,
          zIndex: 12,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as any)
        .returning();
      style = created as any;
    }

    const admin = (req as any).adminUser;
    const assetKey = `${tenantKey}/${styleKey}`;
    const asset = await upsertAsset("map-icons", assetKey, `map-icons/${tenantKey}/${styleKey}`, "default");

    const record = await generateAndStoreImage({
      namespace: "map-icons",
      assetKey,
      variant: "default",
      prompt: effectivePrompt,
      mode: (req.body?.mode as any) || "quality",
      input: { aspect_ratio: "1:1", output_format: "png" },
      setActive: true,
      createdBy: admin?.id ? `admin:${admin.id}` : undefined,
    });

    const [updatedStyle] = await db
      .update(mapMarkerStyles)
      .set({
        iconType: "image_url" as any,
        iconValue: record.storedUrl || (style as any).iconValue,
        iconAssetId: asset.id,
        iconPrompt: effectivePrompt,
        locked: shouldLock !== undefined ? shouldLock : Boolean((style as any).locked),
        isActive: true,
        updatedAt: new Date(),
      } as any)
      .where(eq(mapMarkerStyles.id, (style as any).id))
      .returning();

    const [updatedCategory] = await db
      .update(productCategories)
      .set({ mapMarkerKey: styleKey } as any)
      .where(and(eq(productCategories.tenantId, tenantId), eq(productCategories.id, categoryId)))
      .returning();

    return res.json({
      ok: true,
      style: updatedStyle || style,
      category: updatedCategory || category,
      image: record,
      asset,
      mapMarkerKey: styleKey,
    });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to generate category map icon image" });
  }
});

router.delete("/map-icons/:key", async (req: any, res) => {
  try {
    if (rejectTenantOverride(req, res)) return;
    const { tenantId } = await resolveTenantScope(req);
    const key = normalizeMarkerStyleKey(req.params?.key);
    if (!key) return res.status(400).json({ message: "Invalid key" });
    if (key === "shop_default") return res.status(400).json({ message: "shop_default cannot be disabled" });

    const existing = await db.query.mapMarkerStyles.findFirst({
      where: and(eq(mapMarkerStyles.tenantId, tenantId), eq(mapMarkerStyles.key, key)),
    });
    if (!existing) return res.status(404).json({ message: "Style not found" });

    await db
      .update(mapMarkerStyles)
      .set({ isActive: false, updatedAt: new Date() } as any)
      .where(eq(mapMarkerStyles.id, existing.id));

    await db
      .update(productCategories)
      .set({ mapMarkerKey: "shop_default" } as any)
      .where(and(eq(productCategories.tenantId, tenantId), eq(productCategories.mapMarkerKey, key as any)));

    await db
      .update(sellers)
      .set({ mapMarkerKey: "shop_default" } as any)
      .where(and(eq(sellers.tenantId, tenantId), eq(sellers.mapMarkerKey, key as any)));

    res.json({ ok: true });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to disable map icon" });
  }
});

router.post("/map-icons/apply-categories", async (req: any, res) => {
  try {
    if (rejectTenantOverride(req, res)) return;
    const { tenantId } = await resolveTenantScope(req);
    const mappings = Array.isArray(req.body?.mappings) ? req.body.mappings : [];
    if (!mappings.length) return res.status(400).json({ message: "mappings is required" });

    const activeStyles = await db
      .select()
      .from(mapMarkerStyles)
      .where(and(eq(mapMarkerStyles.tenantId, tenantId), eq(mapMarkerStyles.isActive, true)));
    const allowedKeys = new Set(activeStyles.map((style: any) => normalizeMarkerStyleKey(style.key)).filter(Boolean));
    allowedKeys.add("shop_default");

    for (const mapping of mappings) {
      const categoryId = toInt(mapping?.categoryId);
      if (!categoryId) continue;
      const key = normalizeMarkerStyleKey(mapping?.mapMarkerKey) || "shop_default";
      if (!allowedKeys.has(key)) continue;
      await db
        .update(productCategories)
        .set({ mapMarkerKey: key } as any)
        .where(and(eq(productCategories.tenantId, tenantId), eq(productCategories.id, categoryId)));
    }

    const categories = await db
      .select()
      .from(productCategories)
      .where(eq(productCategories.tenantId, tenantId))
      .orderBy(asc(productCategories.sortOrder), asc(productCategories.name));

    res.json({ ok: true, categories });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to apply category marker mapping" });
  }
});

export default router;
