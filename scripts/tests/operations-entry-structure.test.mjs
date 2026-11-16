import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { verifyOperationsEntry } from "../lib/verify-operations-entry.mjs";
import { runOperationsStructureContracts } from "./operations-entry-structure-contracts.mjs";

test("operations route retains authentication, tenant isolation and Machinery context", async () => {
  const appSource = await readFile(new URL("../../client/src/App.tsx", import.meta.url), "utf8");
  const routingSource = await readFile(new URL("../../client/src/lib/workspaceEntry.ts", import.meta.url), "utf8");
  const routing = await import("data:text/javascript;base64," + Buffer.from(routingSource).toString("base64"));
  const passed = runOperationsStructureContracts(
    appSource,
    routing.workspaceOperationsEntry,
    verifyOperationsEntry,
    (condition, name) => assert.ok(condition, name),
  );
  assert.equal(passed, 9);
});
