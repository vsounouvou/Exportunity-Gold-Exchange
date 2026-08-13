import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { EXPORTUNITY_CORE_AGENT_ROLE_SEAT_BINDINGS } from "../server/lib/company-brain/coreAgentRoleSeatBindings";
import { EXPORTUNITY_ROLE_SEATS } from "../server/lib/company-brain/roleSeatCatalog";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath: string) => fs.readFileSync(path.join(repoRoot, relativePath), "utf8");

test("the current Exportunity team maps to unique governed role seats by stable organization key", () => {
  assert.equal(EXPORTUNITY_CORE_AGENT_ROLE_SEAT_BINDINGS.length, 12);
  assert.equal(
    new Set(EXPORTUNITY_CORE_AGENT_ROLE_SEAT_BINDINGS.map((item) => item.organizationKey)).size,
    EXPORTUNITY_CORE_AGENT_ROLE_SEAT_BINDINGS.length,
  );
  assert.equal(
    new Set(EXPORTUNITY_CORE_AGENT_ROLE_SEAT_BINDINGS.map((item) => item.roleSeatCode)).size,
    EXPORTUNITY_CORE_AGENT_ROLE_SEAT_BINDINGS.length,
  );
  assert.deepEqual(
    new Set(EXPORTUNITY_CORE_AGENT_ROLE_SEAT_BINDINGS.map((item) => item.organizationKey)),
    new Set(["ceo", "tassi", "commercial", "sourcing", "technical", "logistics", "finance", "quality", "data", "compliance", "marketing", "fenou"]),
  );

  for (const binding of EXPORTUNITY_CORE_AGENT_ROLE_SEAT_BINDINGS) {
    const seat = EXPORTUNITY_ROLE_SEATS.find((item) => item.immutableAgentId === binding.roleSeatCode);
    assert.ok(seat, `${binding.organizationKey} points to a missing role seat`);
    assert.equal(seat.role, binding.roleSeatTitle);
    assert.ok(binding.rationale.length > 20);
  }
});

test("core-team reconciliation requires explicit confirmation and cannot change agent lifecycle or tools", () => {
  const routes = read("server/routes/admin-agents-os.ts");
  const start = routes.indexOf('router.get("/admin/agents-os/core-team-reconciliation"');
  const end = routes.indexOf('router.post("/admin/agents/:id(\\\\d+)/provision"', start);
  assert.ok(start >= 0 && end > start, "Unable to isolate core-team reconciliation routes");
  const reconciliationRoutes = routes.slice(start, end);

  assert.match(reconciliationRoutes, /mode: "preview"/);
  assert.match(reconciliationRoutes, /req\.body\?\.confirm !== true/);
  assert.match(reconciliationRoutes, /await db\.transaction/);
  assert.match(reconciliationRoutes, /CORE_TEAM_ROLE_SEATS_RECONCILED/);
  assert.match(reconciliationRoutes, /permissionsChanged: false/);
  assert.match(reconciliationRoutes, /lifecycleChanged: false/);
  assert.match(reconciliationRoutes, /externalActionsStarted: false/);
  assert.doesNotMatch(reconciliationRoutes, /update\s+agents\s+set/i);
  assert.doesNotMatch(reconciliationRoutes, /insert\s+into\s+agents(?:\s|\()/i);
  assert.doesNotMatch(reconciliationRoutes, /insert\s+into\s+agents_production/i);
});

test("Agents OS shows a reviewable reconciliation preview and real linked employee identity", () => {
  const page = read("client/src/pages/AdminAgentsOsPage.tsx");
  assert.match(page, /Review .* matches/);
  assert.match(page, /Confirm and link/);
  assert.match(page, /immutable organization keys/);
  assert.match(page, /runtime_avatar_url/);
  assert.match(page, /seat\.runtime_display_name \|\| seat\.display_name/);
  assert.match(page, /seat\.runtime_role \|\| seat\.role_title/);
  assert.match(page, /No permissions, lifecycle state, or external action changed/);
});
