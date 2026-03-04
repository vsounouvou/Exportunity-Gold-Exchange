#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";

const TEXT_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".md", ".html", ".txt"]);

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function collectFiles(rootDir) {
  const out = [];
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
      const ext = path.extname(entry.name).toLowerCase();
      if (TEXT_EXT.has(ext)) out.push(full);
    }
  }
  return out;
}

function applyReplacements(text) {
  let next = String(text || "");
  const rules = [
    { re: /https?:\/\/(?:www\.)?rayon\.world\/?/gi, value: "https://exportunity.net/" },
    { re: /(?:www\.)?rayon\.world/gi, value: "exportunity.net" },
    { re: /\brayOn\b/g, value: "Exportunity Platform" },
    { re: /\bRAYON\b/g, value: "EXPORTUNITY PLATFORM" },
  ];

  let count = 0;
  for (const rule of rules) {
    next = next.replace(rule.re, () => {
      count += 1;
      return rule.value;
    });
  }

  return { text: next, count };
}

function hasBlockedToken(text) {
  const raw = String(text || "");
  return raw.includes("rayon.world") || raw.includes("rayOn");
}

async function main() {
  const repoRoot = process.cwd();
  const includeMirror = ["1", "true", "yes", "on"].includes(
    String(process.env.NO_RAYON_INCLUDE_MIRROR || "").trim().toLowerCase(),
  );
  const targets = [
    path.resolve(repoRoot, "client", "src"),
    path.resolve(repoRoot, "client", "public", "exportunity"),
    path.resolve(repoRoot, "server", "lib", "seo"),
    path.resolve(repoRoot, "content"),
  ];
  if (includeMirror) targets.push(path.resolve(repoRoot, "mirror", "www.exportunity.com"));

  const stats = {
    filesScanned: 0,
    filesUpdated: 0,
    replacements: 0,
  };
  const violations = [];

  for (const rootDir of targets) {
    const files = await collectFiles(rootDir);
    for (const filePath of files) {
      let raw;
      try {
        raw = await fs.readFile(filePath, "utf8");
      } catch {
        continue;
      }
      stats.filesScanned += 1;
      const replaced = applyReplacements(raw);
      if (replaced.count > 0 && replaced.text !== raw) {
        await fs.writeFile(filePath, replaced.text, "utf8");
        stats.filesUpdated += 1;
        stats.replacements += replaced.count;
      }
      if (hasBlockedToken(replaced.text)) {
        violations.push(path.relative(repoRoot, filePath));
      }
    }
  }

  if (violations.length) {
    console.error("[no-rayon-world] blocked references remain:");
    for (const item of violations.slice(0, 50)) console.error(`- ${item}`);
    if (violations.length > 50) console.error(`- ... ${violations.length - 50} more`);
    process.exit(1);
  }

  console.log(
    `[no-rayon-world] ok files_scanned=${stats.filesScanned} files_updated=${stats.filesUpdated} replacements=${stats.replacements}`,
  );
}

main().catch((error) => {
  console.error("[no-rayon-world] failed:", error?.message || error);
  process.exit(1);
});
