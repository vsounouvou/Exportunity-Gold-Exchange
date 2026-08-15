import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { cleanupOldAudioFiles } from "../server/lib/audioCleanup";

test("audio cleanup treats a missing directory as an empty state", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "exportunity-audio-cleanup-"));

  try {
    assert.equal(await cleanupOldAudioFiles(path.join(root, "not-created")), 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("audio cleanup removes expired mp3 files and preserves current files", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "exportunity-audio-cleanup-"));
  const audioDir = path.join(root, "audio");
  const expiredPath = path.join(audioDir, "expired.mp3");
  const currentPath = path.join(audioDir, "current.mp3");

  try {
    await mkdir(audioDir, { recursive: true });
    await writeFile(expiredPath, "expired");
    await writeFile(currentPath, "current");
    const expiredAt = new Date(Date.now() - 25 * 60 * 60 * 1000);
    await utimes(expiredPath, expiredAt, expiredAt);

    assert.equal(await cleanupOldAudioFiles(audioDir), 1);
    await assert.rejects(readFile(expiredPath), { code: "ENOENT" });
    assert.equal(await readFile(currentPath, "utf8"), "current");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
