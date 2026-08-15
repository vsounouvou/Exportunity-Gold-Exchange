import assert from "node:assert/strict";
import test from "node:test";

import express from "express";

import { registerUnknownApiHandler } from "../server/lib/http/unknownApiHandler";

test("unknown API routes return a non-cacheable JSON 404 without hiding registered routes", async (t) => {
  const app = express();
  app.get("/api/known", (_req, res) => res.json({ ok: true }));
  registerUnknownApiHandler(app);

  const server = app.listen(0, "127.0.0.1");
  t.after(() => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));

  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const known = await fetch(`${baseUrl}/api/known`);
  assert.equal(known.status, 200);
  assert.deepEqual(await known.json(), { ok: true });

  const unknown = await fetch(`${baseUrl}/api/.env`);
  assert.equal(unknown.status, 404);
  assert.equal(unknown.headers.get("content-type")?.startsWith("application/json"), true);
  assert.equal(unknown.headers.get("cache-control"), "no-store");
  assert.equal(unknown.headers.get("x-content-type-options"), "nosniff");
  assert.deepEqual(await unknown.json(), { message: "API route not found" });
});
