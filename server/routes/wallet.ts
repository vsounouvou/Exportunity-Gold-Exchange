import { Router } from "express";
import { db } from "@db";
import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";

import { eceSessions, eceUsers, payments, walletAccounts, walletLedgerEntries, walletPayouts, walletTopups } from "@db/schema";
import { getKkiapayConfig, getKkiapayPublicKeyEnvVarNames, getRequestOrigin } from "../lib/kkiapay/config";
import { kkiapayPushInit, kkiapayVerifyTransaction } from "../lib/kkiapay/push";
import { kkiapayPayoutInit } from "../lib/kkiapay/payout";
import { computePayoutFee, PAYOUT_MIN_XOF } from "../lib/wallet/config";
import { createWalletPayoutRequest, markPayoutProcessing, payoutReference, reversePayout } from "../lib/wallet/payouts";
import { redeemVoucher } from "../lib/wallet/vouchers";
import { createWalletTransfer } from "../lib/wallet/transfers";
import { getOrCreateWalletAccount } from "../lib/wallet/wallet";
import { applyTopupPaid, initWalletTopup, topupReference } from "../lib/wallet/topups";
import { getWalletTopupQrTokenSecret, signWalletTopupQrToken } from "../lib/wallet/qr-topup-token";

const router = Router();

type WalletIdentity =
  | {
      kind: "USER";
      userId: string;
      email: string | null;
      displayName: string | null;
      user: any;
    }
  | {
      kind: "GUEST";
      userId: string;
      email: string;
      displayName: string;
      user: null;
    };

async function requireIdentity(req: any, res: any): Promise<WalletIdentity | null> {
  const authHeader = String(req.headers.authorization || "");
  const hasBearer = authHeader.startsWith("Bearer ");
  const token = hasBearer ? authHeader.slice("Bearer ".length).trim() : "";

  if (token) {
    const session = await db.query.eceSessions.findFirst({ where: eq(eceSessions.token, token) });
    if (session && new Date(session.expiresAt) > new Date()) {
      const user = await db.query.eceUsers.findFirst({ where: eq(eceUsers.id, session.userId) });
      if (user) {
        return {
          kind: "USER",
          userId: String(user.id),
          email: user.email ? String(user.email) : null,
          displayName: user.displayName ? String(user.displayName) : null,
          user,
        };
      }
    }
  }

  const guestSessionId = String(req.headers["x-guest-session"] || "").trim();
  if (guestSessionId) {
    const guestId = `guest:${guestSessionId}`.toLowerCase();
    return {
      kind: "GUEST",
      userId: guestId,
      email: guestId,
      displayName: "Guest",
      user: null,
    };
  }

  if (token) {
    res.status(401).json({ message: "Session expired" });
    return null;
  }

  res.status(401).json({ message: "Authentication required" });
  return null;
}

function requireTenant(req: any, res: any) {
  const tenant = req.tenant;
  if (!tenant) {
    res.status(500).json({ message: "Tenant not resolved" });
    return null;
  }
  return tenant;
}

function parseAmount(value: any) {
  const parsed = typeof value === "number" ? value : Number(String(value ?? ""));
  if (!Number.isFinite(parsed)) return null;
  const rounded = Math.trunc(parsed);
  return rounded > 0 ? rounded : null;
}

function normalizeMsisdn(value: any): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  return digits ? digits : null;
}

function normalizeOperator(value: any): string | null {
  const raw = String(value ?? "").trim();
  return raw ? raw.toUpperCase() : null;
}

function normalizeNext(value: any): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (!raw.startsWith("/")) return null;
  if (raw.startsWith("//")) return null;
  if (raw.includes("://")) return null;
  return raw;
}

function normalizeTransactionId(value: any): string | null {
  const raw = String(value ?? "").trim();
  return raw ? raw : null;
}

function extractTransactionId(query: any): string | null {
  return (
    normalizeTransactionId(query?.transactionId) ||
    normalizeTransactionId(query?.transaction_id) ||
    normalizeTransactionId(query?.transaction) ||
    normalizeTransactionId(query?.id) ||
    null
  );
}

function pickString(value: any): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function pickNumber(value: any): number | null {
  const num = typeof value === "number" ? value : Number(String(value ?? ""));
  return Number.isFinite(num) ? num : null;
}

function extractVerifyReference(raw: any): string | null {
  const root = raw ?? {};
  const data = root?.data ?? root?.transaction ?? root?.payment ?? null;
  const metadata = root?.metadata ?? data?.metadata ?? null;
  const candidates = [
    root?.reference,
    root?.paymentId,
    root?.payment_id,
    root?.ref,
    root?.partnerId,
    root?.partnerid,
    data?.reference,
    data?.paymentId,
    data?.payment_id,
    data?.ref,
    data?.partnerId,
    metadata?.reference,
    metadata?.paymentId,
    metadata?.payment_id,
    metadata?.ref,
    metadata?.partnerId,
  ];
  for (const c of candidates) {
    const s = pickString(c);
    if (s) return s;
  }
  return null;
}

function extractVerifyAmount(raw: any): number | null {
  const root = raw ?? {};
  const data = root?.data ?? root?.transaction ?? root?.payment ?? null;
  const candidates = [root?.amount, data?.amount, root?.totalAmount, data?.totalAmount, data?.total_amount];
  for (const c of candidates) {
    const n = pickNumber(c);
    if (n !== null) return Math.round(n);
  }
  return null;
}

function extractVerifyCurrency(raw: any): string | null {
  const root = raw ?? {};
  const data = root?.data ?? root?.transaction ?? root?.payment ?? null;
  const candidates = [root?.currency, data?.currency, root?.currencyCode, data?.currencyCode];
  for (const c of candidates) {
    const s = pickString(c);
    if (s) return s.trim().toUpperCase();
  }
  return null;
}

function safeJsonIncludes(value: any, needle: string): boolean {
  const n = String(needle || "").trim();
  if (!n) return false;
  try {
    return JSON.stringify(value ?? {}).includes(n);
  } catch {
    return false;
  }
}

router.get("/summary", async (req, res) => {
  try {
    const identity = await requireIdentity(req, res);
    if (!identity) return;

    const wallet = await getOrCreateWalletAccount(identity.userId, "XOF");
    const latest = await db.query.walletLedgerEntries.findFirst({
      where: eq(walletLedgerEntries.walletAccountId, wallet.id),
      orderBy: desc(walletLedgerEntries.createdAt),
    });
    const balance = latest ? Number(latest.balanceAfter || 0) : 0;

    const entries = await db.query.walletLedgerEntries.findMany({
      where: eq(walletLedgerEntries.walletAccountId, wallet.id),
      orderBy: desc(walletLedgerEntries.createdAt),
      limit: 20,
    });

    res.json({
      ok: true,
      wallet: { id: wallet.id, currency: wallet.currency, balance, status: wallet.status, kycLevel: wallet.kycLevel },
      recent: entries,
      payout: {
        minAmount: PAYOUT_MIN_XOF,
        fee: { fixed: Number(process.env.PAYOUT_FEE_FIXED_XOF || 500), pct: Number(process.env.PAYOUT_FEE_PCT || 0.02) },
        methods: ["MOMO_MTN_BJ", "MOMO_MOOV_BJ"],
      },
    });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to load wallet summary" });
  }
});

router.get("/ledger", async (req, res) => {
  try {
    const identity = await requireIdentity(req, res);
    if (!identity) return;

    const wallet = await getOrCreateWalletAccount(identity.userId, "XOF");

    const limit = Math.min(Math.max(parseInt(String(req.query.limit || "50"), 10) || 50, 1), 100);
    const cursor = String(req.query.cursor || "").trim();
    const cursorDate = cursor ? new Date(cursor) : null;

    const where = cursorDate && !Number.isNaN(cursorDate.getTime())
      ? and(eq(walletLedgerEntries.walletAccountId, wallet.id), sql`${walletLedgerEntries.createdAt} < ${cursorDate}`)
      : eq(walletLedgerEntries.walletAccountId, wallet.id);

    const items = await db.query.walletLedgerEntries.findMany({
      where: where as any,
      orderBy: desc(walletLedgerEntries.createdAt),
      limit,
    });

    const nextCursor = items.length ? items[items.length - 1].createdAt?.toISOString?.() ?? null : null;
    res.json({ ok: true, items, nextCursor });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to load ledger" });
  }
});

router.post("/topups/init", async (req, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const identity = await requireIdentity(req, res);
    if (!identity) return;

    const amount = parseAmount(req.body?.amount);
    if (!amount) return res.status(400).json({ message: "amount is required" });

    const method = String(req.body?.method || "PUSH").trim().toUpperCase() === "WIDGET" ? "WIDGET" : "PUSH";
    const msisdn = method === "PUSH" ? normalizeMsisdn(req.body?.phone) : null;
    const operator = method === "PUSH" ? normalizeOperator(req.body?.operator) : null;
    if (method === "PUSH" && !msisdn) return res.status(400).json({ message: "phone is required" });
    if (method === "PUSH" && !operator) return res.status(400).json({ message: "operator is required" });

    const wallet = await getOrCreateWalletAccount(identity.userId, "XOF");

    const { topup, payment } = await initWalletTopup({
      tenantId: tenant.id,
      walletAccountId: wallet.id,
      amount,
      currency: "XOF",
      method,
      userId: identity.userId,
      msisdn,
      operator,
    });

    const tenantKey = tenant.key === "exportunity" ? "exportunity" : "bdo";
    const { publicKey, mode } = getKkiapayConfig(tenantKey);
    if (!publicKey) {
      const names = getKkiapayPublicKeyEnvVarNames(tenantKey, mode);
      return res.status(503).json({
        message: `KKiaPay is not configured for this tenant (missing public key). Mode: ${mode}. Set one of: ${names.join(", ")}`,
      });
    }

    const origin = getRequestOrigin(req);
    const next = normalizeNext(req.body?.next || req.body?.returnTo);
    const callbackQs = new URLSearchParams({ topupId: String(topup.id) });
    if (next) callbackQs.set("next", next);
    const callbackUrl = origin ? `${origin}/wallet/topup/return?${callbackQs.toString()}` : `/wallet/topup/return?${callbackQs.toString()}`;

    if (method === "WIDGET") {
      await db.update(walletTopups).set({ status: "PENDING", updatedAt: new Date() }).where(eq(walletTopups.id, topup.id));
      return res.json({
        ok: true,
        topupId: topup.id,
        paymentId: payment.id,
        method,
        widget: {
          paymentId: payment.id,
          publicKey,
          amount,
          currency: "XOF",
          reference: topupReference(topup.id),
          callbackUrl,
          mode,
          description: "Achat de crédit / voucher Exportunity",
        },
      });
    }

    const push = await kkiapayPushInit({
      amount,
      currency: "XOF",
      msisdn: msisdn!,
      operator: operator!,
      reference: topupReference(topup.id),
      buyerEmail: identity.kind === "USER" ? (identity.email ? identity.email.trim() : null) : identity.email,
      buyerName: identity.kind === "USER" ? (identity.displayName ? identity.displayName.trim() : null) : identity.displayName,
      widgetHost: origin,
      mode,
      publicKey,
      reason: "Achat de crédit / voucher Exportunity",
    } as any);

    await db
      .update(payments)
      .set({
        providerTransactionId: push.transactionId ?? payment.providerTransactionId ?? null,
        providerPayload: push.raw ?? null,
        pushStatus: String(push.raw?.status || push.raw?.state || "requested"),
        pushRequestedAt: new Date(),
        status: "pending",
        updatedAt: new Date(),
      })
      .where(eq(payments.id, payment.id));

    await db.update(walletTopups).set({ status: "PENDING", updatedAt: new Date() }).where(eq(walletTopups.id, topup.id));

    return res.json({
      ok: true,
      topupId: topup.id,
      paymentId: payment.id,
      method,
      status: "PENDING",
      providerTransactionId: push.transactionId ?? null,
      callbackUrl,
    });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to init topup" });
  }
});

router.get("/topups/status", async (req, res) => {
  try {
    const identity = await requireIdentity(req, res);
    if (!identity) return;

    const topupId = String(req.query.topupId || "").trim();
    if (!topupId) return res.status(400).json({ message: "topupId is required" });

    const wallet = await getOrCreateWalletAccount(identity.userId, "XOF");
    const topup = await db.query.walletTopups.findFirst({
      where: and(eq(walletTopups.id, topupId as any), eq(walletTopups.walletAccountId, wallet.id)),
    });
    if (!topup) return res.status(404).json({ message: "Topup not found" });

    const paymentRow = topup.gatewayPaymentId
      ? await db.query.payments.findFirst({ where: eq(payments.id, topup.gatewayPaymentId as any) })
      : null;

    let verification: any = null;
    const transactionId = extractTransactionId(req.query);

    if (transactionId && paymentRow && topup.status !== "PAID" && String(paymentRow.status).toLowerCase() !== "succeeded") {
      const tenant = requireTenant(req, res);
      if (!tenant) return;

      const tenantKey = tenant.key === "exportunity" ? "exportunity" : "bdo";
      const { publicKey, privateKey, secret, mode } = getKkiapayConfig(tenantKey);

      if (!publicKey || !privateKey || !secret) {
        verification = { attempted: true, ok: false, reason: "missing_kki_keys" };
      } else {
        try {
          const verified = await kkiapayVerifyTransaction({
            transactionId,
            mode,
            publicKey,
            privateKey,
            secret,
          });

          const expectedRef = topupReference(topup.id);
          const verifyRef = extractVerifyReference(verified.raw);
          const refOk =
            (verifyRef
              ? verifyRef.includes(expectedRef) || verifyRef.includes(paymentRow.id) || verifyRef.includes(topup.id)
              : safeJsonIncludes(verified.raw, expectedRef) || safeJsonIncludes(verified.raw, paymentRow.id) || safeJsonIncludes(verified.raw, topup.id)) || false;

          const verifyAmount = extractVerifyAmount(verified.raw);
          const amountOk = verifyAmount === null || Math.round(verifyAmount) === Math.round(Number(topup.amount || 0));

          const verifyCurrency = extractVerifyCurrency(verified.raw);
          const currencyOk = verifyCurrency === null || verifyCurrency === String(topup.currency || "XOF").toUpperCase();

          if (!refOk) {
            verification = {
              attempted: true,
              ok: false,
              normalizedStatus: verified.normalizedStatus,
              reason: "reference_mismatch",
            };
          } else if (!amountOk) {
            verification = {
              attempted: true,
              ok: false,
              normalizedStatus: verified.normalizedStatus,
              reason: "amount_mismatch",
              expectedAmount: Number(topup.amount || 0),
              gotAmount: verifyAmount,
            };
          } else if (!currencyOk) {
            verification = {
              attempted: true,
              ok: false,
              normalizedStatus: verified.normalizedStatus,
              reason: "currency_mismatch",
              expectedCurrency: String(topup.currency || "XOF"),
              gotCurrency: verifyCurrency,
            };
          } else {
            const normalized = verified.normalizedStatus;
            const paymentStatus =
              normalized === "succeeded"
                ? "succeeded"
                : normalized === "failed"
                  ? "failed"
                  : normalized === "cancelled"
                    ? "cancelled"
                    : normalized === "refunded"
                      ? "refunded"
                      : normalized === "processing"
                        ? "processing"
                        : "pending";

            await db
              .update(payments)
              .set({
                status: paymentStatus as any,
                providerTransactionId: transactionId,
                providerPayload: verified.raw ?? paymentRow.providerPayload ?? null,
                updatedAt: new Date(),
              })
              .where(and(eq(payments.id, paymentRow.id), eq(payments.tenantId, tenant.id)));

            if (normalized === "succeeded") {
              await applyTopupPaid({ topupId: topup.id, externalRef: transactionId, providerPayload: verified.raw ?? null });
              verification = { attempted: true, ok: true, normalizedStatus: normalized };
            } else if (normalized === "failed") {
              await db.update(walletTopups).set({ status: "FAILED", updatedAt: new Date() }).where(eq(walletTopups.id, topup.id));
              verification = { attempted: true, ok: true, normalizedStatus: normalized };
            } else if (normalized === "cancelled" || normalized === "refunded") {
              await db.update(walletTopups).set({ status: "CANCELLED", updatedAt: new Date() }).where(eq(walletTopups.id, topup.id));
              verification = { attempted: true, ok: true, normalizedStatus: normalized };
            } else {
              verification = { attempted: true, ok: true, normalizedStatus: normalized };
            }
          }
        } catch (err: any) {
          verification = { attempted: true, ok: false, reason: err?.message || "verify_failed" };
        }
      }
    }

    // Healing: if payment is already succeeded but topup not applied, apply now.
    if (paymentRow && String(paymentRow.status) === "succeeded" && topup.status !== "PAID") {
      await applyTopupPaid({ topupId: topup.id, externalRef: paymentRow.providerTransactionId ?? null, providerPayload: paymentRow.providerPayload });
    }

    const latest = await db.query.walletTopups.findFirst({ where: eq(walletTopups.id, topup.id) });
    const latestPayment = paymentRow ? await db.query.payments.findFirst({ where: eq(payments.id, paymentRow.id) }) : null;

    res.json({
      ok: true,
      verification,
      topup: latest,
      payment: latestPayment ? { id: latestPayment.id, status: latestPayment.status, providerTransactionId: latestPayment.providerTransactionId } : null,
    });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to get topup status" });
  }
});

router.post("/qr-token", async (req, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const identity = await requireIdentity(req, res);
    if (!identity) return;

    const secret = getWalletTopupQrTokenSecret();
    if (!secret) {
      return res.status(503).json({ message: "QR top up is not configured (missing WALLET_QR_TOKEN_SECRET or VOUCHER_CODE_SALT)" });
    }

    const wallet = await getOrCreateWalletAccount(identity.userId, "XOF");
    const tenantKey = tenant.key === "exportunity" ? "exportunity" : "bdo";

    const now = Date.now();
    const ttlMs = 10 * 60 * 1000;
    const token = signWalletTopupQrToken(
      {
        v: 1,
        tenantKey,
        walletAccountId: wallet.id,
        userId: identity.userId,
        displayName: identity.displayName ?? null,
        iat: now,
        exp: now + ttlMs,
      },
      secret,
    );

    const origin = getRequestOrigin(req);
    const url = origin
      ? `${origin}/seller/topup?token=${encodeURIComponent(token)}`
      : `/seller/topup?token=${encodeURIComponent(token)}`;

    res.setHeader("Cache-Control", "no-store");
    res.json({
      ok: true,
      token,
      expiresAt: new Date(now + ttlMs).toISOString(),
      url,
      wallet: { id: wallet.id, shortId: wallet.id.slice(0, 8) },
      user: { displayName: identity.displayName ?? null },
    });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to create QR token" });
  }
});

router.get("/sellers/recent", async (req, res) => {
  try {
    const identity = await requireIdentity(req, res);
    if (!identity) return;

    const wallet = await getOrCreateWalletAccount(identity.userId, "XOF");
    const entries = await db.query.walletLedgerEntries.findMany({
      where: eq(walletLedgerEntries.walletAccountId, wallet.id),
      orderBy: desc(walletLedgerEntries.createdAt),
      limit: 200,
    });

    const bySeller = new Map<
      string,
      { sellerUserId: string; sellerRoleId?: string | null; lastAt: string; lastAmount: number }
    >();

    for (const entry of entries) {
      if (entry.direction !== "CREDIT") continue;
      if (entry.entryType !== "TRANSFER") continue;
      const meta = (entry as any).metadata || {};
      if (String(meta.kind || "").toUpperCase() !== "SELLER_CASHIN") continue;
      const sellerUserId = String(meta.sellerUserId || "").trim();
      if (!sellerUserId) continue;
      if (bySeller.has(sellerUserId)) continue;
      bySeller.set(sellerUserId, {
        sellerUserId,
        sellerRoleId: meta.sellerRoleId ? String(meta.sellerRoleId) : null,
        lastAt: entry.createdAt?.toISOString?.() ?? new Date().toISOString(),
        lastAmount: Number(entry.amount || 0),
      });
    }

    const sellerIds = Array.from(bySeller.keys())
      .map((id) => Number(id))
      .filter((n) => Number.isFinite(n) && n > 0) as number[];

    const sellers = sellerIds.length
      ? await db.query.eceUsers.findMany({
          where: inArray(eceUsers.id, sellerIds),
          columns: { id: true, displayName: true, country: true, primaryTerritoryId: true },
        })
      : [];

    const sellerMap = new Map<number, (typeof sellers)[number]>();
    for (const s of sellers) sellerMap.set(Number(s.id), s);

    const items = Array.from(bySeller.values())
      .map((row) => {
        const userIdNum = Number(row.sellerUserId);
        const userRow = Number.isFinite(userIdNum) ? sellerMap.get(userIdNum) : null;
        return {
          sellerUserId: row.sellerUserId,
          sellerRoleId: row.sellerRoleId ?? null,
          displayName: userRow?.displayName ?? null,
          country: userRow?.country ?? null,
          primaryTerritoryId: userRow?.primaryTerritoryId ?? null,
          lastTopupAt: row.lastAt,
          lastAmount: row.lastAmount,
        };
      })
      .sort((a, b) => String(b.lastTopupAt).localeCompare(String(a.lastTopupAt)));

    res.json({ ok: true, items });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to load recent sellers" });
  }
});

router.get("/sellers/favorites", async (req, res) => {
  try {
    const identity = await requireIdentity(req, res);
    if (!identity) return;
    if (identity.kind !== "USER") return res.json({ ok: true, favorites: [] });

    const prefs = (identity.user?.metadata as any)?.preferences ?? {};
    const favorites = Array.isArray(prefs.walletFavoriteSellers) ? prefs.walletFavoriteSellers.map(String) : [];
    res.json({ ok: true, favorites: favorites.slice(0, 50) });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to load favorites" });
  }
});

router.post("/sellers/favorite", async (req, res) => {
  try {
    const identity = await requireIdentity(req, res);
    if (!identity) return;
    if (identity.kind !== "USER") return res.status(403).json({ message: "Favorites require an account" });

    const sellerUserId = String(req.body?.sellerUserId || "").trim();
    if (!sellerUserId) return res.status(400).json({ message: "sellerUserId is required" });

    const favorite = req.body?.favorite !== false;

    const currentMeta = (identity.user?.metadata as any) ?? {};
    const currentPrefs = currentMeta.preferences && typeof currentMeta.preferences === "object" ? currentMeta.preferences : {};
    const currentFavs = Array.isArray(currentPrefs.walletFavoriteSellers) ? currentPrefs.walletFavoriteSellers.map(String) : [];

    const set = new Set(currentFavs);
    if (favorite) set.add(sellerUserId);
    else set.delete(sellerUserId);

    const nextFavs = Array.from(set.values()).slice(0, 50);
    const nextMeta = { ...currentMeta, preferences: { ...currentPrefs, walletFavoriteSellers: nextFavs } };

    await db.update(eceUsers).set({ metadata: nextMeta, updatedAt: new Date() }).where(eq(eceUsers.id, identity.user.id));

    res.json({ ok: true, favorites: nextFavs });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to update favorites" });
  }
});

router.post("/transfers", async (req, res) => {
  try {
    const identity = await requireIdentity(req, res);
    if (!identity) return;
    if (identity.kind !== "USER") return res.status(403).json({ message: "Transfers require an account" });

    const to = String(req.body?.to || "").trim();
    if (!to) return res.status(400).json({ message: "to is required" });
    const amount = parseAmount(req.body?.amount);
    if (!amount) return res.status(400).json({ message: "amount is required" });
    const memo = typeof req.body?.memo === "string" ? req.body.memo.trim() : null;

    const senderWallet = await getOrCreateWalletAccount(identity.userId, "XOF");

    const needle = to.toLowerCase();
    const recipient =
      (Number.isFinite(Number(needle)) ? await db.query.eceUsers.findFirst({ where: eq(eceUsers.id, Number(needle)) }) : null) ||
      (needle.includes("@") ? await db.query.eceUsers.findFirst({ where: eq(eceUsers.email, needle) }) : null) ||
      (await db.query.eceUsers.findFirst({
        where: or(ilike(eceUsers.phone, `%${needle}%`), ilike(eceUsers.displayName, `%${needle}%`)),
        orderBy: desc(eceUsers.id),
      }));

    if (!recipient) return res.status(404).json({ message: "Recipient not found" });

    const recipientWallet = await getOrCreateWalletAccount(String(recipient.id), "XOF");

    const transfer = await createWalletTransfer({
      fromWalletAccountId: senderWallet.id,
      toWalletAccountId: recipientWallet.id,
      amount,
      memo,
      metadata: { memo },
    });

    res.json({ ok: true, transfer });
  } catch (err: any) {
    const msg = String(err?.message || "");
    if (msg.includes("insufficient_balance")) return res.status(400).json({ message: "Insufficient balance" });
    res.status(500).json({ message: err?.message || "Transfer failed" });
  }
});

router.post("/vouchers/redeem", async (req, res) => {
  try {
    const identity = await requireIdentity(req, res);
    if (!identity) return;

    const code = String(req.body?.code || "").trim();
    if (!code) return res.status(400).json({ message: "code is required" });

    const wallet = await getOrCreateWalletAccount(identity.userId, "XOF");
    const result = await redeemVoucher({
      code,
      toWalletAccountId: wallet.id,
      ip: String(req.ip || "").trim() || null,
      userAgent: String(req.headers["user-agent"] || "").trim() || null,
    });

    res.json({ ok: true, result });
  } catch (err: any) {
    res.status(400).json({ message: err?.message || "Redeem failed" });
  }
});

router.post("/payouts/request", async (req, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const identity = await requireIdentity(req, res);
    if (!identity) return;
    if (identity.kind !== "USER") return res.status(403).json({ message: "Withdrawals require an account" });

    const amount = parseAmount(req.body?.amount);
    if (!amount) return res.status(400).json({ message: "amount is required" });

    const payoutMethod = String(req.body?.payout_method || req.body?.payoutMethod || "").trim();
    if (!payoutMethod) return res.status(400).json({ message: "payout_method is required" });

    const destination = (req.body?.destination && typeof req.body.destination === "object") ? req.body.destination : {};
    const wallet = await getOrCreateWalletAccount(identity.userId, "XOF");

    const fee = computePayoutFee(amount);
    const created = await createWalletPayoutRequest({
      tenantId: tenant.id,
      walletAccountId: wallet.id,
      amount,
      currency: "XOF",
      payoutMethod,
      destination,
    });

    const tenantKey = tenant.key === "exportunity" ? "exportunity" : "bdo";
    const { publicKey, privateKey, secret, mode } = getKkiapayConfig(tenantKey);
    if (!publicKey || !privateKey || !secret) {
      await reversePayout({ payoutId: created.payout.id, reason: "gateway_not_configured", providerPayload: null });
      return res.status(503).json({ message: "KKiaPay payout is not configured for this tenant" });
    }

    try {
      const out = await kkiapayPayoutInit({
        amount: created.netAmount,
        currency: "XOF",
        payoutMethod,
        destination,
        reference: payoutReference(created.payout.id),
        description: "Paiement fournisseur / intermédiaire",
        mode,
        publicKey,
        privateKey,
        secret,
      });

      await markPayoutProcessing({
        payoutId: created.payout.id,
        externalRef: out.externalRef,
        providerPayload: out.raw,
      });

      res.json({
        ok: true,
        payoutId: created.payout.id,
        status: "PROCESSING",
        externalRef: out.externalRef,
        fee: { amount: created.feeAmount, totalDebit: created.totalDebit },
      });
    } catch (err: any) {
      await reversePayout({ payoutId: created.payout.id, reason: "gateway_init_failed", providerPayload: { error: err?.message || String(err) } });
      return res.status(502).json({ message: err?.message || "Failed to send payout" });
    }
  } catch (err: any) {
    const msg = String(err?.message || "");
    if (msg.includes("min_payout")) return res.status(400).json({ message: `Minimum payout is ${PAYOUT_MIN_XOF} XOF` });
    if (msg.includes("insufficient_balance")) return res.status(400).json({ message: "Insufficient balance" });
    res.status(500).json({ message: err?.message || "Failed to request payout" });
  }
});

router.get("/payouts/status", async (req, res) => {
  try {
    const identity = await requireIdentity(req, res);
    if (!identity) return;
    if (identity.kind !== "USER") return res.status(403).json({ message: "Withdrawals require an account" });

    const payoutId = String(req.query.payoutId || "").trim();
    if (!payoutId) return res.status(400).json({ message: "payoutId is required" });

    const wallet = await getOrCreateWalletAccount(identity.userId, "XOF");
    const payout = await db.query.walletPayouts.findFirst({
      where: and(eq(walletPayouts.id, payoutId as any), eq(walletPayouts.walletAccountId, wallet.id)),
    });
    if (!payout) return res.status(404).json({ message: "Payout not found" });

    res.json({ ok: true, payout });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to get payout status" });
  }
});

export default router;
