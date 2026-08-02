import assert from "node:assert/strict";
import test from "node:test";

import { applyTenantMembershipAccess } from "../server/lib/tenantUserAccessPolicy";

test("SUPER_ADMIN membership produces an effective administrative session without mutating the user record", () => {
  const user = {
    id: 42,
    role: "buyer",
    roles: ["buyer"],
    permissions: [],
    currentMode: "buyer",
  };

  const effective = applyTenantMembershipAccess(user, [{ tenantId: 5, role: "SUPER_ADMIN" }], 5);

  assert.equal(user.currentMode, "buyer");
  assert.equal(effective.currentMode, "admin");
  assert.equal(effective.roles.includes("admin"), true);
  assert.equal(effective.roles.includes("super admin"), true);
  assert.equal(effective.permissions.includes("admin:*"), true);
});

test("TENANT_ADMIN membership is effective only for its tenant", () => {
  const user = { id: 42, roles: ["buyer"], permissions: [], currentMode: "buyer" };

  const allowed = applyTenantMembershipAccess(user, [{ tenantId: 5, role: "TENANT_ADMIN" }], 5);
  const denied = applyTenantMembershipAccess(user, [{ tenantId: 5, role: "TENANT_ADMIN" }], 6);

  assert.equal(allowed.currentMode, "admin");
  assert.equal(denied.currentMode, "buyer");
});
