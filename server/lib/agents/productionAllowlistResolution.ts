import { normalizeAgentKey } from "../mail/agentSlugs";

type ProductionAgentCandidate = {
  id: number;
  name?: string | null;
  displayName?: string | null;
  metadata?: unknown;
};

type EnabledProductionAgent = {
  agentId?: number | null;
  agentKey?: string | null;
};

function normalizeKey(value: string) {
  const raw = String(value || "").trim();
  return raw ? normalizeAgentKey(raw) : "";
}

function readOrganizationKey(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return "";
  const record = metadata as Record<string, unknown>;
  return normalizeKey(String(record.organizationKey || record.agentKey || ""));
}

/**
 * Production approval is keyed by a stable agent identity as well as the current
 * database id. Agent ids may change when a tenant organization is repaired or
 * migrated; an enabled stable key must continue to resolve to that agent.
 */
export function resolveAllowedProductionAgentIds(input: {
  requestedIds: number[];
  candidates: ProductionAgentCandidate[];
  enabledRows: EnabledProductionAgent[];
}) {
  const requestedIds = Array.from(new Set(input.requestedIds))
    .map((id) => Number(id))
    .filter((id) => Number.isInteger(id) && id > 0);
  const requestedSet = new Set(requestedIds);
  const enabledIds = new Set(
    input.enabledRows
      .map((row) => Number(row.agentId))
      .filter((id) => Number.isInteger(id) && id > 0),
  );
  const enabledKeys = new Set(
    input.enabledRows
      .map((row) => normalizeKey(String(row.agentKey || "")))
      .filter(Boolean),
  );
  const candidatesById = new Map(
    input.candidates
      .filter((candidate) => requestedSet.has(Number(candidate.id)))
      .map((candidate) => [Number(candidate.id), candidate] as const),
  );

  return requestedIds.filter((id) => {
    if (enabledIds.has(id)) return true;
    const candidate = candidatesById.get(id);
    if (!candidate) return false;
    const stableKeys = [
      readOrganizationKey(candidate.metadata),
      normalizeKey(String(candidate.displayName || "")),
      normalizeKey(String(candidate.name || "")),
    ].filter(Boolean);
    return stableKeys.some((key) => enabledKeys.has(key));
  });
}
