import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

import { parseKkiapayWebhook, verifyKkiapayWebhookSignature } from "../server/lib/kkiapay/config";
import { kkiapayPushInit } from "../server/lib/kkiapay/push";

test("parseKkiapayWebhook: extracts reference from stateData + success flag", () => {
  const parsed = parseKkiapayWebhook({
    transactionId: "3iH6wjHJ3",
    isPaymentSucces: true,
    amount: 1000,
    stateData: JSON.stringify({ reference: "PAYMENT_ID_123" }),
    event: "transaction.success",
  });

  assert.equal(parsed.reference, "PAYMENT_ID_123");
  assert.equal(parsed.transactionId, "3iH6wjHJ3");
  assert.equal(parsed.status, "succeeded");
  assert.equal(parsed.amount, 1000);
});

test("verifyKkiapayWebhookSignature: accepts x-kkiapay-secret == secret", () => {
  const rawBody = Buffer.from(JSON.stringify({ hello: "world" }));
  const out = verifyKkiapayWebhookSignature({
    rawBody,
    headers: { "x-kkiapay-secret": "topsecret" },
    secret: "topsecret",
  });
  assert.equal(out.ok, true);
});

test("kkiapayPushInit: SANDBOX uses /api/v1/payments/request", async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; headers: any; body: any }> = [];

  globalThis.fetch = (async (url: any, options: any) => {
    const headers = options?.headers ?? {};
    const body = options?.body;
    calls.push({ url: String(url), headers, body });

    if (String(url) === "https://inspector.kkiapay.me/hand-shake") {
      return new Response(JSON.stringify({ sessionId: "sess_123", publicKey: "[]" }), { status: 200 });
    }

    if (String(url) === "https://api-sandbox.kkiapay.me/api/v1/payments/request") {
      const parsedBody = JSON.parse(String(body || "{}"));
      assert.equal(parsedBody.contact, "sess_123");
      assert.equal(parsedBody.provider, "mtn-bj");
      assert.equal(parsedBody.country, "BJ");
      return new Response(JSON.stringify({ transactionId: "txn_123" }), { status: 200 });
    }

    throw new Error(`Unexpected fetch URL: ${String(url)}`);
  }) as any;

  const result = await kkiapayPushInit({
    amount: 1000,
    currency: "XOF",
    msisdn: "22961000000",
    operator: "MTN_BJ",
    reference: "PAYMENT_ID_123",
    buyerEmail: "buyer@example.com",
    buyerName: "John Doe",
    widgetHost: "https://example.com",
    mode: "SANDBOX",
    publicKey: "PUBLIC_KEY",
  });

  assert.equal(result.ok, true);
  assert.equal(result.transactionId, "txn_123");
  assert.equal(calls.some((c) => c.url.includes("/api/v1/payments/request")), true);

  globalThis.fetch = originalFetch;
});

test("kkiapayPushInit: LIVE uses /api/v2/payments/request with encrypted headers", async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; headers: any; body: any }> = [];

  const subtle = crypto.webcrypto.subtle;
  const inspectorPair = (await subtle.generateKey(
    { name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["encrypt", "decrypt"],
  )) as CryptoKeyPair;
  const spki = new Uint8Array(await subtle.exportKey("spki", inspectorPair.publicKey));
  const inspectorPublicKeyJson = JSON.stringify(Array.from(spki));

  globalThis.fetch = (async (url: any, options: any) => {
    const headers = options?.headers ?? {};
    const body = options?.body;
    calls.push({ url: String(url), headers, body });

    if (String(url) === "https://inspector.kkiapay.me/hand-shake") {
      return new Response(JSON.stringify({ sessionId: "sess_live_123", publicKey: inspectorPublicKeyJson }), { status: 200 });
    }

    if (String(url) === "https://api.kkiapay.me/api/v2/payments/request") {
      assert.equal(String(headers["x-session-id"] || ""), "sess_live_123");
      assert.ok(String(headers["x-encrypted-data"] || "").includes("."));
      return new Response(JSON.stringify({ transactionId: "txn_live_123" }), { status: 200 });
    }

    throw new Error(`Unexpected fetch URL: ${String(url)}`);
  }) as any;

  const result = await kkiapayPushInit({
    amount: 1000,
    currency: "XOF",
    msisdn: "22961000000",
    operator: "MTN_BJ",
    reference: "PAYMENT_ID_123",
    buyerEmail: "buyer@example.com",
    buyerName: "John Doe",
    widgetHost: "https://example.com",
    mode: "LIVE",
    publicKey: "PUBLIC_KEY",
  });

  assert.equal(result.ok, true);
  assert.equal(result.transactionId, "txn_live_123");
  assert.equal(calls.some((c) => c.url.includes("/api/v2/payments/request")), true);

  globalThis.fetch = originalFetch;
});

