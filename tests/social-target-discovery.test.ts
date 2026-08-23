import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  candidateContainsCredentialMaterial,
  parseMetaTargetCandidates,
  parseYouTubeTargetCandidates,
} from "../server/lib/territory-media/socialTargetDiscoveryPolicy";

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Meta Page discovery emits only non-secret target evidence", () => {
  const candidates = parseMetaTargetCandidates({
    connectionId: "11111111-1111-4111-8111-111111111111",
    platform: "facebook",
    grantedScopes: ["pages_show_list", "pages_read_engagement", "pages_manage_posts"],
    payload: {
      data: [{
        id: "page-123",
        name: "Exportunity Benin",
        category: "Business service",
        tasks: ["CREATE_CONTENT", "MODERATE"],
        access_token: "must-never-enter-the-receipt",
      }],
    },
  });

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].platform, "facebook");
  assert.equal(candidates[0].externalAccountId, "page-123");
  assert.deepEqual(candidates[0].capabilities, ["create_content", "moderate"]);
  assert.equal(candidates[0].credentialsExcluded, true);
  assert.equal(candidateContainsCredentialMaterial(candidates), false);
  assert.doesNotMatch(JSON.stringify(candidates), /must-never-enter/);
});

test("Instagram discovery binds the professional account to its parent Page without page tokens", () => {
  const candidates = parseMetaTargetCandidates({
    connectionId: "22222222-2222-4222-8222-222222222222",
    platform: "instagram",
    grantedScopes: [
      "pages_show_list",
      "pages_read_engagement",
      "instagram_basic",
      "instagram_content_publish",
    ],
    payload: {
      data: [{
        id: "page-456",
        name: "Exportunity Côte d'Ivoire",
        access_token: "page-token-must-not-leak",
        tasks: ["CREATE_CONTENT"],
        instagram_business_account: {
          id: "ig-789",
          username: "exportunity_ci",
          access_token: "nested-token-must-not-leak",
        },
      }],
    },
  });

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].platform, "instagram");
  assert.equal(candidates[0].externalAccountId, "ig-789");
  assert.equal(candidates[0].parentAccountId, "page-456");
  assert.equal(candidates[0].parentAccountLabel, "Exportunity Côte d'Ivoire");
  assert.ok(candidates[0].capabilities.includes("instagram_content_publish"));
  assert.equal(candidateContainsCredentialMaterial(candidates), false);
  assert.doesNotMatch(JSON.stringify(candidates), /token-must-not-leak/);
});

test("YouTube mine discovery emits the authorized channel and omits provider payload credentials", () => {
  const candidates = parseYouTubeTargetCandidates({
    connectionId: "33333333-3333-4333-8333-333333333333",
    grantedScopes: [
      "https://www.googleapis.com/auth/youtube.readonly",
      "https://www.googleapis.com/auth/youtube.upload",
    ],
    payload: {
      access_token: "youtube-token-must-not-leak",
      items: [{
        id: "UC123456",
        snippet: { title: "Exportunity Trade Network" },
        status: { privacyStatus: "public" },
      }],
    },
  });

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].platform, "youtube");
  assert.equal(candidates[0].externalAccountId, "UC123456");
  assert.deepEqual(candidates[0].capabilities, ["channel_read", "video_upload"]);
  assert.equal(candidateContainsCredentialMaterial(candidates), false);
  assert.doesNotMatch(JSON.stringify(candidates), /youtube-token-must-not-leak/);
});

test("credential material detection rejects unsafe evidence shapes", () => {
  assert.equal(candidateContainsCredentialMaterial({ access_token: "secret" }), true);
  assert.equal(candidateContainsCredentialMaterial({ refresh_token: "secret" }), true);
  assert.equal(candidateContainsCredentialMaterial({ header: "Bearer secret" }), true);
  assert.equal(candidateContainsCredentialMaterial({ externalAccountLabel: "Exportunity" }), false);
});

test("schema, service, Actions, routes, tenant scope, and UI preserve the read-only boundary", async () => {
  const [schema, migration, ensure, service, publication, scopePolicy, actions, routes, ui] = await Promise.all([
    read("db/schema/territory-media-commerce.ts"),
    read("db/migrations/20270420_exportunity_social_target_selection.sql"),
    read("server/lib/territory-media/ensureTables.ts"),
    read("server/lib/territory-media/socialTargetDiscovery.ts"),
    read("server/lib/territory-media/socialPublication.ts"),
    read("server/lib/territory-media/socialPublicationPolicy.ts"),
    read("server/lib/actions/actionDefinitions.ts"),
    read("server/routes/admin-marketing.ts"),
    read("client/src/pages/AdminMarketingMediaPage.tsx"),
  ]);

  assert.match(schema, /social_publication_targets_tenant_platform_account_unique/);
  assert.match(migration, /social_publication_targets_tenant_platform_account_unique/);
  assert.match(ensure, /social_publication_targets_tenant_platform_account_unique/);
  assert.match(service, /youtube\/v3\/channels/);
  assert.match(service, /EXPORTUNITY_YOUTUBE_INTEGRATION_ID/);
  assert.doesNotMatch(service, /YouTube authorization is not configured/);
  assert.match(service, /\/me\/accounts/);
  assert.match(service, /credentialsExcluded: true/);
  assert.match(service, /providerMutationPerformed: false/);
  assert.match(service, /externalPublicationPerformed: false/);
  assert.match(service, /onConflictDoUpdate/);
  assert.doesNotMatch(service, /pages_manage_posts\)|videos\.insert|activities\.insert/);
  assert.match(publication, /loadSafeTenantConnections/);
  assert.match(publication, /youtube: "\/admin\/exportunity\/integrations"/);
  assert.match(scopePolicy, /if \(platform === "youtube"\) return "youtube"/);
  assert.doesNotMatch(scopePolicy, /google_youtube/);
  assert.doesNotMatch(publication, /loadSafeConnections\(tenantId, actorUserId/);
  assert.match(actions, /actionKey: "SOCIAL_TARGET_DISCOVER"/);
  assert.match(actions, /actionKey: "SOCIAL_TARGET_SELECT"/);
  assert.match(routes, /marketing\/social\/targets\/discover/);
  assert.match(routes, /marketing\/social\/targets\/select/);
  assert.match(routes, /credentialsExposed: false/);
  assert.match(ui, /Discover authorized targets/);
  assert.match(ui, /Select official target/);
  assert.match(ui, /Open Twilio control center/);
  assert.match(ui, /No publish · no provider mutation/);
});
