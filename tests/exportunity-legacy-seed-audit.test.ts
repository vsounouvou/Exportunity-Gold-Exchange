import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  LEGACY_AGENT_NAMES,
  LEGACY_SEED_KEY,
  LEGACY_STAFF,
  LEGACY_TERRITORY_REFS,
  classifySeededStaff,
  quoteIdentifier,
} from "../scripts/ops/audit-exportunity-legacy-seed.mjs";

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("legacy Exportunity seed audit preserves the exact retired footprint", () => {
  assert.equal(LEGACY_SEED_KEY, "exportunity_agent_economy_seed_v1");
  assert.equal(LEGACY_STAFF.length, 6);
  assert.equal(LEGACY_TERRITORY_REFS.length, 8);
  assert.equal(LEGACY_AGENT_NAMES.length, 20);
  assert.ok(LEGACY_STAFF.some((entry) => entry.email === "ops.super@exportunity.net"));
  assert.ok(LEGACY_AGENT_NAMES.includes("EXO Outreach Scheduler Bot"));
});

test("legacy seed audit is transaction-enforced read only and does not expose credential fields", async () => {
  const script = await read("scripts/ops/audit-exportunity-legacy-seed.mjs");
  const packageJson = await read("package.json");

  assert.match(script, /begin isolation level repeatable read read only/i);
  assert.match(script, /current_setting\('transaction_read_only'\)/);
  assert.match(script, /if \(state\.read_only !== "on"\)/);
  assert.match(script, /await client\.query\("rollback"\)/);
  assert.match(script, /metadata ->> 'seed_key' = \$1/);
  assert.match(script, /constraints ->> 'seed_key' = \$2/);
  assert.match(script, /"timestamp" as event_at/);
  assert.match(script, /source = \$2 or source_ref = any\(\$3::text\[\]\)/);
  assert.match(script, /databaseChanged: false/);
  assert.doesNotMatch(script, /password_hash/i);
  assert.doesNotMatch(script, /Exportunity2026!/);
  assert.match(
    packageJson,
    /"audit:exportunity:legacy-seed": "node scripts\/ops\/audit-exportunity-legacy-seed\.mjs"/,
  );
});

test("unexpected identities and previously used identities require manual review", () => {
  const safeCandidate = classifySeededStaff({
    row: {
      email: "territory.cotonou@exportunity.net",
      seed_key: LEGACY_SEED_KEY,
      created_at: "2026-03-03T10:00:00.000Z",
      last_login_at: null,
    },
    firstSeedAuditAt: "2026-03-03T10:01:00.000Z",
    dependencies: [],
  });
  assert.equal(safeCandidate.classification, "likely_seed_created_review_before_change");
  assert.deepEqual(safeCandidate.reasons, []);

  const usedCandidate = classifySeededStaff({
    row: {
      email: "someone@example.com",
      seed_key: LEGACY_SEED_KEY,
      created_at: "2026-01-01T00:00:00.000Z",
      last_login_at: "2026-04-01T00:00:00.000Z",
    },
    firstSeedAuditAt: "2026-03-03T10:01:00.000Z",
    dependencies: [{ table: "orders", column: "created_by_user_id" }],
  });
  assert.equal(usedCandidate.classification, "manual_review_required");
  assert.deepEqual(usedCandidate.reasons, [
    "unexpected_identity_with_seed_marker",
    "account_has_login_history",
    "account_predates_first_retained_seed_audit",
    "account_has_non_seed_graph_references",
  ]);
});

test("catalog identifiers are safely quoted", () => {
  assert.equal(quoteIdentifier("agent_tasks"), '"agent_tasks"');
  assert.equal(quoteIdentifier('odd"name'), '"odd""name"');
  assert.throws(() => quoteIdentifier(""), /empty SQL identifier/);
});

test("audit help runs without a database connection", () => {
  const scriptPath = fileURLToPath(
    new URL("../scripts/ops/audit-exportunity-legacy-seed.mjs", import.meta.url),
  );
  const result = spawnSync(process.execPath, [scriptPath, "--help"], {
    encoding: "utf8",
    env: { ...process.env, DATABASE_URL: "" },
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /read-only production-compatible audit/i);
  assert.doesNotMatch(result.stdout, /password|postgres(?:ql)?:\/\//i);
});
