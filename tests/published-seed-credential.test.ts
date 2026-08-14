import assert from "node:assert/strict";
import test from "node:test";

import { isPublishedSeedCredential } from "../server/lib/auth/publishedSeedCredential";

test("blocks the published administrator setup credential in production", () => {
  assert.equal(
    isPublishedSeedCredential({
      email: " ADMIN@EXPORTUNITY.LOCAL ",
      password: "ChangeMe123!",
      nodeEnv: "production",
    }),
    true,
  );
});

test("does not affect local development fixtures", () => {
  assert.equal(
    isPublishedSeedCredential({
      email: "admin@exportunity.local",
      password: "ChangeMe123!",
      nodeEnv: "development",
    }),
    false,
  );
});

test("does not block unrelated accounts or passwords", () => {
  assert.equal(
    isPublishedSeedCredential({
      email: "owner@exportunity.net",
      password: "ChangeMe123!",
      nodeEnv: "production",
    }),
    false,
  );
  assert.equal(
    isPublishedSeedCredential({
      email: "admin@exportunity.local",
      password: "a-rotated-password",
      nodeEnv: "production",
    }),
    false,
  );
});
