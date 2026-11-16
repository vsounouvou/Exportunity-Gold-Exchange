import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runContracts } from "./workspace-entry-contracts.mjs";

test("workspace entry and Tassi transport contracts with synthetic data", async () => {
  const routingSource = await readFile(new URL("../../client/src/lib/workspaceEntry.ts", import.meta.url), "utf8");
  const transportSource = await readFile(new URL("../../client/src/lib/tassiConversationApi.js", import.meta.url), "utf8");
  const importSource = (source) => import("data:text/javascript;base64," + Buffer.from(source).toString("base64"));
  const routing = await importSource(routingSource);
  const transport = await importSource(transportSource);
  const count = await runContracts(routing, transport, (condition, name) => assert.ok(condition, name));
  assert.ok(count >= 40);
});
