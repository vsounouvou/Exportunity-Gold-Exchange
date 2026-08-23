import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  evaluateOutboundCommunicationPolicy,
  type OutboundCommunicationPolicyInput,
} from "../server/lib/communications/outboundPolicy";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function allowedInput(
  overrides: Partial<OutboundCommunicationPolicyInput> = {},
): OutboundCommunicationPolicyInput {
  return {
    tenantKey: "exportunity",
    strictGovernance: true,
    channel: "email",
    purpose: "service_update",
    contactBasis: "service_requested",
    commitmentRisk: "none",
    actorType: "human",
    executionRequested: true,
    approvalGranted: true,
    autonomousLowRiskAuthorized: false,
    externalCommunicationsEnabled: true,
    providerConfigured: true,
    channelEnabled: true,
    senderVerified: true,
    recipientAddressPresent: true,
    recipientVerified: true,
    consentStatus: "opt_in",
    doNotContact: false,
    suppressionChecked: true,
    suppressed: false,
    contactPreference: "allowed",
    explicitOptInEvidence: true,
    businessHoursKnown: true,
    withinBusinessHours: true,
    quietHoursExempt: false,
    sentToday: 0,
    dailyLimit: 100,
    ...overrides,
  };
}

test("kill switch is reviewable while drafting and blocks execution", () => {
  const draft = evaluateOutboundCommunicationPolicy(
    allowedInput({
      executionRequested: false,
      approvalGranted: false,
      externalCommunicationsEnabled: false,
    }),
  );
  assert.equal(draft.decision, "REQUIRE_APPROVAL");
  assert.ok(
    draft.requirements.includes("external_communications_kill_switch_disabled"),
  );

  const execution = evaluateOutboundCommunicationPolicy(
    allowedInput({ externalCommunicationsEnabled: false }),
  );
  assert.equal(execution.decision, "BLOCK");
  assert.equal(execution.mayExecute, false);
});

test("DNC, opt-out and suppression remain hard blocks after approval", () => {
  for (const override of [
    { doNotContact: true },
    { consentStatus: "opt_out" as const },
    { suppressed: true },
    { contactPreference: "not_allowed" as const },
  ]) {
    const result = evaluateOutboundCommunicationPolicy(
      allowedInput(override),
    );
    assert.equal(result.decision, "BLOCK");
    assert.equal(result.mayExecute, false);
  }
});

test("verified supplier RFQ email requires review then allows its approval receipt", () => {
  const draft = evaluateOutboundCommunicationPolicy(
    allowedInput({
      purpose: "supplier_rfq",
      contactBasis: "public_b2b_relevance",
      commitmentRisk: "commercial_discussion",
      consentStatus: "unknown",
      explicitOptInEvidence: false,
      executionRequested: false,
      approvalGranted: false,
    }),
  );
  assert.equal(draft.decision, "REQUIRE_APPROVAL");
  assert.ok(draft.requirements.includes("human_approval_required_for_supplier_rfq"));

  const approved = evaluateOutboundCommunicationPolicy(
    allowedInput({
      purpose: "supplier_rfq",
      contactBasis: "public_b2b_relevance",
      commitmentRisk: "commercial_discussion",
      consentStatus: "unknown",
      explicitOptInEvidence: false,
    }),
  );
  assert.equal(approved.decision, "ALLOW_AUTO_SEND");
});

test("supplier RFQ execution blocks an unverified recipient", () => {
  const result = evaluateOutboundCommunicationPolicy(
    allowedInput({
      purpose: "supplier_rfq",
      contactBasis: "public_b2b_relevance",
      recipientVerified: false,
    }),
  );
  assert.equal(result.decision, "BLOCK");
  assert.ok(result.blockers.includes("supplier_recipient_not_verified"));
});

test("WhatsApp requires explicit opt-in and an approved template or active session", () => {
  const noOptIn = evaluateOutboundCommunicationPolicy(
    allowedInput({
      channel: "whatsapp",
      consentStatus: "unknown",
      explicitOptInEvidence: false,
      whatsappTemplateApproved: true,
    }),
  );
  assert.equal(noOptIn.decision, "BLOCK");
  assert.ok(noOptIn.blockers.includes("explicit_channel_opt_in_missing"));

  const noTemplate = evaluateOutboundCommunicationPolicy(
    allowedInput({
      channel: "whatsapp",
      whatsappTemplateApproved: false,
      whatsappSessionActive: false,
    }),
  );
  assert.equal(noTemplate.decision, "BLOCK");

  const approved = evaluateOutboundCommunicationPolicy(
    allowedInput({
      channel: "whatsapp",
      whatsappTemplateApproved: true,
    }),
  );
  assert.equal(approved.decision, "ALLOW_AUTO_SEND");
});

test("marketing without explicit opt-in is blocked on every channel", () => {
  for (const channel of ["email", "sms", "whatsapp", "voice"] as const) {
    const result = evaluateOutboundCommunicationPolicy(
      allowedInput({
        channel,
        purpose: "marketing",
        contactBasis: "unknown",
        consentStatus: "unknown",
        explicitOptInEvidence: false,
        whatsappTemplateApproved: channel === "whatsapp",
      }),
    );
    assert.equal(result.decision, "BLOCK");
    assert.ok(result.blockers.includes("marketing_requires_explicit_opt_in"));
  }
});

test("voice always needs approval and execution respects business hours", () => {
  const draft = evaluateOutboundCommunicationPolicy(
    allowedInput({
      channel: "voice",
      contactBasis: "existing_business_relationship",
      executionRequested: false,
      approvalGranted: false,
    }),
  );
  assert.equal(draft.decision, "REQUIRE_APPROVAL");
  assert.ok(draft.requirements.includes("voice_requires_human_approval"));

  const outsideHours = evaluateOutboundCommunicationPolicy(
    allowedInput({
      channel: "voice",
      contactBasis: "existing_business_relationship",
      withinBusinessHours: false,
    }),
  );
  assert.equal(outsideHours.decision, "BLOCK");
  assert.ok(outsideHours.blockers.includes("outside_recipient_business_hours"));
});

test("only explicitly authorized low-risk agent traffic may auto-send", () => {
  const result = evaluateOutboundCommunicationPolicy(
    allowedInput({
      actorType: "agent",
      purpose: "support_response",
      executionRequested: false,
      approvalGranted: false,
      autonomousLowRiskAuthorized: true,
    }),
  );
  assert.equal(result.decision, "ALLOW_AUTO_SEND");

  const pricing = evaluateOutboundCommunicationPolicy(
    allowedInput({
      actorType: "agent",
      purpose: "customer_offer",
      commitmentRisk: "pricing",
      executionRequested: false,
      approvalGranted: false,
      autonomousLowRiskAuthorized: true,
    }),
  );
  assert.equal(pricing.decision, "REQUIRE_APPROVAL");
});

test("channel quotas block execution", () => {
  const result = evaluateOutboundCommunicationPolicy(
    allowedInput({ sentToday: 10, dailyLimit: 10 }),
  );
  assert.equal(result.decision, "BLOCK");
  assert.ok(result.blockers.includes("daily_channel_quota_reached"));
});

test("legacy tenants retain their existing governance path", () => {
  const result = evaluateOutboundCommunicationPolicy(
    allowedInput({
      tenantKey: "bdo",
      strictGovernance: false,
      externalCommunicationsEnabled: false,
      suppressionChecked: false,
      recipientAddressPresent: false,
    }),
  );
  assert.equal(result.decision, "ALLOW_AUTO_SEND");
  assert.equal(result.strictGovernance, false);
});

test("all external provider boundaries reference the canonical policy receipt", () => {
  const read = (relativePath: string) =>
    fs.readFileSync(path.join(repoRoot, relativePath), "utf8");

  assert.match(
    read("server/lib/actions/ActionRouter.ts"),
    /evaluateOutboundActionPolicy/,
  );
  assert.match(
    read("server/lib/actions/ActionRouter.ts"),
    /ACTION_NOT_AWAITING_APPROVAL/,
  );
  assert.match(
    read("server/lib/actions/worker.ts"),
    /outboundExecutionPolicy/,
  );
  assert.match(
    read("server/lib/mail/sender.ts"),
    /assertOutboundActionExecutionAllowed/,
  );
  assert.match(
    read("server/lib/communications/twilio.ts"),
    /assertOutboundActionExecutionAllowed/,
  );
  assert.match(
    read("server/routes/voice.ts"),
    /assertOutboundActionExecutionAllowed/,
  );
});

test("account connection scopes remain read-only or feature-gated until a separately governed release", () => {
  const mindbase = fs.readFileSync(
    path.join(repoRoot, "server", "routes", "mindbase.ts"),
    "utf8",
  );
  const integrationConfig = fs.readFileSync(
    path.join(repoRoot, "server", "lib", "integrations", "config.ts"),
    "utf8",
  );

  for (const source of [mindbase, integrationConfig]) {
    assert.doesNotMatch(source, /auth\/gmail\.(?:send|modify|compose)/i);
    assert.doesNotMatch(source, /auth\/calendar\.events(?:['"]|\s|,)/i);
    assert.doesNotMatch(source, /auth\/drive\.file/i);
  }
  assert.match(mindbase, /FEATURE_META_SOCIAL_WEBHOOK_INGESTION/);
  assert.match(mindbase, /metaOAuthScopesForFeature/);
  assert.match(mindbase, /auth\/gmail\.readonly/);
  assert.match(mindbase, /auth\/calendar\.readonly/);
  assert.match(mindbase, /auth\/drive\.readonly/);
});

test("Exportunity provider release requires explicit channel and sender gates", () => {
  const decisionService = fs.readFileSync(
    path.join(
      repoRoot,
      "server",
      "lib",
      "communications",
      "outboundDecisionService.ts",
    ),
    "utf8",
  );
  const envExample = fs.readFileSync(path.join(repoRoot, ".env.example"), "utf8");

  for (const flag of [
    "FEATURE_EXPORTUNITY_EMAIL_OUTBOUND",
    "FEATURE_EXPORTUNITY_SMS_OUTBOUND",
    "FEATURE_EXPORTUNITY_WHATSAPP_OUTBOUND",
    "FEATURE_EXPORTUNITY_VOICE_OUTBOUND",
    "EXPORTUNITY_EMAIL_SENDER_VERIFIED",
    "EXPORTUNITY_SMS_SENDER_VERIFIED",
    "EXPORTUNITY_WHATSAPP_SENDER_VERIFIED",
    "EXPORTUNITY_VOICE_CALLER_ID_VERIFIED",
  ]) {
    assert.match(decisionService, new RegExp(flag));
    assert.match(envExample, new RegExp(`${flag}=false`));
  }
  assert.match(decisionService, /resolveOutboundProviderReadiness/);
});
