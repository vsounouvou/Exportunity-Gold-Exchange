#!/usr/bin/env node
import { spawn } from "node:child_process";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolvePort() {
  const raw = Number.parseInt(String(process.env.MARKETING_QUALITY_GATE_PORT || ""), 10);
  if (Number.isFinite(raw) && raw > 0) return Math.trunc(raw);
  return 5100 + Math.floor(Math.random() * 700);
}

async function waitForReady(url, timeoutMs) {
  const start = Date.now();
  let lastError = null;
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { method: "GET", redirect: "manual" });
      if (res.status >= 200 && res.status < 400) return;
      lastError = new Error(`status ${res.status}`);
    } catch (error) {
      lastError = error;
    }
    await sleep(600);
  }
  const reason = lastError?.message || "unknown error";
  throw new Error(`Timed out waiting for server readiness at ${url} (${reason})`);
}

function killProcess(child) {
  if (!child || child.killed) return;
  try {
    child.kill();
  } catch {
    // ignore
  }
}

async function waitForExit(child, timeoutMs) {
  if (!child) return true;
  if (child.exitCode != null) return true;

  return await new Promise((resolve) => {
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
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
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      env,
      shell: false,
    });
    child.on("error", reject);
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

async function main() {
  if (String(process.env.SKIP_MARKETING_QUALITY_GATE || "").trim() === "1") {
    console.log("[marketing-quality-gate] skipped via SKIP_MARKETING_QUALITY_GATE=1");
    return;
  }

  const port = resolvePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const npmBin = process.platform === "win32" ? "npm.cmd" : "npm";
  const auditDatabaseUrl =
    process.env.DATABASE_URL || "postgres://quality-gate:quality-gate@127.0.0.1:5432/quality-gate";

  const serverScript = [
    "process.env.NODE_ENV='production';",
    `process.env.PORT='${port}';`,
    "process.env.STARTUP_MODE='marketing-audit';",
    "import('./dist/index.js');",
  ].join(" ");

  const server = spawn(process.execPath, ["--input-type=module", "-e", serverScript], {
    stdio: "inherit",
    env: {
      ...process.env,
      DATABASE_URL: auditDatabaseUrl,
      PORT: String(port),
      NODE_ENV: "production",
      STARTUP_MODE: "marketing-audit",
    },
  });

  const cleanup = async () => {
    if (!server || server.exitCode != null) return;
    killProcess(server);
    const exited = await waitForExit(server, 1500);
    if (!exited && server.exitCode == null) {
      if (process.platform === "win32" && server.pid) {
        try {
          await runCommand("taskkill", ["/PID", String(server.pid), "/T", "/F"], process.env);
        } catch {
          // ignore
        }
      } else {
        try {
          server.kill("SIGKILL");
        } catch {
          // ignore
        }
      }
    }
  };

  const signals = ["SIGINT", "SIGTERM"];
  const handlers = new Map();
  for (const sig of signals) {
    const handler = async () => {
      await cleanup();
      process.exit(130);
    };
    handlers.set(sig, handler);
    process.on(sig, handler);
  }

  try {
    await waitForReady(`${baseUrl}/`, 60_000);
    const exitCode = await runCommand(
      npmBin,
      ["run", "audit:site"],
      { ...process.env, MARKETING_AUDIT_BASE_URL: baseUrl, MARKETING_AUDIT_FORCE_MARKETING: "1" },
    );
    if (exitCode !== 0) {
      throw new Error(`audit failed with exit code ${exitCode}`);
    }
    console.log("[marketing-quality-gate] ok");
  } finally {
    for (const [sig, handler] of handlers.entries()) {
      process.off(sig, handler);
    }
    await cleanup();
  }
}

main().catch((error) => {
  console.error("[marketing-quality-gate] FAILED:", error?.message || error);
  process.exit(1);
});
