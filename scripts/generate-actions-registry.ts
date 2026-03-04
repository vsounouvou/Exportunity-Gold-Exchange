import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ACTIONS_REGISTRY, type ActionRegistryEntry } from "../server/lib/actions/actionRegistry";

type UsageHit = { file: string; count: number };

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCAN_DIRS = [
  "server/routes",
  "server/lib",
  "server/scripts",
  "client/src",
];
const SCAN_EXT = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs", ".json"]);

type RegistryOutput = {
  generatedAt: string;
  source: string;
  totalActions: number;
  permissionMatrix: Record<string, Record<string, boolean>>;
  items: Array<ActionRegistryEntry & { discoveredUsage: UsageHit[]; usageCount: number }>;
};

async function walkFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  const stack = [dir];

  while (stack.length) {
    const current = stack.pop()!;
    let entries: Awaited<ReturnType<typeof fs.readdir>>;
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
      const ext = path.extname(entry.name).toLowerCase();
      if (SCAN_EXT.has(ext)) out.push(full);
    }
  }

  return out;
}

function makePermissionMatrix(entries: ActionRegistryEntry[]) {
  const roles = ["super_admin", "chairman", "admin", "operator", "viewer"];
  const matrix: Record<string, Record<string, boolean>> = {};

  for (const role of roles) {
    matrix[role] = {};
  }

  for (const entry of entries) {
    const key = entry.actionKey;
    matrix.super_admin[key] = true;
    matrix.chairman[key] = true;

    const isCritical = entry.riskLevel === "CRITICAL";
    const isHigh = entry.riskLevel === "HIGH";
    const isSystem = entry.category === "SYSTEM";
    const isApproval = entry.category === "APPROVAL";
    const isDelete = entry.category === "DELETION";

    matrix.admin[key] = !isCritical;
    matrix.operator[key] = !(isCritical || isHigh || isSystem || isApproval || isDelete);
    matrix.viewer[key] = entry.category === "NAVIGATION" || key === "SYSTEM_HEALTH_CHECK";
  }

  return matrix;
}

function countActionInFile(content: string, actionKey: string): number {
  const escaped = actionKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`\\b${escaped}\\b`, "g");
  return (content.match(regex) || []).length;
}

async function buildUsage(entries: ActionRegistryEntry[]) {
  const files = (
    await Promise.all(SCAN_DIRS.map((dir) => walkFiles(path.join(ROOT, dir))))
  ).flat();
  const usage = new Map<string, UsageHit[]>();

  for (const entry of entries) {
    usage.set(entry.actionKey, []);
  }

  for (const file of files) {
    let content = "";
    try {
      content = await fs.readFile(file, "utf8");
    } catch {
      continue;
    }
    if (!content) continue;

    for (const entry of entries) {
      const count = countActionInFile(content, entry.actionKey);
      if (!count) continue;
      const rel = path.relative(ROOT, file).replaceAll("\\", "/");
      const list = usage.get(entry.actionKey)!;
      list.push({ file: rel, count });
    }
  }

  for (const [key, list] of usage.entries()) {
    usage.set(
      key,
      list
        .sort((a, b) => b.count - a.count || a.file.localeCompare(b.file))
        .slice(0, 12),
    );
  }

  return usage;
}

async function main() {
  const usage = await buildUsage(ACTIONS_REGISTRY);
  const permissionMatrix = makePermissionMatrix(ACTIONS_REGISTRY);

  const items = ACTIONS_REGISTRY.map((entry) => {
    const discoveredUsage = usage.get(entry.actionKey) || [];
    const usageCount = discoveredUsage.reduce((acc, hit) => acc + hit.count, 0);
    return { ...entry, discoveredUsage, usageCount };
  });

  const payload: RegistryOutput = {
    generatedAt: new Date().toISOString(),
    source: "scripts/generate-actions-registry.ts",
    totalActions: items.length,
    permissionMatrix,
    items,
  };

  const outputPath = path.join(ROOT, "actions_registry.json");
  await fs.writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

  const withUsage = items.filter((item) => item.usageCount > 0).length;
  // eslint-disable-next-line no-console
  console.log(`[actions-registry] wrote ${outputPath}`);
  // eslint-disable-next-line no-console
  console.log(`[actions-registry] actions=${items.length} withUsage=${withUsage}`);
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("[actions-registry] generation failed:", error);
  process.exitCode = 1;
});
