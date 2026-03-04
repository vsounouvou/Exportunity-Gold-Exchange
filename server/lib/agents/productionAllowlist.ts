import { db } from "@db";
import { agentsProduction } from "@db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { normalizeAgentKey } from "../mail/agentSlugs";

function truthyEnv(value: unknown) {
  return ["1", "true", "yes", "y", "on"].includes(String(value || "").trim().toLowerCase());
}

const CACHE_TTL_MS = 60_000;
const enabledCountCache = new Map<number, { atMs: number; value: number }>();
const warnedTenants = new Set<number>();

export class ProductionAgentPolicyError extends Error {
  status: number;
  code: string;

  constructor(message: string) {
    super(message);
    this.name = "ProductionAgentPolicyError";
    this.status = 403;
    this.code = "agent_not_production_approved";
  }
}

async function getEnabledCount(tenantId: number) {
  const cached = enabledCountCache.get(tenantId);
  if (cached && Date.now() - cached.atMs < CACHE_TTL_MS) return cached.value;

  const rows = await db
    .select({ count: sql<number>`count(*)` })
    .from(agentsProduction)
    .where(and(eq(agentsProduction.tenantId, tenantId), eq(agentsProduction.isEnabled, true)));

  const count = Number(rows[0]?.count || 0);
  enabledCountCache.set(tenantId, { atMs: Date.now(), value: count });
  return count;
}

type EnforceMode = "off" | "auto" | "strict";

function getEnforceMode(): EnforceMode {
  if (truthyEnv(process.env.AGENTS_PRODUCTION_ENFORCE)) return "strict";
  if (process.env.NODE_ENV === "production") return "auto";
  return "off";
}

export async function isAgentsProductionAllowlistActive(tenantId: number) {
  if (!Number.isFinite(tenantId) || tenantId <= 0) return false;
  return (await getEnabledCount(tenantId)) > 0;
}

function normalizeKey(value: string) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return normalizeAgentKey(raw);
}

export async function assertProductionAgentKeyAllowed(opts: { tenantId: number; agentKey: string; context: string }) {
  const tenantId = Number(opts.tenantId);
  const agentKey = normalizeKey(opts.agentKey);
  if (!tenantId || !agentKey) return;

  const active = (await getEnabledCount(tenantId)) > 0;
  const mode = getEnforceMode();
  if (mode === "off") return;
  if (!active && mode === "auto") {
    if (!warnedTenants.has(tenantId)) {
      warnedTenants.add(tenantId);
      console.warn(
        `[agents_production] Allowlist is empty for tenant=${tenantId}; skipping enforcement (context=${opts.context}).`,
      );
    }
    return;
  }
  if (!active && mode === "strict") {
    throw new ProductionAgentPolicyError(
      `Production agents allowlist is required but empty (tenant=${tenantId}, context=${opts.context}).`,
    );
  }

  const allowed = await db.query.agentsProduction.findFirst({
    where: and(eq(agentsProduction.tenantId, tenantId), eq(agentsProduction.agentKey, agentKey), eq(agentsProduction.isEnabled, true)),
    columns: { id: true },
  });
  if (!allowed) {
    throw new ProductionAgentPolicyError(
      `Agent '${agentKey}' is not approved for production activity (tenant=${tenantId}, context=${opts.context}).`,
    );
  }
}

export async function assertProductionAgentIdAllowed(opts: { tenantId: number; agentId: number; context: string }) {
  const tenantId = Number(opts.tenantId);
  const agentId = Number(opts.agentId);
  if (!tenantId || !agentId) return;

  const active = (await getEnabledCount(tenantId)) > 0;
  const mode = getEnforceMode();
  if (mode === "off") return;
  if (!active && mode === "auto") {
    if (!warnedTenants.has(tenantId)) {
      warnedTenants.add(tenantId);
      console.warn(
        `[agents_production] Allowlist is empty for tenant=${tenantId}; skipping enforcement (context=${opts.context}).`,
      );
    }
    return;
  }
  if (!active && mode === "strict") {
    throw new ProductionAgentPolicyError(
      `Production agents allowlist is required but empty (tenant=${tenantId}, context=${opts.context}).`,
    );
  }

  const allowed = await db.query.agentsProduction.findFirst({
    where: and(eq(agentsProduction.tenantId, tenantId), eq(agentsProduction.agentId, agentId), eq(agentsProduction.isEnabled, true)),
    columns: { id: true },
  });
  if (!allowed) {
    throw new ProductionAgentPolicyError(
      `Agent id=${agentId} is not approved for production activity (tenant=${tenantId}, context=${opts.context}).`,
    );
  }
}

export async function filterProductionAgentIds(opts: { tenantId: number; agentIds: number[]; context: string }) {
  const tenantId = Number(opts.tenantId);
  if (!tenantId || !Array.isArray(opts.agentIds) || opts.agentIds.length === 0) return [];

  const active = (await getEnabledCount(tenantId)) > 0;
  const mode = getEnforceMode();
  if (mode === "off") return Array.from(new Set(opts.agentIds)).filter((id) => Number.isInteger(id) && id > 0);
  if (!active && mode === "auto") {
    if (!warnedTenants.has(tenantId)) {
      warnedTenants.add(tenantId);
      console.warn(
        `[agents_production] Allowlist is empty for tenant=${tenantId}; skipping enforcement (context=${opts.context}).`,
      );
    }
    return Array.from(new Set(opts.agentIds)).filter((id) => Number.isInteger(id) && id > 0);
  }
  if (!active && mode === "strict") {
    throw new ProductionAgentPolicyError(
      `Production agents allowlist is required but empty (tenant=${tenantId}, context=${opts.context}).`,
    );
  }

  const ids = Array.from(new Set(opts.agentIds))
    .map((id) => Number(id))
    .filter((id) => Number.isInteger(id) && id > 0);
  if (!ids.length) return [];

  const rows = await db
    .select({ agentId: agentsProduction.agentId })
    .from(agentsProduction)
    .where(and(eq(agentsProduction.tenantId, tenantId), eq(agentsProduction.isEnabled, true), inArray(agentsProduction.agentId, ids)));

  const allowed = new Set(rows.map((r) => Number(r.agentId)).filter((id) => Number.isInteger(id) && id > 0));
  return ids.filter((id) => allowed.has(id));
}
