import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  evaluateMediaPublicationEligibility,
  hasMaterialRightsEvidence,
} from "../server/lib/territory-media/mediaRightsPolicy";
import {
  evaluateTerritoryActivationReadiness,
  TERRITORY_ACTIVATION_WORKSTREAMS,
} from "../server/lib/territory-media/territoryOperatingPolicy";

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const neighborhood = {
  territoryType: "neighborhood",
  centerLat: "5.3480000",
  centerLng: "-4.0250000",
  geometryGeojson: { type: "Polygon", coordinates: [] },
  radiusMeters: 1500,
  source: "OSM",
  sourceRef: "R12345",
};

const researchProfile = {
  operatingMode: "research_only",
  primaryLanguage: "fr",
  prioritySectors: ["agro-processing"],
  geographyEvidence: {},
};

const clearedGrant = {
  id: 18,
  status: "granted",
  rightsHolderName: "Example Creator",
  rightsBasis: "creator_grant",
  usageTypes: ["organic_publication"],
  channels: ["web"],
  territoryIds: [],
  allTerritories: true,
  producerConsentStatus: "granted",
  subjectReleaseStatus: "granted",
  musicLicenseStatus: "not_required",
  attributionText: "Source: Example Creator",
  attributionRules: { required: true },
  evidence: { reference: "release-2026-08-17" },
};

const sourceReference = {
  id: 4,
  sourceUrl: "https://example.test/original-video",
  reuseStatus: "rights_granted",
  takedownState: "clear",
};

test("research-only activation is approval-ready for sourced neighborhood geography and records coverage gaps", () => {
  const result = evaluateTerritoryActivationReadiness({
    territory: neighborhood,
    profile: researchProfile,
    coverage: {},
  });
  assert.equal(result.eligibleForApproval, true);
  assert.equal(result.readinessStatus, "approval_ready");
  assert.equal(result.dataGaps.length, 7);
  assert.ok(result.dataGaps.includes("carrier_coverage_gap"));
});

test("activation blocks non-neighborhood or unproven geography instead of fabricating coordinates", () => {
  const result = evaluateTerritoryActivationReadiness({
    territory: {
      ...neighborhood,
      territoryType: "city",
      source: null,
      sourceRef: null,
    },
    profile: researchProfile,
    coverage: {},
  });
  assert.equal(result.eligibleForApproval, false);
  assert.ok(result.blockers.includes("neighborhood_operating_unit_required"));
  assert.ok(result.blockers.includes("verified_geography_evidence_required"));
});

test("media and commerce modes require real coverage evidence", () => {
  const media = evaluateTerritoryActivationReadiness({
    territory: neighborhood,
    profile: { ...researchProfile, operatingMode: "media_pilot" },
    coverage: {
      creator: { status: "candidate" },
      content: { status: "gap" },
    },
  });
  assert.equal(media.eligibleForApproval, false);
  assert.ok(media.blockers.includes("verified_creator_coverage_required_for_media_pilot"));
  assert.ok(media.blockers.includes("rights_cleared_content_required_for_media_pilot"));

  const commerce = evaluateTerritoryActivationReadiness({
    territory: neighborhood,
    profile: { ...researchProfile, operatingMode: "commerce" },
    coverage: {
      producer: { status: "verified", evidenceRefs: ["producer:1"] },
      carrier: { status: "candidate" },
      payment: { status: "unknown" },
    },
  });
  assert.equal(commerce.eligibleForApproval, false);
  assert.ok(commerce.blockers.includes("verified_carrier_path_required_for_commerce"));
  assert.ok(commerce.blockers.includes("verified_payment_path_required_for_commerce"));
});

test("activation work package is bounded, evidence-oriented, and maps onto existing agent task keys", () => {
  assert.equal(TERRITORY_ACTIVATION_WORKSTREAMS.length, 11);
  assert.equal(new Set(TERRITORY_ACTIVATION_WORKSTREAMS.map((row) => row.key)).size, 11);
  assert.ok(TERRITORY_ACTIVATION_WORKSTREAMS.some((row) => row.key === "creator_discovery"));
  assert.ok(TERRITORY_ACTIVATION_WORKSTREAMS.some((row) => row.key === "carrier_coverage"));
  assert.ok(TERRITORY_ACTIVATION_WORKSTREAMS.some((row) => /never copy/i.test(row.responsibility)));
});

test("publication fails closed without a source reference", () => {
  const result = evaluateMediaPublicationEligibility({ grants: [clearedGrant] });
  assert.equal(result.eligible, false);
  assert.deepEqual(result.blockers, ["source_content_reference_required"]);
});

test("a current in-scope grant with evidence and cleared consents permits only its granted use", () => {
  const organic = evaluateMediaPublicationEligibility({
    sourceReference,
    grants: [clearedGrant],
    usageType: "organic_publication",
    channel: "web",
  });
  assert.equal(organic.eligible, true);
  assert.equal(organic.grantId, 18);

  const paid = evaluateMediaPublicationEligibility({
    sourceReference,
    grants: [clearedGrant],
    usageType: "paid_ad",
    channel: "web",
  });
  assert.equal(paid.eligible, false);
  assert.ok(paid.blockers.includes("usage_not_granted:paid_ad"));
});

test("expiry, revocation, takedown, missing releases, and evidence remain hard blockers", () => {
  const expired = evaluateMediaPublicationEligibility({
    sourceReference,
    grants: [{ ...clearedGrant, expiresAt: "2025-01-01T00:00:00.000Z" }],
    now: new Date("2026-08-17T00:00:00.000Z"),
  });
  assert.equal(expired.eligible, false);
  assert.ok(expired.blockers.includes("rights_grant_expired"));

  const missingRelease = evaluateMediaPublicationEligibility({
    sourceReference,
    grants: [{ ...clearedGrant, subjectReleaseStatus: "unknown", evidence: {} }],
  });
  assert.ok(missingRelease.blockers.includes("subject_release_not_cleared"));
  assert.ok(missingRelease.blockers.includes("rights_evidence_required"));
  assert.equal(hasMaterialRightsEvidence({ notes: "   " }), false);

  const takedown = evaluateMediaPublicationEligibility({
    sourceReference: { ...sourceReference, takedownState: "requested" },
    grants: [clearedGrant],
  });
  assert.equal(takedown.eligible, false);
  assert.ok(takedown.blockers.includes("source_is_under_takedown_or_dispute"));
});

test("schema, migration, runtime parity, governed routes, central Actions, and Operations Center surfaces stay connected", async () => {
  const [schema, migration, ensure, territoryService, rightsService, territoryRoutes, marketingRoutes, actions, territoryUi, rightsUi, report] =
    await Promise.all([
      read("db/schema/territory-media-commerce.ts"),
      read("db/migrations/20270413_exportunity_territory_media_commerce_foundation.sql"),
      read("server/lib/territory-media/ensureTables.ts"),
      read("server/lib/territory-media/territoryOperatingLayer.ts"),
      read("server/lib/territory-media/mediaRights.ts"),
      read("server/routes/territories.ts"),
      read("server/routes/admin-marketing.ts"),
      read("server/lib/actions/actionDefinitions.ts"),
      read("client/src/components/exportunity/TerritoryOperatingLayerPanel.tsx"),
      read("client/src/pages/AdminMarketingMediaPage.tsx"),
      read("docs/territory-media-commerce/01-truth-gap-matrix.md"),
    ]);

  for (const table of [
    "territory_operational_profiles",
    "territory_activations",
    "territory_agent_teams",
    "territory_coverage_snapshots",
    "source_content_references",
    "media_rights_grants",
    "media_rights_events",
  ]) {
    assert.match(schema, new RegExp(`"${table}"`));
    assert.match(migration, new RegExp(table));
    assert.match(ensure, new RegExp(table));
  }

  assert.match(territoryService, /pg_advisory_xact_lock/);
  assert.match(territoryService, /status: "paused"/);
  assert.match(territoryService, /budgetUsdCap: "0\.00"/);
  assert.match(territoryService, /externalActionsForbidden: true/);
  assert.match(territoryService, /territory\.activation\.prepared/);
  assert.match(territoryService, /territory\.activated/);
  assert.match(rightsService, /MediaPublicationBlockedError/);
  assert.match(rightsService, /content\.published/);
  assert.match(rightsService, /externalPlatformPublicationClaimed: false/);
  assert.match(territoryRoutes, /operating-layer\/prepare/);
  assert.match(territoryRoutes, /activations\/:activationId\/approve/);
  assert.match(marketingRoutes, /MEDIA_PUBLICATION_ACTION_REQUIRED/);
  assert.match(marketingRoutes, /publishMediaItemWithRights/);
  assert.match(actions, /TERRITORY_ACTIVATION_PREPARE/);
  assert.match(actions, /TERRITORY_ACTIVATE/);
  assert.match(actions, /RIGHTS_GRANT/);
  assert.match(actions, /RIGHTS_REVOKE/);
  assert.match(actions, /RIGHTS_TAKEDOWN/);
  assert.match(actions, /CONTENT_PUBLISH/);
  assert.match(territoryUi, /Prepare activation package/);
  assert.match(territoryUi, /All generated work items remain paused/i);
  assert.match(rightsUi, /Creator source, rights, and consent gate/);
  assert.match(rightsUi, /Record governed rights grant/);
  assert.match(report, /UNKNOWN_REQUIRES_PRODUCTION_ACCESS/);
  assert.match(report, /This package is a source implementation, not a production-completion claim/);
});
