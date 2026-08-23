import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { buildFlutterwaveTxRef } from "../server/lib/flutterwave/service";
import { serializeFlutterwaveV4ChargeBody } from "../server/lib/flutterwave/v4";
import {
  IndustrialPaymentError,
  industrialProviderAmountMatches,
  isIndustrialOrderPaymentAuthorized,
  providerCurrencyMatches,
  resolveIndustrialOrderPaymentAmount,
} from "../server/lib/industrial/orderPaymentPolicy";

const repoRoot = process.cwd();
const read = (relativePath: string) =>
  fs.readFileSync(path.join(repoRoot, relativePath), "utf8");

test("industrial checkout uses the canonical exact minor-unit order amount", () => {
  assert.deepEqual(
    resolveIndustrialOrderPaymentAmount({
      totalAmount: "125000.00",
      totalAmountMinor: "125000",
      currencyCode: "xof",
    }),
    {
      amountMinor: 125000,
      amountMinorText: "125000",
      amountScale: 0,
      gatewayAmount: "125000",
      currency: "XOF",
    },
  );

  assert.deepEqual(
    resolveIndustrialOrderPaymentAmount({
      totalAmount: "125000.500",
      totalAmountMinor: "12500050",
      currencyCode: "USD",
    }),
    {
      amountMinor: 12500050,
      amountMinorText: "12500050",
      amountScale: 2,
      gatewayAmount: "125000.50",
      currency: "USD",
    },
  );
  assert.throws(
    () =>
      resolveIndustrialOrderPaymentAmount({
        totalAmount: "0",
        currencyCode: "XOF",
      }),
    (error: unknown) =>
      error instanceof IndustrialPaymentError &&
      error.code === "industrial_order_amount_invalid",
  );
  assert.throws(
    () =>
      resolveIndustrialOrderPaymentAmount({
        totalAmount: "125000.50",
        totalAmountMinor: "12500051",
        currencyCode: "USD",
      }),
    (error: unknown) =>
      error instanceof IndustrialPaymentError &&
      error.code === "industrial_order_amount_evidence_mismatch",
  );
  assert.throws(
    () =>
      resolveIndustrialOrderPaymentAmount({
        totalAmount: "21474836.48",
        totalAmountMinor: "2147483648",
        currencyCode: "USD",
      }),
    (error: unknown) =>
      error instanceof IndustrialPaymentError &&
      error.code === "industrial_order_amount_out_of_range",
  );
});

test("industrial provider reconciliation compares exact decimal evidence to minor units", () => {
  assert.equal(
    industrialProviderAmountMatches({
      providerAmount: "125000.50",
      expectedAmountMinor: "12500050",
      currencyCode: "USD",
    }),
    true,
  );
  assert.equal(
    industrialProviderAmountMatches({
      providerAmount: "125000.51",
      expectedAmountMinor: "12500050",
      currencyCode: "USD",
    }),
    false,
  );
  assert.equal(
    industrialProviderAmountMatches({
      providerAmount: null,
      expectedAmountMinor: "12500050",
      currencyCode: "USD",
    }),
    false,
  );
  assert.equal(
    providerCurrencyMatches({
      providerCurrency: "usd",
      expectedCurrency: "USD",
    }),
    true,
  );
  assert.equal(
    providerCurrencyMatches({
      providerCurrency: "EUR",
      expectedCurrency: "USD",
    }),
    false,
  );
  assert.equal(
    providerCurrencyMatches({
      providerCurrency: null,
      expectedCurrency: "USD",
    }),
    false,
  );
});

test("Flutterwave v4 charge transport emits an exact unquoted decimal", () => {
  const body = serializeFlutterwaveV4ChargeBody({
    amount: "1234.56",
    currency: "USD",
    reference: "industrial_exportunity_payment-123",
    meta: { paymentId: "payment-123" },
  });
  assert.match(body, /^\{"amount":1234\.56,/);
  assert.doesNotMatch(body, /"amount":"1234\.56"/);
  assert.match(body, /"currency":"USD"/);
  assert.match(body, /"paymentId":"payment-123"/);
  assert.throws(
    () => serializeFlutterwaveV4ChargeBody({ amount: "1e3", currency: "USD" }),
    /positive exact decimal/,
  );
});

test("industrial payment ownership accepts the requester or governed staff only", () => {
  assert.equal(
    isIndustrialOrderPaymentAuthorized({
      isAdmin: false,
      userId: 42,
      requesterUserId: 42,
    }),
    true,
  );
  assert.equal(
    isIndustrialOrderPaymentAuthorized({
      isAdmin: false,
      userEmail: "BUYER@EXAMPLE.COM",
      requesterEmail: "buyer@example.com",
    }),
    true,
  );
  assert.equal(
    isIndustrialOrderPaymentAuthorized({
      isAdmin: false,
      userEmail: "finance@example.com",
      contactEmails: ["buyer@example.com", "finance@example.com"],
    }),
    true,
  );
  assert.equal(
    isIndustrialOrderPaymentAuthorized({
      isAdmin: false,
      userId: 9,
      requesterUserId: 42,
      userEmail: "stranger@example.com",
      requesterEmail: "buyer@example.com",
    }),
    false,
  );
  assert.equal(
    isIndustrialOrderPaymentAuthorized({
      isAdmin: true,
      userId: 9,
      requesterUserId: 42,
    }),
    true,
  );
});

test("industrial Flutterwave references are distinct from wallet and marketplace payments", () => {
  assert.equal(
    buildFlutterwaveTxRef({
      tenantKey: "exportunity",
      paymentId: "payment-123",
      type: "INDUSTRIAL_ORDER_PAYMENT",
    }),
    "industrial_exportunity_payment-123",
  );
});

test("industrial payment remains server-authoritative and customer-scoped end to end", () => {
  const flutterwave = read("server/routes/flutterwave.ts");
  const industrial = read("server/routes/industrial.ts");
  const page = read(
    "client/src/pages/exportunity/IndustrialOrderPaymentPage.tsx",
  );

  assert.match(flutterwave, /loadAuthorizedIndustrialOrderPaymentTarget/);
  assert.match(flutterwave, /amount = industrialTarget\.amountMinor/);
  assert.match(flutterwave, /industrialGatewayAmount = industrialTarget\.gatewayAmount/);
  assert.match(flutterwave, /currency = industrialTarget\.currency/);
  assert.match(flutterwave, /industrialProviderAmountMatches/);
  assert.match(flutterwave, /industrial_payment_fractional_currency_requires_v4/);
  assert.match(flutterwave, /syncIndustrialOrderPaymentState/);
  assert.match(industrial, /"\/orders\/:orderId",\s*ensureTenantUser/);
  assert.match(page, /type: "INDUSTRIAL_ORDER_PAYMENT"/);
  assert.doesNotMatch(
    page,
    /type: "INDUSTRIAL_ORDER_PAYMENT"[\s\S]{0,180}amount:/,
  );
});
