#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { parseDocument } from "htmlparser2";
import { getAttributeValue } from "domutils";

function clampInt(value, min, max, fallback) {
  const n = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function stripHashQuery(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return raw.split("#")[0]?.split("?")[0]?.trim() || "";
}

function isExternalRef(value) {
  const v = String(value || "").trim().toLowerCase();
  if (!v) return true;
  if (v.startsWith("#")) return true;
  if (v.startsWith("http://") || v.startsWith("https://") || v.startsWith("//")) return true;
  if (v.startsWith("mailto:") || v.startsWith("tel:") || v.startsWith("javascript:")) return true;
  if (v.startsWith("data:")) return true;
  return false;
}

function shouldIgnoreInternalRef(value) {
  const clean = stripHashQuery(value).replace(/^(\.\.\/)+/, "").replace(/^\//, "");
  if (!clean) return false;
  // Mirror output may contain member-only/community links that are out of scope for a public clone.
  if (clean.startsWith("profile/")) return true;
  return false;
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function isWithinRoot(rootDir, targetPath) {
  const rel = path.relative(rootDir, targetPath);
  if (!rel) return true;
  return !rel.startsWith("..") && !path.isAbsolute(rel);
}

function resolveLocalTarget({ rootDir, fromDir, ref }) {
  const clean = stripHashQuery(ref);
  if (!clean || isExternalRef(clean)) return null;
  if (shouldIgnoreInternalRef(clean)) return null;

  const raw = clean.startsWith("/") ? clean.slice(1) : clean;
  const direct = clean.startsWith("/") ? path.join(rootDir, raw) : path.resolve(fromDir, raw);

  const candidates = [];
  candidates.push(direct);
  if (!path.extname(direct)) {
    candidates.push(path.join(direct, "index.html"));
  }
  return { ref: clean, candidates };
}

async function walk(dir, out) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(full, out);
      continue;
    }
    if (entry.isFile() && entry.name.toLowerCase().endsWith(".html")) {
      out.push(full);
    }
  }
}

function extractRefs(node, refs) {
  if (!node) return;
  if (Array.isArray(node)) {
    for (const child of node) extractRefs(child, refs);
    return;
  }

  if (node.type === "tag") {
    const tag = String(node.name || "").toLowerCase();
    if (tag === "a") {
      const href = getAttributeValue(node, "href");
      if (href) refs.push({ kind: "link", value: String(href) });
    }
    if (tag === "img" || tag === "script") {
      const src = getAttributeValue(node, "src");
      if (src) refs.push({ kind: "asset", value: String(src) });
    }
    if (tag === "link") {
      const href = getAttributeValue(node, "href");
      if (href) refs.push({ kind: "asset", value: String(href) });
    }
  }

  if (node.children && node.children.length) {
    for (const child of node.children) extractRefs(child, refs);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const rootFlag = args.findIndex((a) => a === "--root");
  const root = rootFlag >= 0 ? args[rootFlag + 1] : "client/public/exportunity";
  const maxErrorsFlag = args.findIndex((a) => a === "--max-errors");
  const maxErrors = clampInt(maxErrorsFlag >= 0 ? args[maxErrorsFlag + 1] : undefined, 1, 10_000, 250);

  const mirrorRoot = path.resolve(process.cwd(), root);
  const pagesRoot = (await pathExists(path.join(mirrorRoot, "www.exportunity.com")))
    ? path.join(mirrorRoot, "www.exportunity.com")
    : mirrorRoot;
  const htmlFiles = [];

  if (!(await pathExists(mirrorRoot))) {
    console.error(`[link-check] missing rootDir=${mirrorRoot}`);
    console.error(`[link-check] run: npm run mirror (or set --root mirror)`);
    process.exit(2);
  }

  await walk(pagesRoot, htmlFiles);
  if (!htmlFiles.length) {
    console.error(`[link-check] no .html files under ${pagesRoot}`);
    process.exit(2);
  }

  const broken = [];
  let checkedRefs = 0;

  for (const filePath of htmlFiles) {
    const html = await fs.readFile(filePath, "utf8");
    const doc = parseDocument(html);
    const refs = [];
    extractRefs(doc, refs);

    const fromDir = path.dirname(filePath);

    for (const ref of refs) {
      const resolved = resolveLocalTarget({ rootDir: mirrorRoot, fromDir, ref: ref.value });
      if (!resolved) continue;
      checkedRefs += 1;

      const matches = [];
      for (const candidate of resolved.candidates) {
        if (!isWithinRoot(mirrorRoot, candidate)) continue;
        if (await pathExists(candidate)) matches.push(candidate);
      }

      if (!matches.length) {
        broken.push({
          file: path.relative(pagesRoot, filePath).replace(/\\/g, "/"),
          kind: ref.kind,
          ref: resolved.ref,
          tried: resolved.candidates
            .map((p) => path.relative(mirrorRoot, p).replace(/\\/g, "/"))
            .filter((p) => p && !p.startsWith("..")),
        });
        if (broken.length >= maxErrors) {
          break;
        }
      }
    }

    if (broken.length >= maxErrors) {
      break;
    }
  }

  if (!broken.length) {
    console.log(`[link-check] ok html=${htmlFiles.length} refs=${checkedRefs}`);
    return;
  }

  const byKind = broken.reduce((acc, item) => {
    acc[item.kind] = (acc[item.kind] || 0) + 1;
    return acc;
  }, {});

  console.error(`[link-check] broken count=${broken.length} html=${htmlFiles.length} refs=${checkedRefs}`);
  console.error(`[link-check] breakdown ${JSON.stringify(byKind)}`);
  for (const item of broken.slice(0, 25)) {
    console.error(`- ${item.file}: ${item.kind} ${item.ref}`);
  }
  if (broken.length > 25) {
    console.error(`... (${broken.length - 25} more)`);
  }
  process.exit(1);
}

main().catch((err) => {
  console.error("[link-check] failed:", err?.message || err);
  process.exit(1);
});
