import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  decryptExportunityIntegrationTokenPayload,
  encryptExportunityIntegrationTokenPayload,
} from "../server/lib/exportunity/integrations/tokenVault";

const root = process.cwd();
process.env.DATABASE_URL ||= "postgresql://unused:unused@127.0.0.1:1/unused";
const providerAccess = import(
  "../server/lib/exportunity/integrations/providerAccess"
);

function source(relativePath: string) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

test("Exportunity token vault round-trips only with the dedicated native secret", () => {
  const previousNative = process.env.EXPORTUNITY_INTEGRATION_SECRET;
  const previousMindbase = process.env.MINDBASE_INTEGRATION_SECRET;
  try {
    process.env.EXPORTUNITY_INTEGRATION_SECRET = "native-secret-".repeat(4);
    process.env.MINDBASE_INTEGRATION_SECRET = "different-product-secret-".repeat(3);
    const encrypted = encryptExportunityIntegrationTokenPayload({
      access_token: "provider-access-token",
      refresh_token: "provider-refresh-token",
    });
    assert.deepEqual(decryptExportunityIntegrationTokenPayload(encrypted), {
      access_token: "provider-access-token",
      refresh_token: "provider-refresh-token",
    });

    delete process.env.EXPORTUNITY_INTEGRATION_SECRET;
    assert.throws(
      () => decryptExportunityIntegrationTokenPayload(encrypted),
      /EXPORTUNITY_INTEGRATION_SECRET/,
    );
  } finally {
    if (previousNative === undefined) {
      delete process.env.EXPORTUNITY_INTEGRATION_SECRET;
    } else {
      process.env.EXPORTUNITY_INTEGRATION_SECRET = previousNative;
    }
    if (previousMindbase === undefined) {
      delete process.env.MINDBASE_INTEGRATION_SECRET;
    } else {
      process.env.MINDBASE_INTEGRATION_SECRET = previousMindbase;
    }
  }
});

test("Google refresh preserves the native refresh token and uses the Exportunity client", async () => {
  const { refreshExportunityGoogleTokenPayload } = await providerAccess;
  let capturedUrl = "";
  let capturedBody = "";
  const result = await refreshExportunityGoogleTokenPayload({
    payload: {
      access_token: "expired-access",
      refresh_token: "stable-refresh",
      token_type: "Bearer",
    },
    clientId: "exportunity-google-client",
    clientSecret: "exportunity-google-secret",
    now: new Date("2026-08-21T15:00:00.000Z"),
    fetchImpl: (async (url, init) => {
      capturedUrl = String(url);
      capturedBody = String(init?.body || "");
      return new Response(
        JSON.stringify({
          access_token: "refreshed-access",
          expires_in: 3600,
          token_type: "Bearer",
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    }) as typeof fetch,
  });

  assert.equal(capturedUrl, "https://oauth2.googleapis.com/token");
  const body = new URLSearchParams(capturedBody);
  assert.equal(body.get("client_id"), "exportunity-google-client");
  assert.equal(body.get("client_secret"), "exportunity-google-secret");
  assert.equal(body.get("refresh_token"), "stable-refresh");
  assert.equal(body.get("grant_type"), "refresh_token");
  assert.equal(result.accessToken, "refreshed-access");
  assert.equal(result.payload.refresh_token, "stable-refresh");
  assert.equal(result.expiresAt?.toISOString(), "2026-08-21T16:00:00.000Z");
});

test("provider scope comparison never promotes requested scopes into granted evidence", async () => {
  const {
    exportunityProviderScopeContract,
    missingExportunityProviderScopes,
    unexpectedExportunityProviderScopes,
  } = await providerAccess;
  assert.deepEqual(
    missingExportunityProviderScopes({
      integrationId: "google_workspace",
      grantedScopes: ["openid", "email", "profile"],
    }),
    [
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/calendar.readonly",
      "https://www.googleapis.com/auth/drive.readonly",
    ],
  );

  assert.deepEqual(
    missingExportunityProviderScopes({
      integrationId: "google_workspace",
      grantedScopes: [
        "openid",
        "https://www.googleapis.com/auth/userinfo.email",
        "https://www.googleapis.com/auth/userinfo.profile",
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/calendar.readonly",
        "https://www.googleapis.com/auth/drive.readonly",
      ],
    }),
    [],
  );
  assert.deepEqual(
    unexpectedExportunityProviderScopes({
      integrationId: "google_workspace",
      grantedScopes: [
        "openid",
        "https://www.googleapis.com/auth/userinfo.email",
        "https://www.googleapis.com/auth/userinfo.profile",
        "https://www.googleapis.com/auth/gmail.modify",
        "https://www.googleapis.com/auth/calendar.events",
        "https://www.googleapis.com/auth/drive.file",
      ],
    }),
    [
      "https://www.googleapis.com/auth/gmail.modify",
      "https://www.googleapis.com/auth/calendar.events",
      "https://www.googleapis.com/auth/drive.file",
    ],
  );
  assert.deepEqual(
    missingExportunityProviderScopes({
      integrationId: "meta_business",
      grantedScopes: [],
    }),
    [
      "pages_show_list",
      "pages_read_engagement",
      "pages_manage_metadata",
      "instagram_basic",
      "instagram_manage_comments",
    ],
  );

  assert.deepEqual(
    exportunityProviderScopeContract({
      integrationId: "google_workspace",
      grantedScopes: [
        "openid",
        "email",
        "profile",
        "https://www.googleapis.com/auth/gmail.modify",
        "https://www.googleapis.com/auth/calendar.events",
        "https://www.googleapis.com/auth/drive.file",
      ],
    }),
    {
      ready: false,
      missingScopes: [
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/calendar.readonly",
        "https://www.googleapis.com/auth/drive.readonly",
      ],
      unexpectedScopes: [
        "https://www.googleapis.com/auth/gmail.modify",
        "https://www.googleapis.com/auth/calendar.events",
        "https://www.googleapis.com/auth/drive.file",
      ],
    },
  );
});

test("stored provider evidence must be read-only, safe, and fresh", async () => {
  const { storedExportunityProviderVerification } = await providerAccess;
  const verification = {
    integrationId: "google_workspace",
    provider: "google",
    ready: true,
    authorizationReady: true,
    resourceReady: true,
    checkedAt: "2026-08-21T15:00:00.000Z",
    mode: "read_only",
    credentialsNamespace: "EXPORTUNITY_",
    providerMutationPerformed: false,
    externalActionPerformed: false,
    tokenRefreshed: true,
    requestedScopes: ["openid"],
    grantedScopes: ["openid"],
    missingScopes: [],
    unexpectedScopes: [],
    checks: [
      {
        key: "identity",
        label: "Google identity",
        verified: true,
        state: "verified",
        providerStatus: "HTTP_200",
        detail: "Provider accepted the native company authorization.",
      },
    ],
    capabilities: { identity: true },
    warnings: [],
  } as const;

  const fresh = storedExportunityProviderVerification(
    verification,
    new Date("2026-08-22T15:00:00.000Z"),
  );
  assert.equal(fresh?.fresh, true);
  assert.equal(fresh?.ready, true);

  const stale = storedExportunityProviderVerification(
    verification,
    new Date("2026-08-29T15:00:00.001Z"),
  );
  assert.equal(stale?.fresh, false);

  assert.equal(
    storedExportunityProviderVerification({
      ...verification,
      externalActionPerformed: true,
    }),
    null,
  );
});

test("native provider access and UI contain no Mindbase bridge", () => {
  const nativeSurface = [
    "server/lib/exportunity/integrations/providerAccess.ts",
    "server/lib/exportunity/integrations/tokenVault.ts",
    "server/routes/exportunity-integrations.ts",
    "client/src/pages/AdminExportunityIntegrationsPage.tsx",
  ]
    .map(source)
    .join("\n");

  assert.doesNotMatch(nativeSurface, /\/api\/mindbase/i);
  assert.doesNotMatch(nativeSurface, /MINDBASE_/i);
  assert.doesNotMatch(nativeSurface, /mindbase_integration/i);
  assert.match(nativeSurface, /router\.post\("\/:id\/verify"/);
  assert.match(nativeSurface, /providerMutationPerformed:\s*false/);
  assert.match(nativeSurface, /externalActionPerformed:\s*false/);
  assert.match(nativeSurface, /Verify provider access — read only/);
});
