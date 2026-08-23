import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  metaWebhookSecurityStatus,
  verifyMetaWebhookChallenge,
  verifyMetaWebhookSignature,
} from "../server/lib/integrations/metaWebhookSecurity";

const ENV_KEYS = [
  "META_APP_SECRET",
  "META_WEBHOOK_VERIFY_TOKEN",
  "META_WHATSAPP_APP_SECRET",
  "META_WHATSAPP_WEBHOOK_VERIFY_TOKEN",
  "WHATSAPP_APP_SECRET",
  "WHATSAPP_VERIFY_TOKEN",
] as const;

function withCleanWebhookEnv(run: () => void) {
  const previous = Object.fromEntries(
    ENV_KEYS.map((key) => [key, process.env[key]]),
  );
  try {
    for (const key of ENV_KEYS) delete process.env[key];
    run();
  } finally {
    for (const key of ENV_KEYS) {
      const value = previous[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function metaSignature(secret: string, body: Buffer) {
  return `sha256=${crypto.createHmac("sha256", secret).update(body).digest("hex")}`;
}

test("Meta challenge verification is configured, constant-time, and exact", () => {
  withCleanWebhookEnv(() => {
    process.env.META_WEBHOOK_VERIFY_TOKEN = "private-random-verify-token";

    assert.deepEqual(
      verifyMetaWebhookChallenge({
        purpose: "social",
        mode: "subscribe",
        verifyToken: "private-random-verify-token",
        challenge: "128913748",
      }),
      { ok: true, reason: "verified", challenge: "128913748" },
    );
    const exactChallenge = verifyMetaWebhookChallenge({
      purpose: "social",
      mode: "subscribe",
      verifyToken: "private-random-verify-token",
      challenge: " 128913748 ",
    });
    assert.equal(exactChallenge.ok, true);
    if (exactChallenge.ok) assert.equal(exactChallenge.challenge, " 128913748 ");
    assert.equal(
      verifyMetaWebhookChallenge({
        purpose: "social",
        mode: "subscribe",
        verifyToken: "wrong-token",
        challenge: "128913748",
      }).ok,
      false,
    );
    assert.equal(
      verifyMetaWebhookChallenge({
        purpose: "social",
        mode: "publish",
        verifyToken: "private-random-verify-token",
        challenge: "128913748",
      }).ok,
      false,
    );
  });
});

test("Meta POST verification requires the raw body and a valid HMAC-SHA256 header", () => {
  withCleanWebhookEnv(() => {
    const secret = "meta-app-secret-for-tests";
    const rawBody = Buffer.from(
      JSON.stringify({ object: "instagram", entry: [{ id: "1784", text: "café" }] }),
      "utf8",
    );
    process.env.META_APP_SECRET = secret;
    const signature = metaSignature(secret, rawBody);

    const verified = verifyMetaWebhookSignature({
      purpose: "social",
      rawBody,
      signatureHeader: signature,
    });
    assert.equal(verified.ok, true);
    assert.equal(verified.reason, "verified");
    assert.equal(verified.credentialsExposed, false);
    assert.match(verified.payloadChecksum, /^[a-f0-9]{64}$/);

    assert.equal(
      verifyMetaWebhookSignature({
        purpose: "social",
        rawBody: Buffer.from("{}"),
        signatureHeader: signature,
      }).ok,
      false,
    );
    assert.equal(
      verifyMetaWebhookSignature({
        purpose: "social",
        rawBody,
        signatureHeader: "sha256=bad",
      }).reason,
      "signature_missing_or_malformed",
    );
  });
});

test("Meta webhook verification fails closed when credentials or raw evidence are absent", () => {
  withCleanWebhookEnv(() => {
    const body = Buffer.from("{}", "utf8");
    assert.equal(
      verifyMetaWebhookChallenge({
        mode: "subscribe",
        verifyToken: "anything",
        challenge: "1",
      }).reason,
      "verify_token_not_configured",
    );
    assert.equal(
      verifyMetaWebhookSignature({
        rawBody: body,
        signatureHeader: "sha256=" + "0".repeat(64),
      }).reason,
      "signing_secret_not_configured",
    );

    process.env.META_APP_SECRET = "configured-secret";
    assert.equal(
      verifyMetaWebhookSignature({
        rawBody: undefined,
        signatureHeader: "sha256=" + "0".repeat(64),
      }).reason,
      "raw_body_missing",
    );
  });
});

test("separate Meta WhatsApp credentials take precedence", () => {
  withCleanWebhookEnv(() => {
    const rawBody = Buffer.from('{"object":"whatsapp_business_account"}', "utf8");
    process.env.META_APP_SECRET = "social-app-secret";
    process.env.META_WHATSAPP_APP_SECRET = "whatsapp-app-secret";
    const signature = metaSignature("whatsapp-app-secret", rawBody);

    assert.equal(
      verifyMetaWebhookSignature({
        purpose: "whatsapp",
        rawBody,
        signatureHeader: signature,
      }).ok,
      true,
    );

    delete process.env.META_WHATSAPP_APP_SECRET;
    delete process.env.META_APP_SECRET;
    assert.equal(
      verifyMetaWebhookSignature({
        purpose: "whatsapp",
        rawBody,
        signatureHeader: signature,
      }).reason,
      "signing_secret_not_configured",
    );
  });
});

test("readiness exposes configuration truth but never secret values", () => {
  withCleanWebhookEnv(() => {
    process.env.META_APP_SECRET = "do-not-expose-this-secret";
    process.env.META_WEBHOOK_VERIFY_TOKEN = "do-not-expose-this-token";
    const status = metaWebhookSecurityStatus("social");
    const serialized = JSON.stringify(status);

    assert.equal(status.verificationReady, true);
    assert.equal(status.credentialsExposed, false);
    assert.equal(status.signingSecretSource, "META_APP_SECRET");
    assert.equal(status.verifyTokenSource, "META_WEBHOOK_VERIFY_TOKEN");
    assert.doesNotMatch(serialized, /do-not-expose-this/);
  });
});

test("Meta-named webhook routes no longer delegate to an always-true Twilio verifier", () => {
  const route = readFileSync("server/routes/whatsapp.ts", "utf8");
  const legacyGateway = readFileSync("server/lib/whatsapp/waGateway.ts", "utf8");
  const twilioProvider = readFileSync(
    "server/lib/whatsapp/providers/twilioProvider.ts",
    "utf8",
  );

  assert.match(route, /verifyMetaWebhookChallenge/);
  assert.match(route, /verifyMetaWebhookSignature/);
  assert.doesNotMatch(route, /provider\.verifySignature/);
  assert.match(legacyGateway, /verifyMetaWebhookSignature/);
  assert.doesNotMatch(legacyGateway, /if \(!appSecret\) return true/);
  assert.doesNotMatch(twilioProvider, /verifySignature/);
});
