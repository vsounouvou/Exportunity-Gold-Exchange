#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { builtinModules, createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { SourceTextModule } from "node:vm";

const entryPath = path.resolve(process.cwd(), process.argv[2] || "dist/index.js");
const entryUrl = pathToFileURL(entryPath);
const source = readFileSync(entryPath, "utf8");
const parsedModule = new SourceTextModule(source, {
  identifier: entryUrl.href,
});

const builtinSpecifiers = new Set([
  ...builtinModules,
  ...builtinModules.map((name) => `node:${name}`),
]);
const staticSpecifiers = [
  ...new Set(parsedModule.moduleRequests.map(({ specifier }) => specifier)),
].sort();
const resolvableSpecifiers = staticSpecifiers.filter(
  (specifier) => !builtinSpecifiers.has(specifier),
);
const requireFromEntry = createRequire(entryUrl);
const missingSpecifiers = [];

for (const specifier of resolvableSpecifiers) {
  try {
    requireFromEntry.resolve(specifier);
  } catch {
    missingSpecifiers.push(specifier);
  }
}

if (missingSpecifiers.length > 0) {
  console.error(
    `[runtime-deps] unresolved static imports in ${path.relative(process.cwd(), entryPath)}: ${missingSpecifiers.join(", ")}`,
  );
  process.exit(1);
}

console.log(
  `[runtime-deps] OK (${staticSpecifiers.length} static imports; ${resolvableSpecifiers.length} resolved runtime files/packages)`,
);
