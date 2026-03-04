import test from "node:test";
import assert from "node:assert/strict";

import { canPublishMarketplace, resolveActorRole } from "../server/routes/admin-agents-os";

test("resolveActorRole normalizes chairman and super_admin", () => {
  assert.equal(resolveActorRole({ role: "Chairman" }), "chairman");
  assert.equal(resolveActorRole({ role: "SUPER_ADMIN" }), "super_admin");
  assert.equal(resolveActorRole({ roles: ["Admin"] }), "admin");
  assert.equal(resolveActorRole({ role: "operator" }), "operator");
});

test("canPublishMarketplace allows chairman and super_admin", () => {
  assert.equal(canPublishMarketplace({ role: "chairman" }), true);
  assert.equal(canPublishMarketplace({ role: "super_admin" }), true);
});

test("canPublishMarketplace allows explicit publish permission", () => {
  assert.equal(canPublishMarketplace({ role: "admin", permissions: ["agents.publish_marketplace"] }), true);
  assert.equal(canPublishMarketplace({ role: "admin", permissions: ["admin:*"] }), true);
  assert.equal(canPublishMarketplace({ role: "admin", permissions: ["*"] }), true);
});

test("canPublishMarketplace denies standard admin without publish permission", () => {
  assert.equal(canPublishMarketplace({ role: "admin", permissions: ["agents.write"] }), false);
  assert.equal(canPublishMarketplace({ role: "operator", permissions: [] }), false);
});
