import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  canRunLegacyWhatsAppAutomation,
  canSendLegacyInboundAutoReply,
} from "../server/lib/communications/inbound-auto-reply-policy";
import { buildExportunityIndustrialInboundReply } from "../server/lib/communications/exportunity-inbound-response";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("legacy inbound auto-replies are opt-in and never run for Exportunity", () => {
  assert.equal(canSendLegacyInboundAutoReply({ tenantKey: "exportunity" }), false);
  assert.equal(canSendLegacyInboundAutoReply({ tenantKey: "exportunity", enabled: "true" }), false);
  assert.equal(canSendLegacyInboundAutoReply({ tenantKey: "bdo" }), false);
  assert.equal(canSendLegacyInboundAutoReply({ tenantKey: "bdo", enabled: "true" }), true);
});

test("legacy WhatsApp automation is opt-in and never runs for Exportunity", () => {
  assert.equal(canRunLegacyWhatsAppAutomation({ tenantKey: "exportunity", enabled: "true" }), false);
  assert.equal(canRunLegacyWhatsAppAutomation({ tenantKey: "mindbase" }), false);
  assert.equal(canRunLegacyWhatsAppAutomation({ tenantKey: "mindbase", enabled: "true" }), true);
});

test("Exportunity's deterministic inbound reply stays industrial and does not expose gold language", () => {
  const reply = buildExportunityIndustrialInboundReply("en");
  const copy = reply.response.toLowerCase();

  assert.equal(reply.mode, "canned");
  assert.match(copy, /b2b sourcing/);
  assert.doesNotMatch(copy, /gold/);
  assert.doesNotMatch(copy, /lbma/);
  assert.doesNotMatch(copy, /price/);
});

test("the legacy Exportunity agent-economy seed cannot be invoked from package scripts", () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));
  const legacySeed = fs.readFileSync(path.join(repoRoot, "scripts", "seed-exportunity-agent-economy.ts"), "utf8");

  assert.equal(packageJson.scripts["seed:exportunity-agent-economy"], undefined);
  assert.match(legacySeed, /retired/i);
  assert.match(legacySeed, /process\.exitCode = 1/);
  assert.doesNotMatch(legacySeed, /Exportunity2026!/);
  assert.doesNotMatch(legacySeed, /passwordHash/);
});

test("Twilio and Meta webhook routes enforce the inbound automation policy", () => {
  const twilioWebhook = fs.readFileSync(path.join(repoRoot, "server", "routes", "twilio-webhooks.ts"), "utf8");
  const whatsappWebhook = fs.readFileSync(path.join(repoRoot, "server", "routes", "whatsapp.ts"), "utf8");

  assert.match(twilioWebhook, /canSendLegacyInboundAutoReply/);
  assert.match(twilioWebhook, /shouldAutoReply\(tenantKey\)/);
  assert.match(whatsappWebhook, /canRunLegacyWhatsAppAutomation/);
  assert.match(whatsappWebhook, /WHATSAPP_LEGACY_AUTOMATION_ENABLED/);
});
