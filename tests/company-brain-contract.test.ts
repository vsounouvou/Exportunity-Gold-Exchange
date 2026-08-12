import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath: string) => fs.readFileSync(path.join(repoRoot, relativePath), "utf8");

test("Company Brain is additive, tenant-scoped, and ensured before route registration", () => {
  const schema = read("db/schema/company-brain.ts");
  const migration = read("db/migrations/20270330_exportunity_company_brain_foundation.sql");
  const server = read("server/index.ts");
  const env = read(".env.example");

  for (const table of [
    "company_brain_sources",
    "company_brain_source_versions",
    "company_brain_claims",
    "company_brain_claim_evidence",
    "company_brain_claim_conflicts",
    "company_brain_claim_approvals",
    "company_brain_context_packs",
    "company_brain_audit_events",
  ]) {
    assert.match(schema, new RegExp(table));
    assert.match(migration, new RegExp(`create table if not exists ${table}`));
  }

  assert.match(schema, /tenant_id/);
  assert.match(server, /await ensureCompanyBrainTables\(\)/);
  assert.ok(server.indexOf("await ensureCompanyBrainTables()") < server.lastIndexOf("registerRoutes(app)"));
  assert.match(env, /FEATURE_EXTERNAL_COMMUNICATIONS=false/);
  assert.match(env, /FEATURE_GOOGLE_WORKSPACE_GMAIL_READ=false/);
});
