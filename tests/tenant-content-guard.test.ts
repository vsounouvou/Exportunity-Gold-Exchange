import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  getTenantContentQuarantineReason,
  isTenantContentVisible,
} from "../server/lib/tenant-content-guard";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readRepoFile(relativePath: string) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("Exportunity hides historical BDO policy text without deleting valid industrial context", () => {
  const legacyGoldMessage =
    "We offer certified physical gold, verified jewelry, secure delivery, and conditional resale requests.";
  const industrialMessage =
    "The technical team is reviewing the part specification before supplier outreach is approved.";

  assert.equal(
    isTenantContentVisible({ tenantKey: "exportunity", content: legacyGoldMessage }),
    false,
  );
  assert.equal(
    getTenantContentQuarantineReason({ tenantKey: "exportunity", content: legacyGoldMessage }),
    "legacy_bdo_context",
  );
  assert.equal(
    isTenantContentVisible({ tenantKey: "exportunity", content: industrialMessage }),
    true,
  );
  assert.equal(
    isTenantContentVisible({ tenantKey: "bdo", content: legacyGoldMessage }),
    true,
  );
});

test("shared agent and conversation paths enforce Exportunity context boundaries", () => {
  const provider = readRepoFile("server/lib/ai-provider.ts");
  const routes = readRepoFile("server/routes.ts");
  const claude = readRepoFile("server/lib/claude.ts");
  const gemini = readRepoFile("server/lib/gemini.ts");

  assert.match(provider, /hydrateAgentResponseOptions/);
  assert.match(provider, /EXPORTUNITY_COMPANY_CONTEXT/);
  assert.match(routes, /isTenantContentVisible/);
  assert.match(routes, /companyContext: isExportunityTenant \? EXPORTUNITY_COMPANY_CONTEXT/);
  assert.match(claude, /The only supported action block is/);
  assert.match(gemini, /The only supported action block is/);
});
