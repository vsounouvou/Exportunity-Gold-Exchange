import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  EXPORTUNITY_GOOGLE_CALLBACK_PATH,
  EXPORTUNITY_GOOGLE_REQUIRED_APIS,
  EXPORTUNITY_GOOGLE_SCOPES,
  EXPORTUNITY_META_CALLBACK_PATH,
  EXPORTUNITY_META_SCOPES,
  EXPORTUNITY_YOUTUBE_REQUIRED_APIS,
  EXPORTUNITY_YOUTUBE_SCOPES,
} from "../server/lib/exportunity/integrations/providerContracts";
import { getExportunityTwilioReadiness } from "../server/lib/exportunity/integrations/twilioReadiness";

const root = process.cwd();

function source(relativePath: string) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

test("Exportunity Google contract uses the native callback and bounded scopes", () => {
  assert.equal(
    EXPORTUNITY_GOOGLE_CALLBACK_PATH,
    "/api/exportunity/integrations/google/callback",
  );
  assert.deepEqual(EXPORTUNITY_GOOGLE_REQUIRED_APIS, [
    "Gmail API",
    "Google Calendar API",
    "Google Drive API",
  ]);
  assert.deepEqual(EXPORTUNITY_GOOGLE_SCOPES, [
    "openid",
    "email",
    "profile",
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/calendar.readonly",
    "https://www.googleapis.com/auth/drive.readonly",
  ]);
  for (const forbidden of [
    "https://www.googleapis.com/auth/gmail.modify",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/drive.file",
    "https://www.googleapis.com/auth/drive",
  ]) {
    assert.equal(EXPORTUNITY_GOOGLE_SCOPES.includes(forbidden as never), false);
  }
});

test("Exportunity YouTube authorization is separate and read only", () => {
  assert.deepEqual(EXPORTUNITY_YOUTUBE_REQUIRED_APIS, ["YouTube Data API v3"]);
  assert.deepEqual(EXPORTUNITY_YOUTUBE_SCOPES, [
    "openid",
    "email",
    "profile",
    "https://www.googleapis.com/auth/youtube.readonly",
  ]);
  for (const forbidden of [
    "https://www.googleapis.com/auth/youtube.upload",
    "https://www.googleapis.com/auth/youtube.force-ssl",
    "https://www.googleapis.com/auth/youtube",
  ]) {
    assert.equal(EXPORTUNITY_YOUTUBE_SCOPES.includes(forbidden as never), false);
  }

  const route = source("server/routes/exportunity-integrations.ts");
  assert.match(route, /scopesForExportunityIntegration\(integrationId\)\.join\(" "\)/);
  assert.doesNotMatch(route, /include_granted_scopes",\s*"true"/);
  assert.match(
    source("server/lib/exportunity/integrations/providerAccess.ts"),
    /youtube\/v3\/channels\?part=id%2Csnippet%2Cstatus&mine=true/,
  );
});

test("Exportunity Meta contract uses only the approved discovery and comment permissions", () => {
  assert.equal(
    EXPORTUNITY_META_CALLBACK_PATH,
    "/api/exportunity/integrations/meta/callback",
  );
  assert.deepEqual(EXPORTUNITY_META_SCOPES, [
    "pages_show_list",
    "pages_read_engagement",
    "pages_manage_metadata",
    "instagram_basic",
    "instagram_manage_comments",
  ]);
  for (const forbidden of [
    "pages_manage_posts",
    "pages_manage_ads",
    "ads_management",
    "instagram_content_publish",
  ]) {
    assert.equal(EXPORTUNITY_META_SCOPES.includes(forbidden as never), false);
  }

  const route = source("server/routes/exportunity-integrations.ts");
  assert.match(
    route,
    /authorizeUrl\.searchParams\.set\("override_default_response_type",\s*"true"\)/,
  );
  assert.doesNotMatch(
    route,
    /authorizeUrl\.searchParams\.set\("scope",\s*EXPORTUNITY_META_SCOPES/,
  );
});

test("Exportunity provider control plane has no cross-product namespace dependency", () => {
  const nativeSurface = [
    "server/lib/exportunity/integrations/providerContracts.ts",
    "server/lib/exportunity/integrations/providerAccess.ts",
    "server/lib/exportunity/integrations/tokenVault.ts",
    "server/lib/exportunity/integrations/twilioReadiness.ts",
    "server/lib/exportunity/integrations/twilioVerification.ts",
    "server/lib/exportunity/integrations/ensureTables.ts",
    "server/routes/exportunity-integrations.ts",
    "db/schema/exportunity-integrations.ts",
    "db/migrations/20260820_exportunity_integrations.sql",
    "client/src/pages/AdminExportunityIntegrationsPage.tsx",
  ]
    .map(source)
    .join("\n");

  assert.doesNotMatch(nativeSurface, /\/api\/mindbase/i);
  assert.doesNotMatch(nativeSurface, /MINDBASE_/i);
  assert.doesNotMatch(nativeSurface, /mindbase_integration/i);
  assert.doesNotMatch(nativeSurface, /(?:lib|schema)\/mindbase/i);
  assert.doesNotMatch(nativeSurface, /100ia/i);
  assert.match(nativeSurface, /\/admin\/exportunity\/integrations/);
  assert.doesNotMatch(nativeSurface, /\/admin\/industrial\/integrations/);

  const routes = source("server/routes.ts");
  assert.match(
    routes,
    /app\.use\("\/api\/exportunity\/integrations",\s*exportunityIntegrationsRouter\)/,
  );
  assert.match(nativeSurface, /exportunity_integration_connections/);
  assert.match(nativeSurface, /EXPORTUNITY_INTEGRATION_SECRET/);
  assert.match(nativeSurface, /isolatedProductState:\s*true/);
  assert.match(nativeSurface, /router\.post\("\/:id\/verify"/);
  assert.match(nativeSurface, /providerMutationPerformed:\s*false/);
  assert.match(nativeSurface, /externalActionPerformed:\s*false/);
  assert.match(
    source("server/routes/exportunity-integrations.ts"),
    /parsed\.protocol !== "http:" && parsed\.protocol !== "https:"/,
  );
});

test("Exportunity environment block uses a dedicated credential namespace", () => {
  const env = source(".env.example");
  const start = env.indexOf("# Exportunity-owned company integrations.");
  const end = [
    env.indexOf("# 100IA connected-tool OAuth.", start),
    env.indexOf("# FX provider + policy", start),
  ]
    .filter((index) => index > start)
    .sort((a, b) => a - b)[0];
  assert.ok(start >= 0 && end > start);
  const block = env.slice(start, end);

  assert.match(block, /EXPORTUNITY_GOOGLE_CLIENT_ID=/);
  assert.match(block, /EXPORTUNITY_META_APP_ID=/);
  assert.match(block, /EXPORTUNITY_TWILIO_ACCOUNT_SID=/);
  assert.match(block, /EXPORTUNITY_INTEGRATION_SECRET=/);
  assert.match(env, /MAIL_DOMAIN_EXPORTUNITY=exportunity\.net/);
  assert.doesNotMatch(block, /\nGOOGLE_CLIENT_ID=/);
  assert.doesNotMatch(block, /\nMETA_APP_ID=/);
  assert.doesNotMatch(block, /\nTWILIO_ACCOUNT_SID=/);
});

test("Exportunity Twilio readiness never falls back to global credentials", () => {
  const keys = [
    "EXPORTUNITY_TWILIO_ACCOUNT_SID",
    "EXPORTUNITY_TWILIO_AUTH_TOKEN",
    "EXPORTUNITY_TWILIO_SMS_FROM",
    "EXPORTUNITY_TWILIO_WHATSAPP_FROM",
    "EXPORTUNITY_TWILIO_MESSAGING_SERVICE_SID",
    "EXPORTUNITY_TWILIO_TEST_SMS_TO",
    "EXPORTUNITY_TWILIO_TEST_WHATSAPP_TO",
    "EXPORTUNITY_TWILIO_SMS_VERIFIED_AT",
    "EXPORTUNITY_TWILIO_WHATSAPP_VERIFIED_AT",
    "TWILIO_ACCOUNT_SID",
    "TWILIO_AUTH_TOKEN",
  ] as const;
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));

  try {
    for (const key of keys) delete process.env[key];
    process.env.TWILIO_ACCOUNT_SID = `AC${"a".repeat(32)}`;
    process.env.TWILIO_AUTH_TOKEN = "b".repeat(32);

    const globalOnly = getExportunityTwilioReadiness();
    assert.equal(globalOnly.configured, false);
    assert.equal(globalOnly.ready, false);

    process.env.EXPORTUNITY_TWILIO_ACCOUNT_SID = `AC${"c".repeat(32)}`;
    process.env.EXPORTUNITY_TWILIO_AUTH_TOKEN = "d".repeat(32);
    process.env.EXPORTUNITY_TWILIO_SMS_FROM = "+15551234567";
    process.env.EXPORTUNITY_TWILIO_WHATSAPP_FROM =
      "whatsapp:+15557654321";
    process.env.EXPORTUNITY_TWILIO_TEST_SMS_TO = "+15555550101";
    process.env.EXPORTUNITY_TWILIO_TEST_WHATSAPP_TO = "+15555550102";

    const configured = getExportunityTwilioReadiness();
    assert.equal(configured.configured, true);
    assert.equal(configured.smsEnabled, true);
    assert.equal(configured.whatsappSenderPresent, true);
    assert.equal(configured.ready, false);
    assert.equal(configured.status, "configured_unverified");
    assert.deepEqual(configured.testRecipients, {
      sms: { configured: true, masked: "••••0101" },
      whatsapp: { configured: true, masked: "••••0102" },
    });
    assert.doesNotMatch(JSON.stringify(configured), /1555555010[12]/);

    process.env.EXPORTUNITY_TWILIO_SMS_VERIFIED_AT =
      "2026-08-20T12:00:00.000Z";
    process.env.EXPORTUNITY_TWILIO_WHATSAPP_VERIFIED_AT =
      "2026-08-20T12:00:00.000Z";
    const verified = getExportunityTwilioReadiness();
    assert.equal(verified.ready, true);
    assert.equal(verified.status, "verified");
  } finally {
    for (const key of keys) {
      const prior = previous[key];
      if (prior === undefined) delete process.env[key];
      else process.env[key] = prior;
    }
  }
});
