import { resolveApiUrl } from "./runtimeConfig";

function normalizeKey(value: string) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");
}

export function deriveAgentAvatarKey(input: {
  agentKey?: string | null;
  id?: number | string | null;
  name?: string | null;
}) {
  const explicit = normalizeKey(String(input.agentKey || ""));
  if (explicit) return explicit;
  const name = normalizeKey(String(input.name || ""));
  const id = input.id == null ? "" : normalizeKey(String(input.id));
  const composite = normalizeKey([name, id].filter(Boolean).join("-"));
  return composite || "agent";
}

export function getAgentAvatarUrl(input: {
  agentKey?: string | null;
  id?: number | string | null;
  name?: string | null;
  size?: number;
  label?: string | null;
}) {
  const key = deriveAgentAvatarKey(input);
  const sizeRaw = Number(input.size ?? 96);
  const size = Number.isFinite(sizeRaw) ? Math.max(64, Math.min(512, Math.trunc(sizeRaw))) : 96;
  const label = typeof input.label === "string" && input.label.trim() ? input.label.trim() : null;
  const base = `/api/public/agent-avatar/${encodeURIComponent(key)}.svg?size=${size}`;
  const url = label ? `${base}&label=${encodeURIComponent(label)}` : base;
  return resolveApiUrl(url);
}

