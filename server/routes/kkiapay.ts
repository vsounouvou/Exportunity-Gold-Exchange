import { Router } from "express";
import { db } from "@db";
import { and, eq } from "drizzle-orm";

import { eceSessions, eceUsers, marketplaceOrders, payments } from "@db/schema";
import { getKkiapayConfig, getKkiapayPublicKeyEnvVarNames, getRequestOrigin, parseKkiapayWebhook, verifyKkiapayWebhookSignature } from "../lib/kkiapay/config";
import { kkiapayPushInit, kkiapayVerifyTransaction } from "../lib/kkiapay/push";
import { applyTopupPaid } from "../lib/wallet/topups";
import { applyPayoutCompleted, reversePayout } from "../lib/wallet/payouts";

const router = Router();

function requireTenant(req: any, res: any) {
  const tenant = req.tenant;
  if (!tenant) {
    res.status(500).json({ message: "Tenant not resolved" });
    return null;
  }
  return tenant;
}

function toInt(value: any): number | null {
  const parsed = typeof value === "number" ? value : parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return null;
  return Math.trunc(parsed);
}

function normalizeEmail(value: any): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  return raw.toLowerCase();
}

function normalizeMsisdn(value: any): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  return digits;
}

function normalizeOperator(value: any): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  return raw.toUpperCase();
}

async function resolveBuyerEmail(req: any): Promise<string | null> {
  const authHeader = String(req.headers.authorization || "");
  if (authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice("Bearer ".length).trim();
    if (token) {
      const session = await db.query.eceSessions.findFirst({ where: eq(eceSessions.token, token) });
      if (session && new Date(session.expiresAt) > new Date()) {
        const user = await db.query.eceUsers.findFirst({ where: eq(eceUsers.id, session.userId) });
        const email = normalizeEmail(user?.email);
        if (email) return email;
      }
    }
  }

  const guestSessionId = String(req.headers["x-guest-session"] || "").trim();
  if (guestSessionId) return `guest:${guestSessionId}`.toLowerCase();

  return normalizeEmail(req.body?.buyerEmail);
}

function mapPaymentStatus(status: any) {
  const normalized = String(status ?? "pending").toLowerCase();
  if (normalized === "succeeded") return "PAID";
  if (normalized === "failed") return "FAILED";
  if (normalized === "cancelled") return "CANCELLED";
  if (normalized === "refunded") return "REFUNDED";
  return "PENDING";
}

function toProviderStatus(status: string | null): any | null {
  if (!status) return null;
  if (status === "succeeded") return "succeeded";
  if (status === "failed") return "failed";
  if (status === "cancelled") return "cancelled";
  if (status === "refunded") return "refunded";
  if (status === "pending") return "pending";
  return null;
}

function parseInternalReference(input: string | null) {
  const ref = String(input || "").trim();
  if (!ref) return null;

  const topup = /^TOPUP_(.+)$/i.exec(ref);
  if (topup && topup[1]) return { kind: "TOPUP" as const, id: topup[1] };

  const payout = /^PAYOUT_(.+)$/i.exec(ref);
  if (payout && payout[1]) return { kind: "PAYOUT" as const, id: payout[1] };

  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ref);
  if (uuid) return { kind: "PAYMENT" as const, id: ref };

  return { kind: "UNKNOWN" as const, id: ref };
}

async function maybeVerifyPushAndApplyPayment(input: {
  tenant: any;
  paymentRow: typeof payments.$inferSelect;
}) {
  const verifyEnabled = String(process.env.KIKI_PUSH_VERIFY_ENABLED || "").trim().toLowerCase() === "true";
  const method = String((input.paymentRow as any).method || "").trim().toUpperCase();
  const txn = String((input.paymentRow as any).providerTransactionId || "").trim();

  if (String((input.paymentRow as any).status).toLowerCase() === "succeeded") {
    return { paid: true as const, txn: txn || null, paymentRow: input.paymentRow };
  }

  if (!verifyEnabled || method !== "PUSH" || !txn) return { paid: false as const, txn: txn || null, paymentRow: input.paymentRow };

  const tenantKey = input.tenant.key === "exportunity" ? "exportunity" : "bdo";
  const { publicKey, privateKey, secret, mode } = getKkiapayConfig(tenantKey);
  if (!publicKey || !privateKey || !secret) return { paid: false as const, txn, paymentRow: input.paymentRow };

  const verified = await kkiapayVerifyTransaction({ transactionId: txn, mode, publicKey, privateKey, secret });
  if (verified.normalizedStatus !== "succeeded") return { paid: false as const, txn, paymentRow: input.paymentRow };

  const purpose = String((input.paymentRow as any).purpose || "ORDER_PAYMENT");

  await db.transaction(async (tx) => {
    await tx
      .update(payments)
      .set({
        status: "succeeded",
        providerPayload: verified.raw ?? (input.paymentRow as any).providerPayload ?? null,
        pushConfirmedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(payments.id, input.paymentRow.id), eq(payments.tenantId, input.tenant.id)));

    if (purpose === "ORDER_PAYMENT" && (input.paymentRow as any).orderId) {
      await tx
        .update(marketplaceOrders)
        .set({
          status: "confirmed",
          paidAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(eq(marketplaceOrders.id, (input.paymentRow as any).orderId), eq(marketplaceOrders.tenantId, input.tenant.id)));
    }
  });

  if (purpose === "WALLET_TOPUP") {
    const topupId = String((input.paymentRow as any).targetId || "").trim();
    if (topupId) {
      await applyTopupPaid({
        topupId,
        externalRef: txn,
        providerPayload: verified.raw ?? (input.paymentRow as any).providerPayload ?? null,
      });
    }
  }

  if (purpose === "PAYOUT") {
    const payoutId = String((input.paymentRow as any).targetId || "").trim();
    if (payoutId) {
      await applyPayoutCompleted({
        payoutId,
        externalRef: txn,
        providerPayload: verified.raw ?? (input.paymentRow as any).providerPayload ?? null,
      });
    }
  }

  const refreshed = await db.query.payments.findFirst({
    where: and(eq(payments.id, input.paymentRow.id), eq(payments.tenantId, input.tenant.id)),
  });

  return { paid: true as const, txn, paymentRow: refreshed ?? input.paymentRow };
}

router.post("/init", async (req, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;

    const tenantKey = tenant.key === "exportunity" ? "exportunity" : "bdo";
    const { publicKey, mode } = getKkiapayConfig(tenantKey);
    if (!publicKey) {
      const names = getKkiapayPublicKeyEnvVarNames(tenantKey, mode);
      return res.status(503).json({
        message: `KKiaPay is not configured for this tenant (missing public key). Mode: ${mode}. Set one of: ${names.join(", ")}`,
      });
    }

    const orderId = toInt(req.body?.orderId);
    if (!orderId) return res.status(400).json({ message: "orderId is required" });

    const order = await db.query.marketplaceOrders.findFirst({
      where: and(eq(marketplaceOrders.id, orderId), eq(marketplaceOrders.tenantId, tenant.id)),
    });
    if (!order) return res.status(404).json({ message: "Order not found" });

    const buyerEmail = await resolveBuyerEmail(req);
    const orderEmail = normalizeEmail(order.buyerEmail);
    if (orderEmail && !buyerEmail) {
      return res.status(401).json({ message: "Buyer identity required" });
    }
    if (buyerEmail && orderEmail && buyerEmail !== orderEmail) {
      return res.status(403).json({ message: "Order does not belong to this buyer" });
    }

    const existing = await db.query.payments.findFirst({
      where: and(eq(payments.tenantId, tenant.id), eq(payments.orderId, order.id), eq(payments.provider, "kkiapay")),
    });

    const amountRounded = Math.max(1, Math.round(Number(order.total ?? 0)));
    const currency = "XOF";

    let paymentRow = existing;
    if (!paymentRow) {
      const created = await db
        .insert(payments)
        .values({
          tenantId: tenant.id,
          provider: "kkiapay",
          purpose: "ORDER_PAYMENT",
          targetType: "ORDER",
          targetId: String(order.id),
          orderId: order.id,
          amount: amountRounded,
          currency,
          status: "pending",
          providerPayload: null,
        })
        .returning()
        .then((rows) => rows[0]);
      if (!created) {
        throw new Error("Failed to create payment");
      }
      paymentRow = created;
    } else if (String((paymentRow as any).method || "").toUpperCase() !== "WIDGET") {
      await db
        .update(payments)
        .set({ method: "WIDGET", updatedAt: new Date() })
        .where(and(eq(payments.id, paymentRow.id), eq(payments.tenantId, tenant.id)));
    }

    const origin = getRequestOrigin(req);
    const callbackUrl = origin
      ? `${origin}/pay/kkiapay/return?paymentId=${encodeURIComponent(String(paymentRow.id))}`
      : `/pay/kkiapay/return?paymentId=${encodeURIComponent(String(paymentRow.id))}`;

    res.setHeader("Cache-Control", "no-store");
    res.json({
      paymentId: paymentRow.id,
      publicKey,
      amount: paymentRow.amount,
      currency: paymentRow.currency,
      reference: paymentRow.id,
      callbackUrl,
      mode,
    });
  } catch (error: any) {
    console.error("[KKiaPay] init error:", error);
    res.status(500).json({ message: "Failed to init payment", error: error.message });
  }
});

router.post("/push/init", async (req, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;

    const tenantKey = tenant.key === "exportunity" ? "exportunity" : "bdo";
    const { publicKey, mode } = getKkiapayConfig(tenantKey);
    if (!publicKey) {
      const names = getKkiapayPublicKeyEnvVarNames(tenantKey, mode);
      return res.status(503).json({
        message: `KKiaPay is not configured for this tenant (missing public key). Mode: ${mode}. Set one of: ${names.join(", ")}`,
      });
    }

    const orderId = toInt(req.body?.orderId);
    if (!orderId) return res.status(400).json({ message: "orderId is required" });

    const msisdn = normalizeMsisdn(req.body?.phone);
    if (!msisdn) return res.status(400).json({ message: "phone is required" });

    const operator = normalizeOperator(req.body?.operator);
    if (!operator) return res.status(400).json({ message: "operator is required" });

    const order = await db.query.marketplaceOrders.findFirst({
      where: and(eq(marketplaceOrders.id, orderId), eq(marketplaceOrders.tenantId, tenant.id)),
    });
    if (!order) return res.status(404).json({ message: "Order not found" });

    const buyerEmail = await resolveBuyerEmail(req);
    const orderEmail = normalizeEmail(order.buyerEmail);
    if (orderEmail && !buyerEmail) {
      return res.status(401).json({ message: "Buyer identity required" });
    }
    if (buyerEmail && orderEmail && buyerEmail !== orderEmail) {
      return res.status(403).json({ message: "Order does not belong to this buyer" });
    }

    const existing = await db.query.payments.findFirst({
      where: and(eq(payments.tenantId, tenant.id), eq(payments.orderId, order.id), eq(payments.provider, "kkiapay")),
    });

    const amountRounded = Math.max(1, Math.round(Number(order.total ?? 0)));
    const currency = "XOF";

    let paymentRow = existing;
    if (!paymentRow) {
      const created = await db
        .insert(payments)
        .values({
          tenantId: tenant.id,
          provider: "kkiapay",
          purpose: "ORDER_PAYMENT",
          targetType: "ORDER",
          targetId: String(order.id),
          orderId: order.id,
          amount: amountRounded,
          currency,
          status: "pending",
          method: "PUSH",
          msisdn,
          operator,
          pushRequestedAt: new Date(),
          providerPayload: null,
        })
        .returning()
        .then((rows) => rows[0]);
      if (!created) throw new Error("Failed to create payment");
      paymentRow = created;
    } else {
      await db
        .update(payments)
        .set({
          method: "PUSH",
          msisdn,
          operator,
          pushRequestedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(eq(payments.id, paymentRow.id), eq(payments.tenantId, tenant.id)));
    }

    const origin = getRequestOrigin(req);
    const push = await kkiapayPushInit({
      amount: amountRounded,
      currency,
      msisdn,
      operator,
      reference: String(paymentRow.id),
      buyerEmail: buyerEmail ?? normalizeEmail(order.buyerEmail),
      buyerName: String(order.buyerName || "").trim() || null,
      widgetHost: origin,
      mode,
      publicKey,
    });

    await db
      .update(payments)
      .set({
        method: "PUSH",
        msisdn,
        operator,
        pushStatus: push.raw?.status ? String(push.raw.status) : push.transactionId ? "REQUESTED" : null,
        providerTransactionId: push.transactionId ?? paymentRow.providerTransactionId ?? null,
        providerPayload: push.raw ?? null,
        pushRequestedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(payments.id, paymentRow.id), eq(payments.tenantId, tenant.id)));

    res.setHeader("Cache-Control", "no-store");
    res.json({
      paymentId: paymentRow.id,
      status: "PENDING",
      providerTransactionId: push.transactionId,
    });
  } catch (error: any) {
    console.error("[KKiaPay] push init error:", error);
    res.status(500).json({ message: "Failed to init push payment", error: error.message });
  }
});

router.get("/push/status", async (req, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;

    const paymentId = String(req.query.paymentId ?? "").trim();
    if (!paymentId) return res.status(400).json({ message: "paymentId is required" });

    const paymentRow = await db.query.payments.findFirst({
      where: and(eq(payments.id, paymentId as any), eq(payments.tenantId, tenant.id)),
    });
    if (!paymentRow) return res.status(404).json({ message: "Payment not found" });

    if (String(paymentRow.status).toLowerCase() === "succeeded") {
      res.setHeader("Cache-Control", "no-store");
      return res.json({ paymentId: paymentRow.id, status: "PAID", providerTransactionId: paymentRow.providerTransactionId ?? null });
    }

    const verifyEnabled = String(process.env.KIKI_PUSH_VERIFY_ENABLED || "").trim().toLowerCase() === "true";
    const txn = String(paymentRow.providerTransactionId || "").trim();
    if (verifyEnabled && txn) {
      const tenantKey = tenant.key === "exportunity" ? "exportunity" : "bdo";
      const { publicKey, privateKey, secret, mode } = getKkiapayConfig(tenantKey);

      if (publicKey && privateKey && secret) {
        const verified = await kkiapayVerifyTransaction({ transactionId: txn, mode, publicKey, privateKey, secret });
        if (verified.normalizedStatus === "succeeded") {
          const purpose = String((paymentRow as any).purpose || "ORDER_PAYMENT");

          await db.transaction(async (tx) => {
            await tx
              .update(payments)
              .set({
                status: "succeeded",
                providerPayload: verified.raw ?? paymentRow.providerPayload ?? null,
                pushConfirmedAt: new Date(),
                updatedAt: new Date(),
              })
              .where(and(eq(payments.id, paymentRow.id), eq(payments.tenantId, tenant.id)));

            if (purpose === "ORDER_PAYMENT" && paymentRow.orderId) {
              await tx
                .update(marketplaceOrders)
                .set({
                  status: "confirmed",
                  paidAt: new Date(),
                  updatedAt: new Date(),
                })
                .where(and(eq(marketplaceOrders.id, paymentRow.orderId), eq(marketplaceOrders.tenantId, tenant.id)));
            }
          });

          if (purpose === "WALLET_TOPUP") {
            const topupId = String((paymentRow as any).targetId || "").trim();
            if (topupId) {
              await applyTopupPaid({ topupId, externalRef: txn, providerPayload: verified.raw ?? paymentRow.providerPayload ?? null });
            }
          }

          if (purpose === "PAYOUT") {
            const payoutId = String((paymentRow as any).targetId || "").trim();
            if (payoutId) {
              await applyPayoutCompleted({ payoutId, externalRef: txn, providerPayload: verified.raw ?? paymentRow.providerPayload ?? null });
            }
          }

          res.setHeader("Cache-Control", "no-store");
          return res.json({ paymentId: paymentRow.id, status: "PAID", providerTransactionId: txn });
        }
      }
    }

    res.setHeader("Cache-Control", "no-store");
    res.json({ paymentId: paymentRow.id, status: mapPaymentStatus(paymentRow.status), providerTransactionId: paymentRow.providerTransactionId ?? null });
  } catch (error: any) {
    console.error("[KKiaPay] push status error:", error);
    res.status(500).json({ message: "Failed to fetch push status", error: error.message });
  }
});

router.get("/status", async (req, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;

    const paymentId = String(req.query.paymentId ?? "").trim();
    if (!paymentId) return res.status(400).json({ message: "paymentId is required" });

    const paymentRow = await db.query.payments.findFirst({
      where: and(eq(payments.id, paymentId as any), eq(payments.tenantId, tenant.id)),
    });
    if (!paymentRow) return res.status(404).json({ message: "Payment not found" });

    const transactionId = String(req.query.transactionId ?? req.query.transaction_id ?? "").trim();
    if (transactionId && !paymentRow.providerTransactionId) {
      await db
        .update(payments)
        .set({ providerTransactionId: transactionId, updatedAt: new Date() })
        .where(and(eq(payments.id, paymentRow.id), eq(payments.tenantId, tenant.id)));
    }

    const verified = await maybeVerifyPushAndApplyPayment({ tenant, paymentRow });
    const row = verified.paymentRow;

    const order = (row as any).orderId
      ? await db.query.marketplaceOrders.findFirst({ where: eq(marketplaceOrders.id, (row as any).orderId) })
      : null;

    res.setHeader("Cache-Control", "no-store");
    res.json({
      paymentId: row.id,
      status: mapPaymentStatus((row as any).status),
      providerTransactionId: (row as any).providerTransactionId ?? transactionId ?? null,
      orderNumber: order?.orderNumber ?? null,
      purpose: String((row as any).purpose || "ORDER_PAYMENT"),
      targetType: String((row as any).targetType || ""),
      targetId: String((row as any).targetId || ""),
    });
  } catch (error: any) {
    console.error("[KKiaPay] status error:", error);
    res.status(500).json({ message: "Failed to fetch payment status", error: error.message });
  }
});

export async function kkiapayWebhook(req: any, res: any) {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;

    const tenantKey = tenant.key === "exportunity" ? "exportunity" : "bdo";
    const { secret } = getKkiapayConfig(tenantKey);
    const requireSig = String(process.env.KIKI_WEBHOOK_REQUIRE_SIGNATURE || "").trim().toLowerCase() === "true";

    const verified = verifyKkiapayWebhookSignature({
      rawBody: req.rawBody,
      headers: req.headers || {},
      secret,
    });

    if (requireSig && !verified.ok) {
      return res.status(401).json({ message: "Invalid webhook signature" });
    }

    const parsed = parseKkiapayWebhook(req.body);
    const reference = parsed.reference;
    const transactionId = parsed.transactionId;
    if (!reference && !transactionId) {
      return res.status(400).json({ message: "Missing reference/paymentId and transactionId" });
    }

    const refParsed = parseInternalReference(reference);

    let paymentRow =
      (refParsed?.kind === "PAYMENT"
        ? await db.query.payments.findFirst({
            where: and(eq(payments.id, refParsed.id as any), eq(payments.tenantId, tenant.id), eq(payments.provider, "kkiapay")),
          })
        : refParsed?.kind === "TOPUP"
          ? await db.query.payments.findFirst({
              where: and(eq(payments.targetType, "TOPUP"), eq(payments.targetId, refParsed.id), eq(payments.tenantId, tenant.id), eq(payments.provider, "kkiapay")),
            })
          : refParsed?.kind === "PAYOUT"
            ? await db.query.payments.findFirst({
                where: and(eq(payments.targetType, "PAYOUT"), eq(payments.targetId, refParsed.id), eq(payments.tenantId, tenant.id), eq(payments.provider, "kkiapay")),
              })
            : null) ||
      (transactionId
        ? await db.query.payments.findFirst({
            where: and(eq(payments.providerTransactionId, transactionId), eq(payments.tenantId, tenant.id), eq(payments.provider, "kkiapay")),
          })
        : null);

    if (!paymentRow) {
      return res.status(200).json({ ok: true, ignored: true, reason: "unknown_reference" });
    }

    const status = toProviderStatus(parsed.status);
    if (!status) {
      return res.status(200).json({ ok: true, ignored: true, reason: "unknown_status" });
    }

    if (String(paymentRow.status).toLowerCase() === "succeeded" && status === "succeeded") {
      return res.status(200).json({ ok: true, ignored: true, reason: "already_paid" });
    }

    if (parsed.amount !== null && Number(paymentRow.amount) !== Math.round(parsed.amount)) {
      return res.status(400).json({ message: "Amount mismatch" });
    }

    if (parsed.currency && String(parsed.currency).toUpperCase() !== String(paymentRow.currency || "XOF").toUpperCase()) {
      return res.status(400).json({ message: "Currency mismatch" });
    }

    await db.transaction(async (tx) => {
      await tx
        .update(payments)
        .set({
          status,
          providerTransactionId: parsed.transactionId ?? paymentRow.providerTransactionId ?? null,
          providerPayload: req.body ?? null,
          pushConfirmedAt:
            status === "succeeded" && String(paymentRow.method || "").toUpperCase() === "PUSH"
              ? new Date()
              : paymentRow.pushConfirmedAt ?? null,
          updatedAt: new Date(),
        })
        .where(and(eq(payments.id, paymentRow.id), eq(payments.tenantId, tenant.id)));

      const purpose = String((paymentRow as any).purpose || "ORDER_PAYMENT");
      if (purpose === "ORDER_PAYMENT" && status === "succeeded" && paymentRow.orderId) {
        await tx
          .update(marketplaceOrders)
          .set({
            status: "confirmed",
            paidAt: new Date(),
            updatedAt: new Date(),
          })
          .where(and(eq(marketplaceOrders.id, paymentRow.orderId), eq(marketplaceOrders.tenantId, tenant.id)));
      }
    });

    const purpose = String((paymentRow as any).purpose || "ORDER_PAYMENT");

    if (status === "succeeded" && purpose === "WALLET_TOPUP") {
      const topupId = String((paymentRow as any).targetId || "").trim();
      if (topupId) {
        await applyTopupPaid({ topupId, externalRef: parsed.transactionId ?? null, providerPayload: req.body ?? null });
      }
    }

    if (status === "succeeded" && purpose === "PAYOUT") {
      const payoutId = String((paymentRow as any).targetId || "").trim();
      if (payoutId) {
        await applyPayoutCompleted({ payoutId, externalRef: parsed.transactionId ?? null, providerPayload: req.body ?? null });
      }
    }

    if ((status === "failed" || status === "cancelled" || status === "refunded") && purpose === "PAYOUT") {
      const payoutId = String((paymentRow as any).targetId || "").trim();
      if (payoutId) {
        await reversePayout({ payoutId, reason: `gateway_${status}`, providerPayload: req.body ?? null });
      }
    }

    res.status(200).json({ ok: true });
  } catch (error: any) {
    console.error("[KKiaPay] webhook error:", error);
    res.status(500).json({ message: "Webhook processing failed", error: error.message });
  }
}

export const kkiapayPaymentsRouter = router;
