import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  metaOAuthScopesForFeature,
  parseMetaSocialWebhookPayload,
  parsedMetaSocialEventFromPayload,
  requiredMetaInboundScopes,
  sanitizeMetaWebhookPayload,
} from "../server/lib/territory-media/metaSocialWebhookPolicy";

const checksumA = "a".repeat(64);
const checksumB = "b".repeat(64);
const now = new Date("2026-08-17T12:00:00.000Z");
const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Facebook Messenger text events parse with stable provider identity and timestamps", () => {
  const payload = {
    object: "page",
    entry: [
      {
        id: "page-123",
        time: 1786967900000,
        messaging: [
          {
            sender: { id: "psid-456" },
            recipient: { id: "page-123" },
            timestamp: 1786967900123,
            message: { mid: "mid-facebook-1", text: "We need a wholesale quotation" },
          },
        ],
      },
    ],
  };
  const parsed = parseMetaSocialWebhookPayload({ payload, payloadChecksum: checksumA, now });
  assert.equal(parsed.candidates.length, 1);
  const candidate = parsed.candidates[0];
  assert.equal(candidate.parseStatus, "parsed");
  assert.equal(candidate.initialResolutionStatus, "received");
  assert.equal(candidate.event?.platform, "facebook");
  assert.equal(candidate.event?.channel, "facebook_messenger");
  assert.equal(candidate.event?.externalAccountId, "page-123");
  assert.equal(candidate.event?.externalActorId, "psid-456");
  assert.equal(candidate.event?.providerEventId, "mid-facebook-1");
  assert.equal(candidate.event?.receivedAt, "2026-08-17T11:58:20.123Z");
  assert.deepEqual(parsedMetaSocialEventFromPayload(candidate.sanitizedPayload), candidate.event);

  const replay = parseMetaSocialWebhookPayload({ payload, payloadChecksum: checksumB, now });
  assert.equal(replay.candidates[0].receiptKey, candidate.receiptKey);
});

test("business echoes are durably classified but never projected as inbound", () => {
  const parsed = parseMetaSocialWebhookPayload({
    payloadChecksum: checksumA,
    now,
    payload: {
      object: "instagram",
      entry: [
        {
          id: "ig-business-1",
          messaging: [
            {
              sender: { id: "ig-business-1" },
              recipient: { id: "igsid-customer" },
              timestamp: 1786967900123,
              message: { mid: "ig-echo-1", text: "Our outbound reply", is_echo: true },
            },
          ],
        },
      ],
    },
  });
  assert.equal(parsed.candidates[0].parseStatus, "parsed");
  assert.equal(parsed.candidates[0].initialResolutionStatus, "ignored_outbound");
  assert.equal(parsed.candidates[0].reasonCode, "outbound_or_self_message");
});

test("Instagram comment and messaging payloads map only documented text shapes", () => {
  const comment = parseMetaSocialWebhookPayload({
    payloadChecksum: checksumA,
    now,
    payload: {
      object: "instagram",
      entry: [
        {
          id: "ig-business-2",
          time: 1786967800,
          changes: [
            {
              field: "comments",
              value: {
                id: "ig-comment-9",
                from: { id: "igsid-9", username: "buyer_nine" },
                text: "Can you deliver two pallets?",
                media: { id: "ig-media-7", media_product_type: "FEED" },
              },
            },
          ],
        },
      ],
    },
  }).candidates[0];
  assert.equal(comment.event?.channel, "instagram_comment");
  assert.equal(comment.event?.externalActorLabel, "buyer_nine");
  assert.equal(comment.event?.parentContentId, "ig-media-7");

  const message = parseMetaSocialWebhookPayload({
    payloadChecksum: checksumB,
    now,
    payload: {
      object: "instagram",
      entry: [
        {
          id: "ig-business-2",
          time: 1786967800000,
          messaging: [
            {
              sender: { id: "igsid-10" },
              recipient: { id: "ig-business-2" },
              message: { mid: "ig-mid-10", text: "I want to become a producer" },
            },
          ],
        },
      ],
    },
  }).candidates[0];
  assert.equal(message.event?.channel, "instagram_dm");
  assert.equal(message.event?.externalActorId, "igsid-10");
});

test("Facebook Page feed comment additions map conservatively", () => {
  const candidate = parseMetaSocialWebhookPayload({
    payloadChecksum: checksumA,
    now,
    payload: {
      object: "page",
      entry: [
        {
          id: "page-88",
          time: 1786967800,
          changes: [
            {
              field: "feed",
              value: {
                item: "comment",
                verb: "add",
                comment_id: "comment-88",
                post_id: "post-22",
                message: "Please share your MOQ",
                from: { id: "psid-88", name: "Industrial Buyer" },
              },
            },
          ],
        },
      ],
    },
  }).candidates[0];
  assert.equal(candidate.event?.platform, "facebook");
  assert.equal(candidate.event?.channel, "facebook_comment");
  assert.equal(candidate.event?.providerEventId, "comment-88");
  assert.equal(candidate.event?.parentContentId, "post-22");
});

test("unsupported payloads remain durable candidates and provider credentials are redacted", () => {
  const parsed = parseMetaSocialWebhookPayload({
    payloadChecksum: checksumA,
    now,
    payload: {
      object: "threads",
      access_token: "provider-token-must-not-survive",
      nested: { clientSecret: "provider-secret-must-not-survive" },
    },
  });
  assert.equal(parsed.candidates.length, 1);
  assert.equal(parsed.candidates[0].objectType, "unknown");
  assert.equal(parsed.candidates[0].parseStatus, "unsupported");
  assert.equal(parsed.candidates[0].initialResolutionStatus, "unsupported_payload");
  const serialized = JSON.stringify(parsed.candidates[0].sanitizedPayload);
  assert.doesNotMatch(serialized, /provider-token-must-not-survive/);
  assert.doesNotMatch(serialized, /provider-secret-must-not-survive/);
  assert.match(serialized, /redacted_provider_credential/);

  const direct = JSON.stringify(
    sanitizeMetaWebhookPayload({ apiKey: "private", authorization: "Bearer private" }),
  );
  assert.doesNotMatch(direct, /Bearer private|"private"/);
});

test("inbound Meta OAuth permissions appear only behind the adapter release flag", () => {
  const base = metaOAuthScopesForFeature("instagram", false);
  const released = metaOAuthScopesForFeature("instagram", true);
  assert.ok(base.includes("instagram_content_publish"));
  assert.equal(base.includes("instagram_manage_comments"), false);
  assert.equal(base.includes("instagram_manage_messages"), false);
  assert.ok(released.includes("instagram_manage_comments"));
  assert.ok(released.includes("instagram_manage_messages"));
  assert.deepEqual(requiredMetaInboundScopes("facebook_messenger"), [
    "pages_manage_metadata",
    "pages_read_engagement",
    "pages_messaging",
  ]);
});

test("schema, runtime parity, migration, routes, operator UI, and fail-closed service stay connected", async () => {
  const [schema, migration, ensure, service, policy, publicRoutes, routes, adminRoutes, mindbase, adminMediaUi] =
    await Promise.all([
      read("db/schema/territory-media-commerce.ts"),
      read("db/migrations/20270421_exportunity_meta_social_webhook_receipts.sql"),
      read("server/lib/territory-media/ensureTables.ts"),
      read("server/lib/territory-media/metaSocialWebhook.ts"),
      read("server/lib/territory-media/metaSocialWebhookPolicy.ts"),
      read("server/routes/meta-social-webhooks.ts"),
      read("server/routes.ts"),
      read("server/routes/admin-marketing.ts"),
      read("server/routes/mindbase.ts"),
      read("client/src/pages/AdminMarketingMediaPage.tsx"),
    ]);
  for (const source of [schema, migration, ensure]) {
    assert.match(source, /meta_social_webhook_receipts/);
    assert.match(source, /verification_evidence/);
  }
  for (const source of [migration, ensure]) {
    assert.match(source, /unsupported_payload/);
    assert.match(source, /dead_letter/);
  }
  assert.match(migration, /credentialsExcluded/);
  assert.match(migration, /receipt_key ~ '\^\[0-9a-f\]\{64\}\$'/);
  assert.match(service, /verifyMetaWebhookSignature/);
  assert.match(service, /external_account_matches_multiple_tenants/);
  assert.match(service, /automaticBackgroundRetry: false/);
  assert.match(policy, /FEATURE_META_SOCIAL_WEBHOOK_INGESTION/);
  assert.match(publicRoutes, /verifyMetaWebhookChallenge/);
  assert.match(publicRoutes, /durable_receipt_failed/);
  assert.match(routes, /api\/webhooks\/meta\/social/);
  assert.match(adminRoutes, /meta\/reconcile-target/);
  assert.match(mindbase, /metaOAuthScopesForFeature/);
  assert.match(adminMediaUi, /Signed Meta receipt ledger/);
  assert.match(adminMediaUi, /Reconcile retained receipts/);
  assert.match(adminMediaUi, /No automatic background retry/);
  assert.match(adminMediaUi, /sanitized source payloads/);
  assert.doesNotMatch(service, /send|replyTo|publish|createPost/i);
});
