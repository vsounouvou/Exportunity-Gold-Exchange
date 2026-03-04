import { Router } from "express";
import { db } from "@db";
import { and, eq, sql } from "drizzle-orm";
import {
  marketplaceOrderItems,
  marketplaceOrders,
  partnerJewellers,
  sellerProducts,
  stampedGoldCertificates,
  stampedGoldItems,
  stampedGoldSkus,
  stampedGoldVerificationScans,
  tenants,
} from "@db/schema";
import { ensureTenantStaff } from "./utils/auth";

const router = Router();

function requireTenant(req: any, res: any) {
  const tenant = req.tenant;
  if (!tenant) {
    res.status(500).json({ message: "Tenant not resolved" });
    return null;
  }
  return tenant;
}

function toUuid(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (!/^[0-9a-fA-F-]{36}$/.test(raw)) return null;
  return raw;
}

function normalizeSerial(value: unknown) {
  return String(value ?? "").trim().toUpperCase();
}

function serialOrTokenMatch(serialCode: string, rawInput: string) {
  return sql`(
    upper(coalesce(${stampedGoldItems.serialCode}, '')) = ${serialCode}
    or upper(coalesce(${stampedGoldItems.serial}, '')) = ${serialCode}
    or coalesce(${stampedGoldItems.qrToken}, '') = ${rawInput}
  )`;
}

function normalizeFeatureFlags(raw: unknown) {
  const flags = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return {
    "feature.gold_stamping": flags["feature.gold_stamping"] !== false,
  } as const;
}

async function ensureGoldStampingEnabled(req: any, res: any) {
  const tenantId = Number(req?.tenant?.id || 0);
  if (!Number.isFinite(tenantId) || tenantId <= 0) {
    res.status(400).json({ message: "Tenant not resolved" });
    return false;
  }
  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.id, tenantId),
    columns: { featureFlags: true },
  });
  const flags = normalizeFeatureFlags(tenant?.featureFlags ?? null);
  if (!flags["feature.gold_stamping"]) {
    res.status(403).json({
      code: "FEATURE_DISABLED",
      message: "Gold stamping is disabled for this tenant",
      feature: "feature.gold_stamping",
    });
    return false;
  }
  return true;
}

async function writePickupAudit(input: {
  tenantId: number;
  itemId: string;
  previousStatus: string;
  actorId: string | null;
  actorRole: string | null;
  idVerified: boolean;
}) {
  await db.execute(sql`
    insert into audit_log (
      tenant_id,
      item_id,
      previous_status,
      new_status,
      actor_id,
      actor_role,
      created_at
    ) values (
      ${input.tenantId},
      ${input.itemId},
      ${String(input.previousStatus || "").toUpperCase()},
      'DELIVERED',
      ${input.actorId},
      ${input.actorRole ? `${input.actorRole}${input.idVerified ? " (id_verified)" : ""}` : input.idVerified ? "id_verified" : null},
      now()
    )
  `);
}

router.use(async (req, res, next) => {
  try {
    const enabled = await ensureGoldStampingEnabled(req, res);
    if (!enabled) return;
    next();
  } catch (error) {
    console.error("[Pickup] feature gate error:", error);
    res.status(500).json({ message: "Feature gate failed" });
  }
});

router.use(ensureTenantStaff);

router.post("/scan", async (req: any, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const tenantId = tenant.id;

    const serialCode = normalizeSerial(req.body?.serialCode);
    if (!serialCode) return res.status(400).json({ message: "serialCode is required" });
    const rawInput = String(req.body?.serialCode || "").trim();

    const partnerJewellerId = toUuid(req.body?.partnerJewellerId);
    if (partnerJewellerId) {
      const partner = await db.query.partnerJewellers.findFirst({
        where: and(eq(partnerJewellers.id, partnerJewellerId as any), eq(partnerJewellers.tenantId, tenantId), eq(partnerJewellers.isActive, true)),
      });
      if (!partner) return res.status(400).json({ message: "Invalid partnerJewellerId" });
    }

    const [row] = await db
      .select({
        item: stampedGoldItems,
        sku: stampedGoldSkus,
        product: { id: sellerProducts.id, name: sellerProducts.name },
        order: marketplaceOrders,
        orderItem: marketplaceOrderItems,
        cert: stampedGoldCertificates,
      })
      .from(stampedGoldItems)
      .leftJoin(stampedGoldSkus, eq(stampedGoldItems.skuId, stampedGoldSkus.id))
      .leftJoin(sellerProducts, eq(stampedGoldSkus.productId, sellerProducts.id))
      .leftJoin(marketplaceOrders, eq(stampedGoldItems.orderId, marketplaceOrders.id))
      .leftJoin(marketplaceOrderItems, eq(stampedGoldItems.orderItemId, marketplaceOrderItems.id))
      .leftJoin(stampedGoldCertificates, eq(stampedGoldCertificates.itemId, stampedGoldItems.id))
      .where(
        and(
          eq(stampedGoldItems.tenantId, tenantId),
          serialOrTokenMatch(serialCode, rawInput),
        ),
      )
      .limit(1);

    await db.insert(stampedGoldVerificationScans).values({
      tenantId,
      itemId: row?.item?.id ?? null,
      serialCode: row?.item?.serialCode || serialCode,
      scannedByUserId: req.staffUser?.id ? String(req.staffUser.id) : null,
      scannerType: "JEWELLER",
      ip: String(req.headers["x-forwarded-for"] || req.ip || "").split(",")[0]?.trim() || null,
      userAgent: String(req.headers["user-agent"] || "").slice(0, 500) || null,
      createdAt: new Date(),
    });

    if (!row?.item?.id) return res.status(404).json({ valid: false, serialCode });

    res.json({
      valid: true,
      serialCode,
      item: row.item,
      sku: row.sku?.id ? row.sku : null,
      product: row.product?.id ? row.product : null,
      order: row.order?.id ? row.order : null,
      orderItem: row.orderItem?.id ? row.orderItem : null,
      certificate: row.cert?.id ? row.cert : null,
    });
  } catch (error: any) {
    console.error("[Pickup] scan error:", error);
    res.status(500).json({ message: "Scan failed" });
  }
});

router.post("/confirm", async (req: any, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const tenantId = tenant.id;
    const now = new Date();

    const serialCode = normalizeSerial(req.body?.serialCode);
    if (!serialCode) return res.status(400).json({ message: "serialCode is required" });
    const rawInput = String(req.body?.serialCode || "").trim();
    const idVerified = Boolean(req.body?.idVerified ?? req.body?.id_verified);
    if (!idVerified) return res.status(400).json({ message: "idVerified=true is required for pickup confirm" });

    const out = await db.transaction(async (tx) => {
      await tx.execute(
        sql`
          select id
          from stamped_gold_items
          where tenant_id = ${tenantId}
            and (
              upper(coalesce(serial_code, '')) = ${serialCode}
              or upper(coalesce(serial, '')) = ${serialCode}
              or qr_token = ${rawInput}
            )
          for update
        `,
      );

      const item = await tx.query.stampedGoldItems.findFirst({
        where: and(
          eq(stampedGoldItems.tenantId, tenantId),
          serialOrTokenMatch(serialCode, rawInput),
        ),
      });
      if (!item) return { status: 404 as const, body: { message: "Item not found" } };
      if (String(item.status) === "OPENED_VOID") return { status: 400 as const, body: { message: "Item is OPENED_VOID" } };
      if (item.status === "DELIVERED") return { status: 200 as const, body: { ok: true, alreadyDelivered: true } };
      if (item.status !== "READY_PICKUP") {
        return {
          status: 400 as const,
          body: {
            code: "INVALID_TRANSITION",
            message: `Item not deliverable from status ${item.status}; READY_PICKUP required.`,
          },
        };
      }
      if (!item.orderId) return { status: 400 as const, body: { message: "Item not linked to an order" } };

      const cert = await tx.query.stampedGoldCertificates.findFirst({
        where: and(eq(stampedGoldCertificates.tenantId, tenantId), eq(stampedGoldCertificates.itemId, item.id)),
      });
      if (!cert) {
        return { status: 400 as const, body: { message: "Certificate is required before pickup delivery" } };
      }

      await tx
        .update(stampedGoldItems)
        .set({
          status: "DELIVERED",
          currentLocationType: "DELIVERED",
          deliveredAt: now,
          pickupIdVerified: true,
          pickupIdVerifiedAt: now,
          pickupIdVerifiedBy: req.staffUser?.id ? Number(req.staffUser.id) : null,
          updatedAt: now,
        })
        .where(eq(stampedGoldItems.id, item.id));

      await tx
        .update(marketplaceOrders)
        .set({
          status: "delivered",
          deliveredAt: now,
          updatedAt: now,
        })
        .where(eq(marketplaceOrders.id, item.orderId));

      await tx.insert(stampedGoldVerificationScans).values({
        tenantId,
        itemId: item.id,
        serialCode: item.serialCode || serialCode,
        scannedByUserId: req.staffUser?.id ? String(req.staffUser.id) : null,
        scannerType: "JEWELLER",
        ip: String(req.headers["x-forwarded-for"] || req.ip || "").split(",")[0]?.trim() || null,
        userAgent: String(req.headers["user-agent"] || "").slice(0, 500) || null,
        createdAt: now,
      });

      const actorRole = Array.isArray(req.staffUser?.roles) && req.staffUser.roles.length
        ? String(req.staffUser.roles[0])
        : String(req.staffUser?.role || req.staffUser?.currentMode || "staff");
      await writePickupAudit({
        tenantId,
        itemId: String(item.id),
        previousStatus: String(item.status || "READY_PICKUP"),
        actorId: req.staffUser?.id ? String(req.staffUser.id) : null,
        actorRole,
        idVerified: true,
      });

      return { status: 200 as const, body: { ok: true } };
    });

    res.status(out.status).json(out.body);
  } catch (error: any) {
    console.error("[Pickup] confirm error:", error);
    res.status(500).json({ message: "Confirm failed" });
  }
});

export default router;
