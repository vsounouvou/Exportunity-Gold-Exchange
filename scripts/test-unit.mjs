#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

async function collectSourceFiles(dirPath, output = []) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      await collectSourceFiles(entryPath, output);
      continue;
    }
    if (/\.(ts|tsx|js|jsx|json)$/.test(entry.name)) {
      output.push(entryPath);
    }
  }
  return output;
}

function findMojibakeLine(text) {
  const forbiddenCodepoints = new Set([0x00c3, 0x00d8, 0x00d9, 0xfffd]);
  const lines = text.split(/\r?\n/);
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    const chars = Array.from(line);
    if (chars.some((char) => forbiddenCodepoints.has(char.codePointAt(0)))) {
      return { line: lineIndex + 1, text: line.trim().slice(0, 180) };
    }
    const codepoints = chars.map((char) => char.codePointAt(0));
    for (let i = 0; i < codepoints.length - 1; i += 1) {
      if (
        (codepoints[i] === 0x00e2 && codepoints[i + 1] === 0x20ac) ||
        (codepoints[i] === 0x00f0 && codepoints[i + 1] === 0x0178) ||
        (codepoints[i] === 0x00ef && codepoints[i + 1] === 0x00b8)
      ) {
        return { line: lineIndex + 1, text: line.trim().slice(0, 180) };
      }
    }
  }
  return null;
}

async function main() {
  const repoRoot = process.cwd();

  // 1) Exportunity library content uses local thumbnails.
  {
    const libraryPath = path.join(repoRoot, "client", "src", "content", "exportunity", "library.json");
    assert.ok(await pathExists(libraryPath), `Missing ${libraryPath}`);

    const payload = await readJson(libraryPath);
    const items = Array.isArray(payload?.items) ? payload.items : [];
    assert.ok(items.length > 0, "library.json has no items");

    for (const item of items) {
      const thumb = String(item?.thumbnailLocal || item?.thumbnail || "").trim();
      if (!thumb) continue;
      assert.ok(
        thumb.startsWith("/assets/exportunity/"),
        `thumbnail must be local (got ${thumb})`,
      );
      const diskPath = path.join(repoRoot, "client", "public", thumb.replace(/^\/+/, ""));
      assert.ok(await pathExists(diskPath), `thumbnail missing on disk: ${diskPath}`);
    }
  }

  // 2) Legal HTML snapshots exist.
  {
    const privacy = path.join(repoRoot, "client", "public", "exportunity", "legal", "privacypolicy.html");
    const terms = path.join(repoRoot, "client", "public", "exportunity", "legal", "termsofservice.html");
    assert.ok(await pathExists(privacy), `Missing ${privacy}`);
    assert.ok(await pathExists(terms), `Missing ${terms}`);
    const privacySize = (await fs.stat(privacy)).size;
    const termsSize = (await fs.stat(terms)).size;
    assert.ok(privacySize > 100, "privacypolicy.html looks too small");
    assert.ok(termsSize > 100, "termsofservice.html looks too small");
  }

  // 3) Public/admin UI text must not ship mojibake.
  {
    const clientSrc = path.join(repoRoot, "client", "src");
    const sourceFiles = await collectSourceFiles(clientSrc);
    for (const sourceFile of sourceFiles) {
      const raw = await fs.readFile(sourceFile, "utf8");
      const hit = findMojibakeLine(raw);
      assert.equal(
        hit,
        null,
        `mojibake found in ${path.relative(repoRoot, sourceFile)}:${hit?.line} ${hit?.text || ""}`,
      );
    }
  }

  console.log("[test:unit] ok");
}

main().catch((err) => {
  console.error("[test:unit] failed:", err?.message || err);
  process.exit(1);
});
