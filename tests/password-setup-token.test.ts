import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluatePasswordSetupTokenState,
  generatePasswordSetupTokenRaw,
  hashPasswordSetupToken,
} from "../server/lib/password-setup";

test("password setup token hashing is deterministic and does not expose raw token", () => {
  const raw = generatePasswordSetupTokenRaw();
  const hashA = hashPasswordSetupToken(raw);
  const hashB = hashPasswordSetupToken(raw);

  assert.equal(hashA, hashB);
  assert.notEqual(hashA, raw);
  assert.equal(hashA.length, 64);
});

test("password setup token state: used token is rejected", () => {
  const state = evaluatePasswordSetupTokenState({
    usedAt: new Date(),
    expiresAt: new Date(Date.now() + 60_000),
  });
  assert.equal(state, "used");
});

test("password setup token state: expired token is rejected", () => {
  const state = evaluatePasswordSetupTokenState({
    usedAt: null,
    expiresAt: new Date(Date.now() - 60_000),
  });
  assert.equal(state, "expired");
});

test("password setup token state: fresh token is valid", () => {
  const state = evaluatePasswordSetupTokenState({
    usedAt: null,
    expiresAt: new Date(Date.now() + 60_000),
  });
  assert.equal(state, null);
});
