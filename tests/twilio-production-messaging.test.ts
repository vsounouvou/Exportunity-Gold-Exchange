import test from "node:test";
import assert from "node:assert/strict";

import {
  assertResolvedSenderForChannel,
  normalizeE164,
  resolveTemplateDispatch,
  resolveTwilioProviderErrorMessage,
} from "../server/lib/communications/twilio";
import {
  buildInboundMessageLogValues,
  buildOutboundLogFinalizePatch,
  buildOutboundMessageLogValues,
  mapTwilioStatusToLogStatus,
} from "../server/lib/communications/message-logs";

const baseResolvedSender = {
  tenantId: 1,
  tenantKey: "exportunity",
  agentId: 3,
  agentKey: "support",
  channel: "whatsapp" as const,
  fromAddress: "whatsapp:+2250700000000",
  verifyServiceSid: "VA123",
  messagingServiceSid: "MG123",
  senderLabel: "Exportunity",
  signature: "Equipe Exportunity",
  isSandbox: false,
  resolutionSource: "tenant_profile" as const,
  whatsappSenderStatus: "approved",
  useSandboxForDev: false,
  agentChannelAllowed: true,
  tenantProfileId: 1,
  agentProfileId: 2,
};

test("normalizeE164 rejects invalid destinations", () => {
  assert.equal(normalizeE164("+225000000229"), "+225000000229"); // syntactically valid even if carrier may reject it later
  assert.equal(normalizeE164("2250100000229"), null);
  assert.equal(normalizeE164("+12"), null);
});

test("assertResolvedSenderForChannel rejects missing production WhatsApp sender", () => {
  assert.throws(
    () =>
      assertResolvedSenderForChannel("whatsapp", {
        ...baseResolvedSender,
        fromAddress: null,
      }),
    /Missing production WhatsApp sender/i,
  );
});

test("assertResolvedSenderForChannel rejects missing Verify SID", () => {
  assert.throws(
    () =>
      assertResolvedSenderForChannel("verify_sms", {
        ...baseResolvedSender,
        verifyServiceSid: null,
      }),
    /Verify Service SID/i,
  );
});

test("resolveTwilioProviderErrorMessage only gives sandbox join guidance when sandbox is enabled", () => {
  const sandboxHint = resolveTwilioProviderErrorMessage("63015", null, {
    sandboxMode: true,
    sandboxFrom: "whatsapp:+14155238886",
  });
  const prodHint = resolveTwilioProviderErrorMessage("63015", null, {
    sandboxMode: false,
    sandboxFrom: "whatsapp:+2250700000000",
  });

  assert.match(String(sandboxHint), /join/i);
  assert.doesNotMatch(String(prodHint), /join/i);
  assert.match(String(prodHint), /approved/i);
});

test("resolveTemplateDispatch extracts contentSid and variables for production WhatsApp templates", () => {
  const dispatch = resolveTemplateDispatch({
    templateName: "appointment-reminder",
    templatePayload: {
      contentSid: "HXabcdef1234567890abcdef1234567890",
      contentVariables: { "1": "12/1", "2": "3pm" },
      language: "fr",
    },
  });

  assert.equal(dispatch.contentSid, "HXabcdef1234567890abcdef1234567890");
  assert.deepEqual(dispatch.contentVariables, { "1": "12/1", "2": "3pm" });
  assert.equal(dispatch.language, "fr");
});

test("outbound log helpers model lifecycle and provider linkage", () => {
  const queued = buildOutboundMessageLogValues({
    tenantId: 4,
    agentId: 7,
    channel: "sms",
    fromAddress: "+16079486041",
    toAddress: "+2250100000229",
    body: "Bonjour",
  });
  const finalized = buildOutboundLogFinalizePatch({
    status: "delivered",
    twilioStatus: "delivered",
    twilioMessageSid: "SM123",
    providerResponse: { sid: "SM123" },
  });

  assert.equal(queued.status, "queued");
  assert.equal(finalized.status, "delivered");
  assert.equal(finalized.twilioMessageSid, "SM123");
});

test("webhook status mapping normalizes Twilio states", () => {
  assert.equal(mapTwilioStatusToLogStatus("accepted"), "queued");
  assert.equal(mapTwilioStatusToLogStatus("sent"), "sent");
  assert.equal(mapTwilioStatusToLogStatus("delivered"), "delivered");
  assert.equal(mapTwilioStatusToLogStatus("undelivered"), "undelivered");
  assert.equal(mapTwilioStatusToLogStatus("failed"), "failed");
});

test("inbound log helper preserves tenant and raw payload", () => {
  const inbound = buildInboundMessageLogValues({
    tenantId: 2,
    agentId: 9,
    fromAddress: "whatsapp:+2250100000229",
    toAddress: "whatsapp:+2250700000000",
    body: "Bonjour",
    channel: "whatsapp",
    twilioMessageSid: "SM999",
    rawPayload: { MessageSid: "SM999", Body: "Bonjour" },
  });

  assert.equal(inbound.tenantId, 2);
  assert.equal(inbound.agentId, 9);
  assert.equal(inbound.rawPayload.MessageSid, "SM999");
});

test("log helpers normalize null-prototype webhook payloads for JSON storage", () => {
  const nullProtoPayload = Object.assign(Object.create(null), {
    MessageSid: "SMproto",
    MessageStatus: "delivered",
  });

  const inbound = buildInboundMessageLogValues({
    tenantId: 2,
    fromAddress: "whatsapp:+2250100000229",
    toAddress: "whatsapp:+16079486041",
    channel: "whatsapp",
    rawPayload: nullProtoPayload,
  });

  const finalized = buildOutboundLogFinalizePatch({
    status: "delivered",
    twilioStatus: "delivered",
    twilioMessageSid: "SMproto",
    providerResponse: nullProtoPayload,
  });

  assert.deepEqual(inbound.rawPayload, { MessageSid: "SMproto", MessageStatus: "delivered" });
  assert.deepEqual(finalized.providerResponse, { MessageSid: "SMproto", MessageStatus: "delivered" });
});
