import { db } from "@db";
import { and, desc, eq, sql } from "drizzle-orm";

import { payments, walletAccounts, walletLedgerEntries, walletTopups } from "@db/schema";

export function topupReference(topupId: string) {
  const id = String(topupId || "").trim();
  if (!id) throw new Error("topupId is required");
  return `TOPUP_${id}`;
}

export async function initWalletTopup(input: {
  tenantId: number;
  walletAccountId: string;
  amount: number;
  currency: string;
  method: "PUSH" | "WIDGET" | "REDIRECT";
  gateway?: "kkiapay" | "flutterwave";
  userId?: string | null;
  msisdn?: string | null;
  operator?: string | null;
}) {
  const amount = Math.trunc(Number(input.amount || 0));
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("amount must be > 0");
  const currency = String(input.currency || "XOF").trim().toUpperCase() || "XOF";
  const method = input.method;
  const gateway = input.gateway === "flutterwave" ? "flutterwave" : "kkiapay";

  return db.transaction(async (tx) => {
    const [topup] = await tx
      .insert(walletTopups)
      .values({
        walletAccountId: input.walletAccountId,
        amount,
        currency: currency as any,
        status: "INITIATED",
        gateway,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    if (!topup) throw new Error("Failed to create topup");

    const [paymentRow] = await tx
      .insert(payments)
      .values({
        tenantId: input.tenantId,
        provider: gateway,
        purpose: "WALLET_TOPUP",
        targetType: "TOPUP",
        targetId: topup.id,
        method,
        userId: input.userId ?? null,
        msisdn: input.msisdn ?? null,
        operator: input.operator ?? null,
        amount,
        currency,
        status: "pending",
        providerPayload: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any)
      .returning();
    if (!paymentRow) throw new Error("Failed to create gateway payment");

    await tx.update(walletTopups).set({ gatewayPaymentId: paymentRow.id, updatedAt: new Date() }).where(eq(walletTopups.id, topup.id));

    return { topup, payment: paymentRow };
  });
}

export async function applyTopupPaid(input: {
  topupId: string;
  externalRef: string | null;
  providerPayload: any;
}) {
  const topupId = String(input.topupId || "").trim();
  if (!topupId) throw new Error("topupId is required");

  return db.transaction(async (tx) => {
    await tx.execute(sql`select id from wallet_topups where id = ${topupId} for update`);

    const topup = await tx.query.walletTopups.findFirst({ where: eq(walletTopups.id, topupId as any) });
    if (!topup) throw new Error("topup not found");

    if (topup.status === "PAID") return { ok: true as const, alreadyApplied: true as const, topup };

    if (topup.status === "CANCELLED" || topup.status === "FAILED" || topup.status === "EXPIRED") {
      throw new Error(`topup_not_applicable:${topup.status}`);
    }

    await tx
      .update(walletTopups)
      .set({
        status: "PAID",
        externalRef: input.externalRef ?? topup.externalRef ?? null,
        updatedAt: new Date(),
      })
      .where(eq(walletTopups.id, topup.id));

    await tx.execute(sql`select id from wallet_accounts where id = ${topup.walletAccountId} for update`);

    const wallet = await tx.query.walletAccounts.findFirst({ where: eq(walletAccounts.id, topup.walletAccountId as any) });
    if (!wallet) throw new Error("wallet not found");
    if (wallet.status !== "ACTIVE") throw new Error("wallet is not active");

    const latest = await tx.query.walletLedgerEntries.findFirst({
      where: eq(walletLedgerEntries.walletAccountId, topup.walletAccountId as any),
      orderBy: desc(walletLedgerEntries.createdAt),
    });
    const balanceBefore = latest ? Number(latest.balanceAfter || 0) : 0;
    const balanceAfter = balanceBefore + Number(topup.amount || 0);

    const [entry] = await tx
      .insert(walletLedgerEntries)
      .values({
        walletAccountId: topup.walletAccountId,
        direction: "CREDIT",
        entryType: "TOPUP",
        amount: Number(topup.amount || 0),
        balanceAfter,
        referenceType: "TOPUP",
        referenceId: topup.id,
        counterpartyWalletId: null,
        metadata: {
          gateway: topup.gateway || "kkiapay",
          providerPayload: input.providerPayload ?? null,
        },
        createdAt: new Date(),
      })
      .returning();

    await tx.update(walletAccounts).set({ updatedAt: new Date() }).where(eq(walletAccounts.id, topup.walletAccountId as any));

    return { ok: true as const, alreadyApplied: false as const, topup, entry: entry ?? null };
  });
}

export async function getTopupById(topupId: string) {
  const id = String(topupId || "").trim();
  if (!id) throw new Error("topupId is required");
  return db.query.walletTopups.findFirst({ where: eq(walletTopups.id, id as any) });
}

export async function reverseTopupCredit(input: {
  topupId: string;
  reason: string;
  actorUserId?: string | number | null;
  providerPayload?: any;
}) {
  const topupId = String(input.topupId || "").trim();
  if (!topupId) throw new Error("topupId is required");
  const reason = String(input.reason || "").trim() || "manual_refund";

  return db.transaction(async (tx) => {
    await tx.execute(sql`select id from wallet_topups where id = ${topupId} for update`);

    const topup = await tx.query.walletTopups.findFirst({ where: eq(walletTopups.id, topupId as any) });
    if (!topup) throw new Error("topup not found");

    await tx.execute(sql`select id from wallet_accounts where id = ${topup.walletAccountId} for update`);

    const existingReversal = await tx.query.walletLedgerEntries.findFirst({
      where: and(
        eq(walletLedgerEntries.walletAccountId, topup.walletAccountId as any),
        eq(walletLedgerEntries.direction, "DEBIT"),
        eq(walletLedgerEntries.entryType, "REVERSAL"),
        eq(walletLedgerEntries.referenceType, "TOPUP"),
        eq(walletLedgerEntries.referenceId, topup.id),
      ),
      orderBy: desc(walletLedgerEntries.createdAt),
    });

    if (existingReversal) {
      return { ok: true as const, alreadyApplied: true as const, topup, entry: existingReversal };
    }

    if (topup.status !== "PAID") {
      throw new Error(`topup_not_refundable:${topup.status}`);
    }

    const wallet = await tx.query.walletAccounts.findFirst({ where: eq(walletAccounts.id, topup.walletAccountId as any) });
    if (!wallet) throw new Error("wallet not found");
    if (wallet.status !== "ACTIVE") throw new Error("wallet is not active");

    const latest = await tx.query.walletLedgerEntries.findFirst({
      where: eq(walletLedgerEntries.walletAccountId, topup.walletAccountId as any),
      orderBy: desc(walletLedgerEntries.createdAt),
    });
    const balanceBefore = latest ? Number(latest.balanceAfter || 0) : 0;
    const amount = Number(topup.amount || 0);
    const balanceAfter = balanceBefore - amount;
    if (balanceAfter < 0) throw new Error("insufficient_balance_for_refund");

    const [entry] = await tx
      .insert(walletLedgerEntries)
      .values({
        walletAccountId: topup.walletAccountId,
        direction: "DEBIT",
        entryType: "REVERSAL",
        amount,
        balanceAfter,
        referenceType: "TOPUP",
        referenceId: topup.id,
        counterpartyWalletId: null,
        metadata: {
          reason,
          gateway: topup.gateway || "kkiapay",
          actorUserId: input.actorUserId != null ? String(input.actorUserId) : null,
          providerPayload: input.providerPayload ?? null,
        },
        createdAt: new Date(),
      })
      .returning();

    await tx
      .update(walletTopups)
      .set({
        status: "CANCELLED",
        updatedAt: new Date(),
      })
      .where(eq(walletTopups.id, topup.id));

    await tx.update(walletAccounts).set({ updatedAt: new Date() }).where(eq(walletAccounts.id, topup.walletAccountId as any));

    return { ok: true as const, alreadyApplied: false as const, topup: { ...topup, status: "CANCELLED" }, entry: entry ?? null };
  });
}
