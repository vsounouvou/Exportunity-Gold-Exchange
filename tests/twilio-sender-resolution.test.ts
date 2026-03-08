import test from "node:test";
import assert from "node:assert/strict";

import { resolveSenderFromProfiles } from "../server/lib/communications/sender-resolution";

const fallbackEnv = {
  accountSid: "AC12345678901234567890123456789012",
  authToken: "abcdefabcdefabcdefabcdefabcdefab",
  messagingServiceSid: "MG12345678901234567890123456789012",
  smsFrom: "+16079486041",
  whatsappFrom: "whatsapp:+15551230000",
  verifyServiceSid: "VA12345678901234567890123456789012",
  voiceFrom: null,
  envNamespace: "global",
} as const;

test("resolveSenderFromProfiles uses tenant defaults for production WhatsApp", () => {
  const resolved = resolveSenderFromProfiles({
    tenantId: 7,
    tenantKey: "met",
    tenantName: "Maison en Terre",
    channel: "whatsapp",
    fallbackEnv,
    tenantProfile: {
      id: 1,
      tenantId: 7,
      isActive: true,
      defaultChannel: "whatsapp",
      smsFrom: "+2250100000000",
      whatsappFrom: "whatsapp:+2250700000000",
      verifyServiceSid: "VA225",
      senderLabel: "Maison en Terre",
      defaultSignature: "Equipe Maison en Terre",
      messagingServiceSid: "MG225",
      whatsappSenderStatus: "approved",
      useSandboxForDev: false,
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });

  assert.equal(resolved.fromAddress, "whatsapp:+2250700000000");
  assert.equal(resolved.signature, "Equipe Maison en Terre");
  assert.equal(resolved.resolutionSource, "tenant_profile");
  assert.equal(resolved.isSandbox, false);
});

test("resolveSenderFromProfiles applies agent override and signature", () => {
  const resolved = resolveSenderFromProfiles({
    tenantId: 3,
    tenantKey: "bdo",
    tenantName: "Bourse de l'Or",
    channel: "sms",
    fallbackEnv,
    tenantProfile: {
      id: 1,
      tenantId: 3,
      isActive: true,
      defaultChannel: "sms",
      smsFrom: "+2250100000111",
      whatsappFrom: "whatsapp:+2250100000111",
      verifyServiceSid: "VA123",
      senderLabel: "Bourse de l'Or",
      defaultSignature: "Equipe BDO",
      messagingServiceSid: "MG123",
      whatsappSenderStatus: "approved",
      useSandboxForDev: false,
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    agentProfile: {
      id: 2,
      tenantId: 3,
      agentId: 9,
      isActive: true,
      displayName: "Awa Konan",
      signature: "Awa Konan",
      allowedChannels: ["sms", "whatsapp"],
      smsFrom: "+2250100000222",
      whatsappFrom: null,
      fallbackToTenantDefault: true,
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    agentId: 9,
    agentKey: "support",
  });

  assert.equal(resolved.fromAddress, "+2250100000222");
  assert.equal(resolved.signature, "Awa Konan");
  assert.equal(resolved.senderLabel, "Awa Konan");
  assert.equal(resolved.resolutionSource, "agent_profile");
});

test("resolveSenderFromProfiles falls back to shared env when no profile exists", () => {
  const resolved = resolveSenderFromProfiles({
    tenantId: 5,
    tenantKey: "exportunity",
    tenantName: "Exportunity",
    channel: "sms",
    fallbackEnv,
  });

  assert.equal(resolved.fromAddress, "+16079486041");
  assert.equal(resolved.messagingServiceSid, "MG12345678901234567890123456789012");
  assert.equal(resolved.resolutionSource, "global_env");
});

test("resolveSenderFromProfiles only marks sandbox when explicitly enabled", () => {
  const sandboxFallback = { ...fallbackEnv, whatsappFrom: "whatsapp:+14155238886" };
  const prodResolved = resolveSenderFromProfiles({
    tenantId: 1,
    tenantKey: "exportunity",
    tenantName: "Exportunity",
    channel: "whatsapp",
    fallbackEnv: sandboxFallback,
    tenantProfile: {
      id: 1,
      tenantId: 1,
      isActive: true,
      defaultChannel: "whatsapp",
      smsFrom: null,
      whatsappFrom: "whatsapp:+14155238886",
      verifyServiceSid: "VA1",
      senderLabel: "Exportunity",
      defaultSignature: null,
      messagingServiceSid: null,
      whatsappSenderStatus: "pending",
      useSandboxForDev: false,
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });

  const sandboxResolved = resolveSenderFromProfiles({
    tenantId: 1,
    tenantKey: "exportunity",
    tenantName: "Exportunity",
    channel: "whatsapp",
    fallbackEnv: sandboxFallback,
    tenantProfile: {
      id: 1,
      tenantId: 1,
      isActive: true,
      defaultChannel: "whatsapp",
      smsFrom: null,
      whatsappFrom: "whatsapp:+14155238886",
      verifyServiceSid: "VA1",
      senderLabel: "Exportunity",
      defaultSignature: null,
      messagingServiceSid: null,
      whatsappSenderStatus: "pending",
      useSandboxForDev: true,
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });

  assert.equal(prodResolved.isSandbox, false);
  assert.equal(sandboxResolved.isSandbox, true);
});
