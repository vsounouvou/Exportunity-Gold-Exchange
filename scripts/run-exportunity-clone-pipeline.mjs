#!/usr/bin/env node
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

function nowIso() {
  return new Date().toISOString();
}

function isWindows() {
  return process.platform === "win32";
}

async function ensureDir(dirPath) {
  await fsp.mkdir(dirPath, { recursive: true });
}

function resolveNpmCliPath() {
  const raw = String(process.env.npm_execpath || "").trim();
  return raw || null;
}

function streamLine(stream, line) {
  try {
    stream.write(`${line}\n`);
  } catch {
    // ignore
  }
}

function spawnWithLogging({ cmd, args, cwd, env, logStream }) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    child.stdout?.on("data", (chunk) => {
      logStream.write(chunk);
    });
    child.stderr?.on("data", (chunk) => {
      logStream.write(chunk);
    });

    child.on("error", (err) => {
      streamLine(logStream, "");
      streamLine(logStream, `[runner] spawn error: ${err?.message || String(err)}`);
      resolve({ code: 1, error: err });
    });
    child.on("close", (code) => {
      resolve({ code: typeof code === "number" ? code : 1, error: null });
    });
  });
}

async function runNpmScript({ scriptName, cwd, logPath }) {
  await ensureDir(path.dirname(logPath));
  const logStream = fs.createWriteStream(logPath, { flags: "w" });
  try {
    streamLine(logStream, `# ${nowIso()}`);
    streamLine(logStream, `# cwd: ${cwd}`);
    streamLine(logStream, `# node: ${process.version}`);
    streamLine(logStream, `# platform: ${process.platform}`);

    const npmCli = resolveNpmCliPath();
    if (npmCli) {
      streamLine(logStream, `# cmd: node ${JSON.stringify(npmCli)} run ${scriptName}`);
      streamLine(logStream, "");
      const res = await spawnWithLogging({
        cmd: process.execPath,
        args: [npmCli, "run", scriptName],
        cwd,
        env: process.env,
        logStream,
      });
      return res.code;
    }

    // Fallback when npm_execpath is not available (e.g., running directly via node).
    // Prefer a shell-based invocation on Windows to ensure `npm.cmd` resolution.
    const cmd = isWindows() ? "cmd.exe" : "npm";
    const args = isWindows() ? ["/c", "npm", "run", scriptName] : ["run", scriptName];
    streamLine(logStream, `# cmd: ${cmd} ${args.map((a) => JSON.stringify(a)).join(" ")}`);
    streamLine(logStream, "");
    const res = await spawnWithLogging({ cmd, args, cwd, env: process.env, logStream });
    return res.code;
  } finally {
    await new Promise((r) => logStream.end(r));
  }
}

async function main() {
  const repoRoot = process.cwd();
  const logDir = path.resolve(repoRoot, "tmp", "clone-logs");

  const steps = [
    { scriptName: "crawl:exportunity", logFile: "crawl.log" },
    { scriptName: "mirror", logFile: "mirror.log" },
    { scriptName: "fetch-assets", logFile: "fetch-assets.log" },
    { scriptName: "sync:exportunity:legal", logFile: "sync-legal.log" },
    { scriptName: "sync:exportunity:library", logFile: "sync-library.log" },
    { scriptName: "sync:exportunity:posts", logFile: "sync-posts.log" },
    { scriptName: "link-check", logFile: "link-check.log" },
    { scriptName: "assets:verify", logFile: "assets-verify.log" },
    { scriptName: "seo:verify", logFile: "seo-verify.log" },
    { scriptName: "check", logFile: "check.log" },
    { scriptName: "test:unit", logFile: "test-unit.log" },
  ];

  await ensureDir(logDir);

  for (const step of steps) {
    const logPath = path.join(logDir, step.logFile);
    console.log(`[clone:exportunity:all] running ${step.scriptName} -> ${path.relative(repoRoot, logPath)}`);
    const code = await runNpmScript({ scriptName: step.scriptName, cwd: repoRoot, logPath });
    if (code !== 0) {
      console.error(`[clone:exportunity:all] FAILED step=${step.scriptName} exit=${code} log=${logPath}`);
      process.exit(code);
    }
  }

  console.log(`[clone:exportunity:all] ok logs=${path.relative(repoRoot, logDir)}`);
}

main().catch((err) => {
  console.error("[clone:exportunity:all] failed:", err?.message || err);
  process.exit(1);
});

