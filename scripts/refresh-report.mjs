#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";

async function readJsonIfExists(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function collectTextFiles(rootDir, out = []) {
  if (!(await pathExists(rootDir))) return out;
  const stack = [rootDir];
  while (stack.length) {
    const current = stack.pop();
    if (!current) continue;
    let entries = [];
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!/\.(?:html|css|js|mjs|json|md|txt|tsx?|jsx?)$/i.test(entry.name)) continue;
      out.push(full);
    }
  }
  return out;
}

async function containsRayonWorld(repoRoot) {
  const targets = [
    path.resolve(repoRoot, "dist", "public"),
    path.resolve(repoRoot, "client", "public", "exportunity"),
    path.resolve(repoRoot, "client", "src", "pages", "exportunity"),
    path.resolve(repoRoot, "client", "src", "components", "exportunity"),
    path.resolve(repoRoot, "client", "src", "content", "exportunity"),
  ];

  const files = [];
  for (const dir of targets) await collectTextFiles(dir, files);

  for (const filePath of files) {
    const normalized = filePath.replace(/\\/g, "/").toLowerCase();
    if (normalized.includes("/assets/original/")) continue;
    try {
      const text = await fs.readFile(filePath, "utf8");
      if (String(text || "").toLowerCase().includes("rayon.world")) {
        return true;
      }
    } catch {
      // ignore
    }
  }

  return false;
}

function nowIso() {
  return new Date().toISOString();
}

async function main() {
  const repoRoot = process.cwd();
  const crawlDir = path.resolve(repoRoot, "crawl");
  const outPath = path.resolve(repoRoot, "crawl", "refresh-report.md");

  const assetsDeep = await readJsonIfExists(path.join(crawlDir, "assets-deep.json"), []);
  const assetMap = await readJsonIfExists(path.join(crawlDir, "asset-map.json"), {});
  const hashIndex = await readJsonIfExists(path.join(crawlDir, "asset-hash-index.json"), {});
  const failures = await readJsonIfExists(path.join(crawlDir, "asset-failures.json"), []);

  const hashEntries = Object.entries(hashIndex || {}).map(([hash, value]) => ({
    hash,
    localPath: String(value?.local_path || ""),
    size: Number(value?.size || 0),
    contentType: String(value?.content_type || ""),
  }));
  hashEntries.sort((a, b) => b.size - a.size || a.hash.localeCompare(b.hash));

  const rayonPresent = await containsRayonWorld(repoRoot);

  const lines = [];
  lines.push("# Exportunity clone refresh report");
  lines.push("");
  lines.push(`- Generated: ${nowIso()}`);
  lines.push(`- Images found (deep extractor): ${Array.isArray(assetsDeep) ? assetsDeep.length : 0}`);
  lines.push(`- Remote URLs mapped: ${Object.keys(assetMap || {}).length}`);
  lines.push(`- Assets downloaded (unique by hash): ${hashEntries.length}`);
  lines.push(`- Failed downloads: ${Array.isArray(failures) ? failures.length : 0}`);
  lines.push(`- rayon.world absent: ${rayonPresent ? "NO" : "YES"}`);
  lines.push("");

  lines.push("## Top 20 largest assets");
  for (const item of hashEntries.slice(0, 20)) {
    lines.push(`- ${item.localPath} | ${item.size} bytes | ${item.contentType} | ${item.hash}`);
  }
  if (!hashEntries.length) {
    lines.push("- none");
  }
  lines.push("");

  lines.push("## Failures");
  const failureList = Array.isArray(failures) ? failures : [];
  if (!failureList.length) {
    lines.push("- none");
  } else {
    for (const failure of failureList.slice(0, 200)) {
      const route = String(failure?.source_route || "n/a");
      const remoteUrl = String(failure?.remote_url || failure?.candidate_url || "n/a");
      const reason = String(failure?.reason || "unknown");
      const status = Number(failure?.status || 0);
      lines.push(`- [${status}] ${reason} | route=${route} | url=${remoteUrl}`);
    }
    if (failureList.length > 200) {
      lines.push(`- ... ${failureList.length - 200} more`);
    }
  }
  lines.push("");

  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, lines.join("\n") + "\n", "utf8");
  console.log(`[refresh-report] wrote ${path.relative(repoRoot, outPath)}`);
}

main().catch((error) => {
  console.error("[refresh-report] failed:", error?.message || error);
  process.exit(1);
});
