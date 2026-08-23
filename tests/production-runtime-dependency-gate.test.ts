import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("the production bundle keeps the Vite toolchain behind a development-only boundary", () => {
  const source = readFileSync(new URL("../server/vite.ts", import.meta.url), "utf8");

  assert.doesNotMatch(source, /^import .* from "vite";/m);
  assert.doesNotMatch(source, /^import .* from "\.\.\/vite\.config";/m);
  assert.match(source, /const viteModuleSpecifier = "vite";/);
  assert.match(source, /import\(viteModuleSpecifier\)/);
  assert.match(source, /import\(viteConfigModuleSpecifier\)/);
});

test("the final Docker image resolves every static server import before activation", () => {
  const dockerfile = readFileSync(new URL("../Dockerfile", import.meta.url), "utf8");
  const verifier = readFileSync(
    new URL("../scripts/verify-production-runtime-deps.mjs", import.meta.url),
    "utf8",
  );

  assert.match(
    dockerfile,
    /RUN node --no-warnings --experimental-vm-modules scripts\/verify-production-runtime-deps\.mjs/,
  );
  assert.match(verifier, /new SourceTextModule\(/);
  assert.match(verifier, /parsedModule\.moduleRequests/);
  assert.match(verifier, /requireFromEntry\.resolve\(specifier\)/);
});
