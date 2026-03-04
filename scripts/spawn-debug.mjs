#!/usr/bin/env node
import path from "node:path";
import fs from "node:fs";
import childProcess from "node:child_process";

const MAX_LOGS = Number.parseInt(process.env.SPAWN_DEBUG_MAX || "50", 10);
let logged = 0;

function nowIso() {
  return new Date().toISOString();
}

function isWindows() {
  return process.platform === "win32";
}

function resolveExecutable(cmd) {
  const raw = String(cmd || "");
  if (!raw) return null;

  const hasSep = raw.includes("/") || raw.includes("\\");
  const extensions = isWindows() ? ["", ".exe", ".cmd", ".bat", ".com"] : [""];

  const tryPath = (p) => {
    try {
      if (fs.existsSync(p)) return p;
    } catch {
      // ignore
    }
    return null;
  };

  if (path.isAbsolute(raw) || hasSep) {
    for (const ext of extensions) {
      const hit = tryPath(raw.endsWith(ext) ? raw : `${raw}${ext}`);
      if (hit) return hit;
    }
    return null;
  }

  const pathEnv = String(process.env.PATH || "");
  const parts = pathEnv.split(isWindows() ? ";" : ":").filter(Boolean);
  for (const dir of parts) {
    for (const ext of extensions) {
      const candidate = path.join(dir, raw + ext);
      const hit = tryPath(candidate);
      if (hit) return hit;
    }
  }
  return null;
}

function safeJson(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function logSpawn(kind, command, args, options) {
  if (logged >= MAX_LOGS) return;
  logged += 1;

  const resolved = resolveExecutable(command);
  const cwd = options?.cwd ? String(options.cwd) : process.cwd();

  // Write to stderr so it is captured even when stdout is redirected.
  process.stderr.write(
    `[spawn-debug] ${nowIso()} ${kind} cmd=${safeJson(command)} resolved=${safeJson(resolved)} cwd=${safeJson(cwd)} args=${safeJson(args || [])}\n`,
  );
}

const originalSpawn = childProcess.spawn;
const originalSpawnSync = childProcess.spawnSync;

childProcess.spawn = function patchedSpawn(command, args, options) {
  logSpawn("spawn", command, args, options);
  return originalSpawn.call(this, command, args, options);
};

childProcess.spawnSync = function patchedSpawnSync(command, args, options) {
  logSpawn("spawnSync", command, args, options);
  return originalSpawnSync.call(this, command, args, options);
};

process.stderr.write(
  `[spawn-debug] enabled node=${process.version} platform=${process.platform} cwd=${process.cwd()}\n`,
);

