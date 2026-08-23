import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  authorizeExportunityOwnerTest,
  publicExportunityOwnerTestPolicy,
} from "../server/lib/exportunity/outreach/ownerTestPolicy";
import {
  releasedOwnerOnlyTestBypassesGlobalGate,
} from "../server/lib/actions/externalCommunications";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function withEnv(
  values: Record<string, string | undefined>,
  callback: () => void,
) {
  const previous = Object.fromEntries(
    Object.keys(values).map((key) => [key, process.env[key]]),
  );
  try {
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    callback();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("owner-only outreach accepts only exact Exportunity allowlist destinations", () => {
  withEnv(
    {
      EXPORTUNITY_OUTREACH_TEST_MODE: "true",
      EXPORTUNITY_OUTREACH_TEST_EMAILS:
        "vs@exportunity.com,vitalsounouvou2025@gmail.com",
      EXPORTUNITY_OUTREACH_TEST_EMAIL_ENABLED: "true",
      EXPORTUNITY_TWILIO_TEST_SMS_TO: "+2250100000229",
      EXPORTUNITY_OUTREACH_TEST_SMS_ENABLED: "true",
    },
    () => {
      const email = authorizeExportunityOwnerTest({
        tenantKey: "exportunity",
        channel: "email",
        payload: { ownerOnlyTest: true, outreachTestMode: "owner_only" },
        recipients: ["VS@EXPORTUNITY.COM"],
      });
      assert.equal(email.authorized, true);
      assert.equal(email.channelEnabled, true);

      const sms = authorizeExportunityOwnerTest({
        tenantKey: "exportunity",
        channel: "sms",
        payload: { ownerOnlyTest: true, outreachTestMode: "owner_only" },
        recipients: ["+2250100000229"],
      });
      assert.equal(sms.authorized, true);

      const outsider = authorizeExportunityOwnerTest({
        tenantKey: "exportunity",
        channel: "email",
        payload: { ownerOnlyTest: true, outreachTestMode: "owner_only" },
        recipients: ["supplier@example.com"],
      });
      assert.equal(outsider.authorized, false);
      assert.equal(outsider.reason, "recipient_not_owner_allowlisted");
    },
  );
});

test("owner-only outreach fails closed by tenant, mode, and channel release", () => {
  withEnv(
    {
      EXPORTUNITY_OUTREACH_TEST_MODE: "true",
      EXPORTUNITY_OUTREACH_TEST_EMAILS: "vs@exportunity.com",
      EXPORTUNITY_OUTREACH_TEST_EMAIL_ENABLED: "false",
    },
    () => {
      const disabled = authorizeExportunityOwnerTest({
        tenantKey: "exportunity",
        channel: "email",
        payload: { ownerOnlyTest: true, outreachTestMode: "owner_only" },
        recipients: ["vs@exportunity.com"],
      });
      assert.equal(disabled.authorized, true);
      assert.equal(disabled.channelEnabled, false);

      const otherProduct = authorizeExportunityOwnerTest({
        tenantKey: "mindbase",
        channel: "email",
        payload: { ownerOnlyTest: true, outreachTestMode: "owner_only" },
        recipients: ["vs@exportunity.com"],
      });
      assert.equal(otherProduct.authorized, false);
      assert.equal(otherProduct.reason, "wrong_tenant");
    },
  );
});

test("only an authorized and channel-released owner test bypasses the global gate", () => {
  assert.equal(
    releasedOwnerOnlyTestBypassesGlobalGate({
      authorized: true,
      channelEnabled: true,
    }),
    true,
  );
  assert.equal(
    releasedOwnerOnlyTestBypassesGlobalGate({
      authorized: true,
      channelEnabled: false,
    }),
    false,
  );
  assert.equal(
    releasedOwnerOnlyTestBypassesGlobalGate({
      authorized: false,
      channelEnabled: true,
    }),
    false,
  );
  assert.equal(releasedOwnerOnlyTestBypassesGlobalGate(null), false);
});

test("public owner-test status masks every destination and Meta stays read-only", () => {
  withEnv(
    {
      EXPORTUNITY_OUTREACH_TEST_MODE: "true",
      EXPORTUNITY_OUTREACH_TEST_EMAILS:
        "vs@exportunity.com,vitalsounouvou2025@gmail.com",
      EXPORTUNITY_TWILIO_TEST_SMS_TO: "+2250100000229",
      EXPORTUNITY_TWILIO_TEST_WHATSAPP_TO: "+2250100000229",
    },
    () => {
      const status = publicExportunityOwnerTestPolicy();
      const serialized = JSON.stringify(status);
      assert.equal(status.externalRecipientsAllowed, false);
      assert.equal(status.channels.meta.enabled, false);
      assert.doesNotMatch(serialized, /vs@exportunity\.com/);
      assert.doesNotMatch(serialized, /vitalsounouvou2025@gmail\.com/);
      assert.doesNotMatch(serialized, /\+2250100000229/);
      assert.match(serialized, /0229/);
    },
  );
});

test("the canonical action path owns test approval and tenant-specific sender resolution", () => {
  const integrationRoute = fs.readFileSync(
    path.join(repoRoot, "server/routes/exportunity-integrations.ts"),
    "utf8",
  );
  const decisionService = fs.readFileSync(
    path.join(
      repoRoot,
      "server/lib/communications/outboundDecisionService.ts",
    ),
    "utf8",
  );
  const actionRouter = fs.readFileSync(
    path.join(repoRoot, "server/lib/actions/ActionRouter.ts"),
    "utf8",
  );
  const worker = fs.readFileSync(
    path.join(repoRoot, "server/lib/actions/worker.ts"),
    "utf8",
  );
  const senderResolution = fs.readFileSync(
    path.join(repoRoot, "server/lib/communications/sender-resolution.ts"),
    "utf8",
  );

  assert.match(integrationRoute, /outreach-test\/queue/);
  assert.match(integrationRoute, /recipientIndex/);
  assert.match(integrationRoute, /exportunityOwnerTestRecipients/);
  assert.match(integrationRoute, /ownerAllowlistVerified: true/);
  assert.match(integrationRoute, /approveActionRequest/);
  assert.match(integrationRoute, /destinationDigest/);
  assert.match(decisionService, /authorizeExportunityOwnerTest/);
  assert.match(actionRouter, /ownerTestAuthorization/);
  assert.match(worker, /releasedOwnerOnlyTestBypassesGlobalGate/);
  assert.match(
    senderResolution,
    /resolveMessagingEnv\(tenantRow\?\.key \?\? null\)/,
  );
});

test("the admin proving ground queues masked recipients by server-side index", () => {
  const ui = fs.readFileSync(
    path.join(repoRoot, "client/src/pages/AdminExportunityIntegrationsPage.tsx"),
    "utf8",
  );
  assert.match(ui, /Queue owner test/);
  assert.match(ui, /recipientIndex/);
  assert.doesNotMatch(ui, /vs@exportunity\.com/);
  assert.doesNotMatch(ui, /vitalsounouvou2025@gmail\.com/);
  assert.doesNotMatch(ui, /\+2250100000229/);
});
