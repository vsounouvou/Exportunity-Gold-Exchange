import crypto from "crypto";

import { db } from "@db";
import { and, asc, count, desc, eq, sql } from "drizzle-orm";

import {
  voucherBatches,
  vouchers,
  voucherRedemptions,
  walletAccounts,
  walletLedgerEntries,
  walletTransfers,
} from "@db/schema";
import { SYSTEM_WALLET_USER_IDS, getOrCreateSystemWalletAccount } from "./wallet";

function requireVoucherSalt() {
  const salt =
    String(process.env.VOUCHER_CODE_SALT || "").trim() ||
    String(process.env.SESSION_SECRET || "").trim() ||
    "dev_voucher_salt";
  return salt;
}

export function hashVoucherCode(code: string) {
  const raw = String(code || "").trim();
  if (!raw) throw new Error("code is required");
  const salt = requireVoucherSalt();
  return crypto.createHash("sha256").update(`${raw}:${salt}`).digest("hex");
}

function generateVoucherCode() {
  const bytes = crypto.randomBytes(9).toString("hex").toUpperCase();
  return `EXPO-${bytes.slice(0, 4)}-${bytes.slice(4, 8)}-${bytes.slice(8, 12)}`;
}

function last4(code: string) {
  const digits = code.replace(/\W/g, "");
  return digits.slice(-4).padStart(4, "0");
}

function parseCommissionScheme(scheme: any): { sellerPct: number; masterPct: number } {
  const sellerPctRaw = typeof scheme?.sellerPct === "number" ? scheme.sellerPct : typeof scheme?.seller_pct === "number" ? scheme.seller_pct : 0.01;
  const masterPctRaw = typeof scheme?.masterPct === "number" ? scheme.masterPct : typeof scheme?.master_pct === "number" ? scheme.master_pct : 0.01;
  const sellerPct = Math.max(0, Math.min(1, sellerPctRaw));
  const masterPct = Math.max(0, Math.min(1, masterPctRaw));
  return { sellerPct, masterPct };
}

function roundMoney(value: number) {
  return Math.max(0, Math.round(value));
}

export async function createVoucherBatch(input: {
  issuerWalletAccountId: string;
  voucherCount: number;
  voucherValue: number;
  currency?: string;
  commissionScheme?: Record<string, any>;
}) {
  const voucherCount = Math.trunc(Number(input.voucherCount || 0));
  const voucherValue = Math.trunc(Number(input.voucherValue || 0));
  if (!Number.isFinite(voucherCount) || voucherCount <= 0) throw new Error("voucher_count must be > 0");
  if (!Number.isFinite(voucherValue) || voucherValue <= 0) throw new Error("voucher_value must be > 0");

  const currency = String(input.currency || "XOF").trim().toUpperCase() || "XOF";
  const totalValue = voucherCount * voucherValue;

  const [batch] = await db
    .insert(voucherBatches)
    .values({
      issuerWalletAccountId: input.issuerWalletAccountId,
      currency: currency as any,
      totalValue,
      voucherCount,
      voucherValue,
      status: "DRAFT",
      commissionScheme: input.commissionScheme ?? { sellerPct: 0.01, masterPct: 0.01 },
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  if (!batch) throw new Error("Failed to create voucher batch");
  return batch;
}

export async function issueVoucherBatch(input: { batchId: string }) {
  const batchId = String(input.batchId || "").trim();
  if (!batchId) throw new Error("batchId is required");

  const floatWallet = await getOrCreateSystemWalletAccount(SYSTEM_WALLET_USER_IDS.voucherFloat, "XOF");

  return db.transaction(async (tx) => {
    await tx.execute(sql`select id from voucher_batches where id = ${batchId} for update`);

    const batch = await tx.query.voucherBatches.findFirst({ where: eq(voucherBatches.id, batchId as any) });
    if (!batch) throw new Error("batch not found");
    if (batch.status !== "DRAFT") throw new Error(`batch_not_draft:${batch.status}`);

    const scheme = parseCommissionScheme(batch.commissionScheme);
    const sellerCommissionEach = roundMoney(Number(batch.voucherValue || 0) * scheme.sellerPct);
    const masterCommissionEach = roundMoney(Number(batch.voucherValue || 0) * scheme.masterPct);
    const commissionReserve = batch.voucherCount * (sellerCommissionEach + masterCommissionEach);
    const floatReserve = Number(batch.totalValue || 0) + commissionReserve;

    const issuerId = batch.issuerWalletAccountId;
    const floatId = floatWallet.id;
    const [firstLock, secondLock] = String(issuerId) < String(floatId) ? [issuerId, floatId] : [floatId, issuerId];

    await tx.execute(sql`select id from wallet_accounts where id = ${firstLock} for update`);
    await tx.execute(sql`select id from wallet_accounts where id = ${secondLock} for update`);

    const issuerLatest = await tx.query.walletLedgerEntries.findFirst({
      where: eq(walletLedgerEntries.walletAccountId, issuerId as any),
      orderBy: desc(walletLedgerEntries.createdAt),
    });
    const floatLatest = await tx.query.walletLedgerEntries.findFirst({
      where: eq(walletLedgerEntries.walletAccountId, floatId as any),
      orderBy: desc(walletLedgerEntries.createdAt),
    });
    const issuerBalance = issuerLatest ? Number(issuerLatest.balanceAfter || 0) : 0;
    const floatBalance = floatLatest ? Number(floatLatest.balanceAfter || 0) : 0;

    if (issuerBalance < floatReserve) throw new Error("issuer_insufficient_balance");

    const [transfer] = await tx
      .insert(walletTransfers)
      .values({
        fromWalletAccountId: issuerId,
        toWalletAccountId: floatId,
        amount: floatReserve,
        status: "COMPLETED",
        memo: `Voucher batch funding ${batch.id}`,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    const referenceId = batch.id;
    await tx.insert(walletLedgerEntries).values({
      walletAccountId: issuerId,
      direction: "DEBIT",
      entryType: "VOUCHER_ISSUE",
      amount: floatReserve,
      balanceAfter: issuerBalance - floatReserve,
      referenceType: "VOUCHER",
      referenceId,
      counterpartyWalletId: floatId,
      metadata: { batchId: batch.id, kind: "voucher_float_funding" },
      createdAt: new Date(),
    });

    await tx.insert(walletLedgerEntries).values({
      walletAccountId: floatId,
      direction: "CREDIT",
      entryType: "VOUCHER_ISSUE",
      amount: floatReserve,
      balanceAfter: floatBalance + floatReserve,
      referenceType: "VOUCHER",
      referenceId,
      counterpartyWalletId: issuerId,
      metadata: { batchId: batch.id, kind: "voucher_float_funding" },
      createdAt: new Date(),
    });

    await tx.update(walletAccounts).set({ updatedAt: new Date() }).where(eq(walletAccounts.id, issuerId as any));
    await tx.update(walletAccounts).set({ updatedAt: new Date() }).where(eq(walletAccounts.id, floatId as any));

    const issuedCodes: Array<{ code: string; voucherId: string }> = [];
    const rowsToInsert: Array<typeof vouchers.$inferInsert> = [];

    for (let i = 0; i < batch.voucherCount; i += 1) {
      const code = generateVoucherCode();
      const codeHash = hashVoucherCode(code);
      rowsToInsert.push({
        batchId: batch.id,
        codeHash,
        codeLast4: last4(code),
        value: Number(batch.voucherValue || 0),
        currency: batch.currency,
        status: "NEW",
        createdAt: new Date(),
      });
      issuedCodes.push({ code, voucherId: "" });
    }

    const inserted = await tx.insert(vouchers).values(rowsToInsert).returning({ id: vouchers.id, codeLast4: vouchers.codeLast4 });
    for (let i = 0; i < inserted.length; i += 1) {
      issuedCodes[i].voucherId = inserted[i]?.id;
    }

    await tx.update(voucherBatches).set({ status: "ISSUED", updatedAt: new Date() }).where(eq(voucherBatches.id, batch.id));

    return {
      batch: { ...batch, status: "ISSUED" as const },
      transfer: transfer ?? null,
      floatReserve,
      commissionReserve,
      codes: issuedCodes,
    };
  });
}

export async function redeemVoucher(input: {
  code: string;
  toWalletAccountId: string;
  ip?: string | null;
  userAgent?: string | null;
}) {
  const code = String(input.code || "").trim();
  if (!code) throw new Error("code is required");
  const codeHash = hashVoucherCode(code);

  const floatWallet = await getOrCreateSystemWalletAccount(SYSTEM_WALLET_USER_IDS.voucherFloat, "XOF");
  const floatId = floatWallet.id;

  return db.transaction(async (tx) => {
    const voucher = await tx.query.vouchers.findFirst({ where: eq(vouchers.codeHash, codeHash) });
    if (!voucher) throw new Error("invalid_code");

    await tx.execute(sql`select id from vouchers where id = ${voucher.id} for update`);

    const lockedVoucher = await tx.query.vouchers.findFirst({ where: eq(vouchers.id, voucher.id) });
    if (!lockedVoucher) throw new Error("invalid_code");

    if (lockedVoucher.status === "VOID") throw new Error("voucher_void");
    if (lockedVoucher.status === "REDEEMED") throw new Error("already_redeemed");

    const batch = await tx.query.voucherBatches.findFirst({ where: eq(voucherBatches.id, lockedVoucher.batchId) });
    if (!batch) throw new Error("batch_not_found");

    const scheme = parseCommissionScheme(batch.commissionScheme);
    const value = Number(lockedVoucher.value || 0);
    const sellerWalletId = lockedVoucher.assignedToSellerWalletId ? String(lockedVoucher.assignedToSellerWalletId) : null;
    const issuerWalletId = String(batch.issuerWalletAccountId);

    const sellerCommission = sellerWalletId ? roundMoney(value * scheme.sellerPct) : 0;
    const masterCommission = roundMoney(value * scheme.masterPct);

    const totalDebit = value + sellerCommission + masterCommission;

    const toWalletId = String(input.toWalletAccountId || "").trim();
    if (!toWalletId) throw new Error("to_wallet_account_id is required");

    const walletIds = [floatId, toWalletId, issuerWalletId, ...(sellerWalletId ? [sellerWalletId] : [])].sort();
    for (const wid of walletIds) {
      await tx.execute(sql`select id from wallet_accounts where id = ${wid} for update`);
    }

    const floatLatest = await tx.query.walletLedgerEntries.findFirst({
      where: eq(walletLedgerEntries.walletAccountId, floatId as any),
      orderBy: desc(walletLedgerEntries.createdAt),
    });
    const toLatest = await tx.query.walletLedgerEntries.findFirst({
      where: eq(walletLedgerEntries.walletAccountId, toWalletId as any),
      orderBy: desc(walletLedgerEntries.createdAt),
    });
    const sellerLatest = sellerWalletId
      ? await tx.query.walletLedgerEntries.findFirst({
          where: eq(walletLedgerEntries.walletAccountId, sellerWalletId as any),
          orderBy: desc(walletLedgerEntries.createdAt),
        })
      : null;
    const issuerLatest = await tx.query.walletLedgerEntries.findFirst({
      where: eq(walletLedgerEntries.walletAccountId, issuerWalletId as any),
      orderBy: desc(walletLedgerEntries.createdAt),
    });

    const floatBalance = floatLatest ? Number(floatLatest.balanceAfter || 0) : 0;
    const toBalance = toLatest ? Number(toLatest.balanceAfter || 0) : 0;
    const sellerBalance = sellerLatest ? Number(sellerLatest.balanceAfter || 0) : 0;
    const issuerBalance = issuerLatest ? Number(issuerLatest.balanceAfter || 0) : 0;

    if (floatBalance < totalDebit) throw new Error("voucher_float_insufficient");

    const [redemption] = await tx
      .insert(voucherRedemptions)
      .values({
        voucherId: lockedVoucher.id,
        toWalletAccountId: toWalletId,
        amount: value,
        status: "COMPLETED",
        ip: input.ip ?? null,
        userAgent: input.userAgent ?? null,
        createdAt: new Date(),
      })
      .returning();

    await tx
      .update(vouchers)
      .set({
        status: "REDEEMED",
        redeemedByWalletId: toWalletId,
        redeemedAt: new Date(),
      })
      .where(eq(vouchers.id, lockedVoucher.id));

    let floatAfter = floatBalance;
    floatAfter -= value;
    await tx.insert(walletLedgerEntries).values({
      walletAccountId: floatId,
      direction: "DEBIT",
      entryType: "VOUCHER_REDEEM",
      amount: value,
      balanceAfter: floatAfter,
      referenceType: "VOUCHER",
      referenceId: lockedVoucher.id,
      counterpartyWalletId: toWalletId,
      metadata: { kind: "voucher_value", batchId: batch.id },
      createdAt: new Date(),
    });

    if (sellerCommission > 0 && sellerWalletId) {
      floatAfter -= sellerCommission;
      await tx.insert(walletLedgerEntries).values({
        walletAccountId: floatId,
        direction: "DEBIT",
        entryType: "COMMISSION",
        amount: sellerCommission,
        balanceAfter: floatAfter,
        referenceType: "VOUCHER",
        referenceId: lockedVoucher.id,
        counterpartyWalletId: sellerWalletId,
        metadata: { kind: "seller_commission", batchId: batch.id },
        createdAt: new Date(),
      });
    }

    if (masterCommission > 0) {
      floatAfter -= masterCommission;
      await tx.insert(walletLedgerEntries).values({
        walletAccountId: floatId,
        direction: "DEBIT",
        entryType: "COMMISSION",
        amount: masterCommission,
        balanceAfter: floatAfter,
        referenceType: "VOUCHER",
        referenceId: lockedVoucher.id,
        counterpartyWalletId: issuerWalletId,
        metadata: { kind: "master_commission", batchId: batch.id },
        createdAt: new Date(),
      });
    }

    await tx.insert(walletLedgerEntries).values({
      walletAccountId: toWalletId,
      direction: "CREDIT",
      entryType: "VOUCHER_REDEEM",
      amount: value,
      balanceAfter: toBalance + value,
      referenceType: "VOUCHER",
      referenceId: lockedVoucher.id,
      counterpartyWalletId: floatId,
      metadata: { batchId: batch.id, codeLast4: lockedVoucher.codeLast4 },
      createdAt: new Date(),
    });

    if (sellerCommission > 0 && sellerWalletId) {
      await tx.insert(walletLedgerEntries).values({
        walletAccountId: sellerWalletId,
        direction: "CREDIT",
        entryType: "COMMISSION",
        amount: sellerCommission,
        balanceAfter: sellerBalance + sellerCommission,
        referenceType: "VOUCHER",
        referenceId: lockedVoucher.id,
        counterpartyWalletId: floatId,
        metadata: { batchId: batch.id, voucherId: lockedVoucher.id },
        createdAt: new Date(),
      });
    }

    if (masterCommission > 0) {
      await tx.insert(walletLedgerEntries).values({
        walletAccountId: issuerWalletId,
        direction: "CREDIT",
        entryType: "COMMISSION",
        amount: masterCommission,
        balanceAfter: issuerBalance + masterCommission,
        referenceType: "VOUCHER",
        referenceId: lockedVoucher.id,
        counterpartyWalletId: floatId,
        metadata: { batchId: batch.id, voucherId: lockedVoucher.id },
        createdAt: new Date(),
      });
    }

    await tx.update(walletAccounts).set({ updatedAt: new Date() }).where(eq(walletAccounts.id, floatId as any));
    await tx.update(walletAccounts).set({ updatedAt: new Date() }).where(eq(walletAccounts.id, toWalletId as any));
    await tx.update(walletAccounts).set({ updatedAt: new Date() }).where(eq(walletAccounts.id, issuerWalletId as any));
    if (sellerWalletId) {
      await tx.update(walletAccounts).set({ updatedAt: new Date() }).where(eq(walletAccounts.id, sellerWalletId as any));
    }

    const redeemedCount = await tx
      .select({ c: count() })
      .from(vouchers)
      .where(and(eq(vouchers.batchId, batch.id), eq(vouchers.status, "REDEEMED")))
      .then((rows) => Number(rows?.[0]?.c || 0));

    if (redeemedCount >= batch.voucherCount) {
      await tx.update(voucherBatches).set({ status: "FULLY_REDEEMED", updatedAt: new Date() }).where(eq(voucherBatches.id, batch.id));
    } else {
      await tx.update(voucherBatches).set({ status: "PARTIALLY_REDEEMED", updatedAt: new Date() }).where(eq(voucherBatches.id, batch.id));
    }

    return {
      voucher: { ...lockedVoucher, status: "REDEEMED" as const },
      redemption: redemption ?? null,
      credited: value,
      sellerCommission,
      masterCommission,
    };
  });
}

export async function listVoucherBatches(limit = 50) {
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 200);
  return db.query.voucherBatches.findMany({ orderBy: desc(voucherBatches.createdAt), limit: safeLimit });
}

