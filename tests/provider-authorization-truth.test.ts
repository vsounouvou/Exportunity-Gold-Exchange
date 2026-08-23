import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildScopeEvidence,
  normalizeGrantedScopes,
  parseMetaPermissionEvidence,
  providerMatchesIntegration,
} from "../server/lib/integrations/providerAuthorizationTruth";
import {
  toSafeTwilioAccountVerification,
  TwilioAccountVerificationError,
} from "../server/lib/communications/twilioAccountVerification";

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("granted scopes are never inferred from requested scopes", () => {
  assert.deepEqual(normalizeGrantedScopes(undefined), []);
  const evidence = buildScopeEvidence({
    requestedScopes: ["openid", "email", "scope.write"],
    grantedScopes: "openid email",
    scopeEvidenceSource: "google_token_response",
    scopeEvidenceVerified: true,
  });
  assert.deepEqual(evidence.grantedScopes, ["openid", "email"]);
  assert.deepEqual(evidence.missingScopes, ["scope.write"]);
  assert.equal(evidence.authorizationReady, false);
});

test("missing provider evidence stays unverified even when permissions were requested", () => {
  const evidence = buildScopeEvidence({
    requestedScopes: ["pages_show_list", "pages_manage_posts"],
    grantedScopes: [],
    scopeEvidenceSource: "provider_scope_unavailable",
    scopeEvidenceVerified: false,
  });
  assert.deepEqual(evidence.grantedScopes, []);
  assert.deepEqual(evidence.missingScopes, ["pages_show_list", "pages_manage_posts"]);
  assert.equal(evidence.scopeEvidenceVerified, false);
  assert.equal(evidence.authorizationReady, false);
});

test("Meta permissions evidence distinguishes granted and declined permissions", () => {
  const evidence = parseMetaPermissionEvidence(
    {
      data: [
        { permission: "pages_show_list", status: "granted" },
        { permission: "pages_read_engagement", status: "granted" },
        { permission: "pages_manage_posts", status: "declined" },
      ],
    },
    ["pages_show_list", "pages_read_engagement", "pages_manage_posts"],
  );
  assert.equal(evidence.scopeEvidenceVerified, true);
  assert.equal(evidence.scopeEvidenceSource, "meta_permissions_edge");
  assert.deepEqual(evidence.grantedScopes, ["pages_show_list", "pages_read_engagement"]);
  assert.deepEqual(evidence.declinedScopes, ["pages_manage_posts"]);
  assert.deepEqual(evidence.missingScopes, ["pages_manage_posts"]);
  assert.equal(evidence.authorizationReady, false);
});

test("a signed integration cannot be completed through another provider callback", () => {
  assert.equal(providerMatchesIntegration({ provider: "google", integrationId: "youtube" }).matches, true);
  const mismatch = providerMatchesIntegration({ provider: "meta", integrationId: "youtube" });
  assert.equal(mismatch.matches, false);
  assert.equal(mismatch.expectedProvider, "google");
  assert.equal(providerMatchesIntegration({ provider: "google", integrationId: "unknown" }).matches, false);
});

test("Twilio account evidence is masked and excludes returned credentials", () => {
  const accountSid = "AC11111111111111111111111111111111";
  const verification = toSafeTwilioAccountVerification({
    expectedAccountSid: accountSid,
    verifiedAt: new Date("2026-08-17T12:00:00.000Z"),
    account: {
      sid: accountSid,
      ownerAccountSid: accountSid,
      friendlyName: "Exportunity Communications",
      status: "active",
      type: "Full",
      authToken: "must-never-leave-the-provider-result",
      dateCreated: new Date("2026-01-01T00:00:00.000Z"),
    },
  });
  const serialized = JSON.stringify(verification);
  assert.equal(verification.readyForApiAuthentication, true);
  assert.equal(verification.messageSent, false);
  assert.equal(verification.externalActionPerformed, false);
  assert.equal(verification.credentialsExposed, false);
  assert.doesNotMatch(serialized, /must-never-leave/);
  assert.doesNotMatch(serialized, new RegExp(accountSid));
  assert.match(verification.account.sidMasked || "", /^AC…/);
});

test("Twilio account evidence rejects an unexpected account identity", () => {
  assert.throws(
    () =>
      toSafeTwilioAccountVerification({
        expectedAccountSid: "AC11111111111111111111111111111111",
        account: { sid: "AC22222222222222222222222222222222", status: "active" },
      }),
    (error: unknown) =>
      error instanceof TwilioAccountVerificationError && error.code === "TWILIO_ACCOUNT_MISMATCH",
  );
});

test("OAuth and Twilio routes are wired to provider evidence without a send side effect", async () => {
  const [mindbase, twilio, route, policy] = await Promise.all([
    read("server/routes/mindbase.ts"),
    read("server/lib/communications/twilio.ts"),
    read("server/routes/admin-twilio.ts"),
    read("server/lib/territory-media/socialPublicationPolicy.ts"),
  ]);
  assert.match(mindbase, /providerMatchesIntegration/);
  assert.match(mindbase, /\/me\/permissions/);
  assert.doesNotMatch(mindbase, /normalizeScopeList\(tokenPayload\.scope,\s*MINDBASE_/);
  assert.match(policy, /provider_permission_evidence_required/);
  assert.match(route, /\/twilio\/verify-account/);
  assert.match(route, /verifyTwilioAccountReadOnly/);
  const verifier = twilio.slice(
    twilio.indexOf("export async function verifyTwilioAccountReadOnly"),
    twilio.indexOf("function normalizeMediaUrls"),
  );
  assert.match(verifier, /accounts\(cfg\.accountSid\)\.fetch\(\)/);
  assert.doesNotMatch(verifier, /messages\.create|calls\.create|verifications\.create/);
});
