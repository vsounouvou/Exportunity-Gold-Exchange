import { Router } from "express";
import { db } from "@db";
import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";

import { eceUsers, payments, walletAccounts, walletLedgerEntries, walletPayouts, walletTopups } from "@db/schema";
import { ensureTenantAdmin } from "./utils/auth";
import { applyTopupPaid } from "../lib/wallet/topups";
import { reversePayout } from "../lib/wallet/payouts";
import { getFlutterwaveKeys } from "../lib/flutterwave/config";
import { flutterwaveVerifyTransaction } from "../lib/flutterwave/service";

const router = Router();

router.use(ensureTenantAdmin);

function getTenantKey(tenant: any) {
  return tenant?.key === "exportunity" ? "exportunity" : "bdo";
}

async function writeWalletAuditLog(req: any, action: string, payload: Record<string, unknown>) {
  try {
    const tenantId = Number(req?.tenant?.id || 0);
    const actorUserId = Number(req?.staffUser?.id || 0) || null;
    if (!tenantId) return;
    await db.execute(sql`
      insert into audit_logs (
        tenant_id,
        actor_user_id,
        actor_role,
        action,
        entity_type,
        entity_id,
        before,
        after,
        ip,
        user_agent,
        created_at
      ) values (
        ${tenantId},
        ${actorUserId},
        'admin',
        ${action},
        'wallet',
        ${String(payload?.entityId || "wallet")},
        null,
        ${JSON.stringify(payload)}::jsonb,
        ${String(req.ip || "").slice(0, 128) || null},
        ${String(req.headers?.["user-agent"] || "").slice(0, 512) || null},
        now()
      )
    `);
  } catch {
    // best effort
  }
}

router.get("/accounts", async (req, res) => {
  try {
    const query = String(req.query.query || "").trim();
    const limit = Math.min(Math.max(parseInt(String(req.query.limit || "50"), 10) || 50, 1), 200);

    const wallets = await db.query.walletAccounts.findMany({
      where: query ? or(ilike(walletAccounts.userId, `%${query}%`)) : undefined,
      orderBy: desc(walletAccounts.updatedAt),
      limit,
    });

    const userIds = wallets
      .map((w) => Number(String(w.userId)))
      .filter((n) => Number.isFinite(n));

    const users = userIds.length ? await db.query.eceUsers.findMany({ where: (f, { inArray }) => inArray(eceUsers.id, userIds) }) : [];
    const byId = new Map(users.map((u) => [String(u.id), u]));

    const balances = new Map<string, number>();
    for (const w of wallets) {
      const latest = await db.query.walletLedgerEntries.findFirst({
        where: eq(walletLedgerEntries.walletAccountId, w.id),
        orderBy: desc(walletLedgerEntries.createdAt),
      });
      balances.set(w.id, latest ? Number(latest.balanceAfter || 0) : 0);
    }

    res.json({
      ok: true,
      items: wallets.map((w) => ({
        wallet: w,
        user: byId.get(String(w.userId)) || null,
        balance: balances.get(w.id) ?? 0,
      })),
    });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to list accounts" });
  }
});

router.get("/accounts/:walletId", async (req, res) => {
  try {
    const walletId = String(req.params.walletId || "").trim();
    if (!walletId) return res.status(400).json({ message: "walletId required" });

    const wallet = await db.query.walletAccounts.findFirst({ where: eq(walletAccounts.id, walletId as any) });
    if (!wallet) return res.status(404).json({ message: "wallet not found" });

    const userIdNum = Number(String(wallet.userId));
    const user = Number.isFinite(userIdNum) ? await db.query.eceUsers.findFirst({ where: eq(eceUsers.id, userIdNum) }) : null;

    const latest = await db.query.walletLedgerEntries.findFirst({
      where: eq(walletLedgerEntries.walletAccountId, wallet.id),
      orderBy: desc(walletLedgerEntries.createdAt),
    });
    const balance = latest ? Number(latest.balanceAfter || 0) : 0;

    const ledger = await db.query.walletLedgerEntries.findMany({
      where: eq(walletLedgerEntries.walletAccountId, wallet.id),
      orderBy: desc(walletLedgerEntries.createdAt),
      limit: 50,
    });

    res.json({ ok: true, wallet, user, balance, ledger });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to load account" });
  }
});

router.post("/accounts/:walletId/freeze", async (req, res) => {
  try {
    const walletId = String(req.params.walletId || "").trim();
    await db.update(walletAccounts).set({ status: "FROZEN", updatedAt: new Date() }).where(eq(walletAccounts.id, walletId as any));
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to freeze wallet" });
  }
});

router.post("/accounts/:walletId/unfreeze", async (req, res) => {
  try {
    const walletId = String(req.params.walletId || "").trim();
    await db.update(walletAccounts).set({ status: "ACTIVE", updatedAt: new Date() }).where(eq(walletAccounts.id, walletId as any));
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to unfreeze wallet" });
  }
});

router.get("/ledger", async (req, res) => {
  try {
    const walletId = String(req.query.walletId || "").trim();
    const entryType = String(req.query.entryType || "").trim().toUpperCase();
    const referenceType = String(req.query.referenceType || "").trim().toUpperCase();
    const q = String(req.query.q || "").trim();

    const limit = Math.min(Math.max(parseInt(String(req.query.limit || "100"), 10) || 100, 1), 200);

    const whereParts: any[] = [];
    if (walletId) whereParts.push(eq(walletLedgerEntries.walletAccountId, walletId as any));
    if (entryType) whereParts.push(eq(walletLedgerEntries.entryType, entryType as any));
    if (referenceType) whereParts.push(eq(walletLedgerEntries.referenceType, referenceType as any));
    if (q) whereParts.push(or(ilike(walletLedgerEntries.referenceId, `%${q}%`)));

    const where = whereParts.length ? and(...whereParts) : undefined;

    const items = await db.query.walletLedgerEntries.findMany({
      where,
      orderBy: desc(walletLedgerEntries.createdAt),
      limit,
    });

    res.json({ ok: true, items });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to load ledger" });
  }
});

router.get("/topups", async (req, res) => {
  try {
    const status = String(req.query.status || "").trim().toUpperCase();
    const gateway = String(req.query.gateway || "").trim().toLowerCase();
    const limit = Math.min(Math.max(parseInt(String(req.query.limit || "50"), 10) || 50, 1), 200);

    const conditions: any[] = [];
    if (status) conditions.push(eq(walletTopups.status, status as any));
    if (gateway) conditions.push(eq(walletTopups.gateway, gateway));
    const where = conditions.length ? and(...conditions) : undefined;
    const items = await db.query.walletTopups.findMany({ where, orderBy: desc(walletTopups.createdAt), limit });

    res.json({ ok: true, items });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to list topups" });
  }
});

router.post("/topups/:topupId/recheck", async (req, res) => {
  try {
    const topupId = String(req.params.topupId || "").trim();
    const topup = await db.query.walletTopups.findFirst({ where: eq(walletTopups.id, topupId as any) });
    if (!topup) return res.status(404).json({ message: "topup not found" });

    const paymentRow = topup.gatewayPaymentId ? await db.query.payments.findFirst({ where: eq(payments.id, topup.gatewayPaymentId as any) }) : null;
    if (!paymentRow) return res.status(404).json({ message: "payment not found" });

    if (String(paymentRow.provider || "").toLowerCase() === "flutterwave") {
      const tenant = req.tenant;
      const keys = getFlutterwaveKeys(getTenantKey(tenant));
      if (!keys.secretKey) {
        return res.status(503).json({ message: "Flutterwave not configured for this tenant" });
      }

      const verified = await flutterwaveVerifyTransaction({
        mode: keys.mode,
        secretKey: keys.secretKey,
        transactionId: paymentRow.providerTransactionId,
        txRef: (paymentRow as any).providerTransactionRef,
      });

      const expectedAmount = Number(paymentRow.amount || 0);
      const amountOk = verified.amount === null || Number(verified.amount) === expectedAmount;
      const expectedCurrency = String(paymentRow.currency || "XOF").toUpperCase();
      const currencyOk = !verified.currency || String(verified.currency).toUpperCase() === expectedCurrency;
      const normalized = verified.normalizedStatus;
      const nextStatus =
        normalized === "succeeded"
          ? "succeeded"
          : normalized === "failed"
            ? "failed"
            : normalized === "cancelled"
              ? "cancelled"
              : normalized === "processing"
                ? "processing"
                : "pending";

      await db
        .update(payments)
        .set({
          status: amountOk && currencyOk ? (nextStatus as any) : "failed",
          providerTransactionId: verified.transactionId || paymentRow.providerTransactionId || null,
          providerTransactionRef: verified.txRef || (paymentRow as any).providerTransactionRef || null,
          providerPayload: verified.raw ?? paymentRow.providerPayload ?? null,
          metadata: {
            ...(typeof (paymentRow as any).metadata === "object" && (paymentRow as any).metadata ? (paymentRow as any).metadata : {}),
            reason: !amountOk ? "amount_mismatch" : !currencyOk ? "currency_mismatch" : undefined,
            recheckedAt: new Date().toISOString(),
          },
          updatedAt: new Date(),
        } as any)
        .where(eq(payments.id, paymentRow.id));

      if (amountOk && currencyOk && nextStatus === "succeeded") {
        await applyTopupPaid({ topupId: topup.id, externalRef: verified.transactionId || verified.txRef || null, providerPayload: verified.raw });
        await db.update(payments).set({ creditedAt: new Date(), updatedAt: new Date() } as any).where(eq(payments.id, paymentRow.id));
      } else if (!amountOk || !currencyOk || nextStatus === "failed") {
        await db.update(walletTopups).set({ status: "FAILED", updatedAt: new Date() }).where(eq(walletTopups.id, topup.id));
      } else if (nextStatus === "cancelled") {
        await db.update(walletTopups).set({ status: "CANCELLED", updatedAt: new Date() }).where(eq(walletTopups.id, topup.id));
      }
    } else if (String(paymentRow.status) === "succeeded") {
      await applyTopupPaid({ topupId: topup.id, externalRef: paymentRow.providerTransactionId ?? null, providerPayload: paymentRow.providerPayload });
    }

    const latest = await db.query.walletTopups.findFirst({ where: eq(walletTopups.id, topup.id) });
    res.json({ ok: true, topup: latest });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to recheck topup" });
  }
});

router.get("/payouts", async (req, res) => {
  try {
    const status = String(req.query.status || "").trim().toUpperCase();
    const limit = Math.min(Math.max(parseInt(String(req.query.limit || "50"), 10) || 50, 1), 200);

    const where = status ? eq(walletPayouts.status, status as any) : undefined;
    const items = await db.query.walletPayouts.findMany({ where, orderBy: desc(walletPayouts.createdAt), limit });
    res.json({ ok: true, items });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to list payouts" });
  }
});

router.post("/payouts/:payoutId/reverse", async (req, res) => {
  try {
    const payoutId = String(req.params.payoutId || "").trim();
    const reason = String(req.body?.reason || "admin_reverse").trim();
    const out = await reversePayout({ payoutId, reason, providerPayload: { admin: true } });
    res.json({ ok: true, out });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to reverse payout" });
  }
});

router.post("/verify-ledger", async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(String(req.body?.limit || "10000"), 10) || 10000, 500), 50000);
    const entries = await db.query.walletLedgerEntries.findMany({
      orderBy: [asc(walletLedgerEntries.walletAccountId), asc(walletLedgerEntries.createdAt)],
      limit,
    });

    const balanceByWallet = new Map<string, number>();
    const issues: Array<{ walletAccountId: string; ledgerEntryId: string; expected: number; actual: number }> = [];

    for (const entry of entries) {
      const walletId = String(entry.walletAccountId);
      const previous = balanceByWallet.get(walletId) || 0;
      const amount = Number(entry.amount || 0);
      const direction = String(entry.direction || "").toUpperCase();
      const expected = direction === "DEBIT" ? previous - amount : previous + amount;
      const actual = Number(entry.balanceAfter || 0);
      if (expected !== actual) {
        issues.push({
          walletAccountId: walletId,
          ledgerEntryId: String(entry.id),
          expected,
          actual,
        });
      }
      balanceByWallet.set(walletId, actual);
    }

    const summary = {
      ok: issues.length === 0,
      checkedEntries: entries.length,
      checkedWallets: balanceByWallet.size,
      mismatchCount: issues.length,
      sampledIssues: issues.slice(0, 100),
      checkedAt: new Date().toISOString(),
    };

    await writeWalletAuditLog(req, "WALLET_LEDGER_VERIFY", {
      entityId: "ledger",
      ...summary,
    });

    return res.json(summary);
  } catch (err: any) {
    return res.status(500).json({ message: err?.message || "Failed to verify ledger" });
  }
});

router.post("/recompute-balances", async (req, res) => {
  try {
    const wallets = await db.query.walletAccounts.findMany({
      orderBy: desc(walletAccounts.updatedAt),
      limit: 10000,
    });
    let touched = 0;

    for (const wallet of wallets) {
      const latest = await db.query.walletLedgerEntries.findFirst({
        where: eq(walletLedgerEntries.walletAccountId, wallet.id),
        orderBy: desc(walletLedgerEntries.createdAt),
      });
      if (!latest) continue;
      touched += 1;
      await db.update(walletAccounts).set({ updatedAt: new Date() }).where(eq(walletAccounts.id, wallet.id));
    }

    const result = {
      ok: true,
      scannedWallets: wallets.length,
      touchedWallets: touched,
      processedAt: new Date().toISOString(),
      note: "wallet_accounts.updated_at was refreshed for wallets with ledger activity.",
    };

    await writeWalletAuditLog(req, "WALLET_BALANCE_RECOMPUTE", {
      entityId: "accounts",
      ...result,
    });

    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ message: err?.message || "Failed to recompute balances" });
  }
});

export default router;
