import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("the optional Neon driver is not loaded by PostgreSQL-only runtimes", () => {
  const source = readFileSync(new URL("../db/index.ts", import.meta.url), "utf8");

  assert.doesNotMatch(source, /^import .*drizzle-orm\/neon-serverless/m);
  assert.match(source, /useNeon\s*\?\s*await import\("drizzle-orm\/neon-serverless"\)/);
  assert.match(source, /neonDriver\s*\?\s*neonDriver\.drizzle/);
});
