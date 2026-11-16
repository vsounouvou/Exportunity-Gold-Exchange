import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";
import { createFixtureGuard, runTassiRoleContracts } from "./tassi-role-contracts.mjs";

test("routing agrees with the unchanged server guard on fixture accounts", async () => {
  const serverSource = await readFile(new URL("../../server/routes/utils/chairman-console-auth.ts", import.meta.url), "utf8");
  const noImports = serverSource.replace(/^import .*;\r?\n/gm, "");
  const serverJavaScript = stripTypeScriptTypes(noImports, { mode: "strip" }).replace(/^export /gm, "");
  const routingSource = await readFile(new URL("../../client/src/lib/workspaceEntry.ts", import.meta.url), "utf8");
  const routing = await import("data:text/javascript;base64," + Buffer.from(routingSource).toString("base64"));
  const result = await runTassiRoleContracts(routing, (fixture) => createFixtureGuard(serverJavaScript, fixture),
    (condition, message) => assert.ok(condition, message));
  assert.deepEqual(result, { roleFixtures: 9, checks: 32 });
});
