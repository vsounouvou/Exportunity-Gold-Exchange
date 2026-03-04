import { runActionWorkerOnce } from "../lib/actions/worker";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const intervalMsRaw = String(process.env.ACTIONS_WORKER_INTERVAL_MS || "").trim();
const intervalMs = intervalMsRaw ? Math.max(250, Number(intervalMsRaw)) : 2000;
const once = process.argv.includes("--once") || String(process.env.ACTIONS_WORKER_ONCE || "").trim() === "true";

let shouldStop = false;
process.on("SIGINT", () => {
  shouldStop = true;
});
process.on("SIGTERM", () => {
  shouldStop = true;
});

async function main() {
  console.log(`[actions-worker] start (once=${once}, intervalMs=${intervalMs})`);

  if (once) {
    const res = await runActionWorkerOnce();
    console.log("[actions-worker] runOnce:", res);
    return;
  }

  while (!shouldStop) {
    const res = await runActionWorkerOnce();
    if (res.processed > 0) {
      console.log("[actions-worker] processed:", res);
      continue;
    }
    await sleep(intervalMs);
  }

  console.log("[actions-worker] stop");
}

main().catch((err) => {
  console.error("[actions-worker] fatal:", err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});

