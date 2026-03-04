import { Router } from "express";
import { db } from "@db";
import { and, desc, eq, inArray } from "drizzle-orm";

import { eceSessions, eceUsers, userTenantRoles, walletAccounts, walletLedgerEntries, walletRoles } from "@db/schema";
import { getWalletTopupQrTokenSecret, verifyWalletTopupQrToken } from "../lib/wallet/qr-topup-token";
import { createWalletTransfer } from "../lib/wallet/transfers";
import { getOrCreateWalletAccount } from "../lib/wallet/wallet";

const router = Router();

function requireTenant(req: any, res: any) {
  const tenant = req.tenant;
  if (!tenant) {
    res.status(500).json({ message: "Tenant not resolved" });
    return null;
  }
  return tenant;
}

async function requireUser(req: any, res: any) {
  const authHeader = String(req.headers.authorization || "");
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : "";
  if (!token) {
    res.status(401).json({ message: "Authentication required" });
    return null;
  }

  const session = await db.query.eceSessions.findFirst({ where: eq(eceSessions.token, token) });
  if (!session || new Date(session.expiresAt) < new Date()) {
    res.status(401).json({ message: "Session expired" });
    return null;
  }

  const user = await db.query.eceUsers.findFirst({ where: eq(eceUsers.id, session.userId) });
  if (!user) {
    res.status(401).json({ message: "Not authenticated" });
    return null;
  }

  return user;
}

async function requireSellerRole(req: any, res: any, user: any) {
  const tenant = requireTenant(req, res);
  if (!tenant) return null;

  const tenantRole = await db.query.userTenantRoles.findFirst({
    where: and(eq(userTenantRoles.tenantId, tenant.id), eq(userTenantRoles.userId, user.id)),
    columns: { id: true },
  });
  if (!tenantRole) {
    res.status(403).json({ message: "Seller not enabled for this tenant" });
    return null;
  }

  const seller = await db.query.walletRoles.findFirst({
    where: and(eq(walletRoles.userId, String(user.id)), eq(walletRoles.role, "SELLER"), eq(walletRoles.status, "ACTIVE")),
  });
  if (!seller) {
    res.status(403).json({ message: "Seller role required" });
    return null;
  }

  return { tenant, seller };
}

function parseAmount(value: any) {
  const parsed = typeof value === "number" ? value : Number(String(value ?? ""));
  if (!Number.isFinite(parsed)) return null;
  const rounded = Math.trunc(parsed);
  return rounded > 0 ? rounded : null;
}

function safeCustomerLabel(userId: string, displayName: string | null | undefined) {
  const name = String(displayName || "").trim();
  if (name) return name;
  if (userId.startsWith("guest:")) return "Guest";
  const last4 = userId.replace(/\D/g, "").slice(-4);
  return last4 ? `Client ${last4}` : "Client";
}

router.post("/topup/resolve", async (req, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const user = await requireUser(req, res);
    if (!user) return;
    const role = await requireSellerRole(req, res, user);
    if (!role) return;

    const secret = getWalletTopupQrTokenSecret();
    if (!secret) return res.status(503).json({ message: "QR top up not configured" });

    const token = String(req.body?.token || "").trim();
    if (!token) return res.status(400).json({ message: "token is required" });

    const verified = verifyWalletTopupQrToken(token, secret);
    if (!verified.ok || !verified.payload) {
      return res.status(400).json({ message: `invalid_token:${verified.reason || "unknown"}` });
    }

    const tenantKey = tenant.key === "exportunity" ? "exportunity" : "bdo";
    if (verified.payload.tenantKey !== tenantKey) {
      return res.status(400).json({ message: "token_tenant_mismatch" });
    }

    const customerWallet = await db.query.walletAccounts.findFirst({
      where: and(eq(walletAccounts.id, verified.payload.walletAccountId as any), eq(walletAccounts.userId, verified.payload.userId)),
    });
    if (!customerWallet) return res.status(404).json({ message: "customer wallet not found" });

    let customerDisplayName: string | null = verified.payload.displayName ? String(verified.payload.displayName) : null;
    const userIdNum = Number(verified.payload.userId);
    if (Number.isFinite(userIdNum) && userIdNum > 0) {
      const customerUser = await db.query.eceUsers.findFirst({
        where: eq(eceUsers.id, userIdNum),
        columns: { displayName: true },
      });
      if (customerUser?.displayName) customerDisplayName = String(customerUser.displayName);
    }

    res.json({
      ok: true,
      customer: {
        userId: verified.payload.userId,
        displayName: safeCustomerLabel(verified.payload.userId, customerDisplayName),
        walletAccountId: customerWallet.id,
        walletShortId: String(customerWallet.id).slice(0, 8),
      },
      expiresAt: new Date(verified.payload.exp).toISOString(),
    });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to resolve topup token" });
  }
});

router.post("/topup", async (req, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const user = await requireUser(req, res);
    if (!user) return;
    const role = await requireSellerRole(req, res, user);
    if (!role) return;

    const secret = getWalletTopupQrTokenSecret();
    if (!secret) return res.status(503).json({ message: "QR top up not configured" });

    const token = String(req.body?.token || "").trim();
    if (!token) return res.status(400).json({ message: "token is required" });

    const amount = parseAmount(req.body?.amount);
    if (!amount) return res.status(400).json({ message: "amount is required" });
    if (amount < 500) return res.status(400).json({ message: "Minimum top up is 500 XOF" });

    const verified = verifyWalletTopupQrToken(token, secret);
    if (!verified.ok || !verified.payload) {
      return res.status(400).json({ message: `invalid_token:${verified.reason || "unknown"}` });
    }

    const tenantKey = tenant.key === "exportunity" ? "exportunity" : "bdo";
    if (verified.payload.tenantKey !== tenantKey) {
      return res.status(400).json({ message: "token_tenant_mismatch" });
    }

    const customerWallet = await db.query.walletAccounts.findFirst({
      where: and(eq(walletAccounts.id, verified.payload.walletAccountId as any), eq(walletAccounts.userId, verified.payload.userId)),
    });
    if (!customerWallet) return res.status(404).json({ message: "customer wallet not found" });

    const sellerWallet = await getOrCreateWalletAccount(String(user.id), "XOF");

    let customerDisplayName: string | null = verified.payload.displayName ? String(verified.payload.displayName) : null;
    const userIdNum = Number(verified.payload.userId);
    if (Number.isFinite(userIdNum) && userIdNum > 0) {
      const customerUser = await db.query.eceUsers.findFirst({
        where: eq(eceUsers.id, userIdNum),
        columns: { displayName: true },
      });
      if (customerUser?.displayName) customerDisplayName = String(customerUser.displayName);
    }

    const customerLabel = safeCustomerLabel(verified.payload.userId, customerDisplayName);

    const transfer = await createWalletTransfer({
      fromWalletAccountId: sellerWallet.id,
      toWalletAccountId: customerWallet.id,
      amount,
      memo: `SELLER_CASHIN:${tenantKey}`,
      metadata: {
        kind: "SELLER_CASHIN",
        tenantKey,
        sellerRoleId: role.seller.id,
        sellerUserId: String(user.id),
        customerUserId: verified.payload.userId,
        customerDisplayName: customerLabel,
        tokenIat: verified.payload.iat,
        tokenExp: verified.payload.exp,
      },
    });

    res.json({
      ok: true,
      amount,
      currency: "XOF",
      transferId: transfer.transfer.id,
      customer: {
        userId: verified.payload.userId,
        displayName: customerLabel,
        walletShortId: String(customerWallet.id).slice(0, 8),
      },
    });
  } catch (err: any) {
    const msg = String(err?.message || "");
    if (msg.includes("insufficient_balance")) return res.status(400).json({ message: "Insufficient balance" });
    res.status(500).json({ message: err?.message || "Failed to top up customer" });
  }
});

router.get("/clients/recent", async (req, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const user = await requireUser(req, res);
    if (!user) return;
    const role = await requireSellerRole(req, res, user);
    if (!role) return;

    const sellerWallet = await getOrCreateWalletAccount(String(user.id), "XOF");
    const entries = await db.query.walletLedgerEntries.findMany({
      where: eq(walletLedgerEntries.walletAccountId, sellerWallet.id),
      orderBy: desc(walletLedgerEntries.createdAt),
      limit: 250,
    });

    const tenantKey = tenant.key === "exportunity" ? "exportunity" : "bdo";
    const byCustomer = new Map<
      string,
      { userId: string; displayName: string | null; lastAt: string; lastAmount: number }
    >();

    for (const entry of entries) {
      if (entry.direction !== "DEBIT") continue;
      if (entry.entryType !== "TRANSFER") continue;
      const meta = (entry as any).metadata || {};
      if (String(meta.kind || "").toUpperCase() !== "SELLER_CASHIN") continue;
      if (String(meta.tenantKey || "").toLowerCase() !== tenantKey) continue;
      const customerUserId = String(meta.customerUserId || "").trim();
      if (!customerUserId) continue;
      if (byCustomer.has(customerUserId)) continue;
      const displayName = meta.customerDisplayName ? String(meta.customerDisplayName) : null;
      byCustomer.set(customerUserId, {
        userId: customerUserId,
        displayName,
        lastAt: entry.createdAt?.toISOString?.() ?? new Date().toISOString(),
        lastAmount: Number(entry.amount || 0),
      });
    }

    const customerIds = Array.from(byCustomer.keys())
      .map((id) => Number(id))
      .filter((n) => Number.isFinite(n) && n > 0) as number[];

    const customers = customerIds.length
      ? await db.query.eceUsers.findMany({
          where: inArray(eceUsers.id, customerIds),
          columns: { id: true, displayName: true },
        })
      : [];

    const customerMap = new Map<number, (typeof customers)[number]>();
    for (const c of customers) customerMap.set(Number(c.id), c);

    const items = Array.from(byCustomer.values())
      .map((row) => {
        const num = Number(row.userId);
        const u = Number.isFinite(num) ? customerMap.get(num) : null;
        return {
          userId: row.userId,
          displayName: u?.displayName ?? row.displayName ?? safeCustomerLabel(row.userId, row.displayName),
          lastTopupAt: row.lastAt,
          lastAmount: row.lastAmount,
        };
      })
      .sort((a, b) => String(b.lastTopupAt).localeCompare(String(a.lastTopupAt)));

    res.json({ ok: true, items });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to load recent clients" });
  }
});

export default router;

