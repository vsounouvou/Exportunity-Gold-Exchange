import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

import { buildFlutterwaveTxRef, flutterwaveVerifyTransaction } from "../server/lib/flutterwave/service";
import { getFlutterwaveKeys, verifyFlutterwaveWebhookHash, verifyFlutterwaveWebhookSignature } from "../server/lib/flutterwave/config";

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

test("getFlutterwaveKeys: secret key alone is enough for server redirect checkout", () => {
  const oldMode = process.env.PAYMENT_MODE;
  const oldPublic = process.env.FLW_PUBLIC_KEY_LIVE;
  const oldSecret = process.env.FLW_SECRET_KEY_LIVE;

  process.env.PAYMENT_MODE = "live";
  delete process.env.FLW_PUBLIC_KEY_LIVE;
  process.env.FLW_SECRET_KEY_LIVE = "sk_live_only";

  const keys = getFlutterwaveKeys("met");
  assert.equal(keys.mode, "LIVE");
  assert.equal(keys.publicKey, "");
  assert.equal(keys.secretKey, "sk_live_only");
  assert.equal(keys.configured, true);

  process.env.PAYMENT_MODE = oldMode;
  process.env.FLW_PUBLIC_KEY_LIVE = oldPublic;
  process.env.FLW_SECRET_KEY_LIVE = oldSecret;
});

test("getFlutterwaveKeys: v4 credentials select v4 mode and require encryption key", () => {
  const oldMode = process.env.PAYMENT_MODE;
  const oldClientId = process.env.FLW_CLIENT_ID_LIVE;
  const oldClientSecret = process.env.FLW_CLIENT_SECRET_LIVE;
  const oldEncryptionKey = process.env.FLW_ENCRYPTION_KEY_LIVE;

  process.env.PAYMENT_MODE = "live";
  process.env.FLW_CLIENT_ID_LIVE = "flw_client_live";
  process.env.FLW_CLIENT_SECRET_LIVE = "flw_client_secret_live";
  process.env.FLW_ENCRYPTION_KEY_LIVE = Buffer.alloc(32, 7).toString("base64");

  const keys = getFlutterwaveKeys("met");
  assert.equal(keys.version, "v4");
  assert.equal(keys.clientId, "flw_client_live");
  assert.equal(keys.clientSecret, "flw_client_secret_live");
  assert.equal(keys.configured, true);

  process.env.PAYMENT_MODE = oldMode;
  process.env.FLW_CLIENT_ID_LIVE = oldClientId;
  process.env.FLW_CLIENT_SECRET_LIVE = oldClientSecret;
  process.env.FLW_ENCRYPTION_KEY_LIVE = oldEncryptionKey;
});

test("getFlutterwaveKeys: non-bdo tenants fall back to shared Exportunity live keys", () => {
  const oldMode = process.env.PAYMENT_MODE;
  const oldPublic = process.env.FLW_PUBLIC_KEY_EXPO_LIVE;
  const oldSecret = process.env.FLW_SECRET_KEY_EXPO_LIVE;

  process.env.PAYMENT_MODE = "live";
  process.env.FLW_PUBLIC_KEY_EXPO_LIVE = "pk_live_shared";
  process.env.FLW_SECRET_KEY_EXPO_LIVE = "sk_live_shared";

  const metKeys = getFlutterwaveKeys("met");
  const hozKeys = getFlutterwaveKeys("hoz");

  assert.equal(metKeys.mode, "LIVE");
  assert.equal(metKeys.publicKey, "pk_live_shared");
  assert.equal(metKeys.secretKey, "sk_live_shared");
  assert.equal(hozKeys.publicKey, "pk_live_shared");
  assert.equal(hozKeys.secretKey, "sk_live_shared");
  assert.equal(metKeys.configured, true);
  assert.equal(hozKeys.configured, true);

  process.env.PAYMENT_MODE = oldMode;
  process.env.FLW_PUBLIC_KEY_EXPO_LIVE = oldPublic;
  process.env.FLW_SECRET_KEY_EXPO_LIVE = oldSecret;
});

test("verifyFlutterwaveWebhookHash: strict match only", () => {
  assert.equal(verifyFlutterwaveWebhookHash({ headerValue: "abc", expectedHash: "abc" }), true);
  assert.equal(verifyFlutterwaveWebhookHash({ headerValue: "abc", expectedHash: "xyz" }), false);
  assert.equal(verifyFlutterwaveWebhookHash({ headerValue: "", expectedHash: "xyz" }), false);
});

test("verifyFlutterwaveWebhookSignature: v4 HMAC base64 signature matches raw body", () => {
  const secret = "super-secret-hash";
  const rawBody = Buffer.from(JSON.stringify({ id: "wbk_123", type: "charge.completed" }));
  const signature = crypto.createHmac("sha256", secret).update(rawBody).digest("base64");

  assert.equal(
    verifyFlutterwaveWebhookSignature({
      version: "v4",
      rawBody,
      headerValue: signature,
      expectedHash: secret,
    }),
    true,
  );
  assert.equal(
    verifyFlutterwaveWebhookSignature({
      version: "v4",
      rawBody,
      headerValue: "bad-signature",
      expectedHash: secret,
    }),
    false,
  );
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
