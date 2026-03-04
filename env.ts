import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

function parseEnvLine(line: string): { key: string; value: string } | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;

  const withoutExport = trimmed.startsWith("export ")
    ? trimmed.slice("export ".length).trim()
    : trimmed;

  const equalsIndex = withoutExport.indexOf("=");
  if (equalsIndex <= 0) return null;

  const key = withoutExport.slice(0, equalsIndex).trim();
  if (!key) return null;

  let value = withoutExport.slice(equalsIndex + 1).trim();
  const quote = value[0];
  if (
    (quote === `"` || quote === `'`) &&
    value.length >= 2 &&
    value[value.length - 1] === quote
  ) {
    value = value.slice(1, -1);
  }

  return { key, value };
}

function applyEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) return;

  const contents = fs.readFileSync(filePath, "utf8");
  for (const line of contents.split(/\r?\n/)) {
    const parsed = parseEnvLine(line);
    if (!parsed) continue;
    if (process.env[parsed.key] !== undefined) continue;
    process.env[parsed.key] = parsed.value;
  }
}

export function loadLocalEnv() {
  const cwdEnv = path.resolve(process.cwd(), ".env");
  const cwdEnvLocal = path.resolve(process.cwd(), ".env.local");

  // When running `node dist/index.js`, `process.cwd()` should be the repo root,
  // but keep a fallback for cases where it isn't.
  const here = path.dirname(fileURLToPath(import.meta.url));
  const hereEnv = path.resolve(here, ".env");
  const hereEnvLocal = path.resolve(here, ".env.local");
  const parentEnv = path.resolve(here, "..", ".env");
  const parentEnvLocal = path.resolve(here, "..", ".env.local");

  applyEnvFile(cwdEnv);
  applyEnvFile(cwdEnvLocal);
  applyEnvFile(hereEnv);
  applyEnvFile(hereEnvLocal);
  applyEnvFile(parentEnv);
  applyEnvFile(parentEnvLocal);
}

// Auto-load for any server-side entrypoint that imports this module.
loadLocalEnv();

