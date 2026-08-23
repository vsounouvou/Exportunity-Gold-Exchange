import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath: string) => fs.readFileSync(path.join(repoRoot, relativePath), "utf8");

test("Chairman quick exposes one authenticated read-only executive truth projection", () => {
  const route = read("server/routes/chairman-console.ts");
  const start = route.indexOf('router.get("/chairman/executive-truth"');
  const end = route.indexOf('router.post("/chairman/quick-token"', start);
  assert.ok(start >= 0 && end > start, "Executive truth route is missing");
  const projection = route.slice(start, end);

  assert.match(projection, /resolveChairmanConsoleActor/);
  assert.match(projection, /company_brain_sources/);
  assert.match(projection, /company_brain_claim_conflicts/);
  assert.match(projection, /company_brain_context_packs/);
  assert.match(projection, /ece_agent_templates/);
  assert.match(projection, /industrial_agent_staffing_requests/);
  assert.match(projection, /readOnly:\s*true/);
  assert.match(projection, /approvalsAvailable:\s*false/);
  assert.match(projection, /agentLifecycleMutationAvailable:\s*false/);
  assert.match(projection, /externalActionsStarted:\s*false/);
  assert.doesNotMatch(projection, /\.(insert|update|delete)\s*\(/);
});

test("Chairman quick renders governed Company Brain and organization coverage without mutation controls", () => {
  const page = read("client/src/pages/ChairmanQuickPage.tsx");

  assert.match(page, /\/api\/chairman\/executive-truth/);
  assert.match(page, /Company truth/);
  assert.match(page, /Executive truth/);
  assert.match(page, /Company Brain/);
  assert.match(page, /Global organization/);
  assert.match(page, /This panel cannot approve or activate anything/);
  assert.match(page, /no external action started/);
});
