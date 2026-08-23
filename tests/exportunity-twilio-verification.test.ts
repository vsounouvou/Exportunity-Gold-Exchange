import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { verifyExportunityTwilioReadOnly } from "../server/lib/exportunity/integrations/twilioVerification";

const envKeys = [
  "EXPORTUNITY_TWILIO_ACCOUNT_SID",
  "EXPORTUNITY_TWILIO_AUTH_TOKEN",
  "EXPORTUNITY_TWILIO_SMS_FROM",
  "EXPORTUNITY_TWILIO_MESSAGING_SERVICE_SID",
  "EXPORTUNITY_TWILIO_WHATSAPP_FROM",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
] as const;

function withEnvironment(
  values: Partial<Record<(typeof envKeys)[number], string>>,
  run: () => Promise<void>,
) {
  const previous = Object.fromEntries(
    envKeys.map((key) => [key, process.env[key]]),
  );
  for (const key of envKeys) delete process.env[key];
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) process.env[key] = value;
  }
  return run().finally(() => {
    for (const key of envKeys) {
      const prior = previous[key];
      if (prior === undefined) delete process.env[key];
      else process.env[key] = prior;
    }
  });
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function requestUrl(input: Parameters<typeof fetch>[0]) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

test("read-only verification never falls back to global Twilio credentials", async () => {
  await withEnvironment(
    {
      TWILIO_ACCOUNT_SID: `AC${"a".repeat(32)}`,
      TWILIO_AUTH_TOKEN: "b".repeat(32),
    },
    async () => {
      let calls = 0;
      const fetchImpl = (async () => {
        calls += 1;
        throw new Error("fetch must not be called");
      }) as typeof fetch;

      const result = await verifyExportunityTwilioReadOnly({ fetchImpl });

      assert.equal(calls, 0);
      assert.equal(result.ready, false);
      assert.equal(result.credentialsNamespace, "EXPORTUNITY_");
      assert.equal(result.externalActionPerformed, false);
      assert.equal(result.messageSent, false);
      assert.equal(result.checks.account.state, "not_configured");
    },
  );
});

test("read-only verification proves the account and configured senders with GET requests only", async () => {
  const accountSid = `AC${"a".repeat(32)}`;
  const authToken = "b".repeat(32);
  const messagingServiceSid = `MG${"c".repeat(32)}`;
  const smsFrom = "+15551234567";
  const whatsappFrom = "whatsapp:+15557654321";

  await withEnvironment(
    {
      EXPORTUNITY_TWILIO_ACCOUNT_SID: accountSid,
      EXPORTUNITY_TWILIO_AUTH_TOKEN: authToken,
      EXPORTUNITY_TWILIO_SMS_FROM: smsFrom,
      EXPORTUNITY_TWILIO_MESSAGING_SERVICE_SID: messagingServiceSid,
      EXPORTUNITY_TWILIO_WHATSAPP_FROM: whatsappFrom,
    },
    async () => {
      const requests: Array<{ url: string; init?: RequestInit }> = [];
      const fetchImpl = (async (input: any, init?: RequestInit) => {
        const url = requestUrl(input);
        requests.push({ url, init });
        assert.equal(init?.method, "GET");
        assert.equal(init?.body, undefined);
        assert.match(
          new Headers(init?.headers).get("authorization") || "",
          /^Basic [A-Za-z0-9+/=]+$/,
        );

        if (url.includes(`/Accounts/${accountSid}.json`)) {
          return jsonResponse({ sid: accountSid, status: "active" });
        }
        if (url.includes("IncomingPhoneNumbers.json")) {
          return jsonResponse({
            incoming_phone_numbers: [
              {
                sid: `PN${"d".repeat(32)}`,
                account_sid: accountSid,
                phone_number: smsFrom,
                capabilities: { sms: true, mms: true, voice: true },
              },
            ],
          });
        }
        if (url.endsWith(`/Services/${messagingServiceSid}`)) {
          return jsonResponse({
            sid: messagingServiceSid,
            account_sid: accountSid,
          });
        }
        if (url.includes(`/Services/${messagingServiceSid}/PhoneNumbers`)) {
          return jsonResponse({
            phone_numbers: [
              {
                sid: `PN${"d".repeat(32)}`,
                account_sid: accountSid,
                service_sid: messagingServiceSid,
                capabilities: ["SMS", "MMS", "Voice"],
              },
            ],
          });
        }
        if (url.includes("/v2/Channels/Senders")) {
          return jsonResponse({
            senders: [
              {
                sid: `XE${"e".repeat(32)}`,
                sender_id: whatsappFrom,
                status: "ONLINE",
              },
            ],
          });
        }
        return jsonResponse({ code: 20404 }, 404);
      }) as typeof fetch;

      const result = await verifyExportunityTwilioReadOnly({
        fetchImpl,
        now: new Date("2026-08-21T07:30:00.000Z"),
      });

      assert.equal(result.ready, true);
      assert.equal(result.checkedAt, "2026-08-21T07:30:00.000Z");
      assert.equal(result.mode, "read_only");
      assert.equal(result.checks.account.verified, true);
      assert.equal(result.checks.sms.verified, true);
      assert.equal(result.checks.messagingService.verified, true);
      assert.equal(result.checks.whatsapp.verified, true);
      assert.equal(requests.length, 5);
      assert.ok(
        requests.every(
          ({ url }) =>
            url.startsWith("https://api.twilio.com/") ||
            url.startsWith("https://messaging.twilio.com/"),
        ),
      );
      assert.ok(requests.every(({ url }) => !url.includes("/Messages")));

      const serialized = JSON.stringify(result);
      assert.doesNotMatch(serialized, new RegExp(accountSid));
      assert.doesNotMatch(serialized, new RegExp(authToken));
      assert.doesNotMatch(serialized, new RegExp(messagingServiceSid));
      assert.doesNotMatch(serialized, /\+15551234567/);
      assert.doesNotMatch(serialized, /whatsapp:\+15557654321/);
      assert.match(result.checks.sms.identifier || "", /4567$/);
      assert.match(result.checks.whatsapp.identifier || "", /4321$/);
    },
  );
});

test("WhatsApp readiness requires a registered online sender", async () => {
  const accountSid = `AC${"1".repeat(32)}`;
  const smsFrom = "+15551234567";
  const whatsappFrom = "whatsapp:+15557654321";
  await withEnvironment(
    {
      EXPORTUNITY_TWILIO_ACCOUNT_SID: accountSid,
      EXPORTUNITY_TWILIO_AUTH_TOKEN: "2".repeat(32),
      EXPORTUNITY_TWILIO_SMS_FROM: smsFrom,
      EXPORTUNITY_TWILIO_WHATSAPP_FROM: whatsappFrom,
    },
    async () => {
      const fetchImpl = (async (input: any) => {
        const url = requestUrl(input);
        if (url.includes(`/Accounts/${accountSid}.json`)) {
          return jsonResponse({ sid: accountSid, status: "active" });
        }
        if (url.includes("IncomingPhoneNumbers.json")) {
          return jsonResponse({
            incoming_phone_numbers: [
              {
                account_sid: accountSid,
                phone_number: smsFrom,
                capabilities: { sms: true },
              },
            ],
          });
        }
        if (url.includes("/v2/Channels/Senders")) {
          return jsonResponse({
            senders: [{ sender_id: whatsappFrom, status: "PENDING_VERIFICATION" }],
          });
        }
        return jsonResponse({}, 404);
      }) as typeof fetch;

      const result = await verifyExportunityTwilioReadOnly({ fetchImpl });

      assert.equal(result.ready, false);
      assert.equal(result.checks.account.verified, true);
      assert.equal(result.checks.sms.verified, true);
      assert.equal(result.checks.whatsapp.verified, false);
      assert.equal(
        result.checks.whatsapp.providerStatus,
        "PENDING_VERIFICATION",
      );
    },
  );
});

test("the native route and UI expose verification without a shared-product control surface", () => {
  const root = process.cwd();
  const source = (relativePath: string) =>
    readFileSync(path.join(root, relativePath), "utf8");
  const verifier = source(
    "server/lib/exportunity/integrations/twilioVerification.ts",
  );
  const route = source("server/routes/exportunity-integrations.ts");
  const ui = source("client/src/pages/AdminExportunityIntegrationsPage.tsx");

  assert.match(
    route,
    /router\.post\("\/twilio\/verify",\s*ensureTenantAdmin/,
  );
  assert.match(route, /read_only_verification_completed/);
  assert.match(route, /toExportunityTwilioPublicVerification\(verification\)/);
  assert.match(route, /latestTwilioProviderEvidence/);
  assert.match(route, /TWILIO_PROVIDER_EVIDENCE_TTL_MS/);
  assert.doesNotMatch(
    route,
    /verification:\s*verification\s*[,}]/,
  );
  assert.doesNotMatch(ui, /\/admin\/settings\/communications\/twilio/);
  assert.match(ui, /Verify with Twilio — read only/);
  assert.doesNotMatch(verifier, /process\.env\.TWILIO_/);
  assert.doesNotMatch(verifier, /\/Messages/);
  assert.doesNotMatch(verifier, /method:\s*["']POST["']/);
  assert.match(verifier, /method:\s*["']GET["']/);
});
