import crypto from "crypto";

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (!value || typeof value !== "object") return value;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
  return Object.fromEntries(entries.map(([k, v]) => [k, sortKeys(v)]));
}

export function sha256Json(value: unknown): string {
  const normalized = sortKeys(value);
  const raw = JSON.stringify(normalized);
  return crypto.createHash("sha256").update(raw).digest("hex");
}

