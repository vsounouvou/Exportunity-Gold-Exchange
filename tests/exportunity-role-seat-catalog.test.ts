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
import {
  buildDemandRoleSeatProfile,
  EXPORTUNITY_DEMAND_ROLE_SEAT_VERSION,
} from "../server/lib/company-brain/demandRoleSeat";

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
  const end = routes.indexOf(
    'router.post("/admin/agents-os/workforce-requests/:id(\\\\d+)/lifecycle"',
    start,
  );
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

test("demand-created role seats inherit company governance and evidence", () => {
  const profile = buildDemandRoleSeatProfile({
    roleCode: "exportunity-demand-seat-soybean-oil",
    roleTitle: "Soybean Oil Desk Agent",
    departmentKey: "commodity-industry-desks",
    reason: "Five distinct sourcing requirements require durable coverage.",
    staffingRequestId: 41,
    demandCount: 5,
    demandThreshold: 5,
    evidenceItems: [
      { requirementId: "requirement-a", productName: "Soybean oil" },
      { requirementId: "requirement-b", productCategory: "soybean_oil" },
    ],
  });

  assert.equal(EXPORTUNITY_DEMAND_ROLE_SEAT_VERSION, "exportunity-demand-role-seats-v1");
  assert.equal(profile.dynamicRoleSeat, true);
  assert.equal(profile.source, "demand_driven_workforce");
  assert.equal(profile.managerOrganizationKey, "sourcing");
  assert.equal(profile.budget.monthlyLimit, 0);
  assert.equal(profile.contextPolicy.evidenceRequired, true);
  assert.equal(profile.contextPolicy.conflictAware, true);
  assert.deepEqual(profile.evidenceRequirementIds, ["requirement-a", "requirement-b"]);
  assert.ok(profile.companyEntityScope.includes("Exportunity.net"));
  assert.ok(profile.prohibitedTools.includes("send_email"));
  assert.equal(profile.permittedTools.includes("send_email"), false);
});

test("approving recurring demand creates only a private inactive role blueprint", () => {
  const routes = read("server/routes/admin-agents-os.ts");
  const start = routes.indexOf('router.post("/admin/agents-os/workforce-requests/:id(\\\\d+)/review"');
  const end = routes.indexOf('router.get("/admin/agents-os/role-seats"', start);
  assert.ok(start >= 0 && end > start, "Unable to isolate workforce review route");
  const reviewRoute = routes.slice(start, end);

  assert.match(reviewRoute, /buildDemandRoleSeatProfile/);
  assert.match(reviewRoute, /EXPORTUNITY_DEMAND_ROLE_SEAT_VERSION/);
  assert.match(reviewRoute, /'draft', 'private'/);
  assert.match(reviewRoute, /roleSeatCreated/);
  assert.match(reviewRoute, /runtimeAgentsStarted: 0/);
  assert.match(reviewRoute, /productionEnabled: false/);
  assert.doesNotMatch(reviewRoute, /insert\s+into\s+agents\s*\(/i);
  assert.doesNotMatch(reviewRoute, /insert\s+into\s+agents_production/i);
});

test("Agents OS links demand evidence to the exact opportunity and identifies dynamic seats", () => {
  const page = read("client/src/pages/AdminAgentsOsPage.tsx");
  const network = read("client/src/pages/AdminIndustrialNetworkPage.tsx");

  assert.match(page, /demand-created role/);
  assert.match(page, /Planned manager:/);
  assert.match(page, /industrial-network\?requirement=/);
  assert.match(network, /focusedRequirementId/);
  assert.match(network, /requirement-\$\{opportunity\.id\}/);
  assert.match(network, /ring-amber-300/);
});
