import test from "node:test";
import assert from "node:assert/strict";

import {
  computeTwilioSignature,
  resolveTwilioProviderErrorMessage,
  verifyTwilioWebhookSignature,
} from "../server/lib/communications/twilio";

test("verifyTwilioWebhookSignature: accepts valid signature", () => {
  const authToken = "topsecret";
  const url = "https://example.com/api/webhooks/twilio/inbound";
  const body = { From: "whatsapp:+2250100000229", To: "whatsapp:+14155238886", Body: "Ping", MessageSid: "SM123" };
  const signature = computeTwilioSignature({ url, body, authToken });

  const out = verifyTwilioWebhookSignature({ url, body, signatureHeader: signature, authToken });
  assert.equal(out.ok, true);
});

test("verifyTwilioWebhookSignature: rejects invalid signature", () => {
  const authToken = "topsecret";
  const url = "https://example.com/api/webhooks/twilio/status";
  const body = { MessageSid: "SM123", MessageStatus: "sent" };

  const out = verifyTwilioWebhookSignature({ url, body, signatureHeader: "bad", authToken });
  assert.equal(out.ok, false);
});

test("resolveTwilioProviderErrorMessage: maps known Twilio error code", () => {
  process.env.TWILIO_SANDBOX_MODE = "true";
  process.env.TWILIO_WHATSAPP_FROM = "whatsapp:+14155238886";

  const out = resolveTwilioProviderErrorMessage("63016", null);
  assert.equal(typeof out, "string");
  assert.match(String(out), /sandbox/i);
  assert.match(String(out), /join/i);
});
