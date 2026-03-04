import { db } from "@db";
import { and, desc, eq, inArray, lt } from "drizzle-orm";

import { payments, tenants, walletPayouts } from "@db/schema";
import { getKkiapayConfig } from "../lib/kkiapay/config";
import { kkiapayPayoutVerify } from "../lib/kkiapay/payout";
import { applyPayoutCompleted, reversePayout } from "../lib/wallet/payouts";

async function runOnce() {
  const verifyEnabled = String(process.env.KIKI_PAYOUT_VERIFY_ENABLED || "").trim().toLowerCase() === "true";
  if (!verifyEnabled) {
    console.log("[payout-worker] KIKI_PAYOUT_VERIFY_ENABLED is false; exiting.");
    return;
  }

  const cutoff = new Date(Date.now() - 60_000);
  const candidates = await db
    .select({ payout: walletPayouts, payment: payments, tenant: tenants })
    .from(walletPayouts)
    .leftJoin(payments, and(eq(payments.purpose, "PAYOUT" as any), eq(payments.targetId, walletPayouts.id)))
    .leftJoin(tenants, eq(payments.tenantId, tenants.id))
    .where(and(inArray(walletPayouts.status, ["PROCESSING", "SENT"] as any), lt(walletPayouts.updatedAt, cutoff)))
    .orderBy(desc(walletPayouts.updatedAt))
    .limit(50);

  if (!candidates.length) {
    console.log("[payout-worker] No processing payouts.");
    return;
  }

  for (const row of candidates) {
    const payout = row.payout;
    const payment = row.payment;
    const tenant = row.tenant;

    const externalRef = String(payout.externalRef || payment?.providerTransactionId || "").trim();
    if (!externalRef) continue;
    if (!tenant) continue;

    const tenantKey = tenant.key === "exportunity" ? "exportunity" : "bdo";
    const { publicKey, privateKey, secret, mode } = getKkiapayConfig(tenantKey);
    if (!publicKey || !privateKey || !secret) continue;

    try {
      const verified = await kkiapayPayoutVerify({ externalRef, mode, publicKey, privateKey, secret });
      if (verified.normalizedStatus === "completed") {
        await applyPayoutCompleted({ payoutId: payout.id, externalRef, providerPayload: verified.raw });
      } else if (verified.normalizedStatus === "failed" || verified.normalizedStatus === "cancelled") {
        await reversePayout({ payoutId: payout.id, reason: `verify_${verified.normalizedStatus}`, providerPayload: verified.raw });
      }
    } catch (err: any) {
      console.warn("[payout-worker] verify failed:", payout.id, err?.message || String(err));
    }
  }
}

runOnce().catch((err) => {
  console.error("[payout-worker] fatal:", err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});

