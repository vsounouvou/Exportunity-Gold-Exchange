/**
 * P0 containment for legacy messaging automations.
 *
 * Exportunity Industrial records inbound communication for review. It does not
 * use the legacy retail/gold reply paths, and automated replies are opt-in for
 * every other tenant as well.
 */
function normalizeTenantKey(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function isExplicitlyEnabled(value: unknown) {
  return String(value ?? "").trim().toLowerCase() === "true";
}

export function canSendLegacyInboundAutoReply(input: { tenantKey?: string | null; enabled?: unknown }) {
  if (normalizeTenantKey(input.tenantKey) === "exportunity") return false;
  return isExplicitlyEnabled(input.enabled);
}

export function canRunLegacyWhatsAppAutomation(input: { tenantKey?: string | null; enabled?: unknown }) {
  if (normalizeTenantKey(input.tenantKey) === "exportunity") return false;
  return isExplicitlyEnabled(input.enabled);
}
