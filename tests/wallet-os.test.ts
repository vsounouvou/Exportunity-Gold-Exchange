import test from "node:test";
import assert from "node:assert/strict";
import { nanoid } from "nanoid";
import { and, count, desc, eq } from "drizzle-orm";

import { db } from "@db";
import { tenants, vouchers, walletLedgerEntries, walletTopups } from "@db/schema";

import { creditWallet, debitWallet, getWalletBalance, transferWallet } from "../server/lib/wallet/ledger";
import { getOrCreateWalletAccount } from "../server/lib/wallet/wallet";
import { applyTopupPaid, initWalletTopup } from "../server/lib/wallet/topups";
import { createWalletPayoutRequest, reversePayout } from "../server/lib/wallet/payouts";
import { createVoucherBatch, issueVoucherBatch, redeemVoucher } from "../server/lib/wallet/vouchers";
import { ensureKkiapayPaymentsTable } from "../server/lib/kkiapay/ensureTables";
import { ensureWalletOsTables } from "../server/lib/wallet/ensureTables";

test.before(async () => {
  await ensureKkiapayPaymentsTable();
  await ensureWalletOsTables();
});

async function ensureTenant() {
  const existing = await db.query.tenants.findFirst({ orderBy: desc(tenants.id) });
  if (existing) return existing;
  const [created] = await db
    .insert(tenants)
    .values({
      key: `test-${nanoid(6)}`.toLowerCase(),
      name: "Test Tenant",
      domains: [],
      themeConfig: {},
      featureFlags: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();
  return created;
}

test("Wallet ledger: credit/debit updates balance_after", async () => {
  const userId = `test:user:${nanoid(10)}`;
  const wallet = await getOrCreateWalletAccount(userId, "XOF");

  const credit = await creditWallet({
    walletAccountId: wallet.id,
    amount: 1000,
    entryType: "ADJUSTMENT",
    referenceType: "ADMIN_ADJ",
    referenceId: `adj_${nanoid(8)}`,
    metadata: { test: true },
  });

  assert.equal(Number(credit.balanceAfter), 1000);

  const debit = await debitWallet({
    walletAccountId: wallet.id,
    amount: 400,
    entryType: "PURCHASE",
    referenceType: "ORDER",
    referenceId: `ORD-${nanoid(8)}`,
    metadata: { test: true },
  });

  assert.equal(Number(debit.balanceAfter), 600);
  assert.equal(await getWalletBalance(wallet.id), 600);
});

test("Wallet transfer: creates 2 ledger entries atomically", async () => {
  const from = await getOrCreateWalletAccount(`test:from:${nanoid(10)}`, "XOF");
  const to = await getOrCreateWalletAccount(`test:to:${nanoid(10)}`, "XOF");

  await creditWallet({
    walletAccountId: from.id,
    amount: 2000,
    entryType: "ADJUSTMENT",
    referenceType: "ADMIN_ADJ",
    referenceId: `adj_${nanoid(8)}`,
    metadata: { test: true },
  });

  const result = await transferWallet({
    fromWalletAccountId: from.id,
    toWalletAccountId: to.id,
    amount: 500,
    memo: "test transfer",
    metadata: { test: true },
  });

  assert.equal(result.transfer.status, "COMPLETED");
  assert.equal(await getWalletBalance(from.id), 1500);
  assert.equal(await getWalletBalance(to.id), 500);
  assert.ok(result.debitEntry);
  assert.ok(result.creditEntry);
});

test("Wallet topup: applyTopupPaid is idempotent", async () => {
  const tenant = await ensureTenant();
  const wallet = await getOrCreateWalletAccount(`test:topup:${nanoid(10)}`, "XOF");

  const created = await initWalletTopup({
    tenantId: tenant.id,
    walletAccountId: wallet.id,
    amount: 1234,
    currency: "XOF",
    method: "PUSH",
    msisdn: "22961000000",
    operator: "MTN_BJ",
  });

  const first = await applyTopupPaid({ topupId: created.topup.id, externalRef: "txn_test", providerPayload: { test: true } });
  assert.equal(first.alreadyApplied, false);

  const second = await applyTopupPaid({ topupId: created.topup.id, externalRef: "txn_test", providerPayload: { test: true } });
  assert.equal(second.alreadyApplied, true);

  assert.equal(await getWalletBalance(wallet.id), 1234);

  const topupRow = await db.query.walletTopups.findFirst({ where: eq(walletTopups.id, created.topup.id as any) });
  assert.ok(topupRow);
  assert.equal(topupRow!.status, "PAID");

  const countEntries = await db
    .select({ c: count() })
    .from(walletLedgerEntries)
    .where(and(eq(walletLedgerEntries.referenceType, "TOPUP"), eq(walletLedgerEntries.referenceId, created.topup.id)))
    .then((rows) => Number(rows?.[0]?.c || 0));
  assert.equal(countEntries, 1);
});

test("Voucher batch: issue funds float + redeem credits wallet", async () => {
  const issuer = await getOrCreateWalletAccount(`test:issuer:${nanoid(10)}`, "XOF");
  await creditWallet({
    walletAccountId: issuer.id,
    amount: 100_000,
    entryType: "ADJUSTMENT",
    referenceType: "ADMIN_ADJ",
    referenceId: `adj_${nanoid(8)}`,
    metadata: { test: true },
  });

  const batch = await createVoucherBatch({
    issuerWalletAccountId: issuer.id,
    voucherCount: 1,
    voucherValue: 1000,
    currency: "XOF",
    commissionScheme: { sellerPct: 0.01, masterPct: 0.01 },
  });

  const issued = await issueVoucherBatch({ batchId: batch.id });
  assert.equal(issued.batch.status, "ISSUED");
  assert.equal(issued.codes.length, 1);

  const code = issued.codes[0]!.code;
  const voucherId = issued.codes[0]!.voucherId;

  const receiver = await getOrCreateWalletAccount(`test:receiver:${nanoid(10)}`, "XOF");
  assert.equal(await getWalletBalance(receiver.id), 0);

  const redeemed = await redeemVoucher({ code, toWalletAccountId: receiver.id, ip: "127.0.0.1", userAgent: "test" });
  assert.equal(redeemed.credited, 1000);
  assert.equal(await getWalletBalance(receiver.id), 1000);

  const voucherRow = await db.query.vouchers.findFirst({ where: eq(vouchers.id, voucherId as any) });
  assert.ok(voucherRow);
  assert.equal(voucherRow!.status, "REDEEMED");
});

test("Payout reverse: credits back amount + fee idempotently", async () => {
  const tenant = await ensureTenant();
  const wallet = await getOrCreateWalletAccount(`test:payout:${nanoid(10)}`, "XOF");

  await creditWallet({
    walletAccountId: wallet.id,
    amount: 50_000,
    entryType: "ADJUSTMENT",
    referenceType: "ADMIN_ADJ",
    referenceId: `adj_${nanoid(8)}`,
    metadata: { test: true },
  });

  const before = await getWalletBalance(wallet.id);

  const created = await createWalletPayoutRequest({
    tenantId: tenant.id,
    walletAccountId: wallet.id,
    amount: 10_000,
    currency: "XOF",
    payoutMethod: "MOMO_MTN_BJ",
    destination: { phone: "22961000000" },
  });

  const afterDebit = await getWalletBalance(wallet.id);
  assert.equal(afterDebit, before - created.totalDebit);

  const reversed1 = await reversePayout({ payoutId: created.payout.id, reason: "test_reverse", providerPayload: { test: true } });
  assert.equal(reversed1.alreadyApplied, false);
  assert.equal(await getWalletBalance(wallet.id), before);

  const reversed2 = await reversePayout({ payoutId: created.payout.id, reason: "test_reverse", providerPayload: { test: true } });
  assert.equal(reversed2.alreadyApplied, true);
  assert.equal(await getWalletBalance(wallet.id), before);
});
