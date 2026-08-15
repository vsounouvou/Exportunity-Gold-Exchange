import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  assertReadOnlyWorkspaceScopes,
  GOOGLE_WORKSPACE_READ_SCOPES,
  scopesForWorkspaceService,
  validateReadOnlyWorkspaceScopes,
} from "../server/lib/company-brain/workspaceScopes";
import { classifyWorkspaceEvidence } from "../server/lib/company-brain/workspaceClassification";
import {
  buildWorkspaceEmailMetadata,
  extractEmailAddresses,
} from "../server/lib/company-brain/workspaceEmailMetadata";
import {
  decryptIntegrationTokenPayload,
  encryptIntegrationTokenPayload,
} from "../server/lib/integrations/tokenVault";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath: string) => fs.readFileSync(path.join(repoRoot, relativePath), "utf8");

test("Workspace email metadata identifies direction and counterpart addresses without modifying Gmail", () => {
  assert.deepEqual(
    extractEmailAddresses('Awa Kouadio <awa@exportunity.net>, Buyer <BUYER@EXAMPLE.COM>'),
    ["awa@exportunity.net", "buyer@example.com"],
  );
  assert.deepEqual(buildWorkspaceEmailMetadata({
    accountEmail: "awa@exportunity.net",
    from: "Awa Kouadio <awa@exportunity.net>",
    to: "Buyer <buyer@example.com>",
    cc: "Engineering <engineering@example.com>",
  }), {
    accountEmail: "awa@exportunity.net",
    fromEmails: ["awa@exportunity.net"],
    toEmails: ["buyer@example.com"],
    ccEmails: ["engineering@example.com"],
    correspondentEmails: ["buyer@example.com", "engineering@example.com"],
    direction: "outbound",
  });
});

test("Workspace services request only identity plus the exact read-only service scope", () => {
  for (const service of ["drive", "gmail", "contacts"] as const) {
    const scopes = scopesForWorkspaceService(service);
    assert.deepEqual(scopes, ["openid", "email", "profile", GOOGLE_WORKSPACE_READ_SCOPES[service]]);
    assert.equal(validateReadOnlyWorkspaceScopes(service, scopes).valid, true);
    assert.deepEqual(assertReadOnlyWorkspaceScopes(service, scopes), scopes);
  }
});

test("Workspace scope validation rejects send, modify, write, and cross-service grants", () => {
  const unsafe = [
    ["gmail", "https://www.googleapis.com/auth/gmail.send"],
    ["gmail", "https://www.googleapis.com/auth/gmail.modify"],
    ["drive", "https://www.googleapis.com/auth/drive.file"],
    ["contacts", "https://www.googleapis.com/auth/contacts"],
    ["drive", "https://www.googleapis.com/auth/calendar.events"],
  ] as const;
  for (const [service, scope] of unsafe) {
    const result = validateReadOnlyWorkspaceScopes(service, [
      ...scopesForWorkspaceService(service),
      scope,
    ]);
    assert.equal(result.valid, false, `${service} should reject ${scope}`);
    assert.ok(result.forbiddenScopes.includes(scope));
  }
});

test("Gmail evidence classifier indexes business history and quarantines sensitive personal mail", () => {
  const business = classifyWorkspaceEvidence({
    subject: "RFQ for industrial machinery",
    text: "Please send a quotation and freight lead time for our factory.",
    from: "buyer@manufacturer.example",
    includeDomains: ["manufacturer.example"],
    requireBusinessSignal: true,
  });
  assert.equal(business.disposition, "index");
  assert.ok(business.businessScore >= 36);

  const sensitive = classifyWorkspaceEvidence({
    subject: "Passport and visa application",
    text: "Attached is my passport for the immigration process.",
    from: "private@example.org",
    requireBusinessSignal: true,
  });
  assert.equal(sensitive.disposition, "quarantine");
  assert.ok(sensitive.sensitiveSignals.includes("immigration_or_identity"));

  const excluded = classifyWorkspaceEvidence({
    subject: "Family matter",
    text: "This should never become company evidence.",
    neverIndex: ["family matter"],
  });
  assert.equal(excluded.disposition, "never_index");
});

test("Google Contacts qualification keeps unrelated personal contacts out of the CRM path", () => {
  const business = classifyWorkspaceEvidence({
    subject: "Amina Diallo",
    from: "amina@supplier.example",
    company: "West Africa Industrial Supplier",
    jobTitle: "Export Director",
    requireBusinessSignal: true,
  });
  assert.equal(business.disposition, "index");

  const personal = classifyWorkspaceEvidence({
    subject: "Old school friend",
    from: "friend@example.org",
    requireBusinessSignal: true,
  });
  assert.equal(personal.disposition, "review");
});

test("Workspace token vault encrypts credentials with authenticated encryption", () => {
  const previous = process.env.MINDBASE_INTEGRATION_SECRET;
  process.env.MINDBASE_INTEGRATION_SECRET = "workspace-test-secret-that-is-never-a-production-value";
  try {
    const plaintext = {
      access_token: "access-token-value",
      refresh_token: "refresh-token-value",
      scope: "https://www.googleapis.com/auth/gmail.readonly",
    };
    const encrypted = encryptIntegrationTokenPayload(plaintext);
    assert.notEqual(encrypted.ciphertext, JSON.stringify(plaintext));
    assert.ok(!encrypted.ciphertext.includes("refresh-token-value"));
    assert.deepEqual(decryptIntegrationTokenPayload(encrypted), plaintext);
    assert.throws(
      () => decryptIntegrationTokenPayload({ ...encrypted, authTag: Buffer.alloc(16).toString("base64") }),
      /authenticate|unable/i,
    );
  } finally {
    if (previous === undefined) delete process.env.MINDBASE_INTEGRATION_SECRET;
    else process.env.MINDBASE_INTEGRATION_SECRET = previous;
  }
});

test("Workspace connector contract is additive, visible, manual-only, and contains no send route", () => {
  const migration = read("db/migrations/20270331_exportunity_company_brain_workspace_connectors.sql");
  const route = read("server/routes/company-brain-workspace.ts");
  const sync = read("server/lib/company-brain/workspaceSync.ts");
  const page = read("client/src/pages/AdminGoogleWorkspaceIntegrationPage.tsx");
  const env = read(".env.example");

  for (const table of [
    "company_brain_source_connectors",
    "company_brain_oauth_states",
    "company_brain_sync_runs",
    "company_brain_sync_cursors",
    "company_brain_sync_dead_letters",
  ]) {
    assert.match(migration, new RegExp(`create table if not exists ${table}`));
  }
  assert.match(route, /manualSyncOnly: true/);
  assert.match(route, /emailSendingEnabled: false/);
  assert.match(route, /driveWritesEnabled: false/);
  assert.match(route, /router\.post\("\/connectors\/:service\/sync"/);
  assert.doesNotMatch(route, /gmail\.(?:send|modify|compose)/i);
  assert.match(sync, /trigger: "manual"/);
  assert.match(sync, /status = 'syncing'/);
  assert.match(sync, /drive\/v3\/changes/);
  assert.match(sync, /includeRemoved/);
  assert.match(sync, /folderPageSize/);
  assert.match(sync, /gmail\/v1\/users\/me\/history/);
  assert.match(sync, /includeDomains\.flatMap/);
  assert.match(sync, /messagesDeleted/);
  assert.match(sync, /contacts_page_state/);
  assert.match(sync, /requestSyncToken/);
  assert.match(sync, /metadata\)\.deleted === true/);
  assert.match(sync, /blockedByOpenDeadLetter/);
  assert.match(sync, /extraction_status, security_status/);
  assert.match(sync, /'tombstone', 'clean'/);
  assert.doesNotMatch(sync, /drive_modified_time/);
  assert.doesNotMatch(sync, /gmail_internal_date/);
  assert.match(page, /This page cannot send, reply, label, delete, or modify Google content/);
  assert.match(env, /FEATURE_EXTERNAL_COMMUNICATIONS=false/);
  assert.match(env, /GOOGLE_WORKSPACE_REDIRECT_URI=https:\/\/exportunity\.net\/api\/admin\/company-brain\/workspace\/google\/callback/);
});
