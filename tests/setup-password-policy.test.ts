import assert from "node:assert/strict";
import test from "node:test";

import { getSetupPasswordErrorMessage, resolveSetupPasswordPostSetupPath } from "../client/src/lib/setupPasswordPolicy";

test("setup-password policy: VS host resolves to /admin/vs", () => {
  const resolved = resolveSetupPasswordPostSetupPath({
    host: "vitalsounouvou.com",
    serverRedirect: "/admin/vs",
  });
  assert.equal(resolved.tenantKey, "vs");
  assert.equal(resolved.redirect, "/admin/vs");
});

test("setup-password policy: HOZ host resolves to /admin/hoz", () => {
  const resolved = resolveSetupPasswordPostSetupPath({
    host: "houseofzogue.com",
    serverRedirect: "/admin/hoz",
  });
  assert.equal(resolved.tenantKey, "hoz");
  assert.equal(resolved.redirect, "/admin/hoz");
});

test("setup-password policy: disallowed redirect falls back to tenant default route", () => {
  const resolved = resolveSetupPasswordPostSetupPath({
    host: "houseofzogue.com",
    serverRedirect: "/dashboard",
  });
  assert.equal(resolved.tenantKey, "hoz");
  assert.equal(resolved.redirect, "/admin/hoz");
});

test("setup-password policy: error code maps to explicit operator message", () => {
  assert.equal(
    getSetupPasswordErrorMessage({ code: "SETUP_TOKEN_USED" }),
    "This setup link was already used. Generate a new one.",
  );

  assert.equal(
    getSetupPasswordErrorMessage({ code: "SETUP_TOKEN_EXPIRED" }),
    "This setup link expired. Generate a new one.",
  );
});
