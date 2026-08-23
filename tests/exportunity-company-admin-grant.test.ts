import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path: string) =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("the Exportunity company administrator is a separate fixed company identity", async () => {
  const script = await read("scripts/grant-exportunity-company-admin.mjs");
  const identity = await read("tenants/exportunity/companyIdentity.ts");
  const workspacePage = await read("client/src/pages/AdminGoogleWorkspaceIntegrationPage.tsx");
  const twilioPage = await read("client/src/pages/AdminTwilioControlCenterPage.tsx");
  const envExample = await read(".env.example");
  const packageJson = await read("package.json");

  assert.match(identity, /adminEmail: "exportunitygroup@gmail\.com"/);
  assert.match(identity, /tenantKey: "exportunity"/);
  assert.match(identity, /tenantAdminRole: "TENANT_ADMIN"/);
  assert.match(script, /const COMPANY_ADMIN_EMAIL = "exportunitygroup@gmail\.com"/);
  assert.match(script, /configured !== COMPANY_ADMIN_EMAIL \|\| requested !== COMPANY_ADMIN_EMAIL/);
  assert.match(script, /where lower\(t\.key\) = \$1/);
  assert.match(script, /role = 'admin'/);
  assert.match(script, /COMPANY_TENANT_ROLE = "TENANT_ADMIN"/);
  assert.match(script, /companyAdmin: true/);
  assert.match(script, /randomBytes\(32\)\.toString\("base64url"\)/);
  assert.match(script, /PASSWORD_HASH_ROUNDS = 12/);
  assert.match(script, /createHash\("sha256"\)/);
  assert.match(script, /token_hash/);
  assert.match(script, /one-time token was invalidated/i);
  assert.doesNotMatch(script, /process\.env\.ADMIN_PASSWORD/);
  assert.doesNotMatch(script, /--password/);
  assert.doesNotMatch(script, /vitalsounouvou2025@gmail\.com/i);
  assert.match(workspacePage, /EXPORTUNITY_COMPANY_IDENTITY\.adminEmail/);
  assert.match(twilioPage, /EXPORTUNITY_COMPANY_IDENTITY\.adminEmail/);
  assert.match(twilioPage, /Personal test recipients remain separate/);
  assert.match(envExample, /EXPORTUNITY_COMPANY_ADMIN_EMAIL=exportunitygroup@gmail\.com/);
  assert.match(
    packageJson,
    /"admin:exportunity:grant-company": "node scripts\/grant-exportunity-company-admin\.mjs --send-setup-email"/,
  );
  assert.doesNotMatch(packageJson, /admin:exportunity:grant-company[^\n]*tsx/);
});

test("the production command exposes help without requiring database or leaking credentials", () => {
  const scriptPath = fileURLToPath(
    new URL("../scripts/grant-exportunity-company-admin.mjs", import.meta.url),
  );
  const result = spawnSync(process.execPath, [scriptPath, "--help"], {
    encoding: "utf8",
    env: { ...process.env, DATABASE_URL: "", MAIL_SMTP_PASS: "" },
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /--send-setup-email/);
  assert.match(result.stdout, /--verify-only/);
  assert.doesNotMatch(result.stdout, /password_hash|token_hash|MAIL_SMTP_PASS/);
});

test("the production command rejects any non-company identity before database access", () => {
  const scriptPath = fileURLToPath(
    new URL("../scripts/grant-exportunity-company-admin.mjs", import.meta.url),
  );
  const result = spawnSync(
    process.execPath,
    [scriptPath, "--email", "someone@example.com", "--verify-only"],
    {
      encoding: "utf8",
      env: { ...process.env, DATABASE_URL: "", EXPORTUNITY_COMPANY_ADMIN_EMAIL: "" },
    },
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /only grants the approved company identity exportunitygroup@gmail\.com/i);
  assert.doesNotMatch(result.stderr, /DATABASE_URL is required/);
});
