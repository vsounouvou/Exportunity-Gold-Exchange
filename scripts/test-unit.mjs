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

  console.log("[test:unit] ok");
}

main().catch((err) => {
  console.error("[test:unit] failed:", err?.message || err);
  process.exit(1);
});
