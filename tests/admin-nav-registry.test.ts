import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const registrySource = readFileSync(
  path.resolve(process.cwd(), "client/src/lib/adminNavRegistry.ts"),
  "utf8",
);

test("admin nav injects Agents OS route", () => {
  assert.match(registrySource, /const AGENTS_OS_ROUTE = "\/admin\/agents-os"/);
  assert.match(registrySource, /navEntryName: "Agents OS"/);
});

test("admin nav filters legacy scattered agent routes", () => {
  assert.match(registrySource, /LEGACY_AGENT_NAV_ROUTES/);
  assert.match(registrySource, /"\/agents"/);
  assert.match(registrySource, /"\/admin\/agents\/governance"/);
});
