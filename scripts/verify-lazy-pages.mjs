import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const appPath = path.join(rootDir, "client", "src", "App.tsx");

function fail(message) {
  // eslint-disable-next-line no-console
  console.error(`[routes:verify] ${message}`);
  process.exitCode = 1;
}

function indexToLine(source, index) {
  // 1-based line number
  let line = 1;
  for (let i = 0; i < index && i < source.length; i += 1) {
    if (source.charCodeAt(i) === 10) line += 1;
  }
  return line;
}

function findMatchingParen(source, openParenIndex) {
  let depth = 0;
  let quote = null;
  let escaped = false;

  for (let i = openParenIndex; i < source.length; i += 1) {
    const ch = source[i];

    if (quote) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === quote) {
        quote = null;
      }
      continue;
    }

    if (ch === "'" || ch === '"' || ch === "`") {
      quote = ch;
      continue;
    }

    if (ch === "(") depth += 1;
    if (ch === ")") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }

  return -1;
}

function resolveModuleSpecifier(spec, importerFile) {
  const raw = String(spec || "").trim();
  if (!raw) return null;

  if (raw.startsWith("@/")) {
    return path.join(rootDir, "client", "src", raw.slice(2));
  }

  if (raw.startsWith("./") || raw.startsWith("../")) {
    return path.resolve(path.dirname(importerFile), raw);
  }

  // Unknown alias (e.g. @platform/*). Skip.
  return null;
}

function resolveExistingFile(basePath) {
  const candidates = [];
  const hasExt = path.extname(basePath);
  if (hasExt) candidates.push(basePath);
  candidates.push(`${basePath}.tsx`, `${basePath}.ts`, `${basePath}.jsx`, `${basePath}.js`);
  candidates.push(
    path.join(basePath, "index.tsx"),
    path.join(basePath, "index.ts"),
    path.join(basePath, "index.jsx"),
    path.join(basePath, "index.js"),
  );

  for (const p of candidates) {
    if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
  }
  return null;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasDefaultExport(source) {
  return /\bexport\s+default\b/.test(source);
}

function hasNamedExport(source, exportName) {
  const name = escapeRegExp(exportName);
  const decl = new RegExp(`\\bexport\\s+(?:async\\s+)?(?:function|class|const|let|var)\\s+${name}\\b`);
  if (decl.test(source)) return true;

  const exportedList = new RegExp(`\\bexport\\s*\\{[^}]*\\b${name}\\b[^}]*\\}`, "s");
  if (exportedList.test(source)) return true;

  const defaultAs = new RegExp(`\\bexport\\s*\\{[^}]*\\bdefault\\s+as\\s+${name}\\b[^}]*\\}`, "s");
  if (defaultAs.test(source)) return true;

  return false;
}

if (!fs.existsSync(appPath)) {
  fail(`Missing App file: ${appPath}`);
  process.exit(1);
}

const appSource = fs.readFileSync(appPath, "utf8");
const issues = [];

let cursor = 0;
while (true) {
  const at = appSource.indexOf("lazyPage(", cursor);
  if (at === -1) break;

  const openParen = at + "lazyPage".length;
  const closeParen = findMatchingParen(appSource, openParen);
  if (closeParen === -1) {
    issues.push({ line: indexToLine(appSource, at), message: "Could not parse lazyPage() call (missing ')')." });
    break;
  }

  const args = appSource.slice(openParen + 1, closeParen);
  const importMatch = args.match(/\bimport\s*\(\s*(['"`])([^'"`]+)\1\s*\)/);
  if (!importMatch) {
    cursor = closeParen + 1;
    continue;
  }

  const specifier = importMatch[2];
  const afterImport = args.slice(importMatch.index + importMatch[0].length);
  const exportMatch = afterImport.match(/,\s*(['"`])([^'"`]+)\1/);
  const exportName = exportMatch ? exportMatch[2] : null;
  const line = indexToLine(appSource, at);

  const resolvedBase = resolveModuleSpecifier(specifier, appPath);
  if (!resolvedBase) {
    cursor = closeParen + 1;
    continue;
  }

  const resolvedFile = resolveExistingFile(resolvedBase);
  if (!resolvedFile) {
    issues.push({ line, message: `Missing module for ${specifier}` });
    cursor = closeParen + 1;
    continue;
  }

  const modSource = fs.readFileSync(resolvedFile, "utf8");
  if (exportName) {
    if (!hasNamedExport(modSource, exportName)) {
      issues.push({
        line,
        message: `Expected named export "${exportName}" from ${path.relative(rootDir, resolvedFile)} (imported as ${specifier})`,
      });
    }
  } else if (!hasDefaultExport(modSource)) {
    issues.push({
      line,
      message: `Expected default export from ${path.relative(rootDir, resolvedFile)} (imported as ${specifier})`,
    });
  }

  cursor = closeParen + 1;
}

const governanceLazyPattern =
  /const\s+AdminAgentGovernancePage\s*=\s*lazyPage\(\s*\(\)\s*=>\s*import\((['"`])@\/pages\/AdminAgentGovernancePage\1\)\s*,\s*(['"`])AdminAgentGovernancePage\2/s;
if (!governanceLazyPattern.test(appSource)) {
  issues.push({
    line: 1,
    message:
      'Admin governance route must lazy-load "@/pages/AdminAgentGovernancePage" via named export "AdminAgentGovernancePage".',
  });
}

if (issues.length) {
  fail(`${issues.length} lazy route export issue(s) found:`);
  for (const issue of issues) {
    // eslint-disable-next-line no-console
    console.error(`- App.tsx:${issue.line} ${issue.message}`);
  }
  process.exit(1);
}

// eslint-disable-next-line no-console
console.log("[routes:verify] OK");
