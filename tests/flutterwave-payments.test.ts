import test from "node:test";
import assert from "node:assert/strict";

import { buildFlutterwaveTxRef, flutterwaveVerifyTransaction } from "../server/lib/flutterwave/service";
import { getFlutterwaveKeys, verifyFlutterwaveWebhookHash } from "../server/lib/flutterwave/config";

test("buildFlutterwaveTxRef: includes type, tenant, and payment id", () => {
  const txRef = buildFlutterwaveTxRef({
    tenantKey: "bdo",
    paymentId: "abc-123",
    type: "WALLET_TOPUP",
  });
  assert.equal(txRef, "topup_bdo_abc-123");
});

test("getFlutterwaveKeys: resolves tenant + mode specific keys", () => {
  const oldMode = process.env.PAYMENT_MODE;
  const oldPublic = process.env.FLW_PUBLIC_KEY_BDO_SANDBOX;
  const oldSecret = process.env.FLW_SECRET_KEY_BDO_SANDBOX;

  process.env.PAYMENT_MODE = "sandbox";
  process.env.FLW_PUBLIC_KEY_BDO_SANDBOX = "pk_sandbox_test";
  process.env.FLW_SECRET_KEY_BDO_SANDBOX = "sk_sandbox_test";

  const keys = getFlutterwaveKeys("bdo");
  assert.equal(keys.mode, "SANDBOX");
  assert.equal(keys.publicKey, "pk_sandbox_test");
  assert.equal(keys.secretKey, "sk_sandbox_test");
  assert.equal(keys.configured, true);

  process.env.PAYMENT_MODE = oldMode;
  process.env.FLW_PUBLIC_KEY_BDO_SANDBOX = oldPublic;
  process.env.FLW_SECRET_KEY_BDO_SANDBOX = oldSecret;
});

test("verifyFlutterwaveWebhookHash: strict match only", () => {
  assert.equal(verifyFlutterwaveWebhookHash({ headerValue: "abc", expectedHash: "abc" }), true);
  assert.equal(verifyFlutterwaveWebhookHash({ headerValue: "abc", expectedHash: "xyz" }), false);
  assert.equal(verifyFlutterwaveWebhookHash({ headerValue: "", expectedHash: "xyz" }), false);
});

test("flutterwaveVerifyTransaction: falls back to tx_ref when id verify fails", async () => {
  const oldFetch = globalThis.fetch;
  const calls: string[] = [];

  globalThis.fetch = (async (url: any) => {
    const target = String(url);
    calls.push(target);
    if (target.includes("/transactions/123/verify")) {
      return new Response(JSON.stringify({ status: "error", message: "not found" }), { status: 404 });
    }
    if (target.includes("/transactions/verify_by_reference")) {
      return new Response(
        JSON.stringify({
          status: "success",
          data: {
            id: 456,
            tx_ref: "topup_bdo_abc",
            amount: 1500,
            currency: "XOF",
            status: "successful",
          },
        }),
        { status: 200 },
      );
    }
    return new Response("{}", { status: 500 });
  }) as any;

  const out = await flutterwaveVerifyTransaction({
    mode: "SANDBOX",
    secretKey: "sk_test",
    transactionId: "123",
    txRef: "topup_bdo_abc",
  });

  assert.equal(out.normalizedStatus, "succeeded");
  assert.equal(out.transactionId, "456");
  assert.equal(out.txRef, "topup_bdo_abc");
  assert.equal(out.amount, 1500);
  assert.equal(out.currency, "XOF");
  assert.equal(calls.some((call) => call.includes("/transactions/123/verify")), true);
  assert.equal(calls.some((call) => call.includes("/transactions/verify_by_reference?tx_ref=topup_bdo_abc")), true);

  globalThis.fetch = oldFetch;
});
