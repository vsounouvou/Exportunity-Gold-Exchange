import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  classifySocialInboxText,
  evaluateSocialReplyPolicy,
  isLeadEligibleClassification,
  normalizeSocialInboxDescriptor,
  sanitizeSocialVerificationEvidence,
  SOCIAL_INBOX_CLASSIFICATIONS,
} from "../server/lib/territory-media/socialInboxPolicy";

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("social inbox classification vocabulary exactly matches the mandate", () => {
  assert.deepEqual(SOCIAL_INBOX_CLASSIFICATIONS, [
    "interest",
    "purchase_request",
    "wholesale_request",
    "partnership",
    "producer_application",
    "creator_application",
    "delivery_question",
    "complaint",
    "misinformation",
    "spam",
    "abuse",
    "sensitive_issue",
    "press_request",
  ]);
});

test("deterministic routing classifies representative commerce and risk messages", () => {
  assert.equal(classifySocialInboxText("We need a wholesale container order and MOQ").classification, "wholesale_request");
  assert.equal(classifySocialInboxText("Where is my order? Please send tracking").classification, "delivery_question");
  assert.equal(classifySocialInboxText("I am a producer and want to list my products").classification, "producer_application");
  assert.equal(classifySocialInboxText("I am a journalist requesting an interview").classification, "press_request");
  assert.equal(classifySocialInboxText("This product injured someone and I will contact a regulator").classification, "sensitive_issue");
  assert.equal(classifySocialInboxText("https://a.test https://b.test https://c.test").classification, "spam");
});

test("only lead-eligible intents create CRM leads", () => {
  assert.equal(isLeadEligibleClassification("interest"), true);
  assert.equal(isLeadEligibleClassification("purchase_request"), true);
  assert.equal(isLeadEligibleClassification("producer_application"), true);
  assert.equal(isLeadEligibleClassification("complaint"), false);
  assert.equal(isLeadEligibleClassification("spam"), false);
  assert.equal(isLeadEligibleClassification("sensitive_issue"), false);
});

test("provider, platform, channel, and event type must agree", () => {
  assert.deepEqual(
    normalizeSocialInboxDescriptor({
      provider: "meta",
      platform: "instagram",
      channel: "instagram_dm",
      eventType: "direct_message",
    }),
    { provider: "meta", platform: "instagram", channel: "instagram_dm", eventType: "direct_message" },
  );
  assert.throws(
    () =>
      normalizeSocialInboxDescriptor({
        provider: "google",
        platform: "instagram",
        channel: "instagram_dm",
        eventType: "direct_message",
      }),
    /provider must be meta/,
  );
  assert.throws(
    () =>
      normalizeSocialInboxDescriptor({
        provider: "meta",
        platform: "instagram",
        channel: "instagram_comment",
        eventType: "direct_message",
      }),
    /direct-message channel/,
  );
});

test("verification evidence is fail-closed, bounded, and credential-free", () => {
  const evidence = sanitizeSocialVerificationEvidence(
    {
      verified: true,
      method: "provider_signature",
      verifiedAt: "2026-08-17T00:00:00.000Z",
      businessOwnedAccountConfirmed: true,
      credentialsExcluded: true,
      adapter: "meta-webhook-v1",
      requestId: "request-123",
      authorization: "must not survive",
      accessToken: "must not survive",
    },
    new Date("2026-08-17T00:01:00.000Z"),
  );
  assert.equal(evidence.verified, true);
  assert.equal(evidence.requestId, "request-123");
  assert.equal("authorization" in evidence, false);
  assert.equal("accessToken" in evidence, false);
  assert.throws(
    () =>
      sanitizeSocialVerificationEvidence({
        verified: false,
        method: "provider_signature",
        verifiedAt: "2026-08-17T00:00:00.000Z",
      }),
    /verified provider evidence/,
  );
});

test("social replies require adapter, approved facts, policies, tone, prices, and human review", () => {
  const blocked = evaluateSocialReplyPolicy({
    classification: "complaint",
    adapterAvailable: false,
    containsPriceClaim: true,
  });
  assert.equal(blocked.eligible, false);
  assert.ok(blocked.blockers.includes("official_reply_adapter_unavailable"));
  assert.ok(blocked.blockers.includes("approved_product_fact_reference_required"));
  assert.ok(blocked.blockers.includes("approved_policy_reference_required"));
  assert.ok(blocked.blockers.includes("approved_tone_reference_required"));
  assert.ok(blocked.blockers.includes("approved_price_reference_required"));
  assert.ok(blocked.blockers.includes("human_approval_required_for_sensitive_classification"));
  assert.equal(blocked.externalReplyPerformed, false);

  const eligible = evaluateSocialReplyPolicy({
    classification: "purchase_request",
    adapterAvailable: true,
    approvedFactRefs: ["fact-pack:42:v3"],
    approvedPolicyRefs: ["returns:v2"],
    approvedToneRef: "brand-tone:v4",
    approvedPriceRefs: ["price-snapshot:88"],
    containsPriceClaim: true,
    humanApproved: true,
  });
  assert.equal(eligible.eligible, true);
  assert.deepEqual(eligible.blockers, []);
});

test("schema, migration, runtime parity, service, admin routes, canonical inbox, and UI remain connected", async () => {
  const [schema, agentTaskMigration, migration, ensure, service, policy, routes, communicationsSchema, communicationsRoutes, ui, index] =
    await Promise.all([
      read("db/schema/territory-media-commerce.ts"),
      read("db/migrations/20270414_exportunity_agent_task_foundation.sql"),
      read("db/migrations/20270415_exportunity_social_inbox_foundation.sql"),
      read("server/lib/territory-media/ensureTables.ts"),
      read("server/lib/territory-media/socialInbox.ts"),
      read("server/lib/territory-media/socialInboxPolicy.ts"),
      read("server/routes/admin-marketing.ts"),
      read("db/schema/communications.ts"),
      read("server/routes/communications.ts"),
      read("client/src/pages/AdminCommunicationsInboxPage.tsx"),
      read("server/index.ts"),
    ]);

  assert.match(agentTaskMigration, /create table if not exists agent_tasks/);
  assert.match(agentTaskMigration, /create table if not exists agent_action_logs/);
  assert.match(agentTaskMigration, /agent_tasks_execution_status_check/);
  assert.match(migration, /agent_task_id integer references agent_tasks\(id\)/);

  for (const table of ["social_inbox_events", "social_inbox_event_audit"]) {
    assert.match(schema, new RegExp(`"${table}"`));
    assert.match(migration, new RegExp(table));
    assert.match(ensure, new RegExp(table));
  }
  assert.match(migration, /social_inbox_events_verification_check/);
  assert.match(migration, /unique \(tenant_id, provider, provider_event_id\)/);
  assert.match(service, /communicationsThreads/);
  assert.match(service, /communicationsMessages/);
  assert.match(service, /communicationsWorkOrders/);
  assert.match(service, /tenantContacts/);
  assert.match(service, /agentTasks/);
  assert.match(service, /pg_advisory_xact_lock/);
  assert.match(service, /externalReplyPerformed: false/);
  assert.doesNotMatch(service, /rawPayload/);
  assert.doesNotMatch(service, /accessToken/);
  assert.match(policy, /approved_product_fact_reference_required/);
  assert.match(policy, /approved_price_reference_required/);
  assert.match(routes, /marketing\/social\/inbox\/ingest/);
  assert.match(routes, /marketing\/social\/inbox\/events/);
  assert.match(communicationsSchema, /instagram_dm/);
  assert.match(communicationsSchema, /youtube_comment/);
  assert.match(communicationsRoutes, /eventProvider/);
  assert.match(ui, /Governed social response/);
  assert.match(ui, /official reply adapter/);
  assert.ok(index.indexOf("ensureCommunicationsTables()") < index.indexOf("ensureTerritoryMediaCommerceTables()"));
  assert.ok(index.indexOf("ensureContactTables()") < index.indexOf("ensureTerritoryMediaCommerceTables()"));
});
