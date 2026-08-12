import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  EXPORTUNITY_ROLE_SEAT_DEPARTMENTS,
  EXPORTUNITY_ROLE_SEATS,
  EXPORTUNITY_ROLE_SEAT_TOTAL,
} from "../server/lib/company-brain/roleSeatCatalog";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath: string) => fs.readFileSync(path.join(repoRoot, relativePath), "utf8");

test("Exportunity global organization defines exactly 126 governed seats across 14 departments", () => {
  assert.equal(EXPORTUNITY_ROLE_SEAT_DEPARTMENTS.length, 14);
  assert.equal(EXPORTUNITY_ROLE_SEAT_DEPARTMENTS.reduce((sum, department) => sum + department.capacity, 0), 126);
  assert.equal(EXPORTUNITY_ROLE_SEAT_TOTAL, 126);
  assert.equal(EXPORTUNITY_ROLE_SEATS.length, 126);
  assert.equal(new Set(EXPORTUNITY_ROLE_SEATS.map((seat) => seat.immutableAgentId)).size, 126);

  for (const department of EXPORTUNITY_ROLE_SEAT_DEPARTMENTS) {
    assert.equal(department.roles.length, department.capacity, `${department.name} capacity does not match its roles`);
    assert.equal(
      EXPORTUNITY_ROLE_SEATS.filter((seat) => seat.departmentKey === department.key).length,
      department.capacity,
      `${department.name} seat count is incorrect`,
    );
  }
});

test("every role seat has editable identity metadata but starts dormant and unable to communicate", () => {
  const prohibitedExternalTools = [
    "send_message",
    "send_email",
    "send_whatsapp",
    "make_call",
    "payments",
    "contract_commitment",
    "external_publish",
  ];

  for (const seat of EXPORTUNITY_ROLE_SEATS) {
    assert.ok(seat.defaultDisplayName.trim());
    assert.ok(seat.role.trim());
    assert.ok(seat.departmentName.trim());
    assert.ok(seat.companyEntityScope.length > 0);
    assert.ok(seat.description.trim());
    assert.ok(seat.languages.length > 0);
    assert.ok(seat.geographicCompetencies.length > 0);
    assert.ok(seat.sectorCompetencies.length > 0);
    assert.ok(seat.memoryScopes.length > 0);
    assert.ok(seat.escalationRules.length > 0);
    assert.ok(seat.performanceMetrics.length > 0);
    assert.equal(seat.contextPolicy.mode, "task_scoped");
    assert.equal(seat.contextPolicy.evidenceRequired, true);
    assert.equal(seat.contextPolicy.conflictAware, true);
    assert.equal(seat.activationStatus, "available");
    assert.equal(seat.budget.monthlyLimit, 0);
    assert.equal(seat.mailboxIdentity, null);
    assert.equal(seat.externalIdentityPolicy.aiDisclosureRequired, true);
    assert.equal(seat.externalIdentityPolicy.impersonationProhibited, true);
    for (const tool of prohibitedExternalTools) {
      assert.ok(seat.prohibitedTools.includes(tool), `${seat.immutableAgentId} does not prohibit ${tool}`);
      assert.equal(seat.permittedTools.includes(tool), false, `${seat.immutableAgentId} permits ${tool}`);
    }
  }
});

test("role-seat provisioning creates an inactive zero-budget runtime and never enables production", () => {
  const routes = read("server/routes/admin-agents-os.ts");
  const start = routes.indexOf('router.post("/admin/agents/:id(\\\\d+)/provision"');
  const end = routes.indexOf('router.post("/admin/agents-os/import-runtime"', start);
  assert.ok(start >= 0 && end > start, "Unable to isolate role-seat provisioning route");
  const provisionRoute = routes.slice(start, end);

  assert.match(provisionRoute, /'inactive'/);
  assert.match(provisionRoute, /'draft_only'/);
  assert.match(provisionRoute, /'0\.00', '0\.00', '0\.00'/);
  assert.match(provisionRoute, /productionEnabled: false/);
  assert.match(provisionRoute, /externalCommunicationsEnabled: false/);
  assert.doesNotMatch(provisionRoute, /insert\s+into\s+agents_production/i);
});

test("Agents OS exposes organization browsing, role editing, and the existing face editor handoff", () => {
  const page = read("client/src/pages/AdminAgentsOsPage.tsx");
  assert.match(page, /value="organization"/);
  assert.match(page, /Provision inactive/);
  assert.match(page, /Edit role/);
  assert.match(page, /Edit identity &amp; face/);
  assert.match(page, /roleProfile:/);
  assert.match(page, /\/operations\/agents\/\$\{runtimeAgentId\}\?edit=1/);
});
