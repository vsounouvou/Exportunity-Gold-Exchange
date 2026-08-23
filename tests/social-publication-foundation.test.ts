import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildOfficialPublicationPackage,
  buildManualPublicationPackage,
  deriveConnectionReadiness,
  publicationStatusForRightsBlockers,
  REQUIRED_SOCIAL_SCOPES,
} from "../server/lib/territory-media/socialPublicationPolicy";
import { SOCIAL_PUBLICATION_STATUSES } from "../server/lib/territory-media/socialPlatformAdapter";

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("publication vocabulary exactly includes the mandate states", () => {
  assert.deepEqual(SOCIAL_PUBLICATION_STATUSES, [
    "DRAFT",
    "AWAITING_RIGHTS",
    "AWAITING_CONSENT",
    "AWAITING_FACTS",
    "NEEDS_REVIEW",
    "APPROVED",
    "SCHEDULED",
    "UPLOADING",
    "PROCESSING",
    "PUBLISHED",
    "FAILED",
    "RESTRICTED",
    "MANUAL_REQUIRED",
    "TAKEDOWN_REQUESTED",
    "REMOVED",
  ]);
});

test("manual package contains every required handoff field and never claims publication", () => {
  const manual = buildManualPublicationPackage({
    platform: "instagram",
    title: "Verified producer profile",
    caption: "Meet a verified producer in Cotonou.",
    hashtags: ["Made in Benin", "#Exportunity"],
    altText: "Producer presenting a packaged product.",
    assetUrl: "/managed/media/producer-profile.mp4",
    assetType: "video",
    thumbnailUrl: "/managed/media/producer-profile.png",
    destinationLink: "https://exportunity.net/products/example",
    trackingCode: "exp_1234567890abcdef",
    attributionText: "Source: Example Creator",
    generatedAt: new Date("2026-08-17T00:00:00.000Z"),
  });

  assert.equal(manual.status, "MANUAL_REQUIRED");
  assert.equal(manual.externalPublicationClaimed, false);
  assert.deepEqual(manual.finalAsset, {
    url: "/managed/media/producer-profile.mp4",
    type: "video",
  });
  assert.match(manual.caption, /Source: Example Creator/);
  assert.deepEqual(manual.hashtags, ["#MadeinBenin", "#Exportunity"]);
  assert.equal(manual.altText, "Producer presenting a packaged product.");
  assert.equal(manual.thumbnail, "/managed/media/producer-profile.png");
  assert.ok(manual.publishingInstructions.length >= 4);
  assert.equal(manual.destinationLink, "https://exportunity.net/products/example");
  assert.equal(manual.trackingCode, "exp_1234567890abcdef");
});

test("connection readiness remains manual when the business target or official adapter is unverified", () => {
  const result = deriveConnectionReadiness({
    configured: true,
    connection: {
      status: "connected",
      scopes: REQUIRED_SOCIAL_SCOPES.facebook,
      tokenMeta: { hasRefreshToken: true, scopeEvidenceVerified: true, authorizationReady: true },
    },
    requiredScopes: REQUIRED_SOCIAL_SCOPES.facebook,
    target: null,
    adapterAvailable: false,
  });
  assert.equal(result.officialPublicationReady, false);
  assert.equal(result.status, "MANUAL_REQUIRED");
  assert.ok(result.blockers.includes("business_publication_target_verification_required"));
  assert.ok(result.blockers.includes("official_platform_adapter_unavailable"));
});

test("official package reuses the governed content fields without manual-handoff claims", () => {
  const official = buildOfficialPublicationPackage({
    platform: "facebook",
    title: "Verified producer profile",
    caption: "Meet a verified producer.",
    hashtags: ["Exportunity"],
    altText: "Verified producer presenting a product.",
    assetUrl: "https://cdn.exportunity.net/producer.jpg",
    assetType: "image/jpeg",
    destinationLink: "https://exportunity.net/products/producer",
    trackingCode: "exp_1234567890abcdef",
    approvedAt: new Date("2026-08-17T00:00:00.000Z"),
  });
  assert.equal(official.status, "APPROVED");
  assert.equal(official.mode, "official_api");
  assert.equal(official.externalPublicationClaimed, false);
  assert.equal("publishingInstructions" in official, false);
});

test("fully evidenced connection and target become ready only when the adapter is available", () => {
  const result = deriveConnectionReadiness({
    configured: true,
    connection: {
      status: "connected",
      scopes: REQUIRED_SOCIAL_SCOPES.facebook,
      tokenMeta: {
        hasRefreshToken: false,
        scopeEvidenceVerified: true,
        authorizationReady: true,
      },
    },
    requiredScopes: REQUIRED_SOCIAL_SCOPES.facebook,
    target: {
      authorizationStatus: "authorized",
      healthStatus: "healthy",
      permissions: REQUIRED_SOCIAL_SCOPES.facebook,
      lastVerifiedAt: "2026-08-17T00:00:00.000Z",
    },
    adapterAvailable: true,
    now: new Date("2026-08-17T00:00:00.000Z"),
  });
  assert.equal(result.officialPublicationReady, true);
  assert.deepEqual(result.blockers, []);
});

test("connection readiness detects scope gaps, expiry, and restricted targets", () => {
  const result = deriveConnectionReadiness({
    configured: true,
    connection: {
      status: "connected",
      scopes: ["pages_show_list"],
      expiresAt: "2026-01-01T00:00:00.000Z",
      tokenMeta: { hasRefreshToken: false, scopeEvidenceVerified: true },
    },
    requiredScopes: REQUIRED_SOCIAL_SCOPES.facebook,
    target: {
      authorizationStatus: "permission_gap",
      healthStatus: "restricted",
      lastVerifiedAt: "2026-08-17T00:00:00.000Z",
    },
    adapterAvailable: false,
    now: new Date("2026-08-17T00:00:00.000Z"),
  });
  assert.ok(result.blockers.includes("authorization_expired_without_refresh_token"));
  assert.ok(result.blockers.includes("permission_required:pages_read_engagement"));
  assert.ok(result.blockers.includes("permission_required:pages_manage_posts"));
  assert.ok(result.blockers.includes("target_authorization_permission_gap"));
  assert.ok(result.blockers.includes("target_health_restricted"));
});

test("rights blockers map to accurate pre-publication states", () => {
  assert.equal(publicationStatusForRightsBlockers(["active_rights_grant_required"]), "AWAITING_RIGHTS");
  assert.equal(publicationStatusForRightsBlockers(["subject_release_not_cleared"]), "AWAITING_CONSENT");
  assert.equal(publicationStatusForRightsBlockers(["source_url_required"]), "AWAITING_FACTS");
  assert.equal(publicationStatusForRightsBlockers(["source_is_under_takedown_or_dispute"]), "RESTRICTED");
});

test("schema, migration, runtime parity, routes, OAuth scopes, Actions, and UI stay connected", async () => {
  const [schema, migration, ensure, service, adapter, routes, mindbase, metaPolicy, scopePolicy, actions, ui] = await Promise.all([
    read("db/schema/territory-media-commerce.ts"),
    read("db/migrations/20270414_exportunity_social_publication_foundation.sql"),
    read("server/lib/territory-media/ensureTables.ts"),
    read("server/lib/territory-media/socialPublication.ts"),
    read("server/lib/territory-media/socialPlatformAdapter.ts"),
    read("server/routes/admin-marketing.ts"),
    read("server/routes/mindbase.ts"),
    read("server/lib/territory-media/metaSocialWebhookPolicy.ts"),
    read("server/lib/territory-media/socialPublicationPolicy.ts"),
    read("server/lib/actions/actionDefinitions.ts"),
    read("client/src/pages/AdminMarketingMediaPage.tsx"),
  ]);

  for (const table of [
    "social_publication_targets",
    "social_publication_attempts",
    "social_publication_events",
  ]) {
    assert.match(schema, new RegExp(`"${table}"`));
    assert.match(migration, new RegExp(table));
    assert.match(ensure, new RegExp(table));
  }

  assert.match(migration, /manual_not_published_check/);
  assert.match(migration, /provider_confirmation_check/);
  assert.match(service, /status: "MANUAL_REQUIRED"/);
  assert.match(service, /externalPublicationClaimed: false/);
  assert.doesNotMatch(service, /status: "PUBLISHED"/);
  assert.match(adapter, /interface SocialPlatformAdapter/);
  for (const method of [
    "authorizeAccount",
    "refreshAuthorization",
    "discoverCapabilities",
    "validatePermissions",
    "getAccountHealth",
    "uploadMedia",
    "createPost",
    "schedulePost",
    "publishPost",
    "getPublicationStatus",
    "getComments",
    "getMessages",
    "replyToComment",
    "replyToMessage",
    "getPostMetrics",
    "createAdvertisement",
    "pauseAdvertisement",
  ]) {
    assert.match(adapter, new RegExp(`${method}\\(`));
  }
  assert.match(routes, /publications\/prepare/);
  assert.match(routes, /marketing\/social\/readiness/);
  assert.match(`${mindbase}\n${metaPolicy}\n${scopePolicy}`, /pages_manage_posts/);
  assert.match(`${mindbase}\n${metaPolicy}\n${scopePolicy}`, /instagram_content_publish/);
  assert.match(mindbase, /youtube\.upload/);
  assert.match(actions, /SOCIAL_PUBLICATION_PREPARE/);
  assert.match(ui, /Prepare governed manual package/);
  assert.match(ui, /MANUAL_REQUIRED—not PUBLISHED/);
});
