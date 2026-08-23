export const LEGACY_ACTION_WORKER_BARRIER_RUN_AT =
  "2100-01-01T00:00:00.000Z";

function normalizeTenantKey(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function safeMetadata(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

export function isolateActionForDeploymentTenant(input: {
  tenantId: number;
  tenantKey: string | null;
  deployTenantKey?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  const metadata = safeMetadata(input.metadata);
  const tenantKey = normalizeTenantKey(input.tenantKey);
  const deployTenantKey = normalizeTenantKey(input.deployTenantKey);
  if (!tenantKey || tenantKey !== deployTenantKey) return metadata;

  const currentRunAt = String(metadata.runAt || "").trim();
  const currentTenantRunAt = String(metadata.tenantRunAt || "").trim();
  const tenantRunAt =
    currentRunAt && currentRunAt !== LEGACY_ACTION_WORKER_BARRIER_RUN_AT
      ? currentRunAt
      : currentTenantRunAt;

  return {
    ...metadata,
    workerScope: "tenant",
    workerTenantId: input.tenantId,
    workerTenantKey: tenantKey,
    ...(tenantRunAt ? { tenantRunAt } : {}),
    runAt: LEGACY_ACTION_WORKER_BARRIER_RUN_AT,
    legacyWorkerBarrier: true,
  };
}
