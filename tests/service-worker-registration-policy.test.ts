import assert from "node:assert/strict";
import test from "node:test";

import { shouldReloadOnControllerChange } from "../client/src/system/swRegistration";

test("service worker bootstrap does not reload a first visit", () => {
  assert.equal(shouldReloadOnControllerChange(false), false);
});

test("service worker bootstrap reloads an existing controlled page after an upgrade", () => {
  assert.equal(shouldReloadOnControllerChange(true), true);
});
