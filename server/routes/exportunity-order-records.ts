import { Router, type Response } from "express";
import { and, desc, eq, sql } from "drizzle-orm";

import { db } from "@db";
import {
  marketplaceOrderItems,
  marketplaceOrders,
  sellers,
} from "@db/schema";
import { ensureTenantUser } from "./utils/auth";

const router = Router();
const ORDER_NUMBER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{2,79}$/;

function resolveExportunityTenant(req: any, res: Response) {
  const tenant = req.tenant;
  if (!tenant || String(tenant.key || "").trim().toLowerCase() !== "exportunity") {
    res.status(404).json({
      ok: false,
      message: "Exportunity order records are not available for this tenant.",
    });
    return null;
  }
  return tenant as { id: number; key: string };
}

function resolveViewer(req: any, res: Response) {
  const user = req.tenantUser;
  const email = String(user?.email || "").trim().toLowerCase();
  if (!email) {
    res.status(403).json({
      ok: false,
      message: "A signed-in Exportunity account with a verified email is required.",
    });
    return null;
  }
  return { email };
}

function ownershipPredicate(viewer: { email: string }) {
  // marketplace_orders.buyer_user_id belongs to the retired marketplace user
  // table, not ece_users. Email is the only safe cross-generation identity
  // link for these preserved records; never compare the unrelated numeric IDs.
  return sql`lower(${marketplaceOrders.buyerEmail}) = ${viewer.email}`;
}

router.get("/", ensureTenantUser, async (req: any, res) => {
  const tenant = resolveExportunityTenant(req, res);
  if (!tenant) return;
  const viewer = resolveViewer(req, res);
  if (!viewer) return;

  try {
    const rows = await db
      .select({
        id: marketplaceOrders.id,
        orderNumber: marketplaceOrders.orderNumber,
        status: marketplaceOrders.status,
        total: marketplaceOrders.total,
        fulfillmentType: marketplaceOrders.fulfillmentType,
        createdAt: marketplaceOrders.createdAt,
        updatedAt: marketplaceOrders.updatedAt,
        sellerId: sellers.id,
        sellerName: sellers.shopName,
        itemsCount: sql<number>`count(${marketplaceOrderItems.id})`,
      })
      .from(marketplaceOrders)
      .leftJoin(sellers, eq(marketplaceOrders.sellerId, sellers.id))
      .leftJoin(
        marketplaceOrderItems,
        and(
          eq(marketplaceOrderItems.orderId, marketplaceOrders.id),
          eq(marketplaceOrderItems.tenantId, tenant.id),
        ),
      )
      .where(
        and(
          eq(marketplaceOrders.tenantId, tenant.id),
          ownershipPredicate(viewer),
        ),
      )
      .groupBy(marketplaceOrders.id, sellers.id)
      .orderBy(desc(marketplaceOrders.createdAt))
      .limit(100);

    return res.json({
      ok: true,
      currency: "XOF",
      orders: rows.map((row) => ({
        id: row.id,
        orderNumber: row.orderNumber,
        status: row.status,
        total: row.total,
        fulfillmentType: row.fulfillmentType,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        itemsCount: Number(row.itemsCount || 0),
        seller: row.sellerId
          ? { id: row.sellerId, name: row.sellerName || "Supplier" }
          : null,
      })),
    });
  } catch (error) {
    console.error(
      "[Exportunity order records] list failed",
      error instanceof Error ? error.message : String(error),
    );
    return res.status(500).json({
      ok: false,
      message: "Order records could not be loaded.",
    });
  }
});

router.get("/:orderNumber", ensureTenantUser, async (req: any, res) => {
  const tenant = resolveExportunityTenant(req, res);
  if (!tenant) return;
  const viewer = resolveViewer(req, res);
  if (!viewer) return;

  const orderNumber = String(req.params?.orderNumber || "").trim();
  if (!ORDER_NUMBER_PATTERN.test(orderNumber)) {
    return res.status(400).json({
      ok: false,
      message: "A valid order reference is required.",
    });
  }

  try {
    const [record] = await db
      .select({
        id: marketplaceOrders.id,
        orderNumber: marketplaceOrders.orderNumber,
        status: marketplaceOrders.status,
        subtotal: marketplaceOrders.subtotal,
        deliveryFee: marketplaceOrders.deliveryFee,
        serviceFee: marketplaceOrders.serviceFee,
        discount: marketplaceOrders.discount,
        total: marketplaceOrders.total,
        fulfillmentType: marketplaceOrders.fulfillmentType,
        deliveryAddress: marketplaceOrders.deliveryAddress,
        createdAt: marketplaceOrders.createdAt,
        updatedAt: marketplaceOrders.updatedAt,
        confirmedAt: marketplaceOrders.confirmedAt,
        readyAt: marketplaceOrders.readyAt,
        deliveredAt: marketplaceOrders.deliveredAt,
        sellerId: sellers.id,
        sellerName: sellers.shopName,
      })
      .from(marketplaceOrders)
      .leftJoin(sellers, eq(marketplaceOrders.sellerId, sellers.id))
      .where(
        and(
          eq(marketplaceOrders.tenantId, tenant.id),
          eq(marketplaceOrders.orderNumber, orderNumber),
          ownershipPredicate(viewer),
        ),
      )
      .limit(1);

    if (!record) {
      return res.status(404).json({
        ok: false,
        message: "Order record not found for this account.",
      });
    }

    const items = await db
      .select({
        id: marketplaceOrderItems.id,
        productName: marketplaceOrderItems.productName,
        quantity: marketplaceOrderItems.quantity,
        unitPrice: marketplaceOrderItems.unitPrice,
        subtotal: marketplaceOrderItems.subtotal,
      })
      .from(marketplaceOrderItems)
      .where(
        and(
          eq(marketplaceOrderItems.tenantId, tenant.id),
          eq(marketplaceOrderItems.orderId, record.id),
        ),
      )
      .orderBy(marketplaceOrderItems.id);

    return res.json({
      ok: true,
      currency: "XOF",
      order: {
        id: record.id,
        orderNumber: record.orderNumber,
        status: record.status,
        subtotal: record.subtotal,
        deliveryFee: record.deliveryFee,
        serviceFee: record.serviceFee,
        discount: record.discount,
        total: record.total,
        fulfillmentType: record.fulfillmentType,
        deliveryAddress: record.deliveryAddress,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        confirmedAt: record.confirmedAt,
        readyAt: record.readyAt,
        deliveredAt: record.deliveredAt,
        seller: record.sellerId
          ? { id: record.sellerId, name: record.sellerName || "Supplier" }
          : null,
      },
      items,
      actions: {
        paymentAvailable: false,
        externalSideEffect: false,
        message:
          "This read-only record does not authorize payment, procurement, supplier contact, or fulfilment.",
      },
    });
  } catch (error) {
    console.error(
      "[Exportunity order records] detail failed",
      error instanceof Error ? error.message : String(error),
    );
    return res.status(500).json({
      ok: false,
      message: "The order record could not be loaded.",
    });
  }
});

export default router;
