import { Router, type Request, type Response, type NextFunction } from "express";
import { db } from "@db";
import { eceSessions, eceUsers, generatedImages, imageAssets, productCategories, productImages, sellerProducts, sellers, tenants } from "@db/schema";
import { and, asc, desc, eq, ilike, inArray, isNull, or } from "drizzle-orm";
import {
  generateAndStoreImage,
  listAssets,
  getActiveImage,
  setActiveImage,
  importLocalAsset,
  upsertAsset,
  listRecentGenerated,
  applyImageToAsset,
  deleteGeneratedImage,
} from "../lib/imageGen/service";
import { ensureTenantAdmin, ensureTenantStaff, ensureTenantUser, isChairmanAssistantUser } from "./utils/auth";
import multer from "multer";
import fs from "fs";
import path from "path";
import { getImageGenStatus, refreshImageGenStatus } from "../lib/imageGen/health";
import { ASSET_REGISTRY, buildCategoryAssetRegistryEntries, registryKey, type AssetRegistryEntry } from "../config/assetRegistry";
import { buildProductPrompt, getProductPrimaryAssetKey, inferProductImagePreset, inferPromptTemplateKey } from "../lib/imageGen/productPrompt";
import { buildAnglePreset, ensureProductSlots, resolveSlotActives, syncProductImagesArray, trySyncFromAssetKey } from "../lib/imageGen/productImages";
import { generateAgentResponse } from "../lib/ai-provider";
import { isAiEnabled } from "../lib/ai-consent";

const upload = multer({ dest: path.join(process.cwd(), ".tmp_uploads") });

const DAILY_ADMIN_LIMIT = 30;
const DAILY_AGENT_LIMIT = 200;
const DAILY_SELLER_LIMIT = 80;
const PROMPT_LIMIT = 1500;

const rateBuckets = new Map<string, { count: number; date: string }>();

function checkLimit(key: string, limit: number) {
  const today = new Date().toISOString().slice(0, 10);
  const entry = rateBuckets.get(key);
  if (!entry || entry.date !== today) {
    rateBuckets.set(key, { count: 1, date: today });
    return;
  }
  if (entry.count >= limit) {
    throw new Error("Daily generation limit reached");
  }
  entry.count += 1;
}

const router = Router();

function normalizeVariant(value: unknown): string {
  const v = String(value ?? "").trim();
  return v || "default";
}

function resolveTenantKeyFromAssetNamespace(namespace: string): string {
  const raw = String(namespace || "").trim().toLowerCase();
  if (!raw) return "";
  if (raw === "bourse") return "bdo";
  return raw;
}

function getRequestOrigin(req: Request): string | null {
  const forwardedProto = String(req.headers["x-forwarded-proto"] || "")
    .split(",")[0]
    ?.trim();
  const forwardedHost = String(req.headers["x-forwarded-host"] || "")
    .split(",")[0]
    ?.trim();

  const proto = forwardedProto || req.protocol;
  const host = forwardedHost || req.get("host");
  if (!proto || !host) return null;
  return `${proto}://${host}`;
}

function toPublicUrl(req: Request, url: string | null | undefined): string | null {
  if (!url) return null;
  const raw = String(url);
  if (/^https?:\/\//i.test(raw)) return raw;
  if (!raw.startsWith("/")) return raw;
  const origin = getRequestOrigin(req);
  return origin ? `${origin}${raw}` : raw;
}

function isEceAdminUser(user: any): boolean {
  const roles = Array.isArray(user?.roles) ? (user.roles as string[]) : [];
  const perms = Array.isArray(user?.permissions) ? (user.permissions as string[]) : [];
  const currentMode = user?.currentMode;
  return currentMode === "admin" || roles.includes("admin") || perms.includes("*") || isChairmanAssistantUser(user);
}

function parseProductIdFromAssetKey(assetKey: string): { tenantKey: string; productId: number } | null {
  const parts = String(assetKey || "")
    .trim()
    .split("/")
    .filter(Boolean);
  if (parts.length < 4) return null;
  const productId = parseInt(parts[2], 10);
  if (!Number.isFinite(productId) || productId <= 0) return null;
  return { tenantKey: parts[0], productId };
}

async function requireSellerProductAccess(req: any, res: any, productId: number) {
  const tenant = req.tenant;
  if (!tenant) {
    res.status(400).json({ message: "tenant required" });
    return null;
  }

  const tenantId = tenant.id;
  const tenantKey = String(tenant.key);

  const user = (req as any).tenantUser;
  if (!user) {
    res.status(401).json({ message: "Authentication required" });
    return null;
  }

  const [product] = await db
    .select()
    .from(sellerProducts)
    .where(and(eq(sellerProducts.id, productId), eq(sellerProducts.tenantId, tenantId)));

  if (!product) {
    res.status(404).json({ message: "Product not found" });
    return null;
  }

  const seller = await db.query.sellers.findFirst({
    where: and(eq(sellers.id, Number(product.sellerId)), eq(sellers.tenantId, tenantId)),
  });

  if (!seller) {
    res.status(404).json({ message: "Seller not found" });
    return null;
  }

  if (!isEceAdminUser(user) && Number(seller.userId) !== Number(user.id)) {
    res.status(403).json({ message: "Forbidden" });
    return null;
  }

  return { tenantId, tenantKey, product, seller };
}

// Public resolver
router.get("/api/assets/image", async (req, res) => {
  const namespace = (req.query.namespace as string) || "";
  const assetKey = (req.query.assetKey as string) || "";
  const variant = normalizeVariant(req.query.variant);
  if (!namespace || !assetKey) return res.status(400).json({ message: "namespace and assetKey required" });

  res.setHeader("Cache-Control", "no-store");

  const asset = await db.query.imageAssets.findFirst({
    where: (fields, { and }) =>
      and(eq(imageAssets.namespace, namespace), eq(imageAssets.assetKey, assetKey), eq(imageAssets.variant, variant)),
  });
  if (!asset?.activeImageId) {
    return res.json({ namespace, assetKey, variant, url: null, updatedAt: asset?.updatedAt ? asset.updatedAt.getTime() : null });
  }
  const img = await db.query.generatedImages.findFirst({
    where: eq(generatedImages.id, asset.activeImageId),
  });
  if (!img?.storedUrl) {
    return res.json({ namespace, assetKey, variant, url: null, updatedAt: asset?.updatedAt ? asset.updatedAt.getTime() : null });
  }
  res.json({
    namespace,
    assetKey,
    variant,
    // Return stored URL as-is (usually a relative `/assets/...` path) to avoid mixed-content issues behind proxies.
    url: img.storedUrl,
    updatedAt: asset.updatedAt ? asset.updatedAt.getTime() : null,
  });
});

// Admin routes
router.use("/api/admin/assets", ensureTenantAdmin);

// Admin Media Debug routes
router.use("/api/admin/media/debug", ensureTenantAdmin);

// Admin Website routes
router.use("/api/admin/website", ensureTenantAdmin);

// Admin Products routes
router.use("/api/admin/products", ensureTenantAdmin);

// Seller routes (shop owners)
router.use("/api/seller/assets", ensureTenantUser);
router.use("/api/seller/products", ensureTenantUser);

router.get("/api/admin/assets/registry", async (req, res) => {
  try {
    const namespace = String(req.query.namespace || "").trim();
    const type = String(req.query.type || "").trim();
    const tag = String(req.query.tag || "").trim();
    const q = String(req.query.q || "").trim().toLowerCase();
    const include = String(req.query.include || "").trim().toLowerCase();

    const tagParts = tag
      ? tag
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
      : [];

    const wantCategories = include.split(",").includes("categories") || tagParts.includes("category") || tagParts.includes("categories");

    let items: AssetRegistryEntry[] = ASSET_REGISTRY.slice();

    if (wantCategories) {
      if (!namespace) return res.status(400).json({ message: "namespace required for categories registry" });

      const tenantKey = resolveTenantKeyFromAssetNamespace(namespace);
      const tenant = tenantKey ? await db.query.tenants.findFirst({ where: eq(tenants.key, tenantKey) }) : null;
      if (!tenant) return res.status(404).json({ message: "tenant not found" });

      const categories = await db
        .select({ id: productCategories.id, name: productCategories.name, slug: productCategories.slug })
        .from(productCategories)
        .where(eq(productCategories.tenantId, tenant.id))
        .orderBy(asc(productCategories.sortOrder), asc(productCategories.name));

      items = items.concat(buildCategoryAssetRegistryEntries({ namespace, categories }));
    }

    if (namespace) items = items.filter((x) => x.namespace === namespace);
    if (type) items = items.filter((x) => x.type === type);
    if (tagParts.length) items = items.filter((x) => tagParts.every((t) => (x.tags || []).includes(t)));
    if (q) {
      items = items.filter((x) => {
        const key = String(x.key || "").toLowerCase();
        const usage = String(x.usage || "").toLowerCase();
        const tags = Array.isArray(x.tags) ? x.tags.join(" ").toLowerCase() : "";
        return key.includes(q) || usage.includes(q) || tags.includes(q);
      });
    }

    // Ensure every registry item has an asset row so UI can use `assetId` everywhere.
    const ensured = await Promise.all(
      items.map(async (entry) => {
        const variant = normalizeVariant(entry.variant);
        const asset = await upsertAsset(entry.namespace, entry.key, `${entry.namespace}/${entry.key}`, variant);
        return { entry: { ...entry, variant }, asset };
      })
    );

    const activeIds = ensured.map((x) => x.asset.activeImageId).filter(Boolean) as string[];
    const actives = activeIds.length ? await db.select().from(generatedImages).where(inArray(generatedImages.id, activeIds)) : [];
    const byActiveId = new Map(actives.map((img: any) => [String(img.id), img]));

    res.setHeader("Cache-Control", "no-store");
    return res.json({
      ok: true,
      items: ensured.map((x) => {
        const active = x.asset.activeImageId ? byActiveId.get(String(x.asset.activeImageId)) || null : null;
        return {
          ...x.entry,
          id: x.asset.id,
          asset: x.asset,
          active: active
            ? {
                ...active,
                storedUrl: active.storedUrl,
                sourceUrl: active.sourceUrl,
              }
            : null,
        };
      }),
    });
  } catch (err: any) {
    return res.status(500).json({ message: err?.message || "Failed to load registry" });
  }
});

router.post("/api/admin/products/images/backfill-mismatch", async (req: any, res) => {
  const normalizeText = (value: unknown) =>
    String(value ?? "")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();

  const hasAny = (haystack: string, needles: string[]) => needles.some((n) => haystack.includes(n));

  const toInt = (value: unknown): number | null => {
    const parsed = typeof value === "number" ? value : parseInt(String(value ?? ""), 10);
    if (!Number.isFinite(parsed)) return null;
    return Math.trunc(parsed);
  };

  const pickFirstImage = (images: unknown): string | null => {
    if (!Array.isArray(images)) return null;
    const first = images.find((x) => typeof x === "string" && x.trim());
    return typeof first === "string" ? first : null;
  };

  try {
    const requestedTenantKey = String(req.body?.tenantKey || req.query?.tenantKey || "").trim();

    let tenantId = Number(req.tenant?.id);
    let tenantKey = String(req.tenant?.key || "").trim();

    if (requestedTenantKey) {
      const tenant = await db.query.tenants.findFirst({ where: eq(tenants.key, requestedTenantKey) });
      if (!tenant) return res.status(404).json({ message: "Unknown tenantKey" });
      tenantId = tenant.id;
      tenantKey = tenant.key;
    }

    const dryRun = Boolean(req.body?.dryRun);
    const onlyMissing = Boolean(req.body?.onlyMissing);
    const scanLimit = Math.min(Math.max(toInt(req.body?.scanLimit) ?? 1000, 1), 20000);
    const maxRegenerate = Math.min(Math.max(toInt(req.body?.maxRegenerate) ?? 20, 0), 200);
    const pageSize = Math.min(Math.max(toInt(req.body?.pageSize) ?? 200, 50), 500);

    const requestedCategoryId = toInt(req.body?.categoryId ?? req.query?.categoryId);
    const requestedCategorySlug = String(req.body?.categorySlug ?? req.query?.categorySlug ?? "").trim();

    let categoryIdFilter: number | null = requestedCategoryId;
    let categorySlugFilter: string | null = requestedCategorySlug ? requestedCategorySlug : null;

    if (categoryIdFilter == null && categorySlugFilter) {
      const row = await db.query.productCategories.findFirst({
        where: and(eq(productCategories.tenantId, tenantId), eq(productCategories.slug, categorySlugFilter)),
        columns: { id: true, slug: true },
      });
      if (!row?.id) return res.status(404).json({ message: "Unknown categorySlug" });
      categoryIdFilter = row.id;
      categorySlugFilter = row.slug;
    }

    const goldSignals = ["gold", "dore", "dore", "doré", "dor", "ingot", "bar", "bullion", "nugget", "dust"];
    const produceSignals = [
      "produce",
      "food",
      "vegetable",
      "fruit",
      "tomato",
      "avocado",
      "banana",
      "mango",
      "orange",
      "onion",
      "potato",
      "fresh",
    ];

    let scanned = 0;
    let missing = 0;
    let mismatched = 0;
    let regenerated = 0;
    let failed = 0;

    const failures: Array<{ productId: number; reason: string }> = [];
    const regeneratedIds: number[] = [];

    const conditions: any[] = [eq(sellerProducts.tenantId, tenantId)];
    if (categoryIdFilter != null) conditions.push(eq(sellerProducts.categoryId, categoryIdFilter));

    for (let offset = 0; scanned < scanLimit; offset += pageSize) {
      const rows = await db
        .select({ product: sellerProducts, category: productCategories })
        .from(sellerProducts)
        .leftJoin(
          productCategories,
          and(eq(sellerProducts.categoryId, productCategories.id), eq(productCategories.tenantId, tenantId)),
        )
        .where(and(...conditions))
        .orderBy(asc(sellerProducts.id))
        .limit(pageSize)
        .offset(offset);

      if (!rows.length) break;

      const assetKeyByProductId = new Map<number, string>();
      const assetKeys: string[] = [];
      for (const row of rows) {
        const categorySlug = row.category?.slug || "general";
        const assetKey = getProductPrimaryAssetKey({
          tenantKey,
          categorySlug,
          productId: row.product.id,
        });
        assetKeyByProductId.set(row.product.id, assetKey);
        assetKeys.push(assetKey);
      }

      const assets = assetKeys.length
        ? await db
            .select()
            .from(imageAssets)
            .where(and(eq(imageAssets.namespace, "products"), inArray(imageAssets.assetKey, assetKeys)))
        : [];

      const assetsByKey = new Map<string, (typeof assets)[number]>();
      for (const asset of assets) assetsByKey.set(asset.assetKey, asset);

      const activeIds = assets.map((a) => a.activeImageId).filter(Boolean) as string[];
      const images = activeIds.length
        ? await db
            .select({ id: generatedImages.id, prompt: generatedImages.prompt, storedUrl: generatedImages.storedUrl })
            .from(generatedImages)
            .where(inArray(generatedImages.id, activeIds))
        : [];

      const imagesById = new Map<string, (typeof images)[number]>();
      for (const img of images) imagesById.set(img.id, img);

      for (const row of rows) {
        if (scanned >= scanLimit) break;
        scanned += 1;

        const categoryText = normalizeText(`${row.category?.slug || ""} ${row.category?.name || ""}`);
        const categoryIsGold = hasAny(categoryText, goldSignals);
        const categoryIsProduce = hasAny(categoryText, produceSignals);

        const assetKey = assetKeyByProductId.get(row.product.id) || "";
        const asset = assetKey ? assetsByKey.get(assetKey) : null;
        const activeImage = asset?.activeImageId ? imagesById.get(asset.activeImageId) : null;

        const firstImage = pickFirstImage(row.product.images);
        const combined = normalizeText(`${firstImage || ""} ${activeImage?.storedUrl || ""} ${activeImage?.prompt || ""}`);

        const isMissing = !firstImage;
        const isMismatch =
          categoryIsGold && hasAny(combined, produceSignals)
            ? true
            : categoryIsProduce && hasAny(combined, goldSignals)
              ? true
              : false;

        if (isMissing) missing += 1;
        if (isMismatch) mismatched += 1;

        if (onlyMissing ? !isMissing : !(isMissing || isMismatch)) continue;
        if (dryRun) continue;
        if (maxRegenerate > 0 && regenerated >= maxRegenerate) continue;

        try {
          const { prompt, negativePrompt, aspect, modelTier } = buildProductPrompt({
            tenantKey,
            product: row.product as any,
            category: (row.category as any) ?? null,
          });

          const admin = req.adminUser;
          const generated = await generateAndStoreImage({
            namespace: "products",
            assetKey,
            prompt,
            negativePrompt,
            mode: modelTier,
            input: { aspect_ratio: aspect, output_format: "png" },
            setActive: true,
            createdBy: admin?.id ? `admin:${admin.id}` : undefined,
          });

          if (generated?.storedUrl) {
            const existingImages = Array.isArray(row.product.images)
              ? row.product.images.filter((x: any) => typeof x === "string" && x.trim())
              : [];
            const nextImages = [generated.storedUrl, ...existingImages.filter((x: string) => x !== generated.storedUrl)];

            const baseAttrs =
              row.product.attributes && typeof row.product.attributes === "object" && !Array.isArray(row.product.attributes)
                ? (row.product.attributes as any)
                : {};
            const nextAttrs = { ...baseAttrs, primaryImageAsset: { namespace: "products", assetKey } };

            await db
              .update(sellerProducts)
              .set({ images: nextImages, attributes: nextAttrs, updatedAt: new Date() })
              .where(and(eq(sellerProducts.id, row.product.id), eq(sellerProducts.tenantId, tenantId)));
          }

          regenerated += 1;
          regeneratedIds.push(row.product.id);
        } catch (err: any) {
          failed += 1;
          failures.push({ productId: row.product.id, reason: err?.message || "generation failed" });
        }
      }
    }

    res.json({
      ok: true,
      tenantKey,
      categoryId: categoryIdFilter,
      categorySlug: categorySlugFilter,
      onlyMissing,
      scanned,
      missing,
      mismatched,
      regenerated,
      failed,
      dryRun,
      maxRegenerate,
      scanLimit,
      regeneratedIds,
      failures,
    });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Backfill failed" });
  }
});

router.post("/api/admin/media/debug/check", async (_req, res) => {
  const status = refreshImageGenStatus();
  const checks = {
    token: {
      pass: status.replicate.tokenConfigured,
      reason: status.replicate.tokenConfigured ? "REPLICATE_API_TOKEN configured" : "REPLICATE_API_TOKEN missing",
    },
    storage: {
      pass: status.storage.ok,
      reason: status.storage.ok ? `Writable: ${status.storage.root}` : status.storage.error || "Not writable",
    },
  };
  const ok = checks.token.pass && checks.storage.pass;
  res.json({ ok, status, checks });
});

router.post("/api/admin/media/debug/generate-fast", async (req, res) => {
  const status = getImageGenStatus();
  if (status.status !== "ok") {
    return res.status(400).json({ ok: false, status, message: "Image generation is misconfigured" });
  }
  try {
    const admin = (req as any).adminUser;
    const record = await generateAndStoreImage({
      namespace: "bourse",
      assetKey: "debug/test_fast",
      prompt: "Neutral gradient placeholder, clean abstract background, no text, no logos",
      mode: "fast",
      input: { aspect_ratio: "16:9", output_format: "png" },
      setActive: true,
      createdBy: admin?.id ? `admin:${admin.id}` : undefined,
    });
    res.json({ ok: true, image: record });
  } catch (err: any) {
    res.status(500).json({ ok: false, message: err?.message || "generation failed" });
  }
});

router.post("/api/admin/media/debug/generate-quality", async (req, res) => {
  const status = getImageGenStatus();
  if (status.status !== "ok") {
    return res.status(400).json({ ok: false, status, message: "Image generation is misconfigured" });
  }
  try {
    const admin = (req as any).adminUser;
    const record = await generateAndStoreImage({
      namespace: "bourse",
      assetKey: "debug/test_quality",
      prompt: "Neutral gradient placeholder, clean abstract background, no text, no logos",
      mode: "quality",
      input: { aspect_ratio: "16:9", output_format: "png" },
      setActive: true,
      createdBy: admin?.id ? `admin:${admin.id}` : undefined,
    });
    res.json({ ok: true, image: record });
  } catch (err: any) {
    res.status(500).json({ ok: false, message: err?.message || "generation failed" });
  }
});

router.post("/api/admin/media/debug/set-hero", async (req, res) => {
  const { imageId } = req.body || {};
  if (!imageId) return res.status(400).json({ ok: false, message: "imageId required" });
  try {
    const applied = await applyImageToAsset({
      imageId: String(imageId),
      namespace: "bourse",
      targetAssetKey: "landing/hero_desktop",
      setActive: true,
    });
    res.json({ ok: true, asset: applied.asset, image: applied.image });
  } catch (err: any) {
    res.status(500).json({ ok: false, message: err?.message || "set-hero failed" });
  }
});

// Canonical aliases: /api/admin/assets/images/*
router.get("/api/admin/assets/images/list", async (req, res) => {
  const namespace = (req.query.namespace as string | undefined) || undefined;
  const assets = await listAssets(namespace);
  res.json({
    assets: assets.map((asset: any) => ({
      ...asset,
      active: asset.active
        ? {
            ...asset.active,
            storedUrl: asset.active.storedUrl,
            sourceUrl: asset.active.sourceUrl,
          }
        : null,
    })),
  });
});

router.post("/api/admin/assets/images/update-metadata", async (req, res) => {
  const { namespace, assetKey, variant, label, description, metadata } = req.body || {};
  if (!namespace || !assetKey) return res.status(400).json({ message: "namespace and assetKey required" });

  const v = normalizeVariant(variant);
  const existing = await db.query.imageAssets.findFirst({
    where: (fields, { and }) =>
      and(eq(imageAssets.namespace, String(namespace)), eq(imageAssets.assetKey, String(assetKey)), eq(imageAssets.variant, v)),
  });

  const patchMeta: Record<string, any> = {};
  if (typeof description === "string") patchMeta.description = description;
  if (metadata && typeof metadata === "object") Object.assign(patchMeta, metadata);

  if (!existing) {
    const [created] = await db
      .insert(imageAssets)
      .values({
        namespace: String(namespace),
        assetKey: String(assetKey),
        variant: v,
        label: typeof label === "string" ? label : `${namespace}/${assetKey}`,
        metadata: patchMeta,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    return res.json({ asset: created });
  }

  const nextMeta = { ...(existing.metadata as any), ...patchMeta };
  const [updated] = await db
    .update(imageAssets)
    .set({
      ...(typeof label === "string" ? { label } : {}),
      metadata: nextMeta,
      updatedAt: new Date(),
    })
    .where(eq(imageAssets.id, existing.id))
    .returning();

  res.json({ asset: updated });
});

router.post("/api/admin/assets/images/smoke-fix-landing-panel", async (req, res) => {
  const namespace = "bourse";
  const assetKey = "landing/hero_panel";
  const label = "Bourse hero panel";

  const placeholderSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900" role="img" aria-label="Neutral placeholder">\n` +
    `  <defs>\n` +
    `    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">\n` +
    `      <stop offset="0%" stop-color="#0B1220"/>\n` +
    `      <stop offset="100%" stop-color="#020617"/>\n` +
    `    </linearGradient>\n` +
    `    <radialGradient id="glow" cx="35%" cy="30%" r="70%">\n` +
    `      <stop offset="0%" stop-color="#D4A83B" stop-opacity="0.22"/>\n` +
    `      <stop offset="100%" stop-color="#D4A83B" stop-opacity="0"/>\n` +
    `    </radialGradient>\n` +
    `  </defs>\n` +
    `  <rect width="1600" height="900" fill="url(#bg)"/>\n` +
    `  <rect width="1600" height="900" fill="url(#glow)"/>\n` +
    `</svg>\n`;

  try {
    await upsertAsset(namespace, assetKey, label);

    const existing = await getActiveImage(namespace, assetKey);
    if (!existing?.storedUrl) {
      const tmpDir = path.join(process.cwd(), ".tmp_uploads");
      await fs.promises.mkdir(tmpDir, { recursive: true });
      const tmpPath = path.join(tmpDir, `smoke-fix-hero-panel-${Date.now()}.svg`);
      await fs.promises.writeFile(tmpPath, placeholderSvg, "utf-8");
      try {
        await importLocalAsset({
          namespace,
          assetKey,
          sourcePath: tmpPath,
          filename: "hero-panel-placeholder.svg",
          label,
          setActive: true,
        });
      } finally {
        fs.promises.unlink(tmpPath).catch(() => undefined);
      }
    }

    const asset = await db.query.imageAssets.findFirst({
      where: (fields, { and }) =>
        and(eq(imageAssets.namespace, namespace), eq(imageAssets.assetKey, assetKey), eq(imageAssets.variant, normalizeVariant(undefined))),
    });

    const active = await getActiveImage(namespace, assetKey);
    res.setHeader("Cache-Control", "no-store");
    return res.json({
      ok: true,
      namespace,
      assetKey,
      url: active?.storedUrl || null,
      updatedAt: asset?.updatedAt ? asset.updatedAt.getTime() : Date.now(),
    });
  } catch (err: any) {
    return res.status(500).json({ ok: false, message: err?.message || "smoke-fix failed" });
  }
});

router.post("/api/admin/assets/images/suggest-prompt", async (req, res) => {
  const { namespace, assetKey, aspect, description } = req.body || {};
  if (!namespace || !assetKey) return res.status(400).json({ message: "namespace and assetKey required" });

  const ns = String(namespace).trim();
  const key = String(assetKey).trim();
  const safeAspect = typeof aspect === "string" && aspect.trim() ? aspect.trim() : undefined;
  const safeDescription = typeof description === "string" ? description.trim() : "";

  const fallbackPrompt = [
    safeDescription || `Image for ${ns}/${key}`,
    safeAspect ? `aspect ratio ${safeAspect}` : null,
    "premium documentary realism",
    "no text, no logos, no watermarks",
  ]
    .filter(Boolean)
    .join(", ");

  if (!isAiEnabled()) {
    return res.json({ ok: false, prompt: fallbackPrompt, reason: "AI_DISABLED" });
  }

  try {
    const admin = (req as any).adminUser;
    const userLabel = admin?.displayName || admin?.email || `admin:${admin?.id ?? "anon"}`;

    const message = `Suggest a SINGLE image generation prompt for a Replicate model.

Asset: ${ns}/${key}
Usage/explanation: ${safeDescription || "not provided"}
Aspect ratio: ${safeAspect || "not specified"}
Requested by: ${userLabel}

Constraints:
- Return ONLY the prompt (no markdown, no quotes, no bullets)
- No text, no logos, no watermarks, no UI overlays
- Clean, premium, compliant, documentary photography look
- If relevant, reflect West Africa / Africa gold trade context
`;

    const ai = await generateAgentResponse(message, {
      role: "You are the Chairman's Assistant helping an admin craft high-quality, compliant image prompts for the platform's Media module.",
      context: {
        recentMessages: [],
        roomName: "Media Prompt Suggestion",
        roomType: "media-prompt-suggestion",
      },
    });

    const raw = String(ai?.response || "").trim();
    const cleaned = raw.replace(/^["'`]+/, "").replace(/["'`]+$/, "").trim();

    return res.json({ ok: true, prompt: cleaned || fallbackPrompt });
  } catch (err: any) {
    return res.json({ ok: false, prompt: fallbackPrompt, reason: err?.message || "AI_FAILED" });
  }
});

router.get("/api/admin/assets/images/history", async (req, res) => {
  const namespace = (req.query.namespace as string) || "";
  const assetKey = (req.query.assetKey as string) || "";
  const variant = normalizeVariant(req.query.variant);
  if (!namespace || !assetKey) return res.status(400).json({ message: "namespace and assetKey required" });
  const items = await db
    .select()
    .from(generatedImages)
    .where(
      and(eq(generatedImages.namespace, namespace), eq(generatedImages.assetKey, assetKey), eq(generatedImages.variant, variant))
    )
    .orderBy(desc(generatedImages.createdAt))
    .limit(20);
  res.json({
    items: items.map((item) => ({
      ...item,
      storedUrl: item.storedUrl,
      sourceUrl: item.sourceUrl,
    })),
  });
});

router.post("/api/admin/assets/images/set-active", async (req, res) => {
  const { assetId, imageId, namespace, assetKey, storedUrl, variant } = req.body || {};

  let resolvedImageId = imageId as string | undefined;
  if (!resolvedImageId && storedUrl) {
    const img = await db.query.generatedImages.findFirst({ where: eq(generatedImages.storedUrl, String(storedUrl)) });
    resolvedImageId = img?.id;
  }
  if (!resolvedImageId) return res.status(400).json({ message: "imageId (or storedUrl) required" });

  let resolvedAssetId = assetId as string | undefined;
  let resolvedNamespace = namespace as string | undefined;
  let resolvedAssetKey = assetKey as string | undefined;
  let resolvedVariant = typeof variant === "string" && variant.trim() ? normalizeVariant(variant) : "";

  if (!resolvedNamespace || !resolvedAssetKey || !resolvedVariant) {
    const img = await db.query.generatedImages.findFirst({ where: eq(generatedImages.id, resolvedImageId) });
    resolvedNamespace = resolvedNamespace || img?.namespace || undefined;
    resolvedAssetKey = resolvedAssetKey || img?.assetKey || undefined;
    resolvedVariant = resolvedVariant || normalizeVariant(img?.variant);
  }

  if (!resolvedAssetId) {
    if (!resolvedNamespace || !resolvedAssetKey) {
      return res.status(400).json({ message: "namespace and assetKey required when assetId is not provided" });
    }
    const asset = await db.query.imageAssets.findFirst({
      where: (fields, { and }) =>
        and(
          eq(imageAssets.namespace, resolvedNamespace!),
          eq(imageAssets.assetKey, resolvedAssetKey!),
          eq(imageAssets.variant, normalizeVariant(resolvedVariant))
        ),
    });
    resolvedAssetId = asset?.id;
  }

  if (!resolvedAssetId) return res.status(404).json({ message: "asset not found" });

  await setActiveImage(resolvedAssetId, resolvedImageId);
  try {
    const currentTenantKey = String((req as any).tenant?.key || "");
    if (resolvedNamespace && resolvedAssetKey) {
      await trySyncFromAssetKey({
        currentTenantKey,
        namespace: String(resolvedNamespace),
        assetKey: String(resolvedAssetKey),
      });
    }
  } catch {
    // ignore sync errors
  }
  const asset = await db.query.imageAssets.findFirst({ where: eq(imageAssets.id, resolvedAssetId) });
  res.json({ ok: true, updatedAt: asset?.updatedAt ? asset.updatedAt.getTime() : Date.now() });
});

router.post("/api/admin/assets/images/generate", async (req, res) => {
  const { namespace, assetKey, variant, prompt, negative, negativePrompt, model, aspect, mode = "quality", input = {}, setActive = false } =
    req.body || {};
  if (!namespace || !assetKey || !prompt) return res.status(400).json({ message: "namespace, assetKey, prompt required" });
  const resolvedNegative = negativePrompt || negative;
  if (String(prompt).length > PROMPT_LIMIT) return res.status(400).json({ message: `prompt too long (>${PROMPT_LIMIT})` });
  try {
    const admin = (req as any).adminUser;
    const adminKey = admin?.id ? `admin:${admin.id}` : "admin:anon";
    checkLimit(adminKey, DAILY_ADMIN_LIMIT);
    console.log(`[image-gen] admin=${admin?.id ?? "anon"} ns=${namespace} key=${assetKey} mode=${mode}`);
    const mergedInput = { ...(input || {}) };
    if (aspect && !mergedInput.aspect_ratio) mergedInput.aspect_ratio = aspect;
    const record = await generateAndStoreImage({
      namespace,
      assetKey,
      variant,
      prompt,
      negativePrompt: resolvedNegative,
      model,
      mode,
      input: mergedInput,
      setActive,
      createdBy: admin?.id ? `admin:${admin.id}` : undefined,
    });
    if (setActive) {
      try {
        const currentTenantKey = String((req as any).tenant?.key || "");
        await trySyncFromAssetKey({ currentTenantKey, namespace: String(namespace), assetKey: String(assetKey) });
      } catch {
        // ignore
      }
    }
    res.json({ image: record });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "generation failed" });
  }
});

router.post("/api/admin/assets/images/upload", upload.single("file"), async (req, res) => {
  const namespace = (req.body?.namespace as string) || "";
  const assetKey = (req.body?.assetKey as string) || "";
  const variant = req.body?.variant as string | undefined;
  const setActive = req.body?.setActive === "true" || req.body?.setActive === true;
  if (!namespace || !assetKey || !req.file?.path) {
    if (req.file?.path) fs.unlink(req.file.path, () => {});
    return res.status(400).json({ message: "namespace, assetKey, file required" });
  }
  try {
    const record = await importLocalAsset({
      namespace,
      assetKey,
      variant,
      sourcePath: req.file.path,
      filename: req.file.originalname || "upload.png",
      setActive,
    });
    if (setActive) {
      try {
        const currentTenantKey = String((req as any).tenant?.key || "");
        await trySyncFromAssetKey({ currentTenantKey, namespace: String(namespace), assetKey: String(assetKey) });
      } catch {
        // ignore
      }
    }
    fs.unlink(req.file.path, () => {});
    res.json({ image: record });
  } catch (err: any) {
    fs.unlink(req.file?.path || "", () => {});
    res.status(500).json({ message: err?.message || "upload failed" });
  }
});

// Seller asset routes: allow shop owners to upload/manage their own product image slots.
router.get("/api/seller/assets/images/history", async (req: any, res) => {
  const namespace = String(req.query.namespace || "").trim();
  const assetKey = String(req.query.assetKey || "").trim();
  const variant = normalizeVariant(req.query.variant);
  if (!namespace || !assetKey) return res.status(400).json({ message: "namespace and assetKey required" });
  if (namespace !== "products") return res.status(403).json({ message: "Forbidden" });

  const parsed = parseProductIdFromAssetKey(assetKey);
  if (!parsed) return res.status(400).json({ message: "Invalid assetKey" });

  const tenantKey = String(req.tenant?.key || "");
  if (tenantKey && parsed.tenantKey !== tenantKey) return res.status(403).json({ message: "Forbidden" });

  const access = await requireSellerProductAccess(req, res, parsed.productId);
  if (!access) return;

  const items = await db
    .select()
    .from(generatedImages)
    .where(and(eq(generatedImages.namespace, namespace), eq(generatedImages.assetKey, assetKey), eq(generatedImages.variant, variant)))
    .orderBy(desc(generatedImages.createdAt))
    .limit(20);

  res.json({
    items: items.map((item) => ({
      ...item,
      storedUrl: item.storedUrl,
      sourceUrl: item.sourceUrl,
    })),
  });
});

router.post("/api/seller/assets/images/set-active", async (req: any, res) => {
  const { assetId, imageId, namespace, assetKey, storedUrl, variant } = req.body || {};

  const resolvedNamespace = String(namespace || "").trim();
  const resolvedAssetKey = String(assetKey || "").trim();
  if (!resolvedNamespace || !resolvedAssetKey) return res.status(400).json({ message: "namespace and assetKey required" });
  if (resolvedNamespace !== "products") return res.status(403).json({ message: "Forbidden" });

  const parsed = parseProductIdFromAssetKey(resolvedAssetKey);
  if (!parsed) return res.status(400).json({ message: "Invalid assetKey" });

  const tenantKey = String(req.tenant?.key || "");
  if (tenantKey && parsed.tenantKey !== tenantKey) return res.status(403).json({ message: "Forbidden" });

  const access = await requireSellerProductAccess(req, res, parsed.productId);
  if (!access) return;

  let resolvedImageId = imageId as string | undefined;
  if (!resolvedImageId && storedUrl) {
    const img = await db.query.generatedImages.findFirst({ where: eq(generatedImages.storedUrl, String(storedUrl)) });
    resolvedImageId = img?.id;
  }
  if (!resolvedImageId) return res.status(400).json({ message: "imageId (or storedUrl) required" });

  let resolvedAssetId = assetId as string | undefined;
  const resolvedVariant = typeof variant === "string" && variant.trim() ? normalizeVariant(variant) : normalizeVariant(undefined);

  if (!resolvedAssetId) {
    const asset = await db.query.imageAssets.findFirst({
      where: (fields, { and }) =>
        and(
          eq(imageAssets.namespace, resolvedNamespace),
          eq(imageAssets.assetKey, resolvedAssetKey),
          eq(imageAssets.variant, normalizeVariant(resolvedVariant)),
        ),
    });
    resolvedAssetId = asset?.id;
  }

  if (!resolvedAssetId) return res.status(404).json({ message: "asset not found" });

  await setActiveImage(resolvedAssetId, resolvedImageId);
  try {
    const currentTenantKey = String((req as any).tenant?.key || "");
    await trySyncFromAssetKey({ currentTenantKey, namespace: resolvedNamespace, assetKey: resolvedAssetKey });
  } catch {
    // ignore
  }

  const asset = await db.query.imageAssets.findFirst({ where: eq(imageAssets.id, resolvedAssetId) });
  res.json({ ok: true, updatedAt: asset?.updatedAt ? asset.updatedAt.getTime() : Date.now() });
});

router.post("/api/seller/assets/images/upload", upload.single("file"), async (req: any, res) => {
  const namespace = String(req.body?.namespace || "").trim();
  const assetKey = String(req.body?.assetKey || "").trim();
  const variant = typeof req.body?.variant === "string" ? req.body.variant : undefined;
  const setActive = req.body?.setActive === "true" || req.body?.setActive === true;

  if (!namespace || !assetKey || !req.file?.path) {
    if (req.file?.path) fs.unlink(req.file.path, () => {});
    return res.status(400).json({ message: "namespace, assetKey, file required" });
  }
  if (namespace !== "products") {
    fs.unlink(req.file?.path || "", () => {});
    return res.status(403).json({ message: "Forbidden" });
  }

  const parsed = parseProductIdFromAssetKey(assetKey);
  if (!parsed) {
    fs.unlink(req.file?.path || "", () => {});
    return res.status(400).json({ message: "Invalid assetKey" });
  }

  const tenantKey = String(req.tenant?.key || "");
  if (tenantKey && parsed.tenantKey !== tenantKey) {
    fs.unlink(req.file?.path || "", () => {});
    return res.status(403).json({ message: "Forbidden" });
  }

  const access = await requireSellerProductAccess(req, res, parsed.productId);
  if (!access) {
    fs.unlink(req.file?.path || "", () => {});
    return;
  }

  try {
    const record = await importLocalAsset({
      namespace,
      assetKey,
      variant,
      sourcePath: req.file.path,
      filename: req.file.originalname || "upload.png",
      setActive: true,
    });
    try {
      const currentTenantKey = String((req as any).tenant?.key || "");
      await trySyncFromAssetKey({ currentTenantKey, namespace: String(namespace), assetKey: String(assetKey) });
    } catch {
      // ignore
    }
    fs.unlink(req.file.path, () => {});
    res.json({ image: record });
  } catch (err: any) {
    fs.unlink(req.file?.path || "", () => {});
    res.status(500).json({ message: err?.message || "upload failed" });
  }
});

router.get("/api/admin/assets", async (req, res) => {
  try {
    const namespace = String(req.query.namespace || "").trim();
    const tag = String(req.query.tag || "").trim();
    const type = String(req.query.type || "").trim();
    const q = String(req.query.q || "").trim();

    const page = Math.min(Math.max(parseInt(String(req.query.page || "1"), 10) || 1, 1), 100000);
    const limit = Math.min(Math.max(parseInt(String(req.query.limit || "60"), 10) || 60, 1), 200);
    const offset = (page - 1) * limit;

    const tagParts = tag
      ? tag
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
      : [];

    const wantsRegistryFiltering = !!(tagParts.length || type);

    if (wantsRegistryFiltering) {
      const include = String(req.query.include || "").trim().toLowerCase();
      const wantCategories = include.split(",").includes("categories") || tagParts.includes("category") || tagParts.includes("categories");

      let items: AssetRegistryEntry[] = ASSET_REGISTRY.slice();

      if (wantCategories) {
        if (!namespace) return res.status(400).json({ message: "namespace required for categories registry" });

        const tenantKey = resolveTenantKeyFromAssetNamespace(namespace);
        const tenant = tenantKey ? await db.query.tenants.findFirst({ where: eq(tenants.key, tenantKey) }) : null;
        if (!tenant) return res.status(404).json({ message: "tenant not found" });

        const categories = await db
          .select({ id: productCategories.id, name: productCategories.name, slug: productCategories.slug })
          .from(productCategories)
          .where(eq(productCategories.tenantId, tenant.id))
          .orderBy(asc(productCategories.sortOrder), asc(productCategories.name));

        items = items.concat(buildCategoryAssetRegistryEntries({ namespace, categories }));
      }

      if (namespace) items = items.filter((x) => x.namespace === namespace);
      if (type) items = items.filter((x) => x.type === type);
      if (tagParts.length) items = items.filter((x) => tagParts.every((t) => (x.tags || []).includes(t)));
      if (q) {
        const needle = q.toLowerCase();
        items = items.filter((x) => {
          const key = String(x.key || "").toLowerCase();
          const usage = String(x.usage || "").toLowerCase();
          const tags = Array.isArray(x.tags) ? x.tags.join(" ").toLowerCase() : "";
          return key.includes(needle) || usage.includes(needle) || tags.includes(needle);
        });
      }

      const paged = items.slice(offset, offset + limit);
      const ensured = await Promise.all(
        paged.map(async (entry) => {
          const variant = normalizeVariant(entry.variant);
          const asset = await upsertAsset(entry.namespace, entry.key, `${entry.namespace}/${entry.key}`, variant);
          return { entry: { ...entry, variant }, asset };
        })
      );

      const activeIds = ensured.map((x) => x.asset.activeImageId).filter(Boolean) as string[];
      const actives = activeIds.length ? await db.select().from(generatedImages).where(inArray(generatedImages.id, activeIds)) : [];
      const byActiveId = new Map(actives.map((img: any) => [String(img.id), img]));

      const assets = ensured.map((x) => {
        const active = x.asset.activeImageId ? byActiveId.get(String(x.asset.activeImageId)) || null : null;
        return {
          ...x.asset,
          active: active ? { ...active, storedUrl: active.storedUrl, sourceUrl: active.sourceUrl } : null,
        };
      });

      return res.json({ ok: true, page, limit, assets, items: assets });
    }

    const whereParts: any[] = [];
    if (namespace) whereParts.push(eq(imageAssets.namespace, namespace));
    if (q) {
      const needle = `%${q.replace(/%/g, "\\%").replace(/_/g, "\\_")}%`;
      whereParts.push(or(ilike(imageAssets.assetKey, needle), ilike(imageAssets.label, needle)));
    }

    const whereExpr = whereParts.length ? and(...whereParts) : undefined;

    const rows = await db
      .select({ asset: imageAssets, active: generatedImages })
      .from(imageAssets)
      .leftJoin(generatedImages, eq(imageAssets.activeImageId, generatedImages.id))
      .where(whereExpr)
      .orderBy(asc(imageAssets.assetKey), asc(imageAssets.variant))
      .limit(limit)
      .offset(offset);

    const assets = rows.map((row) => ({ ...row.asset, active: row.active }));
    return res.json({ ok: true, page, limit, assets, items: assets });
  } catch (err: any) {
    return res.status(500).json({ message: err?.message || "Failed to load assets" });
  }
});

router.get("/api/admin/assets/:assetId/versions", async (req, res) => {
  const assetId = String(req.params.assetId || "").trim();
  const limit = Math.min(Math.max(parseInt(String(req.query.limit || "20"), 10) || 20, 1), 50);
  if (!assetId) return res.status(400).json({ message: "assetId required" });

  const asset = await db.query.imageAssets.findFirst({ where: eq(imageAssets.id, assetId) });
  if (!asset) return res.status(404).json({ message: "asset not found" });

  const items = await db
    .select()
    .from(generatedImages)
    .where(
      and(
        eq(generatedImages.namespace, asset.namespace),
        eq(generatedImages.assetKey, asset.assetKey),
        eq(generatedImages.variant, asset.variant)
      )
    )
    .orderBy(desc(generatedImages.createdAt))
    .limit(limit);

  return res.json({
    ok: true,
    asset,
    items: items.map((item) => ({ ...item, storedUrl: item.storedUrl, sourceUrl: item.sourceUrl })),
  });
});

router.post("/api/admin/assets/:assetId/set-active", async (req, res) => {
  const assetId = String(req.params.assetId || "").trim();
  const versionId = String(req.body?.versionId || req.body?.imageId || "").trim();
  if (!assetId) return res.status(400).json({ message: "assetId required" });
  if (!versionId) return res.status(400).json({ message: "versionId required" });

  const asset = await db.query.imageAssets.findFirst({ where: eq(imageAssets.id, assetId) });
  if (!asset) return res.status(404).json({ message: "asset not found" });

  const version = await db.query.generatedImages.findFirst({ where: eq(generatedImages.id, versionId) });
  if (!version) return res.status(404).json({ message: "version not found" });
  if (
    version.namespace !== asset.namespace ||
    version.assetKey !== asset.assetKey ||
    normalizeVariant((version as any).variant) !== normalizeVariant((asset as any).variant)
  ) {
    return res.status(409).json({ message: "version does not belong to asset" });
  }

  await setActiveImage(assetId, versionId);
  const refreshed = await db.query.imageAssets.findFirst({ where: eq(imageAssets.id, assetId) });
  return res.json({ ok: true, updatedAt: refreshed?.updatedAt ? refreshed.updatedAt.getTime() : Date.now() });
});

router.post("/api/admin/assets/:assetId/generate", async (req, res) => {
  const assetId = String(req.params.assetId || "").trim();
  if (!assetId) return res.status(400).json({ message: "assetId required" });

  const asset = await db.query.imageAssets.findFirst({ where: eq(imageAssets.id, assetId) });
  if (!asset) return res.status(404).json({ message: "asset not found" });

  const registryEntry =
    ASSET_REGISTRY.find(
      (entry) =>
        registryKey({ namespace: entry.namespace, key: entry.key, variant: entry.variant }) ===
        registryKey({ namespace: asset.namespace, key: asset.assetKey, variant: asset.variant })
    ) || null;

  const prompt = String(req.body?.prompt || registryEntry?.defaultPrompt || "").trim();
  if (!prompt) return res.status(400).json({ message: "prompt required" });
  if (prompt.length > PROMPT_LIMIT) return res.status(400).json({ message: `prompt too long (>${PROMPT_LIMIT})` });

  const negative = req.body?.negativePrompt ?? req.body?.negative ?? registryEntry?.negativePrompt ?? "";
  const mode = String(req.body?.mode || registryEntry?.modelTier || "quality") as any;
  const model = req.body?.model ? String(req.body.model) : undefined;
  const setActive = req.body?.setActive === undefined ? true : !!req.body.setActive;

  const mergedInput = { ...(registryEntry?.input || {}), ...(req.body?.input || {}) };
  const aspect = String(req.body?.aspect || registryEntry?.aspectRatio || "").trim();
  if (aspect && !mergedInput.aspect_ratio) mergedInput.aspect_ratio = aspect;

  try {
    const admin = (req as any).adminUser;
    const adminKey = admin?.id ? `admin:${admin.id}` : "admin:anon";
    checkLimit(adminKey, DAILY_ADMIN_LIMIT);

    const record = await generateAndStoreImage({
      namespace: asset.namespace,
      assetKey: asset.assetKey,
      variant: asset.variant,
      prompt,
      negativePrompt: negative,
      model,
      mode,
      input: mergedInput,
      setActive,
      createdBy: admin?.id ? `admin:${admin.id}` : undefined,
    });

    if (setActive) {
      try {
        const currentTenantKey = String((req as any).tenant?.key || "");
        await trySyncFromAssetKey({ currentTenantKey, namespace: String(asset.namespace), assetKey: String(asset.assetKey) });
      } catch {
        // ignore
      }
    }

    return res.json({ ok: true, image: record });
  } catch (err: any) {
    return res.status(500).json({ message: err?.message || "generation failed" });
  }
});

router.post("/api/admin/assets/:assetId/upload", upload.single("file"), async (req, res) => {
  const assetId = String(req.params.assetId || "").trim();
  const setActive = req.body?.setActive === undefined ? true : req.body?.setActive === "true" || req.body?.setActive === true;
  if (!assetId) {
    if (req.file?.path) fs.unlink(req.file.path, () => {});
    return res.status(400).json({ message: "assetId required" });
  }

  const asset = await db.query.imageAssets.findFirst({ where: eq(imageAssets.id, assetId) });
  if (!asset) {
    if (req.file?.path) fs.unlink(req.file.path, () => {});
    return res.status(404).json({ message: "asset not found" });
  }

  if (!req.file?.path) return res.status(400).json({ message: "file required" });

  try {
    const record = await importLocalAsset({
      namespace: asset.namespace,
      assetKey: asset.assetKey,
      variant: asset.variant,
      sourcePath: req.file.path,
      filename: req.file.originalname || "upload.png",
      setActive,
    });

    if (setActive) {
      try {
        const currentTenantKey = String((req as any).tenant?.key || "");
        await trySyncFromAssetKey({ currentTenantKey, namespace: String(asset.namespace), assetKey: String(asset.assetKey) });
      } catch {
        // ignore
      }
    }

    fs.unlink(req.file.path, () => {});
    return res.json({ ok: true, image: record });
  } catch (err: any) {
    fs.unlink(req.file?.path || "", () => {});
    return res.status(500).json({ message: err?.message || "upload failed" });
  }
});

router.post("/api/admin/assets/bulk-generate", async (req, res) => {
  try {
    const namespace = String(req.body?.namespace || "").trim();
    const type = String(req.body?.type || "").trim();
    const tag = String(req.body?.tag || "").trim();
    const q = String(req.body?.q || "").trim().toLowerCase();
    const missingOnly = !!req.body?.missingOnly;
    const setActive = req.body?.setActive === undefined ? true : !!req.body.setActive;

    if (!namespace) return res.status(400).json({ message: "namespace required" });

    const tagParts = tag
      ? tag
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
      : [];

    let entries: AssetRegistryEntry[] = ASSET_REGISTRY.filter((e) => e.namespace === namespace);

    const include = String(req.body?.include || "").trim().toLowerCase();
    const wantCategories = include.split(",").includes("categories") || tagParts.includes("category") || tagParts.includes("categories");
    if (wantCategories) {
      const tenantKey = resolveTenantKeyFromAssetNamespace(namespace);
      const tenant = tenantKey ? await db.query.tenants.findFirst({ where: eq(tenants.key, tenantKey) }) : null;
      if (!tenant) return res.status(404).json({ message: "tenant not found" });

      const categories = await db
        .select({ id: productCategories.id, name: productCategories.name, slug: productCategories.slug })
        .from(productCategories)
        .where(eq(productCategories.tenantId, tenant.id))
        .orderBy(asc(productCategories.sortOrder), asc(productCategories.name));

      entries = entries.concat(buildCategoryAssetRegistryEntries({ namespace, categories }));
    }

    if (type) entries = entries.filter((e) => e.type === type);
    if (tagParts.length) entries = entries.filter((e) => tagParts.every((t) => (e.tags || []).includes(t)));
    if (q) {
      entries = entries.filter((e) => {
        const key = String(e.key || "").toLowerCase();
        const usage = String(e.usage || "").toLowerCase();
        const tags = Array.isArray(e.tags) ? e.tags.join(" ").toLowerCase() : "";
        return key.includes(q) || usage.includes(q) || tags.includes(q);
      });
    }

    const safeLimit = Math.min(Math.max(parseInt(String(req.body?.limit || "30"), 10) || 30, 1), 50);
    entries = entries.slice(0, safeLimit);

    const admin = (req as any).adminUser;
    const adminKey = admin?.id ? `admin:${admin.id}` : "admin:anon";

    const results: any[] = [];

    for (const entry of entries) {
      const variant = normalizeVariant(entry.variant);
      const asset = await upsertAsset(entry.namespace, entry.key, `${entry.namespace}/${entry.key}`, variant);

      if (missingOnly && asset.activeImageId) {
        results.push({ key: entry.key, status: "skipped_has_active", assetId: asset.id });
        continue;
      }

      const prompt = String(entry.defaultPrompt || "").trim();
      if (!prompt) {
        results.push({ key: entry.key, status: "skipped_no_prompt", assetId: asset.id });
        continue;
      }

      checkLimit(adminKey, DAILY_ADMIN_LIMIT);

      const mergedInput = { ...(entry.input || {}) };
      const aspect = String(entry.aspectRatio || "").trim();
      if (aspect && !mergedInput.aspect_ratio) mergedInput.aspect_ratio = aspect;

      const image = await generateAndStoreImage({
        namespace: entry.namespace,
        assetKey: entry.key,
        variant,
        prompt,
        negativePrompt: entry.negativePrompt,
        mode: entry.modelTier || "quality",
        input: mergedInput,
        setActive,
        createdBy: admin?.id ? `admin:${admin.id}` : undefined,
      });

      results.push({ key: entry.key, status: "generated", assetId: asset.id, imageId: image.id });
    }

    return res.json({ ok: true, results });
  } catch (err: any) {
    return res.status(500).json({ message: err?.message || "bulk generate failed" });
  }
});

router.delete("/api/admin/assets/image/:id", async (req, res) => {
  const id = req.params.id;
  if (!id) return res.status(400).json({ message: "id required" });
  try {
    await deleteGeneratedImage(id);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "delete failed" });
  }
});

router.post("/api/agents/image-gen", ensureTenantAdmin, async (req, res) => {
  const { namespace, assetKey, prompt, negativePrompt, model, aspect, mode = "quality", input = {}, setActive = false } = req.body || {};
  if (!namespace || !assetKey || !prompt) return res.status(400).json({ message: "namespace, assetKey, prompt required" });
  if (prompt.length > PROMPT_LIMIT) return res.status(400).json({ message: `prompt too long (>${PROMPT_LIMIT})` });
  try {
    const admin = (req as any).adminUser;
    const adminKey = admin?.id ? `agent:${admin.id}` : "agent:anon";
    checkLimit(adminKey, DAILY_AGENT_LIMIT);
    console.log(`[agent image-gen] admin=${admin?.id ?? "anon"} ns=${namespace} key=${assetKey} mode=${mode}`);
    const mergedInput = { ...(input || {}) };
    if (aspect && !mergedInput.aspect_ratio) mergedInput.aspect_ratio = aspect;
    const record = await generateAndStoreImage({
      namespace,
      assetKey,
      prompt,
      negativePrompt,
      model,
      mode,
      input: mergedInput,
      setActive,
      createdBy: admin?.id ? `agent:${admin.id}` : undefined,
    });
    res.json({ image: record });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "generation failed" });
  }
});

// Agent media aliases: /api/agent/media/*
router.use("/api/agent/media", ensureTenantStaff);

router.post("/api/agent/media/generate-image", async (req, res) => {
  const { namespace, assetKey, prompt, negative, negativePrompt, model, aspect, mode = "quality", input = {}, setActive = false } =
    req.body || {};
  if (!namespace || !assetKey || !prompt) return res.status(400).json({ message: "namespace, assetKey, prompt required" });
  const resolvedNegative = negativePrompt || negative;
  if (String(prompt).length > PROMPT_LIMIT) return res.status(400).json({ message: `prompt too long (>${PROMPT_LIMIT})` });
  try {
    const staff = (req as any).staffUser;
    const staffKey = staff?.id ? `agent:${staff.id}` : "agent:anon";
    checkLimit(staffKey, DAILY_AGENT_LIMIT);
    console.log(`[agent media] user=${staff?.id ?? "anon"} ns=${namespace} key=${assetKey} mode=${mode}`);
    const mergedInput = { ...(input || {}) };
    if (aspect && !mergedInput.aspect_ratio) mergedInput.aspect_ratio = aspect;
    const record = await generateAndStoreImage({
      namespace,
      assetKey,
      prompt,
      negativePrompt: resolvedNegative,
      model,
      mode,
      input: mergedInput,
      setActive,
      createdBy: staff?.id ? `agent:${staff.id}` : undefined,
    });
    res.json({ image: record });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "generation failed" });
  }
});

router.get("/api/agent/media/history", async (req, res) => {
  const namespace = (req.query.namespace as string) || "";
  const assetKey = (req.query.assetKey as string) || "";
  const limit = parseInt((req.query.limit as string) || "20", 10);
  if (!namespace) return res.status(400).json({ message: "namespace required" });
  if (assetKey) {
    const items = await db
      .select()
      .from(generatedImages)
      .where(and(eq(generatedImages.namespace, namespace), eq(generatedImages.assetKey, assetKey)))
      .orderBy(desc(generatedImages.createdAt))
      .limit(Math.min(Math.max(limit || 20, 1), 50));
    return res.json({ items });
  }
  const items = await listRecentGenerated(namespace, Math.min(Math.max(limit || 20, 1), 50));
  res.json({ items });
});

// =========================
// Product Images (multi-slot)
// =========================

function toInt(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return null;
  return Math.trunc(parsed);
}

function normalizeObject(value: unknown): Record<string, any> | null {
  if (!value) return null;
  if (typeof value === "object" && !Array.isArray(value)) return value as any;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as any;
    } catch {
      return null;
    }
  }
  return null;
}

function cleanModelText(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  return raw.replace(/^["'`]+/, "").replace(/["'`]+$/, "").trim();
}

function normalizeMatchText(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokenizeMatchText(value: unknown): string[] {
  const normalized = normalizeMatchText(value);
  if (!normalized) return [];
  return normalized
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);
}

function normalizeTags(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((entry) => String(entry ?? "").trim())
      .filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  return [];
}

function resolvePromptTemplateFromListing(input: {
  tenantKey: string;
  product: any;
  category: any | null;
}) {
  return inferPromptTemplateKey({
    tenantKey: input.tenantKey,
    categorySlug: input.category?.slug,
    categoryName: input.category?.name,
    productName: input.product?.name,
    shortDescription: input.product?.shortDescription,
    description: input.product?.description,
  });
}

function resolvePromptTemplateFromText(input: { text: string }) {
  return inferPromptTemplateKey({
    productName: input.text,
    shortDescription: input.text,
    description: input.text,
  });
}

function templateFamilyKey(template: string): string {
  const normalized = String(template || "").trim().toLowerCase();
  if (normalized === "gold" || normalized === "stamped") return "gold";
  if (normalized === "jewelry") return "jewelry";
  if (normalized === "produce" || normalized === "groceries" || normalized === "restaurants" || normalized === "pharmacy") {
    return "consumable";
  }
  if (!normalized) return "generic";
  return normalized;
}

function templatesAreCompatible(aRaw: string, bRaw: string): boolean {
  const a = templateFamilyKey(aRaw);
  const b = templateFamilyKey(bRaw);
  return a === b;
}

function normalizeImagePreset(value: unknown): "gold" | "jewelry" | "produce" | "generic" | null {
  const preset = String(value ?? "").trim().toLowerCase();
  if (preset === "gold" || preset === "jewelry" || preset === "produce" || preset === "generic") return preset;
  return null;
}

function presetMatchesTemplate(templateRaw: string, preset: "gold" | "jewelry" | "produce" | "generic") {
  const family = templateFamilyKey(templateRaw);
  if (family === "gold") return preset === "gold";
  if (family === "jewelry") return preset === "jewelry";
  if (family === "consumable") return preset === "produce";
  return preset === "generic";
}

function selectSafeProductImageConfig(input: {
  tenantKey: string;
  product: any;
  category: any | null;
  imageGen: Record<string, any>;
  requestedBasePrompt?: string | null;
  requestedNegativePrompt?: string | null;
  requestedPreset?: string | null;
}) {
  const defaults = buildProductPrompt({ tenantKey: input.tenantKey, product: input.product, category: input.category });
  const expectedTemplate = resolvePromptTemplateFromListing({
    tenantKey: input.tenantKey,
    product: input.product,
    category: input.category,
  });
  const inferredPreset = inferProductImagePreset({
    tenantKey: input.tenantKey,
    categorySlug: input.category?.slug,
    categoryName: input.category?.name,
    productName: input.product?.name,
    shortDescription: input.product?.shortDescription,
    description: input.product?.description,
  });

  const requestedPreset = normalizeImagePreset(input.requestedPreset);
  const storedPreset = normalizeImagePreset(input.imageGen?.preset);
  const preset = requestedPreset || (storedPreset && presetMatchesTemplate(expectedTemplate, storedPreset) ? storedPreset : inferredPreset);

  const requestedPrompt = String(input.requestedBasePrompt ?? "").trim();
  const requestedNegative = String(input.requestedNegativePrompt ?? "").trim();
  const storedPrompt = String(input.imageGen?.basePrompt ?? "").trim();
  const storedNegative = String(input.imageGen?.negativePrompt ?? "").trim();

  let basePrompt = requestedPrompt || storedPrompt || defaults.prompt;
  if (!requestedPrompt && storedPrompt) {
    const storedTemplate = resolvePromptTemplateFromText({ text: storedPrompt });
    if (!templatesAreCompatible(expectedTemplate, storedTemplate)) {
      basePrompt = defaults.prompt;
    }
  }

  const negativePrompt = requestedNegative || storedNegative || defaults.negativePrompt;

  return { defaults, expectedTemplate, preset, basePrompt, negativePrompt };
}

function buildProductMatchTokens(product: any, category: any | null): Set<string> {
  const tokens = new Set<string>();
  const add = (value: unknown) => {
    for (const token of tokenizeMatchText(value)) tokens.add(token);
  };

  add(product?.name);
  add(product?.shortDescription);
  add(product?.description);
  add(category?.slug);
  add(category?.name);
  for (const tag of normalizeTags(product?.tags)) add(tag);

  return tokens;
}

function jaccardScore(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection += 1;
  }
  const union = a.size + b.size - intersection;
  if (!union) return 0;
  return intersection / union;
}

async function getSellerProductImageSuggestions(input: {
  req: any;
  tenantId: number;
  tenantKey: string;
  product: any;
  category: any | null;
  limit: number;
}) {
  const candidates = await db
    .select({
      id: sellerProducts.id,
      name: sellerProducts.name,
      shortDescription: sellerProducts.shortDescription,
      description: sellerProducts.description,
      tags: sellerProducts.tags,
      attributes: sellerProducts.attributes,
      categoryId: sellerProducts.categoryId,
      status: sellerProducts.status,
      updatedAt: sellerProducts.updatedAt,
    })
    .from(sellerProducts)
    .where(eq(sellerProducts.tenantId, input.tenantId))
    .orderBy(desc(sellerProducts.updatedAt))
    .limit(240);

  const usable = candidates.filter((candidate) => Number(candidate.id) !== Number(input.product.id));
  if (!usable.length) return [];

  const categoryIds = Array.from(
    new Set(
      usable
        .map((candidate) => Number(candidate.categoryId))
        .filter((value) => Number.isFinite(value) && value > 0),
    ),
  );
  if (input.category?.id && Number.isFinite(Number(input.category.id))) categoryIds.push(Number(input.category.id));

  const categoryRows =
    categoryIds.length > 0
      ? await db
          .select({ id: productCategories.id, slug: productCategories.slug, name: productCategories.name })
          .from(productCategories)
          .where(and(eq(productCategories.tenantId, input.tenantId), inArray(productCategories.id, categoryIds)))
      : [];
  const categoryById = new Map(categoryRows.map((row) => [Number(row.id), row]));

  const targetTokens = buildProductMatchTokens(input.product, input.category);
  const targetCategorySlug = normalizeMatchText(input.category?.slug);
  const targetTemplate = resolvePromptTemplateFromListing({
    tenantKey: input.tenantKey,
    product: input.product,
    category: input.category,
  });

  const ranked = usable
    .map((candidate) => {
      const candidateCategory = candidate.categoryId != null ? categoryById.get(Number(candidate.categoryId)) || null : null;
      const candidateTokens = buildProductMatchTokens(candidate, candidateCategory);
      const similarity = jaccardScore(targetTokens, candidateTokens);
      const sameCategory = !!targetCategorySlug && normalizeMatchText(candidateCategory?.slug) === targetCategorySlug;
      const candidateTemplate = resolvePromptTemplateFromListing({
        tenantKey: input.tenantKey,
        product: candidate,
        category: candidateCategory,
      });
      const sameTemplateFamily = templatesAreCompatible(targetTemplate, candidateTemplate);
      const score = similarity + (sameTemplateFamily ? 0.18 : 0) + (sameCategory ? 0.04 : 0);
      return { candidate, candidateCategory, similarity, score, sameCategory, sameTemplateFamily };
    })
    .filter((entry) => (entry.sameTemplateFamily && entry.score >= 0.2) || entry.score >= 0.42)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(input.limit * 4, 20));

  if (!ranked.length) return [];

  const primaryAssetKeyByProductId = new Map<number, string>();
  for (const entry of ranked) {
    const categorySlug = entry.candidateCategory?.slug || "general";
    primaryAssetKeyByProductId.set(
      Number(entry.candidate.id),
      getProductPrimaryAssetKey({
        tenantKey: input.tenantKey,
        categorySlug,
        productId: Number(entry.candidate.id),
      }),
    );
  }

  const primaryKeys = Array.from(primaryAssetKeyByProductId.values());
  const assets =
    primaryKeys.length > 0
      ? await db
          .select({
            id: imageAssets.id,
            assetKey: imageAssets.assetKey,
            activeImageId: imageAssets.activeImageId,
            updatedAt: imageAssets.updatedAt,
          })
          .from(imageAssets)
          .where(
            and(
              eq(imageAssets.namespace, "products"),
              eq(imageAssets.variant, normalizeVariant(undefined)),
              inArray(imageAssets.assetKey, primaryKeys),
            ),
          )
      : [];
  const assetByKey = new Map(assets.map((asset) => [String(asset.assetKey), asset]));

  const activeIds = assets
    .map((asset) => (asset.activeImageId ? String(asset.activeImageId) : ""))
    .filter(Boolean);
  const activeImages =
    activeIds.length > 0
      ? await db
          .select({ id: generatedImages.id, storedUrl: generatedImages.storedUrl })
          .from(generatedImages)
          .where(inArray(generatedImages.id, activeIds))
      : [];
  const imageById = new Map(activeImages.map((image) => [String(image.id), image]));

  const suggestions: Array<{
    sourceProductId: number;
    sourceProductName: string;
    sourceCategorySlug: string;
    score: number;
    imageId: string;
    imageUrl: string;
  }> = [];

  for (const entry of ranked) {
    const productId = Number(entry.candidate.id);
    const primaryKey = primaryAssetKeyByProductId.get(productId);
    if (!primaryKey) continue;

    const asset = assetByKey.get(primaryKey);
    const imageId = asset?.activeImageId ? String(asset.activeImageId) : "";
    if (!imageId) continue;

    const storedUrl = imageById.get(imageId)?.storedUrl;
    if (!storedUrl) continue;

    const imageUrl = toPublicUrl(input.req, storedUrl) || storedUrl;
    suggestions.push({
      sourceProductId: productId,
      sourceProductName: String(entry.candidate.name || `Product ${productId}`),
      sourceCategorySlug: String(entry.candidateCategory?.slug || "general"),
      score: Number(entry.score.toFixed(3)),
      imageId,
      imageUrl,
    });

    if (suggestions.length >= input.limit) break;
  }

  return suggestions;
}

async function resolveTenantScopeFromRequest(req: any): Promise<{ tenantId: number; tenantKey: string }> {
  const requestedTenantKey = String(req.body?.tenantKey || req.query?.tenantKey || "").trim();
  if (requestedTenantKey) {
    const tenant = await db.query.tenants.findFirst({ where: eq(tenants.key, requestedTenantKey) });
    if (!tenant) throw new Error("Unknown tenantKey");
    return { tenantId: tenant.id, tenantKey: tenant.key };
  }

  const tenant = req.tenant;
  if (!tenant) throw new Error("tenant required");
  return { tenantId: tenant.id, tenantKey: tenant.key };
}

router.get("/api/admin/products/:id/images", async (req: any, res) => {
  try {
    const { tenantId, tenantKey } = await resolveTenantScopeFromRequest(req);

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
            where: and(eq(productCategories.tenantId, tenantId), eq(productCategories.id, Number(product.categoryId))),
          })
        : null;

    const categorySlug = category?.slug || "general";

    const attrs = normalizeObject(product.attributes) || {};
    const imageGen = normalizeObject((attrs as any).imageGen) || {};
    const { defaults, basePrompt, negativePrompt, preset } = selectSafeProductImageConfig({
      tenantKey,
      product,
      category,
      imageGen,
    });

    const desiredCountRaw =
      typeof imageGen.count === "number"
        ? imageGen.count
        : typeof imageGen.count === "string"
          ? parseInt(imageGen.count, 10)
          : null;
    const desiredCount = Math.min(Math.max(Number(desiredCountRaw) || 8, 1), 12);
    const desired = buildAnglePreset(preset as any, desiredCount);

    let ensured = await ensureProductSlots({
      tenantId,
      tenantKey,
      productId,
      categorySlug,
    });
    if ((ensured.slots?.length ?? 0) <= 1) {
      ensured = await ensureProductSlots({
        tenantId,
        tenantKey,
        productId,
        categorySlug,
        desired,
      });
    }

    const { primaryAssetKey, slots } = ensured;

    const resolved = await resolveSlotActives({
      slots: slots.map((s: any) => ({ assetNamespace: String(s.assetNamespace), assetKey: String(s.assetKey) })),
    });

    return res.json({
      ok: true,
      tenantKey,
      productId,
      categorySlug,
      basePrompt,
      negativePrompt,
      aspect: defaults.aspect,
      modelTier: defaults.modelTier,
      primaryAssetKey,
      slots: slots.map((slot: any) => {
        const active = resolved.get(String(slot.assetKey)) || { url: null, updatedAt: null, activeImageId: null };
        return {
          id: slot.id,
          role: slot.role,
          position: slot.position,
          label: slot.label,
          assetNamespace: slot.assetNamespace,
          assetKey: slot.assetKey,
          metadata: slot.metadata,
          active,
        };
      }),
    });
  } catch (err: any) {
    const message = String(err?.message || "");
    if (message === "Unknown tenantKey") return res.status(404).json({ message });
    if (message === "tenant required") return res.status(400).json({ message });
    return res.status(500).json({ message: message || "Failed to load product images" });
  }
});

router.post("/api/admin/products/:id/images/update-settings", async (req: any, res) => {
  try {
    const { tenantId } = await resolveTenantScopeFromRequest(req);

    const productId = toInt(req.params.id);
    if (!productId) return res.status(400).json({ message: "Invalid product id" });

    const basePrompt = typeof req.body?.basePrompt === "string" ? req.body.basePrompt.trim() : "";
    const negativePrompt = typeof req.body?.negativePrompt === "string" ? req.body.negativePrompt.trim() : "";

    const [product] = await db
      .select({ attributes: sellerProducts.attributes })
      .from(sellerProducts)
      .where(and(eq(sellerProducts.id, productId), eq(sellerProducts.tenantId, tenantId)));
    if (!product) return res.status(404).json({ message: "Product not found" });

    const attrs = normalizeObject(product.attributes) || {};
    const nextImageGen = {
      ...(normalizeObject((attrs as any).imageGen) || {}),
      ...(basePrompt ? { basePrompt } : {}),
      ...(negativePrompt ? { negativePrompt } : {}),
      updatedAt: new Date().toISOString(),
    };

    await db
      .update(sellerProducts)
      .set({ attributes: { ...attrs, imageGen: nextImageGen }, updatedAt: new Date() } as any)
      .where(and(eq(sellerProducts.id, productId), eq(sellerProducts.tenantId, tenantId)));

    return res.json({ ok: true });
  } catch (err: any) {
    const message = String(err?.message || "");
    if (message === "Unknown tenantKey") return res.status(404).json({ message });
    if (message === "tenant required") return res.status(400).json({ message });
    return res.status(500).json({ message: message || "Failed to update product image settings" });
  }
});

router.post("/api/admin/products/:id/images/update-slot", async (req: any, res) => {
  try {
    const { tenantId, tenantKey } = await resolveTenantScopeFromRequest(req);

    const productId = toInt(req.params.id);
    if (!productId) return res.status(400).json({ message: "Invalid product id" });

    const slotId = typeof req.body?.slotId === "string" ? req.body.slotId.trim() : "";
    if (!slotId) return res.status(400).json({ message: "slotId required" });

    const promptOverrideRaw = typeof req.body?.promptOverride === "string" ? req.body.promptOverride.trim() : null;
    const negativePromptOverrideRaw =
      typeof req.body?.negativePromptOverride === "string" ? req.body.negativePromptOverride.trim() : null;
    const angleRaw = typeof req.body?.angle === "string" ? req.body.angle.trim() : null;
    const labelRaw = typeof req.body?.label === "string" ? req.body.label.trim() : null;

    if (promptOverrideRaw != null && promptOverrideRaw.length > PROMPT_LIMIT) {
      return res.status(400).json({ message: "promptOverride too long" });
    }
    if (negativePromptOverrideRaw != null && negativePromptOverrideRaw.length > PROMPT_LIMIT) {
      return res.status(400).json({ message: "negativePromptOverride too long" });
    }

    const [product] = await db
      .select({ categoryId: sellerProducts.categoryId })
      .from(sellerProducts)
      .where(and(eq(sellerProducts.id, productId), eq(sellerProducts.tenantId, tenantId)));
    if (!product) return res.status(404).json({ message: "Product not found" });

    const slot = await db.query.productImages.findFirst({
      where: and(
        eq(productImages.id, slotId),
        eq(productImages.tenantId, tenantId),
        eq(productImages.productId, productId),
        isNull(productImages.deletedAt),
      ),
    });
    if (!slot) return res.status(404).json({ message: "slot not found" });

    const baseMeta = normalizeObject(slot.metadata) || {};
    const nextMeta: Record<string, any> = { ...baseMeta };

    if (promptOverrideRaw != null) {
      if (promptOverrideRaw) nextMeta.promptOverride = promptOverrideRaw;
      else delete nextMeta.promptOverride;
    }
    if (negativePromptOverrideRaw != null) {
      if (negativePromptOverrideRaw) nextMeta.negativePromptOverride = negativePromptOverrideRaw;
      else delete nextMeta.negativePromptOverride;
    }
    if (angleRaw != null) {
      if (angleRaw) nextMeta.angle = angleRaw;
      else delete nextMeta.angle;
    }

    const update: any = {
      metadata: nextMeta,
      updatedAt: new Date(),
    };

    if (labelRaw != null) {
      update.label = labelRaw || null;
    }

    await db.update(productImages).set(update).where(eq(productImages.id, slot.id));

    if (labelRaw != null) {
      const category =
        product.categoryId != null
          ? await db.query.productCategories.findFirst({
              where: and(eq(productCategories.tenantId, tenantId), eq(productCategories.id, Number(product.categoryId))),
            })
          : null;
      const categorySlug = category?.slug || "general";

      await syncProductImagesArray({ tenantId, tenantKey, productId, categorySlug });
    }

    return res.json({
      ok: true,
      slotId: slot.id,
      label: labelRaw != null ? (labelRaw || null) : slot.label,
      metadata: nextMeta,
    });
  } catch (err: any) {
    const message = String(err?.message || "");
    if (message === "Unknown tenantKey") return res.status(404).json({ message });
    if (message === "tenant required") return res.status(400).json({ message });
    return res.status(500).json({ message: message || "Failed to update slot" });
  }
});

router.post("/api/admin/products/:id/images/generate-one", async (req: any, res) => {
  try {
    const { tenantId, tenantKey } = await resolveTenantScopeFromRequest(req);

    const productId = toInt(req.params.id);
    if (!productId) return res.status(400).json({ message: "Invalid product id" });

    const slotId = typeof req.body?.slotId === "string" ? req.body.slotId : typeof req.body?.productImageId === "string" ? req.body.productImageId : null;
    const setActive = Boolean(req.body?.setActive);
    const mode = (req.body?.mode as any) || "quality";
    const promptOverride = typeof req.body?.prompt === "string" ? req.body.prompt.trim() : null;
    const negativeOverride = typeof req.body?.negativePrompt === "string" ? req.body.negativePrompt.trim() : null;

    const [product] = await db
      .select()
      .from(sellerProducts)
      .where(and(eq(sellerProducts.id, productId), eq(sellerProducts.tenantId, tenantId)));
    if (!product) return res.status(404).json({ message: "Product not found" });

    const category =
      product.categoryId != null
        ? await db.query.productCategories.findFirst({
            where: and(eq(productCategories.tenantId, tenantId), eq(productCategories.id, Number(product.categoryId))),
          })
        : null;
    const categorySlug = category?.slug || "general";

    const attrs = normalizeObject(product.attributes) || {};
    const imageGen = normalizeObject((attrs as any).imageGen) || {};
    const safeConfig = selectSafeProductImageConfig({
      tenantKey,
      product,
      category,
      imageGen,
    });

    await ensureProductSlots({ tenantId, tenantKey, productId, categorySlug });

    let slot: any = null;
    if (slotId) {
      slot = await db.query.productImages.findFirst({
        where: and(
          eq(productImages.id, slotId),
          eq(productImages.tenantId, tenantId),
          eq(productImages.productId, productId),
          isNull(productImages.deletedAt),
        ),
      });
    }

    if (!slot) {
      return res.status(400).json({ message: "slotId required" });
    }

    const slotMeta = normalizeObject(slot.metadata) || {};
    const metaPromptOverride = typeof slotMeta.promptOverride === "string" ? slotMeta.promptOverride.trim() : "";
    const metaNegativeOverride = typeof slotMeta.negativePromptOverride === "string" ? slotMeta.negativePromptOverride.trim() : "";

    if (promptOverride != null && promptOverride.length > PROMPT_LIMIT) {
      return res.status(400).json({ message: "prompt too long" });
    }
    if (negativeOverride != null && negativeOverride.length > PROMPT_LIMIT) {
      return res.status(400).json({ message: "negativePrompt too long" });
    }
    if (metaPromptOverride.length > PROMPT_LIMIT) {
      return res.status(400).json({ message: "slot promptOverride too long" });
    }
    if (metaNegativeOverride.length > PROMPT_LIMIT) {
      return res.status(400).json({ message: "slot negativePromptOverride too long" });
    }

    const basePrompt = String(
      (promptOverride && promptOverride.trim()) ||
        (metaPromptOverride && metaPromptOverride.trim()) ||
        safeConfig.basePrompt,
    ).trim();
    const negativePrompt = String(
      (negativeOverride && negativeOverride.trim()) ||
        (metaNegativeOverride && metaNegativeOverride.trim()) ||
        safeConfig.negativePrompt,
    ).trim();

    const angle = typeof slotMeta.angle === "string" ? String(slotMeta.angle).trim() : "";
    const finalPrompt =
      angle && !basePrompt.toLowerCase().includes("camera angle")
        ? `${basePrompt} | camera angle: ${angle} | consistent product, same design, same materials`
        : basePrompt;

    const admin = (req as any).adminUser;
    const record = await generateAndStoreImage({
      namespace: "products",
      assetKey: String(slot.assetKey),
      prompt: finalPrompt,
      negativePrompt,
      mode,
      input: { aspect_ratio: safeConfig.defaults.aspect, output_format: "png" },
      setActive,
      createdBy: admin?.id ? `admin:${admin.id}` : undefined,
    });

    if (setActive) {
      await syncProductImagesArray({ tenantId, tenantKey, productId, categorySlug });
    }

    return res.json({ ok: true, slotId: slot.id, assetKey: slot.assetKey, image: record });
  } catch (err: any) {
    const message = String(err?.message || "");
    if (message === "Unknown tenantKey") return res.status(404).json({ message });
    if (message === "tenant required") return res.status(400).json({ message });
    return res.status(500).json({ message: message || "Generate failed" });
  }
});

router.post("/api/admin/products/:id/images/generate-set", async (req: any, res) => {
  try {
    const { tenantId, tenantKey } = await resolveTenantScopeFromRequest(req);

    const productId = toInt(req.params.id);
    if (!productId) return res.status(400).json({ message: "Invalid product id" });

    const count = Math.min(Math.max(toInt(req.body?.count) ?? 8, 1), 12);
    const setActive = Boolean(req.body?.setActive);
    const mode = (req.body?.mode as any) || "quality";

    const [product] = await db
      .select()
      .from(sellerProducts)
      .where(and(eq(sellerProducts.id, productId), eq(sellerProducts.tenantId, tenantId)));
    if (!product) return res.status(404).json({ message: "Product not found" });

    const category =
      product.categoryId != null
        ? await db.query.productCategories.findFirst({
            where: and(eq(productCategories.tenantId, tenantId), eq(productCategories.id, Number(product.categoryId))),
          })
        : null;
    const categorySlug = category?.slug || "general";

    const attrs = normalizeObject(product.attributes) || {};
    const imageGen = normalizeObject((attrs as any).imageGen) || {};

    const requestedPreset = String(req.body?.preset || req.body?.anglesPreset || "").trim().toLowerCase();
    const { defaults, basePrompt, negativePrompt, preset } = selectSafeProductImageConfig({
      tenantKey,
      product,
      category,
      imageGen,
      requestedBasePrompt: typeof req.body?.basePrompt === "string" ? req.body.basePrompt : null,
      requestedNegativePrompt: typeof req.body?.negativePrompt === "string" ? req.body.negativePrompt : null,
      requestedPreset,
    });

    const desired = buildAnglePreset(preset as any, count);
    await db
      .update(sellerProducts)
      .set({
        attributes: {
          ...attrs,
          imageGen: {
            ...imageGen,
            basePrompt,
            negativePrompt,
            preset,
            updatedAt: new Date().toISOString(),
          },
        },
        updatedAt: new Date(),
      } as any)
      .where(and(eq(sellerProducts.id, productId), eq(sellerProducts.tenantId, tenantId)));

    const ensured = await ensureProductSlots({
      tenantId,
      tenantKey,
      productId,
      categorySlug,
      desired,
    });

    const byAssetKey = new Map(ensured.slots.map((s: any) => [String(s.assetKey), s]));
    const admin = (req as any).adminUser;

    const results: any[] = [];
    for (const slotDescriptor of desired) {
      const slotKey =
        slotDescriptor.slotKey === "primary"
          ? ensured.primaryAssetKey
          : `${tenantKey}/${categorySlug}/${productId}/${String(slotDescriptor.slotKey).toLowerCase()}`;
      const slot = byAssetKey.get(slotKey);
      if (!slot) continue;
      const angle = slotDescriptor.angle || "";
      const prompt = angle ? `${basePrompt} | camera angle: ${angle} | consistent product, same design, same materials` : basePrompt;
      const record = await generateAndStoreImage({
        namespace: "products",
        assetKey: String(slot.assetKey),
        prompt,
        negativePrompt,
        mode,
        input: { aspect_ratio: defaults.aspect, output_format: "png" },
        setActive,
        createdBy: admin?.id ? `admin:${admin.id}` : undefined,
      });
      results.push({ slotId: slot.id, assetKey: slot.assetKey, image: record });
    }

    if (setActive) {
      await syncProductImagesArray({ tenantId, tenantKey, productId, categorySlug });
    }

    return res.json({ ok: true, productId, preset, count, setActive, results });
  } catch (err: any) {
    const message = String(err?.message || "");
    if (message === "Unknown tenantKey") return res.status(404).json({ message });
    if (message === "tenant required") return res.status(400).json({ message });
    return res.status(500).json({ message: message || "Generate set failed" });
  }
});

router.post("/api/admin/products/:id/images/set-primary", async (req: any, res) => {
  try {
    const { tenantId, tenantKey } = await resolveTenantScopeFromRequest(req);

    const productId = toInt(req.params.id);
    if (!productId) return res.status(400).json({ message: "Invalid product id" });

    const imageId = String(req.body?.imageId || "").trim();
    if (!imageId) return res.status(400).json({ message: "imageId required" });

    const [product] = await db
      .select()
      .from(sellerProducts)
      .where(and(eq(sellerProducts.id, productId), eq(sellerProducts.tenantId, tenantId)));
    if (!product) return res.status(404).json({ message: "Product not found" });

    const category =
      product.categoryId != null
        ? await db.query.productCategories.findFirst({
            where: and(eq(productCategories.tenantId, tenantId), eq(productCategories.id, Number(product.categoryId))),
          })
        : null;
    const categorySlug = category?.slug || "general";

    const primaryAssetKey = getProductPrimaryAssetKey({ tenantKey, categorySlug, productId });
    const applied = await applyImageToAsset({ imageId, namespace: "products", targetAssetKey: primaryAssetKey, setActive: true });
    await syncProductImagesArray({ tenantId, tenantKey, productId, categorySlug });

    return res.json({ ok: true, primaryAssetKey, image: applied.image, asset: applied.asset });
  } catch (err: any) {
    const message = String(err?.message || "");
    if (message === "Unknown tenantKey") return res.status(404).json({ message });
    if (message === "tenant required") return res.status(400).json({ message });
    return res.status(500).json({ message: message || "Set primary failed" });
  }
});

router.post("/api/admin/products/:id/images/reorder", async (req: any, res) => {
  try {
    const { tenantId, tenantKey } = await resolveTenantScopeFromRequest(req);

    const productId = toInt(req.params.id);
    if (!productId) return res.status(400).json({ message: "Invalid product id" });

    const ordered = Array.isArray(req.body?.orderedImageIds)
      ? (req.body.orderedImageIds as unknown[]).map((x) => String(x)).filter(Boolean)
      : Array.isArray(req.body?.orderedProductImageIds)
        ? (req.body.orderedProductImageIds as unknown[]).map((x) => String(x)).filter(Boolean)
        : [];

    const [product] = await db
      .select({ categoryId: sellerProducts.categoryId })
      .from(sellerProducts)
      .where(and(eq(sellerProducts.id, productId), eq(sellerProducts.tenantId, tenantId)));
    if (!product) return res.status(404).json({ message: "Product not found" });

    const category =
      product.categoryId != null
        ? await db.query.productCategories.findFirst({
            where: and(eq(productCategories.tenantId, tenantId), eq(productCategories.id, Number(product.categoryId))),
          })
        : null;
    const categorySlug = category?.slug || "general";

    const rows = await db
      .select()
      .from(productImages)
      .where(and(eq(productImages.tenantId, tenantId), eq(productImages.productId, productId), isNull(productImages.deletedAt)))
      .orderBy(asc(productImages.position));

    const primaryAssetKey = getProductPrimaryAssetKey({ tenantKey, categorySlug, productId });
    const primary = rows.find((r: any) => String(r.assetKey) === primaryAssetKey) || rows.find((r: any) => r.role === "primary") || null;

    const byId = new Map(rows.map((r: any) => [String(r.id), r]));
    const filtered = ordered.filter((id) => byId.has(id) && (!primary || id !== String(primary.id)));

    const remaining = rows
      .map((r: any) => String(r.id))
      .filter((id) => id && (!primary || id !== String(primary.id)) && !filtered.includes(id));

    const finalOrder = [...filtered, ...remaining];

    let pos = 0;
    if (primary) {
      await db
        .update(productImages)
        .set({ position: 0, updatedAt: new Date() })
        .where(and(eq(productImages.id, primary.id), eq(productImages.tenantId, tenantId)));
      pos = 1;
    }

    for (const id of finalOrder) {
      await db
        .update(productImages)
        .set({ position: pos, updatedAt: new Date() })
        .where(and(eq(productImages.id, id), eq(productImages.tenantId, tenantId)));
      pos += 1;
    }

    await syncProductImagesArray({ tenantId, tenantKey, productId, categorySlug });
    return res.json({ ok: true, total: rows.length });
  } catch (err: any) {
    const message = String(err?.message || "");
    if (message === "Unknown tenantKey") return res.status(404).json({ message });
    if (message === "tenant required") return res.status(400).json({ message });
    return res.status(500).json({ message: message || "Reorder failed" });
  }
});

router.delete("/api/admin/products/:id/images/:imageId", async (req: any, res) => {
  try {
    const { tenantId, tenantKey } = await resolveTenantScopeFromRequest(req);

    const productId = toInt(req.params.id);
    if (!productId) return res.status(400).json({ message: "Invalid product id" });

    const slotId = String(req.params.imageId || "").trim();
    if (!slotId) return res.status(400).json({ message: "imageId required" });

    const [product] = await db
      .select({ categoryId: sellerProducts.categoryId })
      .from(sellerProducts)
      .where(and(eq(sellerProducts.id, productId), eq(sellerProducts.tenantId, tenantId)));
    if (!product) return res.status(404).json({ message: "Product not found" });

    const category =
      product.categoryId != null
        ? await db.query.productCategories.findFirst({
            where: and(eq(productCategories.tenantId, tenantId), eq(productCategories.id, Number(product.categoryId))),
          })
        : null;
    const categorySlug = category?.slug || "general";

    const slot = await db.query.productImages.findFirst({
      where: and(
        eq(productImages.id, slotId),
        eq(productImages.tenantId, tenantId),
        eq(productImages.productId, productId),
        isNull(productImages.deletedAt),
      ),
    });
    if (!slot) return res.status(404).json({ message: "Slot not found" });

    const primaryAssetKey = getProductPrimaryAssetKey({ tenantKey, categorySlug, productId });
    if (slot.role === "primary" || String(slot.assetKey) === primaryAssetKey || Number(slot.position) === 0) {
      return res.status(400).json({ message: "Cannot delete primary image slot" });
    }

    await db
      .update(productImages)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(productImages.id, slotId), eq(productImages.tenantId, tenantId)));

    await syncProductImagesArray({ tenantId, tenantKey, productId, categorySlug });
    return res.json({ ok: true });
  } catch (err: any) {
    const message = String(err?.message || "");
    if (message === "Unknown tenantKey") return res.status(404).json({ message });
    if (message === "tenant required") return res.status(400).json({ message });
    return res.status(500).json({ message: message || "Delete failed" });
  }
});

// Seller product image slot routes (same features as admin, but ownership-gated).
router.get("/api/seller/products/:id/images", async (req: any, res) => {
  try {
    const productId = toInt(req.params.id);
    if (!productId) return res.status(400).json({ message: "Invalid product id" });

    const access = await requireSellerProductAccess(req, res, productId);
    if (!access) return;

    const { tenantId, tenantKey, product } = access;

    const category =
      product.categoryId != null
        ? await db.query.productCategories.findFirst({
            where: and(eq(productCategories.tenantId, tenantId), eq(productCategories.id, Number(product.categoryId))),
          })
        : null;

    const categorySlug = category?.slug || "general";

    const attrs = normalizeObject(product.attributes) || {};
    const imageGen = normalizeObject((attrs as any).imageGen) || {};
    const { defaults, basePrompt, negativePrompt, preset } = selectSafeProductImageConfig({
      tenantKey,
      product,
      category,
      imageGen,
    });

    const desiredCountRaw =
      typeof imageGen.count === "number"
        ? imageGen.count
        : typeof imageGen.count === "string"
          ? parseInt(imageGen.count, 10)
          : null;
    const desiredCount = Math.min(Math.max(Number(desiredCountRaw) || 8, 1), 12);
    const desired = buildAnglePreset(preset as any, desiredCount);

    let ensured = await ensureProductSlots({
      tenantId,
      tenantKey,
      productId,
      categorySlug,
    });
    if ((ensured.slots?.length ?? 0) <= 1) {
      ensured = await ensureProductSlots({
        tenantId,
        tenantKey,
        productId,
        categorySlug,
        desired,
      });
    }

    const { primaryAssetKey, slots } = ensured;

    const resolved = await resolveSlotActives({
      slots: slots.map((s: any) => ({ assetNamespace: String(s.assetNamespace), assetKey: String(s.assetKey) })),
    });

    return res.json({
      ok: true,
      tenantKey,
      productId,
      categorySlug,
      basePrompt,
      negativePrompt,
      aspect: defaults.aspect,
      modelTier: defaults.modelTier,
      primaryAssetKey,
      slots: slots.map((slot: any) => {
        const active = resolved.get(String(slot.assetKey)) || { url: null, updatedAt: null, activeImageId: null };
        return {
          id: slot.id,
          role: slot.role,
          position: slot.position,
          label: slot.label,
          assetNamespace: slot.assetNamespace,
          assetKey: slot.assetKey,
          metadata: slot.metadata,
          active,
        };
      }),
    });
  } catch (err: any) {
    return res.status(500).json({ message: String(err?.message || "Failed to load product images") });
  }
});

router.post("/api/seller/products/:id/images/suggest-prompt", async (req: any, res) => {
  try {
    const productId = toInt(req.params.id);
    if (!productId) return res.status(400).json({ message: "Invalid product id" });

    const access = await requireSellerProductAccess(req, res, productId);
    if (!access) return;

    const { tenantId, tenantKey, product, seller } = access;

    const category =
      product.categoryId != null
        ? await db.query.productCategories.findFirst({
            where: and(eq(productCategories.tenantId, tenantId), eq(productCategories.id, Number(product.categoryId))),
          })
        : null;

    const attrs = normalizeObject(product.attributes) || {};
    const imageGen = normalizeObject((attrs as any).imageGen) || {};
    const { basePrompt: safeBasePrompt, negativePrompt: safeNegativePrompt } = selectSafeProductImageConfig({
      tenantKey,
      product,
      category,
      imageGen,
      requestedBasePrompt: typeof req.body?.currentPrompt === "string" ? req.body.currentPrompt : null,
      requestedNegativePrompt: typeof req.body?.negativePrompt === "string" ? req.body.negativePrompt : null,
    });
    const languageHint = String(req.body?.language || "fr").trim();
    const fallbackPrompt = safeBasePrompt;
    const fallbackNegative = safeNegativePrompt;

    if (!isAiEnabled()) {
      return res.json({ ok: false, prompt: fallbackPrompt, negativePrompt: fallbackNegative, reason: "AI_DISABLED" });
    }

    const requester = (req as any).tenantUser;
    const requesterLabel = requester?.displayName || requester?.email || `seller:${requester?.id ?? "anon"}`;

    const message = `Suggest a SINGLE high-quality product image prompt for marketplace generation.

Output rules:
- Return ONLY the prompt text (no markdown, no bullets, no quotes)
- Keep it under 380 characters
- No readable text, no logos, no watermarks
- Product must match the listing exactly and stay realistic

Context:
- Tenant: ${tenantKey}
- Seller shop: ${String(seller?.shopName || "").trim() || "unknown"}
- Product: ${String(product?.name || "").trim() || "Product"}
- Category: ${String(category?.name || category?.slug || "general")}
- Short description: ${String(product?.shortDescription || "").trim() || "n/a"}
- Description: ${String(product?.description || "").trim() || "n/a"}
- Current prompt: ${fallbackPrompt}
- Requested language style: ${languageHint}
- Requested by: ${requesterLabel}`;

    try {
      const ai = await generateAgentResponse(message, {
        role: "You write concise, accurate e-commerce image prompts for marketplace products.",
        context: {
          recentMessages: [],
          roomName: "Seller Product Prompt Suggestion",
          roomType: "seller-product-prompt-suggestion",
        },
      });

      const cleaned = cleanModelText(ai?.response);
      return res.json({
        ok: true,
        prompt: cleaned || fallbackPrompt,
        negativePrompt: fallbackNegative,
      });
    } catch (err: any) {
      return res.json({
        ok: false,
        prompt: fallbackPrompt,
        negativePrompt: fallbackNegative,
        reason: err?.message || "AI_FAILED",
      });
    }
  } catch (err: any) {
    return res.status(500).json({ message: String(err?.message || "Failed to suggest prompt") });
  }
});

router.get("/api/seller/products/:id/images/suggestions", async (req: any, res) => {
  try {
    const productId = toInt(req.params.id);
    if (!productId) return res.status(400).json({ message: "Invalid product id" });

    const access = await requireSellerProductAccess(req, res, productId);
    if (!access) return;

    const { tenantId, tenantKey, product } = access;
    const category =
      product.categoryId != null
        ? await db.query.productCategories.findFirst({
            where: and(eq(productCategories.tenantId, tenantId), eq(productCategories.id, Number(product.categoryId))),
          })
        : null;

    const limit = Math.min(Math.max(toInt(req.query.limit) ?? 6, 1), 12);
    const suggestions = await getSellerProductImageSuggestions({
      req,
      tenantId,
      tenantKey,
      product,
      category,
      limit,
    });

    return res.json({ ok: true, productId, suggestions });
  } catch (err: any) {
    return res.status(500).json({ message: String(err?.message || "Failed to load suggestions") });
  }
});

router.post("/api/seller/products/:id/images/update-settings", async (req: any, res) => {
  try {
    const productId = toInt(req.params.id);
    if (!productId) return res.status(400).json({ message: "Invalid product id" });

    const access = await requireSellerProductAccess(req, res, productId);
    if (!access) return;

    const { tenantId, product } = access;

    const basePrompt = typeof req.body?.basePrompt === "string" ? req.body.basePrompt.trim() : "";
    const negativePrompt = typeof req.body?.negativePrompt === "string" ? req.body.negativePrompt.trim() : "";

    const attrs = normalizeObject(product.attributes) || {};
    const nextImageGen = {
      ...(normalizeObject((attrs as any).imageGen) || {}),
      ...(basePrompt ? { basePrompt } : {}),
      ...(negativePrompt ? { negativePrompt } : {}),
      updatedAt: new Date().toISOString(),
    };

    await db
      .update(sellerProducts)
      .set({ attributes: { ...attrs, imageGen: nextImageGen }, updatedAt: new Date() } as any)
      .where(and(eq(sellerProducts.id, productId), eq(sellerProducts.tenantId, tenantId)));

    return res.json({ ok: true });
  } catch (err: any) {
    return res.status(500).json({ message: String(err?.message || "Failed to update product image settings") });
  }
});

router.post("/api/seller/products/:id/images/update-slot", async (req: any, res) => {
  try {
    const productId = toInt(req.params.id);
    if (!productId) return res.status(400).json({ message: "Invalid product id" });

    const access = await requireSellerProductAccess(req, res, productId);
    if (!access) return;

    const { tenantId, tenantKey, product } = access;

    const slotId = typeof req.body?.slotId === "string" ? req.body.slotId.trim() : "";
    if (!slotId) return res.status(400).json({ message: "slotId required" });

    const promptOverrideRaw = typeof req.body?.promptOverride === "string" ? req.body.promptOverride.trim() : null;
    const negativePromptOverrideRaw =
      typeof req.body?.negativePromptOverride === "string" ? req.body.negativePromptOverride.trim() : null;
    const angleRaw = typeof req.body?.angle === "string" ? req.body.angle.trim() : null;
    const labelRaw = typeof req.body?.label === "string" ? req.body.label.trim() : null;

    if (promptOverrideRaw != null && promptOverrideRaw.length > PROMPT_LIMIT) {
      return res.status(400).json({ message: "promptOverride too long" });
    }
    if (negativePromptOverrideRaw != null && negativePromptOverrideRaw.length > PROMPT_LIMIT) {
      return res.status(400).json({ message: "negativePromptOverride too long" });
    }

    const slot = await db.query.productImages.findFirst({
      where: and(
        eq(productImages.id, slotId),
        eq(productImages.tenantId, tenantId),
        eq(productImages.productId, productId),
        isNull(productImages.deletedAt),
      ),
    });
    if (!slot) return res.status(404).json({ message: "slot not found" });

    const baseMeta = normalizeObject(slot.metadata) || {};
    const nextMeta: Record<string, any> = { ...baseMeta };

    if (promptOverrideRaw != null) {
      if (promptOverrideRaw) nextMeta.promptOverride = promptOverrideRaw;
      else delete nextMeta.promptOverride;
    }
    if (negativePromptOverrideRaw != null) {
      if (negativePromptOverrideRaw) nextMeta.negativePromptOverride = negativePromptOverrideRaw;
      else delete nextMeta.negativePromptOverride;
    }
    if (angleRaw != null) {
      if (angleRaw) nextMeta.angle = angleRaw;
      else delete nextMeta.angle;
    }

    const update: any = {
      metadata: nextMeta,
      updatedAt: new Date(),
    };

    if (labelRaw != null) {
      update.label = labelRaw || null;
    }

    await db.update(productImages).set(update).where(eq(productImages.id, slot.id));

    if (labelRaw != null) {
      const category =
        product.categoryId != null
          ? await db.query.productCategories.findFirst({
              where: and(eq(productCategories.tenantId, tenantId), eq(productCategories.id, Number(product.categoryId))),
            })
          : null;
      const categorySlug = category?.slug || "general";

      await syncProductImagesArray({ tenantId, tenantKey, productId, categorySlug });
    }

    return res.json({
      ok: true,
      slotId: slot.id,
      label: labelRaw != null ? (labelRaw || null) : slot.label,
      metadata: nextMeta,
    });
  } catch (err: any) {
    return res.status(500).json({ message: String(err?.message || "Failed to update slot") });
  }
});

router.post("/api/seller/products/:id/images/generate-one", async (req: any, res) => {
  try {
    const productId = toInt(req.params.id);
    if (!productId) return res.status(400).json({ message: "Invalid product id" });

    const access = await requireSellerProductAccess(req, res, productId);
    if (!access) return;

    const { tenantId, tenantKey, product } = access;

    const user = (req as any).tenantUser;
    checkLimit(user?.id ? `seller:${user.id}` : "seller:anon", DAILY_SELLER_LIMIT);

    const slotId =
      typeof req.body?.slotId === "string"
        ? req.body.slotId
        : typeof req.body?.productImageId === "string"
          ? req.body.productImageId
          : null;
    const setActive = Boolean(req.body?.setActive);
    const mode = (req.body?.mode as any) || "quality";
    const promptOverride = typeof req.body?.prompt === "string" ? req.body.prompt.trim() : null;
    const negativeOverride = typeof req.body?.negativePrompt === "string" ? req.body.negativePrompt.trim() : null;

    const category =
      product.categoryId != null
        ? await db.query.productCategories.findFirst({
            where: and(eq(productCategories.tenantId, tenantId), eq(productCategories.id, Number(product.categoryId))),
          })
        : null;
    const categorySlug = category?.slug || "general";

    const attrs = normalizeObject(product.attributes) || {};
    const imageGen = normalizeObject((attrs as any).imageGen) || {};
    const safeConfig = selectSafeProductImageConfig({
      tenantKey,
      product,
      category,
      imageGen,
    });

    await ensureProductSlots({ tenantId, tenantKey, productId, categorySlug });

    let slot: any = null;
    if (slotId) {
      slot = await db.query.productImages.findFirst({
        where: and(
          eq(productImages.id, slotId),
          eq(productImages.tenantId, tenantId),
          eq(productImages.productId, productId),
          isNull(productImages.deletedAt),
        ),
      });
    }

    if (!slot) {
      return res.status(400).json({ message: "slotId required" });
    }

    const slotMeta = normalizeObject(slot.metadata) || {};
    const metaPromptOverride = typeof slotMeta.promptOverride === "string" ? slotMeta.promptOverride.trim() : "";
    const metaNegativeOverride = typeof slotMeta.negativePromptOverride === "string" ? slotMeta.negativePromptOverride.trim() : "";

    if (promptOverride != null && promptOverride.length > PROMPT_LIMIT) {
      return res.status(400).json({ message: "prompt too long" });
    }
    if (negativeOverride != null && negativeOverride.length > PROMPT_LIMIT) {
      return res.status(400).json({ message: "negativePrompt too long" });
    }
    if (metaPromptOverride.length > PROMPT_LIMIT) {
      return res.status(400).json({ message: "slot promptOverride too long" });
    }
    if (metaNegativeOverride.length > PROMPT_LIMIT) {
      return res.status(400).json({ message: "slot negativePromptOverride too long" });
    }

    const basePrompt = String(
      (promptOverride && promptOverride.trim()) ||
        (metaPromptOverride && metaPromptOverride.trim()) ||
        safeConfig.basePrompt,
    ).trim();
    const negativePrompt = String(
      (negativeOverride && negativeOverride.trim()) ||
        (metaNegativeOverride && metaNegativeOverride.trim()) ||
        safeConfig.negativePrompt,
    ).trim();

    const angle = typeof slotMeta.angle === "string" ? String(slotMeta.angle).trim() : "";
    const finalPrompt =
      angle && !basePrompt.toLowerCase().includes("camera angle")
        ? `${basePrompt} | camera angle: ${angle} | consistent product, same design, same materials`
        : basePrompt;

    const record = await generateAndStoreImage({
      namespace: "products",
      assetKey: String(slot.assetKey),
      prompt: finalPrompt,
      negativePrompt,
      mode,
      input: { aspect_ratio: safeConfig.defaults.aspect, output_format: "png" },
      setActive,
      createdBy: user?.id ? `user:${user.id}` : undefined,
    });

    if (setActive) {
      await syncProductImagesArray({ tenantId, tenantKey, productId, categorySlug });
    }

    return res.json({ ok: true, slotId: slot.id, assetKey: slot.assetKey, image: record });
  } catch (err: any) {
    return res.status(500).json({ message: String(err?.message || "Generate failed") });
  }
});

router.post("/api/seller/products/:id/images/generate-set", async (req: any, res) => {
  try {
    const productId = toInt(req.params.id);
    if (!productId) return res.status(400).json({ message: "Invalid product id" });

    const access = await requireSellerProductAccess(req, res, productId);
    if (!access) return;

    const { tenantId, tenantKey, product } = access;

    const user = (req as any).tenantUser;
    checkLimit(user?.id ? `seller:${user.id}` : "seller:anon", DAILY_SELLER_LIMIT);

    const count = Math.min(Math.max(toInt(req.body?.count) ?? 8, 1), 12);
    const setActive = Boolean(req.body?.setActive);
    const mode = (req.body?.mode as any) || "quality";

    const category =
      product.categoryId != null
        ? await db.query.productCategories.findFirst({
            where: and(eq(productCategories.tenantId, tenantId), eq(productCategories.id, Number(product.categoryId))),
          })
        : null;
    const categorySlug = category?.slug || "general";

    const attrs = normalizeObject(product.attributes) || {};
    const imageGen = normalizeObject((attrs as any).imageGen) || {};

    const requestedPreset = String(req.body?.preset || req.body?.anglesPreset || "").trim().toLowerCase();
    const { defaults, basePrompt, negativePrompt, preset } = selectSafeProductImageConfig({
      tenantKey,
      product,
      category,
      imageGen,
      requestedBasePrompt: typeof req.body?.basePrompt === "string" ? req.body.basePrompt : null,
      requestedNegativePrompt: typeof req.body?.negativePrompt === "string" ? req.body.negativePrompt : null,
      requestedPreset,
    });

    const desired = buildAnglePreset(preset as any, count);
    await db
      .update(sellerProducts)
      .set({
        attributes: {
          ...attrs,
          imageGen: {
            ...imageGen,
            basePrompt,
            negativePrompt,
            preset,
            updatedAt: new Date().toISOString(),
          },
        },
        updatedAt: new Date(),
      } as any)
      .where(and(eq(sellerProducts.id, productId), eq(sellerProducts.tenantId, tenantId)));

    const ensured = await ensureProductSlots({
      tenantId,
      tenantKey,
      productId,
      categorySlug,
      desired,
    });

    const byAssetKey = new Map(ensured.slots.map((s: any) => [String(s.assetKey), s]));

    const results: any[] = [];
    for (const slotDescriptor of desired) {
      const slotKey =
        slotDescriptor.slotKey === "primary"
          ? ensured.primaryAssetKey
          : `${tenantKey}/${categorySlug}/${productId}/${String(slotDescriptor.slotKey).toLowerCase()}`;
      const slot = byAssetKey.get(slotKey);
      if (!slot) continue;
      const angle = slotDescriptor.angle || "";
      const prompt = angle ? `${basePrompt} | camera angle: ${angle} | consistent product, same design, same materials` : basePrompt;
      const record = await generateAndStoreImage({
        namespace: "products",
        assetKey: String(slot.assetKey),
        prompt,
        negativePrompt,
        mode,
        input: { aspect_ratio: defaults.aspect, output_format: "png" },
        setActive,
        createdBy: user?.id ? `user:${user.id}` : undefined,
      });
      results.push({ slotId: slot.id, assetKey: slot.assetKey, image: record });
    }

    if (setActive) {
      await syncProductImagesArray({ tenantId, tenantKey, productId, categorySlug });
    }

    return res.json({ ok: true, productId, preset, count, setActive, results });
  } catch (err: any) {
    return res.status(500).json({ message: String(err?.message || "Generate set failed") });
  }
});

router.post("/api/seller/products/:id/images/apply-suggestion", async (req: any, res) => {
  try {
    const productId = toInt(req.params.id);
    if (!productId) return res.status(400).json({ message: "Invalid product id" });

    const access = await requireSellerProductAccess(req, res, productId);
    if (!access) return;

    const { tenantId, tenantKey, product } = access;
    const imageId = String(req.body?.imageId || "").trim();
    const slotId = String(req.body?.slotId || "").trim();
    if (!imageId) return res.status(400).json({ message: "imageId required" });

    const category =
      product.categoryId != null
        ? await db.query.productCategories.findFirst({
            where: and(eq(productCategories.tenantId, tenantId), eq(productCategories.id, Number(product.categoryId))),
          })
        : null;
    const categorySlug = category?.slug || "general";
    const primaryAssetKey = getProductPrimaryAssetKey({ tenantKey, categorySlug, productId });

    let targetAssetKey = primaryAssetKey;
    if (slotId) {
      const slot = await db.query.productImages.findFirst({
        where: and(
          eq(productImages.id, slotId),
          eq(productImages.tenantId, tenantId),
          eq(productImages.productId, productId),
          isNull(productImages.deletedAt),
        ),
      });
      if (!slot) return res.status(404).json({ message: "Slot not found" });
      targetAssetKey = String(slot.assetKey);
    }

    const allowedSuggestions = await getSellerProductImageSuggestions({
      req,
      tenantId,
      tenantKey,
      product,
      category,
      limit: 24,
    });
    const isAllowed = allowedSuggestions.some((entry) => String(entry.imageId) === imageId);
    if (!isAllowed) {
      return res.status(422).json({ message: "Suggested image no longer matches this product" });
    }

    const applied = await applyImageToAsset({
      imageId,
      namespace: "products",
      targetAssetKey,
      setActive: true,
    });

    await syncProductImagesArray({ tenantId, tenantKey, productId, categorySlug });
    return res.json({ ok: true, targetAssetKey, applied });
  } catch (err: any) {
    return res.status(500).json({ message: String(err?.message || "Failed to apply suggestion") });
  }
});

router.post("/api/seller/products/:id/images/enhance", async (req: any, res) => {
  try {
    const productId = toInt(req.params.id);
    if (!productId) return res.status(400).json({ message: "Invalid product id" });

    const access = await requireSellerProductAccess(req, res, productId);
    if (!access) return;

    const { tenantId, tenantKey, product } = access;
    const user = (req as any).tenantUser;
    checkLimit(user?.id ? `seller:${user.id}` : "seller:anon", DAILY_SELLER_LIMIT);

    const slotId = String(req.body?.slotId || "").trim();
    if (!slotId) return res.status(400).json({ message: "slotId required" });

    const mode = (req.body?.mode as any) || "quality";

    const category =
      product.categoryId != null
        ? await db.query.productCategories.findFirst({
            where: and(eq(productCategories.tenantId, tenantId), eq(productCategories.id, Number(product.categoryId))),
          })
        : null;
    const categorySlug = category?.slug || "general";

    const slot = await db.query.productImages.findFirst({
      where: and(
        eq(productImages.id, slotId),
        eq(productImages.tenantId, tenantId),
        eq(productImages.productId, productId),
        isNull(productImages.deletedAt),
      ),
    });
    if (!slot) return res.status(404).json({ message: "Slot not found" });

    const defaults = buildProductPrompt({ tenantKey, product, category });
    const attrs = normalizeObject(product.attributes) || {};
    const imageGen = normalizeObject((attrs as any).imageGen) || {};
    const slotMeta = normalizeObject(slot.metadata) || {};

    const basePrompt = String(
      req.body?.prompt ||
        slotMeta.promptOverride ||
        imageGen.basePrompt ||
        defaults.prompt,
    ).trim();
    const baseNegativePrompt = String(
      req.body?.negativePrompt ||
        slotMeta.negativePromptOverride ||
        imageGen.negativePrompt ||
        defaults.negativePrompt,
    ).trim();

    const finalPrompt = `${basePrompt} | enhance uploaded product photo | preserve exact product identity | improve sharpness, lighting, and marketplace readiness`;
    const finalNegativePrompt = `${baseNegativePrompt}, blur, low detail, artifacts, unrealistic materials`;

    const asset = await db.query.imageAssets.findFirst({
      where: and(
        eq(imageAssets.namespace, "products"),
        eq(imageAssets.assetKey, String(slot.assetKey)),
        eq(imageAssets.variant, normalizeVariant(undefined)),
      ),
    });
    if (!asset?.activeImageId) {
      return res.status(400).json({ message: "Upload or generate an image in this slot before enhancement" });
    }

    const source = await db.query.generatedImages.findFirst({ where: eq(generatedImages.id, String(asset.activeImageId)) });
    if (!source?.storedUrl) {
      return res.status(400).json({ message: "Active source image not found for this slot" });
    }

    const absoluteSourceUrl = toPublicUrl(req, source.storedUrl);

    const baseInput: Record<string, any> = { aspect_ratio: defaults.aspect, output_format: "png" };
    let usedReferenceImage = false;
    let record: any;

    try {
      if (absoluteSourceUrl && /^https?:\/\//i.test(absoluteSourceUrl)) {
        record = await generateAndStoreImage({
          namespace: "products",
          assetKey: String(slot.assetKey),
          prompt: finalPrompt,
          negativePrompt: finalNegativePrompt,
          mode,
          input: {
            ...baseInput,
            image: absoluteSourceUrl,
            prompt_strength: 0.35,
          },
          setActive: true,
          createdBy: user?.id ? `user:${user.id}` : undefined,
        });
        usedReferenceImage = true;
      } else {
        record = await generateAndStoreImage({
          namespace: "products",
          assetKey: String(slot.assetKey),
          prompt: finalPrompt,
          negativePrompt: finalNegativePrompt,
          mode,
          input: baseInput,
          setActive: true,
          createdBy: user?.id ? `user:${user.id}` : undefined,
        });
      }
    } catch (firstErr: any) {
      if (!absoluteSourceUrl || !/^https?:\/\//i.test(absoluteSourceUrl)) throw firstErr;
      record = await generateAndStoreImage({
        namespace: "products",
        assetKey: String(slot.assetKey),
        prompt: finalPrompt,
        negativePrompt: finalNegativePrompt,
        mode,
        input: baseInput,
        setActive: true,
        createdBy: user?.id ? `user:${user.id}` : undefined,
      });
      usedReferenceImage = false;
    }

    await syncProductImagesArray({ tenantId, tenantKey, productId, categorySlug });
    return res.json({ ok: true, slotId: slot.id, usedReferenceImage, image: record });
  } catch (err: any) {
    return res.status(500).json({ message: String(err?.message || "Enhancement failed") });
  }
});

router.post("/api/seller/products/:id/images/set-primary", async (req: any, res) => {
  try {
    const productId = toInt(req.params.id);
    if (!productId) return res.status(400).json({ message: "Invalid product id" });

    const access = await requireSellerProductAccess(req, res, productId);
    if (!access) return;

    const { tenantId, tenantKey, product } = access;

    const imageId = String(req.body?.imageId || "").trim();
    if (!imageId) return res.status(400).json({ message: "imageId required" });

    const category =
      product.categoryId != null
        ? await db.query.productCategories.findFirst({
            where: and(eq(productCategories.tenantId, tenantId), eq(productCategories.id, Number(product.categoryId))),
          })
        : null;
    const categorySlug = category?.slug || "general";

    const primaryAssetKey = getProductPrimaryAssetKey({ tenantKey, categorySlug, productId });
    const applied = await applyImageToAsset({ imageId, namespace: "products", targetAssetKey: primaryAssetKey, setActive: true });
    await syncProductImagesArray({ tenantId, tenantKey, productId, categorySlug });

    return res.json({ ok: true, assetKey: primaryAssetKey, applied });
  } catch (err: any) {
    return res.status(500).json({ message: String(err?.message || "Set primary failed") });
  }
});

router.post("/api/seller/products/:id/images/reorder", async (req: any, res) => {
  try {
    const productId = toInt(req.params.id);
    if (!productId) return res.status(400).json({ message: "Invalid product id" });

    const access = await requireSellerProductAccess(req, res, productId);
    if (!access) return;

    const { tenantId, tenantKey, product } = access;

    const ordered: string[] = Array.isArray(req.body?.orderedImageIds)
      ? (req.body.orderedImageIds as unknown[]).map((x) => String(x)).filter(Boolean)
      : Array.isArray(req.body?.orderedProductImageIds)
        ? (req.body.orderedProductImageIds as unknown[]).map((x) => String(x)).filter(Boolean)
        : [];

    const category =
      product.categoryId != null
        ? await db.query.productCategories.findFirst({
            where: and(eq(productCategories.tenantId, tenantId), eq(productCategories.id, Number(product.categoryId))),
          })
        : null;
    const categorySlug = category?.slug || "general";

    const rows = await db
      .select()
      .from(productImages)
      .where(and(eq(productImages.tenantId, tenantId), eq(productImages.productId, productId), isNull(productImages.deletedAt)))
      .orderBy(asc(productImages.position));

    const primaryAssetKey = getProductPrimaryAssetKey({ tenantKey, categorySlug, productId });
    const primary =
      rows.find((r: any) => String(r.assetKey) === primaryAssetKey) || rows.find((r: any) => r.role === "primary") || null;

    const byId = new Map(rows.map((r: any) => [String(r.id), r]));
    const filtered = ordered.filter((id) => byId.has(id) && (!primary || id !== String(primary.id)));

    const remaining = rows
      .map((r: any) => String(r.id))
      .filter((id) => id && (!primary || id !== String(primary.id)) && !filtered.includes(id));

    const finalOrder = [...filtered, ...remaining];

    let pos = 0;
    if (primary) {
      await db
        .update(productImages)
        .set({ position: 0, updatedAt: new Date() })
        .where(and(eq(productImages.id, primary.id), eq(productImages.tenantId, tenantId)));
      pos = 1;
    }

    for (const id of finalOrder) {
      await db
        .update(productImages)
        .set({ position: pos, updatedAt: new Date() })
        .where(and(eq(productImages.id, id), eq(productImages.tenantId, tenantId)));
      pos += 1;
    }

    await syncProductImagesArray({ tenantId, tenantKey, productId, categorySlug });
    return res.json({ ok: true, total: rows.length });
  } catch (err: any) {
    return res.status(500).json({ message: String(err?.message || "Reorder failed") });
  }
});

router.delete("/api/seller/products/:id/images/:imageId", async (req: any, res) => {
  try {
    const productId = toInt(req.params.id);
    if (!productId) return res.status(400).json({ message: "Invalid product id" });

    const slotId = String(req.params.imageId || "").trim();
    if (!slotId) return res.status(400).json({ message: "imageId required" });

    const access = await requireSellerProductAccess(req, res, productId);
    if (!access) return;

    const { tenantId, tenantKey, product } = access;

    const category =
      product.categoryId != null
        ? await db.query.productCategories.findFirst({
            where: and(eq(productCategories.tenantId, tenantId), eq(productCategories.id, Number(product.categoryId))),
          })
        : null;
    const categorySlug = category?.slug || "general";

    const slot = await db.query.productImages.findFirst({
      where: and(
        eq(productImages.id, slotId),
        eq(productImages.tenantId, tenantId),
        eq(productImages.productId, productId),
        isNull(productImages.deletedAt),
      ),
    });
    if (!slot) return res.status(404).json({ message: "Slot not found" });

    const primaryAssetKey = getProductPrimaryAssetKey({ tenantKey, categorySlug, productId });
    if (slot.role === "primary" || String(slot.assetKey) === primaryAssetKey || Number(slot.position) === 0) {
      return res.status(400).json({ message: "Cannot delete primary image slot" });
    }

    await db
      .update(productImages)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(productImages.id, slotId), eq(productImages.tenantId, tenantId)));

    await syncProductImagesArray({ tenantId, tenantKey, productId, categorySlug });
    return res.json({ ok: true });
  } catch (err: any) {
    return res.status(500).json({ message: String(err?.message || "Delete failed") });
  }
});

export default router;
