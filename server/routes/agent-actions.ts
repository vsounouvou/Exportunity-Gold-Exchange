import { Router } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@db";
import { auditLogs, geoTerritories, productCategories, sellerProducts, territoryBudgets, territoryKpis } from "@db/schema";
import { ensureTenantStaff } from "./utils/auth";
import { buildProductPrompt } from "../lib/imageGen/productPrompt";
import { buildAnglePreset, ensureProductSlots, syncProductImagesArray } from "../lib/imageGen/productImages";
import { generateAndStoreImage } from "../lib/imageGen/service";
import { runAgentTaskById } from "../agents/taskRunner";

const router = Router();

router.use(ensureTenantStaff);

function toInt(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return null;
  return Math.trunc(parsed);
}

function inferPreset(input: { preset?: string; tenantKey: string; categorySlug?: string | null; productName?: string | null }) {
  const preset = String(input.preset || "").trim().toLowerCase();
  if (preset === "food") return "produce";
  if (preset === "produce" || preset === "jewelry" || preset === "gold" || preset === "generic") return preset;
  const slug = String(input.categorySlug || "").toLowerCase();
  const name = String(input.productName || "").toLowerCase();
  if (slug.includes("jewel") || name.includes("ring") || name.includes("bracelet") || name.includes("necklace")) return "jewelry";
  if (slug.includes("produce") || slug.includes("food")) return "produce";
  if (input.tenantKey === "bourse" || input.tenantKey === "bdo" || slug.includes("dore") || name.includes("gold")) return "gold";
  return "generic";
}

async function logAgentAction(input: {
  tenantId: number;
  userId?: number | null;
  action: string;
  entityType?: string;
  entityId?: number | null;
  metadata?: Record<string, any>;
  req: any;
}) {
  try {
    await db.insert(auditLogs).values({
      tenantId: input.tenantId,
      userId: input.userId ?? null,
      userRole: "staff",
      action: input.action,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      metadata: input.metadata ?? {},
      ipAddress: String(input.req?.ip || input.req?.headers?.["x-forwarded-for"] || ""),
      userAgent: String(input.req?.headers?.["user-agent"] || ""),
      createdAt: new Date(),
    });
  } catch {
    // ignore logging failures
  }
}

router.post("/actions/run", async (req: any, res) => {
  try {
    const tenant = req.tenant;
    if (!tenant) return res.status(400).json({ message: "tenant required" });

    const taskId = toInt(req.body?.taskId);
    if (taskId) {
      const dryRun = Boolean(req.body?.dryRun);
      const result = await runAgentTaskById({
        tenantId: tenant.id,
        taskId,
        requestedByUserId: req.staffUser?.id ?? null,
        dryRun,
      });
      if (!result.ok) {
        const status = result.error === "Task not found" ? 404 : 400;
        return res.status(status).json(result);
      }
      return res.json(result);
    }

    const action = String(req.body?.action || "").trim();
    const params = req.body?.params || {};

    if (!action) return res.status(400).json({ message: "action required" });

    if (action === "territory.audit.kpis") {
      const territoryId = toInt(params.territoryId);
      if (!territoryId) return res.status(400).json({ message: "params.territoryId required" });

      const territory = await db.query.geoTerritories.findFirst({
        where: and(eq(geoTerritories.tenantId, tenant.id), eq(geoTerritories.id, territoryId)),
      });
      if (!territory) return res.status(404).json({ message: "Territory not found" });

      const [budget] = await db
        .select()
        .from(territoryBudgets)
        .where(eq(territoryBudgets.territoryId, territoryId))
        .orderBy(desc(territoryBudgets.month))
        .limit(1);

      const [kpi] = await db
        .select()
        .from(territoryKpis)
        .where(eq(territoryKpis.territoryId, territoryId))
        .orderBy(desc(territoryKpis.month))
        .limit(1);

      await logAgentAction({
        tenantId: tenant.id,
        userId: req.staffUser?.id ?? null,
        action,
        entityType: "territory",
        entityId: territoryId,
        metadata: { budget: budget ?? null, kpi: kpi ?? null },
        req,
      });

      return res.json({ ok: true, action, territoryId, territory, budget: budget ?? null, kpi: kpi ?? null });
    }

    if (action === "territory.audit.navigation") {
      const territoryId = toInt(params.territoryId);
      if (!territoryId) return res.status(400).json({ message: "params.territoryId required" });

      await logAgentAction({
        tenantId: tenant.id,
        userId: req.staffUser?.id ?? null,
        action,
        entityType: "territory",
        entityId: territoryId,
        metadata: { note: "navigation audit requested" },
        req,
      });

      return res.json({
        ok: true,
        action,
        territoryId,
        message:
          "Navigation audit logged. Next: enforce `territoryId` filters across modules (marketplace, ops, finance, marketing).",
      });
    }

    if (action === "territory.marketplace.seedProducts") {
      const territoryId = toInt(params.territoryId);
      if (!territoryId) return res.status(400).json({ message: "params.territoryId required" });

      await logAgentAction({
        tenantId: tenant.id,
        userId: req.staffUser?.id ?? null,
        action,
        entityType: "territory",
        entityId: territoryId,
        metadata: { preset: params.preset ?? null, count: params.count ?? null },
        req,
      });

      return res.json({
        ok: true,
        action,
        territoryId,
        message:
          "Seed request logged. Implementing full territory-scoped product seeding requires a territory->seller mapping; for now use Products admin to create localized items and tag `attributes.territoryId`.",
      });
    }

    if (action === "territory.marketing.launch") {
      const territoryId = toInt(params.territoryId);
      if (!territoryId) return res.status(400).json({ message: "params.territoryId required" });

      await logAgentAction({
        tenantId: tenant.id,
        userId: req.staffUser?.id ?? null,
        action,
        entityType: "territory",
        entityId: territoryId,
        metadata: { brief: params.brief ?? null, channels: params.channels ?? null },
        req,
      });

      return res.json({
        ok: true,
        action,
        territoryId,
        message:
          "Marketing launch logged. Next: create a Campaign record with territory metadata and route it through the Marketing module.",
      });
    }

    if (action === "products.generateImageSet") {
      const productId = toInt(params.productId);
      if (!productId) return res.status(400).json({ message: "params.productId required" });

      const [product] = await db
        .select()
        .from(sellerProducts)
        .where(and(eq(sellerProducts.id, productId), eq(sellerProducts.tenantId, tenant.id)));
      if (!product) return res.status(404).json({ message: "Product not found" });

      const category =
        product.categoryId != null
          ? await db.query.productCategories.findFirst({
              where: and(eq(productCategories.tenantId, tenant.id), eq(productCategories.id, Number(product.categoryId))),
            })
          : null;

      const categorySlug = category?.slug || "general";
      const defaults = buildProductPrompt({ tenantKey: tenant.key, product, category });

      const preset = inferPreset({
        preset: params.preset,
        tenantKey: tenant.key,
        categorySlug,
        productName: product.name,
      });

      const count = Math.min(Math.max(toInt(params.count) ?? 8, 1), 12);
      const basePrompt = typeof params.basePrompt === "string" && params.basePrompt.trim() ? params.basePrompt.trim() : defaults.prompt;
      const negativePrompt =
        typeof params.negativePrompt === "string" && params.negativePrompt.trim() ? params.negativePrompt.trim() : defaults.negativePrompt;

      const setActive = typeof params.setActive === "boolean" ? params.setActive : true;

      const desired = buildAnglePreset(preset as any, count);
      const ensured = await ensureProductSlots({
        tenantId: tenant.id,
        tenantKey: tenant.key,
        productId,
        categorySlug,
        desired,
      });

      const byAssetKey = new Map(ensured.slots.map((s: any) => [String(s.assetKey), s]));

      const results: any[] = [];
      for (const slotDescriptor of desired) {
        const assetKey =
          slotDescriptor.slotKey === "primary"
            ? ensured.primaryAssetKey
            : `${tenant.key}/${categorySlug}/${productId}/${String(slotDescriptor.slotKey).toLowerCase()}`;
        const slot = byAssetKey.get(assetKey);
        if (!slot) continue;
        const angle = slotDescriptor.angle || "";
        const prompt = angle ? `${basePrompt} | camera angle: ${angle} | consistent product, same design, same materials` : basePrompt;
        const record = await generateAndStoreImage({
          namespace: "products",
          assetKey: String(slot.assetKey),
          prompt,
          negativePrompt,
          mode: defaults.modelTier,
          input: { aspect_ratio: defaults.aspect, output_format: "png" },
          setActive,
          createdBy: `agent:${req.staffUser?.id || "unknown"}`,
        });
        results.push({ slotId: slot.id, assetKey: slot.assetKey, image: record });
      }

      if (setActive) {
        await syncProductImagesArray({ tenantId: tenant.id, tenantKey: tenant.key, productId, categorySlug });
      }

      return res.json({ ok: true, action, productId, preset, count, setActive, results });
    }

    return res.status(400).json({ message: `Unknown action: ${action}` });
  } catch (err: any) {
    return res.status(500).json({ message: err?.message || "Action failed" });
  }
});

export default router;
