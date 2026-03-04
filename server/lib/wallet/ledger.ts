import { db } from "@db";
import { desc, eq, sql } from "drizzle-orm";

import {
  type WalletLedgerDirection,
  type WalletLedgerEntryType,
  type WalletLedgerReferenceType,
  walletAccounts,
  walletLedgerEntries,
  walletTransfers,
} from "@db/schema";

function toAmount(value: unknown) {
  const n = typeof value === "number" ? value : Number(String(value ?? ""));
  if (!Number.isFinite(n)) throw new Error("amount must be a number");
  const rounded = Math.trunc(n);
  if (rounded <= 0) throw new Error("amount must be > 0");
  return rounded;
}

export async function getWalletBalance(walletAccountId: string) {
  const latest = await db.query.walletLedgerEntries.findFirst({
    where: eq(walletLedgerEntries.walletAccountId, walletAccountId as any),
    orderBy: desc(walletLedgerEntries.createdAt),
  });
  return latest ? Number(latest.balanceAfter || 0) : 0;
}

export async function appendLedgerEntry(input: {
  walletAccountId: string;
  direction: WalletLedgerDirection;
  entryType: WalletLedgerEntryType;
  amount: number;
  referenceType: WalletLedgerReferenceType;
  referenceId: string;
  counterpartyWalletId?: string | null;
  metadata?: Record<string, any>;
}) {
  const amount = toAmount(input.amount);
  const referenceId = String(input.referenceId || "").trim();
  if (!referenceId) throw new Error("referenceId is required");

  return db.transaction(async (tx) => {
    await tx.execute(sql`select id from wallet_accounts where id = ${input.walletAccountId} for update`);

    const wallet = await tx.query.walletAccounts.findFirst({
      where: eq(walletAccounts.id, input.walletAccountId as any),
    });
    if (!wallet) throw new Error("wallet not found");
    if (wallet.status !== "ACTIVE") throw new Error("wallet is not active");

    const latest = await tx.query.walletLedgerEntries.findFirst({
      where: eq(walletLedgerEntries.walletAccountId, input.walletAccountId as any),
      orderBy: desc(walletLedgerEntries.createdAt),
    });

    const currentBalance = latest ? Number(latest.balanceAfter || 0) : 0;
    const nextBalance = input.direction === "CREDIT" ? currentBalance + amount : currentBalance - amount;

    if (input.direction === "DEBIT" && nextBalance < 0) {
      throw new Error("insufficient_balance");
    }

    const [created] = await tx
      .insert(walletLedgerEntries)
      .values({
        walletAccountId: input.walletAccountId,
        direction: input.direction,
        entryType: input.entryType,
        amount,
        balanceAfter: nextBalance,
        referenceType: input.referenceType,
        referenceId,
        counterpartyWalletId: input.counterpartyWalletId ?? null,
        metadata: input.metadata ?? {},
        createdAt: new Date(),
      })
      .returning();

    if (!created) throw new Error("Failed to append ledger entry");

    await tx
      .update(walletAccounts)
      .set({ updatedAt: new Date() })
      .where(eq(walletAccounts.id, input.walletAccountId as any));

    return created;
  });
}

export async function creditWallet(input: {
  walletAccountId: string;
  amount: number;
  entryType: WalletLedgerEntryType;
  referenceType: WalletLedgerReferenceType;
  referenceId: string;
  metadata?: Record<string, any>;
}) {
  return appendLedgerEntry({
    walletAccountId: input.walletAccountId,
    direction: "CREDIT",
    entryType: input.entryType,
    amount: input.amount,
    referenceType: input.referenceType,
    referenceId: input.referenceId,
    metadata: input.metadata,
  });
}

export async function debitWallet(input: {
  walletAccountId: string;
  amount: number;
  entryType: WalletLedgerEntryType;
  referenceType: WalletLedgerReferenceType;
  referenceId: string;
  metadata?: Record<string, any>;
}) {
  return appendLedgerEntry({
    walletAccountId: input.walletAccountId,
    direction: "DEBIT",
    entryType: input.entryType,
    amount: input.amount,
    referenceType: input.referenceType,
    referenceId: input.referenceId,
    metadata: input.metadata,
  });
}

export async function transferWallet(input: {
  fromWalletAccountId: string;
  toWalletAccountId: string;
  amount: number;
  memo?: string | null;
  metadata?: Record<string, any>;
}) {
  const amount = toAmount(input.amount);
  if (input.fromWalletAccountId === input.toWalletAccountId) throw new Error("from and to wallets must differ");

  const a = String(input.fromWalletAccountId);
  const b = String(input.toWalletAccountId);
  const [firstLock, secondLock] = a < b ? [a, b] : [b, a];

  return db.transaction(async (tx) => {
    await tx.execute(sql`select id from wallet_accounts where id = ${firstLock} for update`);
    await tx.execute(sql`select id from wallet_accounts where id = ${secondLock} for update`);

    const fromWallet = await tx.query.walletAccounts.findFirst({ where: eq(walletAccounts.id, input.fromWalletAccountId as any) });
    const toWallet = await tx.query.walletAccounts.findFirst({ where: eq(walletAccounts.id, input.toWalletAccountId as any) });
    if (!fromWallet || !toWallet) throw new Error("wallet not found");
    if (fromWallet.status !== "ACTIVE") throw new Error("sender wallet is not active");
    if (toWallet.status !== "ACTIVE") throw new Error("recipient wallet is not active");

    const [transfer] = await tx
      .insert(walletTransfers)
      .values({
        fromWalletAccountId: input.fromWalletAccountId,
        toWalletAccountId: input.toWalletAccountId,
        amount,
        status: "PENDING",
        memo: input.memo ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    if (!transfer) throw new Error("Failed to create transfer");

    const fromLatest = await tx.query.walletLedgerEntries.findFirst({
      where: eq(walletLedgerEntries.walletAccountId, input.fromWalletAccountId as any),
      orderBy: desc(walletLedgerEntries.createdAt),
    });
    const toLatest = await tx.query.walletLedgerEntries.findFirst({
      where: eq(walletLedgerEntries.walletAccountId, input.toWalletAccountId as any),
      orderBy: desc(walletLedgerEntries.createdAt),
    });

    const fromBalance = fromLatest ? Number(fromLatest.balanceAfter || 0) : 0;
    const toBalance = toLatest ? Number(toLatest.balanceAfter || 0) : 0;

    if (fromBalance - amount < 0) throw new Error("insufficient_balance");

    const [debitEntry] = await tx
      .insert(walletLedgerEntries)
      .values({
        walletAccountId: input.fromWalletAccountId,
        direction: "DEBIT",
        entryType: "TRANSFER",
        amount,
        balanceAfter: fromBalance - amount,
        referenceType: "TRANSFER",
        referenceId: transfer.id,
        counterpartyWalletId: input.toWalletAccountId,
        metadata: input.metadata ?? {},
        createdAt: new Date(),
      })
      .returning();

    const [creditEntry] = await tx
      .insert(walletLedgerEntries)
      .values({
        walletAccountId: input.toWalletAccountId,
        direction: "CREDIT",
        entryType: "TRANSFER",
        amount,
        balanceAfter: toBalance + amount,
        referenceType: "TRANSFER",
        referenceId: transfer.id,
        counterpartyWalletId: input.fromWalletAccountId,
        metadata: input.metadata ?? {},
        createdAt: new Date(),
      })
      .returning();

    await tx.update(walletTransfers).set({ status: "COMPLETED", updatedAt: new Date() }).where(eq(walletTransfers.id, transfer.id));

    await tx
      .update(walletAccounts)
      .set({ updatedAt: new Date() })
      .where(eq(walletAccounts.id, input.fromWalletAccountId as any));

    await tx
      .update(walletAccounts)
      .set({ updatedAt: new Date() })
      .where(eq(walletAccounts.id, input.toWalletAccountId as any));

    return { transfer: { ...transfer, status: "COMPLETED" }, debitEntry: debitEntry ?? null, creditEntry: creditEntry ?? null };
  });
}
