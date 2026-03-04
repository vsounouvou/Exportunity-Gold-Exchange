#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as ts from "typescript";

const repoRoot = process.cwd();

const alias = [
  ["@db", path.join(repoRoot, "db")],
  ["@", path.join(repoRoot, "client", "src")],
  ["@platform", path.join(repoRoot, "client", "src", "platform")],
  ["@pkg/ui", path.join(repoRoot, "client", "src", "components", "ui")],
  ["@pkg/branding", path.join(repoRoot, "client", "src", "components", "branding")],
];

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function resolveFileOrDir(basePath) {
  const clean = basePath;

  // Try common extensions when specifier omitted it.
  if (!path.extname(clean)) {
    const exts = [".ts", ".tsx", ".js", ".mjs", ".cjs", ".json"];
    for (const ext of exts) {
      const candidate = `${clean}${ext}`;
      if (await exists(candidate)) return candidate;
    }
  }

  // Exact file.
  try {
    const stat = await fs.stat(clean);
    if (stat.isFile()) return clean;
  } catch {
    // ignore
  }

  // Directory index.
  try {
    const stat = await fs.stat(clean);
    if (stat.isDirectory()) {
      const indexCandidates = ["index.ts", "index.tsx", "index.js", "index.mjs", "index.cjs"];
      for (const name of indexCandidates) {
        const candidate = path.join(clean, name);
        if (await exists(candidate)) return candidate;
      }
    }
  } catch {
    // ignore
  }

  return null;
}

async function resolveWithAliases(specifier, parentURL) {
  const raw = String(specifier || "");

  for (const [key, target] of alias) {
    if (raw === key || raw.startsWith(`${key}/`)) {
      const rest = raw === key ? "" : raw.slice(key.length + 1);
      const candidateBase = rest ? path.join(target, rest) : target;
      const resolved = await resolveFileOrDir(candidateBase);
      if (resolved) return pathToFileURL(resolved).href;
    }
  }

  // Handle relative imports without extensions for TS sources.
  if (raw.startsWith("./") || raw.startsWith("../")) {
    const parentPath = parentURL ? fileURLToPath(parentURL) : null;
    const parentDir = parentPath ? path.dirname(parentPath) : repoRoot;
    const candidateBase = path.resolve(parentDir, raw);
    const resolved = await resolveFileOrDir(candidateBase);
    if (resolved) return pathToFileURL(resolved).href;
  }

  return null;
}

export async function resolve(specifier, context, defaultResolve) {
  if (specifier.startsWith("node:") || specifier.startsWith("data:")) {
    return defaultResolve(specifier, context, defaultResolve);
  }

  const aliasResolved = await resolveWithAliases(specifier, context.parentURL);
  if (aliasResolved) return { url: aliasResolved, shortCircuit: true };

  // Fall back to Node's default resolver.
  return defaultResolve(specifier, context, defaultResolve);
}

export async function load(url, context, defaultLoad) {
  if (url.startsWith("node:") || url.startsWith("data:")) {
    return defaultLoad(url, context, defaultLoad);
  }

  if (url.endsWith(".ts") || url.endsWith(".tsx")) {
    const filename = fileURLToPath(url);
    const source = await fs.readFile(filename, "utf8");
    const isTsx = url.endsWith(".tsx");

    const result = ts.transpileModule(source, {
      fileName: filename,
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        jsx: isTsx ? ts.JsxEmit.ReactJSX : undefined,
        sourceMap: true,
        inlineSources: true,
      },
    });

    return { format: "module", source: result.outputText, shortCircuit: true };
  }

  return defaultLoad(url, context, defaultLoad);
}
