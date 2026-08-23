import { Router } from "express";
import { db } from "@db";
import { and, desc, eq } from "drizzle-orm";

import { eceSessions, eceUsers, marketplaceOrders, payments, tenants, walletAccounts, walletTopups } from "@db/schema";
import type { TenantKey } from "../lib/tenants";
import { getRequestOrigin } from "../lib/kkiapay/config";
import { getFlutterwaveKeys, verifyFlutterwaveWebhookSignature } from "../lib/flutterwave/config";
import { buildFlutterwaveTxRef, flutterwaveInitPayment, flutterwaveVerifyTransaction } from "../lib/flutterwave/service";
import {
  flutterwaveV4AuthorizeCharge,
  flutterwaveV4CreateCardPaymentMethod,
  flutterwaveV4CreateCharge,
  flutterwaveV4CreateCustomer,
  flutterwaveV4GetCharge,
  normalizeFlutterwaveV4ChargePayload,
  type FlutterwaveV4Charge,
} from "../lib/flutterwave/v4";
import { applyTopupPaid, initWalletTopup } from "../lib/wallet/topups";
import { getOrCreateWalletAccount } from "../lib/wallet/wallet";
import { normalizeTenantKey } from "../../tenants/registry";
import {
  INDUSTRIAL_ORDER_PAYMENT_PURPOSE,
  INDUSTRIAL_ORDER_PAYMENT_TARGET,
  IndustrialPaymentError,
  industrialProviderAmountMatches,
  loadAuthorizedIndustrialOrder,
  loadAuthorizedIndustrialOrderPaymentTarget,
  markIndustrialOrderPaymentPending,
  providerCurrencyMatches,
  syncIndustrialOrderPaymentState,
} from "../lib/industrial/orderPayments";

const router = Router();

const MIN_TOPUP_AMOUNT_XOF = Math.max(1, Math.trunc(Number(process.env.WALLET_TOPUP_MIN_XOF || "500")));
const MAX_TOPUP_AMOUNT_XOF = Math.max(
  MIN_TOPUP_AMOUNT_XOF,
  Math.trunc(Number(process.env.WALLET_TOPUP_MAX_XOF || "5000000")),
);
const ALLOWED_WALLET_CURRENCIES = String(process.env.WALLET_ALLOWED_CURRENCIES || "XOF")
  .split(",")
  .map((entry) => String(entry || "").trim().toUpperCase())
  .filter(Boolean);

type AuthedUser = {
  id: number;
  email: string | null;
  displayName: string | null;
  phone: string | null;
  role: string | null;
  roles: string[];
};

function requireTenant(req: any, res: any) {
  const tenant = req.tenant;
  if (!tenant) {
    res.status(500).json({ error: "Tenant not resolved" });
    return null;
  }
  return tenant;
}

async function resolveTenantKeyForPayment(paymentRow: typeof payments.$inferSelect | null | undefined): Promise<TenantKey | null> {
  const tenantId = Number((paymentRow as any)?.tenantId || 0);
  if (!Number.isFinite(tenantId) || tenantId <= 0) return null;

  const tenantRow = await db.query.tenants.findFirst({ where: eq(tenants.id, tenantId) });
  const normalized = normalizeTenantKey(tenantRow?.key ?? null);
  return normalized as TenantKey | null;
}

function parseAmount(input: unknown) {
  const parsed = typeof input === "number" ? input : Number(String(input ?? "").trim());
  if (!Number.isFinite(parsed)) return null;
  const rounded = Math.round(parsed);
  return rounded > 0 ? rounded : null;
}

function normalizeCurrency(input: unknown) {
  const raw = String(input ?? "XOF").trim().toUpperCase();
  return raw || "XOF";
}

function normalizeEmail(input: unknown) {
  const raw = String(input ?? "").trim();
  return raw ? raw.toLowerCase() : null;
}

function normalizeNext(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (!raw.startsWith("/")) return null;
  if (raw.startsWith("//")) return null;
  if (raw.includes("://")) return null;
  return raw;
}

function digitsOnly(value: unknown) {
  return String(value ?? "").replace(/\D/g, "");
}

function normalizeCardNumber(value: unknown) {
  const digits = digitsOnly(value);
  return digits.length >= 12 && digits.length <= 19 ? digits : null;
}

function normalizeCardCvv(value: unknown) {
  const digits = digitsOnly(value);
  return digits.length >= 3 && digits.length <= 4 ? digits : null;
}

function normalizeExpiryMonth(value: unknown) {
  const digits = digitsOnly(value);
  const month = Number.parseInt(digits, 10);
  if (!Number.isFinite(month) || month < 1 || month > 12) return null;
  return String(month).padStart(2, "0");
}

function normalizeExpiryYear(value: unknown) {
  const digits = digitsOnly(value);
  if (digits.length === 2) return digits;
  if (digits.length === 4) return digits.slice(-2);
  return null;
}

function parseFlutterwaveCardDetails(input: any) {
  const cardNumber = normalizeCardNumber(input?.cardNumber);
  const cvv = normalizeCardCvv(input?.cvv);
  const expiryMonth = normalizeExpiryMonth(input?.expiryMonth);
  const expiryYear = normalizeExpiryYear(input?.expiryYear);

  if (!cardNumber || !cvv || !expiryMonth || !expiryYear) return null;
  return {
    cardNumber,
    cvv,
    expiryMonth,
    expiryYear,
  };
}

function parseFlutterwaveChargeUpdate(input: any) {
  const out: Record<string, unknown> = {};
  const type = String(input?.type || "").trim().toLowerCase();
  if (type === "otp" || type === "pin") out.type = type;

  const otp = digitsOnly(input?.otp);
  const pin = digitsOnly(input?.pin);
  if (otp) out.otp = otp;
  if (pin) out.pin = pin;

  const textFields: Array<[string, unknown]> = [
    ["first_name", input?.firstName ?? input?.first_name],
    ["last_name", input?.lastName ?? input?.last_name],
    ["address", input?.address],
    ["city", input?.city],
    ["state", input?.state],
    ["zip", input?.zip],
    ["country", input?.country],
  ];
  for (const [key, value] of textFields) {
    const normalized = String(value ?? "").trim();
    if (normalized) out[key] = normalized;
  }

  return Object.keys(out).length > 0 ? out : null;
}

function getTenantKey(tenant: any): TenantKey {
  return (normalizeTenantKey(String(tenant?.key || "")) || "exportunity") as TenantKey;
}

function isAdminUser(user: AuthedUser) {
  if (String(user.role || "").trim().toLowerCase() === "admin") return true;
  const normalizedRoles = user.roles
    .map((role) =>
      String(role || "")
        .trim()
        .toLowerCase()
        .replace(/['’]/g, "")
        .replace(/[_-]+/g, " ")
        .replace(/[^\w\s]/g, " ")
        .replace(/\s+/g, " "),
    )
    .filter(Boolean);
  return normalizedRoles.includes("admin") || normalizedRoles.includes("chairman assistant") || normalizedRoles.includes("platform admin");
}

async function requireAuthenticatedUser(req: any, res: any): Promise<AuthedUser | null> {
  const tenantUser = (req as any)?.tenantUser || null;
  if (tenantUser && Number.isFinite(Number(tenantUser.id))) {
    return {
      id: Number(tenantUser.id),
      email: tenantUser.email ? String(tenantUser.email) : null,
      displayName: tenantUser.displayName ? String(tenantUser.displayName) : null,
      phone: tenantUser.phone ? String(tenantUser.phone) : null,
      role: tenantUser.role ? String(tenantUser.role) : null,
      roles: Array.isArray(tenantUser.roles) ? tenantUser.roles.map((v: unknown) => String(v)) : [],
    };
  }

  const authHeader = String(req.headers.authorization || "");
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : "";
  if (!token) {
    res.status(401).json({ error: "Authentication required" });
    return null;
  }

  const session = await db.query.eceSessions.findFirst({ where: eq(eceSessions.token, token) });
  if (!session || new Date(session.expiresAt) <= new Date()) {
    res.status(401).json({ error: "Authentication required" });
    return null;
  }

  const user = await db.query.eceUsers.findFirst({ where: eq(eceUsers.id, session.userId) });
  if (!user || !user.isActive) {
    res.status(401).json({ error: "Authentication required" });
    return null;
  }

  return {
    id: user.id,
    email: user.email ? String(user.email) : null,
    displayName: user.displayName ? String(user.displayName) : null,
    phone: user.phone ? String(user.phone) : null,
    role: user.role ? String(user.role) : null,
    roles: Array.isArray(user.roles) ? user.roles.map((v) => String(v)) : [],
  };
}

function splitDisplayName(displayName: string | null, email: string | null) {
  const fallback = email ? email.split("@")[0] : "Member";
  const source = String(displayName || fallback || "Member").trim();
  const compact = source.replace(/\s+/g, " ").trim();
  return compact || "Member";
}

function paymentStatusLabel(statusRaw: unknown) {
  const status = String(statusRaw ?? "").toLowerCase();
  if (status === "succeeded") return "SUCCESS";
  if (status === "failed") return "FAILED";
  if (status === "cancelled") return "CANCELLED";
  if (status === "processing") return "PROCESSING";
  if (status === "refunded") return "REFUNDED";
  return "PENDING";
}

function extractFlutterwaveQueryIds(query: any) {
  return {
    transactionId:
      String(query?.transaction_id || "").trim() ||
      String(query?.transactionId || "").trim() ||
      String(query?.id || "").trim() ||
      null,
    txRef:
      String(query?.tx_ref || "").trim() ||
      String(query?.txRef || "").trim() ||
      null,
  };
}

async function canAccessPayment(input: {
  payment: typeof payments.$inferSelect;
  user: AuthedUser;
}) {
  if (isAdminUser(input.user)) return true;

  const paymentUserId = String((input.payment as any).userId || "").trim();
  if (paymentUserId && paymentUserId === String(input.user.id)) return true;

  const purpose = String((input.payment as any).purpose || "").trim().toUpperCase();
  if (purpose === "WALLET_TOPUP") {
    const topupId = String((input.payment as any).targetId || "").trim();
    if (!topupId) return false;
    const topup = await db.query.walletTopups.findFirst({ where: eq(walletTopups.id, topupId as any) });
    if (!topup) return false;
    const wallet = await db.query.walletAccounts.findFirst({ where: eq(walletAccounts.id, topup.walletAccountId as any) });
    return String(wallet?.userId || "").trim() === String(input.user.id);
  }

  if (purpose === "ORDER_PAYMENT" && (input.payment as any).orderId) {
    const order = await db.query.marketplaceOrders.findFirst({ where: eq(marketplaceOrders.id, (input.payment as any).orderId) });
    if (!order) return false;
    const orderEmail = normalizeEmail(order.buyerEmail);
    return !!orderEmail && orderEmail === normalizeEmail(input.user.email);
  }

  if (
    purpose === INDUSTRIAL_ORDER_PAYMENT_PURPOSE &&
    String((input.payment as any).targetType || "").trim().toUpperCase() ===
      INDUSTRIAL_ORDER_PAYMENT_TARGET
  ) {
    try {
      await loadAuthorizedIndustrialOrder({
        tenantId: Number((input.payment as any).tenantId),
        orderId: String((input.payment as any).targetId || "").trim(),
        userId: input.user.id,
        userEmail: input.user.email,
        isAdmin: isAdminUser(input.user),
      });
      return true;
    } catch {
      return false;
    }
  }

  return false;
}

async function markTopupFromPaymentStatus(paymentRow: typeof payments.$inferSelect, status: "PAID" | "FAILED" | "CANCELLED") {
  const topupId = String((paymentRow as any).targetId || "").trim();
  if (!topupId) return null;
  const topup = await db.query.walletTopups.findFirst({ where: eq(walletTopups.id, topupId as any) });
  if (!topup) return null;
  if (status === "PAID") return topup;

  await db.update(walletTopups).set({ status, updatedAt: new Date() }).where(eq(walletTopups.id, topup.id));
  return db.query.walletTopups.findFirst({ where: eq(walletTopups.id, topup.id) });
}

async function syncFlutterwaveCharge(input: {
  tenantId: number;
  paymentRow: typeof payments.$inferSelect;
  charge: FlutterwaveV4Charge;
  sourcePayload?: any;
}) {
  const purpose = String((input.paymentRow as any).purpose || "").trim().toUpperCase();
  const expectedAmount = Number((input.paymentRow as any).amount || 0);
  const expectedCurrency = String((input.paymentRow as any).currency || "XOF").toUpperCase();
  const amountOk =
    purpose === INDUSTRIAL_ORDER_PAYMENT_PURPOSE
      ? industrialProviderAmountMatches({
          providerAmount: input.charge.amount,
          expectedAmountMinor: (input.paymentRow as any).amount,
          currencyCode: expectedCurrency,
        })
      : input.charge.amount !== null && Number(input.charge.amount) === expectedAmount;
  const currencyOk = providerCurrencyMatches({
    providerCurrency: input.charge.currency,
    expectedCurrency,
  });

  const paymentStatus =
    input.charge.normalizedStatus === "succeeded"
      ? "succeeded"
      : input.charge.normalizedStatus === "failed"
        ? "failed"
        : input.charge.normalizedStatus === "cancelled"
          ? "cancelled"
          : input.charge.normalizedStatus === "processing"
            ? "processing"
            : "pending";

  const mergedMetadata = {
    ...(typeof (input.paymentRow as any).metadata === "object" && (input.paymentRow as any).metadata ? (input.paymentRow as any).metadata : {}),
    reason: !amountOk ? "amount_mismatch" : !currencyOk ? "currency_mismatch" : undefined,
    flutterwaveStatus: input.charge.rawStatus || input.charge.normalizedStatus,
    flutterwaveVersion: "v4",
    flutterwaveNextActionType: input.charge.nextAction?.type || null,
  };

  if (!amountOk || !currencyOk) {
    await db
      .update(payments)
      .set({
        status: "failed",
        providerTransactionId: input.charge.id || (input.paymentRow as any).providerTransactionId || null,
        providerTransactionRef: input.charge.reference || (input.paymentRow as any).providerTransactionRef || null,
        providerPayload: {
          charge: input.charge.raw ?? null,
          webhook: input.sourcePayload ?? null,
        },
        metadata: mergedMetadata,
        updatedAt: new Date(),
      })
      .where(and(eq(payments.id, input.paymentRow.id), eq(payments.tenantId, input.tenantId)));

    const industrialOrder = await syncIndustrialOrderPaymentState({
      tenantId: input.tenantId,
      paymentId: input.paymentRow.id,
      status: "failed",
    });
    await markTopupFromPaymentStatus(input.paymentRow, "FAILED");
    return {
      paymentStatus: "failed" as const,
      topupStatus: "FAILED" as const,
      industrialOrder,
    };
  }

  await db
    .update(payments)
    .set({
      status: paymentStatus as any,
      providerTransactionId: input.charge.id || (input.paymentRow as any).providerTransactionId || null,
      providerTransactionRef: input.charge.reference || (input.paymentRow as any).providerTransactionRef || null,
      providerPayload: {
        charge: input.charge.raw ?? null,
        webhook: input.sourcePayload ?? null,
      },
      metadata: mergedMetadata,
      updatedAt: new Date(),
    })
    .where(and(eq(payments.id, input.paymentRow.id), eq(payments.tenantId, input.tenantId)));

  if (paymentStatus === "succeeded" && purpose === "ORDER_PAYMENT" && (input.paymentRow as any).orderId) {
    await db
      .update(marketplaceOrders)
      .set({
        status: "confirmed",
        paidAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(marketplaceOrders.id, (input.paymentRow as any).orderId), eq(marketplaceOrders.tenantId, input.tenantId)));
  }

  const industrialOrder = await syncIndustrialOrderPaymentState({
    tenantId: input.tenantId,
    paymentId: input.paymentRow.id,
    status: paymentStatus,
  });

  if (paymentStatus === "succeeded" && purpose === "WALLET_TOPUP") {
    const topupId = String((input.paymentRow as any).targetId || "").trim();
    if (topupId) {
      await applyTopupPaid({
        topupId,
        externalRef: input.charge.id || input.charge.reference || null,
        providerPayload: input.charge.raw ?? null,
      });
      await db
        .update(payments)
        .set({ creditedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(payments.id, input.paymentRow.id), eq(payments.tenantId, input.tenantId)));
    }
    return {
      paymentStatus: "succeeded" as const,
      topupStatus: "PAID" as const,
      industrialOrder,
    };
  }

  if (purpose === "WALLET_TOPUP" && (paymentStatus === "failed" || paymentStatus === "cancelled")) {
    await markTopupFromPaymentStatus(input.paymentRow, paymentStatus === "failed" ? "FAILED" : "CANCELLED");
    return {
      paymentStatus: paymentStatus as "failed" | "cancelled",
      topupStatus: paymentStatus === "failed" ? ("FAILED" as const) : ("CANCELLED" as const),
      industrialOrder,
    };
  }

  return {
    paymentStatus,
    topupStatus: null,
    industrialOrder,
  };
}

async function verifyAndSyncFlutterwavePayment(input: {
  tenantId: number;
  tenantKey: TenantKey;
  paymentRow: typeof payments.$inferSelect;
  transactionId?: string | null;
  txRef?: string | null;
  sourcePayload?: any;
}) {
  const keys = getFlutterwaveKeys(input.tenantKey);
  if (!keys.secretKey) throw new Error("Flutterwave is not configured for this tenant");

  const verified = await flutterwaveVerifyTransaction({
    mode: keys.mode,
    secretKey: keys.secretKey,
    transactionId: input.transactionId || (input.paymentRow as any).providerTransactionId || null,
    txRef: input.txRef || (input.paymentRow as any).providerTransactionRef || null,
  });

  const purpose = String((input.paymentRow as any).purpose || "").trim().toUpperCase();
  const expectedAmount = Number((input.paymentRow as any).amount || 0);
  const expectedCurrency = String((input.paymentRow as any).currency || "XOF").toUpperCase();
  const amountOk =
    purpose === INDUSTRIAL_ORDER_PAYMENT_PURPOSE
      ? industrialProviderAmountMatches({
          providerAmount: verified.amount,
          expectedAmountMinor: (input.paymentRow as any).amount,
          currencyCode: expectedCurrency,
        })
      : verified.amount !== null && Number(verified.amount) === expectedAmount;
  const currencyOk = providerCurrencyMatches({
    providerCurrency: verified.currency,
    expectedCurrency,
  });

  const normalizedStatus = verified.normalizedStatus;
  const paymentStatus =
    normalizedStatus === "succeeded"
      ? "succeeded"
      : normalizedStatus === "failed"
        ? "failed"
        : normalizedStatus === "cancelled"
          ? "cancelled"
          : normalizedStatus === "processing"
            ? "processing"
            : "pending";

  const mergedMetadata = {
    ...(typeof (input.paymentRow as any).metadata === "object" && (input.paymentRow as any).metadata ? (input.paymentRow as any).metadata : {}),
    reason: !amountOk ? "amount_mismatch" : !currencyOk ? "currency_mismatch" : undefined,
    flutterwaveStatus: normalizedStatus,
  };

  if (!amountOk || !currencyOk) {
    await db
      .update(payments)
      .set({
        status: "failed",
        providerTransactionId: verified.transactionId || (input.paymentRow as any).providerTransactionId || null,
        providerTransactionRef: verified.txRef || (input.paymentRow as any).providerTransactionRef || null,
        providerPayload: {
          verify: verified.raw ?? null,
          webhook: input.sourcePayload ?? null,
        },
        metadata: mergedMetadata,
        updatedAt: new Date(),
      })
      .where(and(eq(payments.id, input.paymentRow.id), eq(payments.tenantId, input.tenantId)));

    const industrialOrder = await syncIndustrialOrderPaymentState({
      tenantId: input.tenantId,
      paymentId: input.paymentRow.id,
      status: "failed",
    });
    await markTopupFromPaymentStatus(input.paymentRow, "FAILED");
    return {
      verified,
      paymentStatus: "failed" as const,
      topupStatus: "FAILED" as const,
      industrialOrder,
    };
  }

  await db
    .update(payments)
    .set({
      status: paymentStatus as any,
      providerTransactionId: verified.transactionId || (input.paymentRow as any).providerTransactionId || null,
      providerTransactionRef: verified.txRef || (input.paymentRow as any).providerTransactionRef || null,
      providerPayload: {
        verify: verified.raw ?? null,
        webhook: input.sourcePayload ?? null,
      },
      metadata: mergedMetadata,
      updatedAt: new Date(),
    })
    .where(and(eq(payments.id, input.paymentRow.id), eq(payments.tenantId, input.tenantId)));

  if (paymentStatus === "succeeded" && purpose === "ORDER_PAYMENT" && (input.paymentRow as any).orderId) {
    await db
      .update(marketplaceOrders)
      .set({
        status: "confirmed",
        paidAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(marketplaceOrders.id, (input.paymentRow as any).orderId), eq(marketplaceOrders.tenantId, input.tenantId)));
  }

  const industrialOrder = await syncIndustrialOrderPaymentState({
    tenantId: input.tenantId,
    paymentId: input.paymentRow.id,
    status: paymentStatus,
  });

  if (paymentStatus === "succeeded" && purpose === "WALLET_TOPUP") {
    const topupId = String((input.paymentRow as any).targetId || "").trim();
    if (topupId) {
      await applyTopupPaid({
        topupId,
        externalRef: verified.transactionId || verified.txRef || null,
        providerPayload: verified.raw ?? null,
      });
      await db
        .update(payments)
        .set({ creditedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(payments.id, input.paymentRow.id), eq(payments.tenantId, input.tenantId)));
    }
    return {
      verified,
      paymentStatus: "succeeded" as const,
      topupStatus: "PAID" as const,
      industrialOrder,
    };
  }

  if (purpose === "WALLET_TOPUP" && (paymentStatus === "failed" || paymentStatus === "cancelled")) {
    await markTopupFromPaymentStatus(input.paymentRow, paymentStatus === "failed" ? "FAILED" : "CANCELLED");
    return {
      verified,
      paymentStatus: paymentStatus as "failed" | "cancelled",
      topupStatus: paymentStatus === "failed" ? ("FAILED" as const) : ("CANCELLED" as const),
      industrialOrder,
    };
  }

  return {
    verified,
    paymentStatus,
    topupStatus: null,
    industrialOrder,
  };
}

router.post("/init", async (req, res) => {
  let createdPaymentId: string | null = null;
  let createdTopupId: string | null = null;
  let paymentTenantId: number | null = null;
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    paymentTenantId = Number(tenant.id);

    const user = await requireAuthenticatedUser(req, res);
    if (!user) return;

    const typeRaw = String(req.body?.type || "WALLET_TOPUP").trim().toUpperCase();
    if (
      typeRaw !== "WALLET_TOPUP" &&
      typeRaw !== "ORDER_PAYMENT" &&
      typeRaw !== INDUSTRIAL_ORDER_PAYMENT_PURPOSE
    ) {
      return res.status(400).json({
        error: "type_not_allowed",
        allowedTypes: [
          "WALLET_TOPUP",
          "ORDER_PAYMENT",
          INDUSTRIAL_ORDER_PAYMENT_PURPOSE,
        ],
      });
    }
    const type = typeRaw as
      | "WALLET_TOPUP"
      | "ORDER_PAYMENT"
      | typeof INDUSTRIAL_ORDER_PAYMENT_PURPOSE;
    let amount = parseAmount(req.body?.amount);
    let industrialGatewayAmount: string | null = null;
    let currency = normalizeCurrency(req.body?.currency || "XOF");
    const orderId = Number.parseInt(String(req.body?.orderId || "").trim(), 10);
    const industrialOrderId = String(
      req.body?.industrialOrderId ||
        (type === INDUSTRIAL_ORDER_PAYMENT_PURPOSE ? req.body?.orderId : "") ||
        "",
    ).trim();

    let industrialTarget:
      | Awaited<ReturnType<typeof loadAuthorizedIndustrialOrderPaymentTarget>>
      | null = null;
    if (type === INDUSTRIAL_ORDER_PAYMENT_PURPOSE) {
      if (!industrialOrderId) {
        return res.status(400).json({
          error: "industrialOrderId is required for INDUSTRIAL_ORDER_PAYMENT",
        });
      }
      industrialTarget = await loadAuthorizedIndustrialOrderPaymentTarget({
        tenantId: tenant.id,
        orderId: industrialOrderId,
        userId: user.id,
        userEmail: user.email,
        isAdmin: isAdminUser(user),
      });
      amount = industrialTarget.amountMinor;
      industrialGatewayAmount = industrialTarget.gatewayAmount;
      currency = industrialTarget.currency;
    }

    if (!amount) return res.status(400).json({ error: "amount is required" });
    if (
      type !== INDUSTRIAL_ORDER_PAYMENT_PURPOSE &&
      (amount < MIN_TOPUP_AMOUNT_XOF || amount > MAX_TOPUP_AMOUNT_XOF)
    ) {
      return res.status(400).json({
        error: `amount must be between ${MIN_TOPUP_AMOUNT_XOF} and ${MAX_TOPUP_AMOUNT_XOF}`,
      });
    }
    if (
      type !== INDUSTRIAL_ORDER_PAYMENT_PURPOSE &&
      !ALLOWED_WALLET_CURRENCIES.includes(currency)
    ) {
      return res.status(400).json({
        error: "currency_not_allowed",
        allowedCurrencies: ALLOWED_WALLET_CURRENCIES,
      });
    }
    if (type === "ORDER_PAYMENT" && (!Number.isFinite(orderId) || orderId <= 0)) {
      return res.status(400).json({ error: "orderId is required for ORDER_PAYMENT" });
    }

    const tenantKey = getTenantKey(tenant);
    const keys = getFlutterwaveKeys(tenantKey);
    if (!keys.configured) {
      return res.status(503).json({
        error: "Flutterwave is not configured for this tenant",
        required:
          keys.version === "v4"
            ? {
                clientId: keys.envVarNames.clientId,
                clientSecret: keys.envVarNames.clientSecret,
                encryptionKey: keys.envVarNames.encryptionKey,
              }
            : {
                secretKey: keys.envVarNames.secretKey,
              },
        recommended: {
          webhookHash: keys.envVarNames.webhookHash,
        },
      });
    }
    if (
      type === INDUSTRIAL_ORDER_PAYMENT_PURPOSE &&
      industrialTarget &&
      industrialTarget.amountScale > 0 &&
      keys.version !== "v4"
    ) {
      throw new IndustrialPaymentError(
        "industrial_payment_fractional_currency_requires_v4",
        "This exact fractional-currency order requires the Flutterwave v4 rail or a governed bank-transfer payment plan.",
        409,
      );
    }

    const buyerEmail = normalizeEmail(user.email);
    if (!buyerEmail) return res.status(400).json({ error: "User email is required for Flutterwave checkout" });
    const buyerName = splitDisplayName(user.displayName, buyerEmail);

    let paymentRow: typeof payments.$inferSelect | null = null;
    if (type === "WALLET_TOPUP") {
      const wallet = await getOrCreateWalletAccount(String(user.id), currency as any);
      const init = await initWalletTopup({
        tenantId: tenant.id,
        walletAccountId: wallet.id,
        amount,
        currency,
        method: "REDIRECT",
        gateway: "flutterwave",
        userId: String(user.id),
      });
      paymentRow = init.payment;
      createdPaymentId = init.payment.id;
      createdTopupId = init.topup.id;
    } else if (type === "ORDER_PAYMENT") {
      const order = await db.query.marketplaceOrders.findFirst({
        where: and(eq(marketplaceOrders.id, orderId), eq(marketplaceOrders.tenantId, tenant.id)),
      });
      if (!order) return res.status(404).json({ error: "Order not found" });
      const orderEmail = normalizeEmail(order.buyerEmail);
      if (orderEmail && orderEmail !== buyerEmail && !isAdminUser(user)) {
        return res.status(403).json({ error: "Order does not belong to this user" });
      }

      const existing = await db.query.payments.findFirst({
        where: and(eq(payments.tenantId, tenant.id), eq(payments.orderId, order.id), eq(payments.provider, "flutterwave")),
      });
      if (existing) {
        paymentRow = existing;
      } else {
        const created = await db
          .insert(payments)
          .values({
            tenantId: tenant.id,
            provider: "flutterwave",
            purpose: "ORDER_PAYMENT",
            targetType: "ORDER",
            targetId: String(order.id),
            orderId: order.id,
            amount,
            currency,
            method: "REDIRECT",
            userId: String(user.id),
            status: "pending",
            providerPayload: null,
            metadata: { reason: "order_payment" },
          } as any)
          .returning()
          .then((rows) => rows[0] || null);
        paymentRow = created;
      }
      createdPaymentId = paymentRow?.id ?? null;
    } else {
      if (!industrialTarget) {
        throw new IndustrialPaymentError(
          "industrial_order_not_found",
          "Industrial order not found.",
          404,
        );
      }
      const existing = await db.query.payments.findFirst({
        where: and(
          eq(payments.tenantId, tenant.id),
          eq(payments.provider, "flutterwave"),
          eq(payments.purpose, INDUSTRIAL_ORDER_PAYMENT_PURPOSE),
          eq(payments.targetType, INDUSTRIAL_ORDER_PAYMENT_TARGET),
          eq(payments.targetId, industrialOrderId),
        ),
        orderBy: [desc(payments.createdAt)],
      });
      const existingStatus = String(existing?.status || "").trim().toLowerCase();
      if (existing && existingStatus === "succeeded") {
        await syncIndustrialOrderPaymentState({
          tenantId: tenant.id,
          paymentId: existing.id,
          status: "succeeded",
          actorUserId: user.id,
        });
        throw new IndustrialPaymentError(
          "industrial_order_already_paid",
          "This industrial order has already been paid.",
          409,
        );
      }
      if (existing && (existingStatus === "pending" || existingStatus === "processing")) {
        paymentRow = existing;
      } else {
        paymentRow = await db
          .insert(payments)
          .values({
            tenantId: tenant.id,
            provider: "flutterwave",
            purpose: INDUSTRIAL_ORDER_PAYMENT_PURPOSE,
            targetType: INDUSTRIAL_ORDER_PAYMENT_TARGET,
            targetId: industrialOrderId,
            orderId: null,
            amount,
            currency,
            method: "REDIRECT",
            userId: String(user.id),
            status: "pending",
            providerPayload: null,
            metadata: {
              reason: "industrial_order_payment",
              industrialOrderReference: industrialTarget.order.referenceCode,
              requirementId: industrialTarget.requirement.id,
              amountRepresentation: "iso_currency_minor_units",
              amountMinor: industrialTarget.amountMinorText,
              amountScale: industrialTarget.amountScale,
              gatewayAmount: industrialTarget.gatewayAmount,
            },
          } as any)
          .returning()
          .then((rows) => rows[0] || null);
      }
      createdPaymentId = paymentRow?.id ?? null;
      if (paymentRow) {
        await markIndustrialOrderPaymentPending({
          tenantId: tenant.id,
          orderId: industrialOrderId,
          paymentId: paymentRow.id,
        });
      }
    }

    if (!paymentRow) throw new Error("Failed to create local payment");

    const txRef = buildFlutterwaveTxRef({
      tenantKey,
      paymentId: paymentRow.id,
      type,
    });
    const origin = getRequestOrigin(req);
    const next = normalizeNext(req.body?.returnUrl || req.body?.next);
    const callbackQs = new URLSearchParams({ paymentId: String(paymentRow.id) });
    if (next) callbackQs.set("next", next);
    const redirectPath = `/wallet/topup/flutterwave/return?${callbackQs.toString()}`;
    const redirectUrl = origin ? `${origin}${redirectPath}` : redirectPath;
    const paymentReason =
      type === "WALLET_TOPUP"
        ? "wallet_topup"
        : type === INDUSTRIAL_ORDER_PAYMENT_PURPOSE
          ? "industrial_order_payment"
          : "order_payment";
    const paymentTitle =
      type === "WALLET_TOPUP"
        ? "Wallet top up"
        : type === INDUSTRIAL_ORDER_PAYMENT_PURPOSE
          ? `Exportunity industrial order ${industrialTarget?.order.referenceCode || ""}`.trim()
          : "Marketplace order";
    const paymentDescription =
      type === "WALLET_TOPUP"
        ? "Top up your wallet"
        : type === INDUSTRIAL_ORDER_PAYMENT_PURPOSE
          ? `Payment for ${industrialTarget?.order.referenceCode || "industrial order"}`
          : "Marketplace order payment";
    const paymentMetadata = {
      ...(typeof (paymentRow as any).metadata === "object" && (paymentRow as any).metadata ? (paymentRow as any).metadata : {}),
      reason: paymentReason,
      flutterwaveVersion: keys.version,
    };

    if (keys.version === "v4") {
      const cardDetails = parseFlutterwaveCardDetails(req.body?.paymentMethod?.card || req.body?.card);
      if (!cardDetails) {
        return res.status(400).json({
          error: "card_details_required",
          fields: ["paymentMethod.card.cardNumber", "paymentMethod.card.cvv", "paymentMethod.card.expiryMonth", "paymentMethod.card.expiryYear"],
        });
      }

      const customer = await flutterwaveV4CreateCustomer({
        mode: keys.mode,
        clientId: keys.clientId,
        clientSecret: keys.clientSecret,
        customer: {
          email: buyerEmail,
          name: buyerName,
          phone: user.phone,
        },
      });
      const paymentMethod = await flutterwaveV4CreateCardPaymentMethod({
        mode: keys.mode,
        clientId: keys.clientId,
        clientSecret: keys.clientSecret,
        encryptionKey: String(keys.encryptionKey || ""),
        card: cardDetails,
      });
      const charge = await flutterwaveV4CreateCharge({
        mode: keys.mode,
        clientId: keys.clientId,
        clientSecret: keys.clientSecret,
        amount: industrialGatewayAmount || amount,
        currency,
        redirectUrl,
        customerId: customer.id,
        paymentMethodId: paymentMethod.id,
        reference: txRef,
        meta: {
          paymentId: paymentRow.id,
          tenantKey,
          type,
          reason: paymentReason,
        },
      });

      if (createdTopupId) {
        await db.update(walletTopups).set({ status: "PENDING", updatedAt: new Date() }).where(eq(walletTopups.id, createdTopupId as any));
      }

      await syncFlutterwaveCharge({
        tenantId: tenant.id,
        paymentRow,
        charge,
      });

      res.setHeader("Cache-Control", "no-store");
      if (charge.nextAction?.type === "redirect_url" && charge.nextAction.redirectUrl) {
        return res.json({
          ok: true,
          paymentId: paymentRow.id,
          tx_ref: txRef,
          checkout: {
            type: "redirect",
            link: charge.nextAction.redirectUrl,
          },
        });
      }

      if (charge.nextAction?.type === "otp" || charge.nextAction?.type === "pin") {
        return res.json({
          ok: true,
          paymentId: paymentRow.id,
          tx_ref: txRef,
          checkout: {
            type: charge.nextAction.type,
            chargeId: charge.id,
            returnPath: redirectPath,
            message: charge.nextAction.message,
          },
        });
      }

      return res.json({
        ok: true,
        paymentId: paymentRow.id,
        tx_ref: txRef,
        checkout: {
          type: "status",
          returnPath: redirectPath,
        },
      });
    }

    const init = await flutterwaveInitPayment({
      mode: keys.mode,
      secretKey: keys.secretKey,
      txRef,
      amount,
      currency,
      redirectUrl,
      customer: {
        email: buyerEmail,
        name: buyerName,
        phone: user.phone,
      },
      title: paymentTitle,
      description: paymentDescription,
      meta: {
        paymentId: paymentRow.id,
        tenantKey,
        type,
        reason: paymentReason,
      },
    });

    await db
      .update(payments)
      .set({
        status: "pending",
        method: "REDIRECT",
        userId: String(user.id),
        providerTransactionRef: txRef,
        providerTransactionId: init.transactionId || (paymentRow as any).providerTransactionId || null,
        providerPayload: init.raw ?? null,
        metadata: paymentMetadata,
        updatedAt: new Date(),
      })
      .where(and(eq(payments.id, paymentRow.id), eq(payments.tenantId, tenant.id)));

    if (createdTopupId) {
      await db.update(walletTopups).set({ status: "PENDING", updatedAt: new Date() }).where(eq(walletTopups.id, createdTopupId as any));
    }

    res.setHeader("Cache-Control", "no-store");
    res.json({
      ok: true,
      paymentId: paymentRow.id,
      tx_ref: txRef,
      checkout: {
        type: "redirect",
        link: init.checkoutLink,
      },
    });
  } catch (error: any) {
    if (createdPaymentId) {
      await db
        .update(payments)
        .set({
          status: "failed",
          metadata: { reason: "init_failed", error: String(error?.message || error) },
          updatedAt: new Date(),
        } as any)
        .where(eq(payments.id, createdPaymentId as any))
        .catch(() => undefined);
      if (paymentTenantId) {
        await syncIndustrialOrderPaymentState({
          tenantId: paymentTenantId,
          paymentId: createdPaymentId,
          status: "failed",
        }).catch(() => undefined);
      }
    }
    if (createdTopupId) {
      await db
        .update(walletTopups)
        .set({ status: "FAILED", updatedAt: new Date() })
        .where(eq(walletTopups.id, createdTopupId as any))
        .catch(() => undefined);
    }
    console.error("[Flutterwave] init error:", error);
    if (error instanceof IndustrialPaymentError) {
      return res.status(error.statusCode).json({
        error: error.code,
        message: error.message,
      });
    }
    res.status(500).json({ error: error?.message || "Failed to initialize Flutterwave payment" });
  }
});

router.post("/authorize", async (req, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;

    const user = await requireAuthenticatedUser(req, res);
    if (!user) return;

    const paymentId = String(req.body?.paymentId || "").trim();
    const chargeIdFromBody = String(req.body?.chargeId || "").trim();
    const updateDetails = parseFlutterwaveChargeUpdate(req.body);
    const next = normalizeNext(req.body?.next);

    if (!paymentId) return res.status(400).json({ error: "paymentId is required" });
    if (!updateDetails) return res.status(400).json({ error: "authorization_details_required" });

    const paymentRow = await db.query.payments.findFirst({
      where: and(eq(payments.id, paymentId as any), eq(payments.tenantId, tenant.id), eq(payments.provider, "flutterwave")),
    });
    if (!paymentRow) return res.status(404).json({ error: "Payment not found" });

    const allowed = await canAccessPayment({ payment: paymentRow, user });
    if (!allowed) return res.status(403).json({ error: "Forbidden" });

    const tenantKey = getTenantKey(tenant);
    const keys = getFlutterwaveKeys(tenantKey);
    if (keys.version !== "v4" || !keys.configured) {
      return res.status(503).json({ error: "Flutterwave v4 is not configured for this tenant" });
    }

    const chargeId = chargeIdFromBody || String((paymentRow as any).providerTransactionId || "").trim();
    if (!chargeId) return res.status(400).json({ error: "chargeId is required" });

    const charge = await flutterwaveV4AuthorizeCharge({
      mode: keys.mode,
      clientId: keys.clientId,
      clientSecret: keys.clientSecret,
      chargeId,
      details: updateDetails,
    });

    await syncFlutterwaveCharge({
      tenantId: tenant.id,
      paymentRow,
      charge,
    });

    const callbackQs = new URLSearchParams({ paymentId: String(paymentRow.id) });
    if (next) callbackQs.set("next", next);
    const returnPath = `/wallet/topup/flutterwave/return?${callbackQs.toString()}`;

    if (charge.nextAction?.type === "redirect_url" && charge.nextAction.redirectUrl) {
      return res.json({
        ok: true,
        paymentId: paymentRow.id,
        checkout: {
          type: "redirect",
          link: charge.nextAction.redirectUrl,
        },
      });
    }

    if (charge.nextAction?.type === "otp" || charge.nextAction?.type === "pin") {
      return res.json({
        ok: true,
        paymentId: paymentRow.id,
        checkout: {
          type: charge.nextAction.type,
          chargeId: charge.id,
          returnPath,
          message: charge.nextAction.message,
        },
      });
    }

    return res.json({
      ok: true,
      paymentId: paymentRow.id,
      checkout: {
        type: "status",
        returnPath,
      },
    });
  } catch (error: any) {
    console.error("[Flutterwave] authorize error:", error);
    return res.status(500).json({ error: error?.message || "Failed to authorize Flutterwave charge" });
  }
});

router.get("/status", async (req, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;

    const user = await requireAuthenticatedUser(req, res);
    if (!user) return;

    const paymentId = String(req.query.paymentId || "").trim();
    if (!paymentId) return res.status(400).json({ error: "paymentId is required" });

    const paymentRow = await db.query.payments.findFirst({
      where: and(eq(payments.id, paymentId as any), eq(payments.tenantId, tenant.id), eq(payments.provider, "flutterwave")),
    });
    if (!paymentRow) return res.status(404).json({ error: "Payment not found" });

    const allowed = await canAccessPayment({ payment: paymentRow, user });
    if (!allowed) return res.status(403).json({ error: "Forbidden" });

    const statusRaw = String((paymentRow as any).status || "").toLowerCase();
    const queryIds = extractFlutterwaveQueryIds(req.query);
    const tenantKey = getTenantKey(tenant);
    const keys = getFlutterwaveKeys(tenantKey);
    if (statusRaw !== "succeeded" && statusRaw !== "failed" && statusRaw !== "cancelled") {
      try {
        if (keys.version === "v4" && keys.configured) {
          const chargeId =
            queryIds.transactionId ||
            String((paymentRow as any).providerTransactionId || "").trim() ||
            null;
          if (chargeId) {
            const charge = await flutterwaveV4GetCharge({
              mode: keys.mode,
              clientId: keys.clientId,
              clientSecret: keys.clientSecret,
              chargeId,
            });
            await syncFlutterwaveCharge({
              tenantId: tenant.id,
              paymentRow,
              charge,
            });
          }
        } else {
          await verifyAndSyncFlutterwavePayment({
            tenantId: tenant.id,
            tenantKey,
            paymentRow,
            transactionId: queryIds.transactionId,
            txRef: queryIds.txRef,
          });
        }
      } catch (error) {
        // keep local state if remote verification cannot complete yet
      }
    }

    const latestPayment = await db.query.payments.findFirst({
      where: and(eq(payments.id, paymentRow.id), eq(payments.tenantId, tenant.id)),
    });
    const purpose = String((latestPayment as any)?.purpose || "").toUpperCase();
    const topupId = purpose === "WALLET_TOPUP" ? String((latestPayment as any)?.targetId || "").trim() : "";
    const topup = topupId ? await db.query.walletTopups.findFirst({ where: eq(walletTopups.id, topupId as any) }) : null;
    let industrialOrder: Record<string, unknown> | null = null;
    if (
      latestPayment &&
      purpose === INDUSTRIAL_ORDER_PAYMENT_PURPOSE &&
      String((latestPayment as any).targetType || "").trim().toUpperCase() ===
        INDUSTRIAL_ORDER_PAYMENT_TARGET
    ) {
      const localStatus = String((latestPayment as any).status || "")
        .trim()
        .toLowerCase();
      if (
        localStatus === "pending" ||
        localStatus === "processing" ||
        localStatus === "succeeded" ||
        localStatus === "failed" ||
        localStatus === "cancelled"
      ) {
        await syncIndustrialOrderPaymentState({
          tenantId: tenant.id,
          paymentId: latestPayment.id,
          status: localStatus,
          actorUserId: user.id,
        });
      }
      const context = await loadAuthorizedIndustrialOrder({
        tenantId: tenant.id,
        orderId: String((latestPayment as any).targetId || "").trim(),
        userId: user.id,
        userEmail: user.email,
        isAdmin: isAdminUser(user),
      });
      industrialOrder = {
        id: context.order.id,
        referenceCode: context.order.referenceCode,
        status: context.order.status,
        paymentStatus: context.order.paymentStatus,
        paidAmount:
          context.order.paidAmount === null
            ? null
            : Number(context.order.paidAmount),
        paidCurrencyCode: context.order.paidCurrencyCode,
        paidAt: context.order.paidAt,
      };
    }

    res.setHeader("Cache-Control", "no-store");
    res.json({
      ok: true,
      payment: latestPayment
        ? {
            id: latestPayment.id,
            status: paymentStatusLabel((latestPayment as any).status),
            rawStatus: (latestPayment as any).status,
            amount: Number((latestPayment as any).amount || 0),
            currency: String((latestPayment as any).currency || "XOF"),
            providerTransactionId: (latestPayment as any).providerTransactionId || null,
            providerTxRef: (latestPayment as any).providerTransactionRef || null,
            purpose: String((latestPayment as any).purpose || ""),
            targetType: String((latestPayment as any).targetType || ""),
            targetId: String((latestPayment as any).targetId || ""),
            creditedAt: (latestPayment as any).creditedAt || null,
          }
        : null,
      topup: topup
        ? {
            id: topup.id,
            status: topup.status,
            amount: Number(topup.amount || 0),
            currency: String(topup.currency || "XOF"),
          }
        : null,
      industrialOrder,
    });
  } catch (error: any) {
    console.error("[Flutterwave] status error:", error);
    res.status(500).json({ error: error?.message || "Failed to fetch Flutterwave payment status" });
  }
});

export async function flutterwaveWebhook(req: any, res: any) {
  try {
    const payload = req.body || {};
    const txRef = String(payload?.data?.reference || payload?.data?.tx_ref || payload?.tx_ref || "").trim();
    const transactionId = String(payload?.data?.id || payload?.id || "").trim();
    const paymentIdFromMeta = String(payload?.data?.meta?.paymentId || payload?.data?.meta?.payment_id || "").trim();

    const paymentRow =
      (paymentIdFromMeta
        ? await db.query.payments.findFirst({
            where: and(eq(payments.id, paymentIdFromMeta as any), eq(payments.provider, "flutterwave")),
          })
        : null) ||
      (txRef
        ? await db.query.payments.findFirst({
            where: and(eq(payments.provider, "flutterwave"), eq(payments.providerTransactionRef, txRef)),
          })
        : null) ||
      (transactionId
        ? await db.query.payments.findFirst({
            where: and(eq(payments.provider, "flutterwave"), eq(payments.providerTransactionId, transactionId)),
          })
        : null);

    const tenantKey = (await resolveTenantKeyForPayment(paymentRow)) || ("exportunity" as TenantKey);
    const keys = getFlutterwaveKeys(tenantKey);
    const signatureOk = verifyFlutterwaveWebhookSignature({
      version: keys.version,
      rawBody: req.rawBody,
      headerValue: keys.version === "v4" ? req.headers?.["flutterwave-signature"] : req.headers?.["verif-hash"],
      expectedHash: keys.webhookHash || null,
    });
    if (!signatureOk) return res.status(401).json({ error: "Invalid webhook signature" });

    if (!paymentRow) return res.status(200).json({ ok: true, ignored: true, reason: "payment_not_found" });
    if (String((paymentRow as any).status).toLowerCase() === "succeeded" && (paymentRow as any).creditedAt) {
      return res.status(200).json({ ok: true, ignored: true, reason: "already_processed" });
    }

    const synced =
      keys.version === "v4"
        ? await syncFlutterwaveCharge({
            tenantId: Number((paymentRow as any).tenantId),
            paymentRow,
            charge: normalizeFlutterwaveV4ChargePayload(payload?.data || {}),
            sourcePayload: payload,
          })
        : await verifyAndSyncFlutterwavePayment({
            tenantId: Number((paymentRow as any).tenantId),
            tenantKey,
            paymentRow,
            transactionId: transactionId || null,
            txRef: txRef || null,
            sourcePayload: payload,
          });

    return res.status(200).json({
      ok: true,
      paymentId: paymentRow.id,
      paymentStatus: synced.paymentStatus,
      topupStatus: synced.topupStatus,
    });
  } catch (error: any) {
    console.error("[Flutterwave] webhook process error:", error);
    return res.status(200).json({ ok: false, error: error?.message || "webhook_processing_failed" });
  }
}

export const flutterwavePaymentsRouter = router;
