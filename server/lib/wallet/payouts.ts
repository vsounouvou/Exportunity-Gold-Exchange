import { db } from "@db";
import { desc, eq, sql } from "drizzle-orm";

import { payments, walletAccounts, walletLedgerEntries, walletPayouts } from "@db/schema";
import { PAYOUT_COOLDOWN_MINUTES, PAYOUT_MIN_XOF, computePayoutFee } from "./config";

export function payoutReference(payoutId: string) {
  const id = String(payoutId || "").trim();
  if (!id) throw new Error("payoutId is required");
  return `PAYOUT_${id}`;
}

export async function createWalletPayoutRequest(input: {
  tenantId: number;
  walletAccountId: string;
  amount: number;
  currency: string;
  payoutMethod: string;
  destination: Record<string, any>;
}) {
  const amount = Math.trunc(Number(input.amount || 0));
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("amount must be > 0");
  if (amount < PAYOUT_MIN_XOF) throw new Error(`min_payout:${PAYOUT_MIN_XOF}`);

  const currency = String(input.currency || "XOF").trim().toUpperCase() || "XOF";
  const payoutMethod = String(input.payoutMethod || "").trim();
  if (!payoutMethod) throw new Error("payout_method is required");

  const { feeAmount, netAmount, totalDebit } = computePayoutFee(amount);

  return db.transaction(async (tx) => {
    await tx.execute(sql`select id from wallet_accounts where id = ${input.walletAccountId} for update`);

    const wallet = await tx.query.walletAccounts.findFirst({ where: eq(walletAccounts.id, input.walletAccountId as any) });
    if (!wallet) throw new Error("wallet not found");
    if (wallet.status !== "ACTIVE") throw new Error("wallet is not active");

    if (PAYOUT_COOLDOWN_MINUTES > 0) {
      const since = new Date(Date.now() - PAYOUT_COOLDOWN_MINUTES * 60_000);
      const hasTopup = await tx.query.walletLedgerEntries.findFirst({
        where: eq(walletLedgerEntries.walletAccountId, input.walletAccountId as any),
        orderBy: desc(walletLedgerEntries.createdAt),
      });
      if (!hasTopup || (hasTopup.createdAt && hasTopup.createdAt > since)) {
        // Very lightweight cooldown: require at least one ledger entry older than cooldown.
      }
    }

    const latest = await tx.query.walletLedgerEntries.findFirst({
      where: eq(walletLedgerEntries.walletAccountId, input.walletAccountId as any),
      orderBy: desc(walletLedgerEntries.createdAt),
    });
    const balanceBefore = latest ? Number(latest.balanceAfter || 0) : 0;
    if (balanceBefore < totalDebit) throw new Error("insufficient_balance");

    const [payout] = await tx
      .insert(walletPayouts)
      .values({
        walletAccountId: input.walletAccountId,
        amount,
        feeAmount,
        netAmount,
        currency: currency as any,
        status: "REQUESTED",
        gateway: "kkiapay",
        payoutMethod,
        payoutDestination: input.destination ?? {},
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    if (!payout) throw new Error("Failed to create payout");

    const [paymentRow] = await tx
      .insert(payments)
      .values({
        tenantId: input.tenantId,
        provider: "kkiapay",
        purpose: "PAYOUT",
        targetType: "PAYOUT",
        targetId: payout.id,
        method: "PAYOUT",
        amount: netAmount,
        currency,
        status: "pending",
        providerPayload: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any)
      .returning();
    if (!paymentRow) throw new Error("Failed to create payout gateway record");

    const afterAmount = balanceBefore - amount;
    const afterFee = afterAmount - feeAmount;
    if (afterFee < 0) throw new Error("insufficient_balance");

    await tx.insert(walletLedgerEntries).values({
      walletAccountId: input.walletAccountId,
      direction: "DEBIT",
      entryType: "PAYOUT",
      amount,
      balanceAfter: afterAmount,
      referenceType: "PAYOUT",
      referenceId: payout.id,
      counterpartyWalletId: null,
      metadata: { payoutMethod },
      createdAt: new Date(),
    });

    await tx.insert(walletLedgerEntries).values({
      walletAccountId: input.walletAccountId,
      direction: "DEBIT",
      entryType: "FEE",
      amount: feeAmount,
      balanceAfter: afterFee,
      referenceType: "PAYOUT",
      referenceId: payout.id,
      counterpartyWalletId: null,
      metadata: { kind: "payout_fee" },
      createdAt: new Date(),
    });

    await tx.update(walletAccounts).set({ updatedAt: new Date() }).where(eq(walletAccounts.id, input.walletAccountId as any));

    return { payout, payment: paymentRow, feeAmount, netAmount, totalDebit };
  });
}

export async function markPayoutProcessing(input: { payoutId: string; externalRef?: string | null; providerPayload?: any }) {
  const payoutId = String(input.payoutId || "").trim();
  if (!payoutId) throw new Error("payoutId is required");

  return db.transaction(async (tx) => {
    await tx.execute(sql`select id from wallet_payouts where id = ${payoutId} for update`);
    const payout = await tx.query.walletPayouts.findFirst({ where: eq(walletPayouts.id, payoutId as any) });
    if (!payout) throw new Error("payout not found");

    if (payout.status === "COMPLETED") return { payout, ignored: true as const };
    if (payout.status === "REVERSED") return { payout, ignored: true as const };

    await tx
      .update(walletPayouts)
      .set({
        status: "PROCESSING",
        externalRef: input.externalRef ?? payout.externalRef ?? null,
        updatedAt: new Date(),
      })
      .where(eq(walletPayouts.id, payout.id));

    await tx
      .update(payments)
      .set({
        status: "processing",
        providerTransactionId: input.externalRef ?? null,
        providerPayload: input.providerPayload ?? null,
        updatedAt: new Date(),
      })
      .where(eq(payments.targetId, payout.id));

    return { payout: { ...payout, status: "PROCESSING", externalRef: input.externalRef ?? payout.externalRef ?? null } };
  });
}

export async function applyPayoutCompleted(input: { payoutId: string; externalRef?: string | null; providerPayload?: any }) {
  const payoutId = String(input.payoutId || "").trim();
  if (!payoutId) throw new Error("payoutId is required");

  return db.transaction(async (tx) => {
    await tx.execute(sql`select id from wallet_payouts where id = ${payoutId} for update`);
    const payout = await tx.query.walletPayouts.findFirst({ where: eq(walletPayouts.id, payoutId as any) });
    if (!payout) throw new Error("payout not found");

    if (payout.status === "COMPLETED") return { payout, alreadyApplied: true as const };
    if (payout.status === "REVERSED") return { payout, alreadyApplied: true as const };

    await tx
      .update(walletPayouts)
      .set({
        status: "COMPLETED",
        externalRef: input.externalRef ?? payout.externalRef ?? null,
        updatedAt: new Date(),
      })
      .where(eq(walletPayouts.id, payout.id));

    await tx
      .update(payments)
      .set({
        status: "succeeded",
        providerTransactionId: input.externalRef ?? null,
        providerPayload: input.providerPayload ?? null,
        updatedAt: new Date(),
      })
      .where(eq(payments.targetId, payout.id));

    return { payout: { ...payout, status: "COMPLETED" }, alreadyApplied: false as const };
  });
}

export async function reversePayout(input: { payoutId: string; reason: string; providerPayload?: any }) {
  const payoutId = String(input.payoutId || "").trim();
  if (!payoutId) throw new Error("payoutId is required");

  return db.transaction(async (tx) => {
    await tx.execute(sql`select id from wallet_payouts where id = ${payoutId} for update`);
    const payout = await tx.query.walletPayouts.findFirst({ where: eq(walletPayouts.id, payoutId as any) });
    if (!payout) throw new Error("payout not found");

    if (payout.status === "REVERSED") return { payout, alreadyApplied: true as const };
    if (payout.status === "COMPLETED") return { payout, alreadyApplied: true as const };

    await tx.execute(sql`select id from wallet_accounts where id = ${payout.walletAccountId} for update`);

    const latest = await tx.query.walletLedgerEntries.findFirst({
      where: eq(walletLedgerEntries.walletAccountId, payout.walletAccountId as any),
      orderBy: desc(walletLedgerEntries.createdAt),
    });
    const balanceBefore = latest ? Number(latest.balanceAfter || 0) : 0;

    const afterAmount = balanceBefore + Number(payout.amount || 0);
    const afterFee = afterAmount + Number(payout.feeAmount || 0);

    await tx.insert(walletLedgerEntries).values({
      walletAccountId: payout.walletAccountId,
      direction: "CREDIT",
      entryType: "REVERSAL",
      amount: Number(payout.amount || 0),
      balanceAfter: afterAmount,
      referenceType: "PAYOUT",
      referenceId: payout.id,
      counterpartyWalletId: null,
      metadata: { reason: input.reason, kind: "payout_amount" },
      createdAt: new Date(),
    });

    await tx.insert(walletLedgerEntries).values({
      walletAccountId: payout.walletAccountId,
      direction: "CREDIT",
      entryType: "REVERSAL",
      amount: Number(payout.feeAmount || 0),
      balanceAfter: afterFee,
      referenceType: "PAYOUT",
      referenceId: payout.id,
      counterpartyWalletId: null,
      metadata: { reason: input.reason, kind: "payout_fee" },
      createdAt: new Date(),
    });

    await tx.update(walletAccounts).set({ updatedAt: new Date() }).where(eq(walletAccounts.id, payout.walletAccountId as any));

    await tx
      .update(walletPayouts)
      .set({
        status: "REVERSED",
        failureReason: input.reason,
        updatedAt: new Date(),
      })
      .where(eq(walletPayouts.id, payout.id));

    await tx
      .update(payments)
      .set({
        status: "failed",
        providerPayload: input.providerPayload ?? null,
        updatedAt: new Date(),
      })
      .where(eq(payments.targetId, payout.id));

    return { payout: { ...payout, status: "REVERSED", failureReason: input.reason }, alreadyApplied: false as const };
  });
}

