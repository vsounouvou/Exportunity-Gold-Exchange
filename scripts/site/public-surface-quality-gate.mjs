#!/usr/bin/env node
import { spawn } from "node:child_process";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolvePort() {
  const raw = Number.parseInt(String(process.env.PUBLIC_SURFACE_QUALITY_GATE_PORT || ""), 10);
  if (Number.isFinite(raw) && raw > 0) return Math.trunc(raw);
  return 5100 + Math.floor(Math.random() * 700);
}

async function waitForReady(url, timeoutMs) {
  const start = Date.now();
  let lastError = null;
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url, { method: "GET", redirect: "manual" });
      if (response.status >= 200 && response.status < 400) return;
      lastError = new Error(`status ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await sleep(600);
  }
  throw new Error(`Timed out waiting for ${url} (${lastError?.message || "unknown error"})`);
}

async function waitForExit(child, timeoutMs) {
  if (!child || child.exitCode != null) return true;
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    child.once("exit", () => {
      clearTimeout(timer);
      finish(true);
    });
  });
}

async function runCommand(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", env, shell: false });
    child.on("error", reject);
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

async function main() {
  if (String(process.env.SKIP_PUBLIC_SURFACE_QUALITY_GATE || "").trim() === "1") {
    console.log("[public-surface-quality-gate] skipped via SKIP_PUBLIC_SURFACE_QUALITY_GATE=1");
    return;
  }

  const port = resolvePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const npmCli = String(process.env.npm_execpath || "").trim();
  const auditDatabaseUrl =
    process.env.DATABASE_URL || "postgres://quality-gate:quality-gate@127.0.0.1:5432/quality-gate";
  const serverScript = [
    "process.env.NODE_ENV='production';",
    `process.env.PORT='${port}';`,
    "process.env.STARTUP_MODE='public-surface-audit';",
    "import('./dist/index.js');",
  ].join(" ");

  const server = spawn(process.execPath, ["--input-type=module", "-e", serverScript], {
    stdio: "inherit",
    env: {
      ...process.env,
      DATABASE_URL: auditDatabaseUrl,
      PORT: String(port),
      NODE_ENV: "production",
      STARTUP_MODE: "public-surface-audit",
      APP_NAME: process.env.APP_NAME || "exportunity",
      DEPLOY_TENANT: process.env.DEPLOY_TENANT || "exportunity",
      TENANT_DEFAULT: process.env.TENANT_DEFAULT || "exportunity",
    },
  });

  const cleanup = async () => {
    if (!server || server.exitCode != null) return;
    try {
      server.kill();
    } catch {
      // Continue to the forced cleanup below.
    }
    const exited = await waitForExit(server, 1500);
    if (exited || server.exitCode != null) return;
    if (process.platform === "win32" && server.pid) {
      await runCommand("taskkill", ["/PID", String(server.pid), "/T", "/F"], process.env).catch(() => 1);
    } else {
      try {
        server.kill("SIGKILL");
      } catch {
        // Process already exited.
      }
    }
  };

  const handlers = new Map();
  for (const signal of ["SIGINT", "SIGTERM"]) {
    const handler = async () => {
      await cleanup();
      process.exit(130);
    };
    handlers.set(signal, handler);
    process.on(signal, handler);
  }

  try {
    await waitForReady(`${baseUrl}/`, 60_000);
    const auditCommand = npmCli ? process.execPath : process.platform === "win32" ? "cmd.exe" : "npm";
    const auditArgs = npmCli
      ? [npmCli, "run", "audit:site"]
      : process.platform === "win32"
        ? ["/c", "npm", "run", "audit:site"]
        : ["run", "audit:site"];
    const exitCode = await runCommand(auditCommand, auditArgs, {
      ...process.env,
      PUBLIC_SURFACE_AUDIT_BASE_URL: baseUrl,
    });
    if (exitCode !== 0) throw new Error(`audit failed with exit code ${exitCode}`);
    console.log("[public-surface-quality-gate] ok");
  } finally {
    for (const [signal, handler] of handlers.entries()) process.off(signal, handler);
    await cleanup();
  }
}

main().catch((error) => {
  console.error("[public-surface-quality-gate] FAILED:", error?.message || error);
  process.exit(1);
});
