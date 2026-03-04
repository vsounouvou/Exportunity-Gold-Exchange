import { db } from "@db";
import { and, desc, eq, inArray, sql } from "drizzle-orm";

import {
  marketplaceOrderItems,
  marketplaceOrders,
  productCategories,
  sellerProducts,
  stampedGoldCertificates,
  stampedGoldItems,
  stampedGoldSkus,
  walletAccounts,
  walletLedgerEntries,
} from "@db/schema";

function normalizeEmail(value: unknown): string | null {
  const raw = String(value ?? "").trim().toLowerCase();
  return raw ? raw : null;
}

function orderAmountXof(orderTotal: unknown) {
  const parsed = Number(orderTotal ?? 0);
  if (!Number.isFinite(parsed)) throw new Error("invalid_order_total");
  const rounded = Math.round(parsed);
  if (!Number.isFinite(rounded) || rounded <= 0) throw new Error("invalid_order_total");
  return rounded;
}

function isOrderAlreadyPaid(statusRaw: unknown, paidAt: unknown) {
  if (paidAt) return true;
  const status = String(statusRaw ?? "").trim().toLowerCase();
  return ["confirmed", "processing", "ready", "delivered"].includes(status);
}

async function allocateStampedGoldForOrderTx(tx: any, input: { tenantId: number; orderId: number; ownerUserId: string; ownerEmail: string; now: Date }) {
  const order = await tx.query.marketplaceOrders.findFirst({
    where: eq(marketplaceOrders.id, input.orderId),
    columns: { pickupPartnerId: true },
  });

  const items = await tx
    .select({
      orderItem: marketplaceOrderItems,
      product: { id: sellerProducts.id, categoryId: sellerProducts.categoryId },
      category: { slug: productCategories.slug },
      sku: stampedGoldSkus,
    })
    .from(marketplaceOrderItems)
    .leftJoin(sellerProducts, eq(marketplaceOrderItems.productId, sellerProducts.id))
    .leftJoin(productCategories, eq(sellerProducts.categoryId, productCategories.id))
    .leftJoin(
      stampedGoldSkus,
      and(eq(stampedGoldSkus.tenantId, input.tenantId), eq(stampedGoldSkus.productId, marketplaceOrderItems.productId)),
    )
    .where(eq(marketplaceOrderItems.orderId, input.orderId));

  const stampedOrderItems = items.filter((row: any) => String(row?.category?.slug || "") === "stamped");
  if (!stampedOrderItems.length) return { stamped: false as const, allocated: 0 };

  let allocatedTotal = 0;

  for (const row of stampedOrderItems) {
    const orderItem = row.orderItem;
    const sku = row.sku;
    const qty = Number(orderItem?.quantity || 0);
    if (!orderItem?.id || qty <= 0) continue;

    if (!sku?.id) throw new Error("stamped_sku_missing");

    const alreadyRows = await tx
      .select({ c: sql<number>`count(*)` })
      .from(stampedGoldItems)
      .where(and(eq(stampedGoldItems.tenantId, input.tenantId), eq(stampedGoldItems.orderItemId, orderItem.id)));
    const already = Number(alreadyRows?.[0]?.c || 0);
    const need = qty - already;
    if (need <= 0) continue;

    const locked = await tx.execute(sql`
      select id
      from stamped_gold_items
      where tenant_id = ${input.tenantId}
        and sku_id = ${sku.id}
        and status = 'IN_STOCK'
      order by minted_at asc
      limit ${need}
      for update skip locked
    `);

    const lockedIds: string[] = Array.isArray((locked as any)?.rows)
      ? (locked as any).rows.map((r: any) => String(r.id))
      : Array.isArray(locked)
        ? (locked as any).map((r: any) => String(r.id))
        : [];

    if (lockedIds.length < need) throw new Error("stamped_out_of_stock");

    const updated = await tx
      .update(stampedGoldItems)
      .set({
        status: "SOLD",
        orderId: input.orderId,
        orderItemId: orderItem.id,
        ownerUserId: input.ownerUserId,
        ownerEmail: input.ownerEmail,
        soldAt: input.now,
        updatedAt: input.now,
      })
      .where(inArray(stampedGoldItems.id, lockedIds as any))
      .returning();

    allocatedTotal += updated.length;

    const certValues = updated.map((it: any) => ({
      tenantId: input.tenantId,
      itemId: it.id,
      orderId: input.orderId,
      ownerUserId: input.ownerUserId,
      ownerEmail: input.ownerEmail,
      pickupPartnerId: (order as any)?.pickupPartnerId ?? null,
      issuedAt: input.now,
    }));

    await tx.insert(stampedGoldCertificates).values(certValues as any).onConflictDoNothing();
  }

  return { stamped: true as const, allocated: allocatedTotal };
}

export async function payMarketplaceOrderWithWallet(input: {
  tenantId: number;
  orderNumber: string;
  walletAccountId: string;
  expectedBuyerEmail: string;
}) {
  const tenantId = Math.trunc(Number(input.tenantId));
  if (!Number.isFinite(tenantId) || tenantId <= 0) throw new Error("tenantId is required");
  const orderNumber = String(input.orderNumber || "").trim();
  if (!orderNumber) throw new Error("orderNumber is required");

  const walletAccountId = String(input.walletAccountId || "").trim();
  if (!walletAccountId) throw new Error("walletAccountId is required");

  const expectedBuyerEmail = normalizeEmail(input.expectedBuyerEmail);
  if (!expectedBuyerEmail) throw new Error("expectedBuyerEmail is required");

  const now = new Date();

  return db.transaction(async (tx) => {
    await tx.execute(sql`select id from marketplace_orders where tenant_id = ${tenantId} and order_number = ${orderNumber} for update`);

    const order = await tx.query.marketplaceOrders.findFirst({
      where: and(eq(marketplaceOrders.tenantId, tenantId), eq(marketplaceOrders.orderNumber, orderNumber)),
    });
    if (!order) throw new Error("order_not_found");

    const buyerEmail = normalizeEmail(order.buyerEmail);
    if (!buyerEmail || buyerEmail !== expectedBuyerEmail) throw new Error("order_not_owned");

    const walletSnapshot = await tx.query.walletAccounts.findFirst({ where: eq(walletAccounts.id, walletAccountId as any) });
    const ownerUserId = walletSnapshot?.userId ? String(walletSnapshot.userId) : expectedBuyerEmail;

    if (isOrderAlreadyPaid(order.status, order.paidAt)) {
      await allocateStampedGoldForOrderTx(tx, {
        tenantId,
        orderId: order.id,
        ownerUserId,
        ownerEmail: expectedBuyerEmail,
        now,
      });
      return { order, alreadyPaid: true as const };
    }

    const amount = orderAmountXof(order.total);

    await tx.execute(sql`select id from wallet_accounts where id = ${walletAccountId} for update`);

    const wallet = walletSnapshot ?? (await tx.query.walletAccounts.findFirst({ where: eq(walletAccounts.id, walletAccountId as any) }));
    if (!wallet) throw new Error("wallet_not_found");
    if (wallet.status !== "ACTIVE") throw new Error("wallet_not_active");

    const existingPurchase = await tx.query.walletLedgerEntries.findFirst({
      where: and(
        eq(walletLedgerEntries.walletAccountId, walletAccountId as any),
        eq(walletLedgerEntries.direction, "DEBIT"),
        eq(walletLedgerEntries.entryType, "PURCHASE"),
        eq(walletLedgerEntries.referenceType, "ORDER"),
        eq(walletLedgerEntries.referenceId, orderNumber),
      ),
      orderBy: desc(walletLedgerEntries.createdAt),
    });

    if (existingPurchase) {
      await tx
        .update(marketplaceOrders)
        .set({
          status: "confirmed",
          paidAt: order.paidAt ?? now,
          confirmedAt: order.confirmedAt ?? now,
          updatedAt: now,
        })
        .where(eq(marketplaceOrders.id, order.id));

      const alloc = await allocateStampedGoldForOrderTx(tx, {
        tenantId,
        orderId: order.id,
        ownerUserId,
        ownerEmail: expectedBuyerEmail,
        now,
      });

      if (alloc.stamped) {
        await tx.update(marketplaceOrders).set({ status: "processing", updatedAt: now }).where(eq(marketplaceOrders.id, order.id));
      }

      const updated = await tx.query.marketplaceOrders.findFirst({ where: eq(marketplaceOrders.id, order.id) });
      return {
        order: updated ?? order,
        alreadyPaid: false as const,
        deduped: true as const,
        debitEntry: existingPurchase,
        balanceAfter: Number(existingPurchase.balanceAfter || 0),
      };
    }

    const latest = await tx.query.walletLedgerEntries.findFirst({
      where: eq(walletLedgerEntries.walletAccountId, walletAccountId as any),
      orderBy: desc(walletLedgerEntries.createdAt),
    });

    const balanceBefore = latest ? Number(latest.balanceAfter || 0) : 0;
    const balanceAfter = balanceBefore - amount;
    if (balanceAfter < 0) throw new Error("insufficient_balance");

    const [debitEntry] = await tx
      .insert(walletLedgerEntries)
      .values({
        walletAccountId,
        direction: "DEBIT",
        entryType: "PURCHASE",
        amount,
        balanceAfter,
        referenceType: "ORDER",
        referenceId: orderNumber,
        counterpartyWalletId: null,
        metadata: { tenantId, orderId: order.id, orderNumber, kind: "marketplace_order" },
        createdAt: now,
      })
      .returning();

    await tx.update(walletAccounts).set({ updatedAt: now }).where(eq(walletAccounts.id, walletAccountId as any));

    await tx
      .update(marketplaceOrders)
      .set({
        status: "confirmed",
        paidAt: now,
        confirmedAt: now,
        updatedAt: now,
      })
      .where(eq(marketplaceOrders.id, order.id));

    const alloc = await allocateStampedGoldForOrderTx(tx, {
      tenantId,
      orderId: order.id,
      ownerUserId,
      ownerEmail: expectedBuyerEmail,
      now,
    });

    if (alloc.stamped) {
      await tx.update(marketplaceOrders).set({ status: "processing", updatedAt: now }).where(eq(marketplaceOrders.id, order.id));
    }

    const updatedOrder = await tx.query.marketplaceOrders.findFirst({ where: eq(marketplaceOrders.id, order.id) });

    return { order: updatedOrder ?? order, alreadyPaid: false as const, debitEntry: debitEntry ?? null, balanceAfter };
  });
}
