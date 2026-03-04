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

function resolveNpmCliPath() {
  const raw = String(process.env.npm_execpath || "").trim();
  return raw || null;
}

async function pathExists(filePath) {
  try {
    await fsp.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function ensureDir(dirPath) {
  await fsp.mkdir(dirPath, { recursive: true });
}

function writeLine(stream, line) {
  try {
    stream.write(`${line}\n`);
  } catch {
    // ignore
  }
}

function spawnWithLog({ cmd, args, cwd, env, logStream }) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    child.stdout?.on("data", (chunk) => logStream.write(chunk));
    child.stderr?.on("data", (chunk) => logStream.write(chunk));
    child.on("error", (error) => resolve({ code: 1, error }));
    child.on("close", (code) => resolve({ code: typeof code === "number" ? code : 1, error: null }));
  });
}

async function runNpmScript({ scriptName, cwd, logPath }) {
  await ensureDir(path.dirname(logPath));
  const logStream = fs.createWriteStream(logPath, { flags: "w" });
  try {
    writeLine(logStream, `# ${nowIso()}`);
    writeLine(logStream, `# script: ${scriptName}`);
    writeLine(logStream, `# cwd: ${cwd}`);

    const npmCli = resolveNpmCliPath();
    if (npmCli) {
      const result = await spawnWithLog({
        cmd: process.execPath,
        args: [npmCli, "run", scriptName],
        cwd,
        env: process.env,
        logStream,
      });
      return result.code;
    }

    const cmd = isWindows() ? "cmd.exe" : "npm";
    const args = isWindows() ? ["/c", "npm", "run", scriptName] : ["run", scriptName];
    const result = await spawnWithLog({
      cmd,
      args,
      cwd,
      env: process.env,
      logStream,
    });
    return result.code;
  } finally {
    await new Promise((resolve) => logStream.end(resolve));
  }
}

async function runShellCommand({ command, cwd, logPath }) {
  await ensureDir(path.dirname(logPath));
  const logStream = fs.createWriteStream(logPath, { flags: "w" });
  try {
    writeLine(logStream, `# ${nowIso()}`);
    writeLine(logStream, `# command: ${command}`);
    writeLine(logStream, `# cwd: ${cwd}`);

    const cmd = isWindows() ? "cmd.exe" : "sh";
    const args = isWindows() ? ["/c", command] : ["-lc", command];
    const result = await spawnWithLog({
      cmd,
      args,
      cwd,
      env: process.env,
      logStream,
    });
    return result.code;
  } finally {
    await new Promise((resolve) => logStream.end(resolve));
  }
}

async function restartService({ cwd, logDir }) {
  const customRestart = String(process.env.CLONE_REFRESH_RESTART_CMD || "").trim();
  if (customRestart) {
    const code = await runShellCommand({
      command: customRestart,
      cwd,
      logPath: path.join(logDir, "restart.log"),
    });
    if (code !== 0) throw new Error(`custom restart failed: ${customRestart}`);
    return "custom";
  }

  if (await pathExists(path.join(cwd, "docker-compose.yml"))) {
    const code = await runShellCommand({
      command: "docker compose up -d --build bdo-app",
      cwd,
      logPath: path.join(logDir, "restart.log"),
    });
    if (code === 0) return "docker";
  }

  if (!isWindows()) {
    const code = await runShellCommand({
      command: "systemctl restart exportunity-clone",
      cwd,
      logPath: path.join(logDir, "restart.log"),
    });
    if (code === 0) return "systemd";
  }

  if (String(process.env.CLONE_REFRESH_STRICT_RESTART || "").trim().toLowerCase() === "true") {
    throw new Error("unable to restart service (docker/systemd unavailable)");
  }

  return "none";
}

async function main() {
  const repoRoot = process.cwd();
  const logDir = path.resolve(repoRoot, "tmp", "clone-logs");
  await ensureDir(logDir);

  const scripts = [
    "crawl:exportunity",
    "mirror",
    "extract-assets-deep",
    "fetch-assets",
    "sync:exportunity:legal",
    "sync:exportunity:library",
    "sync:exportunity:posts",
    "sync:exportunity:gallery",
    "rewrite-assets",
    "no:rayon-world",
    "link-check",
    "assets:verify",
    "check",
    "build",
  ];

  for (const scriptName of scripts) {
    const logPath = path.join(logDir, `${scriptName.replace(/[:]/g, "-")}.log`);
    console.log(`[clone:exportunity:refresh] running ${scriptName}`);
    const code = await runNpmScript({ scriptName, cwd: repoRoot, logPath });
    if (code !== 0) {
      console.error(`[clone:exportunity:refresh] FAILED step=${scriptName} exit=${code} log=${path.relative(repoRoot, logPath)}`);
      process.exit(code);
    }
  }

  const restartMode = await restartService({ cwd: repoRoot, logDir });
  console.log(`[clone:exportunity:refresh] restart=${restartMode}`);

  const postScripts = ["smoke:marketing", "report:refresh"];
  for (const scriptName of postScripts) {
    const logPath = path.join(logDir, `${scriptName.replace(/[:]/g, "-")}.log`);
    console.log(`[clone:exportunity:refresh] running ${scriptName}`);
    const code = await runNpmScript({ scriptName, cwd: repoRoot, logPath });
    if (code !== 0) {
      console.error(`[clone:exportunity:refresh] FAILED step=${scriptName} exit=${code} log=${path.relative(repoRoot, logPath)}`);
      process.exit(code);
    }
  }

  console.log(`[clone:exportunity:refresh] ok logs=${path.relative(repoRoot, logDir)}`);
}

main().catch((error) => {
  console.error("[clone:exportunity:refresh] failed:", error?.message || error);
  process.exit(1);
});
