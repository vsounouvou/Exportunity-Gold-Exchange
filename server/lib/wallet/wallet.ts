import { db } from "@db";
import { and, eq } from "drizzle-orm";

import { walletAccounts } from "@db/schema";

export const SYSTEM_WALLET_USER_IDS = {
  voucherFloat: "SYSTEM_VOUCHER_FLOAT",
  equipmentEscrow: "SYSTEM_EQUIPMENT_ESCROW",
} as const;

export function normalizeCurrency(input?: string | null) {
  const raw = String(input || "").trim().toUpperCase();
  return raw || "XOF";
}

export function normalizeUserId(input: unknown) {
  const raw = String(input ?? "").trim();
  if (!raw) throw new Error("userId is required");
  return raw;
}

export async function getOrCreateWalletAccount(userId: string, currency = "XOF") {
  const uid = normalizeUserId(userId);
  const cur = normalizeCurrency(currency);

  const existing = await db.query.walletAccounts.findFirst({
    where: and(eq(walletAccounts.userId, uid), eq(walletAccounts.currency, cur as any)),
  });
  if (existing) return existing;

  try {
    const [created] = await db
      .insert(walletAccounts)
      .values({
        userId: uid,
        currency: cur as any,
        status: "ACTIVE",
        kycLevel: "L0",
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    if (!created) throw new Error("Failed to create wallet");
    return created;
  } catch (err: any) {
    const retry = await db.query.walletAccounts.findFirst({
      where: and(eq(walletAccounts.userId, uid), eq(walletAccounts.currency, cur as any)),
    });
    if (retry) return retry;
    throw err;
  }
}

export async function getOrCreateSystemWalletAccount(systemUserId: string, currency = "XOF") {
  return getOrCreateWalletAccount(systemUserId, currency);
}
